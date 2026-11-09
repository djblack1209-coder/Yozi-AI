/**
 * 网络状态监控器 (Network Monitor)
 *
 * 功能：
 * 1. 实时监听网络状态变化
 * 2. 弱网检测和提示
 * 3. 离线时暂停数据同步
 * 4. 网络恢复时自动恢复同步
 * 5. 网络质量评估
 *
 * 使用示例：
 * import { networkMonitor } from '@/utils/network-monitor.js'
 *
 * // 监听网络变化
 * networkMonitor.on('change', (status) => {
 *   logger.log('网络状态:', status)
 * })
 *
 * // 检查当前状态
 * const isOnline = networkMonitor.isOnline()
 * const quality = networkMonitor.getNetworkQuality()
 */

import { offlineQueue } from './offline-queue.js';
import { logger } from '@/utils/logger.js';
// P006: 从中央配置读取网络检测 URL
import config from '@/config/index.js';
import { toast } from '@/utils/toast.js';

function createNetworkUniCompat() {
  return {
    getNetworkType(options = {}) {
      const { success, fail } = options;
      try {
        const online = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
        success?.({ networkType: online ? 'wifi' : 'none' });
      } catch (error) {
        fail?.(error);
      }
    },
    onNetworkStatusChange(_callback) {
      // H5 fallback 环境不提供真实网络变更订阅，静默兼容
    },
    offNetworkStatusChange() {
      this._onlineHandler = null;
      this._offlineHandler = null;
    },
    showToast() {
      // H5/测试环境静默处理
    },
    request(options = {}) {
      const { url, method = 'GET', timeout = config.network.checkTimeout, success, fail } = options;
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = setTimeout(() => controller?.abort(), timeout);

      fetch(url, { method, signal: controller?.signal })
        .then((response) => {
          clearTimeout(timer);
          success?.({ statusCode: response.status, data: null });
        })
        .catch((error) => {
          clearTimeout(timer);
          fail?.(error);
        });

      return {
        abort() {
          controller?.abort();
        }
      };
    }
  };
}

const globalRef = typeof globalThis !== 'undefined' ? globalThis : {};
const uni = {
  ...createNetworkUniCompat(),
  ...(globalRef['uni'] || {})
};

function browserIsOffline() {
  // #ifdef H5
  if (typeof navigator !== 'undefined') return navigator.onLine === false;
  // #endif
  return false;
}

/**
 * 网络类型定义
 */
const NETWORK_TYPES = {
  WIFI: 'wifi',
  '5G': '5g',
  '4G': '4g',
  '3G': '3g',
  '2G': '2g',
  ETHERNET: 'ethernet',
  UNKNOWN: 'unknown',
  NONE: 'none'
};

/**
 * 网络质量等级
 */
const NETWORK_QUALITY = {
  EXCELLENT: 'excellent', // 优秀（WiFi/5G/4G）
  GOOD: 'good', // 良好（4G/3G）
  FAIR: 'fair', // 一般（3G/2G）
  POOR: 'poor', // 较差（2G）
  OFFLINE: 'offline' // 离线
};

/**
 * 网络监控器类
 */
class NetworkMonitor {
  constructor() {
    this.status = {
      isConnected: true,
      networkType: NETWORK_TYPES.UNKNOWN,
      quality: NETWORK_QUALITY.GOOD,
      signalStrength: 100,
      lastOnlineTime: Date.now(),
      lastOfflineTime: null,
      offlineDuration: 0
    };

    this.listeners = {
      change: new Set(),
      online: new Set(),
      offline: new Set(),
      weakNetwork: new Set(),
      qualityChange: new Set()
    };

    this.config = {
      weakNetworkThreshold: 2000, // 弱网判定阈值（ms）
      pingInterval: 30000, // 网络检测间隔（ms）
      pingUrl: null, // 自定义 ping URL
      enablePing: false, // 是否启用主动 ping
      showToast: true, // 是否显示提示
      autoSyncOnRecover: true // 网络恢复时自动同步
    };

    this.pingTimer = null;
    this.isInitialized = false;

    // 自动初始化
    this._init();
  }

  /**
   * 初始化
   * @private
   */
  _init() {
    if (this.isInitialized) return;

    // 获取初始网络状态
    this._checkNetworkStatus();

    // 监听网络变化
    this._setupNetworkListener();

    // 启动主动检测（如果启用）
    if (this.config.enablePing) {
      this._startPingTimer();
    }

    this.isInitialized = true;
    logger.log('[NetworkMonitor] 初始化完成');
  }

  /**
   * 配置监控器
   * @param {Object} config - 配置对象
   */
  configure(config) {
    this.config = { ...this.config, ...config };

    // 重新设置 ping 定时器
    if (this.config.enablePing) {
      this._startPingTimer();
    } else {
      this._stopPingTimer();
    }

    logger.log('[NetworkMonitor] 配置已更新:', this.config);
  }

  /**
   * 检查网络状态
   * @private
   */
  _checkNetworkStatus() {
    uni.getNetworkType({
      success: (res) => {
        const wasConnected = this.status.isConnected;
        const oldType = this.status.networkType;

        this.status.networkType = browserIsOffline() ? NETWORK_TYPES.NONE : res.networkType || NETWORK_TYPES.UNKNOWN;
        this.status.isConnected = this.status.networkType !== NETWORK_TYPES.NONE;
        this.status.quality = this._evaluateQuality(this.status.networkType);

        if (wasConnected !== this.status.isConnected || oldType !== this.status.networkType) {
          this._handleStatusChange(wasConnected);
        }

        logger.log('[NetworkMonitor] 当前网络: [省略] ([省略])');
      },
      fail: (err) => {
        logger.error('[NetworkMonitor] 获取网络状态失败:', err);
      }
    });
  }

  /**
   * 设置网络监听
   * @private
   */
  _setupNetworkListener() {
    // [AUDIT FIX] 保存回调引用，以便 destroy() 时注销
    this._networkChangeHandler = (res) => {
      const wasConnected = this.status.isConnected;
      const oldQuality = this.status.quality;

      const offline = browserIsOffline();
      this.status.isConnected = !offline && res.isConnected;
      this.status.networkType = offline ? NETWORK_TYPES.NONE : res.networkType || NETWORK_TYPES.UNKNOWN;
      this.status.quality = this._evaluateQuality(this.status.networkType);

      logger.log('[NetworkMonitor] 网络变化: [省略] (连接: [省略])');

      this._handleStatusChange(wasConnected, oldQuality);
    };
    uni.onNetworkStatusChange(this._networkChangeHandler);
    // #ifdef H5
    // Chromium may signal reachability changes without a NetworkInformation change event.
    if (typeof window !== 'undefined') {
      this._browserNetworkHandler = () => this._checkNetworkStatus();
      window.addEventListener('offline', this._browserNetworkHandler);
      window.addEventListener('online', this._browserNetworkHandler);
    }
    // #endif
  }

  /**
   * 处理状态变化
   * @private
   */
  _handleStatusChange(wasConnected, oldQuality) {
    const now = Date.now();

    // 触发通用变化事件
    this._emit('change', this.getStatus());

    // 在线/离线状态变化
    if (wasConnected !== this.status.isConnected) {
      if (this.status.isConnected) {
        // 从离线恢复到在线
        this.status.offlineDuration = this.status.lastOfflineTime ? now - this.status.lastOfflineTime : 0;
        this.status.lastOnlineTime = now;

        logger.log('[NetworkMonitor] 🌐 网络已恢复 (离线时长: [省略]s)');

        this._emit('online', {
          ...this.getStatus(),
          offlineDuration: this.status.offlineDuration
        });

        // 显示提示
        if (this.config.showToast) {
          toast.success('网络已恢复');
        }

        // 自动同步
        if (this.config.autoSyncOnRecover) {
          this._triggerSync();
        }
      } else {
        // 从在线变为离线
        this.status.lastOfflineTime = now;

        logger.log('[NetworkMonitor] 📴 网络已断开');

        this._emit('offline', this.getStatus());

        // 显示提示
        if (this.config.showToast) {
          toast.info('网络已断开');
        }
      }
    }

    // 网络质量变化
    if (oldQuality && oldQuality !== this.status.quality) {
      this._emit('qualityChange', {
        oldQuality,
        newQuality: this.status.quality,
        networkType: this.status.networkType
      });

      // 弱网提示
      if (this._isWeakNetwork(this.status.quality) && !this._isWeakNetwork(oldQuality)) {
        logger.log('[NetworkMonitor] ⚠️ 检测到弱网环境');

        this._emit('weakNetwork', this.getStatus());

        if (this.config.showToast) {
          toast.info('当前网络较慢，请耐心等待');
        }
      }
    }
  }

  /**
   * 评估网络质量
   * @private
   */
  _evaluateQuality(networkType) {
    switch (networkType) {
      case NETWORK_TYPES.WIFI:
      case NETWORK_TYPES.ETHERNET:
      case NETWORK_TYPES['5G']:
        return NETWORK_QUALITY.EXCELLENT;

      case NETWORK_TYPES['4G']:
        return NETWORK_QUALITY.GOOD;

      case NETWORK_TYPES['3G']:
        return NETWORK_QUALITY.FAIR;

      case NETWORK_TYPES['2G']:
        return NETWORK_QUALITY.POOR;

      case NETWORK_TYPES.NONE:
        return NETWORK_QUALITY.OFFLINE;

      default:
        return NETWORK_QUALITY.GOOD;
    }
  }

  /**
   * 判断是否为弱网
   * @private
   */
  _isWeakNetwork(quality) {
    return quality === NETWORK_QUALITY.FAIR || quality === NETWORK_QUALITY.POOR;
  }

  /**
   * 触发同步
   * @private
   */
  _triggerSync() {
    logger.log('[NetworkMonitor] 🔄 触发离线队列同步...');

    // 延迟一点执行，确保网络稳定
    setTimeout(() => {
      if (this.status.isConnected) {
        offlineQueue.processQueue();
      }
    }, 1000);
  }

  /**
   * 启动 ping 定时器
   * @private
   */
  _startPingTimer() {
    this._stopPingTimer();

    this.pingTimer = setInterval(() => {
      this._performPing();
    }, this.config.pingInterval);
  }

  /**
   * 停止 ping 定时器
   * @private
   */
  _stopPingTimer() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  /**
   * 执行 ping 检测
   * @private
   */
  async _performPing() {
    if (!this.status.isConnected) return;

    const startTime = Date.now();
    const pingUrl = this.config.pingUrl || config.network.pingUrl;

    try {
      await new Promise((resolve, reject) => {
        uni.request({
          url: pingUrl + '?t=' + Date.now(),
          method: 'HEAD',
          timeout: this.config.weakNetworkThreshold,
          success: resolve,
          fail: reject
        });
      });

      const latency = Date.now() - startTime;
      this.status.signalStrength = Math.max(0, 100 - Math.floor(latency / 20));

      // 根据延迟调整质量评估
      if (latency > this.config.weakNetworkThreshold) {
        const oldQuality = this.status.quality;
        this.status.quality = NETWORK_QUALITY.POOR;

        if (oldQuality !== this.status.quality) {
          this._emit('weakNetwork', this.getStatus());
        }
      }
    } catch (error) {
      logger.warn('[NetworkMonitor] Ping 失败:', error);
      this.status.signalStrength = 0;
    }
  }

  /**
   * 触发事件
   * @private
   */
  _emit(event, data) {
    const listeners = this.listeners[event];
    if (listeners) {
      listeners.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          logger.error('[NetworkMonitor] 事件处理错误 ([省略]):', error);
        }
      });
    }
  }

  /**
   * 监听事件
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   * @returns {Function} 取消监听函数
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].add(callback);
      return () => this.listeners[event].delete(callback);
    }
    logger.warn('[NetworkMonitor] 未知事件: [省略]');
    return () => {
      /* noop */
    };
  }

  /**
   * 取消监听
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   */
  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].delete(callback);
    }
  }

  /**
   * 检查是否在线
   * @returns {boolean}
   */
  isOnline() {
    return this.status.isConnected;
  }

  /**
   * 检查是否离线
   * @returns {boolean}
   */
  isOffline() {
    return !this.status.isConnected;
  }

  /**
   * 获取网络类型
   * @returns {string}
   */
  getNetworkType() {
    return this.status.networkType;
  }

  /**
   * 获取网络质量
   * @returns {string}
   */
  getNetworkQuality() {
    return this.status.quality;
  }

  /**
   * 获取完整状态
   * @returns {Object}
   */
  getStatus() {
    return {
      ...this.status,
      isWeakNetwork: this._isWeakNetwork(this.status.quality)
    };
  }

  /**
   * 手动刷新网络状态
   */
  refresh() {
    this._checkNetworkStatus();
  }

  /**
   * 暂停同步（弱网/离线时调用）
   */
  pauseSync() {
    logger.log('[NetworkMonitor] ⏸️ 暂停数据同步');
    offlineQueue.pause();
  }

  /**
   * 恢复同步
   */
  resumeSync() {
    logger.log('[NetworkMonitor] ▶️ 恢复数据同步');
    offlineQueue.resume();
  }

  /**
   * 销毁监控器
   */
  destroy() {
    this._stopPingTimer();

    // #ifdef H5
    if (this._browserNetworkHandler) {
      window.removeEventListener('offline', this._browserNetworkHandler);
      window.removeEventListener('online', this._browserNetworkHandler);
      this._browserNetworkHandler = null;
    }
    // #endif

    // [AUDIT FIX] 注销平台网络监听器，防止内存泄漏
    if (this._networkChangeHandler) {
      try {
        uni.offNetworkStatusChange(this._networkChangeHandler);
      } catch (_e) {
        // 部分平台可能不支持 offNetworkStatusChange
      }
      this._networkChangeHandler = null;
    }

    // 清空所有监听器
    Object.keys(this.listeners).forEach((event) => {
      this.listeners[event].clear();
    });

    this.isInitialized = false;
    logger.log('[NetworkMonitor] 已销毁');
  }
}

// 创建单例
const networkMonitor = new NetworkMonitor();

// 导出常量
export { NETWORK_TYPES, NETWORK_QUALITY };

// 导出
export { networkMonitor, NetworkMonitor };
export default networkMonitor;
