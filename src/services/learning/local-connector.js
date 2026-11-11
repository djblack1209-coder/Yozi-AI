import { assert } from './learning-domain.js';
import { createUtf8StreamDecoder } from '../../../laf-backend/functions/_shared/learning-stream-codec.js';
import { appConnectorSupported, requestAppConnector } from './app-connector.js';
import { captureSession, assertSession } from '../auth-storage.js';

export const WEIXIN_CONNECTOR_ORIGIN = 'https://wenli-weixin.invalid';

export function weixinConnectorSupported() {
  if (typeof wx === 'undefined' || typeof wx.request !== 'function') return false;
  try {
    const base = wx.getAppBaseInfo?.() || wx.getSystemInfoSync?.() || {};
    const device = wx.getDeviceInfo?.() || base;
    const version = String(base.SDKVersion || '')
      .split('.')
      .map(Number);
    const modern =
      version.length === 3 &&
      version.every(Number.isInteger) &&
      (version[0] > 3 || (version[0] === 3 && (version[1] > 2 || (version[1] === 2 && version[2] >= 2))));
    return (
      modern &&
      ['ios', 'android', 'devtools'].includes(device.platform) &&
      wx.canIUse?.('request.enableChunked') === true
    );
  } catch {
    return false;
  }
}

export function learningClientPlatform() {
  let platform = 'unsupported';
  // #ifdef H5
  platform = 'h5';
  // #endif
  // #ifdef MP-WEIXIN
  if (typeof wx !== 'undefined' && typeof wx.request === 'function') platform = 'weixin';
  // #endif
  // #ifdef APP-PLUS
  if (typeof plus !== 'undefined' && ['Android', 'iOS'].includes(plus.os?.name)) platform = 'app';
  // #endif
  return platform;
}

export function assertConnectorPlatform(platform) {
  assert(
    ['h5', 'weixin', 'app'].includes(platform),
    'PLATFORM_UNSUPPORTED',
    '当前端尚无受保护的连接器传输，可先使用本地记录和粘贴资料'
  );
  if (platform === 'app')
    assert(appConnectorSupported(), 'PLATFORM_UNSUPPORTED', '此App未装配符合保护合同的原生连接器，未发送请求');
  if (platform === 'weixin')
    assert(
      weixinConnectorSupported(),
      'PLATFORM_UNSUPPORTED',
      '微信连接器需基础库3.2.2以上及手机/开发者工具的重定向拦截与分块能力；未发送请求'
    );
}

// 复用已有连接器合同，微信直接用原生RequestTask，不假定uni包装具备分块/重定向能力。
export async function requestConnector(
  connection,
  url,
  {
    platform,
    signal,
    assertCurrent,
    session = captureSession(),
    method = 'POST',
    body,
    timeout = 30000,
    limit = 100000
  } = {}
) {
  const checkCurrent = () => {
    assertCurrent?.();
    assertSession(session);
    assert(!signal?.aborted, 'CANCELLED', '连接请求已取消');
  };
  checkCurrent();
  assertConnectorPlatform(platform);
  validateLocalConnector(url.href, connection.allowedOrigins, connection.consent);
  assert(connection.token?.length >= 32, 'AUTH_REQUIRED', '连接器需要至少32字符访问令牌');
  assert(
    ['/chat', '/health', '/parse', '/delete'].includes(url.pathname),
    'ENDPOINT_INVALID',
    '连接器操作入口不受支持'
  );
  assert(!signal?.aborted, 'CANCELLED', '连接请求已取消');
  const headers = {
    Authorization: `Bearer ${connection.token}`,
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
  };
  if (platform === 'weixin' || platform === 'app') {
    checkCurrent();
    const result = await (platform === 'weixin'
      ? requestWeixinConnector(url.href, { signal, method, body, timeout, limit, headers })
      : requestAppConnector(connection, url.href, { signal, method, body, timeout, limit, session }));
    checkCurrent();
    return result;
  }
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  const timer = setTimeout(() => {
    timedOut = true;
    abort();
  }, timeout);
  signal?.addEventListener('abort', abort, { once: true });
  try {
    checkCurrent();
    const response = await fetch(url.href, {
      method,
      headers,
      ...(body !== undefined ? { body } : {}),
      signal: controller.signal,
      redirect: 'error'
    });
    const result = await readConnectorResponse(response, limit);
    checkCurrent();
    assert(!signal?.aborted, 'CANCELLED', '连接请求已取消');
    assert(!timedOut, 'TIMEOUT', '连接请求超时，未确认完成');
    return { ok: response.ok, body: result };
  } catch (error) {
    assert(!signal?.aborted, 'CANCELLED', '连接请求已取消');
    assert(!timedOut, 'TIMEOUT', '连接请求超时，未确认完成');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
function requestWeixinConnector(url, { signal, method, body, timeout, limit, headers }) {
  return new Promise((resolve, reject) => {
    let task,
      ended = false,
      chunks = 0,
      raw = '';
    const decoder = createUtf8StreamDecoder(limit);
    const finish = (value, error) => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      if (error) {
        try {
          task?.abort();
        } catch {
          // 即使原生取消失败，也不能把无效响应变成成功或再发请求。
        }
        reject(error);
      } else resolve(value);
    };
    const failure = (code, message) => {
      try {
        assert(false, code, message);
      } catch (error) {
        finish(null, error);
      }
    };
    const cancel = () => failure('CANCELLED', '连接请求已取消');
    const timer = setTimeout(() => failure('TIMEOUT', '连接请求超时，未确认完成'), timeout);
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      assert(!signal?.aborted, 'CANCELLED', '连接请求已取消');
      task = wx.request({
        url,
        method,
        data: body,
        header: { ...headers, Origin: WEIXIN_CONNECTOR_ORIGIN },
        timeout,
        redirect: 'manual',
        enableChunked: true,
        responseType: 'arraybuffer',
        dataType: 'text',
        success(response) {
          if (ended) return;
          try {
            assert(!signal?.aborted, 'CANCELLED', '连接请求已取消');
            assert(
              Number.isInteger(response.statusCode) && response.statusCode >= 100 && response.statusCode < 600,
              'INVALID_RESPONSE',
              '连接器状态码不合法'
            );
            assert(
              response.statusCode < 300 || response.statusCode >= 400,
              'REDIRECT_FORBIDDEN',
              '连接器重定向被拒绝，未转发令牌或资料'
            );
            if (!chunks) raw = decoder.feed(response.data);
            decoder.end();
            const result = JSON.parse(raw);
            finish({ ok: response.statusCode >= 200 && response.statusCode < 300, body: result });
          } catch (error) {
            finish(null, error);
          }
        },
        fail() {
          if (!ended)
            failure(
              signal?.aborted ? 'CANCELLED' : 'CONNECTION_FAILED',
              '连接失败或已取消，未确认完成；不会自动重试或回退云端'
            );
        }
      });
      if (ended) {
        task?.abort();
        return;
      }
      assert(
        typeof task?.onChunkReceived === 'function' && typeof task.onHeadersReceived === 'function',
        'PLATFORM_UNSUPPORTED',
        '微信连接器缺少分块或响应头接口，已中止请求'
      );
      task.onHeadersReceived(({ header, statusCode }) => {
        if (ended) return;
        try {
          const fields = Object.fromEntries(Object.entries(header || {}).map(([k, v]) => [k.toLowerCase(), v]));
          assert(
            !fields.location && !(statusCode >= 300 && statusCode < 400),
            'REDIRECT_FORBIDDEN',
            '连接器重定向被拒绝，未转发令牌或资料'
          );
          if (fields['content-length'] !== undefined)
            assert(
              /^\d+$/.test(String(fields['content-length'])) && Number(fields['content-length']) <= limit,
              'RESPONSE_LIMIT',
              '连接器声明输出超过限制'
            );
        } catch (error) {
          finish(null, error);
        }
      });
      task.onChunkReceived(({ data }) => {
        if (ended) return;
        try {
          assert(++chunks <= 4096, 'RESPONSE_LIMIT', '连接器响应分块过多');
          raw += decoder.feed(data);
        } catch (error) {
          finish(null, error);
        }
      });
    } catch (error) {
      finish(null, error);
    }
  });
}

export async function readConnectorResponse(response, limit = 100000) {
  if (!response.body?.getReader) {
    const text = await response.text();
    assert(text.length <= limit, 'RESPONSE_LIMIT', '本地输出过长');
    return JSON.parse(text);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let raw = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        assert(false, 'RESPONSE_LIMIT', '本地输出过长');
      }
      raw += decoder.decode(value, { stream: true });
    }
    return JSON.parse(raw + decoder.decode());
  } finally {
    reader.releaseLock();
  }
}

export async function testLocalConnector(
  connection,
  { platform, signal, assertCurrent, session = captureSession() } = {}
) {
  assertConnectorPlatform(platform);
  const url = validateLocalConnector(connection.endpoint, connection.allowedOrigins, connection.consent);
  assert(
    typeof connection.token === 'string' && connection.token.length >= 32,
    'AUTH_REQUIRED',
    '本地连接器需要访问令牌'
  );
  assert(url.pathname === '/chat', 'ENDPOINT_INVALID', '连接器入口应为 /chat');
  url.pathname = '/health';
  const { ok, body: result } = await requestConnector(connection, url, {
    platform,
    signal,
    assertCurrent,
    session,
    method: 'GET',
    timeout: 5000
  });
  assert(
    ok && result.success && result.data?.capabilities?.text === true && result.data.models?.includes(connection.model),
    'CONNECTION_FAILED',
    '连接器鉴权失败或模型不在授权清单'
  );
  return result.data;
}

export function validateLocalConnector(raw, allowedOrigins, consent) {
  assert(consent === true, 'CONSENT_REQUIRED', '连接本机服务需要明确授权');
  let url;
  try {
    url = new URL(raw);
  } catch {
    assert(false, 'ENDPOINT_INVALID', '本地连接地址不合法');
  }
  assert(
    ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !url.search &&
      Array.isArray(allowedOrigins) &&
      allowedOrigins.length <= 16 &&
      allowedOrigins.includes(url.origin),
    'ENDPOINT_FORBIDDEN',
    '本地连接目标不在授权清单'
  );
  return url;
}
export async function callLocalConnector(connection, input, options = {}) {
  const session = options.session === undefined ? captureSession() : options.session;
  assertConnectorPlatform(options.platform);
  const url = validateLocalConnector(connection.endpoint, connection.allowedOrigins, connection.consent);
  assert(url.pathname === '/chat', 'ENDPOINT_INVALID', '连接器入口应为 /chat');
  assert(
    typeof connection.token === 'string' && connection.token.length >= 32,
    'AUTH_REQUIRED',
    '本地连接器需要访问令牌'
  );
  assert(JSON.stringify(input).length <= 24000, 'CONTEXT_LIMIT', '本地任务上下文过长');
  // Store复用云请求背景；本地文本合同不接收云绑定或账户标识。
  const context = input.learningContext || {};
  const payload = {
    requestId: input.requestId,
    modelId: connection.model,
    shareConsent: input.shareConsent,
    messages: input.messages,
    learningContext: {
      goal: context.goal,
      strategy: context.strategy,
      profile: context.profile,
      memory: context.memory,
      question: context.question,
      attempt: context.attempt,
      summary: context.summary
    }
  };
  const { ok, body: result } = await requestConnector(connection, url, {
    platform: options.platform,
    signal: options.signal,
    assertCurrent: options.assertCurrent,
    session,
    body: JSON.stringify(payload)
  });
  const messages = {
    TASK_BUDGET_EXCEEDED: '本地连接器本次运行预算已用尽，未新增推理',
    RATE_LIMIT: '本地连接器达到并发或频率限制，请稍后重试',
    MODEL_FORBIDDEN: '此模型不在本地授权清单',
    LOCAL_TARGET_UNAVAILABLE: '连接器可达，但本地模型服务不可用',
    CANCELLED_OR_TIMEOUT: '本地推理已取消或超时'
  };
  assert(ok, 'CONNECTION_FAILED', messages[result.message] || '本地连接器拒绝了请求');
  assert(
    result.success === true && typeof result.data?.message === 'string' && result.data.message.length <= 8000,
    'INVALID_RESPONSE',
    '本地连接器响应结构不合法'
  );
  // 本地模型也不能写数据库或给自己核验权限。第一版仅开放文本。
  return {
    success: true,
    data: {
      message: result.data.message,
      tools: [],
      question: null,
      source: 'local',
      model: connection.model,
      usageStatus: 'upstream_local'
    }
  };
}
