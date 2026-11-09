<template>
  <view class="study-trend" :class="{ 'is-open': expanded }">
    <BaseButton
      class="study-trend-trigger"
      variant="quiet"
      align="start"
      :aria-expanded="expanded"
      aria-controls="study-trend-detail"
      @tap="toggle"
    >
      <text class="study-trend-total">{{ t(totalLabel, { count: total }) }}</text>
      <image class="study-trend-spark" :src="lineSource" mode="scaleToFill" aria-hidden="true" />
      <BaseIcon class="study-trend-chevron" name="chevron-down" size="18px" />
    </BaseButton>
    <view id="study-trend-detail" class="study-trend-detail" :inert="!expanded || undefined" :aria-hidden="!expanded">
      <view class="study-trend-clip">
        <view class="study-trend-body">
          <view class="study-trend-periods" role="group" :aria-label="t('muse.studyTrendPeriod')">
            <BaseButton
              v-for="option in ['recent', 'prior']"
              :key="option"
              variant="quiet"
              :selected="period === option"
              :aria-pressed="period === option"
              @tap="selectPeriod(option)"
              >{{ t(`muse.studyTrendPeriod.${option}`) }}</BaseButton
            >
          </view>
          <text class="study-trend-value">{{ selected.count }}</text>
          <text class="study-trend-date">{{ t('muse.beads.day', { date: selected.day, count: selected.count }) }}</text>
          <image :key="period" class="study-trend-graph" :src="lineSource" mode="scaleToFill" aria-hidden="true" />
          <!-- #ifdef H5 -->
          <component
            :is="'input'"
            class="study-trend-slider"
            type="range"
            min="0"
            :max="days.length - 1"
            step="1"
            :value="index"
            :tabindex="expanded ? 0 : -1"
            :aria-label="t('muse.studyTrendDay')"
            :aria-valuetext="t('muse.beads.day', { date: selected.day, count: selected.count })"
            @input="index = Number($event.target.value)"
          />
          <!-- #endif -->
          <!-- #ifndef H5 -->
          <slider
            :value="index"
            :max="days.length - 1"
            :aria-label="t('muse.studyTrendDay')"
            active-color="#2681b8"
            @changing="index = $event.detail.value"
            @change="index = $event.detail.value"
          />
          <!-- #endif -->
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseIcon from '@/components/base/base-icon/base-icon.vue';
import { t } from '@/i18n/index.js';

const props = defineProps({
  recent: { type: Array, required: true },
  prior: { type: Array, required: true }
});
const expanded = ref(false);
const period = ref('recent');
const days = computed(() => (period.value === 'recent' ? props.recent : props.prior));
const index = ref(props.recent.length - 1);
const selected = computed(() => days.value[index.value]);
const total = computed(() => days.value.reduce((sum, day) => sum + day.count, 0));
const totalLabel = computed(() => (period.value === 'recent' ? 'muse.studyTrendTotal' : 'muse.studyTrendPriorTotal'));
const maximum = computed(() =>
  Math.max(1, ...props.recent.map((day) => day.count), ...props.prior.map((day) => day.count))
);
const lineSource = computed(() => {
  const points = days.value.map((day, position) => [4 + position * 48, 73 - (day.count / maximum.value) * 62]);
  const line = points.map((point) => point.join(',')).join(' ');
  const [x, y] = points[index.value];
  const marker = expanded.value
    ? `<path d="M${x} ${y}V76" stroke="#2589b9" stroke-opacity=".38" stroke-dasharray="3 4"/><circle cx="${x}" cy="${y}" r="3.5" fill="#f3fbff" stroke="#187db1" stroke-width="2"/>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 296 80" preserveAspectRatio="none"><defs><linearGradient id="wash" x2="0" y2="1"><stop stop-color="#66bbeb" stop-opacity=".42"/><stop offset="1" stop-color="#66bbeb" stop-opacity=".02"/></linearGradient></defs><polygon points="4,76 ${line} 292,76" fill="url(#wash)"/><polyline points="${line}" fill="none" stroke="#268fc5" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>${marker}</svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
});
function toggle() {
  expanded.value = !expanded.value;
  if (!expanded.value) index.value = days.value.length - 1;
}
function selectPeriod(value) {
  if (period.value === value) return;
  period.value = value;
  index.value = days.value.length - 1;
}
</script>

<style scoped>
.study-trend {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: linear-gradient(160deg, var(--muse-rich-surface), transparent 70%), var(--muse-popover);
}
.study-trend-trigger {
  width: 100%;
  min-height: 60px;
  padding: 10px 16px;
  color: var(--ink);
}
.study-trend-total {
  flex: 1;
  min-width: 0;
  font-size: 13px;
}
.study-trend-spark {
  width: clamp(52px, 19%, 110px);
  height: 27px;
}
.study-trend-chevron {
  transition: transform 280ms ease;
}
.is-open .study-trend-chevron {
  transform: rotate(180deg);
}
.study-trend-detail {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 330ms cubic-bezier(0.22, 1, 0.36, 1);
}
.is-open .study-trend-detail {
  grid-template-rows: 1fr;
}
.study-trend-clip {
  min-height: 0;
  overflow: hidden;
}
.study-trend-body {
  padding: 5px 16px 12px;
}
.study-trend-periods {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 10px;
}
.study-trend-periods .base-button {
  min-height: 44px;
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  font-size: 12px;
}
.study-trend-periods .base-button[aria-pressed='true'] {
  background: var(--muse-rich-surface);
  color: var(--ink);
  font-weight: 650;
}
.study-trend-value {
  display: block;
  font-size: 31px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}
.study-trend-date {
  color: var(--ink-3);
  font-size: 12px;
}
.study-trend-graph {
  display: block;
  width: 100%;
  height: clamp(68px, 12vw, 118px);
  margin-top: 8px;
}
.is-open .study-trend-graph {
  animation: study-trend-chart-in 260ms ease-out both;
}
@keyframes study-trend-chart-in {
  from {
    opacity: 0.45;
    transform: translateY(4px);
  }
}
.study-trend-slider {
  width: 100%;
  min-height: 44px;
  margin: 0;
  accent-color: #227fae;
  cursor: ew-resize;
}
@media (prefers-reduced-motion: reduce) {
  .study-trend-chevron,
  .study-trend-detail {
    transition: none;
  }
  .is-open .study-trend-graph {
    animation: none;
  }
}
</style>
