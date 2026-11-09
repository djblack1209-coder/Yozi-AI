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
      :class="{ 'is-ticking': running }"
      :style="{ '--focus-minutes': minuteHand, '--focus-seconds': secondHand }"
    >
      <view class="focus-face" aria-hidden="true">
        <text class="focus-number focus-north">12</text>
        <text class="focus-number focus-east">3</text>
        <text class="focus-number focus-south">6</text>
        <text class="focus-number focus-west">9</text>
        <view class="focus-hand focus-hand--minute" />
        <view class="focus-hand focus-hand--second" />
      </view>
      <text class="focus-time" role="timer" aria-live="off" :aria-label="t('muse.focus.remaining', { time })">{{
        time
      }}</text>
    </view>
    <view class="focus-actions">
      <BaseButton variant="quiet" icon="refresh" :disabled="remaining === sessionLength" @tap="reset">{{
        t('muse.focus.reset')
      }}</BaseButton>
      <BaseButton variant="primary" :icon="running ? 'pause' : 'play'" @tap="toggle">{{
        t(running ? 'muse.focus.pause' : remaining && remaining < sessionLength ? 'muse.focus.resume' : 'muse.focus.start')
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
  inset: 4%;
  border-radius: 50%;
  background: repeating-conic-gradient(from -0.4deg, var(--line) 0deg 0.8deg, transparent 0.8deg 6deg);
  mask-image: radial-gradient(circle, transparent 66%, #000 66% 70%, transparent 70%);
  content: '';
}
.focus-face {
  position: absolute;
  inset: 0;
  color: var(--ink-3);
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
.focus-time {
  z-index: 1;
  border-radius: 999px;
  padding: 2px 12px;
  background: var(--muse-popover);
  color: var(--ink);
  font-size: clamp(24px, 7vw, 38px);
  font-variant-numeric: tabular-nums;
  font-weight: 650;
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
  .is-ticking .focus-hand--second {
    transition: none;
  }
}
</style>
