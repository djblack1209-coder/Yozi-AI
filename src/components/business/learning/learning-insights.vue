<template>
  <view class="insights" data-test="learning-insights">
    <view v-if="!ready"
      ><BaseEmpty :title="t('tutor.insights.unavailable')" mascot-size="small" /><BaseButton
        variant="quiet"
        :disabled="working"
        @tap="perform(() => learning.reloadRecords())"
        >{{ t('ui.retry') }}</BaseButton
      ></view
    >
    <template v-else>
      <BaseCard padding="large">
        <view class="insight-heading"
          ><BaseIcon name="target" /><text>{{ t('tutor.insights.goal') }}</text></view
        >
        <text class="goal-copy">{{
          all
            ? t('tutor.insights.allGoals', { count: learning.state.conversations.length })
            : data.profile.goal?.value || learning.active?.goal || t('tutor.insights.noGoal')
        }}</text>
        <view v-for="field in ['foundation', 'minutes', 'preference']" :key="field" class="profile-line">
          <template v-if="data.profile[field]"
            ><text>{{ t(`tutor.profile.${field}`) }}</text
            ><text>{{ data.profile[field].value }}</text></template
          >
        </view>
        <text v-if="data.deadline" class="muted"
          >{{ data.deadline }} · {{ t('tutor.insights.days', { count: data.daysLeft }) }}</text
        >
        <view v-if="data.progress.total" class="progress-line">
          <text>{{ t('tutor.insights.modules') }} {{ data.progress.completed }} / {{ data.progress.total }}</text>
          <view
            class="insight-track"
            role="progressbar"
            :aria-label="t('tutor.insights.modules')"
            :aria-valuenow="data.progress.completed"
            :aria-valuemax="data.progress.total"
            aria-valuemin="0"
            ><view :style="{ width: `${(data.progress.completed / data.progress.total) * 100}%` }"
          /></view>
        </view>
        <text v-else class="muted">{{ t('tutor.insights.unknown') }}</text>
        <template v-if="compact">
          <text class="subheading">{{ t('tutor.insights.todayPlan') }}</text>
          <text v-if="!todayTasks.length" class="muted">{{ t('tutor.insights.noPlan') }}</text>
          <view v-for="task in todayTasks.slice(0, 4)" :key="task.id" class="profile-line"
            ><text>{{ task.title }}</text
            ><text class="muted">{{
              t(task.completedBy ? 'tutor.insights.completed' : 'tutor.insights.planned')
            }}</text></view
          >
          <BaseButton variant="quiet" @tap="safeNavigateTo('/pages/archive/index')">{{
            t('tutor.insights.fullArchive')
          }}</BaseButton>
        </template>
      </BaseCard>
      <BaseCard v-if="!compact" padding="large">
        <view class="insight-heading"
          ><BaseIcon name="chart" /><text>{{ t('tutor.insights.weakness') }}</text></view
        >
        <text class="muted">{{ t('tutor.insights.basis') }}</text>
        <text v-if="!data.units.length" class="muted">{{ t('tutor.archive.empty') }}</text>
        <view v-if="radar" class="radar" role="img" :aria-label="radarDescription" data-test="insight-radar">
          <image :src="radar.src" mode="aspectFit" class="radar-image" :alt="radarDescription" />
          <text class="muted">{{ t('tutor.insights.radarBasis', { count: radar.rows.length }) }}</text>
          <text v-for="(unit, i) in radar.rows" :key="unit.scope" class="radar-legend"
            >{{ i + 1 }}. {{ unit.label }} · {{ unit.independent }} / {{ unit.reliable }}</text
          >
        </view>
        <view v-for="unit in data.units.slice(0, unitLimit)" :key="unit.scope" class="insight-unit">
          <BaseButton
            variant="quiet"
            block
            align="start"
            :selected="selectedUnit === unit.scope"
            :label="t('tutor.insights.viewUnit', { unit: unit.label })"
            :aria-expanded="selectedUnit === unit.scope"
            @tap="selectUnit(unit.scope)"
          >
            <view class="unit-label"
              ><text>{{ unit.label }}</text
              ><text>{{ unit.independent }} / {{ unit.reliable }}</text></view
            >
          </BaseButton>
          <view class="insight-track" role="img" :aria-label="`${unit.label}: ${unit.independent}/${unit.reliable}`"
            ><view :style="{ width: `${unit.reliable ? (unit.independent / unit.reliable) * 100 : 0}%` }"
          /></view>
          <text v-if="unit.pending" class="muted">{{ t('tutor.insights.pending', { count: unit.pending }) }}</text>
        </view>
        <BaseButton v-if="data.units.length > unitLimit" variant="quiet" @tap="unitLimit += 12">{{
          t('tutor.insights.more')
        }}</BaseButton>
      </BaseCard>
      <BaseCard padding="large" class="calendar-card">
        <view class="insight-heading"
          ><BaseIcon name="calendar" /><text>{{
            t(compact ? 'tutor.insights.week' : 'tutor.insights.calendar')
          }}</text></view
        >
        <text class="muted">{{ data.timezone }}</text>
        <view v-if="!compact" class="month-controls">
          <BaseButton
            icon="chevron-left"
            icon-only
            variant="quiet"
            :label="t('tutor.insights.previousMonth')"
            :disabled="month === '0001-01'"
            @tap="moveMonth(-1)"
          />
          <text class="month-title" aria-live="polite">{{ monthTitle }}</text>
          <BaseButton
            icon="chevron-right"
            icon-only
            variant="quiet"
            :label="t('tutor.insights.nextMonth')"
            :disabled="month === '9999-12'"
            @tap="moveMonth(1)"
          />
        </view>
        <BaseButton v-if="!compact && month !== data.today.slice(0, 7)" variant="quiet" @tap="goToday">{{
          t('tutor.insights.thisMonth')
        }}</BaseButton>
        <view class="calendar-grid weekdays" aria-hidden="true"
          ><text v-for="(day, i) in weekdays" :key="i">{{ day }}</text></view
        >
        <view class="calendar-grid" :aria-label="monthTitle" data-test="insight-calendar">
          <view v-for="cell in cells" :key="cell.day" class="calendar-cell">
            <BaseButton
              v-if="cell.inMonth"
              variant="quiet"
              :selected="selectedDay === cell.day"
              :class="{ 'is-today': cell.today }"
              :label="dayLabel(cell)"
              :aria-pressed="selectedDay === cell.day"
              :data-day="cell.day"
              @tap="selectDay(cell.day)"
            >
              <text>{{ cell.number }}</text>
              <view class="calendar-marks" aria-hidden="true"
                ><view v-if="dayFacts.get(cell.day)?.answers" class="mark learned" /><view
                  v-if="dayFacts.get(cell.day)?.due"
                  class="mark due" /><view v-if="dayFacts.get(cell.day)?.reviews" class="mark reviewed"
              /></view>
            </BaseButton>
          </view>
        </view>
        <view class="calendar-legend"
          ><text><text class="legend-dot learned" />{{ t('tutor.insights.learned') }}</text
          ><text><text class="legend-dot due" />{{ t('tutor.insights.toReview') }}</text
          ><text><text class="legend-dot reviewed" />{{ t('tutor.insights.reviewedMark') }}</text></view
        >
        <text v-if="!data.days.length" class="muted">{{ t('tutor.archive.empty') }}</text>
      </BaseCard>
      <BaseCard
        v-if="selectedDay || selectedUnit"
        :id="detailId"
        ref="details"
        padding="large"
        data-test="insight-evidence"
        role="region"
        tabindex="-1"
        :aria-label="detailTitle"
      >
        <view class="detail-heading"
          ><text class="goal-copy">{{ detailTitle }}</text
          ><BaseButton icon="close" icon-only variant="quiet" :label="t('ui.close')" @tap="clearSelection"
        /></view>
        <BaseButton
          v-if="selectedUnit && rows.some((row) => row.canOpen)"
          :disabled="blocked"
          @tap="perform(() => learning.startFocusedStudy(selectedUnit, selectionContext), true, selectionContext)"
          >{{ t('tutor.insights.startUnit') }}</BaseButton
        >
        <text v-if="!rows.length && !reviews.length" class="muted">{{ t('tutor.insights.noDayEvidence') }}</text>
        <view v-for="review in reviews" :key="review.id" class="evidence-row">
          <text class="goal-copy">{{ review.label }}</text
          ><text class="evidence-prompt">{{ review.prompt }}</text>
          <text class="muted">{{ t('tutor.insights.reviewTime', { time: timeLabel(review.due) }) }}</text>
          <BaseButton
            variant="quiet"
            :disabled="blocked || review.due > learning.calendarTime"
            @tap="perform(() => learning.openInsightReview(review.id, review.context), true, review.context)"
            >{{
              t(review.due > learning.calendarTime ? 'tutor.insights.notDue' : 'tutor.insights.openReview')
            }}</BaseButton
          >
        </view>
        <view v-for="row in rows.slice(0, evidenceLimit)" :key="row.id" class="evidence-row">
          <text class="goal-copy">{{ row.label }}</text
          ><text class="evidence-prompt">{{ row.prompt }}</text>
          <text class="muted">{{ row.goal }} · {{ timeLabel(row.at) }}</text>
          <text class="muted">{{ resultLabel(row) }}{{ row.helped ? ` · ${t('tutor.insights.hinted')}` : '' }}</text>
          <BaseButton
            v-if="row.canOpen"
            variant="quiet"
            :disabled="blocked"
            @tap="perform(() => learning.openRecord(row.recordId, row.context), true, row.context)"
            >{{ t('tutor.insights.openOriginal') }}</BaseButton
          >
        </view>
        <BaseButton v-if="rows.length > evidenceLimit" variant="quiet" @tap="evidenceLimit += 20">{{
          t('tutor.insights.more')
        }}</BaseButton>
      </BaseCard>
    </template>
    <text v-if="feedback" class="muted" role="status">{{ feedback }}</text>
  </view>
</template>
<script setup>
import { getCurrentRoute } from '@/utils/home-navigation.js';
import { learningDateTimeFormat } from '../../../../laf-backend/functions/_shared/learning-date-time.js';
import '@/i18n/tutor.js';
import { computed, ref, watch, nextTick, getCurrentInstance, onMounted, onUnmounted } from 'vue';
import { onShow, onHide } from '@dcloudio/uni-app';
import { t, currentLanguage, publicError } from '@/i18n/index.js';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { useThemeStore } from '@/stores/modules/theme.js';
import { tokens } from '@/design/tokens.js';
import {
  learningInsights,
  insightCalendar,
  insightMonth,
  insightRadar
} from '@/services/learning/learning-insights.js';
import { safeNavigateTo } from '@/utils/safe-navigate.js';
import BaseCard from '@/components/base/base-card/base-card.vue';
import BaseIcon from '@/components/base/base-icon/base-icon.vue';
import BaseEmpty from '@/components/base/base-empty/base-empty.vue';
import BaseButton from '@/components/base/base-button/base-button.vue';
const props = defineProps({ compact: Boolean, all: Boolean });
const details = ref(null),
  detailId = `insight-details-${getCurrentInstance().uid}`;
const learning = useConversationLearningStore(),
  theme = useThemeStore(),
  calendar = learning.observeCalendar();
const ready = computed(() => learning.recordReadState === 'ready');
const working = computed(() => learning.busy || learning.materialBusy || learning.syncBusy || learning.historyBusy);
const blocked = computed(() => working.value || !ready.value);
const context = computed(() => learning.recordContext());
const data = computed(() => {
  const snapshot = context.value;
  const facts = learningInsights(
    learning.state,
    learning.calendarTime,
    props.all ? null : learning.selectedConversationId
  );
  return {
    ...facts,
    context: snapshot,
    evidence: facts.evidence.map((row) => ({ ...row, context: snapshot })),
    scheduled: facts.scheduled.map((row) => ({ ...row, context: snapshot }))
  };
});
const chosenMonth = ref(''),
  selectedDay = ref(''),
  selectedUnit = ref(''),
  selectionContext = ref(null),
  feedback = ref('');
const unitLimit = ref(12),
  evidenceLimit = ref(20);
const month = computed(() => chosenMonth.value || data.value.today.slice(0, 7));
const locale = computed(() => (currentLanguage.value === 'en' ? 'en-US' : 'zh-CN'));
const monthTitle = computed(() =>
  learningDateTimeFormat(locale.value, { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${month.value}-01T12:00:00Z`)
  )
);
const weekdays = computed(() =>
  Array.from({ length: 7 }, (_, i) =>
    learningDateTimeFormat(locale.value, { weekday: 'narrow', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2026, 0, 5 + i))
    )
  )
);
const cells = computed(() => insightCalendar(data.value.today, month.value, props.compact));
const dayFacts = computed(() => new Map(data.value.days.map((day) => [day.day, day])));
const rows = computed(() =>
  data.value.evidence.filter((row) =>
    selectedUnit.value ? row.scope === selectedUnit.value : row.day === selectedDay.value
  )
);
const reviews = computed(() =>
  selectedDay.value ? data.value.scheduled.filter((row) => row.day === selectedDay.value) : []
);
const selectedUnitData = computed(() => data.value.units.find((unit) => unit.scope === selectedUnit.value));
const detailTitle = computed(() => selectedUnitData.value?.label || selectedDay.value);
const todayTasks = computed(() => {
  const plan = learning.state.plans.find(
    (item) => item.id === (learning.journeySummary || learning.todaySummary).tasks.planId
  );
  const session = props.all ? null : learning.active;
  if (!session) return props.all ? plan?.tasks || [] : [];
  const keys = new Set([
    session.activeQuestionKey,
    ...session.messages.map((message) => message.questionKey),
    ...learning.state.attempts
      .filter((attempt) => attempt.conversationId === session.id)
      .map((attempt) => attempt.questionKey),
    ...(session.trainingGroups || []).flatMap((group) => group.questionKeys)
  ]);
  return (plan?.tasks || []).filter((task) => keys.has(task.questionKey));
});
const radar = computed(() => {
  const colors = tokens[theme.isDark ? 'dark' : 'light'];
  return insightRadar(data.value.units, { brand: colors['--brand'], ink: colors['--ink'], line: colors['--line'] });
});
const radarDescription = computed(() =>
  radar.value?.rows.map((row) => `${row.label}: ${row.independent}/${row.reliable}`).join('; ')
);
function clearSelection() {
  selectedDay.value = '';
  selectedUnit.value = '';
  selectionContext.value = null;
  evidenceLimit.value = 20;
}
function selectDay(day) {
  clearSelection();
  selectedDay.value = day;
  selectionContext.value = data.value.context;
  revealDetails(selectionContext.value);
}
function selectUnit(scope) {
  clearSelection();
  selectedUnit.value = scope;
  selectionContext.value = data.value.context;
  revealDetails(selectionContext.value);
}
async function revealDetails(expected) {
  await nextTick();
  if (!expected || selectionContext.value !== expected || learning.recordContext() !== expected || !ready.value) return;
  // #ifdef H5
  const element = details.value?.$el;
  element?.focus?.({ preventScroll: true });
  element?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
  // #endif
  // #ifndef H5
  uni.pageScrollTo?.({ selector: `#${detailId}`, duration: 0 });
  // #endif
}
function moveMonth(offset) {
  chosenMonth.value = insightMonth(`${month.value}-01`, offset);
  clearSelection();
}
function goToday() {
  chosenMonth.value = '';
  selectDay(data.value.today);
}
function timeLabel(at) {
  return learningDateTimeFormat(locale.value, {
    timeZone: data.value.timezone,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(at);
}
function dayLabel(cell) {
  const facts = dayFacts.value.get(cell.day);
  return [
    cell.day,
    cell.today ? t('tutor.insights.today') : '',
    t('tutor.insights.answers', { count: facts?.answers || 0 }),
    facts?.pending ? t('tutor.insights.pending', { count: facts.pending }) : '',
    facts?.reviews ? t('tutor.insights.reviewed', { count: facts.reviews }) : '',
    facts?.due ? t('tutor.insights.due', { count: facts.due }) : ''
  ]
    .filter(Boolean)
    .join(' · ');
}
function resultLabel(row) {
  if (row.grade?.status !== 'reliable') return t('tutor.card.unchecked');
  return t(
    `tutor.insights.${['correct', 'wrong', 'partial'].includes(row.grade.outcome) ? row.grade.outcome : 'checked'}`
  );
}
async function perform(action, openChat = false, expected = data.value.context) {
  feedback.value = '';
  try {
    await action();
    if (openChat && expected === learning.recordContext()) {
      const route = getCurrentRoute();
      if (route !== 'pages/learning/index') safeNavigateTo('/pages/learning/index');
    }
  } catch (error) {
    if (expected === learning.recordContext()) feedback.value = publicError(error);
  }
}
watch(
  [context, () => learning.state.timezone, () => (props.all ? null : learning.selectedConversationId)],
  () => {
    chosenMonth.value = '';
    clearSelection();
    unitLimit.value = 12;
    feedback.value = '';
  },
  { flush: 'sync' }
);
onMounted(() => calendar.show());
onShow(() => calendar.show());
onHide(() => calendar.hide());
onUnmounted(() => calendar.dispose());
</script>
<style scoped>
.insights {
  display: grid;
  gap: var(--s-4);
  min-width: 0;
}
.insight-heading {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  font-size: var(--size-title-3);
  margin-bottom: var(--s-4);
}
.goal-copy,
.evidence-prompt,
.radar-legend {
  display: block;
  overflow-wrap: anywhere;
}
.goal-copy {
  font-weight: 600;
}
.evidence-prompt {
  white-space: pre-wrap;
  margin-top: var(--s-2);
}
.muted {
  display: block;
  color: var(--ink-3);
  font-size: var(--size-caption);
  line-height: 1.7;
  margin-top: var(--s-2);
  overflow-wrap: anywhere;
}
.profile-line,
.unit-label {
  display: flex;
  justify-content: space-between;
  gap: var(--s-3);
  padding-block: var(--s-2);
  overflow-wrap: anywhere;
}
.unit-label {
  width: 100%;
}
.unit-label > text:last-child {
  flex-shrink: 0;
}
.insight-unit,
.progress-line,
.subheading {
  display: block;
  margin-top: var(--s-4);
}
.insight-track {
  height: 8px;
  background: var(--line);
  border-radius: var(--r-pill);
  overflow: hidden;
}
.insight-track > view {
  height: 100%;
  background: var(--brand);
  border-radius: inherit;
}
.month-controls,
.detail-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-2);
}
.month-title {
  text-align: center;
  font-weight: 600;
}
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 2px;
}
.weekdays {
  margin-top: var(--s-3);
  text-align: center;
  font-size: var(--size-caption);
  color: var(--ink-3);
}
.calendar-cell {
  min-width: 0;
  min-height: 44px;
}
.calendar-cell :deep(.base-button) {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  padding: 4px 0;
  border-radius: var(--s-2);
}
.calendar-cell :deep(.base-button__content) {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}
.calendar-cell :deep(.is-today) {
  box-shadow: inset 0 0 0 1px var(--brand);
}
.calendar-marks {
  display: flex;
  justify-content: center;
  gap: 2px;
  height: 5px;
}
.mark,
.legend-dot {
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
}
.learned {
  background: var(--brand);
}
.due {
  background: var(--ink-3);
  border-radius: 0;
}
.reviewed {
  border: 1px solid var(--brand);
  background: var(--paper);
}
.calendar-legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-3);
  margin-top: var(--s-3);
  font-size: var(--size-caption);
  color: var(--ink-3);
}
.legend-dot {
  margin-right: 4px;
  vertical-align: middle;
}
.evidence-row {
  border-top: 1px solid var(--line);
  margin-top: var(--s-4);
  padding-top: var(--s-4);
}
.radar {
  margin-block: var(--s-4);
}
.radar-image {
  display: block;
  width: 240px;
  max-width: 100%;
  height: 240px;
  margin: 0 auto;
}
.radar-legend {
  font-size: var(--size-caption);
  margin-top: var(--s-1);
}
.calendar-card :deep(.base-card__body) {
  padding-inline: var(--s-3);
}
</style>
