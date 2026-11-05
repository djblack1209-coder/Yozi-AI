<template>
  <view
    v-if="visible || workflow"
    class="model-feedback"
    :class="{ 'is-guide': presentation.code === 'NEEDS_CONNECTION' }"
    :role="
      !visible || presentation.code === 'NEEDS_CONNECTION' || ['running', 'succeeded'].includes(state.phase)
        ? 'status'
        : 'alert'
    "
    aria-live="polite"
  >
    <text v-if="visible">{{
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
    <BaseButton
      v-if="workflow"
      variant="quiet"
      :aria-expanded="expanded"
      data-test="workflow-receipt-toggle"
      @tap="expanded = !expanded"
      >{{ expanded ? '收起分工结果' : '查看分工结果' }}</BaseButton
    >
    <view v-if="workflow && expanded" class="workflow-receipt" data-test="workflow-receipt">
      <text class="workflow-heading">分工结果 · {{ workflow.status === 'complete' ? '已汇总' : '未完成' }}</text>
      <view v-for="task in workflow.tasks" :key="task.id" class="workflow-task">
        <text>{{ task.title }} · {{ statuses[task.status] || '未核对' }}</text>
        <text v-if="task.status === 'completed' && task.message" class="workflow-analysis">{{ task.message }}</text>
        <text v-if="task.status === 'failed'" class="workflow-diagnostic">{{
          diagnosticLabels[task.validationPath] || '具体原因未留存'
        }}</text>
      </view>
      <text>最终汇总 · {{ statuses[workflow.final.status] || '未核对' }}</text>
    </view>
  </view>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import { modelErrorPresentation } from '../../../../laf-backend/functions/_shared/model-errors.js';
import BaseButton from '@/components/base/base-button/base-button.vue';
const props = defineProps({
  failure: { type: [Object, String], default: null },
  state: { type: Object, default: () => ({}) },
  workflow: { type: Object, default: null },
  busy: Boolean
});
defineEmits(['action']);
const expanded = ref(false);
watch(
  () => props.workflow,
  () => (expanded.value = false)
);
const statuses = {
  completed: '已完成',
  failed: '失败，结果未采用',
  cancelled: '已取消',
  unavailable: '结果暂不可用',
  unchecked: '未核对'
};
const diagnosticLabels = {
  'workflow.plan.json': '计划回复不是完整JSON',
  'workflow.plan.root': '计划回复结构不匹配',
  'workflow.plan.tasks': '任务或依赖未通过检查',
  'workflow.agent.json': '回复不是完整JSON',
  'workflow.agent.root': '回复结构不匹配',
  'workflow.agent.message': '分析正文未通过检查',
  'workflow.agent.question': '子任务返回了题目，未采用',
  'workflow.agent.tools': '子任务返回了工具，未执行'
};
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
.workflow-receipt,
.workflow-task {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.workflow-receipt {
  width: 100%;
}
.workflow-heading {
  font-weight: 600;
}
.workflow-analysis {
  white-space: pre-wrap;
}
.workflow-diagnostic {
  color: var(--ink-3);
}
</style>
