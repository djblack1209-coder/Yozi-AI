<template>
  <view class="feedback-flight" aria-hidden="true" @animationend.self="$emit('finished')">
    <view class="feedback-flight__paper">
      <view class="feedback-flight__ink">
        <text class="feedback-flight__address">{{ address }}</text>
        <text v-if="note" class="feedback-flight__note">{{ note }}</text>
        <view v-else class="feedback-flight__lines">
          <view v-for="line in 3" :key="line" class="feedback-flight__line" />
        </view>
      </view>
      <view class="feedback-flight__fold feedback-flight__fold--left" />
      <view class="feedback-flight__fold feedback-flight__fold--right" />
      <view class="feedback-flight__wings" />
    </view>
  </view>
</template>

<script setup>
defineProps({ address: { type: String, required: true }, note: { type: String, required: true } });
defineEmits(['finished']);
</script>

<style scoped>
.feedback-flight {
  display: none;
  pointer-events: none;
}
@media (prefers-reduced-motion: no-preference) {
  .feedback-flight {
    position: absolute;
    inset: 0;
    display: block;
    transform-origin: 50% 22%;
    filter: drop-shadow(0 10px 14px #1e467a38);
    animation: feedback-flight-path var(--feedback-flight-time) cubic-bezier(0.35, 0.1, 0.28, 1) both;
  }
  .feedback-flight__paper {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border: 1px solid #a5bddb;
    border-radius: 13px;
    background: linear-gradient(146deg, #eef6ff 6%, #cddff6 86%);
    color: #203b62;
    animation: feedback-paper-fold var(--feedback-flight-time) cubic-bezier(0.4, 0, 0.2, 1) both;
  }
  .feedback-flight__ink {
    padding: 15px;
    font-size: 13px;
    animation: feedback-ink-fold var(--feedback-flight-time) both;
  }
  .feedback-flight__address {
    display: block;
    padding-bottom: 10px;
    border-bottom: 1px solid #a5bddb;
    font-weight: 600;
  }
  .feedback-flight__note {
    display: -webkit-box;
    overflow: hidden;
    margin-top: 10px;
    line-height: 1.5;
    white-space: pre-wrap;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 5;
  }
  .feedback-flight__lines {
    display: grid;
    width: 72%;
    gap: 7px;
    margin-top: 16px;
  }
  .feedback-flight__line {
    height: 2px;
    border-radius: 2px;
    background: #7794b67a;
  }
  .feedback-flight__line:last-child {
    width: 58%;
  }
  .feedback-flight__fold,
  .feedback-flight__wings {
    position: absolute;
    inset: 0;
  }
  .feedback-flight__fold--left {
    clip-path: polygon(50% 0, 0 63%, 48% 62%);
    transform-origin: 50% 28%;
    background: linear-gradient(111deg, #90aed3 10%, #e5f2ff 51%, #b9cfea 67%);
    animation: feedback-fold-left var(--feedback-flight-time) both;
  }
  .feedback-flight__fold--right {
    clip-path: polygon(50% 0, 52% 62%, 100% 63%);
    transform-origin: 50% 28%;
    background: linear-gradient(245deg, #86a9d4 16%, #dfeeff 48%, #9bb7dd 62%);
    animation: feedback-fold-right var(--feedback-flight-time) both;
  }
  .feedback-flight__wings {
    clip-path: polygon(50% 0, 100% 100%, 50% 88%, 0 100%);
    background: linear-gradient(90deg, #e8f4ff 10%, #c5ddfa 48%, #819fcb 50%, #bad6f6 53%, #edf7ff 92%);
    animation: feedback-wings var(--feedback-flight-time) both;
  }
  .feedback-flight,
  .feedback-flight__paper,
  .feedback-flight__ink,
  .feedback-flight__fold,
  .feedback-flight__wings {
    animation-play-state: var(--feedback-flight-play);
  }
  @keyframes feedback-paper-fold {
    0%,
    12% {
      clip-path: polygon(0 0, 50% 0, 100% 0, 100% 100%, 50% 100%, 0 100%);
    }
    32% {
      clip-path: polygon(0 62%, 50% 0, 100% 0, 100% 100%, 50% 100%, 0 100%);
    }
    49% {
      clip-path: polygon(0 62%, 50% 0, 100% 62%, 100% 100%, 50% 100%, 0 100%);
    }
    61%,
    100% {
      clip-path: polygon(0 100%, 50% 0, 100% 100%, 94% 99%, 50% 88%, 6% 99%);
    }
  }
  @keyframes feedback-fold-left {
    0%,
    12% {
      opacity: 0;
      transform: perspective(520px) rotateY(-78deg);
    }
    32%,
    57% {
      opacity: 1;
      transform: perspective(520px) rotateY(0);
    }
    65%,
    100% {
      opacity: 0;
    }
  }
  @keyframes feedback-fold-right {
    0%,
    28% {
      opacity: 0;
      transform: perspective(520px) rotateY(78deg);
    }
    49%,
    57% {
      opacity: 1;
      transform: perspective(520px) rotateY(0);
    }
    65%,
    100% {
      opacity: 0;
    }
  }
  @keyframes feedback-ink-fold {
    0%,
    16% {
      opacity: 1;
      transform: translateY(0);
    }
    46% {
      opacity: 0.55;
    }
    59%,
    100% {
      opacity: 0;
      transform: translateY(-7px);
    }
  }
  @keyframes feedback-wings {
    0%,
    50% {
      opacity: 0;
    }
    63%,
    100% {
      opacity: 1;
    }
  }
  @keyframes feedback-flight-path {
    0% {
      opacity: 1;
      transform: perspective(740px) translateY(0) rotateX(0) rotateY(0) rotateZ(0) scale(1);
    }
    17% {
      opacity: 1;
      transform: perspective(740px) translateY(-7px) rotateX(5deg) rotateY(-4deg) rotateZ(-1deg) scale(1.01);
    }
    56% {
      opacity: 1;
      transform: perspective(740px) translateY(-7px) rotateX(3deg) rotateY(0) rotateZ(0) scale(0.98);
    }
    70% {
      opacity: 1;
      transform: perspective(740px) translate(6%, -8%) rotateX(12deg) rotateY(-42deg) rotateZ(13deg) scale(0.87);
    }
    83% {
      opacity: 0.94;
      transform: perspective(740px) translate(42%, -46%) rotateX(-8deg) rotateY(-21deg) rotateZ(38deg) scale(0.52);
    }
    94%,
    100% {
      opacity: 0;
      transform: perspective(740px) translate(92%, -122%) rotateX(-12deg) rotateY(26deg) rotateZ(50deg) scale(0.16);
    }
  }
}
</style>
