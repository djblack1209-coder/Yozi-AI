<template>
  <view class="quickstart" role="region" :aria-label="t('quickstart.title')">
    <view class="quickstart-heading">
      <text class="quickstart-title" role="heading" aria-level="2">{{ t('quickstart.title') }}</text>
      <BaseButton
        v-if="!reduced"
        variant="quiet"
        :icon="playing ? 'pause' : 'play'"
        icon-only
        :label="t(playing ? 'quickstart.pause' : 'quickstart.replay')"
        @tap="playing ? stop() : play()"
      />
    </view>
    <view class="quickstart-grid">
      <view class="quickstart-steps" role="group" :aria-label="t('quickstart.steps')">
        <BaseButton
          v-for="(step, index) in steps"
          :key="step.id"
          class="quickstart-step"
          variant="quiet"
          align="start"
          :selected="current === index"
          :aria-pressed="current === index"
          @tap="select(index)"
        >
          <text class="quickstart-step-number" aria-hidden="true">0{{ index + 1 }}</text>
          <text>{{ t(`quickstart.${step.id}`) }}</text>
        </BaseButton>
      </view>
      <view class="quickstart-stage" :class="{ 'is-moving': !reduced }" aria-hidden="true">
        <text class="quickstart-caption">{{ t('quickstart.diagram') }}</text>
        <Transition name="quickstart-swap">
          <view :key="`${current}:${replay}`" class="quickstart-scene" :class="active.id">
            <template v-if="active.id === 'practice'">
              <view class="quickstart-sheet quickstart-back second" />
              <view class="quickstart-sheet quickstart-back first" />
            </template>
            <view v-if="active.id === 'review'" class="quickstart-sheet quickstart-index">
              <BaseIcon name="book-open" size="18px" />
              <view v-for="line in 3" :key="line" class="quickstart-rule" />
            </view>
            <view class="quickstart-sheet quickstart-front">
              <view class="quickstart-sheet-title">
                <BaseIcon :name="active.icon" size="17px" />
                <text>{{ t(`quickstart.${active.id}`) }}</text>
              </view>
              <view v-for="label in active.labels" :key="label" class="quickstart-art-row">
                <text>{{ t(`quickstart.${label}`) }}</text>
                <view class="quickstart-rule" />
              </view>
            </view>
          </view>
        </Transition>
      </view>
      <view class="quickstart-details" @focusin="stop" @pointerdown="stop" @touchstart="stop">
        <text>{{ t(`quickstart.${active.id}Description`) }}</text>
        <BaseButton variant="secondary" @tap="openActive">{{ t(`quickstart.${active.id}Action`) }}</BaseButton>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { onHide } from '@dcloudio/uni-app';
import '@/i18n/messages/quickstart.js';
import { t } from '@/i18n/index.js';
import { bindBusinessMotion } from '@/design/business-motion.js';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseIcon from '@/components/base/base-icon/base-icon.vue';

const emit = defineEmits(['open']);
const steps = [
  { id: 'connect', icon: 'shapes', labels: ['provider', 'apiKey', 'model'] },
  { id: 'practice', icon: 'edit', labels: ['goal', 'answer', 'submit'] },
  { id: 'review', icon: 'book-open', labels: ['original', 'feedback', 'retry'] }
];
const current = ref(0);
const active = computed(() => steps[current.value]);
const reduced = ref(true);
const playing = ref(false);
const replay = ref(0);
let timers = [];
let releaseMotion;

function stop() {
  timers.forEach((timer) => clearTimeout(timer));
  timers = [];
  playing.value = false;
}
function select(index) {
  stop();
  current.value = index;
}
function play() {
  stop();
  current.value = 0;
  replay.value++;
  playing.value = true;
  timers = [
    setTimeout(() => (current.value = 1), 2250),
    setTimeout(() => (current.value = 2), 4000),
    setTimeout(stop, 7232)
  ];
}
function openActive() {
  stop();
  emit('open', active.value.id);
}

onMounted(() => {
  releaseMotion = bindBusinessMotion((value) => {
    reduced.value = value;
    if (value) stop();
    else play();
  });
});
onHide(stop);
onBeforeUnmount(() => {
  stop();
  releaseMotion?.();
});
</script>

<style scoped>
.quickstart {
  container: quickstart / inline-size;
  box-sizing: border-box;
  width: 100%;
  max-width: 720px;
  margin-bottom: 16px;
  padding: 12px 14px 16px;
  border: 1px solid var(--workspace-border);
  border-radius: 16px;
  color: var(--ink);
  background: var(--muse-settings-card, var(--workspace-frame));
}
.quickstart-heading,
.quickstart-sheet-title,
.quickstart-art-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.quickstart-heading {
  justify-content: space-between;
  min-height: 44px;
  margin-bottom: 8px;
}
.quickstart-title {
  font-size: 17px;
  font-weight: 680;
}
.quickstart-grid {
  display: grid;
  gap: 12px;
}
.quickstart-steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
}
.quickstart-steps :deep(.quickstart-step) {
  min-width: 0;
  padding: 4px 6px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--ink-2);
}
.quickstart-step :deep(.base-button__content) {
  display: flex;
  flex-wrap: wrap;
  column-gap: 4px;
  text-align: start;
}
.quickstart-steps :deep(.quickstart-step.is-selected) {
  background: var(--workspace-active);
  color: var(--ink);
}
.quickstart-step-number {
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}
.quickstart-stage {
  position: relative;
  isolation: isolate;
  grid-row: 1;
  display: grid;
  min-height: 210px;
  overflow: hidden;
  border-radius: 12px;
  background: var(--workspace-side);
}
.quickstart-stage::before {
  position: absolute;
  inset: -18%;
  background:
    radial-gradient(ellipse at 22% 84%, #d5effd 0, transparent 56%),
    radial-gradient(ellipse at 82% 24%, #8cd0f7 0, transparent 58%), #aedcf9;
  filter: blur(18px);
  content: '';
}
.quickstart-caption {
  position: relative;
  z-index: 2;
  align-self: start;
  justify-self: start;
  margin: 10px;
  padding: 4px 8px;
  border-radius: 5px;
  background: #fdfdfcd9;
  color: #11243d;
  font-size: 11px;
}
.quickstart-scene {
  position: absolute;
  inset: 0;
}
.quickstart-sheet {
  position: absolute;
  box-sizing: border-box;
  border: 1px solid #11243d28;
  border-radius: 9px;
  background: #fdfdfc;
  color: #11243d;
  box-shadow: 0 9px 26px #11243d22;
}
.quickstart-front {
  inset: 21% 12% auto;
  padding: 10px;
}
.quickstart-sheet-title {
  min-width: 0;
  padding-bottom: 8px;
  border-bottom: 1px solid #11243d18;
  font-size: 13px;
  font-weight: 650;
}
.quickstart-art-row {
  justify-content: space-between;
  min-height: 26px;
  border-bottom: 1px solid #11243d13;
  font-size: 11px;
}
.quickstart-art-row:last-child {
  border-bottom: 0;
}
.quickstart-rule {
  flex: 0 0 20%;
  height: 4px;
  border-radius: 2px;
  background: #aedcf9;
}
.quickstart-back {
  inset: 16% 15% auto;
  height: 82px;
  background: #e8f6ff;
  transform: rotate(-4deg);
}
.quickstart-back.second {
  inset: 12% 18% auto;
  transform: rotate(3deg);
}
.quickstart-index {
  inset: 28% auto auto 8%;
  display: grid;
  gap: 9px;
  width: 26%;
  padding: 12px 9px;
  background: #edf7fd;
}
.quickstart-scene.review .quickstart-front {
  inset: 20% 7% auto 31%;
}
.quickstart-details {
  display: grid;
  align-content: center;
  justify-items: start;
  gap: 12px;
  min-width: 0;
  color: var(--ink-2);
  font-size: 14px;
  line-height: 1.55;
}
@container quickstart (min-width: 570px) {
  .quickstart-grid {
    grid-template-columns: minmax(104px, 0.85fr) minmax(208px, 1.7fr) minmax(132px, 1fr);
    align-items: center;
  }
  .quickstart-steps {
    grid-template-columns: minmax(0, 1fr);
  }
  .quickstart-stage {
    grid-column: 2;
  }
}
@media (prefers-reduced-motion: no-preference) {
  .is-moving.quickstart-stage::before {
    animation: quickstart-gradient-in 480ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .is-moving .quickstart-front {
    animation: quickstart-rise 440ms cubic-bezier(0.16, 1, 0.3, 1) 110ms both;
  }
  .is-moving .quickstart-back {
    animation: quickstart-lift 300ms cubic-bezier(0.16, 1, 0.3, 1) 810ms both;
  }
  .is-moving .quickstart-back.second {
    animation-delay: 930ms;
  }
  .is-moving .quickstart-index {
    animation: quickstart-slide 330ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .is-moving .review .quickstart-front {
    animation-delay: 170ms;
  }
  .is-moving .quickstart-swap-leave-active {
    transition:
      opacity 140ms ease,
      transform 190ms ease;
  }
  .is-moving .quickstart-swap-leave-to {
    transform: translateY(12px) scale(0.98);
    opacity: 0;
  }
}
@keyframes quickstart-gradient-in {
  from {
    transform: scale(0.88);
    opacity: 0;
  }
}
@keyframes quickstart-rise {
  from {
    transform: translateY(24px) scale(0.97);
    opacity: 0;
  }
}
@keyframes quickstart-lift {
  from {
    translate: 0 28px;
    opacity: 0;
  }
}
@keyframes quickstart-slide {
  from {
    transform: translateX(-24px);
    opacity: 0;
  }
}
</style>
