<template>
  <LearningShell
    class="yozi-page"
    active="favorite"
    :title="$t('pages.favorite')"
    :style="$yoziInsets"
    :class="['container', { 'dark-mode': isDark, 'theme-light': !isDark }]"
  >
    <!-- 导航栏 -->
    <template #controls>
      <BaseButton icon="chevron-left" icon-only variant="quiet" :label="$t('ui.back')" @tap="goBack" />
      <BaseButton icon="plus" icon-only variant="secondary" :label="t('favorite.copy0')" @tap="openFolderModal()" />
    </template>
    <!-- ✅ F018: 加载状态 -->
    <BaseEmpty v-if="isLoading" state="loading" class="loading-state" />

    <scroll-view
      v-else
      scroll-y
      class="main-scroll"
      refresher-enabled
      :refresher-triggered="isRefreshing"
      @scrolltolower="loadMoreFavorites"
      @refresherrefresh="onPullRefresh"
    >
      <BaseEmpty v-if="loadError" state="error" :title="loadError" show-button @action="onPullRefresh" />
      <!-- 统计卡片 -->
      <view v-if="totalFavorites" class="stats-row apple-glass-card">
        <BaseStat :label="t('favorite.copy1')" :value="Number(totalFavorites) || 0" />
        <BaseStat :label="t('favorite.copy2')" :value="Number(reviewedCount) || 0" :denominator="totalFavorites" />
        <BaseStat :label="t('favorite.copy3')" :value="Number(needReviewCount) || 0" :denominator="totalFavorites" />
        <BaseStat :label="t('favorite.copy4')" :value="Number(withNoteCount) || 0" :denominator="totalFavorites" />
      </view>

      <!-- 收藏夹列表 -->
      <view v-if="totalFavorites || folders.some((folder) => !folder.isDefault)" class="folder-section">
        <view class="section-header">
          <text class="section-title">{{ t('favorite.copy5') }}</text>
          <BaseButton class="nav-action" icon="plus" variant="secondary" @tap="openFolderModal()">{{
            t('favorite.copy6')
          }}</BaseButton>
        </view>
        <view class="folder-grid">
          <!-- 全部收藏 -->
          <BaseChip :model-value="currentFolderId === null" @update:model-value="selectFolder(null)"
            ><BaseIcon name="books" class="folder-icon" /><text class="folder-name">{{ t('favorite.copy7') }}</text
            ><text class="folder-count"> {{ t('favorite.copy8', { v0: totalFavorites }) }}</text></BaseChip
          >
          <view v-for="folder in folders" :key="folder.id" class="folder-choice"
            ><BaseChip
              :model-value="currentFolderId === folder.id"
              @update:model-value="selectFolder(folder.id)"
              @longpress="showFolderActions(folder)"
              ><BaseIcon :name="folder.icon" />{{ builtinFolderText(folder) }} · {{ folder.count }}</BaseChip
            ><BaseButton
              v-if="!folder.isDefault"
              variant="quiet"
              icon="x"
              icon-only
              :label="t('favorite.copy40')"
              @tap="confirmDeleteFolder(folder)"
          /></view>
        </view>
      </view>

      <!-- 收藏题目列表 -->
      <view class="favorites-section">
        <view v-if="totalFavorites" class="section-header">
          <text class="section-title">
            {{ currentFolderName }}
          </text>
          <BaseButton class="sort-btn" variant="secondary" @tap="toggleSort"
            ><BaseIcon name="sort" class="sort-icon" /><text class="sort-text">
              {{ uiText(sortLabel) }}
            </text></BaseButton
          >
        </view>

        <!-- 空状态 -->
        <BaseEmpty
          v-if="!loadError && filteredFavorites.length === 0"
          :title="t('ui.emptyFavorite')"
          mascot-size="medium"
          show-button
          :button-text="t('ui.choosePaper')"
          @action="safeNavigateTo('/pages/practice-sub/question-bank')"
        />

        <!-- 题目列表 (F007: 增量渲染，避免一次性渲染全部DOM) -->
        <view v-for="item in displayedFavorites" :key="item.id" class="favorite-card apple-group-card">
          <view class="card-header">
            <view class="card-tag">
              {{ item.category }}
            </view>
            <view class="card-actions">
              <BaseButton
                variant="quiet"
                icon="folder"
                icon-only
                :label="t('favorite.move')"
                @tap.stop="moveToFolder(item)"
              />
              <BaseButton
                variant="quiet"
                icon="delete"
                icon-only
                :label="t('favorite.remove')"
                @tap.stop="removeFavorite(item)"
              />
            </view>
          </view>

          <text class="question-text">
            {{ item.questionContent || t('tutor.archive.retired') }}
          </text>
          <text v-if="favoriteMaterial(item)" class="material-preview">{{ favoriteMaterial(item) }}</text>

          <view v-if="showOptions[item.id]" class="options-list"
            ><BaseTag tone="apricot">{{ t('favorite.copy12') }}</BaseTag
            ><BaseOptions
              :label="t('favorite.copy13')"
              :options="
                item.options.map((label, value) => ({
                  label,
                  value,
                  state:
                    item.quizOriginal &&
                    typeof item.answer === 'string' &&
                    item.answer.includes('ABCDEFGHIJKLMNOPQRSTUVWXYZ'[value])
                      ? 'pending'
                      : 'default'
                }))
              "
              disabled
          /></view>

          <view v-if="showOptions[item.id] && item.analysis" class="analysis-box">
            <text class="analysis-label">{{ t('favorite.copy14') }}</text>
            <text class="analysis-text">
              {{ item.analysis }}
            </text>
          </view>

          <view class="card-footer">
            <text class="time-text">{{ t('favorite.copy15', { v0: formatDate(item.createdAt) }) }} </text>
            <view class="footer-actions">
              <BaseButton class="action-btn" variant="secondary" @tap="toggleOptions(item.id)">{{
                showOptions[item.id] ? t('favorite.copy16') : t('favorite.copy17')
              }}</BaseButton>
              <BaseButton class="action-btn primary" variant="primary" @tap="practiceQuestion(item)">{{
                t('favorite.copy18')
              }}</BaseButton>
            </view>
          </view>

          <!-- 笔记区域 -->
          <view v-if="item.note" class="note-section">
            <text class="note-label yozi-icon-row"> <BaseIcon name="note" />{{ t('favorite.copy19') }}</text>
            <text class="note-content">
              {{ item.note }}
            </text>
          </view>
          <BaseButton v-else class="add-note" icon="plus" variant="secondary" @tap="openNoteModal(item)"
            ><text class="add-note-text">{{ t('favorite.copy20') }}</text></BaseButton
          >
        </view>
      </view>

      <view class="safe-area" />
    </scroll-view>

    <!-- 新建收藏夹弹窗 -->
    <CustomModal
      :visible="showFolderModal"
      :title="t('favorite.copy21')"
      :is-dark="isDark"
      :show-actions="false"
      close-button
      mask-closable
      @cancel="closeFolderModal"
      ><view class="yozi-page-content"
        ><BaseInput
          v-model="newFolderName"
          :label="t('favorite.copy22')"
          :placeholder="t('favorite.copy23')"
          :maxlength="10"
        /><view class="icon-grid"
          ><BaseChip
            v-for="icon in folderIcons"
            :key="icon"
            :model-value="newFolderIcon === icon"
            :label="icon"
            @update:model-value="newFolderIcon = icon"
            ><BaseIcon :name="icon" /></BaseChip></view
        ><view class="button-row"
          ><BaseButton class="modal-overlay" variant="secondary" @tap="closeFolderModal">{{
            t('favorite.copy24')
          }}</BaseButton
          ><BaseButton class="modal-btn primary" @tap="createFolder">{{ t('favorite.copy25') }}</BaseButton></view
        ></view
      ></CustomModal
    >

    <!-- 移动到收藏夹弹窗 -->
    <CustomModal
      :visible="showMoveModal"
      :title="t('favorite.copy26')"
      :is-dark="isDark"
      :show-actions="false"
      position="bottom"
      transition="slide-up"
      container-class="is-choice-sheet"
      initial-focus-selector=".favorite-move-options [aria-pressed='true']"
      close-button
      mask-closable
      @cancel="closeMove"
    >
      <view class="favorite-move-options" role="group" :aria-label="t('favorite.copy26')">
        <BaseButton variant="quiet" align="start" icon="plus" @tap="openFolderModal">{{
          t('favorite.copy21')
        }}</BaseButton>
        <BaseButton
          v-for="folder in folders"
          :key="folder.id"
          variant="secondary"
          align="start"
          :icon="folder.id === moveFolderId ? 'check' : folder.icon"
          :selected="folder.id === moveFolderId"
          :aria-pressed="folder.id === moveFolderId"
          @tap="moveFolderId = folder.id"
          >{{ builtinFolderText(folder) }}</BaseButton
        >
      </view>
      <BaseButton
        variant="primary"
        block
        :disabled="!moveFolderId || moveFolderId === movingItem?.folderId"
        @tap="confirmMove"
        >{{ t('favorite.confirmMove') }}</BaseButton
      >
    </CustomModal>

    <!-- 笔记编辑弹窗 -->
    <CustomModal
      :visible="showNoteModal"
      :title="t('favorite.copy27')"
      :is-dark="isDark"
      :show-actions="false"
      close-button
      mask-closable
      @cancel="showNoteModal = false"
      ><view class="yozi-page-content"
        ><BaseInput
          v-model="noteContent"
          :label="t('favorite.copy28')"
          multiline
          :placeholder="t('favorite.copy29')"
          :maxlength="500"
        /><view class="button-row"
          ><BaseButton class="modal-overlay" variant="secondary" @tap="showNoteModal = false">{{
            t('favorite.copy24')
          }}</BaseButton
          ><BaseButton class="modal-btn primary" @tap="saveNote">{{ t('favorite.copy30') }}</BaseButton></view
        ></view
      ></CustomModal
    >
  </LearningShell>
  <CustomModal
    :visible="!!actionFolder"
    :title="actionFolder ? builtinFolderText(actionFolder) : ''"
    :show-actions="false"
    close-button
    escape-closable
    @cancel="actionFolder = null"
    ><BaseButton
      variant="secondary"
      @tap="
        renameFolderPrompt(actionFolder);
        actionFolder = null;
      "
      >{{ t('favorite.rename') }}</BaseButton
    ><BaseButton
      variant="secondary"
      danger-secondary
      @tap="
        confirmDeleteFolder(actionFolder);
        actionFolder = null;
      "
      >{{ t('favorite.deleteFolder') }}</BaseButton
    ></CustomModal
  >
  <CustomModal
    v-if="pageDialog"
    :visible="true"
    :title="pageDialog.title"
    :content="pageDialog.content"
    :editable="pageDialog.editable"
    :placeholder-text="pageDialog.placeholderText"
    :confirm-text="pageDialog.confirmText"
    :cancel-text="pageDialog.cancelText"
    :show-cancel="pageDialog.showCancel !== false"
    :type="pageDialog.confirmColor ? 'error' : 'info'"
    escape-closable
    @confirm="settleDialog(true, $event)"
    @cancel="settleDialog(false)"
  />
</template>

<script setup>
import '@/i18n/tutor.js';
import LearningShell from '@/components/business/learning/learning-shell.vue';
import BaseStat from '@/components/base/base-stat/base-stat.vue';
const uiText = (value) => translateRegisteredText('favorite', value);
import '@/pages/favorite/messages.js';
import { publicError, t, translateRegisteredText } from '@/i18n/index.js';
import { useThemeStore } from '@/stores/modules/theme.js';
import BaseTag from '@/components/base/base-tag/base-tag.vue';
import BaseEmpty from '@/components/base/base-empty/base-empty.vue';
import BaseInput from '@/components/base/base-input/base-input.vue';
import BaseOptions from '@/components/base/base-options/base-options.vue';
import BaseChip from '@/components/base/base-chip/base-chip.vue';
import BaseButton from '@/components/base/base-button/base-button.vue';
import CustomModal from '@/components/common/CustomModal.vue';
import '@/styles/yozi-pages.scss';

import { ref, reactive, computed } from 'vue';
import { onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import { usePageDialog } from '@/composables/usePageDialog.js';
const { pageDialog, settleDialog, modal } = usePageDialog();
import { toast } from '@/utils/toast.js';
import { getUserId, captureSession, checkSession, readSessionSnapshot } from '@/services/auth-storage.js';
import { safeNavigateTo, safeNavigateBack } from '@/utils/safe-navigate';
import { useFavoriteStore } from '@/stores/modules/favorite.js';
import { getStatusBarHeight } from '@/utils/core/system.js';
import BaseIcon from '@/components/base/base-icon/base-icon.vue';
import { quizOriginalReading } from '../../../laf-backend/functions/_shared/learning-quiz-original.js';

// 收藏使用当前账户的本机原件，不从云端猜测缺失资料。
const favoriteStore = useFavoriteStore();

// ── 响应式状态 ──
const isRefreshing = ref(false);
const statusBarHeight = ref(44);
const isDark = computed(() => useThemeStore().isDark);
const loadError = ref('');
const initialSession = captureSession();
const viewOwner = ref(initialSession?.owner === 'guest' ? '' : initialSession?.owner || '');
const isLoading = ref(true); // ✅ F018: 加载状态

// 收藏夹
const folders = ref([]);
const currentFolderId = ref(null);

// 收藏列表
const favorites = ref([]);
const showOptions = reactive({});

// 排序
const sortBy = ref('createdAt');
const sortOrder = ref('desc');

// 弹窗状态
const showFolderModal = ref(false);
const actionFolder = ref(null);
const showMoveModal = ref(false);
const showNoteModal = ref(false);

// 新建收藏夹
const newFolderName = ref('');
const newFolderIcon = ref('folder');
const folderIcons = ['folder', 'star', 'flame', 'bulb', 'books', 'target', 'muscle', 'trophy', 'note', 'bookmark'];

// 移动操作
const movingItem = ref(null);
const moveFolderId = ref('');

// 笔记编辑
const editingItem = ref(null);
const noteContent = ref('');

// 统计数据
const stats = ref({
  totalCount: 0,
  reviewedCount: 0,
  needReviewCount: 0,
  withNoteCount: 0
});

// F007: 增量渲染 — 每次显示20条，滚动到底部加载更多
const displayCount = ref(20);

// 主题切换回调引用（非响应式，仅用于事件解绑）
let _themeHandler = null;

// ── 计算属性 ──

function builtinFolderText(folder) {
  const names = { default: '默认收藏', important: '重点题目', review: '待复习', difficult: '难题攻克' };
  const keys = { default: 'defaultFolder', important: 'important', review: 'review', difficult: 'difficult' };
  return names[folder.id] === folder.name ? t('favorite.' + keys[folder.id]) : folder.name;
}

/** 当前选中收藏夹的名称 */
const currentFolderName = computed(() => {
  if (!currentFolderId.value) return t('favorite.copy7');
  const folder = folders.value.find((f) => f.id === currentFolderId.value);
  return folder ? builtinFolderText(folder) : t('favorite.copy7');
});

/** 按收藏夹 + 排序条件过滤后的收藏列表 */
const filteredFavorites = computed(() => {
  let result = [...favorites.value];

  if (currentFolderId.value) {
    result = result.filter((f) => f.folderId === currentFolderId.value);
  }

  result.sort((a, b) => {
    const aVal = a[sortBy.value] || 0;
    const bVal = b[sortBy.value] || 0;
    return sortOrder.value === 'desc' ? bVal - aVal : aVal - bVal;
  });

  return result;
});

/** F007: 增量渲染 — 只渲染前 displayCount 条到 DOM */
const displayedFavorites = computed(() => {
  return filteredFavorites.value.slice(0, displayCount.value);
});

/** 排序按钮文案 */
const sortLabel = computed(() => {
  if (sortBy.value === 'createdAt') {
    return sortOrder.value === 'desc' ? t('favorite.copy31') : t('favorite.copy32');
  }
  return t('favorite.copy33');
});

/** 总收藏数 */
const totalFavorites = computed(() => {
  return stats.value.totalCount || favorites.value.length;
});

/** 已复习数 */
const reviewedCount = computed(() => {
  return stats.value.reviewedCount || 0;
});

/** 待复习数 */
const needReviewCount = computed(() => {
  return stats.value.needReviewCount || 0;
});

/** 有笔记数 */
const withNoteCount = computed(() => {
  return stats.value.withNoteCount || 0;
});

// ── 方法 ──

/** 下拉刷新 */
async function onPullRefresh() {
  isRefreshing.value = true;
  try {
    loadData();
  } catch (_e) {
    /* 静默处理 */
  }
  isRefreshing.value = false;
}

/** 初始化系统 UI 信息 */
function initSystemUI() {
  statusBarHeight.value = getStatusBarHeight();
}

/** 加载当前账户已保存的收藏。 */
async function loadData() {
  const session = captureSession();
  if (!session) {
    loadError.value = '登录状态暂不可读，请重试';
    isLoading.value = false;
    return;
  }
  const expected = session.owner === 'guest' ? '' : session.owner;
  if (viewOwner.value !== expected) {
    favorites.value = [];
    folders.value = [];
    stats.value = { totalCount: 0 };
    currentFolderId.value = null;
    editingItem.value = null;
    showNoteModal.value = false;
    closeMove();
    showFolderModal.value = false;
    for (const key of Object.keys(showOptions)) delete showOptions[key];
  }
  viewOwner.value = expected;
  try {
    await favoriteStore.loadFavorites();
    if (checkSession(session) === 'changed') return;
    if (favoriteStore.lastError) throw favoriteStore.lastError;
    favoriteStore.loadFolders();
    favoriteStore.loadStats();
    favorites.value = favoriteStore.favorites;
    folders.value = favoriteStore.folders;
    stats.value = favoriteStore.stats;
    loadError.value = '';
  } catch (_error) {
    if (_error.code === 'SESSION_UNAVAILABLE' || checkSession(session) === 'unavailable') {
      loadError.value = '登录状态暂不可读，请重试';
      return;
    }
    if (checkSession(session) === 'changed') return;
    favorites.value = [];
    folders.value = [];
    stats.value = { totalCount: 0 };
    loadError.value = t('favorite.unavailable');
  } finally {
    if (checkSession(session) !== 'changed') isLoading.value = false;
  }
}

function owned(expected) {
  if (readSessionSnapshot().status === 'unavailable') {
    toast.info('登录状态暂不可读，请重试');
    return false;
  }
  if (expected !== (getUserId() || '')) {
    toast.info(t('favorite.copy34'));
    loadData();
    return false;
  }
  return true;
}

/** 返回上一页 */
function goBack() {
  safeNavigateBack();
}

/** 选择收藏夹 */
function selectFolder(folderId) {
  currentFolderId.value = folderId;
  displayCount.value = 20; // F007: 切换收藏夹时重置增量渲染计数
}

/** 切换排序方向 */
function toggleSort() {
  if (sortOrder.value === 'desc') {
    sortOrder.value = 'asc';
  } else {
    sortOrder.value = 'desc';
  }
  displayCount.value = 20; // F007: 切换排序时重置增量渲染计数
}

/** F007: 滚动到底部时加载更多收藏 */
function loadMoreFavorites() {
  if (displayCount.value < filteredFavorites.value.length) {
    displayCount.value = Math.min(displayCount.value + 20, filteredFavorites.value.length);
  }
}

/** 切换答案/选项显示 */
function toggleOptions(itemId) {
  // Vue 3 reactive 可直接动态添加属性
  showOptions[itemId] = !showOptions[itemId];
}

function favoriteMaterial(item) {
  const text = quizOriginalReading(item).readings[0]?.text || '';
  return text.length > 180 ? text.slice(0, 180) + '…' : text;
}

/** 格式化时间戳为 "X月X日" */
function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return t('favorite.copy35', { v0: month, v1: day });
}

/** 显示收藏夹操作菜单（长按触发） */
function showFolderActions(folder) {
  if (folder.isDefault) {
    toast.info(t('favorite.copy36'));
    return;
  }
  actionFolder.value = folder;
}

/** 重命名收藏夹 */
function renameFolderPrompt(folder) {
  const session = captureSession();
  modal.show({
    title: t('favorite.copy37'),
    editable: true,
    placeholderText: folder.name,
    success: (res) => {
      if (res.confirm && res.content && res.content.trim()) {
        if (checkSession(session) !== 'current' || !owned(folder.favoriteOwnerId)) return;
        const result = favoriteStore.renameFolder(folder.id, res.content.trim(), session);
        if (result.success) {
          toast.success(t('favorite.copy38'));
          loadData();
        } else toast.info(result.error || t('favorite.copy39'));
      }
    }
  });
}

/** 确认删除收藏夹 */
function confirmDeleteFolder(folder) {
  const session = captureSession();
  modal.show({
    title: t('favorite.copy40'),
    content: t('favorite.copy41', { v0: folder.name }),
    success: (res) => {
      if (res.confirm) {
        if (checkSession(session) !== 'current' || !owned(folder.favoriteOwnerId)) return;
        const result = favoriteStore.deleteFolder(folder.id, session);
        if (result.success) {
          toast.success(t('favorite.copy42'));
          loadData();
        } else {
          toast.info(result.error || t('favorite.copy43'));
        }
      }
    }
  });
}

let folderSession = null;
function openFolderModal() {
  folderSession = captureSession();
  if (!owned(viewOwner.value)) return;
  showMoveModal.value = false;
  showFolderModal.value = true;
}

function closeFolderModal() {
  showFolderModal.value = false;
  if (movingItem.value) showMoveModal.value = true;
}

/** 创建收藏夹 */
function createFolder() {
  if (!newFolderName.value.trim()) {
    toast.info(t('favorite.copy44'));
    return;
  }

  if (!owned(viewOwner.value)) return;
  const result = favoriteStore.createFolder(
    {
      name: newFolderName.value.trim(),
      icon: newFolderIcon.value
    },
    folderSession
  );

  if (result.success) {
    toast.success(t('favorite.copy45'));
    if (movingItem.value) moveFolderId.value = result.folder.id;
    closeFolderModal();
    newFolderName.value = '';
    newFolderIcon.value = 'folder';
    loadData();
  } else {
    toast.info(result.error || t('favorite.copy46'));
  }
}

/** 移动到收藏夹（打开弹窗） */
function moveToFolder(item) {
  movingItem.value = { ...item, favoriteSession: captureSession() };
  moveFolderId.value = item.folderId;
  showMoveModal.value = true;
}

function closeMove() {
  showMoveModal.value = false;
  movingItem.value = null;
  moveFolderId.value = '';
}

/** 确认移动到指定收藏夹 */
function confirmMove() {
  const folderId = moveFolderId.value;
  if (!movingItem.value || !folderId || folderId === movingItem.value.folderId) return;

  if (!owned(movingItem.value.favoriteOwnerId)) return;
  const result = favoriteStore.moveToFolder(movingItem.value.id, folderId, movingItem.value.favoriteSession);

  if (result.success) {
    toast.success(t('favorite.copy47'));
    closeMove();
    loadData();
  } else {
    toast.info(result.error || t('favorite.copy48'));
  }
}

/** 删除收藏 */
function removeFavorite(item) {
  const session = captureSession();
  modal.show({
    title: t('favorite.copy49'),
    content: t('favorite.copy50'),
    success: async (res) => {
      if (res.confirm) {
        if (checkSession(session) !== 'current' || !owned(item.favoriteOwnerId)) return;
        const result = await favoriteStore.removeFromFavorite(item.id, session);
        if (checkSession(session) !== 'current' || !owned(item.favoriteOwnerId)) return;
        if (result.success) {
          toast.success(t('favorite.copy51'));
          loadData();
        } else {
          toast.info(publicError(result) || t('favorite.copy52'));
        }
      }
    }
  });
}

/** 打开笔记编辑弹窗 */
function openNoteModal(item) {
  editingItem.value = { ...item, favoriteSession: captureSession() };
  noteContent.value = item.note || '';
  showNoteModal.value = true;
}

/** 保存笔记 */
function saveNote() {
  if (!editingItem.value) return;

  if (!owned(editingItem.value.favoriteOwnerId)) return;
  const result = favoriteStore.updateNote(
    editingItem.value.id,
    noteContent.value.trim(),
    editingItem.value.favoriteSession
  );

  if (result.success) {
    toast.success(t('favorite.copy53'));
    showNoteModal.value = false;
    editingItem.value = null;
    noteContent.value = '';
    loadData();
  } else {
    toast.info(t('favorite.copy39'));
  }
}

/** 练习题目（跳转答题页） */
function practiceQuestion(item) {
  if (!owned(item.favoriteOwnerId)) return;
  const result = favoriteStore.startPractice(item.id, item.favoriteOwnerId, {
    referenceViewed: showOptions[item.id] === true
  });
  if (!result.success) {
    toast.info(result.error || t('favorite.copy54'));
    return;
  }
  if (!owned(result.ownerId)) return;
  safeNavigateTo(`/pages/practice-sub/do-quiz?mode=single&singleId=${encodeURIComponent(result.handoffId)}`);
}

// ── 生命周期 ──

onLoad(() => {
  initSystemUI();
  loadData();

  void 0;

  // ✅ F024: 监听主题实时切换
  _themeHandler = (_mode) => {
    void 0;
  };
  uni.$on('themeUpdate', _themeHandler);
});

onShow(() => {
  loadData();
});

onUnload(() => {
  uni.$off('themeUpdate', _themeHandler);
});
</script>

<style scoped>
.favorite-move-options {
  display: grid;
  gap: var(--s-2);
}
</style>
