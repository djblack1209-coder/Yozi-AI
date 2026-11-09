<template>
  <view class="muse-usage" aria-label="使用情况">
    <view class="artifact-bar"
      ><BaseButton variant="quiet" icon="chevron-left" icon-only label="返回" @tap="$emit('close')" /><text
        role="heading"
        aria-level="1"
        >{{ t('muse.usage') }}</text
      ><view class="artifact-spacer" /><BaseButton
        variant="quiet"
        icon="settings"
        icon-only
        label="AI 连接器"
        @tap="manage"
    /></view>
    <view class="artifact-body"
      ><view class="quota-canvas">
        <view class="quota-head"
          ><image :src="theme.isDark ? BRAND.markOnDark : BRAND.mark" mode="aspectFit" alt="" /><text
            class="quota-title"
            >使用情况</text
          ><text class="quota-stamp" role="status">{{ refreshed }}</text></view
        >
        <MuseConversationFilter />
        <view class="quota-local-head">
          <text class="quota-section-title" role="heading" aria-level="2">本机学习用量</text>
          <BaseButton variant="quiet" icon="chart" @tap="localUsageOpen = true">{{
            t('muse.usage.details')
          }}</BaseButton>
        </view>
        <view class="quota-local-layout">
          <MuseStudyTrend
            :key="JSON.stringify([learning.recordContext(), context.id.value, data.submissionDays[0].day])"
            :recent="data.submissionDays"
            :prior="data.priorSubmissionDays"
          />
          <view class="quota-local-stats">
            <view v-for="metric in localMetrics" :key="metric.label" class="quota-stat">
              <text class="quota-stat-label">{{ metric.label }}</text
              ><text class="quota-stat-value">{{ metric.value }}</text>
            </view>
          </view>
        </view>
        <view class="quota-stat quota-request-summary">
          <text class="quota-stat-label">模型请求 · {{ data.total }} 次</text>
          <text class="quota-stat-foot"
            >{{ data.completed }} 成功 · {{ data.failed }} 失败 · {{ data.unconfirmed }} 待确认{{
              data.otherClosed ? ` · ${data.otherClosed} 已关闭` : ''
            }}</text
          >
        </view>
        <MuseStudyBeads
          :key="JSON.stringify([learning.recordContext(), context.id.value])"
          :recent="data.submissionDays"
          :prior="data.priorSubmissionDays"
          :dark="theme.isDark"
        />
        <text class="quota-sub">本机记录，不等于供应商账单。提交含练习原答与段落初稿，不含改写和复习自评。</text>
        <view v-if="account.quota" class="quota-platform">
          <text class="quota-section-title">账户总额度</text>
          <view class="quota-details"
            ><text>已用 / 总额</text><text>{{ account.quota.used }} / {{ account.quota.limit }}</text> <text>剩余</text
            ><text>{{ account.quota.remaining }}</text
            ><text>预留</text><text>{{ account.quota.reserved }}</text> <text v-if="account.quota.week">周期</text
            ><text v-if="account.quota.week">{{ account.quota.week }}</text>
          </view>
        </view>
        <text v-else class="quota-no-models">账户总额度未同步</text>
        <view class="quota-models"
          ><view class="quota-models-head"
            ><text>{{ context.id.value === 'all' ? '第三方模型' : '当前对话的第三方模型回执' }}</text></view
          ><view v-if="account.models.length" class="quota-model-table" role="table" aria-label="第三方模型消耗"
            ><view class="quota-model-grid quota-model-heading" role="row"
              ><text role="columnheader">模型</text><text role="columnheader">{{ t('muse.usage.requests') }}</text
              ><text role="columnheader">{{ t('muse.usage.tokens') }}</text
              ><text role="columnheader">{{ t('muse.usage.usd') }}</text></view
            ><view v-for="model in account.models" :key="model.id" class="quota-model-grid" role="row"
              ><view role="cell"
                ><BaseButton
                  class="quota-model-action"
                  variant="quiet"
                  align="start"
                  icon="file-text"
                  :label="t('muse.usage.openReceipt', { model: model.model || model.provider })"
                  @tap="receiptId = model.id"
                >
                  <text>{{ model.provider }}</text>
                  <text class="quota-model-id">{{ model.model }}</text>
                </BaseButton></view
              ><text role="cell">{{ model.count }}</text
              ><text role="cell">{{ usageTokens(model) }}</text
              ><text role="cell">{{ usageCost(model) }}</text></view
            ></view
          ><text v-if="!account.models.length" class="quota-no-models">{{
            context.id.value === 'all' ? '暂无第三方模型用量' : '暂无可定位到本对话的用量回执'
          }}</text></view
        >
        <view class="quota-note"
          ><text v-if="learning.modelUsageState.phase === 'error'" role="alert">{{
            publicError(learning.modelUsageState.message)
          }}</text
          ><view v-else /><BaseButton
            variant="quiet"
            icon="refresh"
            :loading="learning.modelUsageState.phase === 'loading'"
            @tap="refresh"
            >刷新</BaseButton
          ></view
        >
      </view></view
    >
    <StudyUsageDetails
      :visible="localUsageOpen"
      :metrics="localMetrics"
      :scope="scopeLabel"
      :dark="theme.isDark"
      @close="localUsageOpen = false"
    />
    <ModelUsageReceipt :receipt="receipt" :scope="scopeLabel" :dark="theme.isDark" @close="receiptId = null" />
  </view>
</template>
<script setup>
import MuseConversationFilter from './muse-conversation-filter.vue';
import MuseStudyBeads from './muse-study-beads.vue';
import MuseStudyTrend from './muse-study-trend.vue';
import StudyUsageDetails from './study-usage-details.vue';
import ModelUsageReceipt from './model-usage-receipt.vue';
import { workspaceConversationContext } from '@/services/learning/workspace-context.js';
import { computed, ref, watch, onMounted } from 'vue';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { museUsage } from '@/services/learning/muse-workspace-data.js';
import { museAccountUsage } from '@/services/learning/muse-account-usage.js';
import { safeNavigateTo, requestProfilePanel } from '@/utils/safe-navigate.js';
import { getToken } from '@/services/auth-storage.js';
import '@/i18n/muse.js';
import { publicError, t } from '@/i18n/index.js';
import { BRAND } from '@/config/brand.js';
import { useThemeStore } from '@/stores/modules/theme.js';
import BaseButton from '@/components/base/base-button/base-button.vue';
defineEmits(['close']);
const learning = useConversationLearningStore(),
  theme = useThemeStore(),
  refreshed = ref('');
const localUsageOpen = ref(false);
const receiptId = ref(null);
const context = workspaceConversationContext(learning);
const scopeLabel = computed(() => context.options.value.find((option) => option.id === context.id.value)?.label);
const data = computed(() => museUsage(context.state.value, learning.calendarTime));
const account = computed(() =>
  museAccountUsage(
    context.id.value === 'all'
      ? learning.usage
      : {
          ...learning.usage,
          calls: learning.usage?.calls?.filter((call) =>
            context.state.value.conversations.some((c) => c.id === call.conversationId)
          )
        }
  )
);
const receipt = computed(() => {
  const model = account.value.models.find((row) => row.id === receiptId.value);
  return model ? { ...model, tokenLabel: usageTokens(model), costLabel: usageCost(model) } : null;
});
const localMetrics = computed(() => [
  { label: '已提交', value: data.value.submitted, icon: 'book-open', tone: 'is-sky' },
  { label: '已评估', value: data.value.assessed, icon: 'check', tone: 'is-mint' },
  { label: '待评估', value: data.value.awaitingAssessment, icon: 'clock', tone: 'is-violet' },
  { label: '到期复习', value: data.value.due, icon: 'refresh', tone: 'is-honey' }
]);
function usageTokens(model) {
  if (!model.missingUsage) return model.tokens;
  const pending = t('muse.usage.tokensPending');
  return model.tokens ? `${model.tokens} + ${pending}` : pending;
}
function usageCost(model) {
  return model.pendingCost ? t('muse.usage.costPending') : model.cost.toFixed(4);
}
function manage() {
  requestProfilePanel('connectors');
  safeNavigateTo('/pages/profile/index');
}
async function refresh() {
  const context = learning.recordContext();
  learning.refresh();
  if (getToken())
    try {
      await learning.loadUsage();
    } catch {
      /* Store owns the read status. */
    }
  if (context === learning.recordContext())
    refreshed.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}
watch([() => learning.recordContext(), context.id], ([owner], [previousOwner]) => {
  if (owner !== previousOwner) refreshed.value = '';
  localUsageOpen.value = false;
  receiptId.value = null;
});
watch(receipt, (model) => {
  if (!model) receiptId.value = null;
});
onMounted(refresh);
</script>
<style scoped>
.quota-local-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 14px;
}
.quota-local-head .quota-section-title {
  margin: 0;
}
.quota-section-title {
  display: block;
  margin: 24px 0 8px;
  font-size: 16px;
  font-weight: 600;
}
.quota-local-layout,
.quota-local-stats {
  display: grid;
  gap: 10px;
}
.quota-local-layout {
  margin-top: 8px;
  align-items: start;
}
.quota-local-stats {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.quota-local-stats .quota-stat {
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--muse-popover);
}
.quota-stat.quota-request-summary {
  border-bottom: 1px solid var(--line);
  padding: 20px 0 14px;
}
.quota-platform {
  padding-bottom: 20px;
}
@container study-usage (min-width: 620px) {
  .quota-local-layout {
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  }
}
.muse-usage {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  overflow: hidden;
}
.artifact-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  flex: none;
  padding: 0 16px 0 20px;
  border-bottom: 1px solid var(--line);
  font-size: 15px;
  font-weight: 600;
}
.artifact-bar .base-button {
  padding: 0;
  border-radius: 8px;
  width: 44px;
  color: var(--ink-3);
}
.artifact-spacer {
  flex: 1;
}
.artifact-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  scrollbar-width: none;
}
.quota-canvas {
  --quota-accent: #ff7a45;
  --quota-accent-ink: #ffab88;
  max-width: 980px;
  min-height: 100%;
  margin: 0 auto;
  padding: 36px 48px 40px;
  container: study-usage / inline-size;
}
.quota-head {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-bottom: 22px;
  border-bottom: 1px solid var(--line);
}
.quota-head image {
  width: 40px;
  height: 40px;
  flex: none;
}
.quota-title {
  display: block;
  font-size: 26px;
  line-height: 32px;
  font-weight: 700;
  letter-spacing: -0.025em;
}
.quota-sub {
  display: block;
  margin-top: 5px;
  font-size: 13px;
  line-height: 18px;
  color: var(--ink-3);
}
.quota-stamp {
  margin-left: auto;
  white-space: nowrap;
  font-size: 11px;
  color: var(--ink-3);
}
.quota-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 292px;
  padding: 30px 0 34px;
  border-bottom: 1px solid var(--line);
}
.quota-hero-main {
  min-width: 0;
  padding-right: 32px;
}
.quota-plan-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.quota-plan-tabs .base-button {
  padding: 0 10px;
  border-radius: 999px;
  font-size: 13px;
  min-height: 36px;
}
.quota-plan-tabs .is-selected {
  background: var(--muse-selected);
}
.quota-track > view {
  height: 100%;
  border-radius: inherit;
  background: var(--quota-accent);
}
.quota-details {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 12px;
  font-size: 12px;
  color: var(--ink-3);
  margin-top: 20px;
}
.quota-details > text:nth-child(even) {
  text-align: right;
  color: var(--ink-2);
}
.quota-model-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) 0.6fr 1fr 1fr;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
  font-size: 12px;
  line-height: 20px;
}
.quota-model-grid > * {
  min-width: 0;
  overflow-wrap: anywhere;
}
.quota-model-heading {
  color: var(--ink-3);
}
.quota-model-id {
  display: block;
  color: var(--ink-3);
  font-size: 11px;
}
.quota-model-table {
  overflow-wrap: anywhere;
}
.quota-model-action {
  width: 100%;
  padding: 4px 6px;
  text-align: left;
  color: var(--ink);
}
.quota-model-action :deep(.base-button__content) {
  min-width: 0;
  display: block;
}
.quota-model-action :deep(.base-icon) {
  flex: none;
}
.quota-plan {
  font-size: 14px;
  font-weight: 600;
}
.quota-big {
  display: block;
  margin: 6px 0 0 -4px;
  font-size: 108px;
  line-height: 1;
  font-weight: 700;
  letter-spacing: -0.06em;
  color: var(--quota-accent);
}
.quota-big .quota-unit {
  font-size: 46px;
  margin-left: 4px;
}
.quota-track {
  height: 5px;
  border-radius: 3px;
  background: var(--muse-raised);
  margin: 22px 0 12px;
}
.quota-used {
  font-size: 13px;
  color: var(--quota-accent-ink);
}
.quota-aside {
  border-left: 1px solid var(--line);
  padding-left: 32px;
}
.quota-chip {
  display: inline-flex;
  padding: 3px 10px;
  border-radius: 999px;
  background: #ff7a4524;
  font-size: 11px;
  line-height: 18px;
  font-weight: 600;
  color: var(--quota-accent-ink);
}
.quota-aside-title {
  display: block;
  margin: 14px 0 8px;
  font-size: 22px;
  line-height: 28px;
  font-weight: 650;
  letter-spacing: -0.02em;
}
.quota-meta {
  display: block;
  font-size: 12px;
  line-height: 19px;
  color: var(--ink-3);
}
.quota-rule {
  height: 1px;
  background: var(--line);
  margin: 18px 0;
}
.quota-aside-subtitle {
  display: block;
  margin-bottom: 7px;
  font-size: 13px;
  font-weight: 600;
}
.quota-stat {
  min-width: 0;
}
.quota-stat-label,
.quota-stat-foot {
  display: block;
  font-size: 12px;
  color: var(--ink-3);
}
.quota-stat-value {
  display: block;
  margin-top: 4px;
  font-size: 20px;
  font-weight: 650;
  letter-spacing: -0.025em;
}
.quota-stat-foot {
  margin-top: 8px;
  font-size: 11px;
  line-height: 17px;
}
.quota-models {
  padding-top: 26px;
}
.quota-models-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  font-size: 14px;
  font-weight: 600;
}
.quota-models-head > text + text {
  font-size: 11px;
  font-weight: 400;
  color: var(--ink-3);
}
.quota-model-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 11px 0;
  border-bottom: 1px solid var(--line);
  font-size: 12px;
}
.quota-model-row > text:first-child {
  min-width: 0;
  overflow-wrap: anywhere;
}
.quota-model-row > text + text {
  white-space: nowrap;
}
.quota-no-models {
  display: block;
  padding: 24px 0;
  font-size: 12px;
  color: var(--ink-3);
}
.quota-note {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  border-top: 1px solid var(--line);
  padding-top: 16px;
  margin-top: 26px;
  font-size: 11px;
  color: var(--ink-3);
}
.quota-note .base-button {
  border-radius: 999px;
  font-size: 12px;
  color: var(--quota-accent-ink);
}
:global(.space-light) .quota-canvas {
  --quota-accent: #c05a29;
  --quota-accent-ink: #a1441c;
}
@media (max-width: 880px) {
  .quota-canvas {
    padding: 28px 24px 32px;
  }
  .quota-hero {
    grid-template-columns: 1fr;
    gap: 24px;
  }
  .quota-aside {
    border-left: 0;
    border-top: 1px solid var(--line);
    padding: 22px 0 0;
  }
  .quota-big {
    font-size: 84px;
  }
}
@media (max-width: 760px) {
  .artifact-bar {
    gap: 4px;
    padding: 0 8px;
  }
  .quota-canvas {
    padding: 24px 16px;
  }
  .quota-title {
    font-size: 22px;
  }
  .quota-head {
    flex-wrap: wrap;
  }
  .quota-stamp {
    margin-left: 54px;
  }
  .quota-note {
    flex-wrap: wrap;
  }
}
</style>
