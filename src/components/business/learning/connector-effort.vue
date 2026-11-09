<template>
  <view class="connector-effort" :class="{ 'is-max': modelValue === 'max' }" role="group" aria-label="思考强度">
    <view class="connector-effort__head">
      <text class="connector-effort__title">思考强度</text>
      <text class="connector-effort__value">{{ valueLabel }}</text>
    </view>
    <view class="connector-effort__control">
      <view class="connector-effort__track" aria-hidden="true">
        <view class="connector-effort__fill" :style="{ width: fill }" />
      </view>
      <!-- #ifdef H5 -->
      <component
        :is="'input'"
        class="connector-effort__range"
        type="range"
        min="0"
        :max="levels.length - 1"
        step="1"
        :value="index"
        :disabled="disabled"
        aria-label="思考强度"
        :aria-valuetext="valueLabel"
        @input="choose(Number($event.target.value))"
      />
      <!-- #endif -->
      <!-- #ifndef H5 -->
      <slider
        class="connector-effort__native"
        :value="index"
        :max="levels.length - 1"
        :disabled="disabled"
        active-color="transparent"
        background-color="transparent"
        block-color="#5e9ee6"
        :block-size="20"
        :aria-label="`思考强度，${valueLabel}`"
        @changing="choose($event.detail.value)"
        @change="choose($event.detail.value)"
      />
      <!-- #endif -->
    </view>
    <view class="connector-effort__labels" aria-hidden="true">
      <text v-for="level in levels" :key="level" :class="{ 'is-current': levels[index] === level }">{{
        labels[level]
      }}</text>
    </view>
    <view class="connector-effort__actions">
      <BaseButton variant="quiet" :disabled="disabled || modelValue === null" @tap="$emit('update:modelValue', null)"
        >使用默认</BaseButton
      >
      <BaseButton variant="secondary" :disabled="disabled || modelValue === saved" @tap="$emit('save')"
        >保存思考强度</BaseButton
      >
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue';
import BaseButton from '@/components/base/base-button/base-button.vue';

const props = defineProps({
  modelValue: { type: String, default: null },
  levels: { type: Array, required: true },
  saved: { type: String, default: null },
  disabled: Boolean
});
const emit = defineEmits(['update:modelValue', 'save']);
const labels = { low: '低', high: '高', max: '最高' };
const index = computed(() => Math.max(0, props.levels.indexOf(props.modelValue ?? 'high')));
const valueLabel = computed(() =>
  props.modelValue === null ? `默认 · ${labels[props.levels[index.value]]}` : labels[props.modelValue]
);
const fill = computed(() => `${Math.max(5, (100 * index.value) / (props.levels.length - 1))}%`);
function choose(position) {
  emit('update:modelValue', props.levels[position]);
}
</script>

<style scoped>
.connector-effort {
  --effort-start: #78bef4;
  --effort-end: #567ddd;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--muse-raised);
}
.connector-effort__head,
.connector-effort__labels,
.connector-effort__actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.connector-effort__title,
.connector-effort__value {
  color: var(--ink);
  font-size: 14px;
  font-weight: 650;
}
.connector-effort__value {
  color: var(--blue);
  font-size: 13px;
}
.connector-effort__control {
  position: relative;
  display: flex;
  align-items: center;
  height: 44px;
}
.connector-effort__track {
  position: absolute;
  inset: 16px 7px;
  overflow: hidden;
  border-radius: 8px;
  background: repeating-linear-gradient(to right, var(--line) 0 4px, transparent 4px 6px);
  pointer-events: none;
}
.connector-effort__fill {
  position: relative;
  height: 100%;
  background:
    repeating-linear-gradient(to right, transparent 0 4px, var(--muse-raised) 4px 6px),
    linear-gradient(to right, var(--effort-start), var(--effort-end));
  transition: width 150ms cubic-bezier(0.2, 0.8, 0.35, 1);
}
.is-max .connector-effort__fill::after {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 54% 66%, #fff 0 1px, transparent 2px),
    radial-gradient(circle at 70% 28%, #fff 0 1px, transparent 2px),
    radial-gradient(circle at 80% 50%, #fff 0 1px, transparent 2px),
    linear-gradient(100deg, transparent 34%, #c9f2ff9e 66%, transparent 96%);
  content: '';
  animation: effort-spark 600ms ease-out both;
}
@keyframes effort-spark {
  0% {
    transform: translateX(-65%);
    opacity: 0;
  }
  30% {
    opacity: 1;
  }
  100% {
    transform: translateX(35%);
    opacity: 0;
  }
}
.connector-effort__range,
.connector-effort__native {
  position: relative;
  width: 100%;
  margin: 0;
}
.connector-effort__range {
  appearance: none;
  height: 44px;
  background: transparent;
  cursor: pointer;
}
.connector-effort__range:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 2px;
  border-radius: 8px;
}
.connector-effort__range::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 25px;
  border: 1px solid #b9deff;
  border-radius: 6px;
  background: linear-gradient(160deg, #b9deff, var(--effort-end));
  box-shadow: 0 1px 5px #4076c76e;
}
.connector-effort__range::-moz-range-thumb {
  width: 12px;
  height: 23px;
  border: 1px solid #b9deff;
  border-radius: 6px;
  background: linear-gradient(160deg, #b9deff, var(--effort-end));
  box-shadow: 0 1px 5px #4076c76e;
}
.is-max .connector-effort__range::-webkit-slider-thumb {
  animation: effort-flash 460ms ease-out both;
}
@keyframes effort-flash {
  35% {
    box-shadow: 0 0 14px 3px #78bef4b0;
  }
}
.connector-effort__labels {
  color: var(--ink-2);
  font-size: 12px;
}
.connector-effort__labels .is-current {
  color: var(--blue);
  font-weight: 650;
}
.connector-effort__actions {
  flex-wrap: wrap;
  justify-content: flex-end;
  margin-top: 8px;
}
@media (prefers-reduced-motion: reduce) {
  .connector-effort__fill {
    transition: none;
  }
  .is-max .connector-effort__fill::after {
    display: none;
  }
  .is-max .connector-effort__range::-webkit-slider-thumb {
    animation: none;
  }
}
</style>
