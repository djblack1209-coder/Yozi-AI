<template>
  <view v-if="!intake?.acceptedConversationId" class="model-intake" aria-live="polite">
    <view v-if="!intake && !emptyGreeting" class="intake-agent">
      <text>连接自己的 API 后，告诉我你想学什么。</text>
      <BaseButton
        v-if="learning.modelId && !learning.needsConnection"
        variant="primary"
        :disabled="learning.intakeBusy || !learning.sharingAllowed"
        @tap="act(() => learning.beginModelIntake(learning.modelId, { newGoal }))"
        >开始建档</BaseButton
      >
    </view>
    <template v-for="(turn, index) in intake?.turns || []" :key="index">
      <BaseBubble avatar
        ><text selectable>{{ turn.question }}</text></BaseBubble
      >
      <BaseBubble author="user" avatar :avatar-src="userAvatar"
        ><text selectable>{{ turn.answer }}</text></BaseBubble
      >
    </template>
    <BaseBubble
      v-if="(intake?.status === 'ready' && reply) || learning.reply?.kind === 'intake' || learning.intakeBusy"
      avatar
      class="intake-reply"
      :data-reply-pending="learning.intakeBusy || learning.reply?.pending ? 'true' : undefined"
      :avatar-identity="learning.reply?.id || intake?.requestId || 'intake'"
      :avatar-business="{ busy: learning.intakeBusy || !!learning.reply?.pending, producing: false }"
    >
      <LearningMessage
        pending-label="正在等待回复…"
        :pending="learning.intakeBusy || !!learning.reply?.pending"
        :content="intake?.status === 'ready' ? reply?.message : ''"
      />
      <template v-if="intake?.status === 'ready' && reply">
        <template v-if="proposal">
          <view class="intake-profile">
            <text>{{ proposal.goal }}</text>
            <text v-if="proposal.subjects.length">{{ proposal.subjects.join(' · ') }}</text>
            <text v-if="proposal.examScope">{{ examScopeLabel(proposal.examScope) }}</text>
            <text v-if="proposal.minutes">每天 {{ proposal.minutes }} 分钟</text>
            <text v-if="proposal.deadline">{{ proposal.deadline }}</text>
            <text v-if="proposal.foundation">{{ proposal.foundation }}</text>
          </view>
          <BaseButton variant="primary" :disabled="learning.intakeBusy" @tap="accept">确认目标</BaseButton>
          <BaseButton variant="quiet" @tap="editing = !editing">修改回答</BaseButton>
          <template v-if="editing"
            ><BaseInput
              v-if="!sharedInput"
              v-model="input"
              label="修改回答"
              hide-label
              placeholder="输入你的调整"
              maxlength="500"
            /><BaseButton
              variant="primary"
              :disabled="!input.trim() || learning.intakeBusy"
              @tap="act(() => learning.answerModelIntake(input.trim()))"
              >发送</BaseButton
            ></template
          >
        </template>
        <BaseButton v-else-if="intakeFinished(intake)" variant="quiet" @tap="act(() => learning.restartModelIntake())"
          >重新选择方向</BaseButton
        >
        <template v-else>
          <BaseOptions
            v-if="reply.intake.options.length"
            v-model="choice"
            :class="{ 'intake-capsules': intake.contract === MODEL_INTAKE_V2_CONTRACT }"
            :label="reply.message"
            :options="reply.intake.options"
            :disabled="learning.intakeBusy"
          />
          <BaseInput
            v-if="!sharedInput && reply.intake.input && (!reply.intake.options.length || choice === 'other')"
            v-model="input"
            label="你的回答"
            hide-label
            placeholder="输入你的回答"
            maxlength="500"
          />
          <BaseButton variant="primary" :disabled="learning.intakeBusy || !answer" @tap="submit">发送</BaseButton>
          <BaseButton
            v-if="!reply.intake.options.some((item) => /尚未确定|不确定|跳过/.test(item.label))"
            variant="quiet"
            :disabled="learning.intakeBusy"
            @tap="act(() => learning.answerModelIntake('跳过'))"
            >跳过</BaseButton
          >
        </template>
      </template>
    </BaseBubble>
    <view
      v-if="!learning.intakeBusy && !learning.reply?.pending && ['pending', 'failed'].includes(intake?.status)"
      class="intake-agent"
    >
      <text role="status">{{
        learning.intakeError ||
        modelErrorPresentation({
          error: learning.retryState?.errorCode || 'INTAKE_INVALID',
          status: intake?.finalFailure ? 'failed' : 'pending'
        }).message
      }}</text>
      <text selectable>请求编号：{{ intake.requestId }}</text>
      <template v-if="intake.finalFailure">
        <BaseButton variant="quiet" @tap="act(() => learning.restartModelIntake())">重新建档</BaseButton>
        <BaseButton variant="quiet" @tap="act(() => learning.restartModelIntake({ newGoal: true }))"
          >重新选择方向</BaseButton
        >
      </template>
      <BaseButton v-else variant="quiet" @tap="recover">查询原请求</BaseButton>
    </view>
    <MuseModelFeedback :failure="failure" :busy="learning.intakeBusy" @action="handleAction" />
  </view>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseInput from '@/components/base/base-input/base-input.vue';
import BaseOptions from '@/components/base/base-options/base-options.vue';
import BaseBubble from '@/components/base/base-bubble/base-bubble.vue';
import LearningMessage from '@/pages/learning/components/learning-message.vue';
import MuseModelFeedback from './muse-model-feedback.vue';
import { modelErrorPresentation } from '../../../../laf-backend/functions/_shared/model-errors.js';
import { safeNavigateTo } from '@/utils/safe-navigate.js';
import { studentAvatar } from '@/services/learning/shell-navigation.js';
import { intakeFinished, MODEL_INTAKE_V2_CONTRACT } from '../../../../laf-backend/functions/_shared/learning-intake.js';
import { examScopeLabel } from '../../../../laf-backend/functions/_shared/learning-exam-scope.js';
const props = defineProps({
  sharedInput: Boolean,
  emptyGreeting: Boolean,
  newGoal: Boolean,
  autoOpen: Boolean,
  modelValue: { type: String, default: '' }
});
const emit = defineEmits(['accepted', 'update:modelValue']);
const learning = useConversationLearningStore();
const userAvatar = computed(() => studentAvatar(learning.state.owner));
const editing = ref(false);
const choice = ref(''),
  localInput = ref(''),
  failure = ref(null);
const input = computed({
  get: () => (props.sharedInput ? props.modelValue : localInput.value),
  set: (value) => (props.sharedInput ? emit('update:modelValue', value) : (localInput.value = value))
});
const intake = computed(() =>
  props.newGoal && learning.state.intake?.acceptedConversationId ? null : learning.state.intake
);
const reply = computed(() => intake.value?.reply);
const proposal = computed(() => reply.value?.intake.profile);
const answer = computed(() =>
  choice.value === 'other' || !reply.value?.intake.options.length
    ? input.value.trim()
    : reply.value.intake.options.find((item) => item.value === choice.value)?.label || ''
);
watch(
  () => intake.value?.requestId,
  () => {
    editing.value = false;
    choice.value = '';
    // The shared composer owns its draft and clears only a confirmed, unchanged
    // submission. A new request id must not erase typing during model intake.
    if (!props.sharedInput) input.value = '';
    failure.value = null;
  }
);
function failureState(value) {
  failure.value = value;
}
async function act(action) {
  const context = learning.recordContext(),
    previous = learning.reply?.operationId;
  let operation;
  const current = () =>
    context === learning.recordContext() &&
    (!operation || (learning.reply?.operationId === operation && !learning.reply.cancelled));
  failure.value = null;
  try {
    const pending = action();
    operation = learning.reply?.operationId !== previous ? learning.reply?.operationId : null;
    const result = await pending;
    if (!current()) return result;
    if (result?.success === false) failure.value = result;
    return result;
  } catch (failure) {
    if (!current()) return;
    failureState({ error: failure.code || 'MODEL_FAILED' });
  }
}
function submit() {
  if (answer.value) return act(() => learning.answerModelIntake(answer.value));
}
let openingKey = null;
watch(
  () => [
    props.autoOpen,
    learning.modelId,
    learning.sharingAllowed,
    learning.needsConnection,
    learning.active,
    intake.value,
    learning.intakeBusy,
    learning.busy,
    props.autoOpen ? learning.recordContext() : null
  ],
  () => {
    if (
      !props.autoOpen ||
      intake.value ||
      !learning.modelId ||
      !learning.sharingAllowed ||
      learning.needsConnection ||
      learning.active ||
      learning.intakeBusy ||
      learning.busy
    )
      return;
    const key = JSON.stringify([learning.recordContext(), learning.modelId]);
    if (key === openingKey) return;
    openingKey = key;
    void act(() => learning.beginModelIntake(learning.modelId, { newGoal: props.newGoal }));
  },
  { immediate: true }
);
async function submitDraft() {
  if (!intake.value) {
    const raw = input.value.trim(),
      context = learning.recordContext();
    if (!raw) return;
    if (!learning.modelId) {
      failure.value = { error: 'NEEDS_CONNECTION' };
      return;
    }
    if (!learning.sharingAllowed) {
      failure.value = { error: 'CONSENT_REQUIRED' };
      return;
    }
    const started = await act(() => learning.beginModelIntake(learning.modelId, { newGoal: props.newGoal }));
    if (context !== learning.recordContext()) return;
    if (started?.success) return act(() => learning.answerModelIntake(raw));
    if (!input.value) input.value = raw;
    return;
  }
  if (intakeFinished(intake.value) && !proposal.value) return;
  if (proposal.value) {
    if ((editing.value || props.sharedInput) && input.value.trim())
      return act(() => learning.answerModelIntake(input.value.trim()));
    return;
  }
  // Both option confirmation and free text use the existing intake action.
  // The dock text is an explicit answer when the student types instead of choosing.
  if (props.sharedInput && input.value.trim()) return act(() => learning.answerModelIntake(input.value.trim()));
  return submit();
}
defineExpose({ submitDraft });
function handleAction(action) {
  if (action.type === 'open_connectors' || action.type === 'manual_model')
    return safeNavigateTo(learning.openModelConnector().route);
  if (action.type === 'retry' && intake.value?.finalFailure) return act(() => learning.restartModelIntake());
  if (action.type === 'query_result' && intake.value) return recover();
}
function recover() {
  return act(() => learning.recoverModelIntake());
}
function accept() {
  return act(() => {
    const conversation = learning.acceptModelIntake();
    emit('accepted', conversation);
  });
}
</script>
<style scoped>
.intake-capsules {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}
.intake-capsules :deep(.base-option) {
  width: auto;
  min-height: 44px;
  flex: none;
  border-radius: var(--r-pill);
  padding: var(--s-2) var(--s-4);
}
.intake-capsules :deep(.base-option__key) {
  display: none;
}
.intake-capsules :deep(.base-option__label) {
  flex: none;
}
.model-intake {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 680px;
  margin: 0 auto;
  width: 100%;
}
.intake-agent {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 20px;
  line-height: 1.6;
  color: var(--ink);
}
.intake-question {
  font-size: 20px;
  font-weight: 500;
}
.intake-agent :deep(.base-options) {
  width: 100%;
}
.intake-agent :deep(.base-input) {
  width: 100%;
}
.intake-user {
  align-self: flex-end;
  max-width: 85%;
  background: var(--paper-sunk);
  border: 1px solid var(--line);
  border-radius: 20px 20px 4px 20px;
  padding: 10px 16px;
  line-height: 1.6;
}
.intake-reply :deep(.base-bubble__content) {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 20px;
}
.intake-profile {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-left: 2px solid var(--line-strong);
  padding-left: 18px;
}
.intake-status {
  color: var(--ink-3);
  font-size: 14px;
}
@media (max-width: 600px) {
  .intake-question {
    font-size: 18px;
  }
}
</style>
