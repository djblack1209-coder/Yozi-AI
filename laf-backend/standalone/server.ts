/**
 * Yozi AI 独立 Express 服务器
 *
 * 将 Laf 云函数映射为 HTTP 路由:
 *   POST /函数名 → 执行对应云函数
 *
 * 兼容层: cloud-shim.ts 提供 @lafjs/cloud 的 API 仿真
 */

import express from 'express';
import cors from 'cors';
import { compileTrustedProxies, resolveClientIp } from './client-ip.js';
import { clientIpUnavailable } from '../functions/_shared/client-ip.js';
import multer from 'multer';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { closeDb, getDb, runWithResponse } from './cloud-shim.js';
import { createSecurityAudit } from './security-audit.js';
import { DEV_TEST } from '../functions/_shared/build-channel.js';

Object.defineProperty(globalThis, '__YOZI_DEV_TEST__', { value: DEV_TEST });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const FUNCTIONS_DIR = path.resolve(__dirname, '../functions');
const STORAGE_DIR = process.env.STORAGE_DIR || '/app/storage';

const app = express();
const securityAudit = createSecurityAudit(getDb);

// Compile once before listening; reject invalid or hop-count configuration at startup.
app.set('trust proxy', compileTrustedProxies());

// ==================== 中间件 ====================

// CORS 安全配置
// 生产必须显式授权浏览器来源，不继承退休站点或开发来源。
if (process.env.NODE_ENV === 'production' && !process.env.ALLOWED_ORIGINS?.trim()) {
  throw new Error('ALLOWED_ORIGINS is required in production');
}
const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://localhost:3000'];

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
  : DEFAULT_ORIGINS;

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    maxAge: 86400 // 预检缓存24小时
  })
);

// 基本安全头（防御纵深：即使 Nginx 层缺失也有保底）
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// 请求超时保护（120秒）
app.use((req, _res, next) => {
  req.setTimeout(120000);
  next();
});

// 静态文件服务 (用于 cloud.storage 上传的文件)
app.use('/storage', express.static(STORAGE_DIR));

// 文件上传 (multer)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 20, parts: 21, fieldSize: 1024 * 1024 }
});

// ==================== 请求日志 ====================

app.use((req, _res, next) => {
  const start = Date.now();
  _res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path !== '/health' && req.path !== '/health-check') {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${_res.statusCode} ${duration}ms`);
    }
  });
  next();
});

// ==================== 云函数加载器 ====================

interface FunctionModule {
  default: (ctx: any) => Promise<any>;
}

const functionCache = new Map<string, FunctionModule>();

async function loadFunction(name: string): Promise<FunctionModule | null> {
  if (functionCache.has(name)) return functionCache.get(name)!;

  // 编译后的 JS 文件路径
  const jsPath = path.join(FUNCTIONS_DIR, `${name}.js`);

  if (!fs.existsSync(jsPath)) {
    return null;
  }

  try {
    const mod = await import(jsPath);
    functionCache.set(name, mod);
    return mod;
  } catch (err) {
    console.error(`[load-function] Failed to load ${name}:`, err);
    return null;
  }
}

// ==================== 路由注册 ====================

// 健康检查 (优先级最高，不走云函数)
// 注：仅返回基础状态。详细诊断请使用 health-check 云函数（需 admin 鉴权）
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// YAML 元数据读取 — 获取允许的 HTTP 方法
function getAllowedMethods(funcName: string): string[] {
  const yamlPath = path.join(FUNCTIONS_DIR, `${funcName}.yaml`);
  if (fs.existsSync(yamlPath)) {
    try {
      const content = fs.readFileSync(yamlPath, 'utf-8');
      const methodsMatch = content.match(/methods:\s*\n([\s\S]*?)(?:\n\w|$)/);
      if (methodsMatch) {
        const methods: string[] = [];
        const lines = methodsMatch[1].split('\n');
        for (const line of lines) {
          const m = line.match(/^\s*-\s*(\w+)/);
          if (m) methods.push(m[1].toUpperCase());
        }
        return methods.length ? methods : ['GET', 'POST'];
      }
    } catch {}
  }
  return ['GET', 'POST']; // 默认支持 GET 和 POST
}

// 动态注册所有云函数路由
// ⚠️ 安全：admin/cron-only 函数不对外暴露路由（即使函数内有 admin 鉴权，减少攻击面）
const INTERNAL_ONLY_FUNCTIONS = new Set([
  'db-create-indexes',
  'db-migrate-timestamps',
  'data-cleanup',
  'account-purge',
  'material-manager' // 标记为 "NOT connected to frontend"，不应暴露
]);

async function registerFunctions() {
  const files = fs
    .readdirSync(FUNCTIONS_DIR)
    .filter((f) => f.endsWith('.js') && !f.startsWith('_') && f !== 'index.js');

  for (const file of files) {
    const funcName = file.replace('.js', '');

    // 跳过内部管理函数（不注册为 HTTP 路由）
    if (INTERNAL_ONLY_FUNCTIONS.has(funcName)) {
      console.log(`  [skip] ${funcName} (internal-only, not exposed)`);
      continue;
    }

    const methods = getAllowedMethods(funcName);

    // 注册路由: /:funcName
    const handler = async (req: express.Request, res: express.Response) => {
      const clientIp = resolveClientIp(req);
      if (!clientIp) return res.status(503).json(clientIpUnavailable());
      const mod = await loadFunction(funcName);
      if (!mod || !mod.default) {
        return res.status(404).json({ code: 404, message: `Function ${funcName} not found` });
      }

      // 构建 Laf 兼容的 ctx 对象
      const ctx: any = {
        body: req.body || {},
        headers: req.headers as Record<string, string>,
        method: req.method,
        query: req.query as Record<string, string>,
        params: req.params,
        socket: { remoteAddress: clientIp },
        request: { body: req.body },
        files: null as any
      };

      // 处理文件上传
      if (req.files || (req as any).file) {
        ctx.files = {};
        if (req.files && !Array.isArray(req.files)) {
          for (const [fieldName, files] of Object.entries(req.files)) {
            const f = Array.isArray(files) ? files[0] : files;
            ctx.files[fieldName] = {
              data: f.buffer,
              buffer: f.buffer,
              mimetype: f.mimetype,
              type: f.mimetype,
              originalFilename: f.originalname,
              filename: f.originalname,
              name: f.originalname,
              size: f.size
            };
          }
        } else if ((req as any).file) {
          const f = (req as any).file;
          ctx.files = {
            file: {
              data: f.buffer,
              buffer: f.buffer,
              mimetype: f.mimetype,
              type: f.mimetype,
              originalFilename: f.originalname,
              filename: f.originalname,
              name: f.originalname,
              size: f.size
            }
          };
        }
      }

      // 设置 cloud.res 供 SSE 使用 (proxy-ai-stream)
      // 使用 AsyncLocalStorage 隔离并发请求，避免 SSE 数据发送到错误客户端
      try {
        const result = await runWithResponse(res, () => mod.default(ctx));
        securityAudit.record(funcName, res.statusCode, result?.code);

        // 如果函数已经通过 cloud.res 发送了响应 (SSE), 不再发送
        if (res.headersSent) return;

        // 正常 JSON 响应
        if (result !== undefined && result !== null) {
          res.json(result);
        } else {
          res.status(204).end();
        }
      } catch (err: any) {
        if (res.headersSent) return;
        console.error(`[function-error] ${funcName}:`, err.message);
        // 不向客户端暴露内部错误细节（可能含文件路径、连接字符串等）
        res.status(500).json({
          code: 500,
          success: false,
          message: 'Internal Server Error'
        });
      }
    };

    // 需要大体积 JSON 的端点（头像上传、文档转换、OCR 等包含 base64 数据）
    // 根据 YAML 元数据注册方法
    for (const method of methods) {
      switch (method) {
        case 'GET':
          app.get(`/${funcName}`, handler);
          break;
        case 'POST':
          app.post(`/${funcName}`, upload.any(), handler);
          break;
        case 'PUT':
          app.put(`/${funcName}`, handler);
          break;
        case 'DELETE':
          app.delete(`/${funcName}`, handler);
          break;
      }
    }

    console.log(`[route] ${methods.join('|')} /${funcName}`);
  }
}

// ==================== 启动 ====================

async function main() {
  console.log('='.repeat(50));
  console.log('Yozi AI Standalone Server');
  console.log('='.repeat(50));

  // ==================== 进程级异常防护 ====================
  // 防止未捕获的异常导致进程崩溃 → PM2 频繁重启

  // 未处理的 Promise 拒绝：记录日志但不崩溃
  // Node 20+ 默认行为是 warning，但某些环境（--unhandled-rejections=throw）会崩溃
  process.on('unhandledRejection', (reason, promise) => {
    console.error(`[unhandledRejection] ${reason instanceof Error ? reason.stack : reason}`);
    // 不调用 process.exit() — 让进程继续运行
  });

  // 未捕获的同步异常：记录后优雅退出（让 PM2 重启）
  // 此类异常说明代码有严重 bug，继续运行可能导致数据不一致
  process.on('uncaughtException', (err) => {
    console.error(`[uncaughtException] ${err.stack || err.message}`);
    // 给进程 3 秒时间写入日志，然后退出让 PM2 重启
    setTimeout(() => process.exit(1), 3000);
  });

  // 注册云函数路由
  await registerFunctions();

  // 404 必须在所有路由注册之后
  app.use((_req, res) => {
    res.status(404).json({ code: 404, message: 'Not Found' });
  });

  // ==================== 全局错误处理中间件 ====================
  // Express 要求错误处理中间件有 4 个参数 (err, req, res, next)
  // 捕获所有路由/中间件中未处理的同步异常，防止进程崩溃
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof multer.MulterError || err.type === 'entity.too.large') {
      return res.status(413).json({ code: 413, success: false, message: 'Request exceeds resource limits' });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ code: 400, success: false, message: 'Invalid JSON body' });
    }
    console.error(`[express-error] ${err.stack || err.message || err}`);
    if (!res.headersSent) {
      res.status(500).json({
        code: 500,
        success: false,
        message: 'Internal Server Error'
      });
    }
  });

  const server = http.createServer(app);

  // 优雅关闭
  const shutdown = async (signal: string) => {
    console.log(`\n[shutdown] Received ${signal}, graceful shutdown...`);
    server.close(async () => {
      await securityAudit.flush();
      await closeDb();
      console.log('[shutdown] Server closed');
      process.exit(0);
    });
    // 强制关闭超时
    setTimeout(() => {
      console.error('[shutdown] Forced exit after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  server.listen(PORT, HOST, () => {
    const address = server.address();
    const listeningPort = typeof address === 'object' && address ? address.port : PORT;
    console.log(`\n[server] Listening on http://${HOST}:${listeningPort}`);
    console.log(`[server] Health check: http://${HOST}:${PORT}/health`);
  });
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
