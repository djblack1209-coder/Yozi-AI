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
      <text
        v-else-if="part.copySupport"
        class="legal-link"
        role="button"
        tabindex="0"
        :aria-label="`${t('settings.copySupportEmail')} ${part.text}`"
        @tap="copySupportEmail"
        @keydown.enter.prevent="copySupportEmail"
        @keydown.space.prevent="copySupportEmail"
        >{{ part.text }}</text
      >
      <text v-else :class="{ 'legal-emphasis': part.emphasis }">{{ part.text }}</text>
    </template>
  </text>
</template>

<script setup>
import { computed } from 'vue';
import { BRAND } from '@/config/brand.js';
import { t } from '@/i18n/index.js';
import { toast } from '@/utils/toast.js';

const props = defineProps({ source: { type: String, required: true } });
const emit = defineEmits(['open']);
const parts = computed(() =>
  props.source
    .split(/(\*\*.+?\*\*|\[[^\]]+\]\([^)]+\))/g)
    .filter(Boolean)
    .map((part) => {
      if (part.startsWith('**')) return { text: part.slice(2, -2), emphasis: true };
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
      if (!link) return { text: part };
      const [, text, href] = link;
      if (href === `mailto:${BRAND.supportEmail}`) return { text, copySupport: true };
      const document = /^\/(?:en|zh)\/(privacy|terms)\/(?:#([a-z-]+))?$/.exec(href);
      return document ? { text, document: document[1], section: document[2] } : { text: part };
    })
);

function copySupportEmail() {
  uni.setClipboardData({
    data: BRAND.supportEmail,
    fail: () => toast.error(t('settings.copySupportFailed'))
  });
}
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
