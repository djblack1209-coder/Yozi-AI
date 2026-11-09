<template>
  <CustomModal
    :visible="visible"
    :title="t('muse.usage.localDetails')"
    :is-dark="dark"
    :show-actions="false"
    position="bottom"
    transition="slide-up"
    container-class="is-choice-sheet"
    initial-focus-selector=".modal-close"
    close-button
    mask-closable
    @cancel="$emit('close')"
  >
    <view v-if="visible" class="usage-detail">
      <view class="usage-medals" aria-hidden="true">
        <view v-for="metric in metrics" :key="metric.label" class="usage-medal" :class="metric.tone">
          <view class="usage-medal-spinner">
            <view class="usage-medal-edge" />
            <view class="usage-medal-face"><BaseIcon :name="metric.icon" color="#183957" size="27px" /></view>
            <view class="usage-medal-face is-back"><BaseIcon :name="metric.icon" color="#183957" size="27px" /></view>
          </view>
        </view>
      </view>
      <text class="usage-detail-scope">{{ scope }}</text>
      <view v-for="metric in metrics" :key="metric.label" class="usage-detail-row">
        <text>{{ metric.label }}</text
        ><text>{{ metric.value }}</text>
      </view>
    </view>
  </CustomModal>
</template>

<script setup>
import BaseIcon from '@/components/base/base-icon/base-icon.vue';
import CustomModal from '@/components/common/CustomModal.vue';
import { t } from '@/i18n/index.js';

defineProps({ visible: Boolean, metrics: { type: Array, required: true }, scope: String, dark: Boolean });
defineEmits(['close']);
</script>

<style scoped>
.usage-medals {
  display: flex;
  justify-content: center;
  gap: clamp(6px, 2.8vw, 15px);
  padding: 18px 8px 21px;
  margin-bottom: 13px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: radial-gradient(ellipse at 50% 110%, var(--blue-soft), transparent 69%), var(--muse-panel);
}
.usage-medal {
  --medal-light: #d7f1ff;
  --medal-color: #75bde9;
  --medal-edge: #287eb6;
  position: relative;
  flex: 0 1 clamp(42px, 14vw, 65px);
  aspect-ratio: 1;
  min-width: 0;
  perspective: 340px;
}
.usage-medal.is-mint {
  --medal-light: #e8fae9;
  --medal-color: #8bd5ba;
  --medal-edge: #3d997e;
}
.usage-medal.is-violet {
  --medal-light: #f5eeff;
  --medal-color: #c7b6f6;
  --medal-edge: #7761bd;
}
.usage-medal.is-honey {
  --medal-light: #fff2ce;
  --medal-color: #efc379;
  --medal-edge: #a57933;
}
.usage-medal::before {
  position: absolute;
  inset: auto 8% -6px;
  height: 11px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--medal-edge) 28%, transparent);
  filter: blur(4px);
  content: '';
}
.usage-medal-spinner {
  position: absolute;
  inset: 0;
  transform: rotateX(10deg) rotateY(-16deg);
  transform-style: preserve-3d;
}
.usage-medal-face {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border: 2px solid var(--medal-edge);
  border-radius: 50%;
  background: radial-gradient(ellipse at 34% 24%, var(--medal-light), var(--medal-color) 80%);
  box-shadow:
    inset 0 0 0 3px #ffffff55,
    inset 0 0 0 5px #ffffff23;
  backface-visibility: hidden;
  transform: translateZ(3px);
}
.usage-medal-face.is-back {
  transform: rotateY(180deg) translateZ(3px);
}
.usage-medal-edge {
  position: absolute;
  inset: 4% calc(50% - 3px);
  border-radius: 50%;
  background: repeating-linear-gradient(0deg, var(--medal-edge) 0 2px, var(--medal-color) 2px 4px);
  transform: rotateY(90deg);
}
.usage-detail-scope {
  display: block;
  margin-bottom: 4px;
  color: var(--ink-3);
  font-size: var(--size-small);
}
.usage-detail-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 0;
  font-variant-numeric: tabular-nums;
}
.usage-detail-row + .usage-detail-row {
  border-top: 1px solid var(--line);
}
.usage-detail-row > text:last-child {
  font-weight: 650;
}
@media (prefers-reduced-motion: no-preference) {
  .usage-medal-spinner {
    animation: usage-medal-turn 2.1s linear infinite;
  }
  .usage-medal.is-mint .usage-medal-spinner {
    animation-delay: -0.27s;
  }
  .usage-medal.is-violet .usage-medal-spinner {
    animation-delay: -0.56s;
  }
  .usage-medal.is-honey .usage-medal-spinner {
    animation-delay: -0.82s;
  }
}
@keyframes usage-medal-turn {
  from {
    transform: rotateX(10deg) rotateY(-16deg);
  }
  to {
    transform: rotateX(10deg) rotateY(344deg);
  }
}
</style>
