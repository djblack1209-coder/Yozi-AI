<template>
  <BaseButton variant="quiet" :aria-expanded="open" @tap="show">{{ t('presentation.title') }}</BaseButton>
  <CustomModal
    :visible="open"
    :title="t('presentation.title')"
    :confirm-text="t('presentation.save')"
    :confirm-disabled="!presentation.available"
    :is-dark="theme.isDark"
    close-button
    mask-closable
    @confirm="save"
    @cancel="open = false"
  >
    <BaseSegmented v-model="draft" :options="options" :label="t('presentation.title')" />
    <text class="presentation-command">{{ t('presentation.command') }}</text>
    <text v-if="error" role="alert">{{ error }}</text>
  </CustomModal>
</template>
<script setup>
import { computed, ref, watch } from 'vue';
import '@/i18n/presentation.js';
import { t } from '@/i18n/index.js';
import { useThemeStore } from '@/stores/modules/theme.js';
import { PRESENTATION_MODES } from '@/composables/useLearningPresentation.js';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseSegmented from '@/components/base/base-segmented/base-segmented.vue';
import CustomModal from '@/components/common/CustomModal.vue';
const props = defineProps({ presentation: { type: Object, required: true } });
const theme = useThemeStore();
const open = ref(false),
  draft = ref('auto'),
  error = ref('');
const options = computed(() => PRESENTATION_MODES.map((value) => ({ value, label: t(`presentation.${value}`) })));
function show() {
  draft.value = props.presentation.mode;
  error.value = '';
  open.value = true;
}
function save() {
  if (props.presentation.save(draft.value)) open.value = false;
  else error.value = t('presentation.failed');
}
watch(
  () => props.presentation.context,
  () => {
    open.value = false;
    error.value = '';
  }
);
</script>
<style scoped>
.presentation-command {
  display: block;
  margin-top: var(--s-4);
  color: var(--ink-3);
  line-height: var(--leading-body);
}
</style>
