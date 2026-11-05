<template>
  <view class="entry-board" data-test="conversation-entries">
    <view v-if="pending.length" class="entry-section">
      <text class="entry-heading">待确认 · {{ pending.length }}</text>
      <view v-for="item in pending" :key="item.id" class="entry-card">
        <text class="entry-label">{{ labels[item.proposal.entry.kind] }}</text>
        <text class="entry-text">{{ describe(item.proposal) }}</text>
        <view class="entry-actions">
          <BaseButton variant="quiet" :disabled="learning.busy" @tap="resolve(item, false)">忽略</BaseButton>
          <BaseButton variant="primary" :disabled="learning.busy" @tap="resolve(item, true)">确认保存</BaseButton>
          <BaseButton variant="quiet" @tap="source(item.conversationId, item.proposal.sourceRefs)">查看来源</BaseButton>
        </view>
      </view>
    </view>
    <view class="entry-tabs" role="tablist" aria-label="学习记录类型">
      <BaseButton
        v-for="(label, kind) in labels"
        :key="kind"
        :variant="selected === kind ? 'primary' : 'quiet'"
        role="tab"
        :aria-selected="selected === kind"
        @tap="selected = kind"
        >{{ label }}</BaseButton
      >
    </view>
    <view v-for="item in visible" :key="item.id" class="entry-card entry-row">
      <BaseIcon
        :name="
          selected === 'Goal'
            ? 'checkbox-off'
            : selected === 'Reminder'
              ? 'calendar'
              : selected === 'Idea'
                ? 'bulb'
                : 'book-open'
        "
        size="18px"
      />
      <view class="entry-copy"
        ><view class="entry-top"
          ><text class="entry-text">{{ item.text }}</text
          ><text class="entry-label">{{ statuses[item.status] }}</text></view
        >
        <text v-if="selected === 'Memory'" class="entry-label">用户确认 · {{ item.field }}</text>
        <text v-if="selected === 'Reminder'" class="entry-label">已保存 · 通知送达未确认</text>
        <BaseButton
          v-if="selected === 'Goal' && item.status === 'paused'"
          variant="quiet"
          data-test="goal-lifecycle"
          :disabled="learning.busy"
          @tap="continueGoal(item)"
          >继续目标</BaseButton
        ></view
      >
      <BaseButton
        variant="quiet"
        icon="arrow-right"
        icon-only
        label="查看来源"
        @tap="source(item.conversationId, item.sourceRefs)"
      />
    </view>
    <text v-if="!visible.length" class="entry-label">暂无{{ labels[selected] }}</text>
    <BaseButton variant="quiet" :aria-expanded="history" @tap="history = !history"
      >{{ history ? '收起历史' : '查看历史' }} · {{ archived.length }}</BaseButton
    >
    <view v-if="history" class="entry-section">
      <view v-for="item in archived" :key="item.id" class="entry-card"
        ><text class="entry-text">{{ item.text }}</text
        ><text class="entry-label">{{ statuses[item.status] }}</text
        ><view class="entry-actions"
          ><BaseButton
            v-if="selected === 'Goal' && ['completed', 'archived'].includes(item.status)"
            variant="quiet"
            data-test="goal-lifecycle"
            :disabled="learning.busy"
            @tap="continueGoal(item)"
            >重开目标</BaseButton
          ><BaseButton variant="quiet" @tap="source(item.conversationId, item.sourceRefs)">查看来源</BaseButton></view
        ></view
      >
      <view v-for="plan in unclassified" :key="plan.id" class="entry-card"
        ><text class="entry-label">未归类计划 · {{ plan.day }}</text
        ><text v-for="task in plan.tasks" :key="task.id" class="entry-text">{{ task.title }}</text></view
      >
    </view>
    <text v-if="error" class="entry-error" role="status">{{ error }}</text>
  </view>
</template>
<script setup>
import { computed, ref } from 'vue';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseIcon from '@/components/base/base-icon/base-icon.vue';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { entryObjects } from '../../../../laf-backend/functions/_shared/learning-entries.js';
import { proposalStatus } from '../../../../laf-backend/functions/_shared/learning-proposals.js';
import { workspaceConversationContext } from '@/services/learning/workspace-context.js';
import { safeNavigateTo } from '@/utils/safe-navigate.js';
const learning = useConversationLearningStore(),
  context = workspaceConversationContext(learning);
const selected = ref('Goal'),
  history = ref(false),
  error = ref('');
const labels = { Goal: '目标', Reminder: '提醒', Idea: '想法', Memory: '记忆' };
const statuses = {
  pending: '待确认',
  active: '进行中',
  paused: '已暂停',
  completed: '已完成',
  archived: '已归档',
  cancelled: '已取消',
  kept: '已保留',
  dismissed: '已忽略',
  expired: '已过期',
  promoted: '已转计划',
  retracted: '已撤回',
  superseded: '已替代'
};
const ids = computed(() => new Set(context.state.value.conversations.map((c) => c.id)));
const all = computed(() =>
  entryObjects(learning.state, selected.value, learning.calendarTime)
    .filter((e) => ids.value.has(e.conversationId))
    .map((item) => ({ ...item, recordContext: learning.recordContext() }))
);
const visible = computed(() => all.value.filter((e) => ['active', 'paused', 'kept'].includes(e.status)));
const archived = computed(() => all.value.filter((e) => !['active', 'paused', 'kept', 'pending'].includes(e.status)));
const unclassified = computed(() =>
  context.id.value === 'all' || context.id.value === 'unclassified'
    ? learning.state.plans.filter((p) => !p.conversationId)
    : []
);
const pending = computed(() =>
  context.state.value.conversations.flatMap((c) =>
    c.messages
      .filter((m) => m.proposal?.entry && proposalStatus(learning.state, m.id, learning.calendarTime) === 'pending')
      .map((m) => ({ ...m, conversationId: c.id }))
  )
);
function describe(p) {
  const d = p.data;
  if (d.schedule) return `${d.schedule.date || '每周'} ${d.schedule.time} ${d.schedule.timezone}`;
  if (d.patch)
    return [
      d.patch.goal,
      d.patch.deadline,
      d.patch.minutes == null ? null : `每天${d.patch.minutes}分钟`,
      d.patch.foundation
    ]
      .filter(Boolean)
      .join(' · ');
  return (
    d.text ||
    d.value ||
    {
      'goal.pause': '暂停目标',
      'goal.resume': '继续目标',
      'goal.close': d.status === 'archived' ? '归档目标' : '完成目标（用户声明）',
      'goal.reopen': '重开目标',
      'profile.retract': '撤回学习偏好',
      'reminder.complete': '完成提醒',
      'reminder.cancel': '取消提醒'
    }[p.type] ||
    statuses[d.action] ||
    '更新记录'
  );
}
function resolve(item, accept) {
  try {
    error.value = '';
    const c = learning.state.conversations.find((c) => c.id === item.conversationId);
    const current = c?.messages.find((m) => m.id === item.id);
    if (current !== undefined && proposalStatus(learning.state, item.id, learning.calendarTime) === 'pending') {
      if (accept)
        learning.commit(
          current.proposal.type,
          { ...current.proposal.data, proposalId: item.id, explicit: true },
          `${item.id}:accept`
        );
      else
        learning.commit(
          'message.add',
          { conversationId: c.id, role: 'notice', content: '已忽略建议。' },
          `${item.id}:dismiss`
        );
    }
  } catch (e) {
    error.value = e.message;
  }
}
function continueGoal(item) {
  if (learning.busy) return;
  try {
    error.value = '';
    learning.refresh();
    const current = entryObjects(learning.state, 'Goal', learning.calendarTime).find((entry) => entry.id === item.id);
    if (
      selected.value !== 'Goal' ||
      !item.recordContext ||
      item.recordContext !== learning.recordContext() ||
      current?.conversationId !== item.conversationId ||
      current?.basis !== item.basis ||
      current?.status !== item.status ||
      !['paused', 'completed', 'archived'].includes(item.status)
    ) {
      error.value = '目标状态已变化，请重新读取。';
      return;
    }
    learning.commit(item.status === 'paused' ? 'goal.resume' : 'goal.reopen', {
      conversationId: current.conversationId,
      explicit: true
    });
  } catch (e) {
    error.value = e.message;
  }
}
function source(conversationId, refs) {
  const c = learning.state.conversations.find((c) => c.id === conversationId);
  if (!c) {
    error.value = '来源不可用';
    return;
  }
  const messageId = refs?.find((r) => c.messages.some((m) => m.id === r.messageId))?.messageId;
  learning.locateConversation(conversationId, null, null, messageId);
  safeNavigateTo('/pages/learning/index');
}
</script>
<style scoped>
.entry-board,
.entry-section {
  display: grid;
  gap: 12px;
  min-width: 0;
}
.entry-board {
  margin-bottom: 0;
  row-gap: 4px;
}
.entry-tabs,
.entry-actions,
.entry-top {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.entry-top {
  justify-content: space-between;
}
.entry-card {
  display: grid;
  gap: 6px;
  padding: 8px 0;
  min-width: 0;
}
.entry-row {
  display: flex;
  padding: 0;
  min-height: 44px;
  align-items: center;
  gap: 12px;
}
.entry-row > .base-icon {
  flex: none;
  margin-top: 3px;
}
.entry-copy {
  flex: 1;
  min-width: 0;
}
.entry-row > .base-button {
  flex: none;
}
.entry-board .entry-tabs .base-button {
  background: transparent;
  box-shadow: none;
  color: var(--ink-3);
}
.entry-board .entry-tabs .base-button[aria-selected='true'] {
  color: var(--blue);
}
.entry-heading {
  font-size: 18px;
  font-weight: 600;
}
.entry-top .entry-text {
  flex: 1;
  min-width: 0;
}
.entry-text {
  font-size: 14px;
  overflow-wrap: anywhere;
  line-height: 1.55;
}
.entry-label {
  color: var(--ink-3);
  font-size: 13px;
}
.entry-error {
  color: var(--danger);
}
</style>
