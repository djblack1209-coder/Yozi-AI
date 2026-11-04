<template>
  <view class="muse-page">
    <view class="muse-page-head"
      ><text class="muse-page-title" role="heading" aria-level="1">{{ t('muse.phrases') }}</text
      ><view class="insight-head-actions"
        ><BaseButton variant="quiet" @tap="safeNavigateTo('/pages/learning/knowledge')">知识框架</BaseButton
        ><BaseButton variant="quiet" icon="download" icon-only label="保存学习图片" @tap="sharing = true" />
        <BaseButton variant="primary" icon="plus" @tap="safeNavigateTo('/pages/learning/index')"
          >继续学习</BaseButton
        ></view
      ></view
    >
    <view class="muse-page-scroll"
      ><view class="muse-page-body muse-page-body--wide">
        <MuseConversationFilter />
        <view class="insight-toolbar"
          ><view class="workspace-filters" role="tablist" aria-label="学习洞察"
            ><BaseButton
              v-for="tab in tabs"
              :key="tab.id"
              variant="quiet"
              role="tab"
              :aria-selected="section === tab.id"
              :selected="section === tab.id"
              @tap="section = tab.id"
              >{{ tab.label }}</BaseButton
            ></view
          ><BaseInput v-model="query" label="搜索学习洞察" placeholder="搜索" hide-label maxlength="120"
        /></view>
        <view v-if="section === 'overview'" class="insight-overview">
          <view class="insight-stat"
            ><BaseIcon name="pen" size="24px" /><text>已提交</text
            ><text class="insight-number">{{ data.submitted }}</text
            ><view
              class="insight-bars"
              role="img"
              :aria-label="data.days.map((day) => `${day.day} ${day.count} 次`).join('，')"
              ><view v-for="day in data.days" :key="day.day"
                ><view :style="{ height: `${(day.count / maxCount) * 48}px` }" /><text>{{
                  day.day.slice(8)
                }}</text></view
              ></view
            ></view
          >
          <view class="insight-stat"
            ><BaseIcon name="file-text" size="24px" /><text>{{ materialOnly ? '完成训练' : '成文成果' }}</text
            ><text class="insight-number"
              >{{ materialOnly ? data.completedDays : data.essays
              }}<text class="insight-unit">{{ materialOnly ? '天' : '篇' }}</text></text
            ><view class="insight-pairs"
              ><text>{{ materialOnly ? '反馈' : '改写' }}</text
              ><text>{{ materialOnly ? data.feedbackCount : data.rewrites }} {{ materialOnly ? '次' : '段' }}</text
              ><text>{{ materialOnly ? '复习积累' : '完成训练' }}</text
              ><text
                >{{ materialOnly ? data.phrases.length : data.completedDays }} {{ materialOnly ? '条' : '天' }}</text
              ></view
            ></view
          >
          <BaseButton class="insight-stat insight-stat-button" variant="quiet" align="start" @tap="section = 'phrases'"
            ><BaseIcon name="refresh" size="24px" /><text>到期复习</text
            ><text class="insight-number">{{ data.due }}<text class="insight-unit">条</text></text
            ><view class="insight-pairs"
              ><text>{{ materialOnly ? '知识点积累' : '句式积累' }}</text
              ><text>{{ data.phrases.length }} 条</text><text>熟悉 · 自评</text
              ><text>{{ data.familiar }} 条</text></view
            ></BaseButton
          >
        </view>
        <template v-if="['overview', 'weaknesses', 'strengths'].includes(section)">
          <template v-for="group in observationGroups" :key="group.id">
            <view class="insight-group-head"
              ><text role="heading" aria-level="2">{{ group.label }}</text
              ><text class="insight-badge">AI 评估</text></view
            >
            <view class="ideas-grid"
              ><BaseButton
                v-for="item in group.items"
                :key="item.id"
                class="observation-card"
                variant="quiet"
                align="start"
                :label="`展开 ${item.label}`"
                @tap="expanded = item"
                ><view class="observation-icon" :class="group.id"
                  ><BaseIcon :name="group.id === 'strengths' ? 'check' : 'target'" size="24px" /></view
                ><view class="observation-main"
                  ><view class="observation-head"
                    ><text class="observation-title">{{ item.label }}</text
                    ><text class="insight-badge">{{ item.evidence.length }}</text></view
                  ><text class="observation-advice">{{ observationAdvice(item) }}</text
                  ><view class="observation-foot"
                    ><text>{{ item.evidence.at(-1)?.day }}</text
                    ><BaseIcon name="arrow-right" size="16px" /></view></view></BaseButton
            ></view>
            <text v-if="!group.items.length" class="insight-empty">{{
              data.pending ? '待评估' : group.id === 'strengths' ? '暂无优点记录' : '暂无薄弱点记录'
            }}</text>
          </template>
        </template>
        <template v-if="section === 'phrases'">
          <view class="ideas-grid"
            ><view v-for="item in phrases" :key="`${item.conversationId}:${item.id}`" class="phrase-card"
              ><BaseIcon name="bulb" size="24px" /><text class="phrase-text" selectable>{{ item.text }}</text
              ><view class="observation-foot"
                ><text>{{
                  item.paused ? '已暂停使用' : item.due <= learning.calendarTime ? '待复习' : dateLabel(item.due)
                }}</text
                ><BaseButton
                  variant="quiet"
                  icon="arrow-right"
                  icon-only
                  label="查看原对话"
                  @tap="open(item.conversationId)"
                />
                <BaseButton
                  v-if="DEV_TEST && !item.paused"
                  variant="quiet"
                  @tap="
                    practiceId = item.id;
                    practiceAnswer = '';
                    practiceError = '';
                  "
                  >主动复习</BaseButton
                >
                <BaseButton
                  variant="quiet"
                  :disabled="learning.busy"
                  :data-library-use="`${item.conversationId}:${item.id}`"
                  @tap="chooseUse(item)"
                  >{{ item.paused ? '恢复使用' : '暂停使用' }}</BaseButton
                >
              </view>
              <view v-if="DEV_TEST && !item.paused && practiceId === item.id" class="active-practice">
                <BaseInput v-model="practiceAnswer" label="用这条句式另造一句" multiline />
                <text>主动练习只保存原答与系统核对结果，不改变到期安排。</text>
                <view class="active-practice-actions">
                  <BaseButton
                    variant="quiet"
                    :disabled="!practiceAnswer.trim() || learning.busy"
                    @tap="savePractice(item)"
                    >提交练习</BaseButton
                  >
                </view>
                <text v-if="practiceError" role="alert">{{ practiceError }}</text>
              </view>
              <view v-if="DEV_TEST && practiceRecord(item)" role="status" class="active-practice">
                <text>主动练习已保存 · 核对：{{ practiceRatings[practiceRecord(item).rating - 1] }}</text>
                <text selectable>{{ practiceRecord(item).answer }}</text>
              </view>
            </view></view
          ><text v-if="!phrases.length" class="insight-empty">{{ materialOnly ? '暂无知识点' : '暂无句式' }}</text>
        </template>
      </view></view
    >
    <MuseShareSheet :category="context.id.value" :visible="sharing" @close="sharing = false" />
    <CustomModal
      :visible="Boolean(useChoice)"
      :title="useChoice?.paused ? '暂停使用' : '恢复使用'"
      :confirm-text="useChoice?.paused ? '暂停使用' : '恢复使用'"
      :confirm-disabled="learning.busy"
      :is-dark="theme.isDark"
      @cancel="
        useChoice = null;
        useError = '';
      "
      @confirm="saveUse"
    >
      <text>{{
        useChoice?.paused
          ? '暂停后不再提示复习，也不用于新的带写参考；原句和历史记录保留。'
          : '恢复后继续沿用原复习安排，并可在授权后用于后续带写参考。'
      }}</text>
      <text v-if="useError" role="alert">{{ useError }}</text>
    </CustomModal>
    <CustomModal
      :visible="Boolean(expanded)"
      :title="expanded?.label || ''"
      :is-dark="theme.isDark"
      :show-actions="false"
      close-button
      mask-closable
      @cancel="expanded = null"
      ><view v-if="expanded" class="insight-detail"
        ><view v-for="(record, index) in expanded.evidence" :key="index" class="insight-evidence"
          ><view class="observation-foot"
            ><text>{{ record.day }}</text
            ><text class="insight-badge">AI 评估</text></view
          ><MuseFeedbackCard :feedback="record.feedback" :adoptable="false" /><BaseButton
            variant="quiet"
            icon="arrow-right"
            @tap="open(record.conversationId, record.day)"
            >查看原答</BaseButton
          ><BaseButton
            v-if="record.feedback?.kind === 'essay' && essayFor(record)"
            variant="quiet"
            icon="file-text"
            @tap="openStudentArtifact(learning, essayFor(record))"
            >打开文档</BaseButton
          ></view
        ></view
      ></CustomModal
    >
  </view>
</template>
<script setup>
import MuseConversationFilter from './muse-conversation-filter.vue';
import { DEV_TEST } from '@/config/build-channel.js';
import { workspaceConversationContext } from '@/services/learning/workspace-context.js';
import { computed, ref, watch, onUnmounted } from 'vue';
import '@/i18n/muse.js';
import { t, publicError } from '@/i18n/index.js';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { useThemeStore } from '@/stores/modules/theme.js';
import { museLearningInsights, coachFeedbackPreview } from '@/services/learning/muse-learning-insights.js';
import { studentEssaySources, openStudentArtifact } from '@/services/learning/learning-artifacts.js';
import { coachUsesMaterials } from '../../../../laf-backend/functions/_shared/learning-writing-coach.js';
import { safeNavigateTo } from '@/utils/safe-navigate.js';
import BaseInput from '@/components/base/base-input/base-input.vue';
import BaseButton from '@/components/base/base-button/base-button.vue';
import CustomModal from '@/components/common/CustomModal.vue';
import MuseFeedbackCard from './muse-feedback-card.vue';
import MuseShareSheet from './muse-share-sheet.vue';
const learning = useConversationLearningStore(),
  theme = useThemeStore();
const context = workspaceConversationContext(learning);
const practiceId = ref(''),
  practiceAnswer = ref(''),
  practiceError = ref('');
const practiceRatings = ['再学一次', '吃力', '记得', '轻松'];
function practiceRecord(item) {
  return learning.state.conversations
    .find((entry) => entry.id === item.conversationId)
    ?.coach?.library.find((entry) => entry.id === item.id)
    ?.practices?.at(-1);
}
function savePractice(item) {
  try {
    const answer = practiceAnswer.value;
    learning.locateConversation(item.conversationId);
    learning.coachPractice(item.id, answer);
    practiceId.value = '';
    practiceAnswer.value = '';
  } catch (error) {
    practiceError.value = publicError(error);
  }
}
const query = ref(''),
  sharing = ref(false),
  section = ref('overview'),
  expanded = ref(null),
  useChoice = ref(null),
  useError = ref('');
function chooseUse(item) {
  useError.value = '';
  useChoice.value = {
    conversationId: item.conversationId,
    itemId: item.id,
    expectedPaused: item.paused,
    paused: !item.paused,
    context: learning.recordContext()
  };
}
function saveUse() {
  try {
    const choice = useChoice.value;
    if (!choice || choice.context !== learning.recordContext())
      throw Object.assign(new Error('记录已变化，请重新打开'), { code: 'CONTEXT_CHANGED' });
    learning.setLibraryUse(choice.conversationId, choice.itemId, choice.paused, choice.expectedPaused);
    useChoice.value = null;
    useError.value = '';
  } catch (error) {
    useError.value = publicError(error);
  }
}
const materialOnly = computed(() => {
  const coaches = context.state.value.conversations.filter((item) => item.coach?.profile);
  return coaches.length > 0 && coaches.every((item) => coachUsesMaterials(item.coach));
});
const tabs = computed(() => [
  { id: 'overview', label: '总览' },
  { id: 'weaknesses', label: '薄弱点' },
  { id: 'strengths', label: '优点' },
  { id: 'phrases', label: materialOnly.value ? '知识点' : '句式' }
]);
const data = computed(() => museLearningInsights(context.state.value, learning.calendarTime));
const essays = computed(() => studentEssaySources(context.state.value));
const essayFor = (record) =>
  essays.value.filter((item) => item.conversationId === record.conversationId && item.day === record.day).at(-1);
const maxCount = computed(() => Math.max(1, ...data.value.days.map((day) => day.count)));
const matches = (text) => text.toLocaleLowerCase().includes(query.value.trim().toLocaleLowerCase());
function observationAdvice(item) {
  return coachFeedbackPreview(item.evidence.at(-1)?.feedback);
}
const observationGroups = computed(() =>
  [
    { id: 'weaknesses', label: '薄弱点', items: data.value.weaknesses },
    { id: 'strengths', label: '优点', items: data.value.strengths }
  ]
    .filter((group) => section.value === 'overview' || section.value === group.id)
    .map((group) => ({ ...group, items: group.items.filter((item) => matches(item.label)) }))
);
const phrases = computed(() => data.value.phrases.filter((item) => matches(`${item.text} ${item.goal}`)));
watch([() => learning.recordContext(), () => context.id.value], () => {
  practiceId.value = practiceAnswer.value = practiceError.value = '';
  query.value = '';
  sharing.value = false;
  expanded.value = null;
  useChoice.value = null;
  useError.value = '';
  section.value = 'overview';
});
const calendar = learning.observeCalendar();
calendar.show();
onUnmounted(() => calendar.dispose());
function dateLabel(value) {
  return value ? new Date(value).toLocaleDateString('zh-CN') : '';
}
function open(id, day) {
  if (learning.busy) return;
  expanded.value = null;
  learning.locateConversation(id, day);
  safeNavigateTo('/pages/learning/index');
}
</script>
<style src="./muse-pages.css"></style>
<style scoped>
.active-practice {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.active-practice-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.insight-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.insight-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}
.insight-toolbar > .base-field {
  width: 210px;
  flex: none;
}
.insight-toolbar :deep(.base-field__group) {
  border-radius: 999px;
  background: var(--muse-rich-surface);
}
.insight-overview {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
.insight-stat {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  min-height: 228px;
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: var(--muse-rich-surface);
  font-size: 14px;
  font-weight: 500;
  color: var(--ink);
}
.insight-stat :deep(.base-icon) {
  color: var(--ink-3);
}
.insight-stat-button :deep(.base-button__content) {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
}
.muse-page .insight-stat-button {
  border-radius: 20px;
  padding: 22px;
  font-size: 14px;
}
.insight-number {
  font-size: 44px;
  font-weight: 650;
  line-height: 1.15;
  letter-spacing: -0.04em;
}
.insight-number .insight-unit {
  font-size: 14px;
  margin-left: 6px;
  letter-spacing: 0;
  color: var(--ink-3);
}
.insight-pairs {
  display: grid;
  grid-template-columns: 1fr auto;
  width: 100%;
  gap: 8px;
  font-size: 12px;
  color: var(--ink-3);
  margin-top: auto;
}
.insight-pairs > text:nth-child(even) {
  text-align: right;
  color: var(--ink-2);
}
.insight-bars {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  height: 68px;
  width: 100%;
  margin-top: auto;
}
.insight-bars > view {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  gap: 5px;
  height: 100%;
  font-size: 10px;
  color: var(--ink-3);
}
.insight-bars > view > view {
  width: 100%;
  background: var(--blue);
  border-radius: 3px 3px 0 0;
}
.insight-group-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  font-size: 16px;
  font-weight: 600;
}
.insight-badge {
  padding: 3px 7px;
  border-radius: 999px;
  background: var(--muse-selected);
  color: var(--ink-3);
  font-size: 11px;
  line-height: 16px;
  font-weight: 400;
  white-space: nowrap;
}
.ideas-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
.muse-page .observation-card {
  padding: 18px;
  border-radius: 20px;
  background: var(--muse-rich-surface);
  box-shadow: inset 0 0 0 1px var(--line);
  white-space: normal;
  align-items: flex-start;
}
.observation-card :deep(.base-button__content) {
  align-items: flex-start;
  gap: 14px;
  width: 100%;
}
.observation-icon {
  flex: none;
  color: var(--warning);
}
.observation-icon.strengths {
  color: var(--success);
}
.observation-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.observation-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  justify-content: space-between;
}
.observation-title {
  font-size: 15px;
  font-weight: 600;
  line-height: 21px;
  overflow-wrap: anywhere;
}
.observation-advice {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 13px;
  line-height: 20px;
  color: var(--ink-3);
  text-align: left;
}
.observation-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: var(--ink-3);
  width: 100%;
  margin-top: auto;
}
.phrase-card {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: var(--muse-rich-surface);
  border: 1px solid var(--line);
  border-radius: 20px;
  min-height: 180px;
}
.phrase-text {
  font-size: 14px;
  line-height: 22px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.insight-empty {
  color: var(--ink-3);
  font-size: 13px;
  padding: 20px 0;
}
.insight-detail {
  max-height: 65vh;
  overflow: auto;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.insight-evidence {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
@media (max-width: 1050px) {
  .ideas-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .insight-toolbar {
    flex-wrap: wrap;
  }
  .insight-overview {
    gap: 10px;
  }
  .insight-stat,
  .muse-page .insight-stat-button {
    padding: 16px;
  }
}
@media (max-width: 760px) {
  .muse-page-head {
    flex-wrap: wrap;
    gap: 12px;
  }
  .insight-head-actions {
    flex-wrap: wrap;
    max-width: 100%;
  }
  .ideas-grid,
  .insight-overview {
    grid-template-columns: 1fr;
  }
  .insight-toolbar {
    gap: 12px;
  }
  .insight-toolbar > .base-field {
    width: 100%;
  }
  .insight-stat {
    min-height: 180px;
  }
  .insight-detail {
    max-height: 60vh;
  }
}
</style>
