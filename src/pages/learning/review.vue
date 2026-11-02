<template>
  <LearningShell active="plan" :title="$t('pages.review')">
    <template #controls
      ><BaseButton variant="quiet" @tap="safeNavigateTo('/pages/plan/index')">返回计划</BaseButton></template
    >
    <scroll-view scroll-y class="review-scroll">
      <view class="adherence" data-test="review-adherence">
        <text class="heading" role="heading" aria-level="1">先完成一小组</text>
        <view class="goal-options" role="group" aria-label="复习目标">
          <BaseButton
            v-for="goal in goals"
            :key="goal.id"
            variant="secondary"
            :selected="selected === goal.id"
            @tap="selectGoal(goal.id)"
            >{{ goal.text }}</BaseButton
          >
        </view>
        <text v-if="goalProgress" class="subtle"
          >目标复习记录：已完成 {{ goalProgress.numerator }} / {{ goalProgress.denominator ?? '尚无到期记录' }}</text
        >
        <text v-if="batch.returning" class="notice">隔了一段时间，今天先从 {{ batch.limit }} 条开始。</text>
        <template v-if="batch.total">
          <view class="batch-heading"
            ><text>到期 {{ batch.total }} 条 · 本组最多 {{ batch.limit }} 条</text
            ><text class="subtle">其余留到下一组</text></view
          >
          <BaseButton
            v-if="!batch.batchId || batch.batchDone"
            variant="primary"
            data-test="start-review-batch"
            @tap="startBatch"
            >{{ batch.batchDone ? '再来一小组' : `开始这 ${batch.items.length} 条` }}</BaseButton
          >
          <template v-if="batch.batchId && !batch.batchDone">
            <view v-for="item in batch.items" :key="item.id" class="review-item" :data-review-id="item.id">
              <text class="question">{{ prompt(item) }}</text>
              <text class="subtle"
                >{{ dueLabel(item.due) }} 到期<text v-if="item.wrongCount">
                  · 已有 {{ item.wrongCount }} 次错答依据</text
                ></text
              >
              <view class="actions"
                ><BaseButton variant="primary" @tap="openReview(item)">开始复习</BaseButton
                ><BaseButton variant="quiet" @tap="deferId = item.id">稍后再练</BaseButton></view
              >
              <view v-if="deferId === item.id" class="remedy">
                <text>这次的原因（可跳过说明）</text>
                <view class="actions" role="group" aria-label="复习改期原因"
                  ><BaseButton
                    v-for="(label, code) in reasons"
                    :key="code"
                    variant="secondary"
                    :selected="reason === code"
                    @tap="reason = code"
                    >{{ label }}</BaseButton
                  ></view
                >
                <view class="actions"
                  ><BaseButton variant="secondary" @tap="defer(item, 'review.skip')">跳过本次，明天再来</BaseButton
                  ><BaseButton variant="secondary" @tap="defer(item, 'review.reschedule')">改到两天后</BaseButton></view
                >
                <text class="subtle">保存后缩小下一组；不计错，也不清零已完成的记录。</text>
              </view>
            </view>
          </template>
        </template>
        <text v-else class="notice">当前没有到期任务，可以回到对话继续学习。</text>
        <view class="weekly"
          ><text class="heading" role="heading" aria-level="2">本周记录</text
          ><text class="subtle">{{ week.from }} — {{ week.to }} · {{ week.timezone }}</text>
          <view class="weekly-grid"
            ><BaseStat label="完成" :value="week.completed" /><BaseStat label="跳过" :value="week.skipped" /><BaseStat
              label="改期"
              :value="week.rescheduled" /><BaseStat label="离开" :value="week.abandoned"
          /></view>
          <text class="subtle">依从率：暂无完整分母</text
          ><text v-if="Object.keys(week.hours).length" class="subtle"
            >学习时段：{{
              Object.entries(week.hours)
                .map(([h, n]) => `${h}时 ${n}次`)
                .join(' · ')
            }}</text
          >
        </view>
        <BaseButton v-if="suggestion && !ideas.length" variant="secondary" @tap="suggestIdea">查看调整建议</BaseButton>
        <view v-for="idea in ideas" :key="idea.id" class="review-item"
          ><text>{{ idea.text }}</text
          ><text class="subtle">{{
            idea.status === 'pending' ? '待确认 · 不会自动修改目标' : '已保留 · 目标保持原样'
          }}</text
          ><view v-if="idea.status === 'pending'" class="actions"
            ><BaseButton variant="secondary" @tap="resolveIdea(idea, 'keep')">保留想法</BaseButton
            ><BaseButton variant="quiet" @tap="resolveIdea(idea, 'dismiss')">暂不考虑</BaseButton></view
          ></view
        >
        <text v-if="message" role="status" aria-live="polite" :class="failed ? 'error' : 'notice'">{{ message }}</text>
      </view>
    </scroll-view>
  </LearningShell>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import LearningShell from '@/components/business/learning/learning-shell.vue';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseStat from '@/components/base/base-stat/base-stat.vue';
import { useConversationLearningStore, learningId } from '@/stores/modules/conversation-learning.js';
import { entryObjects } from '../../../laf-backend/functions/_shared/learning-entries.js';
import {
  REVIEW_REASONS,
  reviewAdjustmentSuggestion
} from '../../../laf-backend/functions/_shared/learning-adherence.js';
import { reviewBatch, weeklyAdherence } from './learning-adherence-view.js';
import { assert } from '@/services/learning/learning-domain.js';
import { publicError } from '@/i18n/index.js';
import { safeNavigateTo } from '@/utils/safe-navigate.js';
const learning = useConversationLearningStore();
const selected = ref(null),
  now = ref(Date.now()),
  reason = ref('unspecified'),
  deferId = ref(null),
  message = ref(''),
  failed = ref(false);
const reasons = REVIEW_REASONS;
let context = learning.recordContext();
const goals = computed(() => entryObjects(learning.state, 'Goal', now.value).filter((g) => g.status === 'active'));
const options = computed(() => ({ owner: learning.state.owner, conversationId: selected.value || undefined }));
const batch = computed(() => reviewBatch(learning.state, now.value, options.value));
const week = computed(() => weeklyAdherence(learning.state, now.value, options.value));
const goalProgress = computed(() => goals.value.find((g) => g.id === selected.value)?.reviewProgress);
const suggestion = computed(
  () => selected.value && reviewAdjustmentSuggestion(learning.state, selected.value, now.value)
);
const ideas = computed(() =>
  entryObjects(learning.state, 'Idea', now.value).filter(
    (i) => i.conversationId === selected.value && i.evidenceIds && ['pending', 'kept'].includes(i.status)
  )
);
const prompt = (item) =>
  item.kind === 'coach_error'
    ? `${item.labels.join('、')} · ${item.prompt}`
    : item.kind === 'coach'
      ? learning.state.conversations
          .find((c) => c.id === item.conversationId)
          ?.coach?.library.find((i) => i.id === item.itemId)?.text || '句式记录'
      : learning.state.questions.find((q) => `${q.id}@${q.version}` === item.questionKey)?.prompt ||
        '原题已随旧题库下线';
const dueLabel = (at) =>
  new Intl.DateTimeFormat('zh-CN', { timeZone: learning.state.timezone, month: 'numeric', day: 'numeric' }).format(at);
watch(
  () => learning.recordContext(),
  () => {
    context = learning.recordContext();
    selected.value = null;
    deferId.value = null;
    reason.value = 'unspecified';
    message.value = '';
  }
);
function selectGoal(id) {
  selected.value = id;
  deferId.value = null;
  reason.value = 'unspecified';
}
function run(action) {
  try {
    assert(context === learning.recordContext(), 'CONTEXT_CHANGED', '账户或记录已变化，请刷新');
    learning.refresh();
    now.value = Date.now();
    action();
    failed.value = false;
  } catch (error) {
    failed.value = true;
    message.value = publicError(error);
  }
}
function data(questionKey = null) {
  return {
    owner: learning.state.owner,
    source: 'plan',
    conversationId: batch.value.conversationId,
    questionKey,
    reason: null
  };
}
function startBatch() {
  run(() => {
    const candidates = reviewBatch(
      { ...learning.state, events: learning.state.events.filter((e) => e.type !== 'review.batch.start') },
      now.value,
      options.value
    );
    learning.commit(
      'review.batch.start',
      { ...data(), reviewIds: candidates.items.map((r) => r.id) },
      learningId('review_batch')
    );
    message.value = '小批次已保存。';
  });
}
function openReview(item) {
  run(() => {
    if (['coach', 'coach_error'].includes(item.kind)) {
      learning.commit('review.open', { ...data(), reviewId: item.id }, learningId('review_open'));
      learning.selectedConversationId = item.conversationId;
      learning.locateConversation(item.conversationId);
    } else learning.openInsightReview(item.id, context);
    safeNavigateTo('/pages/learning/index');
  });
}
function defer(item, type) {
  run(() => {
    learning.commit(
      type,
      {
        ...data(item.questionKey),
        reviewId: item.id,
        reason: reason.value,
        ...(type === 'review.reschedule' ? { availableAt: now.value + 2 * 86400000 } : {})
      },
      `${batch.value.batchId}:${item.id}:${type === 'review.skip' ? 'skip' : 'move'}`.slice(-160)
    );
    deferId.value = null;
    message.value = '已保存原因与新安排，下一组会更轻。';
  });
}
function suggestIdea() {
  run(() => {
    learning.commit('review.idea.suggest', data(), learningId('review_idea'));
  });
}
function resolveIdea(idea, action) {
  run(() => {
    learning.commit(
      'idea.update',
      { conversationId: idea.conversationId, ideaId: idea.id, action, explicit: true },
      `${idea.id}:${action}`
    );
  });
}
onShow(() => {
  learning.refresh();
  now.value = Date.now();
  selected.value ||= batch.value.conversationId || goals.value[0]?.id || null;
});
</script>
<style scoped>
.review-scroll {
  height: 100%;
  min-height: 0;
}
.adherence {
  width: 100%;
  max-width: 880px;
  box-sizing: border-box;
  padding: 24px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
  color: var(--ink);
}
.heading {
  font-size: 20px;
  font-weight: 600;
}
.goal-options,
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.goal-options {
  overflow-wrap: anywhere;
}
.subtle {
  color: var(--ink-3);
  font-size: 13px;
  line-height: 1.5;
}
.notice,
.error {
  padding: 12px;
  border-radius: 12px;
  background: var(--surface-2);
  font-size: 14px;
}
.error {
  color: var(--danger);
}
.batch-heading,
.review-item,
.weekly {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.review-item,
.weekly {
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface);
  min-width: 0;
}
.question {
  overflow-wrap: anywhere;
  line-height: 1.6;
}
.remedy {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
}
.weekly-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
@media (max-width: 480px) {
  .adherence {
    padding: 16px 12px;
  }
  .review-item,
  .weekly {
    padding: 14px;
  }
  .weekly-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
