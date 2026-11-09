<template>
  <BaseCard class="proposal-card" padding="large" data-test="learning-proposal">
    <view class="proposal-heading"
      ><BaseIcon :name="plan ? 'calendar' : 'user'" /><text>{{
        proposal.entry ? entryTitle : t(plan ? 'tutor.proposal.plan' : 'tutor.proposal.profile')
      }}</text></view
    >
    <view v-if="proposal.entry" class="proposal-row"
      ><text>{{ entryTitle }}</text
      ><text>{{ entryText }}</text></view
    >
    <template v-else-if="plan"
      ><text class="proposal-reason">{{ proposal.data.reason }}</text
      ><view v-for="(task, index) in proposal.data.tasks" :key="index" class="proposal-row proposal-task"
        ><BaseIcon name="circle" tone="ink-3" /><text class="proposal-task-title">{{ task.title }}</text></view
      ></template
    >
    <view v-else class="proposal-row"
      ><text>{{ t(`tutor.profile.${proposal.data.field}`) }}</text
      ><text>{{ proposal.data.value }}</text></view
    >
    <view v-if="status === 'pending'" class="proposal-actions">
      <BaseButton
        v-if="plan"
        variant="secondary"
        icon="chevron-down"
        aria-haspopup="dialog"
        :aria-expanded="planSheet"
        :disabled="busy"
        @tap="reviewPlan"
      >{{ t('tutor.proposal.reviewPlan') }}</BaseButton>
      <template v-else>
        <BaseButton variant="quiet" :disabled="busy" @tap="$emit('resolve', 'dismiss')">{{
          t('tutor.proposal.keep')
        }}</BaseButton>
        <BaseButton variant="primary" :disabled="busy" @tap="$emit('resolve', 'accept')">{{
          t('tutor.proposal.confirm')
        }}</BaseButton>
      </template>
    </view>
    <text v-else class="proposal-status" role="status">{{
      statusLabels[status] || t(`tutor.proposal.${status}`)
    }}</text>
    <CustomModal
      v-if="plan && status === 'pending'"
      v-model:visible="planSheet"
      :title="t('tutor.proposal.plan')"
      :is-dark="theme.isDark"
      :confirm-text="t('tutor.proposal.applyChoice')"
      :confirm-disabled="busy || !planChoice"
      position="bottom"
      transition="slide-up"
      container-class="is-choice-sheet"
      initial-focus-selector=".proposal-choice"
      mask-closable
      @confirm="$emit('resolve', planChoice)"
    >
      <view class="proposal-choices" role="group" :aria-label="t('tutor.proposal.plan')">
        <BaseButton
          v-for="option in planOptions"
          :key="option.value"
          class="proposal-choice"
          variant="secondary"
          align="start"
          block
          :icon="planChoice === option.value ? 'check' : 'circle'"
          :selected="planChoice === option.value"
          :aria-pressed="planChoice === option.value"
          :disabled="busy"
          @tap="planChoice = option.value"
        >{{ t(option.label) }}</BaseButton>
      </view>
    </CustomModal>
  </BaseCard>
</template>
<script setup>
import '@/i18n/tutor.js';
import { computed, ref } from 'vue';
import { t } from '@/i18n/index.js';
import { useThemeStore } from '@/stores/modules/theme.js';
import BaseCard from '@/components/base/base-card/base-card.vue';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseIcon from '@/components/base/base-icon/base-icon.vue';
import CustomModal from '@/components/common/CustomModal.vue';
const props = defineProps({
  proposal: { type: Object, required: true },
  status: { type: String, default: 'pending' },
  busy: Boolean
});
defineEmits(['resolve']);
const theme = useThemeStore();
const planSheet = ref(false);
const planChoice = ref('');
const planOptions = [
  { value: 'accept', label: 'tutor.proposal.adopt' },
  { value: 'dismiss', label: 'tutor.proposal.keep' }
];
function reviewPlan() {
  planChoice.value = '';
  planSheet.value = true;
}
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
.proposal-heading,
.proposal-row,
.proposal-actions {
  display: flex;
  align-items: center;
  gap: var(--s-3);
}
.proposal-heading {
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
.proposal-choices {
  display: grid;
  gap: var(--s-2);
}
</style>
