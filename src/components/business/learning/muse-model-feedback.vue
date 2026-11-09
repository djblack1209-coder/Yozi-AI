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
    <view :key="resultTone" class="model-feedback__status" :class="resultTone">
      <BaseIcon
        v-if="resultTone"
        class="model-feedback__icon"
        :name="resultTone === 'request-arrival' ? 'check' : 'alert-circle'"
        size="16px"
        aria-hidden="true"
      />
      <text>{{
        state.phase === 'running'
          ? '正在处理，请稍候…'
          : state.phase === 'succeeded' && !failure
            ? '已收到结果'
            : presentation.message
      }}</text>
    </view>
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
import BaseIcon from '@/components/base/base-icon/base-icon.vue';
import '@/styles/request-motion.css';
const props = defineProps({
  failure: { type: [Object, String], default: null },
  state: { type: Object, default: () => ({}) },
  busy: Boolean
});
defineEmits(['action']);
const labels = {
  open_connectors: '打开 AI 连接器',
  query_result: '查询原请求',
  retry_discovery: '重新读取型号',
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
const resultTone = computed(() => {
  if (props.state.phase === 'running' || presentation.value.code === 'NEEDS_CONNECTION') return '';
  if (props.failure || props.state.phase === 'failed') return 'request-failure';
  return props.state.phase === 'succeeded' ? 'request-arrival' : '';
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
.model-feedback__status {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  border-radius: var(--r-sm);
}
.model-feedback__icon {
  flex-shrink: 0;
}
.is-guide {
  color: var(--blue);
}
@media (max-width: 760px) {
  .model-feedback.is-guide {
    align-items: stretch;
    flex-direction: column;
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    background: var(--canvas);
    color: var(--ink);
  }
  .model-feedback.is-guide .base-button:not([disabled]) {
    border-radius: var(--r-sm);
    background: var(--yozi-mobile-action);
    color: var(--yozi-mobile-ink);
  }
}
</style>
