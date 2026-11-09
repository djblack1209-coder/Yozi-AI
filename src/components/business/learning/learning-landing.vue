<template>
  <view
    class="app-entry muse-space"
    :class="theme.isDark ? 'space-dark' : 'space-light'"
    :aria-busy="!welcome && !entryFailed"
  >
    <AnimatedAvatar :size="64" /><text>{{ BRAND.name }}</text>
    <WelcomeStudyCards v-if="welcome" />
    <BaseButton v-if="welcome || entryFailed" variant="primary" @tap="welcome ? $emit('start') : open()">{{
      t('landing.start')
    }}</BaseButton>
    <slot></slot>
  </view>
</template>
<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import AnimatedAvatar from '@/components/base/animated-avatar/animated-avatar.vue';
import BaseButton from '@/components/base/base-button/base-button.vue';
import WelcomeStudyCards from './welcome-study-cards.vue';
import { BRAND } from '@/config/brand.js';
import { t } from '@/i18n/index.js';
import '@/i18n/messages/landing.js';
import { useThemeStore } from '@/stores/modules/theme.js';
import { openLearningEntry } from '@/utils/home-navigation.js';
const props = defineProps({ welcome: Boolean });
defineEmits(['start']);
const theme = useThemeStore();
const entryFailed = ref(false);
const timers = new Set();
let active = true;
function open() {
  entryFailed.value = false;
  openLearningEntry({
    isCurrent: () => active,
    onFail: () => {
      entryFailed.value = true;
    },
    schedule(callback, delay) {
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (active) callback();
      }, delay);
      timers.add(timer);
    }
  });
}
onMounted(() => {
  if (!props.welcome) open();
});
onBeforeUnmount(() => {
  active = false;
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
});
</script>
<style scoped>
.app-entry {
  min-height: 100dvh;
  box-sizing: border-box;
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  background: var(--canvas);
  color: var(--ink);
  font: 600 20px/28px var(--font-ui);
}
</style>
