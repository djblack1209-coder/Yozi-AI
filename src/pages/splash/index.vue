<template>
  <view ref="splashRoot" class="splash-container muse-space" :class="{ 'space-dark': isDark, 'space-light': !isDark }">
    <MuseLaunch :scope="learning" :ready="!visualSnapshot" @complete="completeLaunch" />
    <BaseButton v-if="showManualEntry" class="manual-entry" @tap="openHomeTab">{{ $t('nav.home') }}</BaseButton>
  </view>
</template>

<script setup>
import MuseLaunch from '@/components/business/learning/muse-launch.vue';
import BaseButton from '@/components/base/base-button/base-button.vue';
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { logger } from '@/utils/logger.js';
import { initTheme, onThemeUpdate, offThemeUpdate } from '@/composables/useTheme';
import { storageService } from '@/services/storageService.js';
import { DEV_TEST } from '@/config/build-channel.js';
import { getCurrentRoute, openLearningEntry as navigateHomeTab } from '@/utils/home-navigation.js';
import { bindLearningKeyboard } from '@/services/learning/keyboard-controls.js';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';

const learning = useConversationLearningStore();
const isDark = ref(initTheme());
const splashRoot = ref(null);
let unbindKeyboard = () => undefined;
let active = true;
const navigationTimers = new Set();
const themeHandler = (mode) => {
  isDark.value = mode === 'dark';
};

const splashTimer = ref(null);
const manualEntryTimer = ref(null);
const showManualEntry = ref(false);

// 视觉快照模式检测
function isVisualSnapshot() {
  if (typeof location === 'undefined') {
    return false;
  }
  return /visual=1/.test(location.hash || '') || /visual=1/.test(location.search || '');
}
const visualSnapshot = isVisualSnapshot();
function completeLaunch() {
  if (!active || visualSnapshot) return;
  splashTimer.value = setTimeout(navigateAfterSplash, 0);
}

function navigateAfterSplash() {
  if (!active) return;
  const completed = storageService.get('onboarding_completed', false);
  if (DEV_TEST || completed) {
    openHomeTab();
    return;
  }
  openOnboarding();
}

function openOnboarding() {
  if (!active) return;
  uni.redirectTo({
    url: '/pages/login/onboarding',
    fail: (err1) => {
      if (!active) return;
      logger.warn('[Splash] onboarding redirect failed, try reLaunch', err1);
      uni.reLaunch({
        url: '/pages/login/onboarding',
        fail: (err2) => {
          if (!active) return;
          logger.warn('[Splash] onboarding reLaunch failed, open home', err2);
          openHomeTab();
        }
      });
    }
  });
}

function openHomeTab() {
  if (!active) return;
  showManualEntry.value = false;
  navigateHomeTab({
    isCurrent: () => active,
    schedule: (callback, delay) => {
      if (!active) return;
      const timer = setTimeout(() => {
        navigationTimers.delete(timer);
        if (active) callback();
      }, delay);
      navigationTimers.add(timer);
    },
    onFail: (error) => {
      logger.error('[Splash] home navigation failed', error);
      showManualEntry.value = true;
    }
  });
}

onMounted(() => {
  unbindKeyboard = bindLearningKeyboard(splashRoot.value);
  onThemeUpdate(themeHandler);
  if (visualSnapshot) {
    logger.log('[Splash] visual snapshot mode, skip auto navigation');
    return;
  }
  manualEntryTimer.value = setTimeout(() => {
    if (getCurrentRoute().includes('splash')) {
      showManualEntry.value = true;
    }
  }, 4200);
});

// 页面销毁时清除定时器
onBeforeUnmount(() => {
  active = false;
  for (const timer of navigationTimers) clearTimeout(timer);
  navigationTimers.clear();
  unbindKeyboard();
  offThemeUpdate(themeHandler);
  if (splashTimer.value) {
    clearTimeout(splashTimer.value);
    splashTimer.value = null;
  }
  if (manualEntryTimer.value) {
    clearTimeout(manualEntryTimer.value);
    manualEntryTimer.value = null;
  }
});
</script>

<style lang="scss" scoped>
.splash-container {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: var(--ink);
  background: var(--canvas);
  font-family: var(--font-ui);
}
.manual-entry {
  position: absolute;
  bottom: max(64px, env(safe-area-inset-bottom));
  z-index: 60;
}
</style>
