<template>
  <view
    v-if="visible"
    class="model-feedback"
    :class="{ 'is-guide': presentation.code === 'NEEDS_CONNECTION' }"
    :role="
      presentation.code === 'NEEDS_CONNECTION' || ['running', 'succeeded'].includes(state.phase) ? 'status' : 'alert'
    "
    aria-live="polite"
  >
    <text>{{
      state.phase === 'running'
        ? '正在处理，请稍候…'
        : state.phase === 'succeeded' && !failure
          ? '已收到结果'
          : presentation.message
    }}</text>
    <BaseButton
      v-if="(failure || state.phase === 'failed') && presentation.action"
      variant="quiet"
      :disabled="busy"
      @tap="$emit('action', presentation.action)"
      >{{ labels[presentation.action.type] || '查看连接' }}</BaseButton
    >
  </view>
</template>
<script setup>
import { computed } from 'vue';
import { modelErrorPresentation } from '../../../../laf-backend/functions/_shared/model-errors.js';
import BaseButton from '@/components/base/base-button/base-button.vue';
const props = defineProps({
  failure: { type: [Object, String], default: null },
  state: { type: Object, default: () => ({}) },
  busy: Boolean
});
defineEmits(['action']);
const labels = {
  open_connectors: '打开 AI 连接器',
  query_result: '查询原请求',
  retry: '重新评估',
  manual_model: '手填型号'
};
const visible = computed(() => props.failure || ['running', 'succeeded', 'failed'].includes(props.state.phase));
const presentation = computed(() => {
  const failure =
    typeof props.failure === 'string'
      ? { error: props.failure }
      : props.failure || { error: props.state.errorCode, status: props.state.status };
  return modelErrorPresentation({ ...failure, retryAllowed: props.state.operation === 'requestCoach' });
});
</script>
<style scoped>
.model-feedback {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--ink-2);
  overflow-wrap: anywhere;
}
.model-feedback .base-button {
  min-height: 44px;
}
.is-guide {
  color: var(--blue);
}
</style>
