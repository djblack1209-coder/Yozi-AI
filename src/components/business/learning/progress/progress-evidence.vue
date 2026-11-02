<template>
  <view class="progress-evidence" role="list" aria-label="学习记录">
    <view v-for="event in visibleEvents" :key="event.id" class="progress-event" role="listitem">
      <view class="event-meta"
        ><text>{{ event.day }}</text
        ><text>{{ event.kind === 'writing-feedback' ? 'AI 评估' : '核对' }}</text></view
      >
      <text class="event-prompt">{{ event.prompt || event.goal }}</text>
      <text class="event-conclusion">{{ event.conclusion }}</text>
      <text class="event-source"
        >{{ event.model.source === 'byok' ? 'BYOK' : event.model.source === 'unknown' ? '待核对' : '核对'
        }}<template v-if="event.model.actualModel || event.model.modelId">
          · {{ event.model.actualModel || event.model.modelId }}</template
        ></text
      >
      <BaseButton v-if="openable && event.recordId" variant="quiet" icon="arrow-right" @tap="emit('open', event)"
        >查看原答</BaseButton
      >
    </view>
    <BaseButton v-if="visibleEvents.length < events.length" variant="quiet" @tap="limit += pageSize"
      >查看更多</BaseButton
    >
    <text v-if="!events.length" class="event-meta" role="status">数据不足</text>
  </view>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import BaseButton from '@/components/base/base-button/base-button.vue';
const props = defineProps({
  events: { type: Array, default: () => [] },
  openable: { type: Boolean, default: true },
  pageSize: { type: Number, default: 0 }
});
const emit = defineEmits(['open']);
const limit = ref(props.pageSize);
const visibleEvents = computed(() => (props.pageSize > 0 ? props.events.slice(0, limit.value) : props.events));
watch([() => props.events, () => props.pageSize], () => {
  limit.value = props.pageSize;
});
</script>
<style scoped>
.progress-evidence {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.progress-event {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 14px 0;
  border-top: 1px solid var(--line);
  overflow-wrap: anywhere;
  flex-shrink: 0;
}
.event-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: var(--ink-3);
  font-size: 12px;
}
.event-prompt {
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
}
.event-conclusion {
  font-size: 13px;
  line-height: 1.7;
  font-weight: 600;
}
.event-source {
  color: var(--ink-3);
  font-size: 11px;
}
.progress-event .base-button {
  align-self: flex-start;
  font-size: 13px;
}
</style>
