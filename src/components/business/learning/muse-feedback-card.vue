<template>
  <view
    class="muse-feedback"
    :class="{ 'feedback-essay': isEssay, 'feedback-awaiting-view': isEssay && !essayStarted }"
    data-test="coach-feedback"
  >
    <view ref="feedbackHead" class="feedback-head"
      ><text class="feedback-title">{{
        feedback.sourceStatus === 'pending_verification' ? '资料依据待核对' : title
      }}</text
      ><text class="feedback-badge">{{ feedback.lines.length }} 句反馈</text></view
    >
    <view
      v-for="(line, index) in feedback.lines"
      :key="`${feedback.id || feedback.target}:${index}`"
      class="feedback-line"
      :style="isEssay ? { '--essay-line-delay': `${Math.min(index, 6) * 70}ms` } : undefined"
    >
      <text class="feedback-original feedback-ink-source muse-ink-reveal" selectable
        ><text>{{ comparisons[index].prefix }}</text
        ><text class="muse-ink-strike">{{ comparisons[index].removed }}</text
        ><text>{{ comparisons[index].suffix }}</text></text
      >
      <view v-if="line.rewrite !== line.original" class="feedback-rewrite" role="group" aria-label="建议改写">
        <BaseIcon name="arrow-right" :size="16" />
        <text class="feedback-ink-revision muse-ink-reveal" selectable
          ><text>{{ comparisons[index].prefix }}</text
          ><text class="muse-ink-mark">{{ comparisons[index].inserted }}</text
          ><text>{{ comparisons[index].suffix }}</text></text
        >
      </view>
      <view class="feedback-line-head">
        <BaseButton
          variant="quiet"
          :label="expanded[index] ? '收起解析' : '展开解析'"
          :aria-expanded="Boolean(expanded[index])"
          @tap="expanded[index] = !expanded[index]"
          >{{ expanded[index] ? '收起解析' : '展开解析' }}</BaseButton
        >
      </view>
      <MuseRichText v-if="expanded[index]" :content="line.advice" class="feedback-explanation" />
    </view>
    <view v-if="feedback.dimensions.length" class="feedback-dimensions" role="table" aria-label="写作维度"
      ><view v-for="dimension in feedback.dimensions" :key="dimension.name" class="feedback-dimension" role="row"
        ><text role="rowheader"
          >{{ dimension.name
          }}<text v-if="dimension.score !== undefined">
            · {{ dimension.score === null ? '待核对' : ['需重练', '可改进', '达成本次要求'][dimension.score] }}</text
          ></text
        ><MuseRichText :content="dimension.comment" role="cell" /></view
    ></view>
    <view
      v-if="writingObservation"
      class="feedback-observations"
      aria-label="全文观察"
      data-test="writing-observations"
    >
      <text class="feedback-title">全文观察 · AI 评估</text>
      <text class="feedback-observation-note">用于学习辅助，判断待核对</text>
      <text v-if="writingObservation.status === 'null'">这次全文观察未能完成，原答和逐句反馈已保留。</text>
      <template v-else>
        <view v-for="observation in writingObservation.observations" :key="observation.key" class="feedback-line">
          <text>{{ { language: '语言', cohesion: '衔接' }[observation.key] || '观察' }}</text>
          <text v-for="span in observation.evidenceSpans" :key="span.start" class="feedback-original" selectable>{{
            span.quote
          }}</text>
          <text>{{ observation.note }}</text>
        </view>
        <text v-if="!writingObservation.observations.length">本次未得到有依据的全文观察，原答已保留。</text>
      </template>
      <text
        v-if="
          writingObservation.blockReasons.some((reason) => ['task_data_missing', 'task_data_conflict'].includes(reason))
        "
        class="feedback-observation-note"
        >题目图画或图表事实待核对，本次不判断内容与数据。</text
      >
      <text
        v-else-if="writingObservation.blockReasons.includes('task_points_unstructured')"
        class="feedback-observation-note"
        >题目要点尚未逐项核对，本次只看语言与衔接。</text
      >
    </view>
    <view v-if="feedback.weaknesses?.length" class="feedback-tags"
      ><text v-for="item in feedback.weaknesses" :key="item" class="feedback-badge">{{ item }}</text></view
    >
    <view v-for="phrase in feedback.phrases" :key="phrase" class="feedback-phrase"
      ><text selectable>{{ phrase }}</text
      ><BaseButton
        v-if="feedback.id && adoptable"
        variant="quiet"
        :disabled="disabled || adopted.includes(phrase)"
        @tap="$emit('adopt', phrase)"
        >{{
          materialTrack
            ? adopted.includes(phrase)
              ? '已加入复习'
              : '加入复习'
            : adopted.includes(phrase)
              ? '已进句式库'
              : '采用到句式库'
        }}</BaseButton
      ></view
    >
    <template
      v-if="
        DEV_TEST &&
        (adoptable || canReassessEssay) &&
        feedback.id &&
        (feedback.target === 'essay' ||
          feedback.target === 'analysis' ||
          feedback.target?.startsWith('card-') ||
          feedback.target?.startsWith('paragraph-'))
      "
    >
      <BaseButton
        variant="quiet"
        :disabled="disabled || learning.busy || !learning.sharingAllowed || !learning.modelId"
        @tap="reassess"
        >重新点评（保留原评估）</BaseButton
      >
      <BaseButton v-if="previousFeedbacks.length" variant="quiet" @tap="historyOpen = !historyOpen">{{
        historyOpen ? '收起原评估' : '查看原评估'
      }}</BaseButton>
      <view v-if="historyOpen" class="feedback-observations">
        <text>原评估 · 已替代，不计入当前薄弱点</text>
        <view v-for="previous in previousFeedbacks" :key="previous.id" class="feedback-line">
          <view v-for="(line, index) in previous.lines" :key="index">
            <text class="feedback-original" selectable>{{ line.original }}</text>
            <MuseRichText :content="line.advice" />
            <text selectable>{{ line.rewrite }}</text>
          </view>
        </view>
      </view>
      <text v-if="reassessmentError" role="alert">{{ reassessmentError }}</text>
    </template>
  </view>
</template>
<script setup>
import { computed, getCurrentInstance, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { DEV_TEST } from '@/config/build-channel.js';
import { publicError } from '@/i18n/index.js';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { dayKey } from '@/services/learning/learning-domain.js';
import { coachLearningDay } from '../../../../laf-backend/functions/_shared/learning-writing-coach.js';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseIcon from '@/components/base/base-icon/base-icon.vue';
import MuseRichText from './muse-rich-text.vue';
const props = defineProps({
  feedback: { type: Object, required: true },
  writingObservation: { type: Object, default: null },
  title: { type: String, default: 'AI 评估' },
  adopted: { type: Array, default: () => [] },
  adoptable: { type: Boolean, default: true },
  materialTrack: Boolean,
  disabled: Boolean
});
defineEmits(['adopt']);
const expanded = ref({});
const isEssay = computed(() => props.feedback.target === 'essay');
const feedbackHead = ref(null);
const essayStarted = ref(false);
const instance = getCurrentInstance();
let observer;

function startEssay() {
  essayStarted.value = true;
  observer?.disconnect();
  observer = undefined;
}

onMounted(() => {
  if (!isEssay.value) return;
  // #ifdef H5
  const element = feedbackHead.value?.$el || feedbackHead.value;
  if (typeof IntersectionObserver !== 'undefined' && element) {
    observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) startEssay();
    });
    observer.observe(element);
    return;
  }
  // #endif
  // #ifndef H5
  if (import.meta.env.MODE !== 'test' && typeof uni.createIntersectionObserver === 'function') {
    observer = uni.createIntersectionObserver(instance.proxy, { thresholds: [0], initialRatio: 0 });
    observer.relativeToViewport().observe('.feedback-head', (result) => {
      if (result.intersectionRatio > 0) startEssay();
    });
    return;
  }
  // #endif
  startEssay();
});
onBeforeUnmount(() => observer?.disconnect());

const words = (value) => value?.match(/[\p{L}\p{M}\p{N}]+|\s+|./gu) ?? [];
const comparisons = computed(() =>
  props.feedback.lines.map(({ original, rewrite }) => {
    const before = words(original);
    const after = words(rewrite);
    const limit = Math.min(before.length, after.length);
    let start = 0;
    while (start < limit && before[start] === after[start]) start++;
    let end = 0;
    while (end < limit - start && before[before.length - end - 1] === after[after.length - end - 1]) end++;
    return {
      prefix: before.slice(0, start).join(''),
      removed: before.slice(start, before.length - end).join(''),
      inserted: after.slice(start, after.length - end).join(''),
      suffix: before.slice(before.length - end).join('')
    };
  })
);
const learning = DEV_TEST ? useConversationLearningStore() : null;
const historyOpen = ref(false),
  reassessmentError = ref('');
const feedbackDay = computed(() =>
  learning?.active?.coach?.days.find(
    (day) =>
      (props.feedback.target === 'essay' ? day.essay : day.feedback[props.feedback.target])?.id === props.feedback.id
  )
);
const canReassessEssay = computed(
  () =>
    DEV_TEST &&
    props.feedback.target === 'essay' &&
    feedbackDay.value?.day ===
      coachLearningDay(learning.active?.coach, dayKey(learning.calendarTime, learning.state.timezone)) &&
    !feedbackDay.value.completed
);
const previousFeedbacks = computed(() => feedbackDay.value?.feedbackHistory?.[props.feedback.target] || []);
async function reassess() {
  reassessmentError.value = '';
  const target = props.feedback.target;
  try {
    learning.coachSave('reassess', { target, feedbackId: props.feedback.id });
    await learning.requestCoach(target === 'essay' ? 'essay' : 'feedback', target);
  } catch (error) {
    reassessmentError.value = publicError(error);
  }
}
watch(
  () => props.feedback.id || props.feedback.target,
  () => {
    expanded.value = {};
    historyOpen.value = false;
    reassessmentError.value = '';
  }
);
</script>
<style scoped>
.muse-feedback {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--control-line);
  border-radius: 16px;
}
.feedback-head,
.feedback-line-head,
.feedback-rewrite,
.feedback-phrase {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.feedback-title {
  font-size: 18px;
  font-weight: 600;
}
.feedback-badge {
  position: relative;
  display: inline-flex;
  align-self: flex-start;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--muse-selected);
  color: var(--ink-3);
  font-size: 12px;
  line-height: 18px;
}
.feedback-head .feedback-badge::after {
  position: absolute;
  inset: 0;
  border: 1px solid var(--muse-rich-warning, var(--apricot));
  border-radius: 48% 44% 48% 41%;
  transform: rotate(-3deg);
  animation: muse-ink-sweep 260ms cubic-bezier(0.16, 1, 0.3, 1) 230ms backwards;
  content: '';
  pointer-events: none;
}
.feedback-line {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid var(--line);
  padding-top: 8px;
}
.feedback-line-head {
  font-size: 13px;
  color: var(--ink-3);
}
.feedback-line-head :deep(button) {
  font-size: 13px;
  padding-inline: 8px;
}
.feedback-original {
  color: var(--ink-2);
  white-space: pre-wrap;
}
.feedback-ink-source {
  --muse-ink-duration: 440ms;
  --muse-ink-stroke-delay: 310ms;
}
.feedback-rewrite {
  --muse-ink-delay: 470ms;
  --muse-ink-duration: 520ms;
  --muse-ink-stroke-delay: 750ms;
  justify-content: flex-start;
  align-items: flex-start;
  padding: 9px 12px;
  border-inline-start: 2px solid var(--line-strong);
  color: var(--ink);
}
.feedback-ink-source,
.feedback-ink-revision {
  min-width: 0;
  font-size: 16px;
  line-height: 1.65;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.feedback-explanation {
  padding: 12px;
  background: var(--muse-rich-surface);
  border-radius: 12px;
  color: var(--ink-2);
}
.feedback-dimensions {
  display: flex;
  flex-direction: column;
  animation: muse-ink-section 260ms cubic-bezier(0.16, 1, 0.3, 1) 840ms backwards;
}
@keyframes muse-ink-section {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}
@media (prefers-reduced-motion: no-preference) {
  .feedback-essay .feedback-ink-source {
    --muse-ink-delay: var(--essay-line-delay);
    --muse-ink-duration: 680ms;
  }
  .feedback-essay .feedback-head .feedback-badge::after {
    animation-delay: 1500ms;
  }
  .feedback-essay .muse-ink-strike {
    background-image:
      linear-gradient(var(--muse-rich-danger, var(--coral)), var(--muse-rich-danger, var(--coral))),
      linear-gradient(var(--apricot-soft), var(--apricot-soft));
    background-position:
      left 54%,
      left 84%;
    background-size:
      100% 1.5px,
      100% 0.54em;
    animation: essay-original-ink 3300ms linear var(--essay-line-delay) backwards;
  }
  .feedback-essay .feedback-rewrite {
    --muse-ink-delay: calc(3300ms + var(--essay-line-delay));
    --muse-ink-duration: 580ms;
    --muse-ink-stroke-delay: calc(3540ms + var(--essay-line-delay));
  }
  .feedback-essay .feedback-dimensions {
    animation-delay: 4500ms;
  }
  .feedback-awaiting-view .feedback-head .feedback-badge::after,
  .feedback-awaiting-view .muse-ink-reveal,
  .feedback-awaiting-view .muse-ink-strike,
  .feedback-awaiting-view .muse-ink-mark,
  .feedback-awaiting-view .feedback-dimensions {
    animation-play-state: paused;
  }
}
@keyframes essay-original-ink {
  0%,
  22.727% {
    background-size:
      0% 1.5px,
      0% 0.54em;
  }
  31%,
  90.909% {
    background-size:
      0% 1.5px,
      100% 0.54em;
  }
  100% {
    background-size:
      100% 1.5px,
      100% 0.54em;
  }
}
@media (prefers-reduced-motion: reduce) {
  .feedback-dimensions,
  .feedback-head .feedback-badge::after {
    animation: none;
  }
}
.feedback-observations {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
  overflow-wrap: anywhere;
}
.feedback-observation-note {
  color: var(--ink-3);
  font-size: 13px;
}
.feedback-dimension {
  display: grid;
  grid-template-columns: 70px minmax(0, 1fr);
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--line);
}
.feedback-dimension > text {
  color: var(--ink-3);
  font-size: 13px;
}
.feedback-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.feedback-phrase {
  flex-wrap: wrap;
  padding-top: 8px;
  border-top: 1px solid var(--line);
}
.feedback-phrase > text {
  flex: 1 1 200px;
  min-width: 0;
}
</style>
