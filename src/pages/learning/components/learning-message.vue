<template>
  <view class="learning-message-content">
    <text v-if="generated && (content || validatedBlocks)" class="learning-message-origin">{{
      t('learning.generatedLabel')
    }}</text>
    <view v-if="pending && !content" class="reply-state" role="status">
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
import MuseRichText from '@/components/business/learning/muse-rich-text.vue';
import { normalizeContentBlocks } from '../../../../laf-backend/functions/_shared/learning-content-blocks.js';
const props = defineProps({
  pendingLabel: { type: String, default: '' },
  pending: Boolean,
  generated: Boolean,
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
  align-self: flex-start;
  padding: 2px 8px;
  border-radius: var(--r-pill);
  background: var(--paper-sunk);
  color: var(--ink-2);
  font-size: 12px;
  line-height: 18px;
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
