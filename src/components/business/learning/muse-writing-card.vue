<template>
  <view class="muse-writing-card" :class="{ 'is-shared': sharedInput }">
    <view class="writing-head"
      ><text>{{ label }}</text
      ><text class="writing-count">{{ count }} {{ english ? '词' : '字' }}</text></view
    >
    <BaseInput
      v-if="!sharedInput"
      :model-value="modelValue"
      :label="label"
      :placeholder="placeholder"
      :maxlength="maxlength"
      multiline
      hide-label
      :disabled="disabled"
      class="writing-input"
      @update:model-value="$emit('update:modelValue', $event)"
    />
    <view v-if="hint || !sharedInput" class="writing-footer"
      ><text v-if="hint" class="writing-hint">{{ hint }}</text
      ><BaseButton
        v-if="!sharedInput"
        variant="primary"
        :disabled="disabled || !modelValue.trim()"
        @tap="$emit('submit')"
        >{{ submitLabel }}</BaseButton
      ></view
    >
  </view>
</template>
<script setup>
import { computed } from 'vue';
import BaseInput from '@/components/base/base-input/base-input.vue';
import BaseButton from '@/components/base/base-button/base-button.vue';
const props = defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, default: '写下原答' },
  placeholder: { type: String, default: '' },
  hint: { type: String, default: '' },
  submitLabel: { type: String, default: '提交原答' },
  maxlength: { type: Number, default: 3000 },
  english: Boolean,
  sharedInput: Boolean,
  disabled: Boolean
});
defineEmits(['update:modelValue', 'submit']);
const count = computed(() =>
  props.english ? (props.modelValue.trim().match(/\S+/g) || []).length : Array.from(props.modelValue.trim()).length
);
</script>
<style scoped>
.muse-writing-card {
  width: 100%;
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--line-strong);
  border-radius: 16px;
  background: var(--canvas);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.writing-head,
.writing-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.muse-writing-card.is-shared {
  padding: 0;
  border: 0;
  background: transparent;
}
.writing-head {
  font-size: 14px;
  font-weight: 600;
}
.writing-count,
.writing-hint {
  color: var(--ink-3);
  font-size: 12px;
  font-weight: 400;
}
.writing-input {
  width: 100%;
}
.writing-input :deep(.base-field__group) {
  border: 0;
  background: transparent;
  box-shadow: none;
  padding: 0;
}
.writing-input :deep(textarea) {
  min-height: 132px;
  padding: 0;
  font-size: 16px;
  line-height: 1.65;
  caret-color: var(--violet);
}
.muse-writing-card:not(.is-shared):focus-within {
  border-color: var(--focus);
}
.writing-footer {
  justify-content: flex-end;
}
.writing-hint {
  flex: 1;
}
.muse-writing-card :deep(.base-button--primary) {
  background: var(--ink);
  color: var(--canvas);
  border: 0;
  box-shadow: none;
}
.muse-writing-card :deep(.base-button--primary[disabled]) {
  color: var(--ink-3);
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--control-line);
  opacity: 1;
}
</style>
