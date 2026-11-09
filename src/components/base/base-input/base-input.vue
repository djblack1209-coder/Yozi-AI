<template>
  <view class="base-field">
    <label v-if="label && !hideLabel" :id="`${id}-label`" :for="id" class="base-field__label">{{ label }}</label>
    <view
      ref="fieldGroup"
      class="base-field__group"
      :class="{
        'is-focused': focused && !focusVisibleOnly,
        'focus-visible-only': focusVisibleOnly,
        'is-keyboard-focused': focused && focusVisibleOnly && keyboardFocus,
        'is-error': error,
        'is-multiline': multiline,
        'is-auto-grow': multiline && autoGrow,
        'is-disabled': disabled,
        'has-numeric-delete-ink': numericDeleteInk
      }"
      :style="autoGrow ? { '--field-max-rows': maxRows } : undefined"
    >
      <!-- #ifdef APP-PLUS -->
      <view
        v-if="numericDeleteInk && hasNativeWebView"
        hidden
        :ink-enabled="numericDeleteInk"
        :change:ink-enabled="numericInkView.attach"
      />
      <!-- #endif -->
      <!-- #ifdef H5 -->
      <component
        :is="'select'"
        v-if="options.length && !nativePlatform"
        :id="id"
        class="base-field__input"
        :value="modelValue"
        :disabled="disabled"
        :aria-label="label"
        :aria-describedby="descriptionId"
        :aria-invalid="Boolean(error)"
        @change="input"
        @focus="focus"
        @blur="blur"
        ><option value="" disabled>{{ placeholder || t('ui.select') }}</option>
        <option v-for="item in options" :key="item.value" :value="item.value">{{ item.label }}</option></component
      >
      <!-- #endif -->
      <!-- #ifndef H5 -->
      <picker
        v-if="options.length && nativePlatform"
        :id="id"
        :aria-label="label"
        mode="selector"
        :range="options"
        range-key="label"
        :value="
          Math.max(
            0,
            options.findIndex((item) => String(item.value) === String(modelValue))
          )
        "
        :disabled="disabled"
        class="base-field__input"
        @change="emit('update:modelValue', options[Number($event.detail.value)]?.value || '')"
        ><view>{{
          options.find((item) => String(item.value) === String(modelValue))?.label || placeholder || t('ui.select')
        }}</view></picker
      >
      <!-- #endif -->
      <text v-if="prefix" class="base-field__prefix">{{ prefix }}</text>
      <!-- #ifdef H5 -->
      <component
        :is="'textarea'"
        v-if="multiline && !nativePlatform"
        :id="id"
        ref="textarea"
        :class="['base-field__input', inputClass]"
        :value="modelValue"
        :rows="autoGrow ? 1 : undefined"
        :autocomplete="autocomplete"
        :disabled="disabled"
        :readonly="readonly"
        :maxlength="maxlength"
        :placeholder="placeholder"
        :aria-label="label"
        :aria-labelledby="label && !hideLabel ? `${id}-label` : undefined"
        :aria-describedby="descriptionId"
        :aria-invalid="Boolean(error)"
        :aria-disabled="disabled"
        data-yozi-answer-input="true"
        @input="input"
        @focus="focus"
        @blur="blur"
      />
      <!-- #endif -->
      <!-- #ifndef H5 -->
      <textarea
        v-if="multiline && nativePlatform"
        :id="id"
        :class="['base-field__input', inputClass]"
        :value="modelValue"
        :style="autoGrow ? nativeGrowingStyle : undefined"
        :disabled="disabled"
        :readonly="readonly"
        :maxlength="maxlength"
        :focus="nativeFocus"
        :placeholder="placeholder"
        :aria-label="label"
        :aria-labelledby="label && !hideLabel ? `${id}-label` : undefined"
        :aria-describedby="descriptionId"
        :aria-invalid="Boolean(error)"
        :aria-disabled="disabled"
        data-yozi-answer-input="true"
        @linechange="lineChange"
        @input="input"
        @focus="focus"
        @blur="blur"
      ></textarea>
      <!-- #endif -->
      <!-- #ifdef H5 -->
      <component
        :is="'input'"
        v-if="!multiline && !nativePlatform && !options.length"
        :id="id"
        :class="['base-field__input', inputClass]"
        :value="modelValue"
        :type="type"
        :inputmode="inputmode"
        :autocomplete="autocomplete"
        :disabled="disabled"
        :readonly="readonly"
        :maxlength="maxlength"
        :placeholder="placeholder"
        :aria-label="label"
        :aria-labelledby="label && !hideLabel ? `${id}-label` : undefined"
        :aria-describedby="descriptionId"
        :aria-invalid="Boolean(error)"
        :aria-disabled="disabled"
        data-yozi-answer-input="true"
        @input="input"
        @focus="focus"
        @blur="blur"
      />
      <!-- #endif -->
      <!-- #ifndef H5 -->
      <input
        v-if="!multiline && nativePlatform && !options.length"
        :id="id"
        :class="['base-field__input', inputClass]"
        :value="modelValue"
        :type="type === 'password' ? 'text' : type"
        :password="type === 'password'"
        :inputmode="inputmode"
        :disabled="disabled"
        :readonly="readonly"
        :maxlength="maxlength"
        :focus="nativeFocus"
        :placeholder="placeholder"
        :aria-label="label"
        :aria-labelledby="label && !hideLabel ? `${id}-label` : undefined"
        :aria-describedby="descriptionId"
        :aria-invalid="Boolean(error)"
        :aria-disabled="disabled"
        data-yozi-answer-input="true"
        @input="input"
        @focus="focus"
        @blur="blur"
      />
      <!-- #endif -->
      <BaseButton
        v-if="verification"
        variant="quiet"
        small
        :disabled="disabled || remaining > 0"
        :label="resendLabel"
        @tap="resend"
        >{{ resendLabel }}</BaseButton
      >
      <slot name="suffix"></slot>
    </view>
    <text
      v-if="help || error"
      :id="`${id}-description`"
      class="base-field__help"
      :class="{ 'is-error': error }"
      :role="error ? 'alert' : undefined"
      >{{ error || help }}</text
    >
  </view>
</template>
<script setup>
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, onUpdated, ref, watch } from 'vue';
import { t } from '@/i18n/index.js';
import { setMascotInputFocused } from '@/design/mascot-motion.js';
// #ifdef H5
import { bindNumericDeleteInk } from '@/design/numeric-delete-ink.js';
// #endif
import BaseButton from '../base-button/base-button.vue';
const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  label: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  type: { type: String, default: 'text' },
  inputmode: { type: String, default: 'text' },
  autocomplete: { type: String, default: undefined },
  prefix: { type: String, default: '' },
  multiline: Boolean,
  autoGrow: Boolean,
  maxRows: { type: Number, default: 5, validator: (value) => Number.isInteger(value) && value >= 1 },
  readonly: Boolean,
  hideLabel: Boolean,
  inputClass: { type: String, default: '' },
  focusVisibleOnly: Boolean,
  numericDeleteInk: Boolean,
  nativeFocus: Boolean,
  disabled: Boolean,
  verification: Boolean,
  verificationSent: { type: Boolean, default: true },
  verificationLabels: { type: Object, default: null },
  options: { type: Array, default: () => [] },
  resendSeconds: { type: Number, default: 0 },
  maxlength: { type: Number, default: -1 },
  help: { type: String, default: '' },
  error: { type: String, default: '' }
});
const emit = defineEmits(['update:modelValue', 'resend', 'focus', 'blur', 'input', 'resize']);
const textarea = ref(null);
const fieldGroup = ref(null);
let releaseNumericInk;
// #ifdef APP-PLUS
const hasNativeWebView = typeof plus !== 'undefined' && Boolean(plus.webview);
// #endif
const nativeRows = ref(1);
const nativeGrowingStyle = computed(() => ({
  height: `max(var(--field-grow-min, var(--touch-min)), calc(var(--field-grow-line, var(--leading-body)) * ${nativeRows.value} + var(--field-grow-padding, calc(var(--s-2) * 2))))`
}));
function resizeTextarea() {
  // #ifdef H5
  if (!props.multiline || !props.autoGrow) return;
  const element = textarea.value?.$el || textarea.value;
  if (!element?.style) return;
  const style = getComputedStyle(element);
  element.style.height = 'auto';
  const height = Math.max(
    parseFloat(style.minHeight) || 0,
    Math.min(parseFloat(style.maxHeight) || Infinity, element.scrollHeight)
  );
  if (height > 0) element.style.height = `${height}px`;
  emit('resize');
  // #endif
}
function lineChange(event) {
  if (!props.autoGrow) return;
  nativeRows.value = Math.max(1, Math.min(props.maxRows, Number(event.detail?.lineCount) || 1));
  nextTick(() => emit('resize'));
}
watch(
  () => props.modelValue,
  () => nextTick(resizeTextarea)
);
onUpdated(resizeTextarea);
const id = `yozi-field-${getCurrentInstance().uid}`;
const focused = ref(false),
  keyboardFocus = ref(true);
const keyboardModality = (event) => {
  if (!event.altKey && !event.metaKey && !event.ctrlKey) keyboardFocus.value = true;
};
const pointerModality = () => {
  keyboardFocus.value = false;
};
onMounted(() => {
  resizeTextarea();
  // #ifdef H5
  if (props.numericDeleteInk) {
    const group = fieldGroup.value?.$el || fieldGroup.value;
    releaseNumericInk = bindNumericDeleteInk(group);
  }
  if (props.focusVisibleOnly && typeof document !== 'undefined') {
    document.addEventListener('keydown', keyboardModality, true);
    document.addEventListener('pointerdown', pointerModality, true);
  }
  // #endif
});
let nativePlatform = true;
// #ifdef H5
nativePlatform = false;
// #endif
const remaining = ref(0);
const descriptionId = computed(() => (props.help || props.error ? `${id}-description` : undefined));
const resendLabel = computed(() => {
  const labels = props.verificationLabels;
  if (labels)
    return remaining.value > 0
      ? labels.countdown.replace('{seconds}', remaining.value)
      : labels[props.verificationSent ? 'resend' : 'send'];
  return remaining.value > 0
    ? t('ui.resendCountdown', { seconds: remaining.value })
    : t(props.verificationSent ? 'ui.resend' : 'ui.getCode');
});
let timer;
watch(
  () => props.resendSeconds,
  (seconds) => {
    clearInterval(timer);
    const deadline = Date.now() + Math.max(0, Number.isFinite(seconds) ? Math.ceil(seconds) : 0) * 1000;
    const tick = () => {
      remaining.value = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (!remaining.value) clearInterval(timer);
    };
    tick();
    if (remaining.value) timer = setInterval(tick, 1000);
  },
  { immediate: true }
);
function input(event) {
  if (!props.disabled && !props.readonly) {
    emit('update:modelValue', event.detail?.value ?? event.target?.value ?? '');
    emit('input', event);
  }
}
function focus(event) {
  focused.value = true;
  setMascotInputFocused(id, true);
  emit('focus', event);
}
function blur(event) {
  focused.value = false;
  setMascotInputFocused(id, false);
  emit('blur', event);
}
function resend() {
  if (!props.disabled && remaining.value === 0) emit('resend');
}
onBeforeUnmount(() => {
  clearInterval(timer);
  releaseNumericInk?.();
  // #ifdef H5
  if (typeof document !== 'undefined') {
    document.removeEventListener('keydown', keyboardModality, true);
    document.removeEventListener('pointerdown', pointerModality, true);
  }
  // #endif
  setMascotInputFocused(id, false);
});
</script>
<!-- #ifdef APP-PLUS -->
<renderjs name="numericInkView">
import { bindNumericDeleteInk } from '../../../design/numeric-delete-ink.js';

export default {
  methods: {
    attach(enabled, _previous, owner) {
      // App Vue supplies the same value in both slots when the observer mounts.
      if (enabled) bindNumericDeleteInk(owner.$el.querySelector('.base-field__group'));
    }
  }
};
</renderjs>
<!-- #endif -->
<style scoped lang="scss">
.base-field {
  display: grid;
  gap: var(--s-2);
  min-width: 0;
  font-family: var(--font-ui);
}
.base-field__label {
  color: var(--ink-2);
  font: var(--weight-ui-emphasis) var(--size-small)/var(--leading-small) var(--font-ui);
}
.base-field__group {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  min-height: var(--control-height);
  border: var(--border-control) solid var(--control-line);
  border-radius: var(--r-md);
  background: var(--paper);
  overflow: hidden;
}
.base-field__group.has-numeric-delete-ink {
  position: relative;
}
.base-field__group :deep(.numeric-delete-ink) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.base-field__group.is-focused {
  border-color: var(--violet);
  box-shadow: 0 0 0 var(--s-1) var(--violet-soft);
}
.base-field__group.is-error {
  border-color: var(--coral);
  box-shadow: 0 0 0 var(--s-1) var(--coral-soft);
}
.base-field__group.is-disabled {
  background: var(--paper-sunk);
  color: var(--ink-disabled);
}
.base-field__group.focus-visible-only {
  border-color: var(--line);
}
.base-field__input {
  width: 100%;
  flex: 1;
  min-width: 0;
  height: var(--control-height);
  padding: 0 var(--s-4);
  box-sizing: border-box;
  border: 0;
  background: transparent;
  color: var(--ink);
  font: var(--weight-regular) var(--size-body)/var(--leading-body) var(--font-ui);
}
.base-field__input::placeholder {
  color: var(--ink-placeholder);
  opacity: 1;
}
.base-field__input :deep(.uni-input-placeholder),
.base-field__input :deep(.uni-textarea-placeholder) {
  color: var(--ink-placeholder);
}
.base-field__input:focus {
  outline: none;
}
.base-field__group:not(.focus-visible-only):has(.base-field__input:focus-visible),
.base-field__group.is-keyboard-focused {
  outline: var(--border-selected) solid var(--focus);
  outline-offset: var(--focus-offset);
}
.is-multiline .base-field__input {
  height: var(--textarea-height);
  padding: var(--s-3) var(--s-4);
}
.is-auto-grow .base-field__input {
  height: var(--touch-min);
  min-height: var(--touch-min);
  max-height: calc(var(--leading-body) * var(--field-max-rows) + var(--s-2) * 2);
  padding: var(--s-2) var(--s-4);
  resize: none;
  overflow-y: auto;
}
.base-field__prefix {
  align-self: stretch;
  display: flex;
  align-items: center;
  padding: 0 var(--s-4);
  border-right: var(--border-thin) solid var(--line);
  color: var(--ink);
  font-weight: var(--weight-ui-emphasis);
}
.base-field__help {
  color: var(--ink-3);
  font: var(--weight-regular) var(--size-small)/var(--leading-small) var(--font-ui);
}
.base-field__help.is-error {
  color: var(--coral);
}
</style>
