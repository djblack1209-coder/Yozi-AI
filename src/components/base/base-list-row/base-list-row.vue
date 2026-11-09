<template>
  <view
    class="base-list-row"
    :class="{ 'is-disabled': disabled }"
    :role="actionable ? 'button' : undefined"
    :tabindex="actionable && !disabled ? 0 : undefined"
    :aria-disabled="actionable ? disabled : undefined"
    @tap="activate"
    @keydown="keydown"
  >
    <BaseIcon v-if="icon" :name="icon" tone="ink-3" /><text class="base-list-row__label">{{ label }}</text
    ><view class="base-list-row__value"
      ><slot>{{ value }}</slot
      ><BaseIcon v-if="actionable" name="right" tone="ink-3"
    /></view>
  </view>
</template>
<script setup>
import BaseIcon from '../base-icon/base-icon.vue';
const props = defineProps({
  label: { type: String, required: true },
  value: { type: String, default: '' },
  icon: { type: String, default: '' },
  actionable: { type: Boolean, default: true },
  disabled: Boolean
});
const emit = defineEmits([
  'tap',
  // #ifdef APP-PLUS
  'click'
  // #endif
]);
function activate(event) {
  if (!props.actionable || props.disabled) return;
  emit('tap', event);
  // #ifdef APP-PLUS
  emit('click', event);
  // #endif
}
function keydown(event) {
  if (!['Enter', ' '].includes(event.key) || event.target !== event.currentTarget) return;
  event.preventDefault();
  event.stopPropagation();
  if (!event.repeat) activate(event);
}
</script>
<style scoped>
.base-list-row {
  display: flex;
  box-sizing: border-box;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-3);
  min-height: var(--s-14);
  padding: var(--s-2) var(--s-4);
  border-bottom: var(--border-thin) solid var(--line);
  color: var(--ink);
  font: var(--weight-regular) var(--size-body)/var(--leading-body) var(--font-ui);
}
.base-list-row:last-child {
  border-bottom: 0;
}
.base-list-row__label {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.base-list-row__value {
  display: flex;
  align-items: center;
  gap: var(--s-1);
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  color: var(--ink-3);
  font-size: var(--size-small);
}
.base-list-row.is-disabled {
  color: var(--ink-disabled);
}
.base-list-row:focus-visible {
  outline: var(--border-selected) solid var(--focus);
  outline-offset: calc(-1 * var(--border-selected));
}
</style>
