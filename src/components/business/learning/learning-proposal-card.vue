<template>
  <BaseCard class="proposal-card" padding="large" data-test="learning-proposal">
    <text class="proposal-heading" role="heading" aria-level="3">{{
      proposal.entry ? entryTitle : t(plan ? 'tutor.proposal.plan' : 'tutor.proposal.profile')
    }}</text>
    <view v-if="proposal.entry" class="proposal-row"
      ><text>{{ entryText }}</text></view
    >
    <template v-else-if="plan"
      ><text class="proposal-reason">{{ proposal.data.reason }}</text
      ><view v-for="(task, index) in proposal.data.tasks" :key="index" class="proposal-row proposal-task"
        ><text class="proposal-task-title">{{ task.title }}</text></view
      ></template
    >
    <view v-else class="proposal-row"
      ><text>{{ t(`tutor.profile.${proposal.data.field}`) }}</text
      ><text>{{ proposal.data.value }}</text></view
    >
    <view v-if="status === 'pending'" class="proposal-actions">
      <LearningChatChoice
        v-if="plan"
        :title="t('tutor.proposal.plan')"
        :label="t('tutor.proposal.reviewPlan')"
        :options="planOptions"
        :busy="busy"
        @apply="$emit('resolve', $event)"
      />
      <template v-else>
        <BaseButton variant="quiet" :disabled="busy" @tap="$emit('resolve', 'dismiss')">{{
          t('tutor.proposal.keep')
        }}</BaseButton>
        <BaseButton variant="primary" :disabled="busy" @tap="$emit('resolve', 'accept')">{{
          t('tutor.proposal.confirm')
        }}</BaseButton>
      </template>
    </view>
    <view v-else class="proposal-resolution" tabindex="-1">
      <LearningActivityGroup
        v-if="status === 'accepted' && ['plan.set', 'profile.set'].includes(proposal.type)"
        :items="[{ id: 'accepted', action: plan ? 'applyPlan' : 'applyProfile', status: 'success' }]"
      />
      <text v-else class="proposal-status" role="status">{{
        statusLabels[status] || t(`tutor.proposal.${status}`)
      }}</text>
    </view>
  </BaseCard>
</template>
<script setup>
import '@/i18n/tutor.js';
import { computed } from 'vue';
import { t } from '@/i18n/index.js';
import BaseCard from '@/components/base/base-card/base-card.vue';
import BaseButton from '@/components/base/base-button/base-button.vue';
import LearningChatChoice from './learning-chat-choice.vue';
import LearningActivityGroup from './learning-activity-group.vue';
const props = defineProps({
  proposal: { type: Object, required: true },
  status: { type: String, default: 'pending' },
  busy: Boolean
});
defineEmits(['resolve']);
const planOptions = computed(() => [
  { value: 'accept', label: t('tutor.proposal.adopt') },
  { value: 'dismiss', label: t('tutor.proposal.keep') }
]);
const statusLabels = { kept: '已保留', expired: '已过期', promoted: '已转计划' };
const entryTitle = computed(
  () => ({ Goal: '学习目标', Reminder: '学习提醒', Idea: '想法', Memory: '学习偏好' })[props.proposal.entry?.kind]
);
const entryText = computed(() => {
  const d = props.proposal.data;
  return d.patch
    ? Object.entries(d.patch)
        .filter(([, v]) => v != null)
        .map(
          ([k, v]) =>
            `${{ goal: '目标', category: '方向', exam: '考试', subjects: '科目', minutes: '每日分钟', deadline: '目标日期', foundation: '基础' }[k] || k}：${Array.isArray(v) ? v.join('、') : v}`
        )
        .join(' · ')
    : d.schedule
      ? `${d.schedule.date || '每周'} ${d.schedule.time} ${d.schedule.timezone}`
      : d.text ||
        d.value ||
        {
          'goal.pause': '暂停目标',
          'goal.resume': '继续目标',
          'goal.reopen': '重开目标',
          'goal.close': d.status === 'archived' ? '归档目标' : '完成目标',
          'profile.retract': '撤回学习偏好',
          'reminder.complete': '完成提醒',
          'reminder.cancel': '取消提醒'
        }[props.proposal.type] ||
        d.action;
});
const plan = computed(() => props.proposal.type === 'plan.set');
</script>
<style scoped>
.proposal-card {
  max-width: 680px;
  width: 100%;
}
.proposal-row,
.proposal-actions {
  display: flex;
  align-items: center;
  gap: var(--s-3);
}
.proposal-heading {
  display: block;
  color: var(--violet-ink);
  font-size: var(--size-title-3);
  margin-bottom: var(--s-4);
}
.proposal-row {
  padding-block: var(--s-3);
  justify-content: space-between;
  overflow-wrap: anywhere;
}
.proposal-task {
  justify-content: flex-start;
  align-items: flex-start;
}
.proposal-task-title {
  flex: 1;
  min-width: 0;
  line-height: var(--leading-body);
}
.proposal-reason,
.proposal-status {
  display: block;
  color: var(--ink-3);
  line-height: var(--leading-body);
}
.proposal-actions {
  justify-content: flex-end;
  margin-top: var(--s-5);
  flex-wrap: wrap;
}
</style>
