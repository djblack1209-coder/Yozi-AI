<template>
  <view
    ref="root"
    class="muse-composer"
    :class="{ 'has-dictation': voice.active || voiceMessage, 'has-actions': !!$slots.actions }"
  >
    <view v-if="$slots.actions" class="muse-composer-actions" role="group" aria-label="学习操作">
      <slot name="actions"></slot>
    </view>
    <view v-if="voice.active" class="muse-dictation" :data-voice-phase="voice.phase" :aria-label="t('muse.dictation')">
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
    <view class="muse-attachment" :class="{ 'is-open': attachmentOpen }">
      <BaseButton
        ref="attachmentTrigger"
        class="muse-attach"
        variant="quiet"
        icon-only
        :icon="attachmentOpen ? 'x' : 'plus'"
        :label="attachmentLabel || t('muse.attach')"
        :aria-expanded="attachmentActions.length ? attachmentOpen : undefined"
        :aria-controls="attachmentActions.length ? 'muse-attachment-actions' : undefined"
        :disabled="attachmentDisabled || voice.active"
        @tap="toggleAttachment"
      />
      <view
        v-if="attachmentActions.length"
        class="muse-attachment-menu"
        id="muse-attachment-actions"
        role="group"
        :aria-label="attachmentLabel || t('muse.attach')"
        :aria-hidden="!attachmentOpen || undefined"
        :inert="!attachmentOpen || undefined"
      >
        <BaseButton
          v-for="(action, index) in attachmentActions"
          :key="action"
          variant="quiet"
          :icon="attachmentOptions[action].icon"
          :style="{ '--attachment-delay': `${(attachmentActions.length - 1 - index) * 32}ms` }"
          @tap="pickAttachment(action)"
          >{{ t(attachmentOptions[action].label) }}</BaseButton
        >
      </view>
    </view>
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
import { ref, computed, getCurrentInstance, onMounted, onUpdated, onBeforeUnmount, watch } from 'vue';
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
  attachmentDisabled: Boolean,
  attachmentActions: { type: Array, default: () => [] }
});
const emit = defineEmits(['update:modelValue', 'submit', 'attach', 'stop', 'height']);
const root = ref(null);
const attachmentTrigger = ref(null);
const attachmentOpen = ref(false);
const attachmentOptions = {
  file: { label: 'muse.attachmentFile', icon: 'paperclip' },
  text: { label: 'muse.attachmentText', icon: 'file-text' },
  library: { label: 'muse.library', icon: 'shapes' }
};
function toggleAttachment() {
  if (props.attachmentActions.length) attachmentOpen.value = !attachmentOpen.value;
  else emit('attach');
}
function pickAttachment(action) {
  attachmentOpen.value = false;
  (attachmentTrigger.value?.$el || attachmentTrigger.value)?.focus?.();
  emit('attach', action);
}
// Native acceptance stays opt-in and cannot expose unverified dictation in production.
const voiceEntryEnabled = DEV_TEST && import.meta.env.VITE_YOZI_VOICE_ACCEPTANCE === '1';
const voice = useVoiceDictation(
  props,
  emit,
  () => (root.value?.$el || root.value)?.querySelector?.('textarea')?.selectionEnd
);
watch(
  () => props.attachmentDisabled || voice.active,
  (disabled) => {
    if (disabled) attachmentOpen.value = false;
  }
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
// Pressing a control must not end typing: on a phone that brings the tab bar back mid-tap and the press lands elsewhere.
function keepFieldFocus(event) {
  if (!event.target.closest?.('.base-field__group')) event.preventDefault();
}
function dismissAttachmentOutside(event) {
  if (attachmentOpen.value && !keyTarget?.querySelector('.muse-attachment')?.contains(event.target))
    attachmentOpen.value = false;
}
function submit() {
  if (voice.active || composing) return;
  if (!props.disabled && !props.submitDisabled && !props.busy && props.modelValue.trim()) emit('submit');
}
function keydown(event) {
  if (attachmentOpen.value && event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    attachmentOpen.value = false;
    (attachmentTrigger.value?.$el || attachmentTrigger.value)?.focus?.();
    return;
  }
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
  keyTarget?.addEventListener('mousedown', keepFieldFocus);
  keyTarget?.addEventListener('compositionstart', compositionStart);
  keyTarget?.addEventListener('compositionend', compositionEnd);
  document.addEventListener('pointerdown', dismissAttachmentOutside);
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
  keyTarget?.removeEventListener('mousedown', keepFieldFocus);
  keyTarget?.removeEventListener('compositionstart', compositionStart);
  keyTarget?.removeEventListener('compositionend', compositionEnd);
  // #ifdef H5
  document.removeEventListener('pointerdown', dismissAttachmentOutside);
  // #endif
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
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  isolation: isolate;
  overflow: hidden;
  padding: 10px 12px 6px;
  border: 1px solid var(--line);
  border-radius: 13px;
  background: var(--muse-panel);
}
.muse-dictation::before {
  position: absolute;
  z-index: -1;
  inset: auto -12% -26px;
  height: 72px;
  background:
    radial-gradient(ellipse at 26% 88%, #65d7e26b, transparent 46%),
    radial-gradient(ellipse at 53% 92%, #a48bfc8a, transparent 46%),
    radial-gradient(ellipse at 72% 96%, #7ac8fb70, transparent 44%);
  filter: blur(8px);
  opacity: 0.36;
  pointer-events: none;
  content: '';
}
.muse-dictation[data-voice-phase='listening']::before {
  opacity: 0.86;
  animation: voice-glow-sweep 1.7s cubic-bezier(0.43, 0.05, 0.51, 0.96) infinite alternate;
}
.muse-dictation[data-voice-phase='finishing']::before {
  opacity: 0.25;
}
@keyframes voice-glow-sweep {
  from {
    transform: translateX(-9%) scaleY(0.83);
  }
  to {
    transform: translateX(9%) scaleY(1.19);
  }
}
@media (prefers-reduced-motion: reduce) {
  .muse-dictation[data-voice-phase='listening']::before {
    animation: none;
  }
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
  box-sizing: border-box;
  padding: 11px 0;
  margin: 0;
  min-height: 44px;
  max-height: 176px;
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
.muse-attachment {
  position: relative;
  flex: none;
}
.muse-attachment-menu {
  position: absolute;
  z-index: 4;
  inset: auto auto calc(100% + 5px) 0;
  display: grid;
  gap: 2px;
  width: max-content;
  padding: 5px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: color-mix(in srgb, var(--paper) 92%, transparent);
  backdrop-filter: blur(12px);
  box-shadow: 0 8px 24px #00000019;
  opacity: 0;
  transform: translateY(9px) scale(0.92);
  transform-origin: left bottom;
  visibility: hidden;
  pointer-events: none;
  transition:
    opacity 170ms ease,
    transform 210ms cubic-bezier(0.2, 0.75, 0.24, 1),
    visibility 0s 210ms;
}
.muse-attachment.is-open .muse-attachment-menu {
  visibility: visible;
  pointer-events: auto;
  opacity: 1;
  transform: translateY(0) scale(1);
  transition-delay: 0s;
}
.muse-attachment-menu :deep(.base-button) {
  min-height: 44px;
  justify-content: flex-start;
  padding-inline: 12px;
  opacity: 0;
  transform: translateY(8px);
  transition:
    transform 180ms ease-out,
    opacity 150ms ease-out;
}
.muse-attachment.is-open .muse-attachment-menu :deep(.base-button) {
  opacity: 1;
  transform: translateY(0);
  transition-delay: var(--attachment-delay);
}
@media (prefers-reduced-motion: reduce) {
  .muse-attachment-menu,
  .muse-attachment-menu :deep(.base-button) {
    transition: none;
  }
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
