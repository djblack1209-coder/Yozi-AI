<template>
  <BaseCard v-if="item" class="coach-error-review" data-test="coach-error-review">
    <text class="review-title">待重练 {{ pending.length }} 项</text>
    <text>{{ item.labels.join('、') }}</text>
    <text class="review-source">{{ item.sourceDay }} · AI 评估</text>
    <text selectable>{{ item.prompt }}</text>
    <template v-if="editing || item.latestAttempt">
      <template v-if="referenceShown || (item.latestAttempt && !item.latestAttempt.feedback)">
        <text class="review-source">上次原答</text>
        <text selectable>{{ item.original }}</text>
      </template>
      <BaseButton v-else variant="quiet" @tap="referenceShown = true">查看上次原答</BaseButton>
      <template v-if="item.latestAttempt && !item.latestAttempt.feedback">
        <text class="review-source">重练原答已保存</text>
        <text selectable>{{ item.latestAttempt.answer }}</text>
        <BaseButton :disabled="learning.busy || !canRequest" @tap="assess">{{ requestLabel }}</BaseButton>
      </template>
      <template v-else>
        <MuseFeedbackCard
          v-if="referenceShown && item.latestAttempt?.feedback"
          :feedback="item.latestAttempt.feedback"
          :adoptable="false"
          :disabled="learning.busy"
        />
        <BaseInput v-model="answer" label="重练答案" multiline :maxlength="4000" :disabled="learning.busy" />
        <BaseButton variant="primary" :disabled="learning.busy || !answer.trim()" @tap="submit">提交重练</BaseButton>
      </template>
    </template>
    <BaseButton v-else variant="secondary" :disabled="learning.busy" @tap="editing = true">开始重练</BaseButton>
    <BaseButton v-if="pending.length > 1" variant="quiet" :disabled="learning.busy" @tap="next">下一项</BaseButton>
    <text v-if="message" role="status">{{ message }}</text>
  </BaseCard>
  <text v-else-if="message" role="status">{{ message }}</text>
  <text v-if="recentRecall" class="review-source" role="status"
    >{{ recallLabels[recentRecall.rating] }} · 下次复习 {{ dayKey(recentRecall.due, learning.state.timezone) }}</text
  >
</template>
<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import BaseCard from '@/components/base/base-card/base-card.vue';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseInput from '@/components/base/base-input/base-input.vue';
import MuseFeedbackCard from './muse-feedback-card.vue';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { workspaceDrafts } from '@/services/learning/workspace-drafts.js';
import {
  COACH_RECALL_CONTRACT,
  coachErrorReviews
} from '../../../../laf-backend/functions/_shared/learning-coach-review.js';
import { assert, dayKey } from '@/services/learning/learning-domain.js';
import { publicError } from '@/i18n/index.js';

const props = defineProps({ conversationId: { type: String, required: true } });
const learning = useConversationLearningStore();
const selected = ref(null),
  editing = ref(false),
  referenceShown = ref(false),
  answer = ref(''),
  message = ref('');
const reviews = computed(() => {
  // State writes can occur between minute ticks. Read the actual time for a
  // freshly saved answer, while the shared calendar still wakes idle views.
  void learning.calendarTime;
  const at = Date.now();
  return learning.active?.id === props.conversationId
    ? coachErrorReviews(learning.state, at, props.conversationId)
    : [];
});
const pending = computed(() => reviews.value.filter((row) => !row.completedBy && row.availableAt <= Date.now()));
const recallLabels = { again: '还需复习', hard: '参考后完成', good: '本卡未查看参考，已通过复练' };
const recentRecall = computed(() =>
  reviews.value.reduce(
    (latest, row) => (row.recall && (!latest || row.recall.at > latest.at) ? row.recall : latest),
    null
  )
);
const item = computed(() => {
  const opened = learning.state.events
    .filter((event) => event.type === 'review.open' && event.data.conversationId === props.conversationId)
    .at(-1)?.data.reviewId;
  return (
    pending.value.find((row) => row.id === selected.value || (!selected.value && row.id === opened)) ||
    pending.value[0] ||
    null
  );
});
const originalRequest = computed(() => {
  const id = item.value?.latestAttempt?.id;
  if (!id) return null;
  return learning.active?.coach?.requests.findLast(
    (request) =>
      request.request.target === 'error-review' &&
      request.request.errorReviewId === id &&
      ['pending', 'closed'].includes(request.status)
  );
});
const canRequest = computed(() => originalRequest.value?.status === 'pending' || learning.sharingAllowed);
const requestLabel = computed(() => (originalRequest.value?.status === 'pending' ? '查询原请求结果' : '核对重练答案'));
const drafts = workspaceDrafts(learning);
let binding,
  restoring = false;
function saveDraft() {
  if (binding && !restoring && binding.context === learning.recordContext())
    drafts.save(binding.context, binding.key, { answer: answer.value, referenceShown: referenceShown.value });
}
watch(
  () => JSON.stringify([learning.recordContext(), props.conversationId, item.value?.id]),
  (key) => {
    const [context, conversationId, id] = JSON.parse(key);
    saveDraft();
    restoring = true;
    binding = { context, conversationId, key: `coach-error:${conversationId}:${id || 'none'}` };
    const saved = id ? drafts.read(context, binding.key) : {};
    answer.value = saved.answer || '';
    referenceShown.value = !!saved.referenceShown;
    editing.value = Boolean(answer.value || referenceShown.value);
    message.value = '';
    restoring = false;
  },
  { immediate: true, flush: 'sync' }
);
watch([answer, referenceShown], saveDraft, { flush: 'sync' });
onBeforeUnmount(saveDraft);
function current() {
  assert(
    binding.context === learning.recordContext() && learning.active?.id === props.conversationId,
    'CONTEXT_CHANGED',
    '当前学习已变化，请重新打开'
  );
}
async function assess() {
  try {
    current();
    const context = binding;
    const result = await learning.requestCoach('feedback', 'error-review', originalRequest.value?.id || null);
    if (binding.context === context.context && learning.active?.id === props.conversationId && result?.success)
      message.value = '这次重练已评估，原答保留。';
  } catch (error) {
    message.value = publicError(error);
  }
}
async function submit() {
  try {
    current();
    learning.coachSave('errorAnswer', {
      reviewId: item.value.id,
      answer: answer.value,
      recallContract: COACH_RECALL_CONTRACT,
      referenceShown: referenceShown.value
    });
    answer.value = '';
    referenceShown.value = false;
    drafts.remove(binding.context, binding.key);
    if (learning.sharingAllowed) await assess();
    else message.value = '重练原答已保存，确认共享后可核对反馈。';
  } catch (error) {
    message.value = publicError(error);
  }
}
function next() {
  const index = pending.value.findIndex((row) => row.id === item.value?.id);
  selected.value = pending.value[(index + 1) % pending.value.length]?.id || null;
}
</script>
<style scoped>
.coach-error-review {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.review-title {
  font-size: 18px;
  font-weight: 650;
}
.review-source {
  color: var(--muse-text-secondary, var(--yozi-ink-3));
  font-size: 13px;
}
</style>
