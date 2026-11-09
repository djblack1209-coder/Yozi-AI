<template>
  <view class="rubric-evidence" :aria-label="t('learning.kmn')">
    <text v-if="attempt.corrections?.length" class="evidence-note">{{ t('learning.kdv') }}</text>
    <view v-for="dimension in dimensions" :key="dimension.id" class="evidence-dimension">
      <text class="evidence-note">
        {{ learningText(dimension.name) }}：{{ dimension.score === null ? t('learning.k4h') : dimension.score }} /
        {{ dimension.maxScore }} ·
        {{ dimension.feedback }}
      </text>
      <view v-for="entry in dimension.quotes" :key="entry.key" class="evidence-quote">
        <text class="evidence-note" selectable>{{ t('learning.kiu') }}{{ entry.quote }}</text>
        <template v-if="entry.location">
          <text class="evidence-note"
            >{{ t('learning.klt') }}{{ entry.location.startCharacter }}{{ t('learning.k7k')
            }}{{ entry.location.endCharacter }}{{ t('learning.kq1') }}{{ entry.location.occurrence }}/{{
              entry.location.occurrences
            }}{{ t('learning.kaq') }}</text
          >
          <text class="evidence-note" selectable
            >{{ t('learning.k5q') }}{{ entry.location.before }}【{{ entry.quote }}】{{ entry.location.after }}
          </text>
          <BaseButton
            :aria-label="t('learning.khl', { v0: learningText(dimension.name), v1: entry.index + 1 })"
            :aria-expanded="selected === entry.key"
            variant="quiet"
            @tap="toggle(entry.key)"
          >
            {{ selected === entry.key ? t('learning.k3h') : t('learning.krs') }}
          </BaseButton>
          <view v-if="selected === entry.key" class="answer-panel" :aria-label="t('learning.kas')">
            <text class="answer-body muse-ink-reveal" selectable
              ><text
                v-for="(segment, index) in answerSegments"
                :key="index"
                class="answer-segment"
                :class="{ 'evidence-highlight muse-ink-mark': segment.highlight }"
                >{{ segment.text }}</text
              ></text
            >
          </view>
        </template>
        <text v-else class="evidence-note">
          {{ assessment.contract === 'subjective-rubric-v1' ? t('learning.kdo') : t('learning.kid') }}
        </text>
      </view>
    </view>
    <BaseButton
      :disabled="!sourceAvailable"
      :aria-disabled="!sourceAvailable"
      :aria-expanded="selected === 'answer'"
      variant="quiet"
      @tap="toggle('answer')"
    >
      {{ selected === 'answer' ? t('learning.k4c') : t('learning.khv') }}
    </BaseButton>
    <text v-if="!sourceAvailable" class="evidence-note">{{ t('learning.k50') }}</text>
    <view v-if="selected === 'answer' && sourceAvailable" class="answer-panel" :aria-label="t('learning.kas')">
      <text class="answer-body" selectable>{{ attempt.answer }}</text>
    </view>
  </view>
</template>
<script setup>
import { learningText } from '@/i18n/learning.js';
import { t } from '@/i18n/index.js';
import BaseButton from '@/components/base/base-button/base-button.vue';

import { computed, ref, watch } from 'vue';

const props = defineProps({
  attempt: { type: Object, required: true },
  assessment: { type: Object, required: true },
  contextKey: { type: String, default: null }
});
const selected = ref('');
const sourceAvailable = computed(
  () =>
    typeof props.attempt.answer === 'string' &&
    props.attempt.answer.length > 0 &&
    props.attempt.answer.length <= 10000 &&
    props.assessment.questionKey === props.attempt.questionKey &&
    (props.assessment.contract === 'subjective-rubric-v1' ||
      (props.assessment.contract === 'subjective-rubric-v2' && props.assessment.attemptId === props.attempt.id))
);
function locate(quote, location) {
  if (!sourceAvailable.value || props.assessment.contract !== 'subjective-rubric-v2' || !location) return null;
  const answer = props.attempt.answer;
  const { start, end } = location;
  const splitsSurrogate = (position) =>
    position > 0 &&
    position < answer.length &&
    answer.charCodeAt(position - 1) >= 0xd800 &&
    answer.charCodeAt(position - 1) <= 0xdbff &&
    answer.charCodeAt(position) >= 0xdc00 &&
    answer.charCodeAt(position) <= 0xdfff;
  if (
    typeof quote !== 'string' ||
    !quote.trim() ||
    quote.length > 250 ||
    location.quote !== quote ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end <= start ||
    end > answer.length ||
    splitsSurrogate(start) ||
    splitsSurrogate(end) ||
    answer.slice(start, end) !== quote
  )
    return null;
  const occurrences = [];
  for (let from = 0, found; (found = answer.indexOf(quote, from)) !== -1; from = found + 1) occurrences.push(found);
  return {
    start,
    end,
    startCharacter: Array.from(answer.slice(0, start)).length + 1,
    endCharacter: Array.from(answer.slice(0, end)).length,
    occurrence: occurrences.indexOf(start) + 1,
    occurrences: occurrences.length,
    before: Array.from(answer.slice(0, start)).slice(-24).join(''),
    after: Array.from(answer.slice(end)).slice(0, 24).join('')
  };
}
const dimensions = computed(() =>
  (props.assessment.dimensions || []).map((dimension, dimensionIndex) => ({
    ...dimension,
    quotes: (dimension.evidence || []).map((quote, index) => ({
      key: `${dimensionIndex}:${index}`,
      index,
      quote,
      location: locate(quote, dimension.evidenceLocations?.[index])
    }))
  }))
);
const answerSegments = computed(() => {
  const entry = dimensions.value.flatMap((dimension) => dimension.quotes).find((quote) => quote.key === selected.value);
  if (!entry?.location) return [];
  return [
    { text: props.attempt.answer.slice(0, entry.location.start) },
    { text: props.attempt.answer.slice(entry.location.start, entry.location.end), highlight: true },
    { text: props.attempt.answer.slice(entry.location.end) }
  ];
});
function toggle(key) {
  if (sourceAvailable.value) selected.value = selected.value === key ? '' : key;
}
watch(
  [
    () => props.contextKey,
    () => props.attempt.id,
    () => props.attempt.conversationId,
    () => props.attempt.questionKey,
    () => props.attempt.answer,
    () => props.assessment.id,
    () => props.assessment.questionKey,
    () => props.assessment.attemptId,
    () => props.assessment.contract,
    () => JSON.stringify(props.assessment.dimensions)
  ],
  () => {
    selected.value = '';
  },
  { flush: 'sync' }
);
</script>
<style scoped>
.rubric-evidence,
.evidence-dimension,
.evidence-quote {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: var(--s-2);
}
.rubric-evidence {
  gap: var(--s-4);
}
.evidence-note {
  display: block;
  color: var(--ink-3);
  font-size: var(--size-caption);
  line-height: 1.8;
  overflow-wrap: anywhere;
}
.answer-panel {
  min-width: 0;
  padding: var(--s-3);
  border: var(--border-thin) solid var(--line);
  border-radius: var(--s-3);
  background: var(--paper-sunk);
}
.answer-body {
  display: block;
  color: var(--ink);
  font-size: var(--size-small);
  line-height: 1.65;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.evidence-highlight {
  font-weight: var(--weight-ui-emphasis);
  text-decoration: underline;
}
.answer-segment {
  white-space: pre-wrap;
}
@media (hover: hover) and (pointer: fine) {
}
@media (prefers-reduced-motion: reduce) {
}
</style>
