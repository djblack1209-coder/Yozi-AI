<template>
  <view class="study-reminder-notice" role="region" :aria-label="title">
    <view class="study-reminder-notice__field" aria-hidden="true">
      <view class="study-reminder-notice__wave study-reminder-notice__wave--sky" />
      <view class="study-reminder-notice__wave study-reminder-notice__wave--violet" />
      <view class="study-reminder-notice__wave study-reminder-notice__wave--mint" />
    </view>
    <view class="study-reminder-notice__content">
      <view class="study-reminder-notice__header">
        <view class="study-reminder-notice__badge" aria-hidden="true"><BaseIcon name="clock" size="17px" /></view>
        <text class="study-reminder-notice__title">{{ title }}</text>
        <BaseButton variant="quiet" icon="x" icon-only :label="t('ui.close')" @tap="$emit('dismiss')" />
      </view>
      <text class="study-reminder-notice__message" role="status" aria-live="polite">{{ message }}</text>
      <BaseButton variant="primary" icon="arrow-right" @tap="$emit('action')">{{ actionLabel }}</BaseButton>
    </view>
  </view>
</template>

<script setup>
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseIcon from '@/components/base/base-icon/base-icon.vue';
import { t } from '@/i18n/index.js';

defineProps({
  title: { type: String, required: true },
  message: { type: String, required: true },
  actionLabel: { type: String, required: true }
});
defineEmits(['action', 'dismiss']);
</script>

<style scoped>
.study-reminder-notice {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 22px;
  background: var(--paper);
  color: var(--ink);
  box-shadow: var(--lift-2);
}
.study-reminder-notice__field {
  position: absolute;
  z-index: -1;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.study-reminder-notice__field::after {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(
    128deg,
    color-mix(in srgb, var(--paper) 45%, transparent),
    color-mix(in srgb, var(--paper) 86%, transparent) 48%,
    color-mix(in srgb, var(--paper) 54%, transparent)
  );
  box-shadow:
    inset 0 1px 1px #eef7ff50,
    inset 0 -1px 2px #66a8e733;
  content: '';
}
.study-reminder-notice__wave {
  position: absolute;
  width: 89%;
  height: 100%;
  border-radius: 44% 56% 58% 42% / 57% 37% 63% 43%;
  filter: blur(11px);
  opacity: 0.44;
}
.study-reminder-notice__wave--sky {
  inset: -42% auto auto -21%;
  transform: rotate(-24deg);
  background:
    radial-gradient(ellipse at 68% 70%, #c8f7ff 1%, transparent 43%),
    conic-gradient(from 180deg, #2f90de, #50baff 23%, #adddff 34%, transparent 68%);
}
.study-reminder-notice__wave--violet {
  inset: auto -19% -49% auto;
  transform: rotate(-26deg);
  background:
    radial-gradient(ellipse at 34% 26%, #c1a6ff 2%, transparent 53%),
    conic-gradient(from 352deg, #6582f1, #a584ed 19%, #d7acff 38%, transparent 65%);
}
.study-reminder-notice__wave--mint {
  inset: auto auto -62% -3%;
  transform: rotate(17deg);
  background: radial-gradient(ellipse at 30% 23%, #d2f8e6 8%, #78d8ca 36%, #a7dcff00 74%);
}
.study-reminder-notice__content {
  display: grid;
  justify-items: start;
  gap: 10px;
  padding: 12px 16px 16px;
}
.study-reminder-notice__header {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
}
.study-reminder-notice__badge {
  display: grid;
  width: 32px;
  height: 32px;
  flex: none;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--paper);
  color: var(--blue);
}
.study-reminder-notice__title {
  flex: 1;
  min-width: 0;
  font-size: 16px;
  font-weight: 650;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.study-reminder-notice__message {
  font-size: 14px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
@media (prefers-reduced-motion: no-preference) {
  .study-reminder-notice__wave--sky {
    animation: reminder-sky-wave 9.2s ease-in-out both;
  }
  .study-reminder-notice__wave--violet {
    animation: reminder-violet-wave 9.2s ease-in-out both;
  }
  .study-reminder-notice__wave--mint {
    animation: reminder-mint-wave 9.2s ease-in-out both;
  }
  @keyframes reminder-sky-wave {
    0% {
      transform: translate(-52%, 28%) rotate(-24deg) scale(0.85);
      opacity: 0.16;
    }
    22% {
      transform: translate(20%, 14%) rotate(8deg) scale(1.2);
      opacity: 0.83;
    }
    46% {
      transform: translate(76%, -32%) rotate(32deg) scale(0.9);
      opacity: 0.22;
    }
    66% {
      transform: translate(54%, -27%) rotate(3deg);
      opacity: 0.24;
    }
    100% {
      transform: rotate(-24deg);
      opacity: 0.44;
    }
  }
  @keyframes reminder-violet-wave {
    0%,
    21% {
      transform: translate(53%, 26%) rotate(-26deg) scale(0.9);
      opacity: 0.19;
    }
    44% {
      transform: translate(-33%, -28%) rotate(-2deg) scale(1.18);
      opacity: 0.82;
    }
    68% {
      transform: translate(-64%, 6%) rotate(14deg);
      opacity: 0.25;
    }
    100% {
      transform: rotate(-26deg);
      opacity: 0.44;
    }
  }
  @keyframes reminder-mint-wave {
    0%,
    41% {
      transform: translate(-40%, 18%) rotate(17deg);
      opacity: 0.17;
    }
    66% {
      transform: translate(31%, -45%) rotate(-14deg) scale(1.15);
      opacity: 0.75;
    }
    88%,
    100% {
      transform: rotate(17deg);
      opacity: 0.44;
    }
  }
}
</style>
