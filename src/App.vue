<script>
import { isSessionUnavailable, captureSession, checkSession, getUserId } from '@/services/auth-storage.js';
import { toast } from '@/utils/toast.js';
import { useUserStore } from '@/stores';
import { applyTheme, getCurrentTheme, watchTheme } from '@/design/theme-runtime.js';
// ✅ 检查点 5.1: 导入分析服务
import { analytics } from '@/utils/analytics/event-bus-analytics.js';
// ✅ 检查点 5.2: 导入增强错误处理器
import { globalErrorHandler } from '@/utils/error/global-error-handler.js';
import { logger } from '@/utils/logger.js';
import { isUserLoggedIn } from '@/utils/auth/loginGuard.js';
import { safeNavigateTo } from '@/utils/safe-navigate.js';
import { NAV_BAR_COLORS } from '@/composables/useTheme.js';
import { useThemeStore } from '@/stores/modules/theme.js';
import { initI18n, publicError } from '@/i18n/index.js';
import { restoreUserParams as restoreFsrsParams } from '@/services/fsrs-service.js';
import { storageService } from '@/services/storageService.js';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import {
  bindDesktopWorkspace,
  receiveDesktopModelIntake,
  completeDesktopModelIntake
} from '@/services/desktop/windows.js';
import { getCurrentRoute } from '@/utils/home-navigation.js';
import { isDesktopRuntime } from '@/services/desktop/runtime.js';
import { learningNotificationsFor, notificationChannel } from '@/services/learning/learning-notifications.js';
import { clearFailedAuthentication } from '@/services/auth-failure.js';
let notificationRuntime = null;
let releaseDesktopWorkspace = () => undefined;
let startupTimer = null;
let authRedirectTimer = null,
  routeRedirectTimer = null;
const startupTasks = new Map();
function scheduleStartupRetry() {
  if (startupTasks.size && startupTimer === null) startupTimer = setTimeout(retryStartup, 1000);
}
function retryStartup() {
  clearTimeout(startupTimer);
  startupTimer = null;
  for (const [name, task] of startupTasks) {
    if (task.running) continue;
    const finish = (result) => {
      if (startupTasks.get(name) !== task) return;
      task.running = false;
      if (result !== false) startupTasks.delete(name);
      scheduleStartupRetry();
    };
    const fail = (error) => {
      if (!isSessionUnavailable(error)) logger.warn('[App] 初始化失败');
      finish(isSessionUnavailable(error) ? false : undefined);
    };
    try {
      const result = task.run();
      if (result?.then) {
        task.running = true;
        result.then(finish, fail);
      } else finish(result);
    } catch (error) {
      fail(error);
    }
  }
  // Synchronous tasks may have all completed after an earlier one scheduled a retry.
  if (!startupTasks.size) {
    clearTimeout(startupTimer);
    startupTimer = null;
  } else scheduleStartupRetry();
}
function startup(name, run) {
  startupTasks.set(name, { run, running: false });
}

export default {
  onLaunch() {
    // 生产环境静默启动

    startup('analytics', () => analytics.init({ enableDebug: process.env.NODE_ENV !== 'production' }));
    this.initApiErrorInterceptor();
    this.initRouteGuard();
    startup('theme', () => this.initThemeSystem());
    startup('i18n', () => initI18n());
    startup('fsrs', () => restoreFsrsParams());
    startup('login', () => {
      // Login restoration owns its retryable read status and does not call a provider.
      const result = this.performSilentLogin();
      return result;
    });
    if (isDesktopRuntime() || notificationChannel() === 'ios' || import.meta.env.VITE_ENABLE_LEGACY_LEARNING === 'true')
      startup('notifications', () => {
        notificationRuntime ||= learningNotificationsFor(useConversationLearningStore(this.$pinia));
        return notificationRuntime.initialize().then(
          () => true,
          () => false
        );
      });
    retryStartup();
    void bindDesktopWorkspace({
      onModelIntake: async (intent) => {
        let success = false;
        try {
          const result = await receiveDesktopModelIntake(intent, {
            owner: getUserId,
            currentRoute: getCurrentRoute,
            navigate: () =>
              new Promise((resolve, reject) =>
                safeNavigateTo('/pages/learning/index', { success: resolve, fail: reject })
              ),
            learning: useConversationLearningStore(this.$pinia)
          });
          success = result?.success === true;
          if (result && !result.success) toast.info(publicError(result));
        } catch (failure) {
          toast.info(publicError(failure));
        } finally {
          if (intent?.id) await completeDesktopModelIntake(intent.id, success).catch(() => undefined);
        }
      },
      onRoute: async (route) => {
        const learning = useConversationLearningStore(this.$pinia);
        learning.refresh();
        if (route === '/pages/learning/index' && learning.state.intake) {
          const intake = learning.state.intake;
          learning.selectedConversationId = intake.acceptedConversationId || null;
          await learning.loadModels().catch(() => undefined);
          learning.modelId = intake.modelId;
          learning.selectedMode = 'cloud';
        }
        safeNavigateTo(route);
      },
      onPreferences: () => {
        useThemeStore(this.$pinia).refreshAppearance();
        initI18n();
        try {
          useConversationLearningStore(this.$pinia).refresh();
        } catch {
          /* Storage may be locked during account transitions. */
        }
      }
    })
      .then((release) => {
        releaseDesktopWorkspace = release;
      })
      .catch(() => undefined);
  },
  onError(error) {
    // 委托给统一错误处理器（避免重复注册 uni.onError）
    globalErrorHandler.report('Vue Error', error);
  },
  onUnhandledRejection(event) {
    // 委托给统一错误处理器
    globalErrorHandler.report('Unhandled Promise Rejection', event.reason);
  },
  onShow() {
    retryStartup();
    // 重开时同时恢复共享状态、页面颜色和原生导航栏。
    try {
      this.switchTheme(getCurrentTheme());
    } catch (error) {
      if (!isSessionUnavailable(error)) logger.warn('[App] 主题恢复失败');
    }
    notificationRuntime?.show();
    try {
      useConversationLearningStore(this.$pinia).resumeMemory();
    } catch {
      /* Account initialization will schedule its own reconciliation. */
    }
  },
  onHide() {
    try {
      useConversationLearningStore(this.$pinia).pauseMemory();
    } catch {
      /* Account disposal has already cancelled its timer. */
    }
    notificationRuntime?.hide();
    // 应用进入后台 — uni-app 生命周期钩子
    // 当前无需额外操作：主题/用户状态已在各自 store 中实时持久化
  },
  beforeUnmount() {
    try {
      useConversationLearningStore(this.$pinia).pauseMemory();
    } catch {
      /* Account disposal has already cancelled its timer. */
    }
    clearTimeout(startupTimer);
    startupTimer = null;
    startupTasks.clear();
    clearTimeout(authRedirectTimer);
    clearTimeout(routeRedirectTimer);
    authRedirectTimer = routeRedirectTimer = null;
    releaseDesktopWorkspace();
    notificationRuntime?.dispose();
    notificationRuntime = null;
  },
  methods: {
    /**
     * ✅ R14: 全局路由守卫
     * 拦截 navigateTo / redirectTo，未登录用户无法进入需要登录的页面
     * 公开页面白名单之外的所有页面都需要登录
     */
    initRouteGuard() {
      // 公开页面白名单 — 不需要登录即可访问
      const PUBLIC_PAGES = [
        '/pages/splash/index',
        '/pages/index/index',
        '/pages/learning/index',
        '/pages/archive/index',
        '/pages/mistake/index',
        '/pages/plan/index',
        '/pages/study-detail/index',
        '/pages/login/index',
        '/pages/login/onboarding',
        '/pages/login/wechat-callback',
        '/pages/settings/privacy',
        '/pages/settings/terms',
        '/pages/practice/index',
        '/pages/practice-sub/do-quiz',
        '/pages/profile/index'
      ];

      const checkAuth = (args) => {
        if (!args || !args.url) return;
        // 提取路径（去掉查询参数）
        const path = args.url.split('?')[0];
        // 公开页面放行
        if (PUBLIC_PAGES.some((p) => path.startsWith(p))) return;
        // 已登录放行
        const loginState = isUserLoggedIn();
        if (loginState === null) {
          toast.info('登录状态暂不可读，请重试');
          return false;
        }
        if (loginState) return;
        // 未登录：阻止跳转，弹窗引导登录
        logger.log('[RouteGuard] 拦截未登录访问: [省略]');
        toast.info('请先登录后使用此功能');
        const session = captureSession();
        clearTimeout(routeRedirectTimer);
        routeRedirectTimer = setTimeout(() => {
          routeRedirectTimer = null;
          if (checkSession(session) === 'current') safeNavigateTo('/pages/login/index');
        }, 300);
        // 返回 false 阻止原始跳转
        return false;
      };

      // 拦截 navigateTo
      uni.addInterceptor('navigateTo', {
        invoke: checkAuth
      });
      // 拦截 redirectTo
      uni.addInterceptor('redirectTo', {
        invoke: checkAuth
      });
      // 拦截 reLaunch（防止通过 reLaunch 绕过登录）
      uni.addInterceptor('reLaunch', {
        invoke: checkAuth
      });
    },

    /**
     * 初始化双模主题系统
     */
    initThemeSystem() {
      // 读取保存的主题或使用系统主题
      const currentTheme = getCurrentTheme();

      this.globalData.currentTheme = currentTheme;
      this.globalData.isDarkMode = currentTheme === 'dark';

      // 同步 store 状态（store 的 setDarkMode 会自动调用 applyTheme）
      try {
        const themeStore = useThemeStore(this.$pinia);
        if (!themeStore.restorePreferences()) return false;
        themeStore.setDarkMode(currentTheme === 'dark', { persist: false });
      } catch (_e) {
        // store 未初始化时降级直接渲染
        applyTheme(currentTheme);
      }

      // 监听系统主题变化
      watchTheme((theme) => {
        // 如果用户没有手动设置主题，则跟随系统
        const userSetTheme = storageService.get('theme_mode', null);
        if (!userSetTheme || userSetTheme === 'system') {
          this.switchTheme(theme);
        }
      });

      // 全局监听主题切换事件
      uni.$on('updateTheme', (mode) => {
        this.switchTheme(mode);
      });

      // 主题初始化完成
    },

    /**
     * 切换主题 — 委托给 useThemeStore 作为唯一写入源
     * App.vue 仅负责同步 globalData 和导航栏颜色
     */
    switchTheme(theme, { persist = false } = {}) {
      const isDark = theme === 'dark';

      // 委托 store 完成：持久化 + DOM 渲染 + 事件通知
      try {
        const themeStore = useThemeStore(this.$pinia);
        themeStore.setDarkMode(isDark, { persist });
      } catch (_e) {
        // store 未初始化时降级（仅在极早期启动阶段可能发生）
        applyTheme(theme);
        if (persist) storageService.save('theme_mode', theme);
        uni.$emit('themeUpdate', theme);
      }

      // App.vue 独有职责：同步 globalData
      this.globalData.currentTheme = theme;
      this.globalData.isDarkMode = isDark;

      // App.vue 独有职责：更新导航栏颜色
      this.updateNavigationBarColor(theme);
    },

    /**
     * 更新导航栏颜色
     */
    updateNavigationBarColor(theme) {
      const isDark = theme === 'dark';
      const colors = isDark ? NAV_BAR_COLORS.dark : NAV_BAR_COLORS.light;
      uni
        .setNavigationBarColor({
          frontColor: colors.frontColor,
          backgroundColor: colors.backgroundColor,
          animation: {
            duration: 0,
            timingFunc: 'easeInOut'
          }
        })
        .catch(() => {
          // 设置导航栏颜色失败，静默处理
        });
    },

    /**
     * ✅ 2.4: 全局 API 错误拦截器
     * 监听 API 请求核心发出的 authFailure 事件，统一处理认证失败
     */
    initApiErrorInterceptor() {
      let isRedirecting = false;
      // [Phase5] 启动保护：前 3 秒内不触发 authFailure 导航，避免 webviewId 竞态
      const appReadyTime = Date.now() + 3000;

      uni.$on('authFailure', async (event) => {
        logger.log('[App] 认证失败拦截: statusCode=[省略], path=[省略]');

        // 防止重复跳转
        if (isRedirecting) return;

        isRedirecting = true;

        // 清除本地登录态
        try {
          const userStore = useUserStore();
          const cleared = await clearFailedAuthentication(event, (options) => userStore.logout(options));
          if (!cleared) {
            isRedirecting = false;
            return;
          }
        } catch (_e) {
          isRedirecting = false;
          return;
        }

        // Startup protects navigation only. Invalid credentials must still be revoked immediately.
        if (Date.now() < appReadyTime || event?.silent) {
          isRedirecting = false;
          return;
        }

        const session = captureSession();
        if (!session || session.owner !== 'guest') {
          isRedirecting = false;
          return;
        }
        toast.info('登录已过期，请重新登录');

        // 延迟跳转，让 toast 显示
        authRedirectTimer = setTimeout(() => {
          authRedirectTimer = null;
          if (checkSession(session) !== 'current') {
            isRedirecting = false;
            return;
          }
          const pages = getCurrentPages();
          const currentRoute = pages.length > 0 ? pages[pages.length - 1].route : '';
          // 避免在登录页重复跳转
          if (!currentRoute.includes('login')) {
            uni.navigateTo({
              url: '/pages/login/index',
              fail: () => {
                // [Phase5] 不再 switchTab 回当前页，避免 webview 混乱
                uni.reLaunch({ url: '/pages/login/index' });
              }
            });
          }
          isRedirecting = false;
        }, 1500);
      });
    },

    /**
     * 执行静默登录
     */
    async performSilentLogin() {
      try {
        const userStore = useUserStore();
        const result = await userStore.silentLogin();

        if (result.success) {
          // 缓存恢复成功，通知其他页面
          uni.$emit('loginStatusChanged', true);
          logger.log('[App] 缓存恢复登录成功');
        }
        return !isSessionUnavailable(result.error);
        // 无缓存是新用户的正常状态，不输出警告
      } catch (error) {
        logger.error('[App] 登录恢复异常:', error);
        return !isSessionUnavailable(error);
      }
    }
  },
  globalData: {
    currentTheme: 'light',
    isDarkMode: false
  }
};
</script>

<style lang="scss">
/* Wot Design Uni Theme Mapping */
@use './styles/_wot-theme.scss';
/* 全局按钮动画反馈样式 (P010) */
@use './styles/button-animations.scss';
/* 深色模式变量 mixin（单一来源，消除3x重复） */
@use './styles/yozi-tokens.scss';
/* 3D 立体设计系统 — uiverse.io 风格原子组件 */
@use './styles/_em3d-design-system.scss';
@use './styles/interaction-foundation.scss';
@import './components/business/learning/learning-space.css';
/* wot-design-uni 基础变量 */
@import 'wot-design-uni/components/common/abstracts/variable.scss';
/* #ifdef H5 */
@font-face {
  font-family: 'DM Sans';
  src: url('/public/fonts/DMSans-Regular.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: 'DM Sans';
  src: url('/public/fonts/DMSans-Variable.woff2') format('woff2');
  font-weight: 500;
  font-display: swap;
}
@font-face {
  font-family: Epilogue;
  src: url('/public/fonts/Epilogue-Black.woff2') format('woff2');
  font-weight: 900;
  font-display: swap;
}
@font-face {
  font-family: 'DMS';
  font-style: normal;
  font-weight: 400;
  font-display: block;
  src: url(/public/fonts/DMSans-Variable.woff2) format('woff2');
  unicode-range:
    U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC,
    U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'DMS';
  font-style: normal;
  font-weight: 500;
  font-display: block;
  src: url(/public/fonts/DMSans-Variable.woff2) format('woff2');
  unicode-range:
    U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC,
    U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'Playfair Display';
  font-style: normal;
  font-weight: 400;
  font-display: block;
  src: url(/public/fonts/PlayfairDisplay-normal-400.woff2) format('woff2');
  unicode-range:
    U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC,
    U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 400;
  font-display: block;
  src: url(/public/fonts/Poppins-normal-400.woff2) format('woff2');
  unicode-range:
    U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC,
    U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
/* #endif */

/* Resolve material fallbacks after every light/dark variant, including direct token users. */
@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {
  :root,
  page,
  :root:not([data-theme='light']),
  :root[data-theme='dark'],
  .space-dark,
  .dark,
  .dark-mode,
  .page-dark {
    --yozi-glass: var(--yozi-solid);
    --yozi-reading: var(--yozi-solid);
    --yozi-floating: var(--yozi-solid);
  }
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  :root,
  page,
  :root:not([data-theme='light']),
  :root[data-theme='dark'],
  .space-dark,
  .dark,
  .dark-mode,
  .page-dark {
    --yozi-glass: var(--yozi-solid);
    --yozi-reading: var(--yozi-solid);
    --yozi-floating: var(--yozi-solid);
  }
}

/* ============================================
   全局默认样式重置
   ============================================ */
:root,
page {
  font-synthesis: none;
}
page {
  height: 100%;
  background-color: var(--bg-page);
  color: var(--text-main);
  font-family: var(--font-ui);
  font-size: var(--size-body);
  line-height: var(--leading-body);
  transition:
    background-color var(--transition-normal) var(--ease-default),
    color var(--transition-normal) var(--ease-default);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* 深色模式下图片亮度调整 */
@media (prefers-color-scheme: dark) {
  /* #ifdef H5 */
  :root:not([data-theme='light']) image
  /* #endif */
  /* #ifndef H5 */
  image
  /* #endif */ {
    opacity: 0.9;
    filter: brightness(0.9);
  }
}

/* ============================================
   全局元素样式
   ============================================ */
view,
text,
image,
button,
input,
textarea,
scroll-view {
  box-sizing: border-box;
  font-family: inherit;
  font-synthesis: none;
}

/* ============================================
   全局工具类 (使用语义化变量)
   ============================================ */

/* Existing card names share one frosted material. Nested groups do not add blur. */
.card,
.glass-card,
.apple-glass-card,
.apple-group-card {
  background: var(--yozi-reading);
  border: 0;
  border-radius: var(--r-lg);
  color: var(--text-main);
  box-shadow: var(--yozi-shadow);
}
.card,
.glass-card {
  padding: var(--spacing-md);
}
.apple-glass,
.apple-glass-pill {
  background: var(--yozi-glass);
  border: 0;
  box-shadow: var(--yozi-shadow);
  backdrop-filter: blur(24px) saturate(1.2);
  -webkit-backdrop-filter: blur(24px) saturate(1.2);
}
.apple-cta {
  min-height: 44px;
  border-radius: 12px;
  background: var(--yozi-button);
  color: var(--yozi-button-ink);
  border: 0;
  box-shadow: var(--yozi-button-shadow);
  transition:
    box-shadow var(--t-press) var(--ease),
    transform var(--t-press) var(--ease);
}
.apple-cta:active:not([disabled]) {
  transform: translateY(var(--press-y));
  box-shadow: var(--clay-shadow-press);
  transition-duration: var(--t-press);
}
@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {
  .card,
  .glass-card,
  .apple-glass,
  .apple-glass-card,
  .apple-glass-pill,
  .apple-group-card {
    background: var(--yozi-solid);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .apple-glass,
  .apple-glass-pill {
    background: var(--yozi-solid);
  }
}
@media (prefers-reduced-motion: reduce) {
  .apple-cta {
    transition: none !important;
    transform: none !important;
  }
}

/* 按钮基础样式（新拟物化风格：胶囊圆角 + 双向阴影） */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-sm) var(--spacing-xl);
  border-radius: var(--em3d-radius-pill);
  font-weight: var(--weight-ui-emphasis);
  font-size: 14px;
  letter-spacing: -0.01em;
  transition: var(--em3d-ease-press);
  cursor: pointer;
}

.btn:active {
  /* 新拟物化风格：不使用 translateY 位移 */
}

/* 主色按钮（新拟物化绿色凸起） */
.btn-primary {
  background-color: var(--clay-face);
  color: var(--on-clay);
  border: none;
  box-shadow: var(--clay-shadow);
}

.btn-primary:active {
  transform: translateY(var(--press-y));
  box-shadow: var(--clay-shadow-press);
}

/* 次要按钮（新拟物化凸起） */
.btn-secondary {
  background-color: var(--em3d-card-bg);
  color: var(--em3d-text-1);
  border: none;
  box-shadow: var(--neu-shadow-md);
}

.btn-secondary:active {
  transform: translateY(var(--press-y));
  box-shadow: var(--clay-shadow-press);
}

/* 文字颜色工具类 */
.text-main {
  color: var(--text-main);
}
.text-sub {
  color: var(--text-sub);
}
.text-primary {
  color: var(--primary);
}
.text-success {
  color: var(--success);
}
.text-warning {
  color: var(--warning);
}
.text-danger {
  color: var(--danger);
}

/* 背景颜色工具类 */
.bg-page {
  background-color: var(--bg-page);
}
.bg-card {
  background-color: var(--bg-card);
}

/* 输入框通用样式（新拟物化风格：凹陷内阴影 + 聚焦外发光） */
/* 注意: 这里去掉了原生的 input, textarea 裸标签选择器，避免污染 wot-design-uni 内部的组件样式 */
.input,
.textarea {
  background-color: var(--em3d-card-bg);
  color: var(--em3d-text-1);
  border: none;
  border-radius: var(--em3d-radius-md);
  padding: 24rpx 28rpx;
  font-size: 30rpx;
  line-height: 1.5;
  box-shadow: var(--neu-shadow-inset-sm);
  transition: var(--em3d-ease-smooth);
  outline: none;
  -webkit-appearance: none;
}

.input:focus,
.textarea:focus {
  border-color: var(--em3d-primary);
  box-shadow:
    var(--neu-shadow-inset-sm),
    0 0 0 6rpx var(--em3d-primary-light);
  background-color: var(--em3d-card-bg);
}

/* ============================================
   性能优化
   ============================================ */
.will-change-transform {
  will-change: transform;
}

.will-change-opacity {
  will-change: opacity;
}

.gpu-accelerated {
  transform: translateZ(0);
  backface-visibility: hidden;
  perspective: 1000px;
}

/* ============================================
   ✅ PM要求：全局点击态反馈
   消除"塑料感"，提升交互质感
   ============================================ */

/* 通用点击态 - 适用于所有可点击元素 */
.clickable,
.touchable,
[hover-class] {
  transition:
    transform 0.15s ease-out,
    box-shadow 0.15s ease-out,
    opacity 0.15s ease-out;
  -webkit-tap-highlight-color: transparent;
}

.clickable:active,
.touchable:active {
  transform: translateY(var(--press-y));
  opacity: 0.8;
}

/* 卡片点击态 - 新拟物化凹陷效果 */
.card-hover:active {
  transform: translateY(var(--press-y));
  box-shadow: var(--clay-shadow-press);
}

/* 按钮点击态 - 带亮度变化 */
.btn:active,
.action-btn:active,
button:active {
  transform: translateY(var(--press-y));
  filter: brightness(0.9);
}

/* 列表项点击态 - 背景高亮 */
.list-item:active,
.activity-item:active,
.option-item:active {
  background: var(--paper-sunk);
}

/* 深色模式下的列表项点击态 */
.dark-mode .list-item:active,
.dark-mode .activity-item:active,
.dark-mode .option-item:active,
page[data-theme='dark'] .list-item:active,
page[data-theme='dark'] .activity-item:active,
page[data-theme='dark'] .option-item:active {
  background: var(--paper-sunk);
}

/* 图标点击态 - 旋转缩放 */
.icon-btn:active,
.theme-toggle:active,
.nav-back:active,
.nav-add:active {
  transform: translateY(var(--press-y));
  opacity: 0.7;
}

/* 气泡点击态 - 弹性效果 */
.bubble-card:active,
.knowledge-bubble:active {
  transform: translateY(var(--press-y));
  transition: transform 0.1s ease-out;
}

/* 头像点击态 */
.user-avatar:active,
.avatar-ring:active {
  transform: translateY(var(--press-y));
  box-shadow: var(--lift-1);
}

/* 禁用点击态的元素 */
.no-feedback:active,
[disabled]:active {
  transform: none !important;
  opacity: 1 !important;
  filter: none !important;
}

/* #ifdef H5 */
/* 取消 uni-app 屏外阴影图片的 CDN 预加载。 */
html body::after {
  animation: none;
}
/* H5 环境：隐藏原生 tabBar，使用自定义胶囊 tabBar (custom-tabbar.vue) */
/* 原生 tabBar 和自定义 tabBar 同时显示会互相遮挡 */
uni-tabbar,
.uni-tabbar-bottom {
  display: none !important;
}
/* #endif */
</style>

<style lang="scss">
/* #ifdef MP-WEIXIN */
page {
  font-family: 'PingFang SC', 'Noto Sans SC', system-ui, sans-serif;
}
.nav-bar .nav-content {
  padding-right: calc(var(--yozi-capsule-right, 0px) + var(--s-3));
}
.login-top {
  padding-top: max(var(--yozi-nav-top, 0px), env(safe-area-inset-top));
}
.future-stage .intro {
  top: max(var(--yozi-nav-top, 0px), env(safe-area-inset-top));
}
/* #endif */
</style>
