<template>
  <view
    class="base-state"
    :class="[{ 'dark-mode': isDark, 'is-compact': compact }, `base-state--${state}`]"
    :role="state === 'error' ? 'alert' : 'status'"
    :aria-busy="state === 'loading'"
    aria-live="polite"
  >
    <view class="base-state__halo"
      ><YoziMascot :pose="pose || poses[state]" :size="mascotSize" :decorative="true"
    /></view>
    <text v-if="!compact" class="base-state__title">{{ title || t(`ui.state.${state}`) }}</text>
    <text v-if="desc && !compact" class="base-state__description">{{ desc }}</text>
    <BaseButton
      v-if="showButton && !compact"
      :variant="state === 'error' ? 'primary' : 'secondary'"
      small
      @tap="emit('action')"
      >{{ buttonText || t(state === 'error' ? 'ui.retry' : 'ui.add') }}</BaseButton
    >
  </view>
</template>
<script setup>
import { t } from '@/i18n/index.js';
import YoziMascot from '../yozi-mascot/yozi-mascot.vue';
import BaseButton from '../base-button/base-button.vue';
defineProps({
  state: { type: String, default: 'empty', validator: (value) => ['empty', 'loading', 'error'].includes(value) },
  title: { type: String, default: '' },
  desc: { type: String, default: '' },
  showButton: Boolean,
  buttonText: { type: String, default: '' },
  isDark: Boolean,
  compact: Boolean,
  mascotSize: { type: [String, Number], default: 'state' },
  pose: { type: String, default: '' },
  icon: { type: String, default: '' }
});
const emit = defineEmits(['action']);
const poses = { empty: 'think', loading: 'idle', error: 'encourage' };
</script>
<style scoped>
.base-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-4);
  padding: var(--s-8) var(--s-4);
  text-align: center;
  font-family: var(--font-ui);
}
.base-state__halo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--mascot-halo);
  height: var(--mascot-halo);
  border-radius: var(--r-pill);
  background: transparent;
}
.base-state--empty:not(.is-compact) .base-state__halo,
.base-state--error:not(.is-compact) .base-state__halo {
  animation: state-illustration-settle 520ms cubic-bezier(0.21, 0.78, 0.35, 1) both;
}
.base-state--empty:not(.is-compact) .base-state__halo {
  background: radial-gradient(circle, var(--blue-soft) 20%, transparent 72%);
}
.base-state--error:not(.is-compact) .base-state__halo {
  background: radial-gradient(circle, var(--coral-soft) 20%, transparent 72%);
}
@keyframes state-illustration-settle {
  0% {
    opacity: 0.35;
    transform: translateY(-12px) rotate(-8deg) scale(0.94);
  }
  64% {
    transform: translateY(2px) rotate(3deg) scale(1.03);
  }
  100% {
    opacity: 1;
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .base-state--empty:not(.is-compact) .base-state__halo,
  .base-state--error:not(.is-compact) .base-state__halo {
    animation: none;
  }
}
.base-state__title {
  color: var(--ink);
  font: var(--weight-ui-emphasis) var(--size-title-3)/var(--leading-title-3) var(--font-ui);
}
.base-state__description {
  color: var(--ink-3);
  font: var(--weight-regular) var(--size-small)/var(--leading-small) var(--font-ui);
}
.base-state.is-compact {
  padding: 0;
  display: inline-flex;
}
.is-compact .base-state__halo {
  width: auto;
  height: auto;
  background: transparent;
}
</style>
