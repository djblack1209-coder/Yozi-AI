<template>
  <view
    ref="pane"
    class="reading-pane"
    :role="narrow ? 'dialog' : 'region'"
    :aria-modal="narrow || undefined"
    :aria-label="`${material.name} · ${pageLabel}`"
    :style="readerWidth ? { '--reading-width': `${readerWidth}px` } : undefined"
    tabindex="-1"
    @keydown="closeOnEscape"
  >
    <!-- #ifdef H5 -->
    <component
      :is="'div'"
      v-if="!narrow"
      class="reading-resize"
      role="separator"
      aria-label="调整阅读区宽度"
      aria-orientation="vertical"
      :aria-valuemin="340"
      :aria-valuemax="readerLimit"
      :aria-valuenow="readerWidth || 340"
      tabindex="0"
      @pointerdown="startResize"
      @pointermove="resizeReading"
      @pointerup="endResize"
      @pointercancel="endResize"
      @keydown="resizeByKey"
    />
    <!-- #endif -->
    <view class="reading-header">
      <view class="reading-title"
        ><text>{{ material.name }}</text
        ><text>{{ pageLabel }}</text></view
      >
      <BaseButton variant="quiet" icon="x" icon-only label="关闭资料" @tap="$emit('close')" />
    </view>
    <view class="reading-actions">
      <BaseButton variant="quiet" :disabled="page === 0" @tap="goTo(page - 1)">上一页</BaseButton>
      <BaseButton variant="quiet" :disabled="page === material.segments.length - 1" @tap="goTo(page + 1)"
        >下一页</BaseButton
      >
      <BaseButton v-if="resumePage >= 0 && resumePage !== page" variant="quiet" @tap="goTo(resumePage)"
        >继续上次阅读</BaseButton
      >
      <BaseButton v-else-if="resumePage !== page" variant="quiet" @tap="savePosition(page)">记住此处</BaseButton>
    </view>
    <scroll-view class="reading-scroll" scroll-y :scroll-into-view="scrollTarget">
      <text ref="sourceText" class="reading-text" selectable
        ><text
          v-for="part in parts"
          :id="part.start === range.start ? 'reading-anchor' : undefined"
          :key="part.start"
          :data-reading-offset="part.start"
          :class="{ 'reading-highlight': part.marked, 'reading-selection': part.selected }"
          >{{ part.text }}</text
        ></text
      >
      <view class="reading-actions">
        <BaseButton variant="quiet" @tap="locating = !locating">定位原文</BaseButton>
        <BaseButton variant="quiet" @tap="annotate(!annotation?.marked, annotation?.note || '')">{{
          annotation?.marked ? '移除高亮' : '高亮'
        }}</BaseButton>
        <BaseButton variant="quiet" @tap="editNote">{{ annotation?.note ? '打开笔记' : '笔记' }}</BaseButton>
        <BaseButton variant="quiet" @tap="openQuestion">就此段提问</BaseButton>
      </view>
      <view v-if="locating" class="reading-editor">
        <BaseInput v-model="quote" label="粘贴本页原文片段" multiline :maxlength="current.content.length" />
        <BaseButton variant="primary" :disabled="!quote.trim()" @tap="locatePassage">选中片段</BaseButton>
      </view>
      <view v-if="savedNotes.length" class="reading-actions" role="group" aria-label="本页笔记">
        <BaseButton
          v-for="item in savedNotes"
          :key="item.start + ':' + item.end"
          variant="quiet"
          icon="file-text"
          @tap="openSavedNote(item)"
          >{{ current.content.slice(item.start, Math.min(item.end, item.start + 48)) }}</BaseButton
        >
      </view>
      <view v-if="editingNote" class="reading-editor">
        <BaseInput v-model="note" label="阅读笔记" multiline :maxlength="4000" @update:model-value="saveNoteDraft" />
        <BaseButton variant="primary" @tap="saveNote">保存笔记</BaseButton>
      </view>
      <view v-if="reply" id="reading-answer">
        <LearningMessage :content="reply.message" :content-blocks="reply.contentBlocks" generated />
      </view>
      <text v-if="status" role="status">{{ status }}</text>
    </scroll-view>
    <view v-if="asking" class="reading-question-dock">
      <view
        class="reading-question-handle"
        @touchstart="startQuestionSwipe"
        @touchmove="moveQuestionSwipe"
        @touchend="endQuestionSwipe"
        @touchcancel="cancelQuestionSwipe"
      >
        <BaseButton
          variant="quiet"
          :aria-expanded="!questionCollapsed"
          aria-controls="reading-question-editor"
          @tap="setQuestionCollapsed(!questionCollapsed)"
          >{{ questionCollapsed ? '展开提问' : '收起提问' }}</BaseButton
        >
      </view>
      <view
        id="reading-question-editor"
        class="reading-question-tray"
        :class="{ 'is-collapsed': questionCollapsed, 'is-dragging': questionDrag > 0 }"
        :style="{ '--question-drag': `${questionDrag}px` }"
        :inert="questionCollapsed || undefined"
        :aria-hidden="questionCollapsed || undefined"
        aria-label="片段答疑"
      >
        <view class="reading-question-tray__contents">
          <view class="reading-editor">
            <text class="reading-question-source" selectable>{{ selectedText }}</text>
            <BaseInput ref="questionInput" v-model="question" label="关于这段的问题" multiline :maxlength="1000" />
            <BaseCheckbox :model-value="learning.sharingAllowed" @update:model-value="setSharing"
              >同意将所选片段和本次问题发给当前模型</BaseCheckbox
            >
            <BaseButton
              variant="primary"
              :disabled="pending || !question.trim() || !learning.sharingAllowed"
              @tap="ask"
            >
              {{ pending ? '正在回答' : '发送所选片段和问题' }}
            </BaseButton>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseInput from '@/components/base/base-input/base-input.vue';
import BaseCheckbox from '@/components/base/base-checkbox/base-checkbox.vue';
import LearningMessage from './learning-message.vue';
import { bindLearningDialog } from '@/services/learning/keyboard-controls.js';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { publicError } from '@/i18n/index.js';

const props = defineProps({ material: { type: Object, required: true }, anchor: { type: Object, required: true } });
const emit = defineEmits(['close']);
const learning = useConversationLearningStore();
const noteDrafts = new Map();
const pane = ref(null);
const sourceText = ref(null);
const questionInput = ref(null);
const narrow = ref((uni.getWindowInfo?.().windowWidth || 390) <= 760);
const readerWidth = ref(0);
const readerLimit = ref(680);
// #ifdef H5
let resize = null;
function setReaderWidth(width) {
  readerWidth.value = Math.max(340, Math.min(readerLimit.value, Math.round(width)));
}
function startResize(event) {
  if (event.button !== 0) return;
  resize = { pointer: event.pointerId, x: event.clientX, width: readerWidth.value };
  event.currentTarget.setPointerCapture(event.pointerId);
}
function resizeReading(event) {
  if (resize?.pointer === event.pointerId) setReaderWidth(resize.width + resize.x - event.clientX);
}
function endResize() {
  resize = null;
}
function resizeByKey(event) {
  const change = { ArrowLeft: 32, ArrowRight: -32 }[event.key];
  if (!change) return;
  event.preventDefault();
  setReaderWidth(readerWidth.value + change);
}
// #endif
const page = ref(props.material.segments.findIndex((segment) => segment.id === props.anchor.segmentId));
const range = ref({ start: props.anchor.start, end: props.anchor.end });
const scrollTarget = ref('');
const locating = ref(false);
const quote = ref('');
const editingNote = ref(false);
const note = ref('');
const asking = ref(false);
const question = ref('');
const questionCollapsed = ref(false);
const questionDrag = ref(0);
let questionStart;
const touchY = (touch) => touch?.clientY ?? touch?.pageY;
function setQuestionCollapsed(collapsed) {
  questionCollapsed.value = collapsed;
  // #ifdef H5
  if (collapsed) (questionInput.value?.$el || questionInput.value)?.querySelector('textarea')?.blur();
  // #endif
}
function startQuestionSwipe(event) {
  questionStart = touchY(event.touches?.[0]);
}
function moveQuestionSwipe(event) {
  if (questionCollapsed.value || questionStart === undefined) return;
  questionDrag.value = Math.min(54, Math.max(0, (touchY(event.touches?.[0]) ?? questionStart) - questionStart));
}
function cancelQuestionSwipe() {
  questionStart = undefined;
  questionDrag.value = 0;
}
function endQuestionSwipe(event) {
  if (questionStart === undefined) return;
  const distance = (touchY(event.changedTouches?.[0]) ?? questionStart) - questionStart;
  cancelQuestionSwipe();
  if (Math.abs(distance) < 24) return;
  event.preventDefault?.();
  setQuestionCollapsed(distance > 0);
}
const pending = ref(false);
const reply = ref(null);
const status = ref('');
function closeOnEscape(event) {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  emit('close');
}
const version = (segment) => segment.extractionEventId ?? null;
const current = computed(() => props.material.segments[page.value]);
const pageLabel = computed(() => (current.value.page ? `第 ${current.value.page} 页` : `第 ${page.value + 1} 段`));
const selectedText = computed(() => current.value.content.slice(range.value.start, range.value.end));
const location = (segment) => ({ materialId: props.material.id, segmentId: segment.id, version: version(segment) });
const selection = computed(() => ({ ...location(current.value), ...range.value }));
const noteKey = computed(() => `reader:${JSON.stringify(selection.value)}`);
const resumePage = computed(() => {
  const position = props.material.reading?.position;
  return props.material.segments.findIndex(
    (item) => item.id === position?.segmentId && version(item) === position.version
  );
});
const annotations = computed(() =>
  (props.material.reading?.annotations || []).filter(
    (item) => item.segmentId === current.value.id && item.version === version(current.value)
  )
);
const annotation = computed(() =>
  annotations.value.find((item) => item.start === range.value.start && item.end === range.value.end)
);
const savedNotes = computed(() => annotations.value.filter((item) => item.note && item !== annotation.value));
const parts = computed(() => {
  const marks = annotations.value.filter((item) => item.marked);
  const selected = range.value;
  const content = current.value.content;
  // uni-text renders a saved line break as an element, so measure ranges within each line.
  const lineBreaks = [...content.matchAll(/\n/g)].flatMap(({ index }) => [index, index + 1]);
  const bounds = [
    ...new Set([0, content.length, ...lineBreaks, ...[...marks, selected].flatMap((item) => [item.start, item.end])])
  ].sort((a, b) => a - b);
  return bounds.slice(0, -1).map((start, i) => ({
    start,
    text: content.slice(start, bounds[i + 1]),
    marked: marks.some((item) => start >= item.start && start < item.end),
    selected: start >= selected.start && start < selected.end
  }));
});
function commit(data) {
  try {
    learning.commit('material.reading', data);
    status.value = '';
    return true;
  } catch (error) {
    status.value = publicError(error);
    return false;
  }
}
function savePosition(index) {
  if (resumePage.value !== index && commit({ action: 'position', ...location(props.material.segments[index]) }))
    status.value = '阅读位置已保存';
}
function changeRange(start, end) {
  range.value = { start, end };
  editingNote.value = false;
  asking.value = false;
  question.value = '';
  reply.value = null;
}
async function scrollToPassage() {
  scrollTarget.value = '';
  await nextTick();
  scrollTarget.value = 'reading-anchor';
}
function goTo(index) {
  page.value = index;
  locating.value = false;
  quote.value = '';
  const firstBreak = current.value.content.indexOf('\n');
  changeRange(0, firstBreak > 0 ? firstBreak : current.value.content.length);
  savePosition(index);
  void scrollToPassage();
}
function locatePassage() {
  const text = quote.value.trim();
  const start = current.value.content.indexOf(text);
  if (start < 0) {
    status.value = '本页没有这段原文';
    return;
  }
  changeRange(start, start + text.length);
  locating.value = false;
  quote.value = '';
  status.value = '';
  void scrollToPassage();
}
function annotate(marked, savedNote) {
  return commit({ action: 'annotate', ...selection.value, marked, note: savedNote });
}
function editNote() {
  note.value = noteDrafts.get(noteKey.value) ?? annotation.value?.note ?? '';
  editingNote.value = true;
}
function openSavedNote(item) {
  changeRange(item.start, item.end);
  editNote();
  void scrollToPassage();
}
function saveNoteDraft(value) {
  noteDrafts.set(noteKey.value, value);
}
function saveNote() {
  if (!annotate(!!annotation.value?.marked, note.value)) return;
  noteDrafts.delete(noteKey.value);
  editingNote.value = false;
  status.value = '笔记已保存';
}
async function openQuestion() {
  asking.value = true;
  setQuestionCollapsed(false);
  await nextTick();
  // #ifdef H5
  (questionInput.value?.$el || questionInput.value)?.querySelector?.('textarea')?.focus?.();
  // #endif
}
let closed = false;
async function setSharing(value) {
  try {
    const result = await learning.setSharingAllowed(value);
    if (result?.success === false) status.value = publicError(result);
  } catch (error) {
    status.value = publicError(error);
  }
}
async function ask() {
  const key = noteKey.value;
  pending.value = true;
  status.value = '';
  try {
    const result = await learning.askAboutReadingPassage(selection.value, question.value);
    if (closed || key !== noteKey.value) return;
    if (result.success) {
      reply.value = result.data;
      await nextTick();
      if (!closed && key === noteKey.value && !questionCollapsed.value) scrollTarget.value = 'reading-answer';
    } else status.value = publicError(result);
  } catch (error) {
    if (!closed && key === noteKey.value) status.value = publicError(error);
  } finally {
    pending.value = false;
  }
}
function captureSelection() {
  const element = sourceText.value?.$el || sourceText.value;
  const selection = window.getSelection();
  if (!element || !selection?.rangeCount || selection.isCollapsed) return;
  const domRange = selection.getRangeAt(0);
  if (!element.contains(domRange.commonAncestorContainer)) return;
  const offset = (node, index) => {
    const part = (node.nodeType === window.Node.TEXT_NODE ? node.parentElement : node).closest('[data-reading-offset]');
    if (!part) return null;
    const prefix = document.createRange();
    prefix.setStart(part, 0);
    prefix.setEnd(node, index);
    return Number(part.dataset.readingOffset) + prefix.toString().length;
  };
  const start = offset(domRange.startContainer, domRange.startOffset);
  const end = offset(domRange.endContainer, domRange.endOffset);
  if (start !== null && end !== null && end > start && (start !== range.value.start || end !== range.value.end))
    changeRange(start, end);
}
let releaseFocus = () => undefined;
onMounted(() => {
  void scrollToPassage();
  // #ifdef H5
  const element = pane.value?.$el || pane.value;
  if (narrow.value) releaseFocus = bindLearningDialog(element, { onEscape: () => emit('close') });
  else {
    readerLimit.value = Math.max(340, Math.min(680, Math.floor(element.parentElement.clientWidth * 0.72)));
    setReaderWidth(element.getBoundingClientRect().width);
    const previous = document.activeElement;
    element?.focus();
    releaseFocus = () => {
      if (previous?.isConnected) previous.focus();
    };
  }
  document.addEventListener('selectionchange', captureSelection);
  // #endif
});
onBeforeUnmount(() => {
  closed = true;
  releaseFocus();
  // #ifdef H5
  document.removeEventListener('selectionchange', captureSelection);
  // #endif
});
</script>

<style scoped>
.reading-pane {
  position: absolute;
  z-index: 36;
  inset: 0 0 0 auto;
  width: var(--reading-width, clamp(340px, 44%, 520px));
  max-width: 72%;
  display: flex;
  flex-direction: column;
  padding: 18px;
  gap: 8px;
  background: var(--paper);
  border-left: 1px solid var(--line);
  overflow: hidden;
}
.reading-resize {
  position: absolute;
  inset: 0 auto 0 0;
  width: 12px;
  cursor: ew-resize;
  touch-action: none;
}
.reading-resize::after {
  content: '';
  position: absolute;
  inset: calc(50% - 18px) auto auto 4px;
  width: 3px;
  height: 36px;
  border-radius: var(--r-pill);
  background: var(--line);
}
.reading-resize:hover::after,
.reading-resize:focus-visible::after {
  background: var(--blue);
}
.reading-header,
.reading-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}
.reading-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow-wrap: anywhere;
}
.reading-scroll {
  flex: 1;
  height: 0;
  min-width: 0;
}
.reading-text,
.reading-question-source {
  display: block;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.reading-highlight {
  background: var(--violet-soft);
}
.reading-selection {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.reading-editor {
  display: grid;
  gap: 8px;
  margin-top: 8px;
}
.reading-question-dock {
  border-top: 1px solid var(--line);
}
.reading-question-handle {
  display: flex;
  justify-content: center;
  touch-action: none;
}
.reading-question-tray {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows 300ms cubic-bezier(0.22, 0.72, 0.26, 1);
}
.reading-question-tray.is-collapsed {
  grid-template-rows: 0fr;
}
.reading-question-tray__contents {
  min-height: 0;
  max-height: 42dvh;
  overflow: auto;
  opacity: 1;
  transform: translateY(var(--question-drag));
  transition:
    transform 300ms cubic-bezier(0.22, 0.72, 0.26, 1),
    opacity 180ms ease-out;
}
.reading-question-tray.is-dragging .reading-question-tray__contents {
  transition: none;
}
.reading-question-tray.is-collapsed .reading-question-tray__contents {
  visibility: hidden;
  opacity: 0;
  transform: translateY(24px);
  transition:
    transform 300ms cubic-bezier(0.22, 0.72, 0.26, 1),
    opacity 180ms ease-out,
    visibility 0s 300ms;
}
.reading-question-source {
  max-height: 4.5em;
  overflow: auto;
}
@media (prefers-reduced-motion: reduce) {
  .reading-question-tray,
  .reading-question-tray__contents,
  .reading-question-tray.is-collapsed .reading-question-tray__contents {
    transition: none;
  }
}
@media (max-width: 760px) {
  .reading-pane {
    position: fixed;
    inset: 0;
    width: 100%;
    max-width: 100%;
    height: 100dvh;
    padding: max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom));
    border: 0;
  }
}
</style>
