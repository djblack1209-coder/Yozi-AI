<template>
  <button
    ref="root"
    class="base-chip"
    :class="{ 'base-chip--glass': surface === 'glass' }"
    role="button"
    :aria-pressed="action ? undefined : modelValue"
    :disabled="disabled"
    :aria-disabled="disabled"
    :tabindex="disabled ? -1 : 0"
    @tap="toggle"
    @keydown="keydown"
  >
    <BaseIcon v-if="icon" :name="icon" :tone="modelValue ? 'violet-ink' : 'ink-2'" />
    <slot></slot><text v-if="count !== null" class="base-chip__count">{{ formatNumber(count) }}</text>
  </button>
</template>
<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import BaseIcon from '../base-icon/base-icon.vue';
import { formatNumber } from '@/i18n/format.js';
const props = defineProps({
  modelValue: Boolean,
  action: Boolean,
  surface: { type: String, default: 'paper', validator: (value) => ['paper', 'glass'].includes(value) },
  disabled: Boolean,
  icon: { type: String, default: '' },
  count: { type: Number, default: null }
});
const emit = defineEmits(['update:modelValue', 'tap', 'click']);
const root = ref(null);
let keyboardElement;
onMounted(() => {
  // #ifdef H5
  keyboardElement = root.value?.$el || root.value;
  keyboardElement?.addEventListener?.('keydown', keydown);
  // #endif
});
onBeforeUnmount(() => keyboardElement?.removeEventListener?.('keydown', keydown));

function toggle(event) {
  if (props.disabled) return;
  if (!props.action) emit('update:modelValue', !props.modelValue);
  else {
    emit('tap', event);
    // #ifdef H5 || APP-PLUS
    emit('click', event);
    // #endif
  }
}
function keydown(event) {
  // #ifdef H5
  if (!event.currentTarget?.addEventListener) return;
  // #endif
  if (event.defaultPrevented) return;
  if (!['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  if (!event.repeat) toggle(event);
}
</script>
<style scoped>
.base-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-2);
  box-sizing: border-box;
  min-height: var(--touch-min);
  max-width: 100%;
  padding: var(--s-2) var(--s-4);
  margin: 0;
  border-radius: var(--r-pill);
  background: var(--paper-sunk);
  border: var(--border-thin) solid var(--line);
  color: var(--ink-2);
  font: var(--weight-medium) var(--size-small)/var(--leading-small) var(--font-ui);
  overflow-wrap: anywhere;
  cursor: pointer;
  transition:
    background-color var(--t-state) var(--ease),
    border-color var(--t-state) var(--ease);
}
.base-chip--glass {
  background: var(--glass);
  border-color: var(--glass-line);
  color: var(--violet-ink);
  box-shadow: var(--lift-1);
  backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
}
.base-chip:not([disabled]):hover {
  background: var(--violet-soft);
  border-color: var(--violet);
}
.base-chip:not([disabled]):active {
  background: var(--violet-soft);
}
.base-chip::after {
  border: 0;
}
.base-chip[aria-pressed='true'] {
  background: var(--violet-soft);
  border-color: var(--violet);
  color: var(--violet-ink);
  font-weight: var(--weight-ui-emphasis);
}
.base-chip[disabled] {
  opacity: 1;
  color: var(--ink-disabled);
  cursor: default;
  box-shadow: none;
}
.base-chip__count {
  font-size: var(--size-caption);
  font-variant-numeric: tabular-nums;
}
.base-chip:focus-visible {
  outline: var(--border-selected) solid var(--focus);
  outline-offset: var(--focus-offset);
}
@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {
  .base-chip--glass {
    background: var(--paper);
    border-color: var(--line-strong);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}
@supports not (backdrop-filter: blur(1px)) {
  .base-chip--glass {
    background: var(--paper);
  }
}
</style>

<style scoped>
/* #ifdef MP-WEIXIN */
.base-chip--glass {
  background: var(--paper);
  border-color: var(--line-strong);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
/* #endif */
</style>
