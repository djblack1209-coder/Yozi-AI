<template>
  <view class="muse-practice" data-test="coach-practice-sheet">
    <view class="practice-head"
      ><text class="practice-title">{{ title }}</text
      ><text class="practice-count">{{ answers.length }} / {{ cards.length }}</text></view
    >
    <view
      class="practice-progress"
      role="progressbar"
      aria-label="已提交题目"
      :aria-valuenow="answers.length"
      :aria-valuemax="cards.length"
      :aria-valuemin="0"
    >
      <view
        class="practice-progress-fill"
        :style="{ width: `${cards.length ? Math.min(100, (answers.length / cards.length) * 100) : 0}%` }"
      />
    </view>
    <view class="practice-sheet" role="group" :aria-label="title"
      ><BaseButton
        v-for="(card, index) in cards"
        :key="card.id"
        variant="quiet"
        :label="`第 ${index + 1} 题${answers.some((a) => a.cardId === card.id) ? '，已提交' : '，未提交'}`"
        :aria-pressed="selected?.id === card.id"
        :disabled="card.id !== currentId && !answers.some((a) => a.cardId === card.id)"
        :class="{ 'is-picked': answers.some((a) => a.cardId === card.id), 'is-current': selected?.id === card.id }"
        @tap="viewedId = card.id"
        ><text>{{ String(index + 1).padStart(2, '0') }}</text
        ><BaseIcon v-if="answers.some((a) => a.cardId === card.id)" name="check" :size="14" /></BaseButton
    ></view>
    <template v-if="selected">
      <view class="practice-question-head"
        ><text>第 {{ String(cards.indexOf(selected) + 1).padStart(2, '0') }} 题</text
        ><text class="practice-count">{{ selectedAnswer ? '已提交' : '待作答' }}</text></view
      >
      <text class="practice-question-title">{{ selected.title }}</text
      ><MuseRichText :content="selected.prompt" /><MuseRichText
        v-if="selected.example && (selectedAnswer || !['trace', 'apply'].includes(selected.kind))"
        :content="selected.example"
        class="practice-example"
      />
      <MuseCoachCitation :source="selected.source" :materials="materials" @open="$emit('open-source', $event)" />
      <template v-if="selected.options?.length">
        <BaseOptions
          v-model="choice"
          label="选择答案"
          :options="
            selected.options.map((label) => ({
              value: label,
              label,
              state: selectedAnswer?.answer === label ? 'pending' : undefined
            }))
          "
          :disabled="disabled || Boolean(selectedAnswer) || selected.id !== currentId"
        />
        <text v-if="selectedAnswer" class="practice-count" role="status">已提交，等待 AI 评估</text>
        <BaseButton
          v-else-if="selected.id === currentId"
          variant="primary"
          :disabled="disabled || !selected.options.includes(choice)"
          @tap="submitChoice"
          >提交答案</BaseButton
        >
      </template>
      <text v-else-if="selectedAnswer" class="practice-answer" selectable>{{ selectedAnswer.answer }}</text>
      <MuseWritingCard
        v-else-if="selected.id === currentId"
        :shared-input="sharedInput"
        :model-value="modelValue"
        :disabled="disabled"
        @update:model-value="$emit('update:modelValue', $event)"
        @submit="$emit('submit', selected)"
      />
      <BaseButton v-else-if="currentId" variant="quiet" @tap="viewedId = currentId">继续当前题</BaseButton>
    </template>
  </view>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseOptions from '@/components/base/base-options/base-options.vue';
import BaseIcon from '@/components/base/base-icon/base-icon.vue';
import MuseRichText from '@/components/business/learning/muse-rich-text.vue';
import MuseWritingCard from '@/components/business/learning/muse-writing-card.vue';
import MuseCoachCitation from './muse-coach-citation.vue';
const props = defineProps({
  title: { type: String, required: true },
  cards: { type: Array, required: true },
  answers: { type: Array, default: () => [] },
  materials: { type: Array, default: () => [] },
  currentId: { type: String, default: '' },
  modelValue: { type: String, default: '' },
  sharedInput: Boolean,
  disabled: Boolean
});
const emit = defineEmits(['update:modelValue', 'submit', 'open-source']);
const choice = ref('');
const viewedId = ref(props.currentId);
watch(
  () => props.currentId,
  (value) => {
    viewedId.value = value || props.cards.at(-1)?.id || '';
  }
);
const selected = computed(
  () =>
    props.cards.find((card) => card.id === viewedId.value) ||
    props.cards.find((card) => card.id === props.currentId) ||
    props.cards[0]
);
const selectedAnswer = computed(() => props.answers.find((answer) => answer.cardId === selected.value?.id));
watch(
  [() => selected.value?.id, () => selectedAnswer.value?.answer],
  () => {
    choice.value = selectedAnswer.value?.answer || '';
  },
  { immediate: true }
);
function submitChoice() {
  if (
    props.disabled ||
    selectedAnswer.value ||
    selected.value?.id !== props.currentId ||
    !selected.value?.options?.includes(choice.value)
  )
    return;
  emit('update:modelValue', choice.value);
  emit('submit', selected.value);
}
</script>
<style scoped>
.muse-practice {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--control-line);
  border-radius: 16px;
}
.practice-progress {
  height: 3px;
  border-radius: 3px;
  background: var(--line);
  overflow: hidden;
}
.practice-progress-fill {
  height: 100%;
  background: var(--violet);
}
.practice-head,
.practice-question-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.practice-title {
  font-size: 18px;
  font-weight: 600;
  line-height: 26px;
}
.practice-count {
  font-size: 12px;
  color: var(--ink-3);
}
.practice-sheet {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
}
.practice-sheet :deep(.base-button) {
  width: 44px;
  min-width: 44px;
  height: 48px;
  padding: 5px 2px;
  border-radius: 9px;
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--line-strong);
  color: var(--ink-3);
}
.practice-sheet :deep(.base-button__content) {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 10px;
  line-height: 14px;
}
.practice-sheet :deep(.is-picked),
.practice-sheet :deep(.is-current) {
  background: var(--violet-soft);
  box-shadow: inset 0 0 0 1.5px var(--violet);
  color: var(--ink);
}
.practice-question-head {
  font-size: 13px;
}
.practice-question-title {
  font-size: 16px;
  font-weight: 600;
}
.practice-example {
  color: var(--ink-2);
  padding: 12px;
  background: var(--muse-rich-surface);
  border-radius: 12px;
}
.practice-answer {
  display: block;
  white-space: pre-wrap;
  padding: 12px;
  border: 1px solid var(--violet);
  border-radius: 12px;
  background: var(--violet-soft);
}
</style>
