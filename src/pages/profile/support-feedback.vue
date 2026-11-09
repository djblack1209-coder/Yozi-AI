<template>
  <CustomModal
    v-model:visible="visible"
    :title="title"
    :is-dark="isDark"
    :show-actions="false"
    initial-focus-selector=".support-feedback__note textarea"
    mask-closable
    close-button
  >
    <view
      class="support-feedback__stage"
      :class="{ 'has-flight': flight }"
      :style="{ '--feedback-flight-play': focused ? 'running' : 'paused' }"
    >
      <view class="support-feedback__fields">
        <view class="support-feedback__recipient">
          <text>{{ t('settings.feedbackRecipient') }}</text>
          <text class="support-feedback__address" selectable>{{ BRAND.supportEmail }}</text>
        </view>
        <BaseInput
          v-model="draft"
          class="support-feedback__note"
          :label="t('settings.feedbackNote')"
          :placeholder="t('settings.feedbackPlaceholder')"
          :disabled="busy"
          :maxlength="-1"
          multiline
        />
        <view class="support-feedback__actions">
          <BaseButton variant="quiet" :disabled="busy" @tap="copyEmail">{{
            t('settings.copySupportEmail')
          }}</BaseButton>
          <BaseButton variant="primary" icon="send" :disabled="busy" @tap="openDraft">{{
            t('settings.feedbackOpen')
          }}</BaseButton>
        </view>
      </view>
      <SupportFeedbackFlight
        v-if="flight"
        :key="flight"
        :address="BRAND.supportEmail"
        :note="draft"
        @finished="flight = 0"
      />
    </view>
    <text
      v-if="statusKey"
      class="support-feedback__status"
      :class="{ 'has-error': failed }"
      :role="failed ? 'alert' : 'status'"
      >{{ t(statusKey) }}</text
    >
  </CustomModal>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseInput from '@/components/base/base-input/base-input.vue';
import CustomModal from '@/components/common/CustomModal.vue';
import { BRAND } from '@/config/brand.js';
import { t } from '@/i18n/index.js';
import { isDesktopRuntime } from '@/services/desktop/runtime.js';
import SupportFeedbackFlight from './support-feedback-flight.vue';

defineProps({ title: { type: String, required: true }, isDark: Boolean });
const visible = defineModel('visible', { type: Boolean, default: false });
const draft = ref('');
const phase = ref('');
const flight = ref(0);
const focused = ref(true);
let operation = 0;
let releaseFocus;

const statusKeys = {
  opening: 'settings.feedbackOpening',
  opened: 'settings.feedbackOpened',
  requested: 'settings.feedbackRequested',
  openFailed: 'settings.feedbackOpenFailed',
  copied: 'settings.feedbackCopied',
  copyFailed: 'settings.copySupportFailed'
};
const statusKey = computed(() => statusKeys[phase.value]);
const busy = computed(() => phase.value === 'opening' || phase.value === 'copying');
const failed = computed(() => phase.value === 'openFailed' || phase.value === 'copyFailed');

function begin(next) {
  phase.value = next;
  flight.value = 0;
  return ++operation;
}
function finish(id, next) {
  if (id !== operation || !visible.value) return;
  phase.value = next;
  flight.value = next === 'opened' || next === 'requested' ? id : 0;
}
async function openDraft() {
  if (busy.value) return;
  const id = begin('opening');
  const note = draft.value.replace(/\r\n|\r|\n/g, '\r\n');
  try {
    if (isDesktopRuntime()) {
      await invoke('open_support_feedback', { note });
      finish(id, 'opened');
      return;
    }
    const url = `mailto:${BRAND.supportEmail}?subject=Yozi%20AI%20feedback&body=${encodeURIComponent(note)}`;
    // #ifdef APP-PLUS
    if (typeof plus !== 'undefined' && plus.runtime?.openURL) {
      plus.runtime.openURL(url, () => finish(id, 'openFailed'));
      if (phase.value === 'opening') finish(id, 'requested');
      return;
    }
    // #endif
    // #ifdef H5
    if (typeof window !== 'undefined') {
      window.location.href = url;
      finish(id, 'requested');
      return;
    }
    // #endif
    finish(id, 'openFailed');
  } catch {
    finish(id, 'openFailed');
  }
}
function copyEmail() {
  if (busy.value) return;
  const id = begin('copying');
  try {
    uni.setClipboardData({
      data: BRAND.supportEmail,
      showToast: false,
      success: () => finish(id, 'copied'),
      fail: () => finish(id, 'copyFailed')
    });
  } catch {
    finish(id, 'copyFailed');
  }
}
watch(
  visible,
  (open) => {
    if (open) return;
    begin('');
    draft.value = '';
  },
  { flush: 'sync' }
);
onMounted(() => {
  // #ifdef H5
  const updateFocus = () => (focused.value = document.hasFocus());
  window.addEventListener('focus', updateFocus);
  window.addEventListener('blur', updateFocus);
  updateFocus();
  releaseFocus = () => {
    window.removeEventListener('focus', updateFocus);
    window.removeEventListener('blur', updateFocus);
  };
  // #endif
});
onUnmounted(() => {
  operation++;
  releaseFocus?.();
});
</script>

<style scoped>
.support-feedback__stage {
  --feedback-flight-time: 3.2s;
  position: relative;
}
.support-feedback__fields {
  display: grid;
  gap: 14px;
}
.support-feedback__recipient {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  font-size: 13px;
  color: var(--ink-2);
}
.support-feedback__address {
  color: var(--ink);
  user-select: text;
}
.support-feedback__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.support-feedback__status {
  display: block;
  color: var(--ink-2);
  font-size: 13px;
}
.support-feedback__status.has-error {
  color: var(--danger);
}
@media (prefers-reduced-motion: no-preference) {
  .has-flight .support-feedback__fields {
    animation: feedback-fields-return var(--feedback-flight-time) both;
    animation-play-state: var(--feedback-flight-play);
  }
  @keyframes feedback-fields-return {
    0%,
    88% {
      visibility: hidden;
      opacity: 0;
    }
    89% {
      visibility: visible;
      opacity: 0;
      transform: translateY(4px);
    }
    100% {
      visibility: visible;
      opacity: 1;
      transform: translateY(0);
    }
  }
}
</style>
