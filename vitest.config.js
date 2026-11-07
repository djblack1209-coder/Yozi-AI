/**
 * Vitest 配置文件
 * 用于单元测试和组件测试
 *
 * @see https://vitest.dev/config/
 */
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import { fileURLToPath } from 'node:url';
import crypto from 'crypto';
import { readYoziTokens } from './scripts/build/read-yozi-tokens.mjs';
import { readAppLegal } from './scripts/build/read-app-legal.mjs';
const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Polyfill crypto.hash for Node < 20.12 (used by @vitejs/plugin-vue@6 internally)
if (typeof crypto.hash !== 'function') {
  crypto.hash = (algorithm, data, outputEncoding) => {
    return crypto.createHash(algorithm).update(data).digest(outputEncoding);
  };
}

export default defineConfig({
  cacheDir:
    process.env.YOZI_ISOLATED_BUILD === '1' || process.env.WENLI_ISOLATED_BUILD === '1'
      ? resolve(__dirname, 'tmp/vitest-cache')
      : undefined,
  envDir: process.env.YOZI_ISOLATED_BUILD === '1' || process.env.WENLI_ISOLATED_BUILD === '1' ? false : undefined,
  define: {
    __YOZI_TOKENS__: JSON.stringify(readYoziTokens()),
    __YOZI_LEGAL__: JSON.stringify(readAppLegal())
  },
  plugins: [vue()],

  test: {
    // Isolated checks never load private env files; these are public test fixture values.
    env:
      process.env.YOZI_ISOLATED_BUILD === '1' || process.env.WENLI_ISOLATED_BUILD === '1'
        ? {
            UNI_PLATFORM: 'app',
            VITE_API_BASE_URL: 'https://test.example.com',
            VITE_WX_APP_ID: 'wx_test_app_id',
            VITE_APP_NAME: 'Yozi-AI-Test',
            VITE_PAGE_SIZE: '20',
            VITE_DEBUG_MODE: 'true',
            VITE_ENABLE_MOCK: 'false',
            VITE_WS_DEV_URL: 'ws://localhost:3000/ws/ranking',
            VITE_WS_PROD_URL: 'wss://test.example.com/ws/ranking'
          }
        : { UNI_PLATFORM: 'app' },
    maxWorkers: process.env.YOZI_ISOLATED_BUILD === '1' || process.env.WENLI_ISOLATED_BUILD === '1' ? 1 : undefined,
    // 测试环境
    environment: 'happy-dom',

    // 全局变量
    globals: true,

    // 测试文件匹配模式
    include: ['tests/unit/**/*.{test,spec}.{js,ts,vue}', 'src/**/*.{test,spec}.{js,ts}'],

    // 排除目录
    exclude: ['node_modules', 'dist'],

    // 覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{js,ts,vue}'],
      exclude: ['src/**/*.d.ts', 'src/main.js', 'src/App.vue']
    },

    // 设置别名
    alias: {
      '@yozi-home': resolve(__dirname, 'src/components/business/learning/learning-landing.vue'),
      '@': resolve(__dirname, 'src'),
      '@components': resolve(__dirname, 'src/components'),
      '@pages': resolve(__dirname, 'src/pages'),
      '@utils': resolve(__dirname, 'src/utils'),
      '@services': resolve(__dirname, 'src/services'),
      '@lafjs/cloud': resolve(__dirname, 'tests/__mocks__/lafjs-cloud.js')
    },

    // Laf 运行时包：本地不存在，测试中通过 vi.mock 提供
    server: {
      deps: {
        external: ['nodemailer', 'tencentcloud-sdk-nodejs']
      }
    },

    // Mock uni-app API
    setupFiles: ['./tests/setup.js'],

    // 超时设置
    testTimeout: 10000,

    // 并发（Vitest 4+ 顶层配置）
    maxConcurrency: 5
  },

  resolve: {
    extensions: ['.mjs', '.ts', '.js', '.mts', '.jsx', '.tsx', '.json'],
    alias: {
      '@yozi-home': resolve(__dirname, 'src/components/business/learning/learning-landing.vue'),
      '@': resolve(__dirname, 'src'),
      '@components': resolve(__dirname, 'src/components'),
      '@pages': resolve(__dirname, 'src/pages'),
      '@utils': resolve(__dirname, 'src/utils'),
      '@services': resolve(__dirname, 'src/services'),
      // Laf 运行时包本地不存在，指向 mock stub 避免 Vite import 解析失败
      '@lafjs/cloud': resolve(__dirname, 'tests/__mocks__/lafjs-cloud.js'),
      nodemailer: resolve(__dirname, 'tests/__mocks__/nodemailer.js'),
      'tencentcloud-sdk-nodejs': resolve(__dirname, 'tests/__mocks__/tencentcloud-sdk-nodejs.js')
    }
  }
});
