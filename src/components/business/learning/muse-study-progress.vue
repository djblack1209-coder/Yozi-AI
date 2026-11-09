<template>
  <view class="study-progress-card" :class="{ 'is-open': open }">
    <view role="heading" aria-level="2">
      <BaseButton
        class="study-progress-toggle"
        variant="quiet"
        block
        :aria-expanded="open"
        aria-controls="study-progress-details"
        :label="`${t('muse.studyToday')} · ${t('muse.studyTasks', { done: completed, total })}`"
        @tap="open = !open"
      >
        <view class="study-progress-heading">
          <text class="study-progress-title">{{ t('muse.studyToday') }}</text>
          <text class="study-progress-total">{{ completed }} / {{ total }}</text>
          <BaseIcon class="study-progress-chevron" name="chevron-down" size="18px" />
        </view>
      </BaseButton>
    </view>
    <view id="study-progress-details" class="study-progress-details" :aria-hidden="!open">
      <view class="study-progress-body">
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
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue';
import BaseIcon from '@/components/base/base-icon/base-icon.vue';
import BaseButton from '@/components/base/base-button/base-button.vue';
import { t } from '@/i18n/index.js';
defineProps({
  completed: { type: Number, required: true },
  total: { type: Number, required: true },
  days: { type: Array, required: true }
});
const open = ref(false);
</script>

<style scoped>
@property --study-sweep {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}
.study-progress-card {
  display: grid;
  grid-template-rows: auto 0fr;
  width: min(100%, 305px);
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 25px;
  background: var(--muse-popover);
  transition:
    width 360ms cubic-bezier(0.19, 0.82, 0.25, 1),
    grid-template-rows 360ms cubic-bezier(0.19, 0.82, 0.25, 1),
    border-radius 300ms ease;
}
.study-progress-card.is-open {
  width: min(100%, 620px);
  grid-template-rows: auto 1fr;
  border-radius: 21px;
}
.study-progress-toggle {
  min-height: 46px;
  padding-inline: 14px;
  border-radius: 24px;
  color: var(--ink);
}
.study-progress-toggle :deep(.base-button__content) {
  width: 100%;
}
.study-progress-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.study-progress-title {
  flex: 1;
  font-size: 14px;
  font-weight: 650;
  text-align: left;
}
.study-progress-total {
  color: var(--ink-3);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.study-progress-chevron {
  flex: none;
  transition: transform 280ms ease;
}
.is-open .study-progress-chevron {
  transform: rotate(180deg);
}
.study-progress-details {
  min-height: 0;
  overflow: hidden;
}
.study-progress-body {
  padding: 2px 16px 14px;
  opacity: 0;
  transform: translateY(-4px);
  filter: blur(5px);
  transition: opacity 130ms ease, filter 190ms ease, transform 240ms ease;
}
.is-open .study-progress-body {
  opacity: 1;
  transform: none;
  filter: none;
  transition-delay: 90ms;
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
}
.is-open .study-progress-day {
  animation: study-day-in 220ms ease-out calc(95ms + var(--day-delay)) both;
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
}
.is-open .study-progress-arc {
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
}
.is-open .study-progress-number {
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
  .study-progress-card,
  .study-progress-chevron,
  .study-progress-body {
    transition: none;
  }
  .is-open .study-progress-day,
  .is-open .study-progress-arc,
  .is-open .study-progress-number {
    animation: none;
  }
}
</style>
