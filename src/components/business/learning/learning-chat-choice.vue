<template>
  <BaseButton
    :variant="iconOnly ? 'quiet' : 'secondary'"
    :icon="iconOnly ? 'ellipsis' : 'chevron-down'"
    :icon-only="iconOnly"
    :label="label"
    aria-haspopup="dialog"
    :aria-expanded="open"
    :disabled="busy"
    @tap="show"
    >{{ iconOnly ? '' : label }}</BaseButton
  >
  <CustomModal
    v-model:visible="open"
    :title="title"
    :is-dark="theme.isDark"
    :confirm-text="t('tutor.proposal.applyChoice')"
    :confirm-disabled="busy || !choice"
    position="bottom"
    transition="slide-up"
    container-class="is-choice-sheet"
    initial-focus-selector=".chat-choice-option"
    mask-closable
    @confirm="$emit('apply', choice)"
  >
    <view class="chat-choice-options" role="group" :aria-label="title">
      <BaseButton
        v-for="option in options"
        :key="option.value"
        class="chat-choice-option"
        variant="secondary"
        align="start"
        block
        :icon="choice === option.value ? 'check' : undefined"
        :selected="choice === option.value"
        :aria-pressed="choice === option.value"
        :disabled="busy"
        @tap="choice = option.value"
        >{{ option.label }}</BaseButton
      >
    </view>
  </CustomModal>
</template>
<script setup>
import { ref } from 'vue';
import '@/i18n/tutor.js';
import { t } from '@/i18n/index.js';
import { useThemeStore } from '@/stores/modules/theme.js';
import BaseButton from '@/components/base/base-button/base-button.vue';
import CustomModal from '@/components/common/CustomModal.vue';

const props = defineProps({
  title: { type: String, required: true },
  label: { type: String, required: true },
  options: { type: Array, required: true },
  initialChoice: { type: String, default: '' },
  iconOnly: Boolean,
  busy: Boolean
});
defineEmits(['apply']);
const theme = useThemeStore();
const open = ref(false);
const choice = ref('');
function show() {
  choice.value = props.initialChoice;
  open.value = true;
}
</script>
<style scoped>
.chat-choice-options {
  display: grid;
  gap: 8px;
}
.chat-choice-option[aria-pressed='true'] {
  background: var(--violet-soft);
  color: var(--violet-ink);
}
</style>
