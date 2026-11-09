<template>
  <view class="brand-scene" aria-hidden="true">
    <image class="brand-scene__media" :src="POSTER" mode="aspectFill" alt="" />
    <!-- #ifdef H5 -->
    <component
      :is="'video'"
      v-if="enabled"
      ref="video"
      class="brand-scene__media"
      muted
      playsinline
      loop
      preload="none"
      tabindex="-1"
      :poster="POSTER"
      :src="VIDEO"
    />
    <!-- #endif -->
    <view class="brand-scene__brand"
      ><image :src="BRAND.markOnDark" mode="aspectFit" alt="" /><text>Yozi AI</text></view
    >
    <view class="brand-scene__copy"
      ><text lang="en">A little clearer.</text><text lang="en">Every day.</text
      ><text class="brand-scene__caption">Your personal AI learning coach.</text></view
    >
  </view>
</template>
<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { onHide, onShow } from '@dcloudio/uni-app';
import { BRAND } from '@/config/brand.js';
const POSTER = '/static/signin/scene.webp',
  VIDEO = '/static/signin/scene.mp4';
const video = ref(null),
  enabled = ref(false);
let query,
  pageVisible = true;
function sync() {
  // #ifdef H5
  enabled.value = query?.matches === true;
  nextTick(() => {
    const node = video.value;
    if (!node) return;
    node.muted = true;
    if (!enabled.value || !pageVisible || document.hidden || !document.hasFocus()) node.pause();
    else node.play()?.catch(() => undefined);
  });
  // #endif
}
onMounted(() => {
  // #ifdef H5
  query = window.matchMedia?.('(min-width: 761px) and (prefers-reduced-motion: no-preference)');
  query?.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('focus', sync);
  window.addEventListener('blur', sync);
  sync();
  // #endif
});
onHide(() => {
  pageVisible = false;
  sync();
});
onShow(() => {
  pageVisible = true;
  sync();
});
onBeforeUnmount(() => {
  // #ifdef H5
  video.value?.pause();
  query?.removeEventListener('change', sync);
  document.removeEventListener('visibilitychange', sync);
  window.removeEventListener('focus', sync);
  window.removeEventListener('blur', sync);
  // #endif
});
</script>
<style scoped>
.brand-scene {
  position: relative;
  min-width: 0;
  overflow: hidden;
  border-radius: 24px;
  background: #101827;
  color: #fff;
  isolation: isolate;
}
.brand-scene__media {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  z-index: -1;
}
.brand-scene::after {
  position: absolute;
  inset: 0;
  z-index: -1;
  background: linear-gradient(180deg, #10182799, transparent 28%, transparent 55%, #101827d9);
  content: '';
}
.brand-scene__brand {
  position: absolute;
  top: 32px;
  left: 32px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.04em;
}
.brand-scene__brand image {
  width: 44px;
  height: 44px;
}
.brand-scene__copy {
  position: absolute;
  bottom: 48px;
  left: 40px;
  right: 32px;
  font-size: clamp(32px, 3.4vw, 52px);
  font-weight: 500;
  letter-spacing: -0.055em;
  line-height: 1.1;
}
.brand-scene__copy text {
  display: block;
}
.brand-scene__copy .brand-scene__caption {
  font-size: 13px;
  letter-spacing: 0;
  line-height: 1.5;
  margin-top: 20px;
}
@media (max-width: 760px) {
  .brand-scene {
    border-radius: 18px;
    min-height: 240px;
  }
  .brand-scene__brand {
    top: 20px;
    left: 20px;
    font-size: 18px;
  }
  .brand-scene__brand image {
    width: 32px;
    height: 32px;
  }
  .brand-scene__copy {
    bottom: 24px;
    left: 24px;
    font-size: 32px;
  }
  .brand-scene__copy .brand-scene__caption {
    font-size: 11px;
    margin-top: 12px;
  }
  .brand-scene__media {
    object-position: center;
  }
}
</style>
