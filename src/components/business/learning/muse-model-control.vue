<template>
  <view class="model-control" aria-label="当前 AI 连接">
    <text v-if="current" class="model-current">{{ current.provider }} · {{ current.model || '请选择型号' }}</text>
    <BaseInput
      v-if="choices.length"
      :model-value="learning.modelId"
      label="切换 AI 连接"
      hide-label
      placeholder="选择连接"
      :options="choices"
      :disabled="locked"
      @update:model-value="select"
    />
    <BaseButton v-if="!needsConnectionPrompt" variant="quiet" :disabled="locked" @tap="$emit('connect')"
      >AI 连接器</BaseButton
    >
    <text v-if="current?.connectionStatus === 'failed'" class="model-unavailable" role="status">{{
      modelErrorPresentation({ error: current.lastError }).message
    }}</text>
    <BaseCheckbox v-if="current" :model-value="learning.sharingAllowed" :disabled="locked" @update:model-value="share"
      >同意共享本次原答和必要资料片段</BaseCheckbox
    >
    <MuseModelFeedback
      v-if="failure || learning.modelListState?.selectionError || needsConnectionPrompt"
      :failure="failure || { error: learning.modelListState?.selectionError || 'NEEDS_CONNECTION' }"
      :busy="locked"
      @action="$emit('connect')"
    />
  </view>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { modelErrorPresentation } from '../../../../laf-backend/functions/_shared/model-errors.js';
import BaseInput from '@/components/base/base-input/base-input.vue';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseCheckbox from '@/components/base/base-checkbox/base-checkbox.vue';
import MuseModelFeedback from './muse-model-feedback.vue';
defineEmits(['connect']);
const learning = useConversationLearningStore(),
  failure = ref(null),
  saving = ref(false);
let operation = 0;
watch(
  () => learning.recordContext(),
  () => {
    operation++;
    failure.value = null;
    saving.value = false;
  },
  { flush: 'sync' }
);
const locked = computed(() => saving.value || learning.busy || learning.intakeBusy);
const needsConnectionPrompt = computed(
  () => learning.needsConnection && !['loading', 'error'].includes(learning.modelListState?.phase)
);
const current = computed(() =>
  learning.models.find((model) => model.id === learning.modelId && model.source === 'byok')
);
const choices = computed(() =>
  learning.models
    .filter(
      (model) =>
        model.source === 'byok' &&
        model.configured &&
        !model.requiresModelSelection &&
        model.capabilityCheck?.version === 1 &&
        model.capabilityCheck.tools === true &&
        model.capabilityCheck.structured === true
    )
    .map((model) => ({
      value: model.id,
      label: `${model.provider} · ${model.model}${model.connectionStatus === 'failed' ? '（上次请求失败）' : ''}`
    }))
);
async function change(action) {
  if (locked.value) return;
  const context = learning.recordContext(),
    currentOperation = ++operation;
  saving.value = true;
  failure.value = null;
  try {
    const result = await action();
    if (context === learning.recordContext() && result?.success === false) failure.value = result;
  } catch (error) {
    if (context === learning.recordContext()) failure.value = { error: error.code || 'MODEL_FAILED' };
  } finally {
    if (currentOperation === operation) saving.value = false;
  }
}
function select(id) {
  return change(() => learning.selectModel(id));
}
function share(allowed) {
  return change(() => learning.setSharingAllowed(allowed));
}
</script>
<style scoped>
.model-control {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  min-width: 0;
  margin: 8px 0 16px;
  font-size: 12px;
  color: var(--ink-2);
}
.model-current,
.model-unavailable {
  flex-basis: 100%;
  overflow-wrap: anywhere;
}
.model-control :deep(.base-field) {
  flex: 1 1 180px;
  min-width: 0;
  max-width: 100%;
}
.model-control :deep(.base-field__input) {
  max-width: 100%;
  text-overflow: ellipsis;
}
.model-control :deep(.base-checkbox),
.model-control :deep(.model-feedback) {
  flex-basis: 100%;
}
</style>
