<template>
  <view v-if="visible" class="offline-indicator" :class="[statusClass, { 'offline-indicator--expanded': expanded }]">
    <!-- 简洁模式 -->
    <BaseButton
      class="offline-indicator__compact"
      variant="quiet"
      align="start"
      :label="statusText"
      :aria-expanded="expanded"
      @tap="toggleExpand"
    >
      <view class="offline-indicator__icon">
        <BaseIcon v-if="isOffline" name="offline" :size="20" />
        <BaseIcon v-else-if="isWeakNetwork" name="warning" :size="20" />
        <BaseIcon v-else name="refresh" :size="20" />
      </view>
      <text class="offline-indicator__text">
        {{ statusText }}
      </text>
      <view v-if="pendingCount > 0" class="offline-indicator__badge">
        {{ pendingCount > 99 ? '99+' : pendingCount }}
      </view>
    </BaseButton>

    <!-- 展开详情 -->
    <view v-if="expanded" class="offline-indicator__details">
      <view class="offline-indicator__detail-item">
        <text class="detail-label"> 网络类型 </text>
        <text class="detail-value">
          {{ networkTypeText }}
        </text>
      </view>

      <view class="offline-indicator__detail-item">
        <text class="detail-label"> 网络质量 </text>
        <view class="detail-value quality-indicator">
          <view
            v-for="i in 4"
            :key="i"
            class="quality-bar"
            :class="[`quality-bar--${i}`, { 'quality-bar--active': i <= qualityLevel }]"
          />
        </view>
      </view>

      <view v-if="isOffline" class="offline-indicator__detail-item">
        <text class="detail-label"> 离线时长 </text>
        <text class="detail-value">
          {{ offlineDurationText }}
        </text>
      </view>

      <view v-if="pendingCount > 0" class="offline-indicator__detail-item">
        <text class="detail-label"> 待同步 </text>
        <text class="detail-value"> {{ pendingCount }} 条数据 </text>
      </view>

      <!-- 操作按钮 -->
      <view class="offline-indicator__actions">
        <BaseButton
          v-if="!isOffline && pendingCount > 0"
          class="action-btn action-btn--sync"
          :loading="isSyncing"
          @tap.stop="handleSync"
        >
          立即同步
        </BaseButton>

        <BaseButton class="action-btn action-btn--dismiss" variant="secondary" @tap.stop="handleDismiss"
          >暂时忽略</BaseButton
        >
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { toast } from '@/utils/toast.js';
import { logger } from '@/utils/logger.js';
import { networkMonitor, NETWORK_QUALITY } from '@/utils/core/network-monitor.js';
import { offlineQueue } from '@/utils/core/offline-queue.js';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseIcon from '@/components/base/base-icon/base-icon.vue';

const props = defineProps({
  // 是否自动显示
  autoShow: {
    type: Boolean,
    default: true
  },
  // 显示位置
  position: {
    type: String,
    default: 'top', // top, bottom
    validator: (v) => ['top', 'bottom'].includes(v)
  },
  // 自动隐藏延迟（ms），0 表示不自动隐藏
  autoHideDelay: {
    type: Number,
    default: 0
  }
});

const visible = ref(false);
const expanded = ref(false);
const networkStatus = ref(null);
const pendingCount = ref(0);
const isSyncing = ref(false);
const offlineDuration = ref(0);
let offlineTimer = null;
let autoHideTimer = null;
let unsubscribers = [];

const isOffline = computed(() => {
  return networkStatus.value && !networkStatus.value.isConnected;
});

const isWeakNetwork = computed(() => {
  return networkStatus.value && networkStatus.value.isWeakNetwork;
});

const statusClass = computed(() => {
  if (isOffline.value) return 'offline-indicator--offline';
  if (isWeakNetwork.value) return 'offline-indicator--weak';
  if (isSyncing.value) return 'offline-indicator--syncing';
  return 'offline-indicator--online';
});

const statusText = computed(() => {
  if (isOffline.value) return '网络已断开';
  if (isWeakNetwork.value) return '网络较慢';
  if (isSyncing.value) return '正在同步...';
  if (pendingCount.value > 0) return `${pendingCount.value} 条待同步`;
  return '网络正常';
});

const networkTypeText = computed(() => {
  if (!networkStatus.value) return '未知';

  const typeMap = {
    wifi: 'WiFi',
    '5g': '5G',
    '4g': '4G',
    '3g': '3G',
    '2g': '2G',
    ethernet: '有线网络',
    none: '无网络',
    unknown: '未知'
  };

  return typeMap[networkStatus.value.networkType] || networkStatus.value.networkType;
});

const qualityLevel = computed(() => {
  if (!networkStatus.value) return 0;

  const qualityMap = {
    [NETWORK_QUALITY.EXCELLENT]: 4,
    [NETWORK_QUALITY.GOOD]: 3,
    [NETWORK_QUALITY.FAIR]: 2,
    [NETWORK_QUALITY.POOR]: 1,
    [NETWORK_QUALITY.OFFLINE]: 0
  };

  return qualityMap[networkStatus.value.quality] || 0;
});

const offlineDurationText = computed(() => {
  const seconds = Math.floor(offlineDuration.value / 1000);

  if (seconds < 60) return `${seconds} 秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟`;
  return `${Math.floor(seconds / 3600)} 小时`;
});

onMounted(() => {
  _init();
});

onBeforeUnmount(() => {
  _cleanup();
});

function _init() {
  // 获取初始状态
  networkStatus.value = networkMonitor.getStatus();
  _updatePendingCount();

  // 监听网络变化
  const unsubNetwork = networkMonitor.on('change', (status) => {
    networkStatus.value = status;
    _updateVisibility();
  });
  unsubscribers.push(unsubNetwork);

  // 监听离线事件
  const unsubOffline = networkMonitor.on('offline', () => {
    _startOfflineTimer();
    _showIndicator();
  });
  unsubscribers.push(unsubOffline);

  // 监听在线事件
  const unsubOnline = networkMonitor.on('online', (status) => {
    _stopOfflineTimer();
    offlineDuration.value = status.offlineDuration || 0;

    // 在线后延迟隐藏
    if (props.autoHideDelay > 0) {
      _scheduleAutoHide();
    }
  });
  unsubscribers.push(unsubOnline);

  // 监听弱网事件
  const unsubWeak = networkMonitor.on('weakNetwork', () => {
    _showIndicator();
  });
  unsubscribers.push(unsubWeak);

  // 监听离线队列变化
  const unsubQueue = offlineQueue.addListener((event) => {
    if (['enqueue', 'dequeue', 'processComplete', 'clear'].includes(event.type)) {
      _updatePendingCount();
    }
  });
  unsubscribers.push(unsubQueue);

  // 初始显示判断
  _updateVisibility();
}

function _cleanup() {
  // 取消所有订阅
  unsubscribers.forEach((unsub) => unsub());
  unsubscribers = [];

  // 清除定时器
  _stopOfflineTimer();
  _clearAutoHideTimer();

  // 清除 dismiss 重检定时器
  if (_dismissRecheckTimer) {
    clearTimeout(_dismissRecheckTimer);
    _dismissRecheckTimer = null;
  }
}

function _updateVisibility() {
  if (!props.autoShow) return;

  // 离线或弱网时显示
  if (isOffline.value || isWeakNetwork.value) {
    _showIndicator();
    return;
  }

  // 有待同步数据时显示
  if (pendingCount.value > 0) {
    _showIndicator();
    return;
  }

  // 其他情况隐藏
  visible.value = false;
}

function _showIndicator() {
  visible.value = true;
  _clearAutoHideTimer();
}

function _updatePendingCount() {
  const status = offlineQueue.getStatus();
  pendingCount.value = status.queueLength;
  _updateVisibility();
}

function _startOfflineTimer() {
  _stopOfflineTimer();

  const startTime = Date.now();
  offlineTimer = setInterval(() => {
    offlineDuration.value = Date.now() - startTime;
  }, 1000);
}

function _stopOfflineTimer() {
  if (offlineTimer) {
    clearInterval(offlineTimer);
    offlineTimer = null;
  }
}

function _scheduleAutoHide() {
  _clearAutoHideTimer();

  autoHideTimer = setTimeout(() => {
    if (!isOffline.value && !isWeakNetwork.value && pendingCount.value === 0) {
      visible.value = false;
    }
  }, props.autoHideDelay);
}

function _clearAutoHideTimer() {
  if (autoHideTimer) {
    clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }
}

function toggleExpand() {
  expanded.value = !expanded.value;
}

async function handleSync() {
  if (isSyncing.value || isOffline.value) return;

  isSyncing.value = true;

  try {
    const result = await offlineQueue.processQueue();

    if (result.success) {
      toast.success(`同步完成：${result.processed} 条`);
    } else {
      toast.info('未同步，稍后重试');
    }
  } catch (error) {
    logger.error('[OfflineIndicator] 同步失败:', error);
    toast.info('同步失败，请稍后重试');
  } finally {
    isSyncing.value = false;
    _updatePendingCount();
  }
}

/** @type {number|null} dismiss 后的重新检查定时器 */
let _dismissRecheckTimer = null;

function handleDismiss() {
  visible.value = false;
  expanded.value = false;

  // 5分钟后重新检查
  _dismissRecheckTimer = setTimeout(
    () => {
      _updateVisibility();
    },
    5 * 60 * 1000
  );
}

// 公开方法：手动显示/隐藏
function show() {
  visible.value = true;
}

function hide() {
  visible.value = false;
  expanded.value = false;
}

defineExpose({ show, hide });
</script>

<style lang="scss" scoped>
.offline-indicator {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  top: calc(var(--yozi-nav-top, var(--status-bar-height, 0px)) + var(--s-3));
  box-sizing: border-box;
  width: max-content;
  max-width: calc(100vw - var(--s-4) * 2);
  padding: var(--s-3) var(--s-4);
  border-radius: var(--r-md);
  background: var(--paper);
  color: var(--ink);
  box-shadow: var(--lift-2);
  font: var(--weight-regular) var(--size-small)/var(--leading-small) var(--font-ui);
  &--offline {
    background: var(--coral-soft);
  }
  &--weak {
    background: var(--apricot-soft);
  }
  &--syncing {
    background: var(--violet-soft);
  }
  &--online {
    background: var(--mint-soft);
  }
  &__compact {
    min-height: var(--touch-min);
    padding: 0;
  }
  &__compact:focus-visible {
    outline: var(--border-selected) solid var(--focus);
    outline-offset: var(--focus-offset);
  }
  &__icon {
    display: flex;
    flex: none;
  }
  &__text {
    color: var(--ink);
    font-weight: var(--weight-ui-emphasis);
  }
  &__badge {
    background: var(--paper);
    color: var(--ink);
    padding: var(--s-1) var(--s-2);
    border-radius: var(--r-pill);
    font-variant-numeric: tabular-nums;
  }
  &__details {
    margin-top: var(--s-3);
    padding-top: var(--s-3);
    border-top: var(--border-thin) solid var(--line-strong);
  }
  &__detail-item {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: var(--s-3);
    margin-bottom: var(--s-3);
  }
  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-3);
    margin-top: var(--s-4);
  }
}
.detail-label {
  color: var(--ink-2);
}
.detail-value {
  color: var(--ink);
  font-weight: var(--weight-ui-emphasis);
}
.quality-indicator {
  display: flex;
  align-items: flex-end;
  gap: var(--s-1);
}
.quality-bar {
  width: var(--s-1);
  background: var(--line-strong);
  border-radius: var(--r-xs);
}
.quality-bar--1 {
  height: var(--s-2);
}
.quality-bar--2 {
  height: var(--s-3);
}
.quality-bar--3 {
  height: var(--s-4);
}
.quality-bar--4 {
  height: var(--s-5);
}
.quality-bar--active {
  background: var(--violet-ink);
}
@media (prefers-reduced-motion: no-preference) {
  .offline-indicator--offline .offline-indicator__icon {
    animation: offline-symbol-settle 450ms cubic-bezier(0.21, 0.78, 0.35, 1) both;
  }
}
@keyframes offline-symbol-settle {
  0% {
    transform: translateY(-5px) rotate(-10deg);
  }
  68% {
    transform: translateY(1px) rotate(4deg);
  }
  100% {
    transform: none;
  }
}
</style>
