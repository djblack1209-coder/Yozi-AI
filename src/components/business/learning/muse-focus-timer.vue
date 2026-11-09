<template>
  <CustomModal
    :visible="visible"
    :title="t('muse.focus.title')"
    :is-dark="theme.isDark"
    :show-actions="false"
    close-button
    mask-closable
    @cancel="$emit('close')"
  >
    <view
      class="focus-dial"
      :class="{ 'is-ticking': running, 'is-reset': remaining === sessionLength }"
      :style="{ '--focus-minutes': minuteHand, '--focus-seconds': secondHand }"
    >
      <view class="focus-light" aria-hidden="true" />
      <view class="focus-face" aria-hidden="true">
        <text class="focus-number focus-north">12</text>
        <text class="focus-number focus-east">3</text>
        <text class="focus-number focus-south">6</text>
        <text class="focus-number focus-west">9</text>
        <view class="focus-hand focus-hand--minute" />
        <view class="focus-hand focus-hand--second" />
      </view>
      <view class="focus-glass">
        <text class="focus-time" role="timer" aria-live="off" :aria-label="t('muse.focus.remaining', { time })">{{
          time
        }}</text>
      </view>
    </view>
    <view class="focus-actions">
      <BaseButton variant="quiet" icon="refresh" :disabled="remaining === sessionLength" @tap="reset">{{
        t('muse.focus.reset')
      }}</BaseButton>
      <BaseButton variant="primary" :icon="running ? 'pause' : 'play'" @tap="toggle">{{
        t(
          running
            ? 'muse.focus.pause'
            : remaining && remaining < sessionLength
              ? 'muse.focus.resume'
              : 'muse.focus.start'
        )
      }}</BaseButton>
    </view>
    <text v-if="remaining === 0" class="focus-status" role="status">{{ t('muse.focus.finished') }}</text>
  </CustomModal>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue';
import CustomModal from '@/components/common/CustomModal.vue';
import BaseButton from '@/components/base/base-button/base-button.vue';
import { useThemeStore } from '@/stores/modules/theme.js';
import { t } from '@/i18n/index.js';

const props = defineProps({ visible: Boolean });
defineEmits(['close']);
const theme = useThemeStore();
const sessionSeconds = 25 * 60;
const sessionLength = sessionSeconds * 1000;
const remaining = ref(sessionLength);
const running = ref(false);
let deadline;
let ticker;
const seconds = computed(() => Math.ceil(remaining.value / 1000));
const elapsed = computed(() => sessionSeconds - seconds.value);
const minuteHand = computed(() => `${(elapsed.value / sessionSeconds) * 360}deg`);
const secondHand = computed(() => `${elapsed.value * 6}deg`);
const time = computed(() =>
  [Math.floor(seconds.value / 60), seconds.value % 60].map((part) => String(part).padStart(2, '0')).join(':')
);

function stop() {
  clearInterval(ticker);
  running.value = false;
}
function readClock() {
  remaining.value = Math.max(0, deadline - Date.now());
  if (remaining.value === 0) stop();
}
function pause() {
  if (!running.value) return;
  readClock();
  stop();
}
function reset() {
  stop();
  remaining.value = sessionLength;
}
function toggle() {
  if (running.value) return pause();
  if (!remaining.value) reset();
  deadline = Date.now() + remaining.value;
  running.value = true;
  ticker = setInterval(readClock, 250);
}
watch(
  () => props.visible,
  (visible) => {
    if (!visible) pause();
  }
);
onUnmounted(stop);
</script>

<style scoped>
.focus-dial {
  --focus-light-cycle: 11.7s;
  --focus-sky: color-mix(in srgb, var(--blue) 50%, var(--muse-popover));
  --focus-mint: color-mix(in srgb, var(--mint) 44%, var(--muse-popover));
  --focus-violet: color-mix(in srgb, #9c8ee8 62%, var(--muse-popover));
  --focus-warm: color-mix(in srgb, #ffe7a3 68%, var(--muse-popover));
  position: relative;
  display: grid;
  width: min(100%, 280px);
  aspect-ratio: 1;
  margin: 10px auto 18px;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: radial-gradient(ellipse at 32% 26%, var(--muse-popover), var(--muse-raised));
  box-shadow: inset 0 0 26px color-mix(in srgb, var(--ink) 8%, transparent);
  isolation: isolate;
}
.focus-dial::before {
  position: absolute;
  z-index: 1;
  inset: 4%;
  border-radius: 50%;
  background: repeating-conic-gradient(from -0.4deg, var(--line) 0deg 0.8deg, transparent 0.8deg 6deg);
  mask-image: radial-gradient(circle, transparent 66%, #000 66% 70%, transparent 70%);
  content: '';
}
.focus-light {
  position: absolute;
  inset: 1px;
  overflow: hidden;
  border-radius: inherit;
  background:
    radial-gradient(ellipse at 72% 72%, var(--blue-soft), transparent 70%),
    radial-gradient(ellipse at 18% 8%, var(--muse-popover), var(--muse-raised));
}
.focus-light::before,
.focus-light::after {
  position: absolute;
  inset: -22%;
  content: '';
}
.focus-light::before {
  background: conic-gradient(
    from 106deg at 33% 23%,
    transparent 0deg 18deg,
    var(--focus-sky) 23deg 36deg,
    var(--focus-violet) 42deg 54deg,
    transparent 70deg 82deg,
    var(--focus-warm) 89deg 98deg,
    var(--focus-mint) 107deg 118deg,
    transparent 146deg
  );
  filter: blur(8px);
  opacity: 0.62;
  transform: translate(-8%, -3%) rotate(-14deg);
  animation: focus-light-fan var(--focus-light-cycle) ease-in-out infinite paused;
}
.focus-light::after {
  background: linear-gradient(
    132deg,
    transparent 22% 27%,
    var(--focus-violet) 34%,
    var(--focus-sky) 43% 47%,
    transparent 53%,
    var(--focus-mint) 59%,
    transparent 69%
  );
  filter: blur(11px);
  opacity: 0.21;
  transform: translate(-18%, -12%) rotate(-9deg);
  animation: focus-light-band var(--focus-light-cycle) ease-in-out infinite paused;
}
.focus-face {
  position: absolute;
  z-index: 1;
  inset: 0;
  color: var(--ink-2);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}
.focus-number {
  position: absolute;
}
.focus-north,
.focus-south {
  left: 50%;
  transform: translateX(-50%);
}
.focus-north {
  top: 10%;
}
.focus-south {
  bottom: 10%;
}
.focus-east,
.focus-west {
  top: 50%;
  transform: translateY(-50%);
}
.focus-east {
  right: 10%;
}
.focus-west {
  left: 10%;
}
.focus-hand {
  position: absolute;
  inset: 18% auto 50% 50%;
  width: 1px;
  background: #4089ac;
  transform-origin: bottom center;
  transform: rotate(var(--focus-minutes));
}
.focus-hand--second {
  inset-block-start: 12%;
  background: #d27158;
  transform: rotate(var(--focus-seconds));
}
.is-ticking .focus-hand--second {
  transition: transform 240ms ease-out;
}
.focus-glass {
  position: relative;
  z-index: 2;
  display: grid;
  min-width: 122px;
  padding: 4px 15px 5px;
  overflow: hidden;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--muse-popover) 64%, var(--focus-sky));
  border-radius: 999px;
  background: linear-gradient(
    166deg,
    color-mix(in srgb, var(--muse-popover) 76%, transparent),
    color-mix(in srgb, var(--muse-popover) 47%, transparent)
  );
  box-shadow:
    inset 0 1px 1px #ffffff9c,
    inset 0 -1px 1px color-mix(in srgb, var(--focus-sky) 49%, transparent),
    0 5px 15px color-mix(in srgb, var(--ink) 13%, transparent);
  -webkit-backdrop-filter: blur(7px) saturate(1.32);
  backdrop-filter: blur(7px) saturate(1.32);
}
.focus-glass::before {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 0%, #ffffffb0, transparent 56%);
  content: '';
  opacity: 0.38;
  transform: translateX(-44%);
  animation: focus-glass-rim var(--focus-light-cycle) ease-in-out infinite paused;
}
.focus-time {
  position: relative;
  color: var(--ink);
  font-size: clamp(24px, 7vw, 38px);
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  line-height: 1.12;
}
.is-ticking .focus-light::before,
.is-ticking .focus-light::after,
.is-ticking .focus-glass::before {
  animation-play-state: running;
}
.is-reset:not(.is-ticking) .focus-light::before,
.is-reset:not(.is-ticking) .focus-light::after,
.is-reset:not(.is-ticking) .focus-glass::before {
  animation: none;
}
@keyframes focus-light-fan {
  0%,
  100% {
    transform: translate(-8%, -3%) rotate(-14deg);
    opacity: 0.62;
  }
  24% {
    transform: translate(8%, -8%) rotate(18deg);
    opacity: 0.77;
  }
  53% {
    transform: translate(18%, 3%) rotate(47deg) scale(1.11);
    opacity: 0.96;
  }
  74% {
    transform: translate(-4%, 11%) rotate(22deg);
    opacity: 0.78;
  }
}
@keyframes focus-light-band {
  0%,
  100% {
    transform: translate(-18%, -12%) rotate(-9deg);
    opacity: 0.21;
  }
  28% {
    transform: translate(7%, 5%) rotate(5deg);
    opacity: 0.56;
  }
  51% {
    transform: translate(18%, -4%) rotate(13deg);
    opacity: 0.68;
  }
  75% {
    transform: translate(-4%, 7%) rotate(1deg);
    opacity: 0.34;
  }
}
@keyframes focus-glass-rim {
  0%,
  100% {
    transform: translateX(-44%);
    opacity: 0.38;
  }
  25% {
    transform: translateX(-12%);
    opacity: 0.72;
  }
  52% {
    transform: translateX(35%);
    opacity: 0.85;
  }
  75% {
    transform: translateX(14%);
    opacity: 0.48;
  }
}
.focus-actions {
  display: flex;
  justify-content: center;
  gap: 8px;
}
.focus-status {
  display: block;
  margin-top: 9px;
  color: var(--ink-3);
  text-align: center;
}
@media (prefers-reduced-motion: reduce) {
  .focus-light::before,
  .focus-light::after,
  .focus-glass::before {
    animation: none;
  }
  .is-ticking .focus-hand--second {
    transition: none;
  }
}
</style>
