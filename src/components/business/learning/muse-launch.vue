<script>
// One entrance per application runtime; navigation and account changes never replay it.
const launchedScopes = new WeakSet();
</script>

<template>
  <view
    v-if="visible"
    class="muse-launch"
    :class="{ 'is-leaving': leaving, 'reduce-motion': reduced }"
    role="status"
    :aria-label="t('ui.loading')"
  >
    <view class="muse-launch__ring" aria-hidden="true" />
    <view class="muse-launch__kitten"><AnimatedAvatar :size="64" autoplay /></view>
  </view>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import AnimatedAvatar from '@/components/base/animated-avatar/animated-avatar.vue';
import { bindBusinessMotion } from '@/design/business-motion.js';
import { t } from '@/i18n/index.js';

const props = defineProps({
  scope: { type: Object, required: true },
  ready: { type: Boolean, default: false }
});
const emit = defineEmits(['complete']);
const visible = ref(!launchedScopes.has(props.scope));
if (visible.value) launchedScopes.add(props.scope);
const leaving = ref(false);
const reduced = ref(true);
let mounted = false;
let timer = null;
let releaseMotion = () => undefined;
const enteredAt = Date.now();

function finish() {
  clearTimeout(timer);
  if (!mounted || !visible.value || !props.ready) return;
  if (reduced.value) {
    visible.value = false;
    emit('complete');
    return;
  }
  timer = setTimeout(
    () => {
      leaving.value = true;
      timer = setTimeout(() => {
        visible.value = false;
        emit('complete');
      }, 220);
    },
    Math.max(0, 1080 - (Date.now() - enteredAt))
  );
}
watch([() => props.ready, reduced], finish);
onMounted(() => {
  releaseMotion = bindBusinessMotion((value) => {
    reduced.value = value;
  });
  mounted = true;
  if (!visible.value) {
    emit('complete');
    return;
  }
  finish();
});
onBeforeUnmount(() => {
  mounted = false;
  clearTimeout(timer);
  releaseMotion();
});
</script>

<style src="./muse-launch.css" scoped></style>
