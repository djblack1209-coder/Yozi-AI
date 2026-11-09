<template>
  <BaseCard
    ref="learningRoot"
    class="learning-overview"
    :class="{ 'is-inline': inline }"
    data-test="learning-checkpoint"
    padding="none"
  >
    <view v-if="showNavigation" class="learning-links">
      <BaseButton variant="quiet" @tap="safeNavigateTo('/pages/learning/review')">分批复习</BaseButton>
      <BaseButton
        v-for="item in ['对话', '错题', '计划', '统计']"
        :key="item"
        variant="quiet"
        @tap="openView({ 对话: 'learning', 错题: 'mistake', 计划: 'plan', 统计: 'study-detail' }[item])"
      >
        {{ t({ 对话: 'ui.navChat', 错题: 'ui.navMistake', 计划: 'ui.navPlan', 统计: 'ui.navStats' }[item]) }}
      </BaseButton>
    </view>
    <view v-if="view === 'mistake'" class="learning-links subject-filters" role="group" aria-label="错题学科筛选">
      <BaseButton
        v-for="option in mistakeSubjects"
        :key="option.id"
        variant="quiet"
        :selected="subject === option.id"
        @tap="subject = option.id"
        >{{ option.label }} ({{ option.count }})</BaseButton
      >
    </view>
    <BaseSegmented
      v-if="!inline && hasHistory"
      v-model="range"
      :label="t('learning.statRange')"
      :options="[
        { value: 'day', label: t('learning.today') },
        { value: 'history', label: t('learning.history') }
      ]"
    />
    <template v-if="hasRecords">
      <view class="overview-heading">
        <text class="overview-title">{{
          inline ? t('learning.k2p') : range === 'day' ? t('learning.kn5') : t('learning.kmz')
        }}</text>
        <text class="overview-date">{{ stats.day.slice(5).replace('-', ' / ') }}</text>
      </view>
      <view
        v-if="stats.tasks.denominator || answerCount"
        class="learning-summary"
        role="button"
        tabindex="0"
        :aria-expanded="expanded"
        :aria-label="t('learning.ka3')"
        data-learning-toggle="true"
        @tap="expanded = !expanded"
      >
        <view class="overview-metrics">
          <BaseStat
            :label="t('learning.tasksDone')"
            :value="stats.tasks.numerator"
            :denominator="stats.tasks.denominator"
          />
          <BaseStat
            :label="t('learning.reliableAnswers')"
            :value="stats.totalReliableAnswers"
            :unit="t('learning.times')"
          />
          <BaseStat :label="t('learning.pending')" :value="stats.pending" :unit="t('learning.times')" />
        </view>
        <view
          v-if="stats.tasks.denominator"
          class="task-progress"
          role="progressbar"
          :aria-valuenow="stats.tasks.numerator"
          :aria-valuemax="stats.tasks.denominator"
          aria-valuemin="0"
          :aria-label="t('learning.krj')"
        >
          <view :style="{ transform: `scaleX(${stats.tasks.rate || 0})` }" />
        </view>
        <text v-if="!stats.tasks.denominator" class="metric-empty">{{ t('learning.kkx') }}</text>
        <view class="summary-line">
          <text>{{ t('learning.ko2') }}{{ stats.first.numerator }} / {{ stats.first.denominator }}</text>
        </view>
        <view
          v-if="answerCount"
          class="answer-distribution"
          role="img"
          :aria-label="t('learning.kfk', { v0: answerCount, v1: stats.totalReliableAnswers, v2: stats.pending })"
        >
          <view class="answer-checked" :style="{ width: `${(stats.totalReliableAnswers / answerCount) * 100}%` }" />
          <view class="answer-pending" :style="{ width: `${(stats.pending / answerCount) * 100}%` }" />
        </view>
        <view class="summary-foot yozi-icon-row">
          <text>{{ answerCount ? t('learning.ktl') : t('learning.k9e') }}</text>
          <text>{{ expanded ? t('learning.kmv') : t('learning.ks4') }}</text>
          <BaseIcon :name="expanded ? 'chevron-up' : 'chevron-down'" tone="ink-3" />
        </view>
        <text v-if="stats.first.partial" class="subtle"
          >{{ t('learning.kpi') }}{{ stats.first.partial }}{{ t('learning.kbd') }}</text
        >
      </view>
      <view v-if="expanded" class="learning-details">
        <text class="subtle">{{ stats.day }} · {{ learningText(timezoneLabel) }}</text>
        <template v-if="showTasks">
          <view class="detail-heading">
            <text class="learning-label">{{ t('learning.khr') }}</text>
            <BaseButton variant="quiet" @tap="editPlan">{{ t('learning.kn8') }}</BaseButton>
          </view>
          <view v-if="!currentTasks.length" class="record-empty">
            <BaseEmpty state="empty" :title="t('learning.k2f')" mascot-size="small" />
            <BaseButton variant="quiet" @tap="openView('learning')">{{ t('learning.k62') }}</BaseButton>
          </view>
          <view v-for="task in currentTasks" :key="task.id" class="learning-row task-row">
            <view class="task-indicator" :class="{ completed: task.completedBy }">
              <BaseIcon v-if="task.completedBy" name="check" tone="ink-3" />
            </view>
            <view class="row-content">
              <text>{{ task.title }}</text>
              <text v-if="task.privacyRemoved" class="subtle">{{ t('learning.k91') }}</text>
              <text v-else class="subtle">
                {{
                  task.condition === 'manual'
                    ? task.completedBy
                      ? t('learning.kq0')
                      : t('learning.k4f')
                    : task.condition === 'independent_correct'
                      ? task.completedBy
                        ? t('learning.k8d')
                        : t('learning.k33')
                      : task.completedBy
                        ? t('learning.kbr')
                        : t('learning.k8j')
                }}
              </text>
            </view>
            <BaseButton
              v-if="!task.privacyRemoved && task.questionKey"
              variant="quiet"
              @tap="openQuestion(task.questionKey)"
              >{{ t('learning.kll') }}</BaseButton
            >
            <BaseButton
              v-else-if="!task.privacyRemoved && task.condition === 'manual' && !task.completedBy"
              variant="quiet"
              @tap="complete(task.id)"
              >{{ t('learning.ktg') }}</BaseButton
            >
          </view>
          <text v-for="plan in priorPlans" :key="plan.id" class="subtle"
            >{{ t('learning.kkf') }}{{ plan.version }} · {{ plan.tasks.filter((t) => t.completedBy).length }}/{{
              plan.tasks.length
            }}
          </text>
          <view v-for="task in upcomingRetests" :key="task.id" class="learning-row">
            <view class="learning-row-main">
              <text>{{ learningText(task.label) }} · {{ task.day.slice(5).replace('-', '/') }}</text>
              <text class="subtle">{{ task.title }}</text>
            </view>
            <BaseButton variant="quiet" @tap="openQuestion(task.questionKey, task.conversationId, 'review')">{{
              t('learning.k5w')
            }}</BaseButton>
          </view>
        </template>
        <template v-if="showMistakes">
          <text class="learning-label detail-heading">{{ t('learning.kr9') }}</text>
          <view v-if="!filteredMistakes.length" class="record-empty">
            <BaseEmpty
              state="empty"
              :title="subject === 'all' ? t('learning.k45') : '该学科暂无记录'"
              mascot-size="small"
            />
          </view>
          <view v-for="attempt in filteredMistakes" :key="attempt.id" class="learning-row">
            <text class="subtle">{{ attemptSubject(attempt) }} · {{ attemptTopic(attempt) }}</text
            ><text class="record-question">{{ questionPrompt(attempt.questionKey) }}</text>
            <text class="subtle"
              >{{ t('learning.kcd') }}{{ attempt.answer }} · {{ t(`learning.attemptKind.${attempt.kind}`)
              }}{{ t('learning.km') }}{{ attempt.hints.length }}{{ t('learning.kbd') }}</text
            >
            <text class="subtle">{{ t('learning.kfe') }}{{ effectiveGrade(attempt).basis }}</text>
            <view class="record-actions">
              <BaseButton variant="quiet" @tap="openQuestion(attempt.questionKey, attempt.conversationId)"
                >{{ t('learning.k3k') }}<BaseIcon name="arrow-right" tone="ink-3" />
              </BaseButton>
              <BaseButton variant="quiet" @tap="dispute(attempt.id)">{{ t('learning.kcn') }}</BaseButton>
            </view>
          </view>
          <text class="learning-label detail-heading">{{ t('learning.k7j') }}</text>
          <BaseEmpty v-if="!stats.due.length" state="empty" :title="t('learning.k7s')" mascot-size="small" />
          <view v-for="review in stats.due" :key="review.id" class="learning-row">
            <text>{{ questionPrompt(review.questionKey) }}</text>
            <BaseButton variant="quiet" @tap="openQuestion(review.questionKey, null, 'review')">{{
              t('learning.kma')
            }}</BaseButton>
          </view>
        </template>
        <template v-if="showKnowledge">
          <text class="learning-label detail-heading">{{ t('learning.k9x') }}</text>
          <view v-if="!Object.keys(stats.knowledge).length" class="record-empty">
            <BaseEmpty state="empty" :title="t('learning.kbj')" mascot-size="small" />
          </view>
          <view v-for="(entry, key) in stats.knowledge" :key="key" class="learning-row knowledge-row">
            <view class="row-content">
              <text>{{ learningText(knowledgeLabel(key)) }}</text>
              <text class="subtle">{{ t('learning.kpw') }}{{ entry.evidenceIds.length }}{{ t('learning.kbt') }}</text>
            </view>
            <text class="knowledge-state">{{
              ['可独立完成', '需提示', '待复测'].includes(entry.status)
                ? t(`tutor.insights.${{ 可独立完成: 'independent', 需提示: 'hinted', 待复测: 'retest' }[entry.status]}`)
                : learningText(entry.status)
            }}</text>
          </view>
          <template v-if="learning.teachingProgress.rows.length">
            <text class="learning-label detail-heading">{{ t('learning.k6g') }}</text>
            <view
              v-for="entry in learning.teachingProgress.rows.slice(-6).reverse()"
              :key="entry.id"
              class="learning-row"
            >
              <text>{{ entry.scope }} · {{ methodNames[entry.method] || entry.method }}</text>
              <text class="subtle"
                >{{ learningText(observationNames[entry.status])
                }}{{ entry.historyOnly ? t('learning.kb1') : '' }}</text
              >
              <text class="subtle"
                >{{ t('learning.kf7') }}{{ entry.followups.reliable }}{{ t('learning.kqx') }}{{ entry.followups.pending
                }}{{ t('learning.kl0') }}{{ entry.followups.helpedCorrect }}{{ t('learning.kto')
                }}{{ entry.followups.independentTransfer }}{{ t('learning.kw') }}{{ entry.followups.dueReview
                }}{{ t('learning.kbd') }}</text
              >
              <BaseButton variant="quiet" @tap="openQuestion(entry.questionKey, entry.conversationId)">{{
                t('learning.k1w')
              }}</BaseButton>
            </view>
          </template>
        </template>
        <template v-if="showPending && stats.pending">
          <text class="learning-label detail-heading">{{ t('learning.kuo') }}</text>
          <view v-for="attempt in pendingAttempts" :key="attempt.id" class="learning-row">
            <text>{{ questionPrompt(attempt.questionKey) }}{{ t('learning.k74') }}{{ attempt.answer }}</text>
            <view v-for="assessment in attempt.assistance || []" :key="assessment.id">
              <text class="subtle">{{ t('learning.k6i') }}{{ assessment.feedback }}</text>
              <template v-if="['subjective-rubric-v1', 'subjective-rubric-v2'].includes(assessment.contract)">
                <text class="subtle"
                  >{{ t('learning.kmr') }}{{ assessment.score === null ? t('learning.ki1') : assessment.score }} /
                  {{ assessment.maxScore }}</text
                >
                <RubricEvidence :attempt="attempt" :assessment="assessment" :context-key="learning.recordContext()" />
              </template>
            </view>
            <BaseButton variant="quiet" @tap="openQuestion(attempt.questionKey, attempt.conversationId)">{{
              t('learning.k6d')
            }}</BaseButton>
          </view>
        </template>
      </view>
    </template>
    <BaseEmpty
      v-else
      class="overview-empty"
      :title="
        view === 'mistake' && subject !== 'all'
          ? '该学科暂无记录'
          : t(view === 'mistake' ? 'ui.emptyMistakes' : view === 'plan' ? 'ui.emptyPlan' : 'ui.emptyStats')
      "
      mascot-size="medium"
      show-button
      :button-text="!inline && range === 'day' && hasHistory ? t('learning.history') : t('ui.learnNow')"
      @action="!inline && range === 'day' && hasHistory ? (range = 'history') : openView('learning')"
    />
    <view
      v-if="message"
      class="subtle overview-feedback"
      data-test="assessment-feedback"
      :role="messageError ? 'alert' : 'status'"
      ><BaseEmpty v-if="messageError" state="error" :title="learningText(message)" mascot-size="small" /><text v-else>{{
        learningText(message)
      }}</text></view
    >
    <CustomModal
      :key="dialogState.id"
      :visible="dialogState.visible"
      :title="learningText(dialogState.title)"
      :content="learningText(dialogState.content)"
      :editable="dialogState.editable"
      :placeholder-text="learningText(dialogState.placeholderText)"
      :confirm-text="learningText(dialogState.confirmText)"
      :cancel-text="learningText(dialogState.cancelText)"
      :type="dialogState.type"
      :is-dark="theme.isDark"
      @confirm="dialogState.confirm"
      @cancel="dialogState.cancel"
      @closed="dialogState.closed"
    />
  </BaseCard>
</template>
<script setup>
import { getCurrentRoute } from '@/utils/home-navigation.js';
import BaseEmpty from '@/components/base/base-empty/base-empty.vue';
import BaseStat from '@/components/base/base-stat/base-stat.vue';
import BaseSegmented from '@/components/base/base-segmented/base-segmented.vue';
import { learningText } from '@/i18n/learning.js';
import { publicError, t } from '@/i18n/index.js';
import BaseCard from '@/components/base/base-card/base-card.vue';
import BaseButton from '@/components/base/base-button/base-button.vue';

import { bindLearningKeyboard } from '@/services/learning/keyboard-controls.js';
import { computed, ref, shallowRef, watch, onMounted, onUnmounted } from 'vue';
import { onShow, onHide, onBackPress } from '@dcloudio/uni-app';
import CustomModal from '@/components/common/CustomModal.vue';
import RubricEvidence from '@/components/business/learning/rubric-evidence.vue';
import { createLearningDialog } from '@/services/learning/learning-dialog.js';
import { useThemeStore } from '@/stores/modules/theme.js';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { effectiveGrade, questionKey, knowledgeScope, dayKey } from '@/services/learning/learning-domain.js';
import { museRecordSubjects, museSubjectOptions } from '@/services/learning/muse-workspace-data.js';
import { safeNavigateTo } from '@/utils/safe-navigate';
const learning = useConversationLearningStore();
const calendarReader = learning.observeCalendar();
const theme = useThemeStore();
const learningRoot = ref(null);
let unbindKeyboard = () => undefined;
const props = defineProps({
  initialExpanded: Boolean,
  inline: Boolean,
  conversationId: { type: String, default: '' },
  showNavigation: { type: Boolean, default: true },
  view: { type: String, default: 'all' }
});
const expanded = ref(props.initialExpanded);
const subject = ref('all');
const attemptQuestion = (attempt) => learning.state.questions.find((q) => questionKey(q) === attempt.questionKey);
const attemptSubject = (attempt) => museRecordSubjects(attemptQuestion(attempt) || {}).join('、');
const attemptTopic = (attempt) => attemptQuestion(attempt)?.knowledgePoint || '练习';
const mistakeSubjects = computed(() =>
  museSubjectOptions(
    learning.state,
    stats.value.mistakes.map((attempt) => ({ subjects: museRecordSubjects(attemptQuestion(attempt) || {}) }))
  )
);
const filteredMistakes = computed(() =>
  stats.value.mistakes.filter(
    (attempt) =>
      subject.value === 'all' || museRecordSubjects(attemptQuestion(attempt) || {}).includes(subject.value.slice(8))
  )
);
watch(
  () => learning.recordContext(),
  () => {
    subject.value = 'all';
  }
);
const range = ref('day');
const message = ref('');
const messageError = ref(false);
let overviewAlive = true,
  overviewVisible = true,
  assessmentDraft = null,
  feedbackContext = learning.recordContext();
function setMessage(content, isError = false) {
  message.value = content;
  messageError.value = isError;
}
const dialogState = shallowRef({ id: 0, visible: false });
const dialogs = createLearningDialog({
  getContext: () => (overviewAlive && overviewVisible ? learning.recordContext() : null),
  onChange: (state) => {
    dialogState.value = state;
  },
  onError: (error) => setMessage(publicError(error), true)
});
watch(
  () => learning.state,
  () => {
    const context = learning.recordContext();
    if (context !== feedbackContext) {
      feedbackContext = context;
      assessmentDraft = null;
      setMessage('');
    }
    dialogs.invalidate();
    if (assessmentDraft && !stats.value.mistakes.some((attempt) => attempt.id === assessmentDraft.attemptId))
      assessmentDraft = null;
  },
  { flush: 'sync' }
);
onShow(() => {
  overviewVisible = true;
  calendarReader.show();
  refresh();
});
onHide(() => {
  overviewVisible = false;
  calendarReader.hide();
  dialogs.dismiss();
});
onBackPress(() => {
  if (!dialogState.value.visible) return false;
  dialogs.dismiss();
  return true;
});
const showTasks = computed(() => ['all', 'plan'].includes(props.view));
const showMistakes = computed(() => ['all', 'mistake'].includes(props.view));
const showKnowledge = computed(() => ['all', 'study-detail'].includes(props.view));
const showPending = computed(() => ['all', 'mistake', 'study-detail'].includes(props.view));
const stats = computed(() =>
  learning.scopedSummary(props.inline ? 'day' : range.value, props.conversationId || undefined)
);
const hasHistory = computed(() => !!(learning.state.attempts.length || learning.state.plans.length));
const hasRecords = computed(() =>
  props.view === 'mistake'
    ? !!(stats.value.mistakes.length || stats.value.due.length || stats.value.pending)
    : props.view === 'plan'
      ? !!(
          stats.value.tasks.denominator ||
          currentTasks.value.length ||
          priorPlans.value.length ||
          upcomingRetests.value.length
        )
      : !!(stats.value.tasks.denominator || stats.value.totalReliableAnswers || stats.value.pending)
);
const answerCount = computed(() => stats.value.totalReliableAnswers + stats.value.pending);
const currentTasks = computed(() => {
  const tasks = learning.state.plans.find((p) => p.id === stats.value.tasks.planId)?.tasks || [];
  const session = learning.state.conversations.find((c) => c.id === props.conversationId);
  if (!session) return tasks;
  const keys = new Set([
    session.activeQuestionKey,
    ...session.messages.map((m) => m.questionKey),
    ...learning.state.attempts.filter((a) => a.conversationId === session.id).map((a) => a.questionKey),
    ...(session.trainingGroups || []).flatMap((g) => g.questionKeys)
  ]);
  return tasks.filter((t) => keys.has(t.questionKey));
});
const methodNames = {
  explain: '直接讲解',
  question: '引导提问',
  hint: '分层提示',
  example: '例题示范',
  analogy: '类比',
  diagram: '图形辅助',
  steps: '拆分步骤',
  prerequisite: '先修补充',
  variant: '变式',
  challenge: '综合挑战',
  check: '独立检验',
  review: '到期复习'
};
const observationNames = {
  waiting: '尚无后续作答',
  pending: '后续作答待核对',
  blocked: '后续仍受阻',
  helped_correct: '提示后正确，仍需独立检验',
  independent_transfer: '独立变式正确，仍待复测',
  due_review: '到期独立复测正确',
  original_redo: '原题再次正确，不等同长期掌握'
};
const pendingAttempts = computed(() =>
  learning.state.attempts.filter(
    (a) =>
      effectiveGrade(a).status !== 'reliable' &&
      (!props.conversationId || a.conversationId === props.conversationId) &&
      (range.value === 'history' || dayKey(a.at, stats.value.timezone) === stats.value.day)
  )
);
const priorPlans = computed(() =>
  learning.state.plans.filter((p) => p.day === stats.value.day && p.id !== stats.value.tasks.planId)
);
const upcomingRetests = computed(() => {
  const latest = new Map(learning.state.plans.map((p) => [p.day, p]));
  const tasks = [];
  for (const [day, plan] of latest) {
    if (day <= stats.value.day) continue;
    for (const task of plan.tasks) {
      const question = learning.state.questions.find((q) => questionKey(q) === task.questionKey);
      const exercise =
        question?.writingExercise ||
        question?.scienceExercise ||
        question?.vocabularyReview ||
        question?.sentenceExercise;
      if (exercise?.phase === 'retest' && exercise.dueDay === day && !task.privacyRemoved)
        tasks.push({
          ...task,
          day,
          conversationId: exercise.conversationId,
          label: question.vocabularyReview
            ? '词义复测'
            : question.scienceExercise
              ? '科学复测'
              : question.sentenceExercise
                ? '句子复测'
                : '写作复测'
        });
    }
  }
  return tasks.sort((a, b) => a.day.localeCompare(b.day));
});
const questionPrompt = (key) => learning.state.questions.find((q) => questionKey(q) === key)?.prompt || key;
const knowledgeLabel = (scope) => {
  const question = learning.state.questions.find((q) => !q.knowledgePoint && knowledgeScope(q) === scope);
  return question?.prompt ? [question.subject, question.prompt].filter(Boolean).join(' / ') : scope;
};
const timezoneLabel = computed(
  () =>
    ({
      'Asia/Shanghai': '北京',
      'America/Los_Angeles': '洛杉矶',
      'America/New_York': '纽约',
      'Europe/London': '伦敦',
      'Asia/Tokyo': '东京',
      UTC: 'UTC'
    })[stats.value.timezone] || stats.value.timezone
);
function editPlan() {
  safeNavigateTo('/pages/learning/index?panel=profile');
}
function openView(view) {
  const path = `/pages/${view}/index`;
  if (getCurrentRoute() === path.slice(1)) return;
  safeNavigateTo(path);
}
function refresh() {
  try {
    learning.refresh();
  } catch (e) {
    setMessage(publicError(e), true);
  }
}
function openQuestion(key, conversationId, kind = null) {
  try {
    learning.focus(key, conversationId || undefined, kind);
    safeNavigateTo('/pages/learning/index');
  } catch (e) {
    setMessage(publicError(e), true);
  }
}
function complete(taskId) {
  try {
    learning.commit('task.complete', { planId: learning.currentPlan.id, taskId });
  } catch (e) {
    setMessage(publicError(e), true);
  }
}
function dispute(attemptId) {
  const context = learning.recordContext();
  const currentAttempt = () => stats.value.mistakes.some((attempt) => attempt.id === attemptId);
  const id = dialogs.show({
    title: '纠正判分',
    editable: true,
    type: 'warning',
    content:
      assessmentDraft?.context === context && assessmentDraft.attemptId === attemptId ? assessmentDraft.content : '',
    placeholderText: '说明争议点或提供核对依据',
    isCurrent: currentAttempt,
    success: (result) => {
      if (result.confirm && result.content?.trim()) {
        try {
          learning.correctAssessment(attemptId, result.content);
          assessmentDraft = null;
          setMessage('已撤销可靠结论并保留争议，等待有依据的核对。');
        } catch (e) {
          const canRetry = learning.recordContext() === context && currentAttempt();
          if (canRetry) assessmentDraft = { context, attemptId, content: result.content };
          setMessage(
            canRetry ? `${publicError(e).replace(/。$/, '')}。说明尚未保存，重新打开可继续编辑。` : publicError(e),
            true
          );
        }
      } else assessmentDraft = null;
    }
  });
  if (id !== null) setMessage('');
}
onMounted(() => {
  calendarReader.show();
  unbindKeyboard = bindLearningKeyboard(learningRoot.value);
  refresh();
  uni.$on('conversationLearningUpdated', refresh);
});
onUnmounted(() => {
  calendarReader.dispose();
  overviewAlive = false;
  assessmentDraft = null;
  dialogs.destroy();
  unbindKeyboard();
  uni.$off('conversationLearningUpdated', refresh);
});
</script>
<style scoped>
.learning-overview {
  margin: 0;
  padding: var(--s-5);
  color: var(--ink);
  font-size: var(--size-small);
}
.learning-overview.is-inline {
  margin: var(--s-6) 0;
  padding: var(--s-6);
  text-align: left;
}
.learning-links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
  margin-bottom: var(--s-4);
}
.overview-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s-2);
  margin-bottom: var(--s-4);
}
.overview-title {
  font-size: var(--size-body);
  font-weight: var(--weight-medium);
}
.overview-date {
  font-size: var(--size-caption);
  color: var(--ink-3);
}
.learning-summary {
  cursor: pointer;
  border-radius: var(--s-3);
  margin-top: var(--s-5);
  text-align: left;
}
.overview-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--s-5);
}
.overview-metric {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  min-width: 0;
}
.metric-label {
  font-size: var(--size-small);
  color: var(--ink-3);
}
.metric-empty {
  display: block;
  margin-top: var(--s-4);
  color: var(--ink-3);
  font-size: var(--size-caption);
}
.summary-line {
  display: flex;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-3) 0;
  font-size: var(--size-small);
  margin-top: var(--s-4);
  flex-wrap: wrap;
}
.summary-line > view {
  display: flex;
  align-items: center;
  gap: var(--s-3);
}
.summary-rate {
  font-size: var(--size-caption);
  color: var(--ink-3);
}
.task-progress {
  height: var(--s-2);
  margin-top: var(--s-5);
  background: var(--line);
  border-radius: var(--s-2);
  overflow: hidden;
}
.task-progress > view {
  height: 100%;
  width: 100%;
  transform-origin: left;
  background: var(--brand);
  border-radius: var(--r-pill);
}
.answer-distribution {
  display: flex;
  height: var(--s-2);
  gap: var(--s-1);
  overflow: hidden;
  border-radius: var(--s-2);
  margin-top: var(--s-1);
}
.answer-checked {
  background: var(--violet-ink);
}
.answer-pending {
  background: var(--apricot-fill);
}
.summary-foot {
  display: flex;
  gap: var(--s-2);
  align-items: center;
  margin-top: var(--s-3);
  font-size: var(--size-caption);
  color: var(--ink-3);
}
.summary-foot > text:nth-child(2) {
  margin-left: auto;
}
.learning-details {
  margin-top: var(--s-5);
  padding-top: var(--s-5);
  border-top: var(--border-thin) solid var(--line);
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}
.detail-heading {
  margin-top: var(--s-6);
  margin-bottom: var(--s-2);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
}
.learning-label {
  font-size: var(--size-body);
  font-weight: var(--weight-medium);
}
.learning-row {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  padding: var(--s-5) 0;
  border-bottom: var(--border-thin) solid var(--line);
}
.record-question {
  font-size: var(--size-title-3);
  line-height: 1.7;
}
.record-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}
.subtle {
  color: var(--ink-3);
  font-size: var(--size-caption);
  line-height: 1.8;
}
.record-empty {
  display: flex;
  align-items: flex-start;
  flex-direction: column;
  gap: var(--s-3);
  padding: var(--s-6) 0;
}
.record-empty > text:not(.subtle) {
  font-size: var(--size-body);
}
.task-row,
.knowledge-row {
  flex-direction: row;
  align-items: center;
  gap: var(--s-4);
}
.task-indicator {
  width: var(--s-6);
  height: var(--s-6);
  border-radius: 50%;
  box-shadow: none;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.task-indicator.completed {
  background: var(--paper-sunk);
}
.row-content {
  min-width: 0;
  flex: 1;
}
.row-content text {
  display: block;
  overflow-wrap: anywhere;
}
.knowledge-state {
  border-radius: var(--s-6);
  padding: var(--s-2) var(--s-3);
  font-size: var(--size-caption);
  background: var(--paper-sunk);
  white-space: nowrap;
}
.overview-feedback {
  display: block;
  margin-top: var(--s-4);
}
.overview-feedback.is-error {
  padding: var(--s-3);
  border: var(--border-thin) solid var(--line);
  border-radius: var(--s-3);
  background: var(--violet-soft);
  color: var(--ink);
}
@media (hover: hover) {
}
@media (prefers-reduced-motion: reduce) {
}
@media (max-width: 520px) {
  .learning-overview.is-inline {
    padding: var(--s-5);
  }
  .overview-metrics {
    gap: var(--s-3);
  }
  .task-row {
    flex-wrap: wrap;
  }
  .task-row .row-content {
    flex-basis: calc(100% - var(--s-4));
  }
  .record-question {
    font-size: var(--size-body);
  }
  .knowledge-state {
    max-width: 50%;
    white-space: normal;
  }
}
</style>
