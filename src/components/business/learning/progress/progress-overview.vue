<template>
  <view class="progress-overview" aria-label="学习记录">
    <view v-if="model.sources.length" class="progress-sources" role="group" aria-label="AI 评估">
      <BaseButton variant="quiet" :selected="!sourceKey" @tap="selectSource('')">全部</BaseButton>
      <BaseButton
        v-for="source in model.sources"
        :key="keyFor(source)"
        variant="quiet"
        :selected="sourceKey === keyFor(source)"
        @tap="selectSource(keyFor(source))"
        >{{ source.source === 'byok' ? 'BYOK' : source.source === 'unknown' ? '待核对' : '核对'
        }}<template v-if="source.actualModel || source.modelId">
          · {{ source.actualModel || source.modelId }}</template
        ></BaseButton
      >
    </view>
    <view v-for="subject in subjects" :key="subject.id" class="progress-subject">
      <text class="progress-heading" role="heading" aria-level="2">{{ subject.label }}</text>
      <view class="progress-metrics">
        <BaseButton
          v-if="subject.id === 'kaoyan-english-writing' || subject.attainment.denominator"
          class="progress-metric"
          variant="quiet"
          :data-metric="`${subject.id}:attainment`"
          @tap="show(subject.label, subject.attainment)"
        >
          <text class="metric-name">达成本次要求</text><text class="metric-value">{{ value(subject.attainment) }}</text>
          <text class="metric-fraction"
            >AI 评估<template v-if="subject.attainment.status === 'available'">
              · {{ subject.attainment.numerator }} / {{ subject.attainment.denominator }}</template
            ></text
          >
        </BaseButton>
        <BaseButton
          v-if="subject.id !== 'kaoyan-english-writing' || subject.accuracy.denominator"
          class="progress-metric"
          variant="quiet"
          :data-metric="subject.id"
          @tap="show(subject.label, subject.accuracy)"
        >
          <text class="metric-name">正确率</text><text class="metric-value">{{ value(subject.accuracy) }}</text>
          <text v-if="subject.accuracy.status === 'available'" class="metric-fraction"
            >{{ subject.accuracy.numerator }} / {{ subject.accuracy.denominator }}</text
          >
        </BaseButton>
        <BaseButton
          v-for="dimension in subject.dimensions"
          :key="dimension.id"
          class="progress-metric"
          variant="quiet"
          :data-metric="dimension.id"
          @tap="show(dimension.label, dimension)"
        >
          <text class="metric-name">{{ dimension.label }}</text
          ><text class="metric-value">{{ value(dimension) }}</text>
          <text class="metric-fraction"
            >AI 评估<template v-if="dimension.status === 'available'">
              · 达成本次要求 · {{ dimension.numerator }} / {{ dimension.denominator }}</template
            ></text
          >
        </BaseButton>
      </view>
      <view v-if="subject.questionTypes.length" class="progress-types">
        <template v-for="type in subject.questionTypes" :key="type.id">
          <BaseButton
            v-if="type.accuracy.denominator"
            variant="quiet"
            :data-question-type="type.id"
            @tap="show(type.label, type.accuracy)"
            >{{ type.label }} · 正确率 · {{ value(type.accuracy) }}</BaseButton
          >
          <BaseButton
            v-if="type.attainment.denominator"
            variant="quiet"
            :data-question-type="type.id"
            @tap="show(type.label, type.attainment)"
            >{{ type.label }} · 达成本次要求 · {{ value(type.attainment) }}</BaseButton
          >
        </template>
      </view>
    </view>
    <view v-if="expanded" class="progress-trace" role="region" aria-label="学习记录" tabindex="-1">
      <view class="trace-heading"
        ><text>{{ expanded.label }}</text
        ><BaseButton variant="quiet" icon="x" label="关闭" @tap="expanded = null">关闭</BaseButton></view
      >
      <ProgressEvidence :events="expandedEvents" :openable="openable" @open="emit('open', $event)" />
    </view>
  </view>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import BaseButton from '@/components/base/base-button/base-button.vue';
import ProgressEvidence from './progress-evidence.vue';
import { learningModelSourceKey as keyFor } from '../../../../../laf-backend/functions/_shared/learning-model-origin.js';
const props = defineProps({ model: { type: Object, required: true }, openable: { type: Boolean, default: true } });
const emit = defineEmits(['open', 'source']);
const expanded = ref(null),
  sourceKey = ref('');
const subjects = computed(
  () => props.model.sources.find((source) => keyFor(source) === sourceKey.value)?.subjects || props.model.subjects
);
const expandedEvents = computed(() => props.model.evidence.filter((event) => expanded.value?.ids.includes(event.id)));
const value = (metric) => (metric.status === 'insufficient' ? '数据不足' : `${metric.percentage}%`);
const show = (label, metric) => {
  expanded.value = { label, ids: metric.denominatorEventIds };
};
function selectSource(key) {
  sourceKey.value = key;
  expanded.value = null;
  emit('source', key);
}
watch(
  () => props.model.owner,
  () => {
    selectSource('');
  }
);
watch(
  () => props.model.sources,
  (sources) => {
    if (sourceKey.value && !sources.some((source) => keyFor(source) === sourceKey.value)) selectSource('');
  }
);
</script>
<style scoped>
.progress-overview {
  width: 100%;
  min-width: 0;
  color: var(--ink);
}
.progress-sources {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 18px;
}
.progress-sources .base-button {
  max-width: 100%;
  overflow-wrap: anywhere;
  font-size: 12px;
}
.progress-subject + .progress-subject {
  margin-top: 24px;
}
.progress-heading {
  display: block;
  font-size: 16px;
  font-weight: 650;
  margin: 0 0 12px;
}
.progress-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}
.progress-metric.base-button {
  padding: 16px;
  border: 1px solid var(--line-strong);
  background: var(--paper);
  border-radius: 12px;
  text-align: left;
  justify-content: flex-start;
  min-width: 0;
}
.progress-metric :deep(.base-button__content) {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  white-space: normal;
}
.metric-name {
  font-size: 13px;
  color: var(--ink-2);
}
.metric-value {
  font-size: 22px;
  font-weight: 650;
  line-height: 1.4;
}
.metric-fraction {
  color: var(--ink-3);
  font-size: 11px;
  line-height: 1.6;
}
.progress-types {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}
.progress-types .base-button {
  font-size: 12px;
  max-width: 100%;
}
.progress-trace {
  margin-top: 18px;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  padding: 16px;
  background: var(--paper-sunk);
}
.trace-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
}
@media (max-width: 420px) {
  .progress-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .progress-metric.base-button {
    padding: 12px;
  }
  .metric-value {
    font-size: 19px;
  }
}
</style>
