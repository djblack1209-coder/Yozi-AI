<template>
  <view class="study-progress-card">
    <text class="study-progress-title" role="heading" aria-level="2">{{ t('muse.studyToday') }}</text>
    <view class="study-progress-days" role="group" :aria-label="t('muse.beads.recent')">
      <view
        v-for="(day, index) in days"
        :key="day.day"
        class="study-progress-day"
        :class="{ learned: day.count > 0 }"
        :style="{ '--day-delay': `${index * 30}ms` }"
        role="img"
        :aria-label="t('muse.beads.day', { date: day.day, count: day.count })"
      >
        <BaseIcon :name="day.count ? 'check' : 'calendar'" :tone="day.count ? 'blue' : 'ink-3'" size="17px" />
        <text aria-hidden="true">{{ day.day.slice(5) }}</text>
      </view>
    </view>
    <view
      class="study-progress-meter"
      role="progressbar"
      :aria-label="t('muse.studyToday')"
      aria-valuemin="0"
      :aria-valuemax="total"
      :aria-valuenow="completed"
      :style="{ '--study-target': `${(completed / total) * 180}deg` }"
    >
      <view class="study-progress-arc" aria-hidden="true" />
      <text class="study-progress-number">{{ completed }}</text>
      <text class="study-progress-copy">{{ t('muse.studyTasks', { done: completed, total }) }}</text>
    </view>
  </view>
</template>

<script setup>
import BaseIcon from '@/components/base/base-icon/base-icon.vue';
import { t } from '@/i18n/index.js';
defineProps({
  completed: { type: Number, required: true },
  total: { type: Number, required: true },
  days: { type: Array, required: true }
});
</script>

<style scoped>
@property --study-sweep {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}
.study-progress-card {
  padding: 18px 16px 14px;
  border: 1px solid var(--line);
  border-radius: 21px;
  background: var(--muse-popover);
}
.study-progress-title {
  font-size: 16px;
  font-weight: 650;
}
.study-progress-days {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
  margin: 14px 0 21px;
}
.study-progress-day {
  display: grid;
  justify-items: center;
  gap: 3px;
  font-size: 10px;
  color: var(--ink-3);
  animation: study-day-in 220ms ease-out var(--day-delay) both;
}
@keyframes study-day-in {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.study-progress-meter {
  position: relative;
  width: min(100%, 245px);
  aspect-ratio: 2;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding-bottom: 2px;
  isolation: isolate;
}
.study-progress-arc {
  position: absolute;
  z-index: -1;
  inset: 0;
  border-radius: 50% 50% 0 0 / 100% 100% 0 0;
  --study-sweep: var(--study-target);
  background: conic-gradient(
    from 270deg at 50% 100%,
    #59c4f5 0deg,
    #087cc1 var(--study-sweep),
    var(--muse-raised) var(--study-sweep) 180deg,
    transparent 180deg
  );
  animation: study-arc-in 720ms cubic-bezier(0.18, 0.72, 0.18, 1) 130ms both;
}
.study-progress-arc::after {
  position: absolute;
  inset: 16px 16px 0;
  border-radius: inherit;
  background: var(--muse-popover);
  content: '';
}
@keyframes study-arc-in {
  from {
    --study-sweep: 0deg;
  }
  to {
    --study-sweep: var(--study-target);
  }
}
.study-progress-number {
  font-size: clamp(36px, 10vw, 55px);
  font-weight: 660;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  animation: study-number-in 460ms ease-out 300ms both;
}
@keyframes study-number-in {
  from {
    opacity: 0;
    filter: blur(5px);
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    filter: blur(0);
    transform: translateY(0);
  }
}
.study-progress-copy {
  font-size: 12px;
  color: var(--ink-3);
}
@media (prefers-reduced-motion: reduce) {
  .study-progress-day,
  .study-progress-arc,
  .study-progress-number {
    animation: none;
  }
}
</style>
