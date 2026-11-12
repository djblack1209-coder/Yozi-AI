<template>
  <view class="study-beads">
    <BaseButton
      class="study-beads-trigger"
      variant="quiet"
      block
      align="start"
      :label="t('muse.beads.title')"
      aria-haspopup="dialog"
      :aria-expanded="open"
      @tap="show"
    >
      <view class="bead-card-copy">
        <text class="bead-title">{{ t('muse.beads.title') }}</text>
        <text class="bead-count">{{
          progress
            ? t('muse.beads.progress', { earned: progress.earned, total: progress.total })
            : t('muse.beads.choose')
        }}</text>
      </view>
      <BaseIcon name="chevron-right" size="16px" />
    </BaseButton>
    <CustomModal
      :visible="open"
      :title="t('muse.beads.title')"
      :is-dark="dark"
      :show-actions="false"
      close-button
      mask-closable
      @cancel="open = false"
    >
      <view v-if="goals.length > 1" class="bead-goals" role="group" :aria-label="t('muse.beads.goal')">
        <BaseButton
          v-for="item in goals"
          :key="item.id"
          variant="quiet"
          :selected="item.id === goalId"
          :aria-pressed="item.id === goalId"
          @tap="selectGoal(item.id)"
          >{{ item.goal }}</BaseButton
        >
      </view>
      <template v-if="goal">
        <view v-if="!progress" class="bead-choices" role="group" :aria-label="t('muse.beads.choose')">
          <BaseButton
            v-for="art in BEAD_ARTWORKS"
            :key="art.id"
            class="bead-choice"
            variant="quiet"
            :selected="choice === art.id"
            :aria-pressed="choice === art.id"
            @tap="choice = art.id"
          >
            <view class="bead-mini" aria-hidden="true"
              ><view
                v-for="(point, index) in beadArtworkPoints(art.id, 49)"
                :key="index"
                class="bead-piece earned"
                :style="pointStyle(point)"
            /></view>
            <text>{{ t('muse.beads.' + art.id) }}</text>
          </BaseButton>
        </view>
        <view v-else class="bead-art-card" :class="{ complete: progress.complete }">
          <text class="bead-art-name">{{ t('muse.beads.' + progress.artwork) }}</text>
          <view
            class="bead-scene"
            role="img"
            :aria-label="t('muse.beads.progress', { earned: progress.earned, total: progress.total })"
          >
            <view class="bead-artwork" :class="{ 'is-opening': open && !reduced }" aria-hidden="true">
              <image class="bead-outline" :src="outline" mode="aspectFit" alt="" />
              <view
                v-for="(point, index) in points"
                :key="index"
                class="bead-piece"
                :class="{
                  earned: progress.slots[index].earnedBy,
                  repaired: progress.slots[index].repaired,
                  missing: !progress.slots[index].earnedBy && progress.slots[index].day < today
                }"
                :style="pointStyle(point)"
              />
            </view>
          </view>
          <text class="bead-progress" role="status">{{
            t('muse.beads.progress', { earned: progress.earned, total: progress.total })
          }}</text>
          <text class="bead-count">{{ t('muse.beads.until', { date: progress.deadline }) }}</text>
          <text v-if="progress.complete" class="bead-status">{{ t('muse.beads.complete') }}</text>
          <text v-else-if="progress.ended" class="bead-status">{{ t('muse.beads.ended') }}</text>
          <text v-else-if="progress.missing" class="bead-status">{{
            t('muse.beads.missing', { count: progress.missing })
          }}</text>
          <text v-if="progress.repaired" class="bead-count">{{
            t('muse.beads.repaired', { count: progress.repaired })
          }}</text>
        </view>
        <view v-if="!progress" class="bead-setup">
          <BaseInput v-model="deadline" :label="t('muse.beads.deadline')" placeholder="YYYY-MM-DD" :maxlength="10" />
          <text class="bead-help">{{ t('muse.beads.fixed') }}</text>
          <BaseButton variant="primary" block @tap="save">{{ t('muse.beads.start') }}</BaseButton>
        </view>
        <text class="bead-help">{{ t('muse.beads.rule') }}</text>
        <text v-if="error" role="alert" class="bead-error">{{ error }}</text>
      </template>
      <text v-else class="bead-help">{{ t('muse.beads.noGoal') }}</text>
    </CustomModal>
  </view>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseIcon from '@/components/base/base-icon/base-icon.vue';
import BaseInput from '@/components/base/base-input/base-input.vue';
import CustomModal from '@/components/common/CustomModal.vue';
import { bindBusinessMotion } from '@/design/business-motion.js';
import { t, publicError } from '@/i18n/index.js';
import { dayKey } from '@/services/learning/learning-domain.js';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import {
  BEAD_ARTWORKS,
  beadArtProgress,
  beadArtworkPoints
} from '../../../../laf-backend/functions/_shared/learning-bead-art.js';
const props = defineProps({
  state: { type: Object, required: true },
  now: { type: Number, required: true },
  dark: Boolean
});
const learning = useConversationLearningStore();
const open = ref(false),
  goalId = ref(''),
  choice = ref('notebook'),
  deadline = ref(''),
  error = ref(''),
  reduced = ref(true);
let expectedContext,
  releaseMotion = () => undefined;
const goals = computed(() => props.state.conversations.filter((item) => !item.stopped || item.beadArt));
const goal = computed(
  () =>
    goals.value.find((item) => item.id === goalId.value) ||
    goals.value.find((item) => item.id === learning.selectedConversationId) ||
    goals.value.at(-1)
);
const progress = computed(() => beadArtProgress(props.state, goal.value?.id, props.now, dayKey));
const today = computed(() => dayKey(props.now, progress.value?.timezone || props.state.timezone));
const points = computed(() => (progress.value ? beadArtworkPoints(progress.value.artwork, progress.value.total) : []));
const outline = computed(() => {
  const shape =
    progress.value?.artwork === 'bloom'
      ? [0, 60, 120, 180, 240, 300]
          .map((angle) => `<ellipse cx="50" cy="29" rx="16" ry="23" transform="rotate(${angle} 50 50)"/>`)
          .join('') + '<circle cx="50" cy="50" r="17"/>'
      : '<path d="M8 17 Q29 8 50 24 Q71 8 92 17 L92 83 Q71 74 50 90 Q29 74 8 83Z"/><path d="M50 24V90"/>';
  return (
    'data:image/svg+xml,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="#8eaef4" fill-opacity=".06" stroke="#8eaef4" stroke-width=".7" stroke-opacity=".3">${shape}</g></svg>`
    )
  );
});
const pointStyle = (point) => ({
  left: `${point.x}%`,
  top: `${point.y}%`,
  width: `${point.size}%`,
  paddingTop: `${point.size}%`,
  '--bead-color': point.color
});
function selectGoal(id) {
  goalId.value = id;
  deadline.value = goal.value?.coach?.profile?.deadline || '';
  error.value = '';
}
function show() {
  expectedContext = learning.recordContext();
  selectGoal(goal.value?.id || '');
  open.value = true;
}
function save() {
  try {
    learning.startBeadArt(expectedContext, goal.value.id, choice.value, deadline.value);
    error.value = '';
  } catch (failure) {
    error.value = publicError(failure.message);
  }
}
onMounted(() => {
  releaseMotion = bindBusinessMotion((value) => (reduced.value = value));
});
onBeforeUnmount(() => releaseMotion());
</script>
<style scoped>
.study-beads :deep(.study-beads-trigger) {
  padding: 16px;
  border-radius: 17px;
  background: var(--muse-raised);
  color: var(--ink);
}
.study-beads :deep(.study-beads-trigger .base-button__content) {
  width: 100%;
  gap: 10px;
}
.bead-card-copy {
  flex: 1;
  min-width: 0;
  text-align: start;
}
.bead-title,
.bead-count,
.bead-progress,
.bead-status,
.bead-help,
.bead-art-name {
  display: block;
}
.bead-title {
  font-size: 15px;
  font-weight: 650;
}
.bead-count {
  color: var(--ink-3);
  font-size: 12px;
  margin-top: 5px;
}
.bead-goals {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
  max-height: 120px;
  overflow: auto;
}
.bead-choices {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.bead-choice {
  min-width: 0;
  border: 1px solid var(--border-color);
  border-radius: 18px;
}
.bead-choice[aria-pressed='true'] {
  border-color: var(--primary-color, #4278ee);
  background: var(--muse-raised);
}
.bead-choice :deep(.base-button__content) {
  flex-direction: column;
  width: 100%;
}
.bead-mini {
  position: relative;
  width: 100px;
  height: 100px;
  margin: 10px;
}
.bead-art-card {
  padding: 20px;
  border-radius: 22px;
  text-align: center;
  background: var(--muse-raised);
  overflow: hidden;
}
.bead-art-name {
  font-size: 18px;
  font-weight: 600;
}
.bead-scene {
  padding: 22px 12px;
  perspective: 650px;
}
.bead-artwork {
  position: relative;
  width: 100%;
  padding-top: 100%;
  transform: rotateX(12deg) rotateZ(-5deg) scale(0.94);
}
.bead-outline {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.bead-piece {
  position: absolute;
  box-sizing: border-box;
  transform: translate(-50%, -50%) scale(0.87);
  border-radius: 50%;
  border: 1px solid var(--ink-4, #afb4c0);
  background: transparent;
  opacity: 0.24;
  transition:
    opacity 280ms,
    background 280ms,
    box-shadow 280ms,
    transform 420ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.bead-piece.earned {
  opacity: 1;
  border: 0;
  background:
    radial-gradient(circle at 50% 50%, #243450 0 15%, transparent 18%),
    radial-gradient(circle at 28% 23%, #fff 0 5%, var(--bead-color) 33%, #5d78bc 82%);
  box-shadow:
    inset 0 -2px 2px #203b6544,
    1px 3px 3px #10244a33;
}
.bead-piece.missing {
  opacity: 0.75;
  border-style: dashed;
}
.bead-piece.repaired {
  box-shadow:
    inset 0 -2px 2px #203b6544,
    0 0 0 1px #8eaef266,
    1px 3px 3px #10244a33;
}
.bead-artwork.is-opening {
  animation: bead-reveal 850ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
.bead-progress {
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.5px;
}
.bead-status {
  margin-top: 14px;
  font-size: 14px;
  color: var(--ink);
}
.bead-setup {
  margin-top: 22px;
}
.bead-label {
  display: block;
  font-size: 13px;
  margin-bottom: 8px;
}
.bead-date-input {
  height: 46px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 0 12px;
  color: var(--ink);
  background: var(--muse-raised);
}
.bead-help {
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-3);
  margin: 14px 0;
}
.bead-error {
  display: block;
  color: var(--danger-color, #b14343);
  font-size: 13px;
  margin-top: 12px;
}
@keyframes bead-reveal {
  from {
    opacity: 0.2;
    transform: rotateX(30deg) rotateZ(-12deg) scale(0.85) translateY(14px);
  }
  to {
    opacity: 1;
    transform: rotateX(12deg) rotateZ(-5deg) scale(0.94);
  }
}
@media (prefers-reduced-motion: reduce) {
  .bead-artwork.is-opening {
    animation: none;
  }
  .bead-piece {
    transition: none;
  }
}
</style>
