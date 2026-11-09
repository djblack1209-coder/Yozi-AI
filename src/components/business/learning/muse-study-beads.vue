<template>
  <view class="study-beads">
    <BaseButton
      class="study-beads-trigger"
      variant="quiet"
      block
      align="start"
      aria-haspopup="dialog"
      :aria-expanded="open"
      @tap="show"
    >
      <view class="bead-card-copy">
        <text class="bead-title">{{ t('muse.beads.title') }}</text>
        <text class="bead-count">{{ periods[0].label }} · {{ periods[0].summary }}</text>
      </view>
      <view class="bead-streak" aria-hidden="true">
        <view v-for="day in recent" :key="day.day" class="bead-day" :class="{ earned: day.count > 0 }" />
      </view>
      <BaseIcon name="chevron-right" size="16px" />
    </BaseButton>
    <CustomModal
      :visible="open"
      :title="t('muse.beads.title')"
      :is-dark="dark"
      :show-actions="false"
      close-button
      mask-closable
      @cancel="open = false"
    >
      <view class="bead-periods" role="group" :aria-label="t('muse.beads.title')">
        <BaseButton
          v-for="(period, index) in periods"
          :key="period.key"
          variant="quiet"
          :selected="index === current"
          :aria-pressed="index === current"
          @tap="current = index"
          >{{ period.label }}</BaseButton
        >
      </view>
      <swiper
        class="bead-gallery"
        :class="{ 'is-opening': open }"
        :current="current"
        :duration="reduced ? 0 : 240"
        previous-margin="18px"
        next-margin="18px"
        @change="current = $event.detail.current"
      >
        <swiper-item v-for="(period, index) in periods" :key="period.key" :aria-hidden="index !== current || undefined">
          <view class="bead-gallery-card" :class="period.key">
            <text class="bead-title">{{ period.summary }}</text>
            <view class="bead-scene" aria-hidden="true" :class="{ empty: !period.earned }">
              <view class="bead-artwork" :class="{ 'is-selected': index === current }">
                <view v-for="(part, piece) in artwork" :key="piece" class="bead-piece" :style="part" />
              </view>
            </view>
            <view class="bead-week" role="group" :aria-label="period.label">
              <view
                v-for="day in period.days"
                :key="day.day"
                class="bead-date"
                role="img"
                :aria-label="t('muse.beads.day', { date: day.day, count: day.count })"
              >
                <view class="bead-day" :class="{ earned: day.count > 0 }" aria-hidden="true" />
                <text aria-hidden="true">{{ day.day.slice(5) }}</text>
              </view>
            </view>
          </view>
        </swiper-item>
      </swiper>
    </CustomModal>
  </view>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseIcon from '@/components/base/base-icon/base-icon.vue';
import CustomModal from '@/components/common/CustomModal.vue';
import { bindBusinessMotion } from '@/design/business-motion.js';
import { t } from '@/i18n/index.js';

const props = defineProps({
  recent: { type: Array, required: true },
  prior: { type: Array, required: true },
  dark: Boolean
});
const open = ref(false);
const current = ref(0);
const reduced = ref(true);
let releaseMotion = () => undefined;
const periods = computed(() =>
  ['recent', 'prior'].map((key) => {
    const days = props[key];
    const earned = days.filter((day) => day.count > 0).length;
    return { key, days, earned, label: t(`muse.beads.${key}`), summary: t('muse.beads.days', { days: earned }) };
  })
);
// Two curved leaves and a spine form an open notebook made of drilled beads.
const artwork = [-2, -1, 0, 1, 2].flatMap((row) =>
  [-3, -2, -1, 0, 1, 2, 3].map((column) => ({
    '--bead-x': `${column * 15}px`,
    '--bead-y': `${row * 13 + Math.abs(column) * -4}px`,
    '--bead-z': `${Math.abs(column) * 5 + (row === 0 ? 3 : 0)}px`,
    '--bead-light': column === 0 ? '#ebf3ff' : column < 0 ? 'var(--bead-left)' : 'var(--bead-right)'
  }))
);
function show() {
  current.value = 0;
  open.value = true;
}
onMounted(() => {
  releaseMotion = bindBusinessMotion((value) => (reduced.value = value));
});
onBeforeUnmount(() => releaseMotion());
</script>

<style scoped>
.study-beads :deep(.study-beads-trigger) {
  padding: 14px;
  border-radius: 17px;
  background: var(--muse-raised);
  color: var(--ink);
}
.study-beads :deep(.study-beads-trigger .base-button__content) {
  width: 100%;
  gap: 10px;
}
.bead-card-copy {
  flex: 1;
  min-width: 0;
  text-align: start;
}
.bead-title,
.bead-count {
  display: block;
}
.bead-title {
  font-size: 15px;
  font-weight: 650;
}
.bead-count {
  color: var(--ink-3);
  font-size: 12px;
}
.bead-streak,
.bead-periods,
.bead-week {
  display: flex;
  gap: 5px;
  align-items: center;
}
.bead-day {
  width: 13px;
  height: 13px;
  border: 1px solid var(--ink-4);
  border-radius: 50%;
}
.bead-day.earned {
  border-color: #77adff;
  background: radial-gradient(circle at 32% 24%, #e5f4ff, #6eaeff 37%, #1658b8 83%);
  box-shadow: 0 2px 4px #00244e38;
}
.bead-periods {
  justify-content: center;
  margin-bottom: 8px;
}
.bead-gallery {
  height: 236px;
}
.bead-gallery.is-opening {
  animation: bead-gallery-lift 240ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
}
@keyframes bead-gallery-lift {
  from {
    opacity: 0.5;
    transform: translateY(15px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
.bead-gallery-card {
  --bead-core: #162138;
  box-sizing: border-box;
  --bead-left: #a8d8ff;
  --bead-right: #7aabfb;
  --ink-4: #ffffff72;
  height: 100%;
  padding: 12px;
  margin-inline: 4px;
  border-radius: 18px;
  background: radial-gradient(ellipse at 50% 55%, #243957, #131f34 70%);
  color: #fff;
  text-align: center;
}
.bead-gallery-card.prior {
  --bead-left: #d4bfff;
  --bead-right: #ad99df;
  background: radial-gradient(ellipse at 50% 55%, #392c55, #201b37 70%);
}
.bead-scene {
  display: grid;
  place-items: center;
  height: 155px;
  perspective: 420px;
}
.bead-scene.empty {
  opacity: 0.5;
}
.bead-artwork {
  position: relative;
  width: 16px;
  height: 16px;
  transform-style: preserve-3d;
  transform: rotateX(22deg) rotateY(-16deg) rotateZ(-9deg);
}
.bead-artwork.is-selected {
  animation: bead-tilt 1800ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
}
.bead-piece {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  transform-style: preserve-3d;
  transform: translate3d(var(--bead-x), var(--bead-y), var(--bead-z));
  background:
    radial-gradient(circle at center, var(--bead-core) 15%, transparent 22%),
    radial-gradient(circle at 28% 24%, #fff 4%, var(--bead-light) 33%, #4471a9 78%, #283c68);
  box-shadow: inset 0 -2px 3px #0005;
}
.bead-piece::before {
  content: '';
  position: absolute;
  inset: 1px;
  transform: translateZ(-4px);
  border-radius: inherit;
  background: #4a6a9e;
}
@keyframes bead-tilt {
  from {
    transform: rotateX(34deg) rotateY(-33deg) rotateZ(-12deg);
  }
  to {
    transform: rotateX(22deg) rotateY(-16deg) rotateZ(-9deg);
  }
}
.bead-week {
  justify-content: space-between;
}
.bead-date {
  display: grid;
  justify-items: center;
  gap: 4px;
  font-size: 9px;
  color: #d5e3f4;
}
@media (prefers-reduced-motion: reduce) {
  .bead-gallery.is-opening,
  .bead-artwork.is-selected {
    animation: none;
  }
}
</style>
