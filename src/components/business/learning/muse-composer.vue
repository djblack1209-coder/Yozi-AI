<template>
  <view
    ref="root"
    class="muse-composer"
    :class="{ 'has-dictation': voice.active || voiceMessage, 'has-actions': !!$slots.actions }"
  >
    <view v-if="$slots.actions" class="muse-composer-actions" role="group" aria-label="学习操作">
      <slot name="actions"></slot>
    </view>
    <view v-if="voice.active" class="muse-dictation" :aria-label="t('muse.dictation')">
      <text class="muse-dictation-status"
        >{{ voice.phase === 'starting' ? t('muse.dictationPreparing') : t('muse.dictation') }} ·
        {{ voice.elapsed }}s</text
      >
      <text class="muse-dictation-text" aria-live="polite" selectable>{{
        voice.transcript || t('muse.dictationWaiting')
      }}</text>
      <view class="muse-dictation-actions">
        <BaseButton variant="quiet" @tap="voice.cancel">{{ t('muse.dictationCancel') }}</BaseButton>
        <BaseButton variant="quiet" :disabled="voice.phase === 'finishing'" @tap="voice.stop">{{
          t('muse.dictationFinish')
        }}</BaseButton>
      </view>
    </view>
    <text v-if="voiceMessage" class="muse-dictation-status muse-dictation-message" role="status">{{
      voiceMessage
    }}</text>
    <BaseButton
      class="muse-attach"
      variant="quiet"
      icon-only
      icon="plus"
      :label="attachmentLabel || t('muse.attach')"
      :disabled="attachmentDisabled || voice.active"
      @tap="emit('attach')"
    />
    <BaseInput
      :model-value="modelValue"
      class="muse-composer-field"
      :label="label || t('muse.message')"
      :placeholder="placeholder || t('muse.message')"
      :maxlength="maxlength"
      multiline
      auto-grow
      :max-rows="7"
      focus-visible-only
      hide-label
      :disabled="disabled"
      :readonly="voice.active"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <BaseButton
      v-if="voiceEntryEnabled && voice.capability.platform === 'macos' && !voice.active"
      class="muse-attach"
      variant="quiet"
      icon-only
      icon="microphone"
      :label="t('muse.dictation')"
      :title="voiceMessage || t('muse.dictation')"
      :disabled="disabled || !voice.capability.available"
      @tap="voice.start"
    />
    <BaseButton
      v-if="busy"
      class="muse-send"
      variant="primary"
      icon-only
      icon="square"
      :label="stopLabel || '停止生成'"
      @tap="emit('stop')"
    />
    <BaseButton
      v-else
      class="muse-send"
      variant="primary"
      icon-only
      icon="arrow-up"
      :label="sendLabel || t('muse.send')"
      :disabled="disabled || submitDisabled || voice.active || !modelValue.trim()"
      @tap="submit"
    />
  </view>
</template>
<script setup>
import { ref, computed, getCurrentInstance, onMounted, onUpdated, onBeforeUnmount } from 'vue';
import { useVoiceDictation } from '@/composables/useVoiceDictation.js';
import { DEV_TEST } from '@/config/build-channel.js';
import '@/i18n/muse.js';
import { t } from '@/i18n/index.js';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseInput from '@/components/base/base-input/base-input.vue';
const props = defineProps({
  modelValue: { type: String, default: '' },
  label: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  sendLabel: { type: String, default: '' },
  stopLabel: { type: String, default: '' },
  attachmentLabel: { type: String, default: '' },
  getVoiceContext: { type: Function, default: null },
  voiceLocale: { type: String, default: 'zh-CN' },
  maxlength: { type: Number, default: 3000 },
  busy: Boolean,
  disabled: Boolean,
  submitDisabled: Boolean,
  attachmentDisabled: Boolean
});
const emit = defineEmits(['update:modelValue', 'submit', 'attach', 'stop', 'height']);
const root = ref(null);
// Native acceptance stays opt-in and cannot expose unverified dictation in production.
const voiceEntryEnabled = DEV_TEST && import.meta.env.VITE_YOZI_VOICE_ACCEPTANCE === '1';
const voice = useVoiceDictation(
  props,
  emit,
  () => (root.value?.$el || root.value)?.querySelector?.('textarea')?.selectionEnd
);
const voiceMessage = computed(() => {
  const reason =
    voice.error ||
    (voice.capability.platform === 'macos' && !voice.capability.available ? voice.capability.reason : '');
  if (!reason) return '';
  return ['speech_denied', 'microphone_denied'].includes(reason)
    ? t('muse.dictationPermission')
    : `${t('muse.dictationUnavailable')} (${reason})`;
});
const instance = getCurrentInstance();
let observer, keyTarget;
let composing = false;
const compositionStart = () => {
  composing = true;
};
const compositionEnd = () => {
  composing = false;
};
function measureNative() {
  // #ifndef H5
  uni
    .createSelectorQuery?.()
    .in?.(instance?.proxy)
    ?.select?.('.muse-composer')
    ?.boundingClientRect?.((rect) => {
      if (rect?.height) emit('height', Math.ceil(rect.height));
    })
    ?.exec?.();
  // #endif
}
function submit() {
  if (voice.active || composing) return;
  if (!props.disabled && !props.submitDisabled && !props.busy && props.modelValue.trim()) emit('submit');
}
function keydown(event) {
  if (voice.active && event.key === 'Escape') {
    event.preventDefault();
    voice.cancel();
    return;
  }
  if (event.key !== 'Enter' || event.shiftKey || composing || event.isComposing || event.keyCode === 229) return;
  if (event.target?.tagName?.toLowerCase() !== 'textarea') return;
  event.preventDefault();
  event.stopPropagation();
  if (!event.repeat) submit();
}
onMounted(() => {
  // #ifdef H5
  const element = root.value?.$el || root.value;
  // uni-view normalizes away target, shiftKey and IME fields on keyboard events.
  keyTarget = element;
  keyTarget?.addEventListener('keydown', keydown);
  keyTarget?.addEventListener('compositionstart', compositionStart);
  keyTarget?.addEventListener('compositionend', compositionEnd);
  if (element?.getBoundingClientRect) emit('height', Math.ceil(element.getBoundingClientRect().height));
  if (element && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => emit('height', Math.ceil(element.getBoundingClientRect().height)));
    observer.observe(element);
  }
  // #endif
  measureNative();
});
onUpdated(measureNative);
onBeforeUnmount(() => {
  observer?.disconnect();
  keyTarget?.removeEventListener('keydown', keydown);
  keyTarget?.removeEventListener('compositionstart', compositionStart);
  keyTarget?.removeEventListener('compositionend', compositionEnd);
});
</script>
<style scoped>
.muse-composer {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  box-sizing: border-box;
  min-height: 54px;
  padding: 5px 6px;
  border-radius: 27px;
  background: var(--muse-composer);
  box-shadow: 0 2px 8px #00000014;
  --field-grow-min: 22px;
  --field-grow-line: 22px;
  --field-grow-padding: 0px;
}
.muse-composer-field {
  flex: 1;
  min-width: 0;
}
.muse-composer.has-dictation,
.muse-composer.has-actions {
  flex-wrap: wrap;
  border-radius: var(--s-4);
}
.muse-composer-actions {
  display: flex;
  align-items: center;
  flex-basis: 100%;
  min-width: 0;
  flex-wrap: wrap;
  gap: 4px;
  padding: 0 4px;
}
.muse-composer-actions :deep(.base-button) {
  min-height: 44px;
  padding: 0 10px;
  border-radius: 10px;
  font-size: 13px;
}
.muse-dictation,
.muse-dictation-message {
  flex-basis: 100%;
  min-width: 0;
}
.muse-dictation {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}
.muse-dictation-status {
  color: var(--ink-3);
  font-size: var(--size-caption);
  overflow-wrap: anywhere;
}
.muse-dictation-text {
  max-height: 8em;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.muse-dictation-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--s-2);
}
.muse-composer :deep(.base-field__group) {
  outline: none !important;
  background: transparent;
  border: 0;
  box-shadow: none !important;
  min-height: 44px;
  border-radius: 0;
  padding: 0;
}
.muse-composer :deep(.base-field__input) {
  padding: 0;
  margin: 11px 0;
  min-height: 22px;
  max-height: 154px;
  line-height: 22px;
  font-size: 15px;
}
.muse-composer :deep(.is-keyboard-focused .base-field__input) {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.muse-composer .muse-attach {
  min-width: 44px;
  width: 44px;
  height: 44px;
  padding: 0;
  color: var(--ink-2);
  border-radius: 50%;
}
.muse-composer .muse-send {
  min-width: 44px;
  width: 44px;
  height: 44px;
  padding: 0;
  border-radius: 50%;
  position: relative;
  isolation: isolate;
  background: transparent;
  box-shadow: none;
}
.muse-composer .muse-send::before {
  content: '';
  position: absolute;
  inset: 6px;
  z-index: -1;
  border-radius: 50%;
  background: var(--clay-face);
  transition: background-color 150ms var(--ease);
}
.muse-composer .muse-send:not([disabled]):hover::before {
  background: var(--clay-face-hover);
}
.muse-composer .muse-send[disabled] {
  background: transparent;
  opacity: 1;
}
.muse-composer .muse-send[disabled]::before {
  opacity: 0.4;
}
.muse-composer .muse-send[disabled] :deep(.base-icon) {
  color: var(--ink-3) !important;
}
.muse-composer .muse-send :deep(.base-icon) {
  color: #ffffff !important;
}
@media (max-width: 760px) {
  .muse-composer :deep(.base-field__input) {
    font-size: 16px;
  }
}
@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {
  .muse-composer {
    background: var(--paper-sunk);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}
</style>
