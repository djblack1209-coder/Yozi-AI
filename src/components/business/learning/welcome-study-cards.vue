<template>
  <view class="welcome-deck" role="region" :aria-label="t('landing.preview')">
    <view class="welcome-deck-controls">
      <view class="welcome-deck-steps" role="group" :aria-label="t('landing.preview')">
        <BaseButton
          v-for="(card, index) in cards"
          :key="card.id"
          class="welcome-deck-step"
          :class="{ 'is-current': current === index }"
          variant="quiet"
          :label="t(`landing.preview.${card.id}`)"
          :aria-current="current === index ? 'true' : undefined"
          @tap="select(index)"
          ><view class="welcome-deck-step-line" aria-hidden="true"
        /></BaseButton>
      </view>
      <BaseButton
        v-if="!reduced"
        class="welcome-deck-play"
        variant="quiet"
        :icon="autoplay ? 'pause' : 'play'"
        icon-only
        :label="t(autoplay ? 'landing.previewPause' : 'landing.previewPlay')"
        @tap="togglePlayback"
      />
    </view>
    <swiper
      class="welcome-deck-slider"
      :current="current"
      :autoplay="autoplay"
      :interval="2000"
      :duration="reduced ? 0 : 260"
      previous-margin="34px"
      next-margin="34px"
      @change="change"
    >
      <swiper-item v-for="(card, index) in cards" :key="card.id" :aria-hidden="current !== index || undefined">
        <view class="welcome-study-card" :class="[card.id, { 'is-moving': motion && current === index }]">
          <text class="welcome-study-card-label">{{ t(`landing.preview.${card.id}`) }}</text>
          <view class="welcome-study-card-art" aria-hidden="true">
            <BaseIcon :name="card.icon" :color="card.color" size="76px" />
          </view>
          <text class="welcome-study-card-copy">{{ t(`landing.preview.${card.id}Copy`) }}</text>
        </view>
      </swiper-item>
    </swiper>
  </view>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { onHide, onShow } from '@dcloudio/uni-app';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseIcon from '@/components/base/base-icon/base-icon.vue';
import { bindBusinessMotion } from '@/design/business-motion.js';
import { t } from '@/i18n/index.js';

const cards = [
  { id: 'explain', icon: 'book-open', color: '#9fc9ff' },
  { id: 'practice', icon: 'edit', color: '#b6e9f4' },
  { id: 'review', icon: 'clock', color: '#dae0ed' },
  { id: 'plan', icon: 'calendar', color: '#ddd1ff' }
];
const current = ref(0);
const playing = ref(true);
const reduced = ref(true);
const visible = ref(true);
const motion = computed(() => visible.value && playing.value && !reduced.value);
const autoplay = computed(() => motion.value && current.value < cards.length - 1);
let releaseMotion = () => undefined;

function change({ detail }) {
  current.value = detail.current;
  if (detail.source === 'touch') playing.value = false;
}
function select(index) {
  playing.value = false;
  current.value = index;
}
function togglePlayback() {
  if (autoplay.value) {
    playing.value = false;
    return;
  }
  if (current.value === cards.length - 1) current.value = 0;
  playing.value = true;
}
onMounted(() => {
  releaseMotion = bindBusinessMotion((value) => (reduced.value = value));
});
onBeforeUnmount(() => releaseMotion());
onShow(() => (visible.value = true));
onHide(() => (visible.value = false));
</script>

<style scoped>
.welcome-deck {
  width: min(100%, 390px);
  min-width: 0;
}
.welcome-deck-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  padding-inline: 34px;
}
.welcome-deck-steps {
  display: flex;
  flex: 1;
  min-width: 0;
}
.welcome-deck :deep(.welcome-deck-step) {
  flex: 1;
  min-width: 44px;
  padding: 0 4px;
}
.welcome-deck-step-line {
  width: 100%;
  height: 3px;
  border-radius: 2px;
  background: var(--line-strong);
}
.welcome-deck-step :deep(.base-button__content) {
  width: 100%;
}
.welcome-deck-step.is-current .welcome-deck-step-line {
  background: var(--violet-ink);
}
.welcome-deck :deep(.welcome-deck-play) {
  flex: none;
}
.welcome-deck-slider {
  height: clamp(225px, 37vh, 320px);
}
.welcome-study-card {
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  height: 100%;
  margin-inline: 5px;
  padding: clamp(17px, 5vw, 24px);
  overflow: hidden;
  border-radius: 20px;
  color: #f7fbff;
  background: var(--card-ink);
}
.welcome-study-card.explain {
  --card-ink: #172e56;
  --card-pattern: repeating-linear-gradient(120deg, transparent 0 16px, #a5d2ff57 17px 19px);
}
.welcome-study-card.practice {
  --card-ink: #253c53;
  --card-pattern: repeating-linear-gradient(0deg, transparent 0 20px, #9fe8f549 21px 23px);
}
.welcome-study-card.review {
  --card-ink: #243047;
  --card-pattern: radial-gradient(circle, #b0c4e181 1px, transparent 2px);
}
.welcome-study-card.plan {
  --card-ink: #312c58;
  --card-pattern: repeating-linear-gradient(90deg, transparent 0 16px, #bcabf97a 20px, transparent 27px);
}
.welcome-study-card::before {
  position: absolute;
  z-index: -1;
  inset: -28%;
  content: '';
  background-image: var(--card-pattern);
  background-size: 28px 28px;
  mask-image: radial-gradient(ellipse at center, #000 10%, transparent 68%);
}
.welcome-study-card.is-moving::before {
  animation: welcome-card-light 2s ease-in-out both;
}
@keyframes welcome-card-light {
  from {
    transform: translate3d(-8%, -3%, 0) rotate(-7deg);
  }
  to {
    transform: translate3d(8%, 3%, 0) rotate(7deg);
  }
}
.welcome-study-card-label {
  font-size: 14px;
  line-height: 22px;
  font-weight: 620;
}
.welcome-study-card-art {
  flex: 1;
  display: grid;
  place-items: center;
}
.welcome-study-card-copy {
  font-size: clamp(18px, 5vw, 23px);
  line-height: 1.25;
  font-weight: 650;
}
@media (prefers-reduced-motion: reduce) {
  .welcome-study-card.is-moving::before {
    animation: none;
  }
}
</style>
