<template>
  <view class="learning-message-content">
    <view
      v-if="generated && (content || validatedBlocks)"
      class="learning-message-origin"
      :class="{ 'request-arrival': received }"
    >
      <BaseIcon v-if="received" name="check" size="12px" aria-hidden="true" />
      <text>{{ t('learning.generatedLabel') }}</text>
    </view>
    <view v-if="pending" class="reply-state reply-progress" role="status">
      <view class="reply-progress__edge" aria-hidden="true" />
      <view class="reply-dots" aria-hidden="true"><view /><view /><view /></view>
      <text class="reply-state__label">{{ pendingLabel || t('learning.replying') }}</text>
    </view>
    <text v-if="pending && content" selectable>{{ content }}</text>
    <MuseRichText v-else-if="content" :content="content" />
    <view v-if="pending" class="learning-card-placeholder" :aria-label="t('learning.replying')" aria-busy="true"
      ><view /><view /><view
    /></view>
    <LearningContentCards v-if="validatedBlocks" :content="validatedBlocks" :presentation="presentation" />
  </view>
</template>
<script setup>
import { computed } from 'vue';
import { t } from '@/i18n/index.js';
import LearningContentCards from './learning-content-cards.vue';
import BaseIcon from '@/components/base/base-icon/base-icon.vue';
import MuseRichText from '@/components/business/learning/muse-rich-text.vue';
import { normalizeContentBlocks } from '../../../../laf-backend/functions/_shared/learning-content-blocks.js';
import '@/styles/request-motion.css';
const props = defineProps({
  pendingLabel: { type: String, default: '' },
  pending: Boolean,
  generated: Boolean,
  received: Boolean,
  content: { type: String, default: '' },
  contentBlocks: { type: Object, default: null },
  presentation: { type: String, default: 'auto' }
});
const validatedBlocks = computed(() => {
  try {
    return !props.pending && props.contentBlocks ? normalizeContentBlocks(props.contentBlocks) : null;
  } catch {
    return null;
  }
});
</script>
<style scoped>
.learning-message-content {
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.learning-message-origin {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  padding: 2px 8px;
  border-radius: var(--r-pill);
  background: var(--paper-sunk);
  color: var(--ink-2);
  font-size: 12px;
  line-height: 18px;
}
.reply-progress {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: inline-flex;
  align-self: flex-start;
  flex-wrap: nowrap;
  min-height: 34px;
  max-width: 100%;
  gap: 8px;
  margin: 0;
  padding: 4px 12px;
  border-radius: var(--r-pill);
  background: var(--paper);
  color: var(--ink);
  font-size: 13px;
}
.reply-progress .reply-dots {
  min-height: 0;
  padding: 0;
  background: transparent;
}
.reply-progress .reply-dots > view {
  width: 4px;
  height: 4px;
}
.reply-progress .reply-state__label {
  position: static;
  width: auto;
  height: auto;
  clip-path: none;
}
.reply-progress__edge {
  position: absolute;
  inset: 0;
  z-index: -1;
  background: linear-gradient(
    90deg,
    transparent 4%,
    color-mix(in srgb, var(--blue) 18%, transparent) 85%,
    color-mix(in srgb, var(--blue) 75%, transparent)
  );
  clip-path: polygon(0 0, 97% 0, 100% 19%, 98% 37%, 100% 58%, 97% 78%, 99% 100%, 0 100%);
  animation: reply-wave 3.2s cubic-bezier(0.48, 0.07, 0.49, 0.93) infinite;
}
@keyframes reply-wave {
  0%,
  100% {
    transform: translateX(-68%);
  }
  32% {
    transform: translateX(-38%);
  }
  61% {
    transform: translateX(-52%);
  }
  82% {
    transform: translateX(-31%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .reply-progress__edge {
    animation: none;
    transform: translateX(-52%);
  }
}
.learning-card-placeholder {
  width: min(360px, 100%);
  min-width: 120px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 16px;
}
.learning-card-placeholder > view {
  height: 12px;
  margin: 8px 0;
  border-radius: 6px;
  background: var(--muse-raised);
}
.learning-card-placeholder > view:last-child {
  width: 64%;
}
</style>
