<template>
  <view
    v-if="items.length"
    class="learning-activity"
    role="group"
    :aria-label="t('muse.activity.title')"
    data-test="learning-activity-group"
  >
    <text class="activity-heading"
      >{{ t('muse.activity.title') }}<text v-if="day"> · {{ day }}</text></text
    >
    <view v-for="item in items" :key="item.id" class="activity-item">
      <BaseIcon v-if="item.status === 'success'" name="check" :size="14" />
      <text>{{ t(`muse.activity.${item.action}`) }}</text>
      <text v-if="item.status !== 'success'" class="activity-status">{{
        t(item.status === 'cancelled' ? 'muse.activity.cancelled' : 'muse.activity.incomplete')
      }}</text>
    </view>
  </view>
</template>
<script setup>
import '@/i18n/muse.js';
import { t } from '@/i18n/index.js';
import BaseIcon from '@/components/base/base-icon/base-icon.vue';

defineProps({
  items: { type: Array, required: true },
  day: { type: String, default: '' }
});
</script>
<style scoped>
.learning-activity {
  display: grid;
  gap: 4px;
  width: fit-content;
  max-width: 100%;
  margin-block: 8px 16px;
  padding: 4px 12px;
  border-inline-start: 2px solid var(--workspace-border, var(--line));
  color: var(--ink);
  font-size: 13px;
  line-height: 1.45;
}
.activity-heading,
.activity-status {
  color: var(--ink-2);
  font-size: 12px;
}
.activity-item {
  display: flex;
  align-items: center;
  gap: 7px;
}
</style>
