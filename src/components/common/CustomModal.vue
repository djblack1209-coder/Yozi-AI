<template>
  <WdPopup
    :model-value="visible"
    :duration="reducedMotion ? 0 : motionDuration"
    :close-on-click-modal="maskClosable"
    :z-index="9999"
    :transition="transition"
    :position="position"
    :custom-style="popupStyle"
    modal-style="background:var(--scrim);"
    @close="handleCancel"
    @after-enter="bindDialog"
    @after-leave="emit('closed')"
  >
    <view
      ref="dialog"
      class="custom-modal-container"
      :class="[containerClass, { dark: isDark, 'is-bottom': position === 'bottom', 'reduced-motion': reducedMotion }]"
      role="dialog"
      :aria-modal="visible ? 'true' : undefined"
      :aria-hidden="!visible || undefined"
      :aria-labelledby="titleId"
      :aria-describedby="content && !editable ? contentId : undefined"
      :inert="!visible || undefined"
      tabindex="-1"
      @tap.stop
    >
      <BaseButton
        v-if="closeButton"
        class="modal-close"
        variant="quiet"
        icon="x"
        icon-only
        :label="t('ui.close')"
        @tap="handleCancel"
      />
      <view v-if="icon" class="modal-icon-wrapper" aria-hidden="true"
        ><BaseIcon :name="icon || iconMap[type] || 'info'"
      /></view>
      <view :id="titleId" class="modal-title"
        ><slot name="title">{{ title || t('ui.dialogTitle') }}</slot></view
      >
      <slot
        ><text v-if="content && !editable" :id="contentId" class="modal-content">{{ content }}</text></slot
      >
      <BaseInput
        v-if="editable"
        ref="editableInput"
        v-model="inputText"
        multiline
        :label="title || t('ui.dialogTitle')"
        :placeholder="placeholderText"
        :maxlength="-1"
        :native-focus="nativeInput && visible"
        :help="!inputText.trim() ? t('ui.fillToConfirm') : ''"
      />
      <view v-if="showActions" class="modal-buttons" :class="{ single: !showCancel }">
        <BaseButton
          v-if="showCancel"
          ref="cancelButton"
          class="modal-btn cancel-btn"
          variant="secondary"
          @tap="handleCancel"
          >{{ cancelText || t('ui.cancel') }}</BaseButton
        >
        <BaseButton
          ref="confirmButton"
          class="modal-btn confirm-btn"
          :variant="type === 'error' ? 'danger' : 'primary'"
          :disabled="isConfirmDisabled"
          :loading="confirmLoading"
          :loading-text="loadingText || t('ui.processing')"
          @tap="handleConfirm"
          >{{ confirmText || t('ui.confirm') }}</BaseButton
        >
      </view>
      <slot name="footer"></slot>
    </view>
  </WdPopup>
</template>

<script setup>
import { computed, getCurrentInstance, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import WdPopup from 'wot-design-uni/components/wd-popup/wd-popup.vue';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseInput from '@/components/base/base-input/base-input.vue';
import { t } from '@/i18n/index.js';
import { tokens } from '@/design/tokens.js';
import BaseIcon from '@/components/base/base-icon/base-icon.vue';
import { bindLearningDialog, bindLearningKeyboard } from '@/services/learning/keyboard-controls.js';
import { bindBusinessMotion } from '@/design/business-motion.js';

const props = defineProps({
  visible: { type: Boolean, default: false },
  type: { type: String, default: 'info' },
  icon: { type: String, default: '' },
  title: { type: String, default: '' },
  containerClass: { type: String, default: '' },
  content: { type: String, default: '' },
  confirmText: { type: String, default: '' },
  cancelText: { type: String, default: '' },
  showCancel: { type: Boolean, default: true },
  maskClosable: { type: Boolean, default: false },
  isDark: { type: Boolean, default: false },
  confirmDisabled: { type: Boolean, default: false },
  confirmLoading: { type: Boolean, default: false },
  loadingText: { type: String, default: '' },
  editable: { type: Boolean, default: false },
  placeholderText: { type: String, default: '' },
  position: { type: String, default: 'center', validator: (value) => ['center', 'bottom'].includes(value) },
  transition: { type: String, default: 'fade' },
  escapeClosable: { type: Boolean, default: undefined },
  closeButton: { type: Boolean, default: false },
  showActions: { type: Boolean, default: true },
  initialFocusSelector: { type: String, default: '' }
});
const emit = defineEmits(['cancel', 'update:visible', 'confirm', 'closed']);
const dialog = ref(null);
const cancelButton = ref(null);
const confirmButton = ref(null);
const editableInput = ref(null);
const inputText = ref('');
const isConfirmDisabled = computed(
  () => props.confirmDisabled || props.confirmLoading || (props.editable && !inputText.value.trim())
);
// H5 enters focus through the dialog controller; native textarea uses its documented focus property.
let nativeInput = true;
// #ifdef H5
nativeInput = false;
// #endif
const reducedMotion = ref(true);
const instanceId = getCurrentInstance().uid;
const titleId = `yozi-modal-title-${instanceId}`;
const contentId = `yozi-modal-content-${instanceId}`;
const motionDuration = parseInt(tokens.light['--t-state']);
const popupStyle = computed(() =>
  props.position === 'bottom'
    ? 'width:100%;background:transparent;overflow:visible;'
    : 'width:calc(100vw - var(--s-10));max-width:var(--dialog-width);background:transparent;overflow:visible;border-radius:var(--r-xl);'
);
const iconMap = {
  info: 'bulb',
  success: 'success',
  warning: 'warning',
  error: 'error',
  question: 'question',
  empty: 'empty',
  upload: 'upload',
  study: 'books'
};
let releaseDialog = null;
let releaseKeyboard = () => undefined;
let releaseMotion = () => undefined;
let closing = false;

function handleConfirm() {
  if (isConfirmDisabled.value || !props.visible || closing) return;
  closing = true;
  if (props.editable) emit('confirm', inputText.value);
  else emit('confirm');
  emit('update:visible', false);
}
function handleCancel() {
  if (!props.visible || closing) return;
  closing = true;
  emit('cancel');
  emit('update:visible', false);
}
function bindDialog() {
  if (!props.visible || releaseDialog || !dialog.value) return;
  releaseKeyboard = bindLearningKeyboard(dialog.value);
  const input = editableInput.value?.$el || editableInput.value;
  const element = dialog.value?.$el || dialog.value;
  const requestedFocus = props.initialFocusSelector && element?.querySelector?.(props.initialFocusSelector);
  releaseDialog = bindLearningDialog(dialog.value, {
    initialFocus:
      requestedFocus ||
      (props.editable
        ? input?.querySelector?.('textarea') || input
        : props.showCancel
          ? cancelButton.value
          : confirmButton.value),
    onEscape: () => {
      if (props.escapeClosable ?? (props.showCancel || props.maskClosable)) handleCancel();
    }
  });
}
function releaseFocus() {
  releaseKeyboard();
  releaseDialog?.();
  releaseDialog = null;
}
// Lazy popup content can mount after the visibility watcher, including with zero-duration motion.
watch(dialog, bindDialog, { flush: 'post' });
watch(
  () => props.visible,
  async (open) => {
    if (!open) {
      inputText.value = '';
      releaseFocus();
      return;
    }
    closing = false;
    inputText.value = props.editable ? props.content : '';
    await nextTick();
    bindDialog();
  },
  { immediate: true, flush: 'post' }
);
onMounted(() => {
  releaseMotion = bindBusinessMotion((reduced) => {
    reducedMotion.value = reduced;
  });
});
onUnmounted(() => {
  releaseFocus();
  releaseMotion();
});
</script>

<style lang="scss" scoped>
.custom-modal-container {
  box-sizing: border-box;
  position: relative;
  width: 100%;
  max-height: calc(100vh - var(--s-10));
  padding: var(--s-6);
  overflow-y: auto;
  background: var(--paper);
  color: var(--ink);
  border-radius: var(--r-xl);
  box-shadow: var(--lift-3);
  font-family: var(--font-ui);
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  overflow-wrap: anywhere;
  overscroll-behavior: contain;
}
@supports (height: 100dvh) {
  .custom-modal-container {
    max-height: calc(100dvh - var(--s-10));
  }
}
.custom-modal-container.is-bottom {
  border-radius: var(--r-xl) var(--r-xl) 0 0;
  padding-bottom: calc(var(--s-6) + env(safe-area-inset-bottom));
}
.custom-modal-container.is-bottom.is-choice-sheet {
  max-width: var(--dialog-width);
  margin-inline: auto;
}
.modal-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--control-height);
  height: var(--control-height);
  border-radius: var(--r-pill);
  background: var(--violet-soft);
}
.modal-title {
  display: block;
  color: var(--ink);
  font: var(--weight-ui-emphasis) var(--size-title-3)/var(--leading-title-3) var(--font-ui);
}
.modal-content {
  display: block;
  white-space: pre-wrap;
  color: var(--ink-2);
  font: var(--weight-regular) var(--size-body)/var(--leading-body) var(--font-ui);
}
.modal-buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--s-3);
  margin-top: var(--s-2);
}
.modal-close {
  align-self: flex-end;
}
.custom-modal-container.reduced-motion :deep(.base-button) {
  transition: none !important;
  transform: none !important;
}
</style>
