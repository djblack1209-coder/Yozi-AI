<template>
  <button
    ref="root"
    class="base-button"
    :class="[
      `base-button--${variant}`,
      {
        'is-small': small,
        'is-block': block,
        'is-icon': iconOnly,
        'is-start': align === 'start',
        'is-selected': selected,
        'is-danger-secondary': dangerSecondary
      }
    ]"
    :open-type="openType"
    role="button"
    :tabindex="blocked ? -1 : 0"
    :disabled="blocked"
    :aria-disabled="blocked"
    :aria-busy="loading"
    :aria-label="label || (iconOnly ? t('ui.action') : undefined)"
    @agreeprivacyauthorization="emit('agreeprivacyauthorization', $event)"
    @tap="activate"
    @keydown="keydown"
  >
    <view v-if="loading" class="base-button__spinner" aria-hidden="true" />
    <BaseIcon v-else-if="icon" :name="icon" :tone="blocked ? 'ink-disabled' : tone" />
    <view v-if="!iconOnly" class="base-button__content"
      >{{ loading ? loadingText || t('ui.loading') : '' }}<slot v-if="!loading"></slot
    ></view>
  </button>
</template>
<script setup>
import { computed, onMounted, onUpdated, onBeforeUnmount, ref } from 'vue';
import { t } from '@/i18n/index.js';
import BaseIcon from '../base-icon/base-icon.vue';
const props = defineProps({
  variant: {
    type: String,
    default: 'primary',
    validator: (value) => ['primary', 'secondary', 'quiet', 'danger', 'apple', 'google', 'wechat'].includes(value)
  },
  openType: { type: String, default: '' },
  small: Boolean,
  dangerSecondary: Boolean,
  align: { type: String, default: 'center', validator: (value) => ['center', 'start'].includes(value) },
  selected: Boolean,
  block: Boolean,
  iconOnly: Boolean,
  disabled: Boolean,
  loading: Boolean,
  label: { type: String, default: '' },
  icon: { type: String, default: '' },
  loadingText: { type: String, default: '' }
});
const emit = defineEmits(['tap', 'click', 'agreeprivacyauthorization']);
const root = ref(null);
let keyboardElement;
function bindKeyboard() {
  // #ifdef H5
  const element = root.value?.$el || root.value;
  if (element !== keyboardElement) {
    keyboardElement?.removeEventListener?.('keydown', keydown);
    keyboardElement = element;
    keyboardElement?.addEventListener?.('keydown', keydown);
  }
  // #endif
}
onMounted(bindKeyboard);
onUpdated(bindKeyboard);
onBeforeUnmount(() => keyboardElement?.removeEventListener?.('keydown', keydown));
const blocked = computed(() => props.disabled || props.loading);
const tone = computed(
  () =>
    ({
      primary: 'on-clay',
      danger: 'on-danger',
      quiet: 'violet-ink',
      apple: 'apple-fg',
      google: 'google-fg',
      wechat: 'brand-wechat'
    })[props.variant] || 'ink'
);
function activate(event) {
  if (blocked.value) return;
  emit('tap', event);
  // uni-app compiles @tap on components to a click listener on App and H5.
  // #ifdef H5 || APP-PLUS
  emit('click', event);
  // #endif
}
function keydown(event) {
  // #ifdef H5
  if (!event.currentTarget?.addEventListener) return;
  // #endif
  if (event.defaultPrevented) return;
  if (!['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  if (!event.repeat) activate(event);
}
</script>
<style scoped lang="scss">
.base-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-2);
  box-sizing: border-box;
  min-height: var(--control-height);
  min-width: var(--touch-min);
  max-width: 100%;
  padding: var(--s-3) var(--button-pad);
  margin: 0;
  border: 0;
  border-radius: var(--r-md);
  font: var(--weight-ui-emphasis) var(--size-body)/var(--leading-small) var(--font-ui);
  cursor: pointer;
  white-space: normal;
  overflow-wrap: anywhere;
  transition:
    transform var(--t-press) var(--ease),
    box-shadow var(--t-press) var(--ease),
    background-color var(--t-state) var(--ease);
}
.base-button__content {
  display: inline-flex;
  align-items: center;
  justify-content: inherit;
  gap: var(--s-2);
  min-width: 0;
  max-width: 100%;
}
.base-button.is-start,
.base-button.is-start .base-button__content {
  justify-content: flex-start;
  text-align: left;
}
.base-button.is-start .base-button__content {
  flex: 1;
}
.base-button--quiet.is-selected {
  background: var(--violet-soft);
  color: var(--violet-ink);
}
.base-button::after {
  border: 0;
}
.base-button--primary {
  background: var(--clay-face);
  color: var(--on-clay);
  box-shadow: var(--clay-shadow);
}
.base-button--primary:hover {
  background: var(--clay-face-hover);
}
.base-button--primary:active:not([disabled]) {
  transform: translateY(var(--press-y));
  box-shadow: var(--clay-shadow-press);
}
.base-button--secondary {
  background: var(--paper);
  color: var(--ink);
  box-shadow: var(--secondary-shadow);
}
.base-button--secondary:active:not([disabled]) {
  transform: translateY(var(--press-y));
  box-shadow: var(--secondary-shadow-press);
}
.base-button--secondary:hover {
  background: var(--paper-sunk);
}
.base-button--quiet {
  background: transparent;
  color: var(--violet-ink);
  padding: 0 var(--s-4);
}
.base-button--quiet:hover {
  background: var(--violet-soft);
}
.base-button--danger {
  background: var(--danger-action-face);
  color: var(--on-danger);
}
.base-button--danger.is-danger-secondary {
  background: var(--paper);
  color: var(--coral);
  box-shadow: inset 0 0 0 var(--border-control) var(--coral);
}
.base-button--apple {
  background: var(--apple-bg);
  color: var(--apple-fg);
}
.base-button--google {
  background: var(--google-bg);
  color: var(--google-fg);
  box-shadow: inset 0 0 0 var(--border-thin) var(--google-line);
}
.base-button--wechat {
  background: var(--paper);
  color: var(--ink);
  box-shadow: inset 0 0 0 var(--border-control) var(--line-strong);
}
.base-button:not(.base-button--primary):active:not([disabled]) {
  opacity: 0.86;
}
.base-button__spinner {
  flex: none;
  box-sizing: border-box;
  width: var(--s-4);
  height: var(--s-4);
  border: var(--border-selected) solid currentColor;
  border-right-color: transparent;
  border-radius: var(--r-pill);
  animation: base-button-spin 0.8s linear infinite;
}
@keyframes base-button-spin {
  to {
    transform: rotate(360deg);
  }
}
.base-button.is-small {
  min-height: var(--touch-min);
  padding: var(--s-2) var(--s-4);
  font-size: var(--size-small);
  border-radius: var(--r-sm);
}
.base-button.is-icon {
  width: var(--touch-min);
  height: var(--touch-min);
  min-height: var(--touch-min);
  flex: none;
  padding: 0;
  border-radius: var(--r-pill);
}
.base-button.is-block {
  display: flex;
  width: 100%;
}
.base-button[disabled] {
  opacity: 1;
  background: var(--paper-sunk);
  color: var(--ink-disabled);
  box-shadow:
    inset 0 0 0 var(--border-control) var(--control-line),
    0 3px 0 var(--secondary-edge);
  transform: none;
  cursor: not-allowed;
}
.base-button:focus-visible {
  outline: var(--border-selected) solid var(--focus);
  outline-offset: var(--focus-offset);
}
@media (prefers-reduced-motion: reduce) {
  .base-button {
    transition: none;
    transform: none !important;
  }
  .base-button__spinner {
    animation: none;
  }
}
</style>
