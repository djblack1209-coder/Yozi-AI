/**
 * 安全导航工具函数
 * 封装 uni.navigateTo，自动处理导航失败（页面栈满、路径错误等）
 *
 * ✅ F014 增强：
 * - 自动检测 tabBar 页面，使用 switchTab 跳转
 * - switchTab 失败时降级为 reLaunch
 * - 普通页面失败时降级为 redirectTo
 *
 * ✅ 页面转场动画：
 * - navigateTo: slide-in-right 300ms
 * - navigateBack: slide-out-right 250ms
 * - redirectTo: fade-in 200ms
 * - switchTab: fade-in 200ms
 */

import { isDesktopRuntime } from '@/services/desktop/runtime.js';
import {
  isDesktopSettingsWindow,
  openDesktopSettings,
  openDesktopWorkspace,
  rememberSettingsFocus
} from '@/services/desktop/windows.js';
import { logger } from '@/utils/logger.js';
import { toast } from '@/utils/toast.js';
import { getCurrentRoute, isHomeRoute, openHomeTab } from '@/utils/home-navigation.js';

// tabBar 页面路径列表（与 pages.json 中 tabBar.list 保持一致）
const TAB_BAR_PAGES = []; // Chat workspace uses normal routes and a mobile drawer.

// switchTab drops query parameters, and its success callback can precede onLoad.
// Keep the requested panel until the receiving page consumes it.
let pendingProfilePanel = null;
export function requestProfilePanel(panel) {
  pendingProfilePanel = ['settings', 'connectors'].includes(panel) ? panel : 'profile';
}
export function consumeProfilePanel() {
  const panel = pendingProfilePanel;
  pendingProfilePanel = null;
  return panel;
}

// 默认转场动画配置
const ANIMATION = {
  navigateTo: { animationType: 'slide-in-right', animationDuration: 300 },
  navigateBack: { animationType: 'slide-out-right', animationDuration: 250 },
  redirectTo: { animationType: 'fade-in', animationDuration: 200 },
  switchTab: { animationType: 'fade-in', animationDuration: 200 }
};

/**
 * 判断 URL 是否为 tabBar 页面
 * @param {string} url - 页面路径（可能带查询参数）
 * @returns {boolean}
 */
function isTabBarPage(url) {
  // 去掉查询参数
  const path = url.split('?')[0];
  return TAB_BAR_PAGES.some((tab) => path === tab || path === tab.slice(1));
}

/**
 * 安全跳转页面
 * @param {string} url - 目标页面路径
 * @param {Object} [options] - 额外选项
 * @param {Function} [options.success] - 成功回调
 * @param {Function} [options.fail] - 自定义失败处理（传入则不执行默认降级）
 * @param {Function} [options.complete] - 完成回调
 * @param {boolean} [options.silent=false] - 失败时是否静默（不显示toast）
 * @param {string} [options.animationType] - 自定义动画类型（覆盖默认值）
 * @param {number} [options.animationDuration] - 自定义动画时长（覆盖默认值）
 */
export function safeNavigateTo(url, options = {}) {
  if (!url || typeof url !== 'string') {
    logger.warn('[safeNavigate] invalid url:', url);
    return;
  }

  // The reset confirmation belongs to the main window, which owns the write lease.
  const openProfile = url.split('?')[0] === '/pages/profile/index' && url !== '/pages/profile/index?panel=reset';
  if (openProfile) rememberSettingsFocus();

  if (isDesktopRuntime()) {
    if (isDesktopSettingsWindow()) {
      void openDesktopWorkspace(url).catch(() => toast.info('无法返回工作区'));
      return;
    }
    if (openProfile) {
      const panel = url.includes('connectors') ? 'connectors' : consumeProfilePanel() || 'settings';
      void openDesktopSettings(panel).catch(() => toast.info('设置窗口暂不可用'));
      return;
    }
  }
  const { success, fail, complete, silent = false, ...rest } = options;

  // ✅ F014: tabBar 页面自动使用 switchTab
  if (isTabBarPage(url)) {
    // switchTab 不支持查询参数，取纯路径
    const tabUrl = url.split('?')[0];
    uni.switchTab({
      url: tabUrl,
      ...ANIMATION.switchTab,
      success(res) {
        success && success(res);
      },
      fail(err) {
        if (fail) {
          fail(err);
          return;
        }
        logger.warn('[safeNavigate] switchTab failed, fallback to reLaunch:', tabUrl, err);
        uni.reLaunch({
          url: tabUrl,
          fail(err2) {
            logger.warn('[safeNavigate] reLaunch also failed:', tabUrl, err2);
            if (!silent) {
              toast.info('页面跳转失败');
            }
          }
        });
      },
      complete(res) {
        complete && complete(res);
      }
    });
    return;
  }

  // 普通页面：navigateTo -> redirectTo 降级
  uni.navigateTo({
    url,
    ...ANIMATION.navigateTo,
    ...rest,
    success(res) {
      success && success(res);
    },
    fail(err) {
      if (fail) {
        fail(err);
        return;
      }

      logger.warn('[safeNavigate] navigateTo failed, fallback to redirectTo:', url, err);

      uni.redirectTo({
        url,
        ...ANIMATION.redirectTo,
        fail(err2) {
          logger.warn('[safeNavigate] redirectTo also failed:', url, err2);
          if (!silent) {
            toast.info('页面跳转失败');
          }
        }
      });
    },
    complete(res) {
      complete && complete(res);
    }
  });
}

/**
 * 安全重定向页面
 * 用于替换当前页面的场景，例如重新开启同一个刷题页。
 * @param {string} url - 目标页面路径
 * @param {Object} [options] - 额外选项
 * @param {Function} [options.success] - 成功回调
 * @param {Function} [options.fail] - 自定义失败处理（传入则不执行默认降级）
 * @param {Function} [options.complete] - 完成回调
 * @param {boolean} [options.silent=false] - 失败时是否静默（不显示toast）
 */
export function safeRedirectTo(url, options = {}) {
  if (!url || typeof url !== 'string') {
    logger.warn('[safeNavigate] invalid redirect url:', url);
    return;
  }

  const { success, fail, complete, silent = false, ...rest } = options;

  if (isTabBarPage(url)) {
    safeNavigateTo(url, options);
    return;
  }

  uni.redirectTo({
    url,
    ...ANIMATION.redirectTo,
    ...rest,
    success(res) {
      success && success(res);
    },
    fail(err) {
      if (fail) {
        fail(err);
        return;
      }

      logger.warn('[safeNavigate] redirectTo failed, fallback to navigateTo:', url, err);
      safeNavigateTo(url, { silent });
    },
    complete(res) {
      complete && complete(res);
    }
  });
}

/**
 * 安全返回上一页（带转场动画）
 * @param {Object} [options] - 额外选项
 * @param {number} [options.delta=1] - 返回的页面数
 * @param {Function} [options.success] - 成功回调
 * @param {Function} [options.fail] - 失败回调
 * @param {Function} [options.complete] - 完成回调
 * @param {string} [options.animationType] - 自定义动画类型（覆盖默认值）
 * @param {number} [options.animationDuration] - 自定义动画时长（覆盖默认值）
 */
export function safeNavigateBack(options = {}) {
  const { delta = 1, success, fail, complete, ...rest } = options;
  // Refreshing a deep H5 route leaves a single uni-app page. navigateBack can
  // silently succeed there, so use the existing route-verified home fallback.
  if (!fail && Number.isInteger(delta) && delta > 0 && typeof getCurrentPages === 'function') {
    try {
      if (getCurrentPages().length <= delta) {
        const origin = getCurrentRoute();
        openHomeTab({
          isCurrent: () => getCurrentRoute() === origin || isHomeRoute(),
          onSuccess() {
            success?.();
            complete?.();
          },
          onFail(error) {
            toast.info('返回失败，请重试');
            complete?.(error);
          }
        });
        return;
      }
    } catch (_error) {
      // An unavailable page stack keeps the platform's ordinary back path.
    }
  }
  uni.navigateBack({
    delta,
    ...ANIMATION.navigateBack,
    ...rest,
    success(res) {
      success && success(res);
    },
    fail(err) {
      if (fail) {
        fail(err);
        return;
      }
      logger.warn('[safeNavigate] navigateBack failed:', err);
      // 返回失败时降级到首页
      const origin = getCurrentRoute();
      openHomeTab({
        isCurrent: () => getCurrentRoute() === origin || isHomeRoute(),
        onFail: () => toast.info('返回失败，请重试')
      });
    },
    complete(res) {
      complete && complete(res);
    }
  });
}

export default safeNavigateTo;
