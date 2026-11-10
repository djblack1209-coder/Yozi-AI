<template>
  <view
    ref="root"
    class="learning-space muse-space workspace-shell"
    :class="{
      'space-dark': theme.isDark,
      'space-light': !theme.isDark,
      'reduce-motion': reducedMotion,
      'has-directory': menuOpen && !searchOnOpen,
      'has-side-panel':
        (sidePanel && viewportWidth > 760) || ((menuOpen || menuLeaving || panelOpening) && !searchOnOpen),
      'has-search': paletteVisible && (menuOpen || menuLeaving),
      'has-conversation': Boolean(learning.active),
      'is-workspace': layout === 'workspace',
      'is-resizing': panelResizing || panelOpening,
      'is-chat': active === 'learning',
      'workspace-wide': desktopShell,
      'quiet-workspace': quietDesktop,
      'composer-centered': quietDesktop && centerComposer,
      'workspace-collapsed': desktopShell && !sidebarExpanded,
      'workspace-context-open': canShowContext && contextOpen && !$slots.reader,
      'desktop-conversation': desktopConversation,
      'desktop-directory': desktopShell && !paletteVisible && (menuOpen || menuLeaving),
      'is-library': ['archive', 'plan', 'phrases', 'ideas', 'materials', 'usage'].includes(active),
      'is-settings': active === 'settings' || active === 'profile',
      'is-desktop-settings': nativeSettings,
      'has-notice': !!notice,
      'has-composer': !!$slots.composer,
      'has-artifact': !!artifactTarget || !!$slots.reader
    }"
    :style="[platformInsets, dockStyle, { '--muse-panel-width': `${panelWidth}px` }]"
  >
    <!-- #ifdef APP-PLUS -->
    <view
      v-if="hasNativeWebView"
      hidden
      :directory-open="menuOpen"
      :change:directory-open="directoryView.onDirectoryChange"
    />
    <!-- #endif -->
    <view class="native-titlebar" data-tauri-drag-region aria-hidden="true" />
    <MuseLaunch :scope="learning" :ready="['ready', 'error'].includes(learning.recordReadState)" />
    <view class="space-frame">
      <button
        v-if="(menuOpen || menuLeaving) && directoryModal"
        class="sidebar-scrim"
        :class="{ 'is-closing': menuLeaving, 'is-search': paletteVisible }"
        tabindex="-1"
        :disabled="menuLeaving"
        :aria-label="t('learning.kh3')"
        @tap="closeMenu"
      ></button>
      <view
        id="workspace-navigation"
        class="muse-rail"
        role="navigation"
        :aria-label="t('nav.learningViews')"
        :inert="(menuOpen && directoryModal) || undefined"
        :aria-hidden="(searchOnOpen && menuOpen) || undefined"
      >
        <view v-if="desktopShell" class="workspace-side-head">
          <image :src="BRAND.mark" class="workspace-brand-mark" mode="aspectFit" />
          <text class="workspace-brand-name">{{ BRAND.name }}</text>
          <BaseButton
            ref="sidebarToggle"
            class="workspace-collapse"
            variant="quiet"
            :icon="sidebarExpanded ? 'chevron-left' : 'menu'"
            icon-only
            :label="t(sidebarExpanded ? 'learning.sidebar.collapse' : 'learning.sidebar.expand')"
            :aria-expanded="sidebarExpanded"
            @tap="toggleMenu"
          />
        </view>
        <view class="rail-body">
          <BaseButton
            v-if="desktopShell"
            class="rail-item workspace-new-chat"
            variant="quiet"
            :label="t('learning.k8t')"
            :disabled="learning.busy || learning.intakeBusy"
            @tap="newSession"
          >
            <view class="rail-item-surface"><BaseIcon name="plus" size="18px" /></view>
            <text class="rail-item-tip" aria-hidden="true">{{ t('learning.k8t') }}</text>
          </BaseButton>
          <view class="rail-group">
            <BaseButton
              v-for="(item, index) in navigation"
              :key="item.id"
              class="rail-item rail-reveal"
              :style="{ '--reveal-index': index }"
              :class="{ 'is-current': railActive(item.id) }"
              variant="quiet"
              :label="item.label"
              :aria-current="railActive(item.id) ? 'page' : undefined"
              :aria-keyshortcuts="item.id === 'search' ? 'Meta+K Control+K' : undefined"
              @tap="openView(item.id, $event)"
            >
              <view class="rail-item-surface"><BaseIcon :name="item.icon" size="20px" /></view>
              <text class="rail-item-tip" aria-hidden="true">{{
                item.id === 'search' ? t('muse.nav.search') : desktopShell ? item.label : item.shortLabel || item.label
              }}</text>
            </BaseButton>
          </view>
          <BaseButton
            class="rail-item rail-usage"
            :class="{ 'is-current': active === 'usage', 'narrow-guest-hidden': !loggedIn }"
            variant="quiet"
            :label="t('muse.usage')"
            :aria-current="active === 'usage' ? 'page' : undefined"
            @tap="openView('usage')"
          >
            <view class="rail-item-surface"><BaseIcon name="chart" size="20px" /></view>
            <text class="rail-item-tip" aria-hidden="true">{{
              t(desktopShell ? 'muse.usage' : 'muse.nav.usage')
            }}</text>
          </BaseButton>
          <BaseButton
            v-if="!desktopShell && !loggedIn"
            class="rail-item rail-login"
            variant="quiet"
            :label="t('learning.sidebar.signIn')"
            @tap="safeNavigateTo('/pages/login/index')"
          >
            <view class="rail-item-surface"><BaseIcon name="user" size="20px" /></view>
            <text class="rail-item-tip" aria-hidden="true">{{ t('learning.sidebar.signInShort') }}</text>
          </BaseButton>
          <BaseButton
            v-if="!desktopShell"
            class="rail-item rail-settings"
            :class="{ 'is-current': active === 'settings' || active === 'profile' }"
            variant="quiet"
            :label="t('nav.settings')"
            :aria-current="active === 'settings' || active === 'profile' ? 'page' : undefined"
            @tap="openView('settings')"
          >
            <view class="rail-item-surface"><BaseIcon name="settings" size="20px" /></view>
            <text class="rail-item-tip" aria-hidden="true">{{ t('nav.settings') }}</text>
          </BaseButton>
        </view>
      </view>
      <view
        v-if="menuOpen || menuLeaving"
        id="learning-directory"
        class="space-sidebar"
        :class="{ 'sidebar-open': menuOpen, 'sidebar-leaving': menuLeaving, 'search-palette': paletteVisible }"
        :inert="menuLeaving || undefined"
        :role="directoryModal ? 'dialog' : 'complementary'"
        :aria-modal="directoryModal || undefined"
        :aria-label="t(searchOnOpen ? 'learning.ki6' : 'learning.openDirectory')"
      >
        <view class="directory-clip"
          ><view class="directory-surface">
            <view v-if="desktopShell && !paletteVisible" class="desktop-directory-header">
              <BaseButton
                class="workspace-history-toggle"
                variant="quiet"
                align="start"
                :aria-expanded="historyExpanded"
                aria-controls="learning-directory-list"
                @tap="toggleHistory"
              >
                <BaseIcon name="chevron-down" size="14px" />
                <text>{{ t('learning.sidebar.recent') }}</text>
              </BaseButton>
              <BaseButton
                ref="closeButton"
                class="sidebar-options"
                icon-only
                icon="ellipsis"
                label="会话选项"
                variant="quiet"
                aria-haspopup="menu"
                :aria-expanded="directoryOptions"
                @tap="directoryOptions = !directoryOptions"
              />
            </view>
            <view v-show="paletteVisible || !desktopShell || directoryFilterOpen" class="directory-top">
              <view class="directory-search"
                ><BaseIcon name="search" :size="searchOnOpen ? '18px' : '16px'" tone="ink-3" />
                <BaseInput
                  ref="searchInput"
                  v-model="query"
                  input-class="search-input"
                  hide-label
                  focus-visible-only
                  :placeholder="t(paletteVisible ? 'learning.ki6' : 'muse.searchChats')"
                  maxlength="120"
                  :label="t('learning.ki6')"
              /></view>
              <BaseButton
                v-if="directoryModal || paletteVisible"
                class="sidebar-close"
                icon-only
                icon="close"
                :label="t('learning.closeDirectory')"
                variant="quiet"
                @tap="closeMenu"
              />
              <BaseButton
                v-if="!paletteVisible && !desktopShell"
                ref="closeButton"
                class="sidebar-options"
                icon-only
                icon="ellipsis"
                label="会话选项"
                variant="quiet"
                aria-haspopup="menu"
                :aria-expanded="directoryOptions"
                @tap="directoryOptions = !directoryOptions"
              />
            </view>
            <view
              v-if="directoryOptions && !searchOnOpen"
              class="directory-options-menu"
              role="group"
              aria-label="会话选项"
            >
              <BaseButton
                v-if="!directoryModal"
                variant="quiet"
                align="start"
                :selected="panelPinned"
                :aria-pressed="panelPinned"
                @tap="panelPinned = !panelPinned"
                ><BaseIcon :name="panelPinned ? 'checkbox-on' : 'checkbox-off'" size="16px" />固定会话列表</BaseButton
              >
              <BaseButton v-if="desktopShell" variant="quiet" align="start" icon="search" @tap="toggleDirectoryFilter">
                {{ t('muse.searchChats') }}
              </BaseButton>
              <BaseButton v-else variant="quiet" align="start" icon="plus" :disabled="learning.busy" @tap="newSession"
                >新建会话</BaseButton
              >
              <BaseButton variant="quiet" align="start" icon="chevron-left" @tap="closeMenu">收起会话列表</BaseButton>
            </view>
            <BaseButton
              v-if="!desktopConversation && !searchOnOpen && recent.length"
              class="new-session"
              variant="quiet"
              icon="plus"
              align="start"
              :disabled="learning.busy"
              @tap="newSession"
              >{{ t('learning.k8t') }}</BaseButton
            >
            <view
              v-show="paletteVisible || !desktopShell || historyExpanded"
              id="learning-directory-list"
              class="directory-scroll"
            >
              <view v-if="learning.recordReadState === 'error'" class="recent-list" role="status">
                <text class="sidebar-caption">{{ recordReadMessage }}</text>
              </view>
              <view
                v-else-if="learning.recordReadState !== 'ready' || queryPending"
                class="muse-list-skeleton"
                role="status"
                :aria-label="t('learning.records.loading')"
              >
                <view v-for="line in 3" :key="line" class="muse-list-skeleton__row" aria-hidden="true">
                  <view class="muse-list-skeleton__icon" /><view class="muse-list-skeleton__line" />
                </view>
              </view>
              <view v-else-if="recordSearch" class="recent-list" :aria-label="t('learning.records.results')">
                <text class="sidebar-caption" role="status">{{
                  t('learning.records.count', { count: recordSearch.total })
                }}</text>
                <TransitionGroup name="record-search-result">
                  <BaseButton
                    v-for="record in recordSearch.items"
                    :key="record.id"
                    class="recent-item"
                    align="start"
                    variant="quiet"
                    :disabled="learning.busy"
                    :aria-disabled="learning.busy"
                    @tap="openRecord(record.id, recordSearch.context)"
                  >
                    <BaseIcon :name="record.kind === 'conversation' ? 'chat' : 'book-open'" tone="ink-3" />
                    <view class="material-copy">
                      <text class="sidebar-label">{{ record.label }}</text>
                      <text class="sidebar-caption record-meta" :title="record.goal"
                        >{{ record.day }} · {{ record.goal }}</text
                      >
                    </view>
                  </BaseButton>
                </TransitionGroup>
                <BaseEmpty
                  v-if="!recordSearch.total"
                  :title="t('learning.records.empty')"
                  show-button
                  :button-text="t('learning.records.clear')"
                  @action="query = ''"
                />
                <BaseButton v-if="recordPage" variant="quiet" @tap="recordPage--">{{
                  t('learning.records.previous')
                }}</BaseButton>
                <BaseButton v-if="recordSearch.hasMore" variant="quiet" @tap="recordPage++">{{
                  t('learning.records.next')
                }}</BaseButton>
              </view>
              <view v-else-if="!recent.length && !searchOnOpen && !desktopShell" class="directory-empty"
                ><BaseButton variant="quiet" :disabled="learning.busy" @tap="newSession">新建会话</BaseButton></view
              >
              <view v-else class="recent-list" :aria-label="t('learning.k5p')">
                <view v-for="conversation in recent" :key="conversation.id" class="recent-conversation">
                  <BaseButton
                    class="recent-item"
                    align="start"
                    :selected="learning.selectedConversationId === conversation.id"
                    :class="{ current: learning.selectedConversationId === conversation.id }"
                    :disabled="learning.busy"
                    :aria-disabled="learning.busy"
                    :aria-label="`${conversation.goal}，${new Date(conversation.at).toLocaleDateString()}`"
                    :aria-current="learning.selectedConversationId === conversation.id ? 'true' : undefined"
                    variant="quiet"
                    @tap="resume(conversation.id)"
                  >
                    <view v-if="desktopConversation && !searchOnOpen" class="desktop-thread-summary">
                      <view class="desktop-thread-title">
                        <text class="sidebar-label">{{ conversation.goal }}</text>
                        <text class="thread-time">{{
                          new Date(conversation.messages.at(-1)?.at || conversation.at).toLocaleDateString(
                            currentLanguage,
                            { month: 'numeric', day: 'numeric' }
                          )
                        }}</text>
                      </view>
                    </view>
                    <template v-else>
                      <text class="sidebar-label">{{ conversation.goal }}</text>
                      <text class="thread-time">{{ new Date(conversation.at).toLocaleDateString() }}</text>
                    </template>
                  </BaseButton>
                  <view
                    v-if="!searchOnOpen && learning.selectedConversationId === conversation.id"
                    class="conversation-directory"
                  >
                    <view v-for="chapter in directoryDays" :key="chapter.day" class="directory-day">
                      <BaseButton
                        v-if="learning.timeline.length > 1"
                        class="directory-day-link"
                        variant="quiet"
                        icon="calendar"
                        icon-only
                        :label="`查看原对话 · ${chapter.day}`"
                        :disabled="learning.busy"
                        @tap="locate(conversation.id, chapter.day)"
                      />
                      <BaseButton
                        v-for="group in chapter.groups"
                        :key="group.id"
                        class="directory-module"
                        align="start"
                        :disabled="learning.busy"
                        :aria-disabled="learning.busy"
                        :aria-label="t('learning.kv1', { v0: chapter.day, v1: learningText(group.label) })"
                        variant="quiet"
                        @tap="locate(conversation.id, chapter.day, group.id)"
                      >
                        <text>{{ learningText(group.label) }}</text>
                        <BaseIcon name="arrow-right" tone="ink-3" />
                      </BaseButton>
                    </view>
                    <BaseButton
                      v-if="learning.timeline.length > directoryDayLimit"
                      class="directory-earlier"
                      align="start"
                      :disabled="learning.busy"
                      :aria-disabled="learning.busy"
                      data-test="earlier-learning-days"
                      variant="quiet"
                      @tap="directoryDayLimit += 7"
                      >{{ t('learning.kjp') }}</BaseButton
                    >
                  </view>
                </view>
              </view>
            </view>
          </view></view
        >
      </view>
      <view
        v-if="desktopShell"
        class="workspace-account"
        role="group"
        :aria-label="t('muse.account')"
        :inert="(menuOpen && directoryModal) || undefined"
      >
        <BaseButton
          class="workspace-account-primary"
          :class="{ 'rail-login': !loggedIn }"
          variant="quiet"
          align="start"
          icon="user"
          :label="t(loggedIn ? 'muse.account' : 'learning.sidebar.signIn')"
          @tap="loggedIn ? openView('profile') : safeNavigateTo('/pages/login/index')"
        >
          <text class="workspace-account-label">{{ t(loggedIn ? 'muse.account' : 'learning.sidebar.signIn') }}</text>
        </BaseButton>
        <BaseButton
          class="workspace-account-settings rail-settings"
          variant="quiet"
          icon="settings"
          icon-only
          :label="t('nav.settings')"
          :aria-current="active === 'settings' || active === 'profile' ? 'page' : undefined"
          @tap="openView('settings')"
        />
      </view>
      <!-- #ifdef H5 -->
      <component
        :is="'div'"
        v-if="desktopShell && sidebarExpanded && !paletteVisible"
        class="directory-resize"
        role="separator"
        tabindex="0"
        aria-orientation="vertical"
        :aria-label="t('muse.resize')"
        aria-controls="workspace-navigation"
        :aria-valuemin="SIDEBAR_MIN"
        :aria-valuemax="SIDEBAR_MAX"
        :aria-valuenow="panelWidth"
        @pointerdown="startPanelResize"
        @keydown="resizePanelKey"
        @dblclick="resetPanelWidth"
      />
      <component
        :is="'div'"
        v-if="desktopShell && active === 'learning' && !menuOpen && !menuLeaving"
        class="directory-edge"
        role="separator"
        tabindex="0"
        aria-orientation="vertical"
        :aria-label="t('learning.openDirectory')"
        @pointerdown="startPanelOpen"
        @keydown="openPanelKey"
      />
      <view
        v-if="panelReveal > 0"
        class="directory-edge-preview"
        :style="{ width: `${panelReveal}px` }"
        aria-hidden="true"
      />
      <!-- #endif -->
      <view
        class="space-main"
        role="main"
        :inert="(menuOpen && directoryModal) || undefined"
        :aria-hidden="(searchOnOpen && (menuOpen || menuLeaving)) || undefined"
      >
        <view
          v-if="layout !== 'workspace' && (!desktopShell || !centerComposer || learning.active)"
          class="space-header"
          role="banner"
        >
          <view class="space-heading">
            <BaseButton
              v-if="active === 'learning' && !desktopShell && !menuOpen"
              ref="menuButton"
              class="mobile-menu directory-pill"
              icon="menu"
              :label="t('learning.openDirectory')"
              :aria-expanded="menuOpen"
              aria-controls="learning-directory"
              variant="quiet"
              @tap="toggleMenu"
              >{{ t('muse.chats') }}</BaseButton
            >
            <text v-if="active !== 'learning'" class="space-title">{{ title }}</text>
          </view>
          <text
            v-if="active === 'learning' && quietDesktop"
            class="workspace-thread-title"
            role="heading"
            aria-level="1"
          >
            {{ learning.active?.goal || t('learning.k8t') }}
          </text>
          <view v-else-if="active === 'learning'" class="muse-chat-identity"
            ><AnimatedAvatar
              class="brand-mark"
              :size="desktopConversation || viewportWidth <= 760 ? 32 : 56"
              autoplay
              perceptible
              :business="avatarBusiness"
              @state="avatarPresentation = $event"
            />
            <view class="brand-label"
              ><text class="brand-name" :title="BRAND.name">{{ BRAND.name }}</text>
              <text v-if="identityStatus" class="brand-status" role="status" :title="identityStatus">{{
                identityStatus
              }}</text></view
            ></view
          >
          <BaseButton
            v-if="compactHeader && learning.recordReadState === 'ready'"
            ref="headerActionsButton"
            class="header-actions-toggle"
            variant="quiet"
            icon="ellipsis"
            icon-only
            :label="t('muse.headerActions')"
            :aria-expanded="headerActionsOpen"
            aria-controls="learning-header-actions"
            @tap="toggleHeaderActions"
          />
          <view
            v-if="
              learning.recordReadState === 'ready' &&
              (!quietDesktop || canShowContext || (active !== 'learning' && $slots.controls))
            "
            v-show="!compactHeader || headerActionsOpen"
            id="learning-header-actions"
            class="space-header-actions"
            :class="{ 'is-compact': compactHeader }"
            role="group"
            :aria-label="t('muse.headerActions')"
            @tap="closeHeaderActions(true)"
          >
            <slot v-if="!quietDesktop || active !== 'learning'" name="controls"></slot>
            <BaseButton
              v-if="canShowContext && !$slots.reader"
              class="context-toggle"
              variant="quiet"
              icon="info"
              icon-only
              :label="t('muse.studyContext')"
              :aria-expanded="contextOpen"
              aria-controls="desktop-study-context"
              @tap="contextOpen = !contextOpen"
            />
          </view>
        </view>
        <view class="space-content">
          <slot v-if="learning.recordReadState === 'ready'"></slot>
          <BaseEmpty
            v-else
            :state="learning.recordReadState === 'error' ? 'error' : 'loading'"
            :title="recordReadMessage"
            :show-button="learning.recordReadState === 'error'"
            @action="learning.reloadRecords()"
          />
        </view>
        <view v-if="$slots.composer" class="muse-composer-dock">
          <text v-if="notice" id="learning-request-error" class="shell-notice" role="status">{{
            learningText(notice)
          }}</text>
          <slot name="composer"></slot>
        </view>
      </view>
      <view
        v-if="canShowContext && !$slots.reader"
        id="desktop-study-context"
        class="desktop-study-context"
        role="complementary"
        aria-labelledby="desktop-study-context-title"
        :inert="!contextOpen || (menuOpen && directoryModal) || undefined"
        :aria-hidden="!contextOpen || undefined"
      >
        <text id="desktop-study-context-title" class="study-context-title" role="heading" aria-level="2">{{
          t('muse.studyContext')
        }}</text>
        <view v-if="learning.active" class="study-context-goal">
          <BaseIcon name="target" size="18px" />
          <view>
            <text class="study-context-label">{{ t('tutor.insights.goal') }}</text>
            <text class="study-context-copy">{{ learning.active.goal }}</text>
          </view>
        </view>
        <view class="study-context-links">
          <BaseButton variant="quiet" align="start" @tap="openView('plan')">
            <BaseIcon name="calendar" size="18px" />
            <view>
              <text class="study-context-label">{{ t('tutor.insights.todayPlan') }}</text>
              <text class="study-context-copy">{{
                todayTasks.denominator
                  ? t('muse.studyTasks', { done: todayTasks.numerator, total: todayTasks.denominator })
                  : t('tutor.insights.noPlan')
              }}</text>
            </view>
            <BaseIcon name="chevron-right" size="14px" />
          </BaseButton>
          <BaseButton variant="quiet" align="start" @tap="openView('materials')">
            <BaseIcon name="folder" size="18px" />
            <text class="study-context-label">{{ t('muse.library') }}</text>
            <BaseIcon name="chevron-right" size="14px" />
          </BaseButton>
        </view>
      </view>
      <MuseArtifactPanel
        v-if="artifactTarget"
        v-show="!$slots.reader"
        :key="artifactTarget.id"
        ref="artifactPanel"
        :target="artifactTarget"
        @close="artifacts.target = null"
      />
      <slot name="reader"></slot>
    </view>
    <BaseEmpty v-if="error" class="shell-error" state="error" :title="learningText(error)" />
  </view>
</template>
<script setup>
import { getCurrentRoute } from '@/utils/home-navigation.js';
import '@/i18n/tutor.js';
import '@/i18n/muse.js';
import BaseEmpty from '@/components/base/base-empty/base-empty.vue';
import { learningText } from '@/i18n/learning.js';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseInput from '@/components/base/base-input/base-input.vue';
import MuseLaunch from './muse-launch.vue';
import AnimatedAvatar from '@/components/base/animated-avatar/animated-avatar.vue';
import { avatarBusinessForLearning, avatarStateFor } from '@/design/avatar-state.js';

import { computed, ref, onMounted, onUnmounted, onBeforeUpdate, onUpdated, nextTick, useAttrs, watch } from 'vue';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { useThemeStore } from '@/stores/modules/theme.js';
import { safeNavigateTo, requestProfilePanel } from '@/utils/safe-navigate';
import { getToken } from '@/services/auth-storage.js';
import MuseArtifactPanel from './muse-artifact-panel.vue';
import { artifactWorkspace } from '@/services/learning/learning-artifacts.js';
import { storageService } from '@/services/storageService.js';
import { bindLearningKeyboard } from '@/services/learning/keyboard-controls.js';
import { bindBusinessMotion } from '@/design/business-motion.js';
import { BRAND } from '@/config/brand.js';
import { currentLanguage, publicError, t } from '@/i18n/index.js';
import { bindMessageFollow } from './message-follow.js';
import { isDesktopSettingsWindow } from '@/services/desktop/windows.js';
import { isDesktopRuntime } from '@/services/desktop/runtime.js';
import {
  shellNavigation,
  SHELL_MODULES,
  SHELL_ROUTES,
  SIDEBAR_DEFAULT,
  SIDEBAR_MIN,
  SIDEBAR_MAX,
  readSidebar,
  saveSidebar,
  clampSidebarWidth
} from '@/services/learning/shell-navigation.js';
const props = defineProps({
  dismissOverlay: { type: Function, default: null },
  notice: { type: String, default: '' },
  sidePanel: { type: Boolean, default: false },
  waitingForAnswer: { type: Boolean, default: false },
  centerComposer: Boolean,
  refreshRecordsOnMount: { type: Boolean, default: true },
  active: { type: String, default: 'learning' },
  title: { type: String, default: '' },
  layout: { type: String, default: 'default' }
});
const emit = defineEmits(['materials', 'new', 'connections']);
const learning = useConversationLearningStore();
const artifacts = artifactWorkspace(learning);
const artifactPanel = ref(null);
const shellRoute = getCurrentRoute();
const artifactTarget = computed(() =>
  artifacts.target?.route === shellRoute && artifacts.target?.context === learning.recordContext()
    ? artifacts.target
    : null
);
watch(
  () => learning.recordContext(),
  () => {
    artifacts.target = null;
  }
);
const loggedIn = ref(false);
const syncLogin = () => {
  try {
    loggedIn.value = Boolean(getToken());
  } catch {
    // An unreadable session remains retryable; never break the learning shell.
  }
};
syncLogin();
let releaseIdentity = () => undefined;
// 顶部小猫跟随真实学习事件切换状态；空闲时状态行显示当前目标。
const avatarEvent = ref(null);
const avatarPresentation = ref(null);
const avatarBusiness = computed(() => {
  const value = avatarBusinessForLearning(learning, avatarEvent.value);
  return { ...value, waiting: value.waiting || props.waitingForAnswer };
});
watch(
  () => `${learning.recordContext()}:${learning.selectedConversationId}`,
  () => {
    avatarEvent.value = null;
  },
  { flush: 'sync' }
);
const identityStatus = computed(() => {
  const value = avatarBusiness.value,
    state =
      value.error || value.stopped || value.busy
        ? avatarStateFor(value)
        : avatarPresentation.value?.state || avatarStateFor(value);
  if (!value.stopped && state === 'idle') return learning.active?.goal || '';
  const key = value.stopped
    ? 'stopped'
    : value.busy && ['feedback', 'essay', 'daily', 'summary'].includes(value.activity)
      ? value.activity
      : state;
  return t(`muse.avatar.${key}`);
});
watch(
  () => learning.state?.events?.at(-1)?.id,
  (id, previous) => {
    if (previous && id !== previous) avatarEvent.value = learning.state.events.at(-1);
  }
);
const theme = useThemeStore();
const root = ref(null);
// Resize the reserved input space without covering the last message. This only
// follows composer height changes; message/stream updates keep their own lifecycle.
// #ifdef H5
let composerResizeFrame;
let releaseMessageFollow = () => undefined;
const shellAttrs = useAttrs();
onBeforeUpdate(() => {
  composerResizeFrame = null;
  const element = root.value?.$el || root.value;
  const height = parseFloat(element?.style?.getPropertyValue('--muse-composer-height'));
  const nextHeight = parseFloat(shellAttrs.style?.['--muse-composer-height']);
  // Message-only updates never force a layout read or change the reading position.
  if (!Number.isFinite(height) || !Number.isFinite(nextHeight) || nextHeight === height) return;
  const scroller = element?.querySelector?.('.space-content');
  if (!scroller || !element.querySelector('.muse-composer-dock')) return;
  composerResizeFrame = {
    element,
    scroller,
    height,
    atEnd: scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 48
  };
});
onUpdated(() => {
  const before = composerResizeFrame;
  composerResizeFrame = null;
  if (!before?.atEnd || before.scroller.dataset.followLatest === 'false' || !Number.isFinite(before.height)) return;
  const height = parseFloat(before.element.style.getPropertyValue('--muse-composer-height'));
  if (Number.isFinite(height) && height !== before.height) before.scroller.scrollTop = before.scroller.scrollHeight;
});
// #endif
const menuButton = ref(null);
const closeButton = ref(null);
const searchInput = ref(null);
const nativeSettings = isDesktopSettingsWindow();
const sidebar = readSidebar();
const viewportWidth = ref(
  typeof window !== 'undefined' ? window.innerWidth : uni.getWindowInfo?.().windowWidth || 1024
);
const desktopShell = computed(() => !nativeSettings && viewportWidth.value > 760);
const quietDesktop = computed(() => desktopShell.value || isDesktopRuntime());
const desktopConversation = computed(
  () => props.active === 'learning' && props.layout !== 'workspace' && desktopShell.value
);
const contextOpen = ref(false);
const canShowContext = computed(
  () =>
    desktopConversation.value &&
    Boolean(learning.active) &&
    viewportWidth.value >= 1120 &&
    learning.recordReadState === 'ready' &&
    !artifactTarget.value
);
const todayTasks = computed(() => (learning.journeySummary || learning.todaySummary).tasks);
// #ifdef APP-PLUS
const hasNativeWebView = typeof plus !== 'undefined' && Boolean(plus.webview);
// #endif
const canRestoreDirectory = computed(() => props.active === 'learning' && desktopShell.value);
const sidebarExpanded = ref(!sidebar.collapsed);
const historyExpanded = ref(sidebar.historyExpanded !== false);
const sidebarToggle = ref(null);
const menuOpen = ref(canRestoreDirectory.value && sidebarExpanded.value);
const navigationConfig = shellNavigation();
const navigationSnapshot = ref(navigationConfig.snapshot());
function applyNavigation(value) {
  if (navigationConfig.apply(value)) navigationSnapshot.value = navigationConfig.snapshot();
}
const searchOnOpen = ref(false);
const directoryOptions = ref(false);
const directoryFilterOpen = ref(false);
async function toggleDirectoryFilter() {
  directoryFilterOpen.value = !directoryFilterOpen.value;
  directoryOptions.value = false;
  if (!directoryFilterOpen.value) {
    query.value = '';
    return;
  }
  historyExpanded.value = true;
  await nextTick();
  (searchInput.value?.$el || searchInput.value)?.querySelector?.('input')?.focus?.();
}
const panelPinned = ref(true);
const compactHeader = computed(() => props.active === 'learning' && !quietDesktop.value && viewportWidth.value <= 480);
const headerActionsOpen = ref(false);
const headerActionsButton = ref(null);
let headerActionKeyboard = false;
function closeHeaderActions(restoreFocus = false) {
  if (!headerActionsOpen.value) return;
  headerActionsOpen.value = false;
  // #ifdef H5
  if (restoreFocus) nextTick(() => (headerActionsButton.value?.$el || headerActionsButton.value)?.focus?.());
  // #endif
}
async function toggleHeaderActions() {
  if (headerActionsOpen.value) return closeHeaderActions();
  headerActionsOpen.value = true;
  await nextTick();
  // #ifdef H5
  const element = root.value?.$el || root.value;
  element?.querySelector?.('.space-header-actions [role="button"]:not([disabled])')?.focus?.();
  // #endif
}
function headerActionsFocusOut(event) {
  if (!event.relatedTarget?.closest?.('.space-header-actions, .header-actions-toggle')) closeHeaderActions();
}
function headerActionKey(event) {
  const activation = ['Enter', ' '].includes(event.key);
  if (event.type === 'keydown') {
    headerActionKeyboard =
      activation &&
      headerActionsOpen.value &&
      !!event.target?.closest?.('.space-header-actions') &&
      !event.target.hasAttribute('disabled');
  } else if (activation && headerActionKeyboard) {
    headerActionKeyboard = false;
    closeHeaderActions(true);
  }
}
watch([compactHeader, () => props.active, () => learning.selectedConversationId], () => closeHeaderActions());
const directoryModal = computed(() => paletteVisible.value || !desktopShell.value);
let previousDirectoryFocus = null;
function rememberDirectoryFocus(trigger) {
  // #ifdef H5
  const focused = trigger?.currentTarget || document.activeElement;
  previousDirectoryFocus = focused?.matches?.('button, uni-button, input, textarea, [role="button"]') ? focused : null;
  // #endif
}
function toggleMenu(trigger) {
  if (searchOnOpen.value || (!desktopShell.value && menuOpen.value)) return closeMenu();
  if (!desktopShell.value) {
    rememberDirectoryFocus(trigger);
    menuOpen.value = true;
    return;
  }
  if (sidebarExpanded.value) return closeMenu();
  sidebarExpanded.value = true;
  menuOpen.value = canRestoreDirectory.value;
  persistSidebar();
}
const panelWidth = ref(sidebar.width);
function persistSidebar() {
  if (!desktopShell.value) return;
  const value = {
    version: 1,
    collapsed: !sidebarExpanded.value,
    width: panelWidth.value,
    historyExpanded: historyExpanded.value
  };
  if (saveSidebar(value)) uni.$emit('shellSidebarChanged', value);
}
function applySidebarPreferences(value) {
  sidebarExpanded.value = !value.collapsed;
  historyExpanded.value = value.historyExpanded;
  panelWidth.value = value.width;
  if (desktopShell.value && !searchOnOpen.value) menuOpen.value = canRestoreDirectory.value && sidebarExpanded.value;
}
function toggleHistory() {
  directoryOptions.value = false;
  historyExpanded.value = !historyExpanded.value;
  persistSidebar();
}
function resetPanelWidth() {
  panelWidth.value = SIDEBAR_DEFAULT.width;
  persistSidebar();
}
const panelResizing = ref(false);
const panelOpening = ref(false);
const panelReveal = ref(0);
let releasePanelResize = () => undefined;
let releasePanelOpen = () => undefined;
function openPanelKey(event) {
  if (!['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  sidebarExpanded.value = true;
  menuOpen.value = true;
  persistSidebar();
  nextTick(() => (sidebarToggle.value?.$el || sidebarToggle.value)?.focus?.());
}
function startPanelOpen(event) {
  // #ifdef H5
  if (
    event.button !== 0 ||
    (event.pointerType && event.isPrimary === false) ||
    menuOpen.value ||
    typeof window === 'undefined'
  )
    return;
  event.preventDefault();
  releasePanelOpen();
  const startX = event.clientX,
    startY = event.clientY;
  let moved = false;
  panelOpening.value = true;
  const move = (next) => {
    if (next.pointerId !== event.pointerId) return;
    moved ||= Math.abs(next.clientX - startX) > 2 || Math.abs(next.clientY - startY) > 2;
    panelReveal.value = Math.max(0, Math.min(panelWidth.value, next.clientX - startX));
  };
  const finish = (next) => {
    if (next.pointerId !== event.pointerId) return;
    moved ||= Math.abs(next.clientX - startX) > 2 || Math.abs(next.clientY - startY) > 2;
    const open = !moved || next.clientX - startX > 64;
    releasePanelOpen();
    if (open) {
      sidebarExpanded.value = true;
      menuOpen.value = true;
      persistSidebar();
    }
  };
  const cancel = (next) => {
    if (next.pointerId === event.pointerId) releasePanelOpen();
  };
  const blur = () => releasePanelOpen();
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('blur', blur);
  releasePanelOpen = () => {
    panelOpening.value = false;
    panelReveal.value = 0;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('blur', blur);
  };
  // #endif
}
function resizePanelKey(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    void closeMenu();
    return;
  }
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const step = event.shiftKey ? 64 : 16;
  panelWidth.value =
    event.key === 'Home'
      ? SIDEBAR_MIN
      : event.key === 'End'
        ? SIDEBAR_MAX
        : clampSidebarWidth(panelWidth.value + (event.key === 'ArrowRight' ? step : -step));
  persistSidebar();
}
function startPanelResize(event) {
  // #ifdef H5
  if (event.button !== 0 || typeof window === 'undefined') return;
  event.preventDefault();
  releasePanelResize();
  const startX = event.clientX,
    startWidth = panelWidth.value;
  panelResizing.value = true;
  const move = (next) => {
    if (next.pointerId !== event.pointerId) return;
    panelWidth.value = clampSidebarWidth(startWidth + next.clientX - startX);
  };
  const finish = (next) => {
    if (next.pointerId !== event.pointerId) return;
    releasePanelResize();
    if (panelWidth.value !== startWidth) persistSidebar();
  };
  const cancel = (next) => {
    if (next.pointerId !== event.pointerId) return;
    panelWidth.value = startWidth;
    releasePanelResize();
  };
  const blur = () => {
    panelWidth.value = startWidth;
    releasePanelResize();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('blur', blur);
  releasePanelResize = () => {
    panelResizing.value = false;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('blur', blur);
  };
  // #endif
}
const menuLeaving = ref(false);
const paletteLeaving = ref(false);
const paletteVisible = computed(() => searchOnOpen.value || (menuLeaving.value && paletteLeaving.value));
const reducedMotion = ref(true);
const directoryQuery = ref('');
const paletteQuery = ref('');
const query = computed({
  get: () => (paletteVisible.value ? paletteQuery.value : directoryQuery.value),
  set: (value) => {
    if (paletteVisible.value) paletteQuery.value = value;
    else directoryQuery.value = value;
  }
});
const searchQuery = ref('');
const queryPending = computed(() => query.value !== searchQuery.value);
let searchTimer = null;
const recordPage = ref(0);
const recordReadMessage = computed(() =>
  t(`learning.records.${learning.recordReadState === 'error' ? 'unavailable' : 'loading'}`)
);
const recordSearch = computed(() =>
  learning.recordReadState === 'ready' && !queryPending.value && searchQuery.value.trim()
    ? learning.searchRecords(searchQuery.value, { offset: recordPage.value * 8, limit: 8 })
    : null
);
watch(
  query,
  () => {
    recordPage.value = 0;
  },
  { flush: 'sync' }
);
watch(
  query,
  (value) => {
    clearTimeout(searchTimer);
    if (!value.trim()) searchQuery.value = value;
    else
      searchTimer = setTimeout(() => {
        searchQuery.value = value;
      }, 180);
  },
  { flush: 'sync' }
);
watch(
  () => JSON.stringify([learning.state.owner, learning.recordContext()]),
  () => {
    directoryQuery.value = '';
    paletteQuery.value = '';
  },
  { flush: 'sync' }
);
const directoryDayLimit = ref(7);
const directoryDays = computed(() => learning.timeline.slice(-directoryDayLimit.value));
watch([() => learning.recordContext(), () => learning.selectedConversationId], () => {
  directoryDayLimit.value = 7;
});
const viewportHeight = ref(720);
const visibleHeight = ref(null);
const dockStyle = computed(() => {
  const item = Math.max(44, Math.min(56, Math.floor((Math.max(0, viewportHeight.value - 224) - 80) / 9)));
  return {
    '--dock-item': `${item}px`,
    '--dock-surface': '44px',
    '--dock-glyph': '24px',
    '--muse-visible-height': visibleHeight.value ? `${visibleHeight.value}px` : undefined
  };
});
function updateVisibleHeight() {
  const viewport = window.visualViewport;
  // A software keyboard can shrink only the visible area while the layout viewport stays the same.
  visibleHeight.value = viewport?.scale === 1 ? Math.floor(viewport.height + viewport.offsetTop) : null;
}
function updateDockMetrics(event) {
  const info =
    typeof window !== 'undefined'
      ? { windowHeight: window.innerHeight, windowWidth: window.innerWidth }
      : event?.size || uni.getWindowInfo?.();
  if (info?.windowHeight) viewportHeight.value = info.windowHeight;
  if (info?.windowWidth) viewportWidth.value = info.windowWidth;
}
watch(canRestoreDirectory, (canRestore) => {
  if (!searchOnOpen.value) menuOpen.value = canRestore && sidebarExpanded.value;
});
let releaseViewport = () => undefined;

const platformInsets = ref({});
// #ifdef MP-WEIXIN
try {
  const windowInfo = uni.getWindowInfo();
  const capsule = uni.getMenuButtonBoundingClientRect();
  platformInsets.value = {
    '--space-status-top': `${windowInfo.statusBarHeight || 0}px`,
    '--space-capsule-right': `${windowInfo.windowWidth - capsule.left + 12}px`
  };
} catch (_error) {
  platformInsets.value = { '--space-status-top': '24px', '--space-capsule-right': '100px' };
}
// #endif
const error = ref('');
const navigation = computed(() =>
  navigationSnapshot.value.modules
    .filter((item) => item.visible)
    .map(({ id }) => ({
      id,
      ...SHELL_MODULES[id],
      label: t(SHELL_MODULES[id].label),
      shortLabel: SHELL_MODULES[id].shortLabel ? t(SHELL_MODULES[id].shortLabel) : undefined
    }))
);
function railActive(id) {
  return props.active === id;
}
const recent = computed(() => [...learning.state.conversations].reverse().slice(0, 8));
let unbind = () => undefined;
let releaseMotion = () => undefined;
let menuExitTimer = null;
watch(menuOpen, async (open) => {
  releasePanelResize();
  releasePanelOpen();
  clearTimeout(menuExitTimer);
  menuLeaving.value = !open;
  if (!open) {
    menuExitTimer = setTimeout(
      () => {
        menuLeaving.value = false;
        paletteLeaving.value = false;
      },
      reducedMotion.value ? 0 : paletteLeaving.value ? 180 : desktopShell.value ? 220 : 240
    );
    return;
  }
  if (!directoryModal.value) return;
  await nextTick();
  // #ifdef H5
  if (menuOpen.value) (searchInput.value?.$el || searchInput.value)?.querySelector?.('input')?.focus?.();
  // #endif
});
async function closeMenu(restoreFocus = true) {
  directoryOptions.value = false;
  const wasSearch = searchOnOpen.value;
  const wasModal = directoryModal.value;
  if (!wasSearch && desktopShell.value) sidebarExpanded.value = false;
  const restoreDirectory = wasSearch && canRestoreDirectory.value && sidebarExpanded.value;
  paletteLeaving.value = wasSearch && !restoreDirectory;
  menuOpen.value = restoreDirectory;
  searchOnOpen.value = false;
  if (!wasSearch) persistSidebar();
  await nextTick();
  // #ifdef H5
  const fallback = desktopShell.value ? sidebarToggle.value : menuButton.value;
  const target = wasModal && previousDirectoryFocus?.isConnected ? previousDirectoryFocus : fallback?.$el || fallback;
  if (restoreFocus) target?.focus?.();
  // #endif
}
function dismissDirectory() {
  if (!menuOpen.value || !directoryModal.value) return false;
  if (directoryOptions.value) directoryOptions.value = false;
  else void closeMenu();
  return true;
}
defineExpose({ dismissDirectory, quietDesktop });

function escapeMenu(event) {
  const element = root.value?.$el || root.value;
  if (
    event.defaultPrevented ||
    !element?.getClientRects?.().length ||
    event.target?.closest?.('.custom-modal-container')
  )
    return;
  if (event.key === 'Escape' && headerActionsOpen.value) {
    event.preventDefault();
    closeHeaderActions(true);
    return;
  }
  if (event.key === 'Escape' && panelOpening.value) {
    event.preventDefault();
    releasePanelOpen();
    return;
  }
  if (
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === 'b' &&
    !event.shiftKey &&
    !event.altKey &&
    (desktopShell.value || props.active === 'learning') &&
    !nativeSettings
  ) {
    event.preventDefault();
    if (!event.repeat) toggleMenu();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && ['k', 'j', ','].includes(event.key.toLowerCase())) {
    event.preventDefault();
    openView(event.key.toLowerCase() === 'k' ? 'search' : event.key === ',' ? 'settings' : 'learning');
    return;
  }
  if (!menuOpen.value) return;
  if (event.key === 'Escape' && directoryOptions.value) {
    event.preventDefault();
    directoryOptions.value = false;
    nextTick(() => (closeButton.value?.$el || closeButton.value)?.focus?.());
    return;
  }
  if (
    event.key === 'Escape' &&
    directoryFilterOpen.value &&
    !searchOnOpen.value &&
    event.target?.closest?.('.directory-top')
  ) {
    event.preventDefault();
    void toggleDirectoryFilter();
    nextTick(() => (closeButton.value?.$el || closeButton.value)?.focus?.());
    return;
  }
  // #ifdef H5
  if (searchOnOpen.value && ['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
    const element = root.value?.$el || root.value;
    const rows = [...(element?.querySelectorAll?.('.search-palette .recent-item') || [])].filter(
      (node) => !node.hasAttribute('disabled')
    );
    if (rows.length) {
      const index = rows.indexOf(event.target);
      if (event.key !== 'Enter') {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        const nextIndex =
          index < 0 ? (direction > 0 ? 0 : rows.length - 1) : (index + direction + rows.length) % rows.length;
        rows[nextIndex]?.focus();
      } else if (event.target?.tagName === 'INPUT') {
        event.preventDefault();
        rows[0].click();
      }
    }
  }
  // #endif
  if (event.key === 'Escape' && directoryModal.value) {
    event.preventDefault();
    closeMenu();
  }
  // #ifdef H5
  if (event.key === 'Tab' && directoryModal.value) {
    const element = root.value?.$el || root.value;
    const controls = [
      ...(element?.querySelectorAll?.(
        '.sidebar-open input, .sidebar-open button, .sidebar-open [role="button"], .sidebar-open [tabindex="0"]'
      ) || [])
    ].filter((node) => node.getClientRects().length && !node.hasAttribute('disabled'));
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && event.target === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && event.target === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  // #endif
}
// Window runs after the existing document/dialog handlers. One Escape has one owner.
function escapeGeneration(event) {
  if (
    event.key !== 'Escape' ||
    event.defaultPrevented ||
    event.isComposing ||
    event.keyCode === 229 ||
    event.repeat ||
    event.shiftKey ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  )
    return;
  const element = root.value?.$el || root.value;
  if (!element?.getClientRects?.().length) return;
  if (props.dismissOverlay?.()) {
    event.preventDefault();
    return;
  }
  const layers = document.querySelectorAll(
    '.custom-modal-container, [role="dialog"], [role="listbox"], uni-picker-view'
  );
  if (
    [...layers].some((layer) => {
      for (let node = layer; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (
          node.hidden ||
          node.hasAttribute('inert') ||
          node.getAttribute('aria-hidden') === 'true' ||
          style.display === 'none' ||
          style.visibility === 'hidden'
        )
          return false;
      }
      return true;
    })
  )
    return;
  if (event.target?.closest?.('select')) return;
  if (artifactTarget.value) {
    event.preventDefault();
    artifactPanel.value?.close();
    return;
  }
  if (learning.intakeBusy || (learning.reply?.kind === 'intake' && learning.reply.pending)) {
    learning.cancelModelIntake();
    event.preventDefault();
    return;
  }
  if (learning.busy || learning.reply?.pending) {
    learning.cancel();
    event.preventDefault();
  }
}
function openView(view, trigger) {
  directoryOptions.value = false;
  const route = getCurrentRoute();
  if (view === 'search') {
    if (!searchOnOpen.value) {
      rememberDirectoryFocus(trigger);
      paletteQuery.value = '';
    }
    searchOnOpen.value = true;
    menuOpen.value = true;
    nextTick(() => {
      const el = searchInput.value?.$el || searchInput.value;
      el?.querySelector?.('input')?.focus?.();
    });
    return;
  }
  if (view === 'connections' && props.active === 'learning') {
    emit('connections');
    return;
  }
  if (['settings', 'profile'].includes(view)) {
    requestProfilePanel(view);
    if (route === 'pages/profile/index') uni.$emit('profilePanel');
    else safeNavigateTo('/pages/profile/index');
    return;
  }
  if (menuOpen.value && directoryModal.value) void closeMenu();
  if (view === 'learning') props.dismissOverlay?.();
  const target =
    SHELL_ROUTES[view] ||
    (['archive', 'phrases', 'plan', 'materials', 'usage'].includes(view)
      ? `/pages/archive/index?view=${view === 'archive' ? 'all' : view}`
      : view === 'connections'
        ? '/pages/learning/index?panel=connections'
        : `/pages/${view}/index`);
  if (route !== target.slice(1).split('?')[0]) safeNavigateTo(target);
  else if (props.active !== view) uni.redirectTo({ url: target });
}
function newSession() {
  if (learning.busy || learning.intakeBusy) return;
  props.dismissOverlay?.();
  learning.selectedConversationId = null;
  if (menuOpen.value && directoryModal.value) void closeMenu();
  emit('new');
  if (getCurrentRoute() !== 'pages/learning/index') safeNavigateTo('/pages/learning/index');
}
function resume(id) {
  if (learning.busy) return;
  // The data and connection panels stand in for the conversation, so picking one has to bring it back.
  props.dismissOverlay?.();
  learning.locateConversation(id);
  if (menuOpen.value && directoryModal.value) void closeMenu();
  if (getCurrentRoute() !== 'pages/learning/index') safeNavigateTo('/pages/learning/index');
}
function openRecord(id, context) {
  try {
    learning.openRecord(id, context);
    error.value = '';
    if (menuOpen.value && directoryModal.value) void closeMenu();
    if (getCurrentRoute() !== 'pages/learning/index') safeNavigateTo('/pages/learning/index');
  } catch (failure) {
    error.value = publicError(failure);
  }
}
function locate(id, day, groupId = null) {
  learning.locateConversation(id, day, groupId);
  if (menuOpen.value && directoryModal.value) void closeMenu();
  if (getCurrentRoute() !== 'pages/learning/index') safeNavigateTo('/pages/learning/index');
}
function outsideDirectory(event) {
  if (!event.target?.closest?.('.space-header-actions, .header-actions-toggle')) closeHeaderActions();
  if (directoryOptions.value && !event.target?.closest?.('.directory-options-menu, .sidebar-options'))
    directoryOptions.value = false;
  if (!menuOpen.value || directoryModal.value || panelPinned.value) return;
  if (!event.target?.closest?.('.space-sidebar, .muse-rail, .workspace-account, .directory-pill')) closeMenu(false);
}
onMounted(() => {
  updateDockMetrics();
  uni.$on('shellNavigationChanged', applyNavigation);
  uni.$on('shellSidebarChanged', applySidebarPreferences);
  syncLogin();
  releaseIdentity = storageService.onIdentityChange(syncLogin);
  if (typeof uni.onWindowResize === 'function') {
    uni.onWindowResize(updateDockMetrics);
    releaseViewport = () => uni.offWindowResize?.(updateDockMetrics);
  } else if (typeof window !== 'undefined') {
    window.addEventListener('resize', updateDockMetrics);
    releaseViewport = () => window.removeEventListener('resize', updateDockMetrics);
  }
  releaseMotion = bindBusinessMotion((reduced) => {
    reducedMotion.value = reduced;
    if (reduced && menuLeaving.value) {
      clearTimeout(menuExitTimer);
      menuLeaving.value = false;
    }
  });
  unbind = bindLearningKeyboard(root.value);
  const element = root.value?.$el || root.value;
  // #ifdef H5
  updateVisibleHeight();
  window.visualViewport?.addEventListener('resize', updateVisibleHeight);
  document.addEventListener('keydown', escapeMenu);
  window.addEventListener('keydown', escapeGeneration);
  if (props.active === 'learning') releaseMessageFollow = bindMessageFollow(element?.querySelector('.space-content'));
  // #endif
  element?.addEventListener?.('focusout', headerActionsFocusOut);
  element?.addEventListener?.('keydown', headerActionKey, true);
  element?.addEventListener?.('keyup', headerActionKey);
  element?.addEventListener?.('pointerdown', outsideDirectory);
  if (!props.refreshRecordsOnMount) return;
  try {
    learning.refresh();
  } catch (e) {
    error.value = publicError(e);
  }
});
onUnmounted(() => {
  uni.$off('shellNavigationChanged', applyNavigation);
  uni.$off('shellSidebarChanged', applySidebarPreferences);
  releaseIdentity();
  releaseViewport();
  releasePanelResize();
  releasePanelOpen();
  clearTimeout(searchTimer);
  clearTimeout(menuExitTimer);
  releaseMotion();
  unbind();
  const element = root.value?.$el || root.value;
  // #ifdef H5
  window.visualViewport?.removeEventListener('resize', updateVisibleHeight);
  document.removeEventListener('keydown', escapeMenu);
  window.removeEventListener('keydown', escapeGeneration);
  releaseMessageFollow();
  // #endif
  element?.removeEventListener?.('focusout', headerActionsFocusOut);
  element?.removeEventListener?.('keydown', headerActionKey, true);
  element?.removeEventListener?.('keyup', headerActionKey);
  element?.removeEventListener?.('pointerdown', outsideDirectory);
});
</script>
<!-- #ifdef APP-PLUS -->
<renderjs name="directoryView">
export default {
  data: () => ({ openedFromTrigger: false }),
  mounted() {
    const shell = this.$ownerInstance.$el;
    // The App event bridge does not serialize KeyboardEvent.key.
    shell.addEventListener('keydown', this.activateButton, true);
    shell.addEventListener('click', this.rememberTrigger, true);
  },
  methods: {
    activateButton(event) {
      const button = event.target;
      if (
        event.defaultPrevented ||
        !['Enter', ' '].includes(event.key) ||
        !button.matches?.('uni-button.mobile-menu, uni-button.base-button') ||
        button.hasAttribute('disabled')
      ) return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) button.click();
    },
    rememberTrigger(event) {
      if (event.target.closest?.('.mobile-menu')) this.openedFromTrigger = true;
    },
    onDirectoryChange(open, wasOpen, owner) {
      if (!this.openedFromTrigger || open === wasOpen) return;
      const shell = owner.$el;
      if (open) {
        shell.querySelector('.sidebar-open .sidebar-close')?.focus({ preventScroll: true });
      } else {
        this.openedFromTrigger = false;
        shell.querySelector('.mobile-menu')?.focus({ preventScroll: true });
      }
    }
  }
};
</renderjs>
<!-- #endif -->
