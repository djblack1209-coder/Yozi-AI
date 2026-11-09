// #ifdef APP-PLUS
import 'core-js/modules/es.array.at.js';
import 'core-js/modules/es.array.find-last.js';
import 'core-js/modules/es.array.find-last-index.js';
import 'core-js/modules/es.object.has-own.js';
import 'core-js/modules/es.string.replace-all.js';
import 'core-js/modules/web.url.constructor.js';
// #endif
import { createSSRApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { globalErrorHandler } from '@/utils/error/global-error-handler.js';
import { logger } from '@/utils/logger.js';
import { applyTheme, getCurrentTheme } from '@/design/theme-runtime.js';
import { readNativeInsets } from '@/design/native-theme.js';
import { installI18n } from '@/i18n/index.js';
// #ifdef APP-PLUS
import { androidDateTimeFormat } from '@/services/learning/android-date-time.js';
import { setLearningDateTimeFormatter } from '../laf-backend/functions/_shared/learning-date-time.js';
// #endif
// #ifdef H5
import { bindAppBoot } from '@/design/app-boot.js';
import { WEBSITE_MODE, installWebsiteRouteFallback } from '@/config/website.js';
// #endif

export function createApp() {
  // #ifdef APP-PLUS
  setLearningDateTimeFormatter(androidDateTimeFormat);
  // #endif
  // #ifdef H5
  const releaseWebsiteFallback = WEBSITE_MODE ? installWebsiteRouteFallback(window) : () => undefined;
  // #endif
  const app = createSSRApp(App);
  // #ifdef H5
  if (WEBSITE_MODE)
    app.mixin({
      beforeUnmount() {
        if (this === this.$root) releaseWebsiteFallback();
      }
    });
  bindAppBoot(app);
  // #endif
  const pinia = createPinia();

  app.use(pinia);
  installI18n(app);
  app.config.globalProperties.$yoziInsets = readNativeInsets();
  // #ifndef H5
  app.mixin({
    onShow() {
      applyTheme(getCurrentTheme());
    }
  });
  // #endif

  // 初始化全局错误处理器
  globalErrorHandler.init({
    enableToast: true,
    enableModal: true,
    enableLog: true,
    enableReport: false, // 暂不启用远程上报
    ignorePatterns: [
      /ResizeObserver/,
      /Script error/,
      /switchTab:fail/,
      /reportRealtimeAction:fail/,
      /SharedArrayBuffer/
    ],
    onError: (error) => {
      logger.error('[GlobalError]', error.type, error.message);
    }
  });

  // 设置 Vue 错误处理器
  app.config.errorHandler = globalErrorHandler.createVueErrorHandler();

  // 设置 Vue 警告处理器（仅开发环境）
  if (process.env.NODE_ENV !== 'production') {
    app.config.warnHandler = (msg, vm, trace) => {
      logger.warn('[Vue Warning]', msg, trace);
    };
  }

  logger.log('[App] 应用初始化完成，全局错误处理已启用');

  return {
    app,
    pinia
  };
}
