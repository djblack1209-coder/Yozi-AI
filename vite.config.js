import { BRAND } from './src/config/brand.js';
import { readYoziTokens, readYoziNativeTheme } from './scripts/build/read-yozi-tokens.mjs';
import { publicImageMatch, publicFontMatch, appShellNavigationAllowlist } from './scripts/build/pwa-cache-policy.mjs';
import { websiteRoutes } from './scripts/build/website-routes.mjs';
import { appBootPlugin } from './scripts/build/app-boot.mjs';
import { websiteLaunchPlugin, WEBSITE_TITLE } from './scripts/build/website-launch.mjs';
import { defineConfig, loadEnv } from 'vite';
import uniModule from '@dcloudio/vite-plugin-uni';
import path from 'path';
import { fileURLToPath } from 'node:url';
import fs from 'fs';
import { createRequire } from 'module';
import { normalizeAppRuntimeIndexFile } from './scripts/build/app-runtime-html.js';
import { copyPwaIconAssets, copyPwaRuntimeAssets } from './scripts/build/pwa-assets.mjs';
import { VitePWA } from 'vite-plugin-pwa';
import { compression, defineAlgorithm } from 'vite-plugin-compression2';
import postcssColorMixFallback from './scripts/build/postcss-color-mix-fallback.js';
const __dirname = fileURLToPath(new URL('.', import.meta.url));

const require = createRequire(path.join(process.cwd(), 'vite.config.js'));
const uniCliSharedUtils = require('@dcloudio/uni-cli-shared/dist/utils.js');

// 兼容 @dcloudio/vite-plugin-uni CJS/ESM 双层 default 问题
const uni = typeof uniModule === 'function' ? uniModule : Reflect.get(Object(uniModule), 'default') || uniModule;

// The installed braces advisory remains unresolved. Build tools still use it;
// reject accidental inclusion in a client graph rather than waiving the audit.
export function guardRuntimeBuildDependencies() {
  return {
    name: 'yozi:runtime-build-dependency-guard',
    apply: 'build',
    generateBundle() {
      let checkedModules = 0;
      for (const moduleId of this.getModuleIds()) {
        checkedModules++;
        const id = moduleId.replace(/\\/g, '/').replace(/\0/g, '').split('?')[0];
        if (/^braces(?:\/|$)/i.test(id) || /(?:^|\/)node_modules\/braces(?:\/|$)/i.test(id)) {
          this.error({
            code: 'YOZI_UNSAFE_RUNTIME_DEPENDENCY',
            message: 'Unresolved braces dependency cannot enter the client runtime module graph'
          });
        }
      }
      console.info(`[Yozi Dependency Guard] checked ${checkedModules} client modules; braces absent`);
    }
  };
}

export function adaptH5SlotFlags(enabled) {
  return {
    name: 'yozi:h5-slot-flags',
    enforce: 'pre',
    transform(code, id) {
      if (!enabled || !/\/@dcloudio\/uni-h5-vue\/dist\/vue\.runtime\.(?:esm|cjs)\.js$/.test(id)) return;
      if (!code.includes('@dcloudio/uni-h5-vue v3.4.21')) return;
      const marker = 'def(children, "_", type);';
      if (code.split(marker).length !== 2) throw new Error('Unexpected H5 slot flag implementation');
      // The DCloud 3.4 runtime mutates this flag; shared 3.5 defaults to read-only.
      // Preserve the original slot lifecycle without changing removal or error handling.
      return code.replace(marker, 'def(children, "_", type, true);');
    }
  };
}

function guardHBuilderMiniProgramHelpers(platform) {
  const isRunByHBuilderX =
    Boolean(process.env.UNI_HBUILDERX_PLUGINS) && Boolean(process.env.RUN_BY_HBUILDERX || process.env.HX_Version);

  if (!platform?.startsWith('mp-') || !isRunByHBuilderX) return;

  try {
    const helpers = uniCliSharedUtils.requireUniHelpers();
    if (typeof helpers?.UUVP === 'function') return;
    console.warn('[Uni Guard] HBuilderX helper UUVP missing, fallback to standard mini program build path');
  } catch (error) {
    console.warn(
      `[Uni Guard] Failed to load HBuilderX helpers, fallback to standard mini program build path: ${error.message}`
    );
  }

  const originalRequireUniHelpers = uniCliSharedUtils.requireUniHelpers;

  uniCliSharedUtils.requireUniHelpers = (...args) => {
    let helpers = {};

    try {
      helpers = typeof originalRequireUniHelpers === 'function' ? originalRequireUniHelpers(...args) || {} : {};
    } catch (_error) {
      helpers = {};
    }

    if (typeof helpers.UUVP !== 'function') {
      helpers = Object.assign({}, helpers, {
        UUVP: () => ({ name: 'noop-hbuilder-uuvp' })
      });
    }

    return helpers;
  };
}

/**
 * 微信小程序自定义 tabBar 占位组件复制插件
 * 当 pages.json 中 tabBar.custom = true 时，微信框架强制要求
 * 项目根目录存在 custom-tab-bar/index 组件，否则报 "Component is not found"
 */
function copyCustomTabBar() {
  return {
    name: 'copy-custom-tab-bar',
    writeBundle(options) {
      try {
        const outDir = options.dir || '';
        if (!outDir.includes('mp-weixin')) return;

        const src = path.resolve(__dirname, 'src/custom-tab-bar');
        const dest = path.resolve(outDir, 'custom-tab-bar');

        if (!fs.existsSync(src)) {
          console.warn('[TabBar Plugin] src/custom-tab-bar not found, skipping copy');
          return;
        }
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

        let copied = 0;
        for (const file of fs.readdirSync(src)) {
          fs.copyFileSync(path.join(src, file), path.join(dest, file));
          copied++;
        }
        console.log(`[TabBar Plugin] Copied ${copied} files to ${dest}`);
      } catch (err) {
        // TabBar copy failure should not break the entire build
        console.error('[TabBar Plugin] Failed to copy custom-tab-bar:', err.message);
      }
    }
  };
}

// Add the preview only to an explicitly requested H5 development/isolated build.
export function guardYoziPreviewRoute(enabled = false, homepageFirst = false) {
  return {
    name: 'yozi-preview-route-guard',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('pages-json-js')) return null;
      let pages = JSON.parse(code);
      pages.pages = pages.pages.filter((page) => page.path !== 'platforms/h5/components');
      if (homepageFirst) {
        pages = websiteRoutes(pages);
        const homeIndex = pages.pages.findIndex((page) => page.path === 'pages/index/index');
        if (homeIndex > 0) pages.pages.unshift(...pages.pages.splice(homeIndex, 1));
      }
      if (enabled) pages.pages.push({ path: 'platforms/h5/components', style: { navigationStyle: 'custom' } });
      return { code: JSON.stringify(pages), map: null };
    }
  };
}

function emitAppPackManifest() {
  return {
    name: 'emit-app-pack-manifest',
    writeBundle(options) {
      try {
        if (process.env.UNI_COMPILER === 'nvue') return;

        const outDir = options.dir || '';
        if (!/[/\\]dist[/\\](build[/\\]app|dev[/\\](app|app-plus))$/.test(outDir)) return;

        // 如果 uni-app-plus 编译器已经生成了 manifest.json，不要覆盖
        const targetPath = path.resolve(outDir, 'manifest.json');
        if (fs.existsSync(targetPath)) {
          const existing = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
          if (existing.launch_path !== 'index.html' || existing.plus?.launchwebview) {
            console.log(`[App Manifest Plugin] Skipped: uni-app-plus compiler already emitted manifest`);
            return;
          }
        }

        const sourcePath = path.resolve(process.env.UNI_INPUT_DIR || __dirname, 'manifest.json');
        const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
        const appPlus = source['app-plus'] || {};

        const compiledManifest = {
          id: source.appid || '',
          name: source.name || '',
          description: source.description || '',
          version: {
            name: source.versionName || '1.0.0',
            code: source.versionCode || '100'
          },
          launch_path: 'index.html',
          permissions: source.permissions || {},
          plus: {
            modules: appPlus.modules || {},
            splashscreen: appPlus.splashscreen || {},
            distribute: appPlus.distribute || {}
          }
        };

        fs.writeFileSync(targetPath, JSON.stringify(compiledManifest, null, 2));
        console.log(`[App Manifest Plugin] Emitted ${targetPath}`);
      } catch (err) {
        console.error('[App Manifest Plugin] Failed to emit manifest:', err.message);
      }
    }
  };
}

function normalizeAppRuntimeIndex() {
  return {
    name: 'normalize-app-runtime-index',
    writeBundle(options) {
      try {
        if (process.env.UNI_COMPILER === 'nvue') return;

        const outDir = options.dir || '';
        if (!/[/\\]dist[/\\](build[/\\]app|dev[/\\](app|app-plus))$/.test(outDir)) return;

        const indexPath = path.resolve(outDir, 'index.html');
        if (normalizeAppRuntimeIndexFile(indexPath)) {
          console.log(`[App Runtime Plugin] Normalized ${indexPath}`);
        }
      } catch (err) {
        console.error('[App Runtime Plugin] Failed to normalize index:', err.message);
      }
    }
  };
}

/**
 * App 端强制 inlineDynamicImports，避免 IIFE + code-splitting 冲突
 * 必须在 configResolved 阶段修改，因为 uni-app-vite 的 config() 会覆盖 vite.config.js 的 output
 */
function forceAppInlineDynamicImports() {
  return {
    name: 'force-app-inline-dynamic-imports',
    enforce: 'post',
    configResolved(config) {
      const platform = process.env.UNI_PLATFORM || '';
      if (platform !== 'app' && platform !== 'app-plus') return;

      const output = config.build?.rollupOptions?.output;
      if (output && !Array.isArray(output)) {
        output.inlineDynamicImports = true;
        delete output.manualChunks;
      } else if (Array.isArray(output)) {
        output.forEach((o) => {
          o.inlineDynamicImports = true;
          delete o.manualChunks;
        });
      }
    }
  };
}

function copyH5PwaIcons({ enableUpdates = false, website = false } = {}) {
  return {
    name: 'copy-h5-pwa-icons',
    transformIndexHtml() {
      return enableUpdates ? [{ tag: 'script', attrs: { src: '/registerSW.js', defer: true }, injectTo: 'head' }] : [];
    },
    writeBundle(options) {
      try {
        const outDir = options.dir || '';
        if (!outDir || process.env.UNI_PLATFORM !== 'h5') return;

        for (const directory of ['fonts', 'visual']) {
          const source = path.resolve(__dirname, 'public', directory);
          if (fs.existsSync(source))
            fs.cpSync(source, path.join(outDir, 'public', directory), {
              recursive: true,
              filter(file) {
                const group = path.relative(source, file).split(path.sep)[0];
                return directory !== 'visual' || !website || !group || ['nomi', 'avatar'].includes(group);
              }
            });
        }
        if (website) {
          const downloads = path.resolve(__dirname, 'public/downloads');
          if (fs.existsSync(downloads)) fs.cpSync(downloads, path.join(outDir, 'downloads'), { recursive: true });
        }

        const oauthSource = path.resolve(__dirname, 'public/oauth');
        fs.cpSync(oauthSource, path.join(outDir, 'oauth'), { recursive: true });

        copyPwaRuntimeAssets({
          sourceFile: path.resolve(__dirname, 'public/sw-cache-cleanup.js'),
          outDir,
          registerSourceFile: enableUpdates ? path.resolve(__dirname, 'public/registerSW.js') : undefined
        });

        const copied = copyPwaIconAssets({
          sourceDir: path.resolve(__dirname, 'public/static/pwa-icons'),
          outDir
        });

        if (copied.length) {
          console.log(`[PWA Assets Plugin] Copied ${copied.length} icon files to ${outDir}/static/pwa-icons`);
        }
      } catch (err) {
        throw new Error(`[PWA Assets Plugin] Required PWA assets could not be copied: ${err.message}`);
      }
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  // Uni reads this file during config; do not maintain a second native palette.
  fs.writeFileSync(path.resolve(__dirname, 'src/theme.json'), JSON.stringify(readYoziNativeTheme(), null, 2) + '\n');
  // 隔离核验只使用命令显式传入的配置，避免加载日常私有连接信息。
  const isolatedBuild = process.env.YOZI_ISOLATED_BUILD === '1' || process.env.WENLI_ISOLATED_BUILD === '1';
  const env = isolatedBuild ? { ...process.env } : loadEnv(mode, process.cwd(), '');
  const platform = process.env.UNI_PLATFORM || env.UNI_PLATFORM || '';
  guardHBuilderMiniProgramHelpers(platform);

  // 判断是否为生产环境
  const isProduction = mode === 'production';
  const isStaging = mode === 'staging';
  const isDevelopment = mode === 'development';
  const isAppPlus = platform === 'app' || platform === 'app-plus';
  const enablePreview =
    (!platform || platform === 'h5') && (isDevelopment || isolatedBuild) && env.VITE_YOZI_COMPONENT_PREVIEW === '1';

  const isNvueCompiler = process.env.UNI_COMPILER === 'nvue';
  const appInputDir = process.env.UNI_INPUT_DIR
    ? path.resolve(process.env.UNI_INPUT_DIR)
    : path.resolve(__dirname, 'src');
  // uni's startup transform and generated component imports share this path.
  // A relative input can miss the H5 entry or emit unresolved "src/..." imports.
  process.env.UNI_INPUT_DIR = appInputDir;
  const viteRootDir = process.cwd();
  const shouldBypassNvueHtmlEntry = isAppPlus && isNvueCompiler;

  process.env.VITE_ROOT_DIR = viteRootDir;

  const isH5 = !platform || platform === 'h5';
  const isDesktop = isH5 && (process.env.YOZI_DESKTOP === '1' || process.env.WENLI_DESKTOP === '1');

  console.log(`[Vite] Building for mode: ${mode}, command: ${command}, platform: ${platform || 'unknown'}`);

  return {
    cacheDir: isolatedBuild ? path.resolve(viteRootDir, 'tmp/vite-cache') : undefined,
    root: viteRootDir,

    base: isAppPlus ? './' : '/',

    plugins: [
      guardYoziPreviewRoute(enablePreview, isH5 && !isDesktop),
      adaptH5SlotFlags(isH5),
      appBootPlugin(isDesktop),
      websiteLaunchPlugin(isH5 && !isDesktop),
      guardRuntimeBuildDependencies(),
      uni(),
      copyCustomTabBar(),
      emitAppPackManifest(),
      normalizeAppRuntimeIndex(),
      forceAppInlineDynamicImports(),
      copyH5PwaIcons({ enableUpdates: isH5 && !isDesktop && command === 'build', website: isH5 && !isDesktop }),
      // Phase 3-6: PWA 离线体验（仅 H5 平台启用）
      ...(isH5 && !isDesktop
        ? [
            VitePWA({
              registerType: 'prompt',
              injectRegister: false,
              includeAssets: [
                'static/pwa-icons/icon-192x192.png',
                'static/pwa-icons/icon-512x512.png',
                'static/pwa-icons/icon-512x512-maskable.png'
              ],
              manifest: {
                name: WEBSITE_TITLE,
                short_name: BRAND.name,
                description: '每日练习、逐段带写与复习，你的考研英语写作教练。',
                lang: 'zh-CN',
                theme_color: '#e7e7e7',
                background_color: '#e7e7e7',
                display: 'standalone',
                scope: '/',
                start_url: '/',
                icons: [
                  { src: '/website/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                  { src: '/website/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
                ]
              },
              workbox: {
                skipWaiting: false,
                clientsClaim: false,
                importScripts: ['/sw-cache-cleanup.js'],
                // uni-app 使用根路径 hash 路由；服务端/独立文件地址不得被 app shell 冒充。
                navigateFallbackAllowlist: appShellNavigationAllowlist,
                // 预缓存 app shell
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
                // The exact template poster exceeds 2 MiB; cache on first use instead of precaching.
                globIgnores: ['**/public/visual/nomi/kitten.png'],
                // 运行时缓存策略
                runtimeCaching: [
                  {
                    // 图片资源：CacheFirst
                    urlPattern: publicImageMatch,
                    handler: 'CacheFirst',
                    options: {
                      cacheName: 'public-image-cache-v1',
                      expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 } // 30天
                    }
                  },
                  {
                    // 字体：CacheFirst
                    urlPattern: publicFontMatch,
                    handler: 'CacheFirst',
                    options: {
                      cacheName: 'public-font-cache-v1',
                      expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } // 1年
                    }
                  }
                ]
              }
            }),
            // 构建时预压缩：生成 .gz 和 .br 文件，Nginx 直接发送预压缩文件以降低 CPU 开销
            ...(isProduction
              ? [
                  // gzip 预压缩（兼容性最广，所有现代浏览器都支持）
                  compression({
                    algorithms: [defineAlgorithm('gzip', { level: 6 })],
                    threshold: 1024,
                    include: /\.(js|css|html|svg|json|xml|txt|ico|wasm)$/,
                    deleteOriginalAssets: false
                  }),
                  // brotli 预压缩（压缩率更高，Chrome/Firefox/Edge/Safari 均支持）
                  compression({
                    algorithms: [defineAlgorithm('brotliCompress', { params: { [1]: 6 } })],
                    threshold: 1024,
                    include: /\.(js|css|html|svg|json|xml|txt|ico|wasm)$/,
                    deleteOriginalAssets: false
                  })
                ]
              : [])
          ]
        : [])
    ],

    // 环境变量定义
    define: {
      __YOZI_TOKENS__: JSON.stringify(readYoziTokens()),
      'import.meta.env.UNI_PLATFORM': JSON.stringify(platform),
      'process.env.NODE_ENV': JSON.stringify(mode),
      __YOZI_PREVIEW__: JSON.stringify(enablePreview),
      'process.env.SENTRY_DSN': JSON.stringify(env.VITE_SENTRY_DSN || ''),
      __YOZI_DEV_TEST__: JSON.stringify(
        ['dev', 'test'].includes(
          process.env.YOZI_BUILD_CHANNEL || env.YOZI_BUILD_CHANNEL || (isDevelopment ? 'dev' : 'release')
        )
      ),
      __YOZI_DESKTOP__: JSON.stringify(isDesktop),
      __YOZI_WEBSITE__: JSON.stringify(isH5 && !isDesktop)
    },

    // 路径别名
    resolve: {
      alias: {
        '@yozi-home': path.resolve(
          appInputDir,
          isH5 && !isDesktop
            ? 'components/business/website/website-home.vue'
            : 'components/business/learning/learning-landing.vue'
        ),
        // ✅ P008: @ 映射到 src/，子路径自动解析无需重复声明
        '@': appInputDir
      }
    },

    // CSS 预处理器配置 + PostCSS color-mix() 降级
    css: {
      postcss: {
        plugins: [
          // ✅ R409: 自定义插件 — 为含 var() 的 color-mix() 生成 rgba 回退值
          // 旧浏览器用 rgba 回退，新浏览器 color-mix() 覆盖
          postcssColorMixFallback()
        ]
      },
      preprocessorOptions: {
        scss: {
          silenceDeprecations: ['legacy-js-api', 'import', 'global-builtin'],
          // ✅ F003: 自动注入共享 SCSS 变量到所有组件
          additionalData: `
            @use "${path.resolve(__dirname, 'src/styles/_design-tokens.scss').replace(/\\/g, '/')}" as *;
            $env-mode: "${mode}";
            $is-production: ${isProduction};
          `
        }
      },
      // 生产环境启用 CSS 代码分割
      devSourcemap: !isProduction
    },

    // 构建配置
    build: {
      // 源码映射：开发和测试环境启用，生产环境关闭
      sourcemap: isDevelopment ? 'inline' : isStaging ? true : false,

      // 代码压缩配置 — 小程序 dev 模式也启用轻量压缩以控制主包体积
      minify: isProduction || isStaging ? 'terser' : platform.startsWith('mp-') ? 'esbuild' : false,

      terserOptions: {
        maxWorkers: 1,
        compress: {
          // 生产环境移除 console 和 debugger
          drop_console: isProduction,
          drop_debugger: isProduction || isStaging,
          // 生产环境移除特定函数调用
          pure_funcs: isProduction ? ['console.log', 'console.info', 'console.debug'] : []
        },
        mangle: {
          safari10: true
        },
        format: {
          // 生产环境移除注释
          comments: !isProduction
        }
      },

      // 代码分割配置
      write: !shouldBypassNvueHtmlEntry,

      rollupOptions: {
        input: shouldBypassNvueHtmlEntry ? path.resolve(__dirname, 'scripts/build/empty-app-nvue-entry.js') : undefined,
        output: isAppPlus
          ? {
              // App 端：IIFE 格式必须内联所有动态导入，禁止代码分割
              inlineDynamicImports: true
            }
          : {
              // 非 App 端：正常的文件命名配置
              chunkFileNames: isProduction ? 'static/js/[name]-[hash].js' : 'static/js/[name].js',
              entryFileNames: isProduction ? 'static/js/[name]-[hash].js' : 'static/js/[name].js',
              assetFileNames: isProduction ? 'static/[ext]/[name]-[hash].[ext]' : 'static/[ext]/[name].[ext]',
              // H5: 拆分 vendor chunks，提升缓存命中率和首屏加载速度
              ...(isH5
                ? {
                    manualChunks(id) {
                      // Vue + uni-app 核心运行时（互相依赖，必须合并避免循环引用）
                      if (
                        id.includes('node_modules/vue/') ||
                        id.includes('node_modules/@vue/') ||
                        id.includes('node_modules/pinia/') ||
                        id.includes('node_modules/@dcloudio/')
                      ) {
                        return 'vendor-core';
                      }
                      // wot-design UI 组件库（按需引入，独立缓存）
                      if (id.includes('node_modules/wot-design-uni/')) {
                        return 'vendor-wot';
                      }
                    }
                  }
                : {})
            }
      },

      // 块大小警告限制（KB）
      chunkSizeWarningLimit: isProduction ? 500 : 1000,

      // 资源内联限制（小于此大小的资源会被内联为base64）
      // 提升到 8KB — 减少小图标的 HTTP 请求数
      assetsInlineLimit: 8192,

      // 构建目标（es2018 支持 async/await、rest/spread 等，减少 polyfill 体积）
      target: 'es2018',

      // CSS 代码分割（App 端禁用，避免 IIFE 格式冲突）
      cssCodeSplit: isAppPlus ? false : true,

      // 生产环境 CSS 压缩（esbuild 内置，零依赖）
      cssMinify: isProduction ? 'esbuild' : false,

      // 生产环境报告压缩后的大小
      reportCompressedSize: isProduction
    },

    // 开发服务器配置
    server: {
      host: '0.0.0.0',
      port: parseInt(env.VITE_DEV_PORT) || 5173,
      open: false,

      // 代理配置
      proxy: {
        '/api': {
          target: env.VITE_API_BASE_URL || 'https://nf98ia8qnt.sealosbja.site',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
          // 开发环境显示代理日志
          configure: (proxy, options) => {
            if (isDevelopment) {
              proxy.on('proxyReq', (proxyReq, req) => {
                console.log(`[Proxy] ${req.method} ${req.url} -> ${options.target}`);
              });
            }
          }
        }
      },

      // 热更新配置
      hmr: {
        overlay: true
      }
    },

    // 预览服务器配置（用于预览生产构建）
    preview: {
      host: '0.0.0.0',
      port: parseInt(env.VITE_PREVIEW_PORT) || 4173,
      strictPort: false
    },

    // 预构建优化
    optimizeDeps: {
      // uni-app 插件会将 vue/pinia 作为 external 处理，
      // 若同时出现在 include，会触发 esbuild: "entry point ... cannot be marked as external"
      include: [],
      exclude: ['vue', 'pinia'],
      // 强制预构建
      force: false
    },

    // 环境变量前缀
    envPrefix: 'VITE_',

    // 环境目录
    envDir: isolatedBuild ? false : process.cwd(),

    // 日志级别
    logLevel: isDevelopment ? 'info' : 'warn',

    // 清除屏幕
    clearScreen: false,

    // esbuild 配置
    esbuild: {
      // 开发环境使用 esbuild 压缩时移除 debugger
      drop: isDevelopment ? [] : ['debugger'],
      // 不保留法律注释
      legalComments: 'none'
    }
  };
});
