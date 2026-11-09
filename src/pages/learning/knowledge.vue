<template>
  <view class="knowledge-page yozi-page muse-space" :class="theme.isDark ? 'space-dark' : 'space-light'">
    <view class="knowledge-head">
      <BaseButton variant="quiet" icon="chevron-left" label="返回洞察或资料库" @tap="goBack">返回</BaseButton>
      <BaseButton variant="quiet" @tap="safeNavigateTo('/pages/learning/index')">回到对话</BaseButton>
    </view>
    <view class="knowledge-title">
      <text role="heading" aria-level="1">{{ graph.title }}</text>
      <text class="knowledge-subtitle">{{ goal?.goal || '成人考研 · 英语一／英语二' }}</text>
    </view>
    <ProgressOverview
      v-if="overview"
      class="knowledge-progress"
      :model="overview"
      @open="openEvidence"
      @source="selectSource"
    />
    <view class="knowledge-views" role="group" aria-label="知识框架">
      <BaseButton variant="quiet" :selected="mapView === 'framework'" @tap="mapView = 'framework'">知识框架</BaseButton>
      <BaseButton variant="quiet" :selected="mapView === 'mind'" @tap="mapView = 'mind'">思维导图</BaseButton>
    </view>
    <view class="knowledge-legend">
      <text>{{ graph.nodes.length }} 节点 · {{ graph.edges.length }} 关系</text>
      <text><text class="edge-key" />hard 必需先修</text>
      <text><text class="edge-key soft" />soft 辅助提示</text>
      <text>AI 评估</text>
    </view>
    <view v-if="graph.nodes.length" class="knowledge-layout">
      <view
        v-if="mapView === 'framework'"
        class="knowledge-map"
        :style="{ width: `${graph.width}px`, height: `${graph.height}px` }"
        role="group"
        aria-label="写作能力图谱，箭头由先修指向后续能力"
      >
        <image
          class="knowledge-edges"
          :class="{ 'has-motion-layer': selectedId }"
          :src="source"
          mode="scaleToFill"
          aria-hidden="true"
          :style="{ height: `${graph.height}px` }"
        />
        <image
          v-if="selectedId"
          class="knowledge-edges knowledge-edges--motion"
          :src="motionSource"
          mode="scaleToFill"
          aria-hidden="true"
          :style="{ height: `${graph.height}px` }"
        />
        <view v-for="group in graph.groups" :key="group.name" class="knowledge-domain" :style="{ top: `${group.y}px` }">
          <text>{{ group.name }}</text
          ><text class="domain-count">{{ group.count }}</text>
        </view>
        <BaseButton
          v-for="node in graph.nodes"
          :key="node.id"
          class="knowledge-node"
          :class="{ 'is-weakness': node.isWeakness, 'is-connected': connectedIds.has(node.id) }"
          variant="quiet"
          :data-node-id="node.id"
          :selected="selectedId === node.id"
          :aria-pressed="selectedId === node.id"
          :label="`${node.name} · ${node.statusLabel}，查看详情`"
          :style="nodeStyle(node)"
          @tap="selectNode(node.id)"
        >
          <text class="node-name">{{ node.name }}</text
          ><text class="node-status">{{ node.statusLabel }}<template v-if="node.isWeakness"> · 薄弱点</template></text>
        </BaseButton>
      </view>
      <ProgressMindMap v-else class="knowledge-mind" :model="progress" :selected-id="selectedId" @select="selectNode" />
      <view
        id="knowledge-detail"
        class="knowledge-detail"
        role="region"
        aria-label="节点详情"
        aria-live="polite"
        tabindex="-1"
      >
        <template v-if="detail">
          <view class="detail-heading"
            ><text class="detail-domain">{{ detail.chapter }}</text
            ><text class="review-badge">待审核</text></view
          >
          <text class="detail-title" role="heading" aria-level="2">{{ detail.name }}</text>
          <text class="record-status"
            >{{ detail.statusLabel }} · {{ detail.evidenceIds.length ? 'AI 评估' : detail.recordLabel
            }}<template v-if="detail.isWeakness"> · 薄弱点</template></text
          >
          <ProgressEvidence :events="nodeEvents" :page-size="2" @open="openEvidence" />
          <BaseButton v-if="windowWidth < 960" variant="quiet" @tap="returnToMap">返回图谱</BaseButton>
          <text class="detail-label">节点详情</text>
          <text v-for="criterion in detail.masteryCriteria" :key="criterion" class="detail-copy">{{ criterion }}</text>
          <text class="detail-label">诊断题提示 · 待审核</text>
          <text class="detail-copy">{{ detail.diagnosticPrompt || '暂无题目提示' }}</text>
          <text class="detail-label">先修能力</text>
          <view v-for="edge in detail.prerequisites" :key="edge.from" class="prerequisite">
            <BaseButton variant="quiet" :label="`查看先修：${edge.fromName}`" @tap="selectNode(edge.from, false)">{{
              edge.fromName
            }}</BaseButton>
            <text>{{ edge.strength === 'hard' ? 'hard · 必需' : 'soft · 辅助' }}</text>
          </view>
          <text v-if="!detail.prerequisites.length" class="detail-copy">无先修关系</text>
          <BaseButton class="diagnosis-pending" variant="secondary" disabled>诊断接入待审核</BaseButton>
        </template>
        <template v-else><text class="detail-title">选择一个能力节点</text></template>
      </view>
    </view>
    <view v-else class="knowledge-empty" role="status">暂无知识框架</view>
    <text class="knowledge-footer">大纲对齐待核对</text>
    <CustomModal
      :visible="Boolean(record)"
      title="学习记录"
      :is-dark="theme.isDark"
      :show-actions="false"
      close-button
      mask-closable
      @cancel="recordId = ''"
    >
      <view v-if="record" class="progress-original">
        <text>{{ record.day }}</text
        ><text>{{ record.prompt || record.goal }}</text>
        <text selectable>{{ record.answer }}</text>
      </view>
    </CustomModal>
  </view>
</template>
<script setup>
import { computed, ref, nextTick, watch } from 'vue';
import { onLoad, onResize, onShow } from '@dcloudio/uni-app';
import BaseButton from '@/components/base/base-button/base-button.vue';
import CustomModal from '@/components/common/CustomModal.vue';
import ProgressOverview from '@/components/business/learning/progress/progress-overview.vue';
import ProgressEvidence from '@/components/business/learning/progress/progress-evidence.vue';
import ProgressMindMap from '@/components/business/learning/progress/progress-mind-map.vue';
import { useThemeStore } from '@/stores/modules/theme.js';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { learningProgressReadModel } from '@/services/learning/learning-progress-read-model.js';
import { learningRecordTarget } from '../../../laf-backend/functions/_shared/learning-record-search.js';
import { learningModelSourceKey } from '../../../laf-backend/functions/_shared/learning-model-origin.js';
import { safeNavigateTo } from '@/utils/safe-navigate.js';
import { knowledgeGraphSeed } from '@/services/learning/knowledge-graph-seed.js';
import {
  knowledgeGraphView,
  knowledgeNodeDetail,
  knowledgeGraphSvg
} from '@/services/learning/knowledge-graph-view.js';
const theme = useThemeStore();
const learning = useConversationLearningStore();
const windowWidth = ref(390),
  goalId = ref(''),
  selectedId = ref(''),
  mapView = ref('framework'),
  recordId = ref(''),
  sourceKey = ref('');
const goal = computed(() =>
  learning.recordReadState === 'ready'
    ? learning.state.conversations.find((session) => session.id === goalId.value)
    : null
);
const allProgress = computed(() =>
  learningProgressReadModel(learning.recordReadState === 'ready' ? learning.state : { owner: learning.state.owner }, {
    conversationId: goalId.value
  })
);
const progress = computed(() => {
  const model = allProgress.value;
  const selected =
    sourceKey.value && model.sources.find((source) => learningModelSourceKey(source) === sourceKey.value);
  if (!selected) return model;
  const ids = new Set(selected.evidenceIds);
  return {
    ...model,
    subjects: selected.subjects,
    nodes: selected.nodes,
    weaknesses: selected.nodes.filter((node) => node.isWeakness),
    evidence: model.evidence.filter((event) => ids.has(event.id))
  };
});
const overview = computed(() => {
  const subject = typeof knowledgeGraphSeed.subject === 'string' ? knowledgeGraphSeed.subject.trim() : '';
  if (!subject || !knowledgeGraphSeed.subjectLabel?.trim()) return null;
  const model = allProgress.value;
  const evidence = model.evidence.filter((event) => event.subject === subject);
  const ids = new Set(evidence.map((event) => event.id));
  return {
    ...model,
    evidence,
    subjects: model.subjects.filter((item) => item.id === subject),
    sources: model.sources
      .filter((source) => source.evidenceIds.some((id) => ids.has(id)))
      .map((source) => ({
        ...source,
        evidenceIds: source.evidenceIds.filter((id) => ids.has(id)),
        subjects: source.subjects.filter((item) => item.id === subject)
      }))
  };
});
const graph = computed(() =>
  knowledgeGraphView(
    knowledgeGraphSeed,
    windowWidth.value >= 960 ? Math.min(680, windowWidth.value - 420) : windowWidth.value - 32,
    progress.value
  )
);
const detail = computed(() => knowledgeNodeDetail(graph.value, selectedId.value));
const connectedIds = computed(() => {
  const ids = new Set();
  for (const edge of graph.value.edges) {
    if (edge.from === selectedId.value) ids.add(edge.to);
    if (edge.to === selectedId.value) ids.add(edge.from);
  }
  return ids;
});
const nodeEvents = computed(() =>
  progress.value.evidence.filter((event) => detail.value?.evidenceIds.includes(event.id))
);
const record = computed(() => {
  if (!recordId.value || !progress.value.evidence.some((event) => event.recordId === recordId.value)) return null;
  try {
    return learningRecordTarget(learning.state, recordId.value);
  } catch {
    return null;
  }
});
function openEvidence(event) {
  recordId.value = event.recordId || '';
}
function selectSource(key) {
  sourceKey.value = key;
  recordId.value = '';
}
watch(
  () => learning.recordContext(),
  () => {
    selectedId.value = '';
    recordId.value = '';
    sourceKey.value = '';
  }
);
onShow(() => {
  learning.refresh();
});
const source = computed(
  () => 'data:image/svg+xml,' + encodeURIComponent(knowledgeGraphSvg(graph.value, theme.isDark, selectedId.value))
);
const motionSource = computed(
  () => 'data:image/svg+xml,' + encodeURIComponent(knowledgeGraphSvg(graph.value, theme.isDark, selectedId.value, true))
);
const nodeStyle = (node) => ({
  left: `${node.x}px`,
  top: `${node.y}px`,
  width: `${node.width}px`,
  height: `${node.height}px`
});
onLoad((options) => {
  goalId.value = options?.goal || '';
  windowWidth.value = uni.getWindowInfo?.().windowWidth || uni.getSystemInfoSync().windowWidth || 390;
});
onResize((event) => {
  windowWidth.value = event.size.windowWidth;
});
async function selectNode(id, scroll = true) {
  selectedId.value = id;
  await nextTick();
  if (scroll && windowWidth.value < 960) uni.pageScrollTo({ selector: '#knowledge-detail', duration: 0 });
}
function returnToMap() {
  uni.pageScrollTo({ scrollTop: 0, duration: 0 });
}
function goBack() {
  if (getCurrentPages().length < 2) {
    safeNavigateTo('/pages/archive/index?view=phrases');
    return;
  }
  uni.navigateBack({ fail: () => safeNavigateTo('/pages/archive/index?view=phrases') });
}
</script>
<style scoped>
.knowledge-page {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 24px 16px calc(32px + env(safe-area-inset-bottom));
  overflow-wrap: anywhere;
  background: var(--canvas);
  color: var(--ink);
}
.knowledge-head,
.knowledge-title,
.knowledge-legend,
.knowledge-layout,
.knowledge-footer {
  max-width: 1060px;
  margin: 0 auto;
}
.knowledge-progress,
.knowledge-views {
  max-width: 1060px;
  margin: 0 auto 24px;
}
.knowledge-views {
  display: flex;
  gap: 8px;
}
.knowledge-node.base-button.is-weakness {
  border-left: 3px solid var(--muse-rich-warning);
}
.knowledge-mind {
  flex: 1;
  min-width: 0;
}
.knowledge-detail :deep(.progress-evidence) {
  margin-top: 16px;
}
.progress-original {
  display: flex;
  flex-direction: column;
  gap: 16px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.8;
}
.knowledge-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.knowledge-head .base-button {
  border-radius: 999px;
}
.knowledge-title {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 24px 0 18px;
}
.knowledge-title > text:first-child {
  font-size: 24px;
  line-height: 32px;
  font-weight: 680;
  letter-spacing: -0.03em;
}
.knowledge-subtitle {
  font-size: 13px;
  color: var(--ink-3);
  line-height: 1.6;
}
.knowledge-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 18px;
  color: var(--ink-3);
  font-size: 12px;
  padding-bottom: 20px;
}
.edge-key {
  display: inline-block;
  width: 18px;
  border-top: 1.5px solid currentColor;
  vertical-align: middle;
  margin-right: 5px;
}
.edge-key.soft {
  border-top-style: dashed;
}
.knowledge-layout {
  display: flex;
  align-items: flex-start;
  gap: 24px;
}
.knowledge-map {
  position: relative;
  flex-shrink: 0;
  max-width: 100%;
}
.knowledge-edges {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  pointer-events: none;
}
.knowledge-edges--motion {
  display: none;
}
@media (prefers-reduced-motion: no-preference) {
  .knowledge-edges.has-motion-layer {
    display: none;
  }
  .knowledge-edges--motion {
    display: block;
  }
}
.knowledge-domain {
  position: absolute;
  left: 22px;
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
}
.domain-count {
  color: var(--ink-3);
  font-size: 11px;
  font-weight: 400;
}
.knowledge-node.base-button {
  position: absolute;
  min-height: 44px;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  background: var(--canvas);
  color: var(--ink);
  padding: 6px;
  font-size: 12px;
  line-height: 18px;
}
.knowledge-node :deep(.base-button__content) {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.knowledge-node.is-selected {
  border-color: var(--ink-2);
  background: var(--paper-sunk);
  box-shadow: 0 0 0 2px var(--muse-selected);
}
.knowledge-node.is-connected {
  border-color: var(--blue-ink, #126895);
}
@media (prefers-reduced-motion: no-preference) {
  .knowledge-node.is-connected {
    animation: connection-arrival 460ms ease-out 210ms both;
  }
}
@keyframes connection-arrival {
  0%,
  100% {
    box-shadow: none;
  }
  45% {
    box-shadow: 0 0 0 3px var(--muse-selected);
  }
}
.node-name {
  font-weight: 600;
}
.node-status {
  color: var(--ink-3);
  font-size: 10px;
}
.knowledge-detail {
  position: sticky;
  top: 18px;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line-strong);
  border-radius: 16px;
  padding: 20px;
  background: var(--paper-sunk);
  box-sizing: border-box;
}
.detail-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  font-size: 12px;
}
.detail-domain,
.record-status {
  color: var(--ink-3);
}
.review-badge {
  color: var(--muse-rich-warning);
  background: var(--muse-raised);
  border-radius: 99px;
  padding: 4px 9px;
}
.detail-title {
  font-size: 21px;
  line-height: 30px;
  font-weight: 650;
  margin-top: 12px;
}
.record-status {
  font-size: 12px;
  margin-top: 6px;
}
.detail-label {
  font-size: 12px;
  font-weight: 600;
  margin: 24px 0 8px;
}
.detail-copy {
  font-size: 14px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}
.prerequisite {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.prerequisite .base-button {
  padding: 5px 0;
  font-size: 13px;
}
.prerequisite > text {
  font-size: 11px;
  color: var(--ink-3);
  white-space: nowrap;
}
.diagnosis-pending {
  margin-top: 24px;
  font-size: 12px;
}
.knowledge-footer {
  display: block;
  color: var(--ink-3);
  font-size: 11px;
  line-height: 1.8;
  padding-top: 24px;
}
.knowledge-empty {
  padding: 60px 0;
  text-align: center;
}
@media (max-width: 959px) {
  .knowledge-layout {
    flex-direction: column;
  }
  .knowledge-detail {
    position: static;
    width: 100%;
    scroll-margin-top: 16px;
  }
}
</style>
