<template>
  <text class="legal-inline">
    <template v-for="(part, index) in parts" :key="index">
      <text
        v-if="part.document"
        class="legal-link"
        role="link"
        tabindex="0"
        @tap="emit('open', part)"
        @keydown.enter.prevent="emit('open', part)"
        >{{ part.text }}</text
      >
      <text v-else :class="{ 'legal-emphasis': part.emphasis }">{{ part.text }}</text>
    </template>
  </text>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({ source: { type: String, required: true } });
const emit = defineEmits(['open']);
const parts = computed(() =>
  props.source
    .split(/(\*\*.+?\*\*|\[[^\]]+\]\([^)]+\))/g)
    .filter(Boolean)
    .map((part) => {
      if (part.startsWith('**')) return { text: part.slice(2, -2), emphasis: true };
      const link = /^\[([^\]]+)\]\(\/(?:en|zh)\/(privacy|terms)\/(?:#([a-z-]+))?\)$/.exec(part);
      return link ? { text: link[1], document: link[2], section: link[3] } : { text: part };
    })
);
</script>

<style scoped>
.legal-inline {
  white-space: pre-wrap;
}
.legal-emphasis {
  font-weight: var(--weight-ui-emphasis);
}
.legal-link {
  color: var(--violet-ink);
  text-decoration: underline;
  cursor: pointer;
}
.legal-link:focus-visible {
  outline: var(--border-selected) solid var(--focus);
}
</style>
