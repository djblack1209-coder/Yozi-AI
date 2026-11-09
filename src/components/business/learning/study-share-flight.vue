<template>
  <view class="study-share-flight" aria-hidden="true" @animationend.self="$emit('finished')">
    <view class="share-envelope">
      <view class="share-envelope-back">
        <view class="share-envelope-flap" />
        <view class="share-letter">
          <view class="share-letter-bottom"><image :src="image" mode="aspectFit" /></view>
          <view class="share-letter-fold">
            <view class="share-letter-top"><image :src="image" mode="aspectFit" /></view>
          </view>
        </view>
        <view class="share-envelope-pocket" />
      </view>
      <view class="share-envelope-front">
        <image :src="BRAND.mark" mode="aspectFit" />
        <text>Yozi AI</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { BRAND } from '@/config/brand.js';

defineProps({ image: { type: String, required: true } });
defineEmits(['finished']);
</script>

<style scoped>
.study-share-flight {
  --flight-time: 2440ms;
  --envelope-blue: var(--blue-soft);
  --envelope-fold: color-mix(in srgb, var(--blue) 19%, var(--envelope-blue));
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: radial-gradient(ellipse at 50% 40%, var(--blue-soft), var(--paper) 76%);
  pointer-events: none;
  perspective: 650px;
  animation: share-flight var(--flight-time) both;
}
.share-envelope {
  position: relative;
  width: 148px;
  height: 88px;
  transform-style: preserve-3d;
  animation: share-envelope var(--flight-time) both;
}
.share-envelope-back,
.share-envelope-front {
  position: absolute;
  inset: 0;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--envelope-blue);
  box-shadow: 0 9px 20px -8px #11264957;
  backface-visibility: hidden;
  transform-style: preserve-3d;
}
.share-envelope-back {
  animation: share-envelope-back var(--flight-time) steps(1, end) both;
}
.share-envelope-front {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: var(--ink);
  font-size: 13px;
  font-weight: 650;
  animation: share-envelope-front var(--flight-time) steps(1, end) both;
}
.share-envelope-front image {
  width: 20px;
  height: 20px;
}
.share-envelope-pocket,
.share-envelope-flap {
  position: absolute;
  inset: 0;
  border-radius: inherit;
}
.share-envelope-pocket {
  background: linear-gradient(155deg, var(--envelope-fold), var(--envelope-blue));
  clip-path: polygon(0 4%, 50% 49%, 100% 4%, 100% 100%, 0 100%);
}
.share-envelope-flap {
  height: 49px;
  background: var(--envelope-fold);
  clip-path: polygon(0 0, 100% 0, 50% 100%);
  transform-origin: top center;
  animation: share-flap var(--flight-time) both;
}
.share-letter {
  position: absolute;
  top: -116px;
  left: calc(50% - 46px);
  width: 92px;
  height: 123px;
  transform-style: preserve-3d;
  animation: share-letter var(--flight-time) both;
}
.share-letter-bottom,
.share-letter-fold,
.share-letter-top {
  position: absolute;
  width: 100%;
  height: 50%;
}
.share-letter-bottom,
.share-letter-top {
  overflow: hidden;
  border-radius: 4px;
  background: var(--paper);
}
.share-letter-bottom {
  bottom: 0;
}
.share-letter-top {
  height: 100%;
  backface-visibility: hidden;
}
.share-letter-bottom image,
.share-letter-top image {
  position: absolute;
  left: 0;
  width: 100%;
  height: 200%;
}
.share-letter-bottom image {
  bottom: 0;
}
.share-letter-top image {
  top: 0;
}
.share-letter-fold {
  transform-origin: bottom center;
  transform-style: preserve-3d;
  animation: share-fold var(--flight-time) both;
}
.share-letter-fold::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--paper);
  backface-visibility: hidden;
  transform: rotateX(180deg);
}
@keyframes share-flight {
  0%,
  100% {
    opacity: 0;
  }
  7%,
  91% {
    opacity: 1;
  }
}
@keyframes share-envelope {
  0% {
    transform: translateY(28px);
  }
  13%,
  58% {
    transform: translateY(22px);
  }
  66% {
    transform: translateY(22px) scaleX(0.035);
  }
  73%,
  82% {
    transform: translateY(22px);
    opacity: 1;
  }
  100% {
    transform: translate(-62px, 113px) rotateZ(-8deg) scale(0.82);
    opacity: 0;
  }
}
@keyframes share-fold {
  0%,
  11% {
    transform: rotateX(0);
  }
  31%,
  100% {
    transform: rotateX(-180deg);
  }
}
@keyframes share-letter {
  0%,
  30% {
    transform: translateY(0);
    opacity: 1;
  }
  46% {
    transform: translateY(68px);
    opacity: 1;
  }
  48%,
  100% {
    transform: translateY(68px);
    opacity: 0;
  }
}
@keyframes share-flap {
  0%,
  43% {
    z-index: 0;
    transform: rotateX(180deg);
  }
  58%,
  100% {
    z-index: 1;
    transform: rotateX(0);
  }
}
@keyframes share-envelope-back {
  0% {
    visibility: visible;
  }
  66%,
  100% {
    visibility: hidden;
  }
}
@keyframes share-envelope-front {
  0% {
    visibility: hidden;
  }
  66%,
  100% {
    visibility: visible;
  }
}
@media (prefers-reduced-motion: reduce) {
  .study-share-flight {
    visibility: hidden;
    animation-duration: 1ms;
  }
  .study-share-flight * {
    animation: none;
  }
}
</style>
