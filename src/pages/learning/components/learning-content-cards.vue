<template>
  <view class="content-cards" :class="`content-cards--${mode}`" data-test="teaching-cards">
    <BaseCard
      v-for="(card, index) in visible"
      :key="index"
      class="teaching-card"
      :class="`card-${card.kind}`"
      :padding="['stat', 'chart', 'figure'].includes(card.kind) ? 'none' : 'large'"
    >
      <view v-if="card.formula" class="card-formula-block"
        ><text class="card-formula">{{ card.formula }}</text></view
      >
      <MuseStatTile v-if="card.kind === 'stat'" v-bind="card" />
      <MuseChart v-else-if="card.kind === 'chart'" :chart="card.chart" />
      <MuseFigure v-else-if="card.kind === 'figure'" :figure="card.figure" />
      <text v-if="card.title" class="card-title" role="heading" aria-level="3">{{ card.title }}</text>
      <text v-if="card.body" class="card-copy" selectable>{{ card.body }}</text>
      <view v-if="card.kind === 'table'" class="content-table-scroll">
        <view role="table" :aria-label="card.title || t('presentation.table')" class="content-table">
          <view role="row" class="content-table-row" :style="{ '--columns': card.columns.length }">
            <text v-for="(column, columnIndex) in card.columns" :key="columnIndex" role="columnheader" selectable>{{
              column
            }}</text>
          </view>
          <view
            v-for="(row, rowIndex) in card.rows"
            :key="rowIndex"
            role="row"
            class="content-table-row"
            :style="{ '--columns': card.columns.length }"
          >
            <text v-for="(cell, cellIndex) in row" :key="cellIndex" role="cell" selectable>{{ cell }}</text>
          </view>
        </view>
      </view>
      <view v-if="card.kind === 'checklist'" class="content-checklist">
        <text class="self-check-note">{{ t('presentation.selfCheck') }}</text>
        <template v-for="item in card.items" :key="item.id">
          <text v-if="mode === 'text'" class="card-copy" selectable>{{ item.label }}</text>
          <BaseCheckbox
            v-else
            :model-value="checked[index]?.[item.id] === true"
            @update:model-value="toggleCheck(index, item.id, $event)"
            >{{ item.label }}</BaseCheckbox
          >
        </template>
      </view>
      <view v-for="(point, pointIndex) in card.points || []" :key="pointIndex" class="card-point">
        <text selectable>{{ point }}</text>
      </view>
      <view
        v-for="(step, stepIndex) in (card.steps || []).slice(0, mode === 'text' ? undefined : steps[index] || 1)"
        :key="stepIndex"
        class="example-step"
      >
        <text selectable>{{ step }}</text>
      </view>
      <view class="card-actions">
        <BaseButton
          v-if="mode !== 'text' && card.steps && (steps[index] || 1) < card.steps.length"
          variant="primary"
          @tap="steps[index] = (steps[index] || 1) + 1"
          >{{ t('tutor.card.nextStep') }}</BaseButton
        >
        <BaseButton
          v-else-if="mode === 'guided' && index === count - 1 && count < normalized.items.length"
          variant="primary"
          @tap="count++"
          >{{ t(card.kind === 'example' ? 'tutor.card.try' : 'tutor.card.continue') }}</BaseButton
        >
      </view>
    </BaseCard>
  </view>
</template>
<script setup>
import '@/i18n/tutor.js';
import '@/i18n/presentation.js';
import { computed, ref, watch } from 'vue';
import { normalizeContentBlocks } from '../../../../laf-backend/functions/_shared/learning-content-blocks.js';
import { t } from '@/i18n/index.js';
import MuseStatTile from './muse-stat-tile.vue';
import MuseChart from './muse-chart.vue';
import MuseFigure from './muse-figure.vue';
import BaseCard from '@/components/base/base-card/base-card.vue';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseCheckbox from '@/components/base/base-checkbox/base-checkbox.vue';
const props = defineProps({
  content: { type: Object, required: true },
  presentation: { type: String, default: 'auto' }
});
const normalized = computed(() => normalizeContentBlocks(props.content));
const mode = computed(() =>
  ['interactive', 'text', 'guided'].includes(props.presentation)
    ? props.presentation
    : normalized.value.version === 3
      ? 'interactive'
      : 'guided'
);
const count = ref(1),
  steps = ref({}),
  checked = ref({});
const visible = computed(() =>
  mode.value === 'guided' ? normalized.value.items.slice(0, count.value) : normalized.value.items
);
function toggleCheck(index, id, value) {
  checked.value = { ...checked.value, [index]: { ...checked.value[index], [id]: value === true } };
}
watch(
  () => JSON.stringify(normalized.value),
  () => {
    count.value = 1;
    steps.value = {};
    checked.value = {};
  }
);
</script>
<style scoped>
.content-cards {
  display: grid;
  gap: var(--s-3);
  width: 100%;
  max-width: 680px;
}
.teaching-card {
  overflow: visible;
  border: 1px solid var(--control-line);
  border-radius: 16px;
  background: var(--muse-rich-surface);
}
.card-formula-block {
  margin: 16px 0;
  padding: 16px;
  background: var(--paper-sunk);
  border-radius: 16px;
}
.card-title {
  display: block;
  margin-bottom: var(--s-4);
  font: var(--weight-ui-emphasis) var(--size-title-2)/var(--leading-title-2) var(--font-ui);
}
.card-copy,
.card-point,
.example-step {
  line-height: var(--leading-body);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.card-point,
.example-step {
  margin-top: var(--s-4);
  padding-inline-start: var(--s-3);
  border-inline-start: 2px solid var(--line);
}
.card-formula {
  font-size: var(--size-title-2);
  overflow-wrap: anywhere;
  min-width: 0;
}
.card-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--s-5);
}
.card-stat :deep(.base-card__body),
.card-chart :deep(.base-card__body),
.card-figure :deep(.base-card__body) {
  padding: 14px;
}
.card-actions:empty {
  display: none;
}
.content-table-scroll {
  max-width: 100%;
  overflow-x: auto;
}
.content-table-row {
  display: grid;
  grid-template-columns: repeat(var(--columns), minmax(120px, 1fr));
}
.content-table-row > text {
  padding: 10px;
  border-bottom: 1px solid var(--line);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.content-table-row > [role='columnheader'] {
  font-weight: var(--weight-ui-emphasis);
}
.content-checklist {
  display: grid;
  gap: var(--s-3);
}
.self-check-note {
  color: var(--ink-3);
  font-size: var(--size-caption);
}
.content-cards--text .teaching-card {
  border: 0;
  background: transparent;
  box-shadow: none;
}
.content-cards--text :deep(.base-card__body) {
  padding: 0;
}
</style>
