<template>
  <view
    ref="keyboardRoot"
    class="page-container"
    :style="$yoziInsets"
    :class="{ 'dark-mode': isDark, 'theme-light': !isDark, 'desktop-legal-page': desktop }"
  >
    <view class="top-nav">
      <BaseButton
        class="nav-back"
        variant="quiet"
        icon="arrow-left"
        icon-only
        :label="t('ui.back')"
        :disabled="returning"
        @tap="goBack"
      />
      <text class="nav-title" role="heading" aria-level="1">{{ t(`pages.${document}`) }}</text>
    </view>
    <scroll-view scroll-y class="content-scroll" :scroll-into-view="anchor">
      <view class="content-section" :lang="english ? 'en' : 'zh-CN'">
        <text class="update-date">{{ dateLine }}</text>
        <view class="legal-copy">
          <template v-for="(block, index) in blocks" :key="index">
            <view v-if="block.type === 'h2'" :id="block.id" class="section-title" role="heading" aria-level="2">
              <LegalInline :source="block.text" @open="openDocument" />
            </view>
            <view v-else-if="block.type === 'p'" class="section-text">
              <LegalInline :source="block.text" @open="openDocument" />
            </view>
            <view v-else-if="block.type === 'list'" class="section-text" role="list">
              <view
                v-for="(item, itemIndex) in block.items"
                :key="itemIndex"
                class="legal-item"
                :style="{ paddingInlineStart: item.depth ? '1.25em' : undefined }"
                role="listitem"
              >
                <text class="legal-marker" aria-hidden="true">{{ item.ordered ? item.start + '.' : '•' }}</text>
                <LegalInline :source="item.text" @open="openDocument" />
              </view>
            </view>
            <view v-else class="legal-table section-text" role="table">
              <view v-for="(row, rowIndex) in block.rows" :key="rowIndex" class="legal-row" role="row">
                <view
                  v-for="(cell, cellIndex) in row"
                  :key="cellIndex"
                  class="legal-cell"
                  :role="rowIndex === 0 ? 'columnheader' : cellIndex === 0 ? 'rowheader' : 'cell'"
                >
                  <LegalInline :source="cell" @open="openDocument" />
                </view>
              </view>
            </view>
          </template>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
/* global __YOZI_LEGAL__ */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import BaseButton from '@/components/base/base-button/base-button.vue';
import { currentLanguage, t } from '@/i18n/index.js';
import { openDesktopSettings } from '@/services/desktop/windows.js';
import { isDesktopRuntime } from '@/services/desktop/runtime.js';
import { bindLearningKeyboard } from '@/services/learning/keyboard-controls.js';
import { useThemeStore } from '@/stores/modules/theme.js';
import { safeNavigateBack, safeNavigateTo, safeRedirectTo } from '@/utils/safe-navigate';
import { toast } from '@/utils/toast.js';
import LegalInline from './legal-inline.vue';

const props = defineProps({
  document: { type: String, required: true },
  query: { type: Object, required: true }
});
const { documents, version: { version, updated, effective } } = __YOZI_LEGAL__;
const english = computed(() => currentLanguage.value === 'en');
const blocks = computed(() => documents[english.value ? 'en' : 'zh'][props.document]);
const dateLine = computed(() => english.value
  ? `Version ${version} · updated ${updated} · effective ${effective}`
  : `版本 ${version} · ${updated} 更新 · ${effective} 生效`);
const themeStore = useThemeStore();
const isDark = computed(() => themeStore.isDark);
const desktop = isDesktopRuntime();
const fromSettings = computed(() => desktop && props.query.fromSettings === '1');
const returning = ref(false);
const anchor = ref('');
const keyboardRoot = ref(null);
let unbindKeyboard;
onMounted(() => {
  unbindKeyboard = bindLearningKeyboard(keyboardRoot.value);
});
onBeforeUnmount(() => unbindKeyboard?.());
watch(() => props.query.section, async (section) => {
  await nextTick();
  anchor.value = section || '';
}, { immediate: true });

function openDocument({ document, section }) {
  const query = [fromSettings.value && 'fromSettings=1', section && `section=${section}`]
    .filter(Boolean)
    .join('&');
  const path = `/pages/settings/${document}`;
  const url = query ? `${path}?${query}` : path;
  // A linked document replaces the current one when Settings opened it.
  if (fromSettings.value) safeRedirectTo(url, { fail: () => toast.info('页面跳转失败') });
  else safeNavigateTo(url);
}

async function goBack() {
  if (returning.value) return;
  if (fromSettings.value) {
    returning.value = true;
    try {
      await openDesktopSettings('legal');
    } catch {
      returning.value = false;
      toast.info('设置窗口暂不可用');
      return;
    }
  }
  safeNavigateBack({ complete: () => { returning.value = false; } });
}
</script>

<style scoped>
.page-container {
  --legal-top: env(safe-area-inset-top, 0px);
  --legal-nav-height: calc(var(--legal-top) + var(--control-height) + var(--s-4));
  min-height: 100vh;
  color: var(--ink);
  background: var(--canvas);
  font: var(--weight-regular) var(--size-body)/var(--leading-body) var(--font-ui);
}
.desktop-legal-page {
  --legal-top: 28px;
}
.top-nav {
  display: flex;
  align-items: center;
  padding: var(--legal-top) var(--s-4) 0;
  height: var(--legal-nav-height);
  gap: var(--s-3);
  box-sizing: border-box;
  max-width: var(--reading-measure);
  margin-inline: auto;
  border-bottom: var(--border-thin) solid var(--glass-line);
}
.nav-title,
.section-title {
  color: var(--ink);
  font: var(--weight-ui-emphasis) var(--size-title-3)/var(--leading-title-3) var(--font-ui);
}
.content-scroll {
  height: calc(100vh - var(--legal-nav-height));
}
.content-section {
  box-sizing: border-box;
  max-width: var(--reading-measure);
  margin: 0 auto;
  padding: var(--s-6) var(--s-4);
}
.update-date {
  display: block;
  margin-bottom: var(--s-6);
  color: var(--ink-3);
  font-size: var(--size-caption);
  line-height: var(--leading-small);
}
.section-title {
  margin-top: var(--s-6);
  padding-top: var(--s-4);
  border-top: var(--border-thin) solid var(--line);
}
.section-text {
  margin-top: var(--s-3);
  color: var(--ink-2);
  overflow-wrap: anywhere;
}
.legal-item {
  display: flex;
  gap: var(--s-2);
  margin-bottom: var(--s-1);
}
.legal-item .legal-inline {
  flex: 1;
  min-width: 0;
}
.legal-marker {
  min-width: 1.3em;
}
.legal-table {
  display: table;
  width: 100%;
  border-collapse: collapse;
}
.legal-row {
  display: table-row;
}
.legal-cell {
  display: table-cell;
  padding: var(--s-2);
  border: var(--border-thin) solid var(--line);
}
.legal-cell[role='columnheader'],
.legal-cell[role='rowheader'] {
  font-weight: var(--weight-ui-emphasis);
}
/* #ifdef MP-WEIXIN */
.page-container {
  --legal-top: var(--yozi-status-top, 0px);
}
.top-nav {
  padding-right: calc(var(--yozi-capsule-right, 0px) + var(--s-3));
  background: var(--paper);
}
/* #endif */
</style>
