<template>
  <view class="coach-citation">
    <BaseButton v-if="passage" variant="quiet" icon="file-text" @tap="$emit('open', source)"
      >{{ passage.name }} · {{ passage.location }} · 内容待核对</BaseButton
    >
    <text v-else>{{ label }}</text>
    <text v-if="source?.quote" selectable>{{ source.quote }}</text>
  </view>
</template>

<script setup>
import { computed } from 'vue';
import BaseButton from '@/components/base/base-button/base-button.vue';
import { coachSourcePassage } from '@/services/learning/coach-material-context.js';

const props = defineProps({
  source: { type: Object, default: null },
  materials: { type: Array, default: () => [] }
});
defineEmits(['open']);
const passage = computed(() => coachSourcePassage(props.materials, props.source));
const label = computed(() => {
  const source = props.source;
  if (source?.kind === 'private_material')
    return `${source.name}${source.page ? ` · 第 ${source.page} 页` : ''} · 内容待核对`;
  return source?.materialUncovered ? '资料未覆盖，模型自编 · 内容待核对' : '模型生成 · 内容待核对';
});
</script>

<style scoped>
.coach-citation {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  color: var(--ink-3);
  font-size: var(--size-caption);
  overflow-wrap: anywhere;
}
</style>
