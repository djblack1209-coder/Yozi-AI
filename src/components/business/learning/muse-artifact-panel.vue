<template>
  <view
    ref="root"
    class="muse-artifact-panel"
    :class="{ 'is-closing': closing }"
    :data-artifact-id="target.id"
    role="region"
    aria-label="文档工件"
    tabindex="-1"
    :aria-busy="loading || busy"
  >
    <view class="artifact-panel-head">
      <view
        ><text class="artifact-panel-kind">Document</text>
        <text class="artifact-panel-title" role="heading" aria-level="2">{{
          doc?.artifact.title || draft?.title || (needsSync && localSource?.title) || '文档'
        }}</text></view
      >
      <BaseButton class="artifact-back" variant="quiet" icon="arrow-left" icon-only label="返回" @tap="close" />
      <BaseButton class="artifact-close" variant="quiet" icon="close" icon-only label="关闭文档" @tap="close" />
    </view>
    <view v-if="error" class="artifact-panel-error" role="alert">
      <text>{{ error }}</text
      ><BaseButton variant="quiet" :disabled="busy || loading" @tap="retry">重试</BaseButton>
      <BaseButton
        v-if="needsSync && localSource"
        data-artifact-sync
        variant="quiet"
        :disabled="busy || loading || learning.syncBusy || learning.busy"
        @tap="confirmAction = 'sync'"
        >同步学习记录</BaseButton
      >
      <BaseButton v-if="doc" variant="quiet" :disabled="busy || loading" @tap="confirmAction = 'reload'"
        >重新载入</BaseButton
      >
    </view>
    <text v-if="loading" role="status">正在载入文档…</text>
    <view v-if="needsSync && localSource && !draft" class="artifact-panel-body">
      <text class="artifact-panel-version">本机原稿</text>
      <text class="artifact-panel-content" selectable>{{ localSource.content }}</text>
    </view>
    <text v-if="syncingSource && current()" role="status">{{
      learning.syncProgress?.phase || '正在同步学习记录…'
    }}</text>
    <BaseButton v-if="syncingSource && current()" variant="quiet" @tap="current() && learning.cancelSync()"
      >取消同步</BaseButton
    >
    <template v-if="draft">
      <view class="artifact-panel-toolbar" role="group" aria-label="文档操作">
        <BaseButton
          variant="quiet"
          :selected="draft.mode === 'read' && !historical"
          :disabled="busy || loading"
          @tap="setMode('read')"
          >查看</BaseButton
        >
        <BaseButton
          variant="quiet"
          :selected="draft.mode === 'edit' && !historical"
          :disabled="busy || loading"
          @tap="setMode('edit')"
          >编辑</BaseButton
        >
        <BaseButton
          variant="quiet"
          data-artifact-save
          :disabled="busy || loading || !doc || !!historical || !dirty || !draft.title.trim()"
          @tap="save()"
          >{{ busy ? '正在保存…' : saved ? '已保存' : '保存' }}</BaseButton
        >
        <BaseButton variant="quiet" :disabled="busy || loading || !doc" data-artifact-history @tap="showHistory"
          >版本历史</BaseButton
        >
      </view>
      <text class="artifact-panel-version" role="status" :data-version="viewVersion">
        {{ historical ? '正在查看版本' : '版本' }} {{ viewVersion }}{{ saved ? ' · 已保存' : '' }}
      </text>
      <view v-if="history" class="artifact-panel-history">
        <view class="artifact-panel-history-head"
          ><text>版本历史</text>
          <BaseButton
            variant="quiet"
            icon="close"
            icon-only
            label="关闭版本历史"
            @tap="
              history = null;
              historical = null;
            "
        /></view>
        <BaseButton
          v-for="version in [...history].reverse()"
          :key="version.version"
          class="artifact-revision"
          variant="quiet"
          align="start"
          :data-artifact-version="version.version"
          :selected="historical?.version === version.version"
          :disabled="busy || loading"
          @tap="showVersion(version.version)"
        >
          <text>版本 {{ version.version }}</text
          ><text>{{ new Date(version.created).toLocaleString() }}</text>
        </BaseButton>
      </view>
      <BaseButton
        v-if="historical && historical.version !== doc?.artifact.version"
        data-artifact-restore
        variant="quiet"
        :disabled="busy || loading"
        @tap="confirmAction = 'restore'"
        >恢复此版本为新版本</BaseButton
      >
      <view ref="body" class="artifact-panel-body" @scroll="rememberScroll">
        <view v-if="draft.mode === 'edit' && !historical" class="artifact-panel-editor">
          <BaseInput
            :model-value="draft.title"
            label="文档名称"
            maxlength="200"
            :disabled="busy || loading"
            @update:model-value="change({ title: $event })"
          />
          <!-- Use the existing BaseInput H5/native split: uni-textarea does not
               forward the accessible name to its inner WebKit textarea. -->
          <component
            :is="'textarea'"
            v-if="!nativeEditor"
            class="artifact-panel-textarea"
            aria-label="正文"
            :value="draft.content"
            :disabled="busy || loading"
            :maxlength="64000"
            @input="change({ content: $event.target.value })"
            @scroll="rememberEditorScroll"
          />
          <textarea
            v-else
            class="artifact-panel-textarea"
            aria-label="正文"
            :value="draft.content"
            :disabled="busy || loading"
            :maxlength="64000"
            :auto-height="false"
            :adjust-position="false"
            @input="change({ content: $event.detail?.value ?? $event.target.value })"
            @scroll="rememberEditorScroll"
          ></textarea>
        </view>
        <text v-else class="artifact-panel-content" selectable>{{
          historical?.content ?? doc?.revision.content ?? draft.content
        }}</text>
      </view>
    </template>
    <CustomModal
      :visible="!!confirmAction"
      :title="
        confirmAction === 'sync'
          ? '同步学习记录？'
          : confirmAction === 'restore'
            ? `恢复到版本 ${historical?.version}？`
            : '重新载入文档？'
      "
      :content="
        confirmAction === 'sync'
          ? '会把当前账号的对话、私人资料片段、页图与学习记录发送至本Yozi AI 服务。同步完成后，请重新打开文档。本机原稿保留。'
          : confirmAction === 'restore'
            ? '将该版本保存为一个新版本，现有历史保留。未保存修改将被替换。'
            : '这会丢弃此面板的未保存修改，载入已保存的最新版本。'
      "
      :confirm-text="confirmAction === 'sync' ? '同步' : confirmAction === 'restore' ? '恢复为新版本' : '重新载入'"
      @cancel="confirmAction = ''"
      @confirm="confirm"
    />
  </view>
</template>
<script setup>
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { onBackPress } from '@dcloudio/uni-app';
import { assertSession } from '@/services/auth-storage.js';
import {
  createLearningArtifacts,
  studentEssaySources,
  ARTIFACT_CONFLICT
} from '@/services/learning/learning-artifacts.js';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { safeNavigateTo } from '@/utils/safe-navigate.js';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseInput from '@/components/base/base-input/base-input.vue';
import CustomModal from '@/components/common/CustomModal.vue';
const props = defineProps({ target: { type: Object, required: true } });
const emit = defineEmits(['close']);
const learning = useConversationLearningStore();
let nativeEditor = true;
// #ifdef H5
nativeEditor = false;
// #endif
const root = ref(null),
  body = ref(null),
  doc = ref(null),
  draft = ref(null),
  history = ref(null),
  historical = ref(null);
const loading = ref(false),
  busy = ref(false),
  saved = ref(false),
  error = ref(''),
  needsSync = ref(false),
  syncingSource = ref(false),
  closing = ref(false),
  confirmAction = ref('');
const retryAction = ref('');
const viewVersion = computed(
  () =>
    historical.value?.version ||
    (draft.value?.mode === 'edit' ? draft.value.version : doc.value?.artifact.version || draft.value?.version)
);
let client,
  sequence = 0,
  alive = true,
  closeTimer,
  previousFocus;
const dirty = computed(
  () =>
    !!doc.value &&
    !!draft.value &&
    (draft.value.version !== doc.value.artifact.version ||
      draft.value.title !== doc.value.revision.title ||
      draft.value.content !== doc.value.revision.content)
);
const current = () =>
  alive && props.target.owner === learning.state.owner && props.target.context === learning.recordContext();
const localSource = computed(() =>
  current()
    ? studentEssaySources(learning.state).find(
        (item) =>
          item.id === props.target.id &&
          ['conversationId', 'kind', 'sourceId', 'day'].every((key) => item.source[key] === props.target.source?.[key])
      )
    : null
);
function persist() {
  if (!client || !draft.value || !current()) return false;
  try {
    const pending = client.readDraft(props.target.id)?.pending || draft.value.pending;
    client.writeDraft(props.target.id, { ...draft.value, pending });
    return true;
  } catch (e) {
    error.value = e.message;
    return false;
  }
}
function makeDraft(value) {
  return {
    version: value.artifact.version,
    title: value.revision.title,
    content: value.revision.content,
    scrollTop: 0,
    editorScrollTop: 0,
    mode: 'read',
    pending: null
  };
}
function pendingMutation() {
  try {
    const value = JSON.parse(client.readDraft(props.target.id)?.pending?.signature || 'null');
    return value?.id === props.target.id &&
      value.expectedVersion === draft.value?.version &&
      (value.action === 'save' ||
        (value.action === 'restore' && Number.isSafeInteger(value.sourceVersion) && value.sourceVersion > 0))
      ? value
      : null;
  } catch {
    return null;
  }
}
async function position() {
  await nextTick();
  if (!current() || !draft.value) return;
  const node = body.value?.$el || body.value;
  if (node) node.scrollTop = draft.value.scrollTop;
  const editor = node?.querySelector?.('textarea');
  if (editor) editor.scrollTop = draft.value.editorScrollTop || 0;
}
async function load(discard = false) {
  if (busy.value || !current()) return;
  const ticket = ++sequence;
  loading.value = true;
  retryAction.value = '';
  error.value = '';
  needsSync.value = false;
  historical.value = null;
  history.value = null;
  try {
    if (!client)
      client = createLearningArtifacts({
        check: (session) => {
          assertSession(session);
          if (!current()) throw new Error('登录会话已变化，未发送旧内容');
        }
      });
    if (client.owner !== props.target.owner) return;
    const scratch = client.readDraft(props.target.id);
    if (!draft.value && scratch) draft.value = scratch;
    retryAction.value = discard ? '' : pendingMutation()?.action || '';
    const value = await client.open(props.target);
    if (!current() || ticket !== sequence) return;
    doc.value = value;
    draft.value = discard || !scratch ? makeDraft(value) : scratch;
    if (draft.value.version !== value.artifact.version) error.value = ARTIFACT_CONFLICT;
    if (discard) client.writeDraft(props.target.id, draft.value);
    else persist();
    await position();
  } catch (e) {
    if (current() && ticket === sequence) {
      needsSync.value =
        !doc.value &&
        !draft.value?.pending &&
        !!localSource.value &&
        ['ARTIFACT_SOURCE_UNSYNCED', 'ARTIFACT_NOT_FOUND'].includes(e.code);
      error.value = needsSync.value ? '这份原文尚未同步。同步后请重新打开文档。' : e.message;
    }
  } finally {
    if (current() && ticket === sequence) loading.value = false;
  }
}
async function syncSource() {
  if (!needsSync.value || !localSource.value || busy.value || loading.value || learning.syncBusy || learning.busy)
    return;
  const ticket = ++sequence;
  busy.value = syncingSource.value = true;
  error.value = '';
  try {
    await learning.syncRecords(true);
    // Successful sync advances the repository lifecycle. The shell closes this
    // stale target; reopening binds the source to the new, checked context.
    if (current() && ticket === sequence) {
      busy.value = false;
      await load();
    }
  } catch (e) {
    if (current() && ticket === sequence) error.value = e.message || '同步未完成，本机原稿已保留。';
  } finally {
    if (current()) busy.value = syncingSource.value = false;
  }
}
function change(patch) {
  if (!draft.value || busy.value || loading.value) return;
  draft.value = { ...draft.value, ...patch };
  saved.value = false;
  persist();
}
function setMode(mode) {
  historical.value = null;
  change({ mode });
  position();
}
function rememberScroll(event) {
  if (!draft.value || historical.value) return;
  const node = body.value?.$el || body.value;
  const top = event.detail?.scrollTop ?? node?.scrollTop ?? event.target?.scrollTop;
  if (!Number.isFinite(top) || top < 0) return;
  draft.value.scrollTop = top;
  persist();
}
function rememberEditorScroll(event) {
  if (!draft.value) return;
  const node = body.value?.$el || body.value;
  const top = event.detail?.scrollTop ?? node?.querySelector?.('textarea')?.scrollTop ?? event.target?.scrollTop;
  if (!Number.isFinite(top) || top < 0) return;
  draft.value.editorScrollTop = top;
  persist();
}
async function save(restore = false, retryPending = false) {
  if (busy.value || loading.value || !doc.value || !draft.value || !current()) return;
  // A restored version may already have committed before a lost reply/restart.
  // Retry its persisted base/source, rather than using the newly loaded head.
  const pending = retryPending ? pendingMutation() : null;
  const sourceVersion = restore ? pending?.sourceVersion || historical.value?.version : null;
  if (restore && !sourceVersion) return;
  const ticket = ++sequence;
  busy.value = true;
  retryAction.value = restore ? 'restore' : 'save';
  error.value = '';
  try {
    const submission = {
      ...draft.value,
      ...(restore ? { version: pending?.expectedVersion || doc.value.artifact.version } : {})
    };
    const value = await client.mutate(props.target.id, submission, sourceVersion, { retryPending });
    if (!current() || ticket !== sequence) return;
    doc.value = value;
    draft.value = client.readDraft(props.target.id);
    saved.value =
      draft.value.version === value.revision.version &&
      draft.value.title === value.revision.title &&
      draft.value.content === value.revision.content &&
      !draft.value.pending;
    retryAction.value = '';
    historical.value = null;
    history.value = null;
    await position();
  } catch (e) {
    if (current() && ticket === sequence) error.value = e.message;
  } finally {
    if (current() && ticket === sequence) busy.value = false;
  }
}
function retry() {
  const pending = pendingMutation();
  if (pending && doc.value) save(pending.action === 'restore', true);
  else if (retryAction.value && doc.value) save(retryAction.value === 'restore');
  else load();
}
async function showHistory() {
  const ticket = ++sequence;
  error.value = '';
  try {
    const versions = await client.versions(props.target.id);
    if (current() && ticket === sequence) history.value = versions;
  } catch (e) {
    if (current() && ticket === sequence) error.value = e.message;
  }
}
async function showVersion(version) {
  const ticket = ++sequence;
  error.value = '';
  try {
    const value = await client.get(props.target.id, version);
    if (current() && ticket === sequence) historical.value = value.revision;
  } catch (e) {
    if (current() && ticket === sequence) error.value = e.message;
  }
}
function confirm() {
  const action = confirmAction.value;
  confirmAction.value = '';
  if (action === 'sync') syncSource();
  else if (action === 'restore') save(true);
  else load(true);
}
function close() {
  if (closing.value) return;
  // A failed device write must not silently discard this live scratch buffer.
  if (!busy.value && draft.value && !persist()) return;
  closing.value = true;
  closeTimer = setTimeout(() => {
    emit('close');
    if (typeof window !== 'undefined' && window.innerWidth <= 760 && props.target.route?.includes('archive')) {
      learning.locateConversation(props.target.source.conversationId);
      safeNavigateTo('/pages/learning/index');
    }
  }, 160); // Muse 2 实现参数： ArtifactPanel.tsx:58.
}
defineExpose({ close });
// #ifdef APP-PLUS
onBackPress(() => {
  close();
  return true;
});
// #endif
watch(
  () => props.target.id,
  () => {
    client = null;
    doc.value = draft.value = null;
    load();
  },
  { immediate: true }
);
onMounted(() => {
  previousFocus = typeof document !== 'undefined' ? document.activeElement : null;
  (root.value?.$el || root.value)?.focus?.({ preventScroll: true });
});
onBeforeUnmount(() => {
  // Edits/scroll were saved on each change. Never write a stale buffer over an
  // in-flight mutation's receipt while closing or changing account.
  alive = false;
  ++sequence;
  clearTimeout(closeTimer);
  if (previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true });
});
</script>
<style scoped>
/* Muse 2 实现参数： ArtifactPanel.css:6,16,19,23-28. */
.muse-artifact-panel {
  position: absolute;
  z-index: 35;
  inset: 0 0 0 auto;
  width: clamp(340px, 44%, 520px);
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 22px 24px;
  background: var(--paper);
  border-left: 1px solid var(--line);
  box-shadow: -12px 0 30px #0003;
  outline: none;
  overflow: hidden;
  animation: artifact-enter 180ms ease-out;
}
.muse-artifact-panel.is-closing {
  transform: translateX(100%);
  opacity: 0;
  transition:
    transform 160ms ease-in,
    opacity 160ms ease-in;
  pointer-events: none;
}
@keyframes artifact-enter {
  from {
    transform: translateX(30px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
.artifact-panel-head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: none;
}
.artifact-panel-head > view {
  flex: 1;
  min-width: 0;
}
.artifact-panel-kind {
  color: var(--ink-3);
  font-size: 12px;
}
.artifact-panel-title {
  display: block;
  margin-top: 5px;
  font-size: 21px;
  font-weight: 550;
  overflow-wrap: anywhere;
}
.artifact-back {
  display: none;
}
.artifact-panel-toolbar {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  flex: none;
}
.artifact-panel-toolbar :deep(.base-button) {
  font-size: 12px;
}
.artifact-panel-version {
  color: var(--ink-3);
  font-size: 12px;
  line-height: 18px;
}
.artifact-panel-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
}
.artifact-panel-content {
  display: block;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 15px;
  line-height: 1.65;
}
.artifact-panel-editor {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  min-height: 280px;
}
.artifact-panel-textarea {
  box-sizing: border-box;
  flex: 1;
  min-height: 240px;
  width: 100%;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--muse-rich-surface);
  color: var(--ink);
  font-size: 14px;
  line-height: 1.6;
}
.artifact-panel-error {
  flex: none;
  color: var(--danger);
  font-size: 13px;
  line-height: 1.6;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--muse-rich-surface);
}
.artifact-panel-history {
  flex: none;
  max-height: 210px;
  overflow: auto;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px;
}
.artifact-panel-history-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}
.artifact-revision {
  width: 100%;
}
.artifact-revision :deep(.base-button__content) {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}
.artifact-revision text:last-child {
  color: var(--ink-3);
  font-size: 11px;
}
@media (max-width: 760px) {
  .muse-artifact-panel {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    height: 100dvh;
    padding: max(18px, env(safe-area-inset-top)) 18px max(18px, env(safe-area-inset-bottom));
    border: 0;
  }
  .artifact-back {
    display: flex;
    order: -1;
  }
  .artifact-close {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .muse-artifact-panel {
    animation: none;
  }
  .muse-artifact-panel.is-closing {
    transition: none;
  }
}
</style>
