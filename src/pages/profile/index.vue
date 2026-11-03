<template>
  <view
    ref="root"
    class="learning-space muse-space muse-settings-page is-settings"
    :class="{
      'native-settings-page': nativeSettings,
      'is-desktop-settings': nativeSettings,
      'space-dark': isDark,
      'space-light': !isDark,
      'reduce-motion': reducedMotion
    }"
    :style="tabBarStyle"
  >
    <view class="native-titlebar" data-tauri-drag-region aria-hidden="true" />
    <view class="space-frame">
      <view class="settings-layout">
        <view class="settings-sidebar" role="navigation" :aria-label="t('nav.settings')">
          <text class="settings-sidebar-title">{{ t('nav.settings') }}</text>
          <BaseButton
            v-for="item in settingsSections"
            :key="item.id"
            class="settings-nav"
            :class="{ 'is-current': settingsSection === item.id }"
            variant="quiet"
            :icon="item.icon"
            align="start"
            :aria-current="settingsSection === item.id ? 'page' : undefined"
            @tap="settingsSection = item.id"
            >{{ item.label }}</BaseButton
          >
          <view class="settings-spacer" />
          <BaseButton
            v-if="isLoggedIn"
            class="settings-logout logout-btn"
            variant="quiet"
            icon="arrow-right"
            align="start"
            @tap="handleLogout"
            >{{ t('dashboard.copy110') }}</BaseButton
          >
        </view>
        <view class="settings-main">
          <view class="settings-heading"
            ><text class="settings-title" role="heading" aria-level="1">{{
              settingsSections.find((item) => item.id === settingsSection)?.label
            }}</text
            ><BaseButton
              v-if="!nativeSettings"
              class="settings-back"
              variant="quiet"
              icon="close"
              icon-only
              label="返回对话"
              @tap="returnToConversation"
          /></view>
          <view v-if="settingsSection === 'general'" class="settings-group user-section">
            <BaseButton
              class="profile-top"
              variant="quiet"
              align="start"
              :disabled="isLoggedIn === null"
              :label="isLoggedIn ? t('muse.account') : t('dashboard.copy98')"
              @tap="isLoggedIn ? showAccountInfo() : goLogin()"
            >
              <image
                class="avatar"
                :class="{ 'avatar--brand': !avatarUrl || avatarFailed }"
                :src="avatarUrl && !avatarFailed ? avatarUrl : defaultAvatar"
                :mode="avatarUrl && !avatarFailed ? 'aspectFill' : 'aspectFit'"
                :alt="t('dashboard.copy97')"
                @error="avatarFailed = true"
              />
              <view class="profile-copy"
                ><text class="user-name">{{ userName }}</text
                ><text class="login-hint" :role="isLoggedIn === null ? 'status' : undefined">{{
                  isLoggedIn === null
                    ? t('dashboard.sessionUnavailable')
                    : isLoggedIn
                      ? t('dashboard.copy99')
                      : t('dashboard.copy98')
                }}</text></view
              ><BaseIcon name="arrow-right" size="16px" tone="ink-3" />
            </BaseButton>
          </view>
          <template v-if="settingsSection === 'general'">
            <view class="settings-group">
              <view class="language-row">
                <text>{{ t('settings.language') }}</text>
                <BaseButton
                  class="language-trigger"
                  variant="quiet"
                  :aria-expanded="languageOpen"
                  @tap="languageOpen = !languageOpen"
                  >{{ languageOptions.find((item) => item.value === (draftLanguage || languageCode))?.label
                  }}<BaseIcon name="chevron-down" size="16px"
                /></BaseButton>
                <view v-if="languageOpen" class="language-menu" role="group" :aria-label="t('settings.language')">
                  <BaseButton
                    v-for="item in languageOptions"
                    :key="item.value"
                    variant="quiet"
                    align="start"
                    :selected="(draftLanguage || languageCode) === item.value"
                    @tap="chooseLanguage(item.value)"
                    >{{ item.label
                    }}<BaseIcon v-if="(draftLanguage || languageCode) === item.value" name="check" size="16px"
                  /></BaseButton>
                </view>
              </view>
            </view>
            <text class="settings-label">{{ t('muse.appearance') }}</text>
            <view class="settings-group">
              <view class="appearance-row"
                ><text>{{ t('muse.mode') }}</text
                ><view class="appearance-options" role="group" :aria-label="t('muse.appearance')">
                  <BaseButton
                    v-for="item in appearanceOptions"
                    :key="item.value"
                    variant="quiet"
                    icon-only
                    :icon="item.icon"
                    :label="item.label"
                    :selected="(draftAppearance || themeStore.appearance) === item.value"
                    :aria-pressed="(draftAppearance || themeStore.appearance) === item.value"
                    @tap="chooseAppearance(item.value)"
                  />
                </view>
              </view>
            </view>
            <view class="settings-actions"
              ><BaseButton variant="primary" :disabled="!draftLanguage && !draftAppearance" @tap="savePreferences"
                >保存偏好</BaseButton
              ></view
            >
          </template>
          <template v-if="settingsSection === 'general'">
            <text class="settings-label">通知</text>
            <MuseStudyReminders />
          </template>
          <template v-if="settingsSection === 'permissions'">
            <text class="settings-label">需要权限</text>
            <view class="settings-group permission-group"
              ><BaseListRow label="麦克风与语音识别" value="语音输入暂未开放" :actionable="false" /><BaseListRow
                label="文件与照片"
                value="添加资料时由系统询问"
                :actionable="false"
            /></view>
            <text class="settings-label">AI 连接</text>
            <view class="settings-group"
              ><BaseListRow
                label="学习内容发送给 AI"
                :value="learning.sharingAllowed ? '已允许' : '未允许'"
                :actionable="false"
              /><view class="settings-check"
                ><BaseCheckbox
                  :model-value="ideasModelDraft ?? ideasModelOn"
                  @update:model-value="ideasModelDraft = $event === ideasModelOn ? null : $event"
                  >灵感页每天用我的 API 生成一次建议</BaseCheckbox
                ></view
              ></view
            >
            <view class="settings-actions"
              ><BaseButton variant="primary" :disabled="ideasModelDraft === null" @tap="saveIdeasModel"
                >保存</BaseButton
              ></view
            >
          </template>
          <view v-if="settingsSection === 'channels'" class="settings-group"
            ><text class="settings-empty" role="status">暂无可连接的消息渠道</text></view
          >
          <template v-if="settingsSection === 'devices'">
            <text class="settings-label">本机</text>
            <view class="settings-group"
              ><BaseListRow label="当前设备" :value="deviceLabel" :actionable="false" /><BaseListRow
                label="同步学习记录"
                :value="learning.syncBusy ? '同步中' : ''"
                :disabled="learning.syncBusy || learning.busy"
                @tap="handleLearningSync"
            /></view>
          </template>
          <template v-if="settingsSection === 'data'">
            <text class="settings-label">{{ t('muse.records') }}</text>
            <text
              v-if="totalQuestions || studyStore?.studyProgress?.studyMinutes"
              class="settings-label legacy-stats-label"
              >{{ t('dashboard.copy101') }}</text
            >
            <view v-if="totalQuestions || studyStore?.studyProgress?.studyMinutes" class="settings-group stats-card"
              ><BaseStat
                :label="t('dashboard.copy102')"
                :value="studyStore?.studyProgress?.studyMinutes || 0" /><BaseStat
                :label="t('dashboard.copy103')"
                :value="totalQuestions" /><BaseListRow
                :label="t('dashboard.copy14')"
                :value="accuracyDisplay"
                :actionable="false"
            /></view>
            <view class="settings-group"
              ><BaseListRow
                class="learning-archive-link"
                :label="t('muse.goals')"
                @tap="goTo('/pages/archive/index?view=plan')" /><BaseListRow
                :label="t('dashboard.copy104')"
                @tap="goTo('/pages/mistake/index')" /><BaseListRow
                :label="t('dashboard.copy105')"
                @tap="goTo('/pages/favorite/index')" /><BaseListRow
                label="备份与恢复"
                @tap="goTo('/pages/learning/index?panel=data')"
            /></view>
            <text class="settings-label">本机数据</text>
            <view class="settings-group reset-group">
              <BaseListRow label="清除本机数据" value="退出并重置" :disabled="resetBusy" @tap="handleLocalReset" />
              <text class="reset-scope"
                >清除本机所有账户的学习记录、草稿、资料副本与缓存、AI
                连接与密钥、界面偏好。云端账户、学习记录和保险库不变。</text
              >
              <text v-if="resetError" class="reset-error" role="alert">{{ resetError }}</text>
            </view>
          </template>
          <template v-if="settingsSection === 'legal'">
            <view class="settings-group"
              ><BaseListRow :label="t('dashboard.copy106')" @tap="goTo('/pages/settings/privacy')" /><BaseListRow
                :label="t('dashboard.copy107')"
                @tap="goTo('/pages/settings/terms')"
            /></view>
          </template>
          <MuseAIConnectors v-if="settingsSection === 'connectors'" />
          <view v-if="settingsSection === 'support'" class="settings-group"
            ><BaseListRow :label="t('dashboard.copy108')" @tap="handleFeedback"
          /></view>
        </view>
      </view>
    </view>
    <CustomModal
      :key="dialogSequence"
      v-model:visible="showDialog"
      :is-dark="isDark"
      :title="dialog.title"
      :content="dialog.content"
      :show-cancel="['logout', 'sync', 'reset'].includes(dialog.kind)"
      :confirm-loading="resetBusy"
      :type="dialog.kind === 'reset' ? 'error' : 'info'"
      :mask-closable="['feedback', 'account'].includes(dialog.kind)"
      :confirm-text="
        dialog.kind === 'reset'
          ? '确认清除并退出'
          : dialog.kind === 'logout'
            ? t('dashboard.copy110')
            : dialog.kind === 'sync'
              ? '同步'
              : t('dashboard.copy111')
      "
      @confirm="confirmDialog"
    />
  </view>
</template>
<script>
import '@/i18n/muse.js';
import {
  isDesktopSettingsWindow,
  openDesktopWorkspace,
  restoreDesktopSettingsFocus
} from '@/services/desktop/windows.js';
import { isDesktopRuntime } from '@/services/desktop/runtime.js';
import '@/components/business/learning/learning-space.css';
import MuseAIConnectors from '@/components/business/learning/muse-ai-connectors.vue';
import MuseStudyReminders from '@/components/business/learning/muse-study-reminders.vue';
import { getTabbarSafeAreaStyle } from '@/utils/core/system.js';
import '@/i18n/messages/dashboard.js';
import BaseListRow from '@/components/base/base-list-row/base-list-row.vue';
import BaseStat from '@/components/base/base-stat/base-stat.vue';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseCheckbox from '@/components/base/base-checkbox/base-checkbox.vue';
import { ideasModelEnabled, setIdeasModelEnabled } from '@/services/learning/muse-learning-ideas.js';
import '@/styles/yozi-pages.scss';

import { useUserStore } from '@/stores/modules/user';
import { useStudyStore } from '@/stores/modules/study';
import { useThemeStore } from '@/stores/modules/theme.js';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { captureSession, checkSession, readSessionSnapshot } from '@/services/auth-storage.js';
import { storageService } from '@/services/storageService.js';
import { safeNavigateTo, consumeProfilePanel } from '@/utils/safe-navigate';
import { toast } from '@/utils/toast.js';
import { logger } from '@/utils/logger.js';
import CustomModal from '@/components/common/CustomModal.vue';
import { DEFAULT_AVATAR } from '@/config/brand.js';
import { bindLearningKeyboard } from '@/services/learning/keyboard-controls.js';
import { bindBusinessMotion } from '@/design/business-motion.js';
import { currentLanguage, LANGUAGE_OPTIONS, setLanguage, initI18n, t, translateRegisteredText } from '@/i18n/index.js';

export default {
  components: {
    MuseStudyReminders,
    MuseAIConnectors,
    BaseButton,
    BaseStat,
    BaseListRow,
    BaseCheckbox,
    CustomModal
  },

  data() {
    return {
      nativeSettings: isDesktopSettingsWindow(),
      settingsMode: false,
      settingsSection: 'general',
      languageOpen: false,
      draftLanguage: null,
      draftAppearance: null,
      ideasModelOn: true,
      ideasModelDraft: null,
      resetBusy: false,
      resetError: '',
      statusBarHeight: 44,
      tabBarStyle: {},
      defaultAvatar: DEFAULT_AVATAR,
      avatarFailed: false,
      reducedMotion: true,
      showDialog: false,
      dialogSequence: 0,
      dialog: { kind: 'feedback', title: t('dashboard.copy108'), content: t('dashboard.copy112') }
    };
  },

  computed: {
    settingsSections() {
      return [
        { id: 'general', icon: 'settings', label: t('muse.general') },
        { id: 'connectors', icon: 'shapes', label: 'AI 连接器' },
        { id: 'permissions', icon: 'key', label: t('muse.permissions') },
        { id: 'channels', icon: 'chat', label: t('muse.channels') },
        { id: 'devices', icon: 'monitor', label: t('muse.devices') },
        { id: 'data', icon: 'lock', label: t('muse.dataControls') },
        { id: 'support', icon: 'question', label: t('muse.support') },
        { id: 'legal', icon: 'shield', label: t('muse.legal') }
      ];
    },
    deviceLabel() {
      if (isDesktopRuntime()) return '桌面 App';
      try {
        return uni.getAppBaseInfo?.().uniPlatform === 'app' ? '手机 App' : '网页';
      } catch {
        return '网页';
      }
    },
    languageOptions() {
      return LANGUAGE_OPTIONS.map((item) => ({
        ...item,
        label: t(item.value === 'en' ? 'dashboard.languageEnglish' : 'dashboard.languageChinese')
      }));
    },
    languageCode() {
      return currentLanguage.value;
    },
    appearanceOptions() {
      return [
        { value: 'light', icon: 'sun', label: t('muse.light') },
        { value: 'dark', icon: 'moon', label: t('muse.dark') },
        { value: 'system', icon: 'monitor', label: '跟随系统' }
      ];
    },
    themeStore() {
      return useThemeStore();
    },
    isDark() {
      return this.themeStore.isDark;
    },
    userStore() {
      return useUserStore();
    },
    studyStore() {
      return useStudyStore();
    },
    learning() {
      return useConversationLearningStore();
    },

    isLoggedIn() {
      const isLogin = this.userStore?.isLogin;
      const status = this.userStore?.sessionStatus;
      const snapshot = readSessionSnapshot();
      if (status === 'unavailable' || snapshot.status === 'unavailable') return null;
      if (status === 'changed' || snapshot.status === 'changed') return false;
      return !!(isLogin || storageService.get('EXAM_USER_ID'));
    },

    userName() {
      if (this.isLoggedIn === false) return t('dashboard.copy113');
      if (this.isLoggedIn === null) return this.userStore?.userInfo?.nickName || t('dashboard.copy114');
      return this.userStore?.userInfo?.nickName || storageService.get('userInfo')?.nickName || t('dashboard.copy114');
    },

    avatarUrl() {
      if (this.isLoggedIn === null) return this.userStore?.userInfo?.avatarUrl || '';
      return this.userStore?.userInfo?.avatarUrl || storageService.get('userInfo')?.avatarUrl || '';
    },

    totalQuestions() {
      return this.studyStore?.studyProgress?.completedQuestions || 0;
    },

    accuracyDisplay() {
      const value = this.studyStore?.accuracy;
      return Number.isFinite(Number(this.totalQuestions)) &&
        Number(this.totalQuestions) > 0 &&
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= 100
        ? `${value}%`
        : '—';
    },

    studyTimeDisplay() {
      const min = this.studyStore?.studyProgress?.studyMinutes || 0;
      if (min < 60) return min + 'min';
      const h = Math.floor(min / 60);
      const m = min % 60;
      return h + 'h ' + (m > 0 ? m + 'min' : '');
    }
  },

  onLoad(options) {
    this.setProfilePanel(options?.panel === 'reset' ? 'reset' : consumeProfilePanel() || options?.panel || 'profile');
    uni.$on('profilePanel', this.setProfilePanel);
    this.syncTheme();
    this.initLayout();
    uni.$on('themeUpdate', this.syncTheme);
    uni.$on('updateTheme', this.syncTheme);
  },

  watch: {
    'userStore.userInfo'() {
      if (this.dialog.kind === 'account' && checkSession(this.dialog.session) !== 'current') {
        this.dialogSequence++;
        this.showDialog = false;
      }
    },
    settingsSection() {
      this.languageOpen = false;
    },
    avatarUrl() {
      this.avatarFailed = false;
    }
  },
  mounted() {
    this.releaseSettingsIdentity = storageService.onIdentityChange(() => {
      this.draftLanguage = this.draftAppearance = null;
      this.syncIdeasModel();
      this.languageOpen = false;
      this.showDialog = false;
      this.dialogSequence++;
    });
    this.releaseKeyboard = bindLearningKeyboard(this.$refs.root);
    const element = this.$refs.root?.$el || this.$refs.root;
    const closeLanguage = (event) => {
      if (event.key !== 'Escape' || !this.languageOpen) return;
      event.preventDefault();
      event.stopPropagation();
      this.languageOpen = false;
    };
    element?.addEventListener?.('keydown', closeLanguage);
    this.releaseLanguageMenu = () => element?.removeEventListener?.('keydown', closeLanguage);
    this.releaseMotion = bindBusinessMotion((reduced) => {
      this.reducedMotion = reduced;
    });
  },
  beforeUnmount() {
    uni.$off('profilePanel', this.setProfilePanel);
    this.releaseSettingsIdentity?.();
    this.releaseKeyboard?.();
    this.releaseLanguageMenu?.();
    this.releaseMotion?.();
  },

  onShow() {
    const panel = consumeProfilePanel();
    if (panel) this.setProfilePanel(panel);
    this.syncPanelTitle();
    this.syncTheme();
    this.syncIdeasModel();
    // 每次进入刷新数据
    try {
      this.studyStore.restoreProgress();
      this.userStore.restoreUserInfo();
    } catch (e) {
      logger.warn('[Profile] data refresh failed:', e);
    }
  },

  onUnload() {
    uni.$off('themeUpdate', this.syncTheme);
    uni.$off('updateTheme', this.syncTheme);
  },

  methods: {
    setProfilePanel(panel) {
      const target = panel || consumeProfilePanel();
      this.settingsMode = ['settings', 'connectors', 'reset'].includes(target);
      if (target === 'reset') {
        this.settingsSection = 'data';
        this.handleLocalReset();
      }
      if (target === 'connectors') this.settingsSection = 'connectors';
      else if (target === 'settings') this.settingsSection = 'general';
      else if (target === 'profile') this.settingsSection = 'general';
      this.syncPanelTitle();
    },
    syncPanelTitle() {
      try {
        uni
          .setNavigationBarTitle?.({ title: t(this.settingsMode ? 'nav.settings' : 'pages.profile') })
          ?.catch?.(() => undefined);
      } catch {
        /* A page that is still loading will retry in onShow. */
      }
    },
    t,
    uiText(value) {
      return translateRegisteredText('dashboard', value);
    },
    chooseLanguage(value) {
      this.draftLanguage = value;
      this.languageOpen = false;
    },
    chooseAppearance(value) {
      this.draftAppearance = value;
    },
    savePreferences() {
      if (this.draftLanguage && !setLanguage(this.draftLanguage)) return toast.info('语言未保存，请重试');
      if (this.draftAppearance && !this.themeStore.setAppearance(this.draftAppearance))
        return toast.info('外观未保存，请重试');
      this.draftLanguage = this.draftAppearance = null;
      this.syncPanelTitle();
    },
    syncIdeasModel() {
      this.ideasModelOn = ideasModelEnabled(this.learning.state.owner);
      this.ideasModelDraft = null;
    },
    saveIdeasModel() {
      if (!setIdeasModelEnabled(this.learning.state.owner, this.ideasModelDraft))
        return toast.info('设置未保存，请重试');
      this.ideasModelOn = this.ideasModelDraft;
      this.ideasModelDraft = null;
    },
    syncTheme(mode) {
      if (['dark', 'light'].includes(mode) && this.themeStore.isDark !== (mode === 'dark')) {
        this.themeStore.setDarkMode(mode === 'dark', { persist: false });
      }
    },

    initLayout() {
      try {
        const info = uni.getWindowInfo();
        const statusBarHeight = Number(info.statusBarHeight || 0);
        this.statusBarHeight = statusBarHeight > 0 ? statusBarHeight : 16;
        this.tabBarStyle = getTabbarSafeAreaStyle();
      } catch (_e) {
        logger.warn('[Profile] layout init failed');
      }
    },

    goTo(url) {
      safeNavigateTo(url);
    },

    returnToConversation() {
      const restore = async () => {
        await this.$nextTick();
        restoreDesktopSettingsFocus();
      };
      const pages = getCurrentPages();
      if (pages.at(-2)?.route === 'pages/learning/index') {
        uni.navigateBack({ delta: 1, success: restore });
      } else {
        safeNavigateTo('/pages/learning/index', { success: restore });
      }
    },

    goLogin() {
      safeNavigateTo('/pages/login/index');
    },

    async showAccountInfo() {
      const session = readSessionSnapshot().session,
        sequence = ++this.dialogSequence;
      this.settingsSection = 'general';
      this.dialog = { kind: 'account', session, title: t('muse.account'), content: '正在读取…' };
      this.showDialog = true;
      const result = await this.userStore.readCurrentProfile({ session });
      if (!this.showDialog || sequence !== this.dialogSequence) return;
      this.dialog.content =
        result.success && checkSession(session) === 'current'
          ? [result.email ? `邮箱：${result.email}` : '', `用户编号：${result.uid}`].filter(Boolean).join('\n')
          : result.code === 401
            ? '未认证，请重新登录'
            : '账户资料读取失败，请重试';
    },

    handleFeedback() {
      this.dialogSequence++;
      this.dialog = { kind: 'feedback', title: t('dashboard.copy108'), content: t('dashboard.copy112') };
      this.showDialog = true;
    },

    handleLocalReset() {
      if (this.resetBusy) return;
      if (this.nativeSettings) {
        // The main window owns the learning write lease; keep confirmation there.
        return openDesktopWorkspace('/pages/profile/index?panel=reset').catch(() => {
          this.resetError = '主窗口暂不可用，请返回主窗口的设置重试清除';
        });
      }
      const session = captureSession() || (storageService.localResetNeedsRecovery() ? this.dialog.session : null);
      if (!session) {
        this.resetError = '登录状态暂不可读，请稍后重试';
        return;
      }
      this.dialogSequence++;
      this.dialog = {
        kind: 'reset',
        session,
        title: '清除本机数据？',
        content:
          '将不可恢复地清除本机所有账户的学习记录、草稿、资料副本与缓存、AI 连接与密钥、界面偏好，并退出登录。云端账户、云端记录与云端保险库不删除；已导出文件及原始资料不受影响。'
      };
      this.showDialog = true;
    },
    handleLogout() {
      this.dialogSequence++;
      this.dialog = {
        kind: 'logout',
        session: captureSession(),
        title: t('dashboard.copy115'),
        content: t('dashboard.copy116')
      };
      this.showDialog = true;
    },
    handleLearningSync() {
      if (this.learning.syncBusy || this.learning.busy) return;
      if (!this.isLoggedIn) return this.goLogin();
      // Settings is a read mirror; the main window owns record writes and sync consent.
      if (this.nativeSettings) return this.goTo('/pages/learning/index?panel=data');
      this.dialogSequence++;
      this.dialog = {
        kind: 'sync',
        session: captureSession(),
        title: '同步当前用户的学习记录',
        content:
          '会把对话、私人资料片段、页图与学习记录发送至本Yozi AI 服务，以便多设备使用。没有登录或服务不可用时，本地记录保留。'
      };
      this.showDialog = true;
    },
    confirmDialog() {
      if (this.dialog.kind === 'account') {
        this.showDialog = false;
        return;
      }
      if (this.dialog.kind === 'reset') {
        if (this.resetBusy) return;
        const session = this.dialog.session;
        if (!storageService.localResetNeedsRecovery() && checkSession(session) !== 'current') {
          this.resetError = '登录状态已变化，请重新确认';
          return;
        }
        this.resetBusy = true;
        this.resetError = '';
        return (
          storageService.localResetNeedsRecovery()
            ? storageService.resetLocalData(session)
            : this.learning.resetLocalData(session)
        )
          .then((result) => {
            if (!result.success) {
              this.resetError =
                result.code === 'OTHER_WINDOW_ACTIVE'
                  ? '另一窗口正在使用学习记录，请关闭后重试清除'
                  : result.code === 'RESET_RECOVERY_REQUIRED'
                    ? '本机存储暂不可写，请保持此页面并重试恢复后清除'
                    : '清除未完成，原数据已保留，请重试';
              return;
            }
            this.showDialog = false;
            uni.$emit('user:logout');
            uni.$emit('loginStatusChanged', false);
            this.themeStore.$reset();
            this.themeStore.resetDevicePreferences?.();
            this.draftLanguage = this.draftAppearance = null;
            initI18n();
            safeNavigateTo('/pages/index/index');
          })
          .catch(() => {
            this.resetError = '清除未完成，请重试';
          })
          .finally(() => {
            this.resetBusy = false;
          });
      }

      if (this.dialog.kind === 'sync') {
        const session = this.dialog.session;
        if (checkSession(session) !== 'current') return;
        this.showDialog = false;
        return this.learning
          .syncRecords(true)
          .then(() => {
            if (checkSession(session) === 'current') toast.info(this.learning.syncState.message);
          })
          .catch(() => {
            if (checkSession(session) === 'current') toast.info('同步未完成，本地记录已保留');
          });
      }
      if (this.dialog.kind === 'logout') {
        if (checkSession(this.dialog.session) !== 'current') {
          this.showDialog = false;
          return;
        }
        try {
          const finish = (result) => {
            if (result?.success === false) {
              toast.info('登录状态已变化，请重试');
              return;
            }
            const session = captureSession();
            if (!session || session.owner !== 'guest') return;
            uni.$emit('loginStatusChanged', false);
            uni.showToast({ title: t('dashboard.copy117'), icon: 'success' });
            setTimeout(() => {
              if (checkSession(session) === 'current') safeNavigateTo('/pages/index/index');
            }, 1000);
          };
          const result = this.userStore.logout();
          return result?.then ? result.then(finish) : finish(result);
        } catch (e) {
          logger.error('[Profile] logout failed:', e);
        }
      }
    }
  }
};
</script>

<style scoped>
.learning-space.muse-space.muse-settings-page {
  --violet-soft: rgba(10, 132, 255, 0.16);
  --violet-ink: #0a84ff;
  --clay-face: #0a84ff;
  --clay-face-hover: #0077ed;
  --on-clay: #fff;
  --clay-shadow: none;
  --clay-shadow-press: none;
}
.space-light {
  --muse-settings-card: #fff;
}

.settings-sidebar-title {
  display: flex;
  align-items: center;
  min-height: 60px;
  padding: 0 12px;
  font-size: 18px;
  font-weight: 600;
}
.language-row {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 52px;
  font-size: 14px;
}
.language-menu {
  position: absolute;
  z-index: 20;
  top: calc(100% - 4px);
  right: 0;
  display: flex;
  flex-direction: column;
  width: 180px;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: var(--muse-shadow);
  padding: 4px;
}
.language-trigger {
  padding: 0 8px;
}
.muse-settings-page.space-dark {
  --muse-settings-card: #232324;
}
/* Muse's dark settings window: the navigation shares the window's dark ground, set apart by the divider. */
.space-dark .settings-sidebar {
  background: #181819;
}
.space-dark .settings-sidebar .settings-nav.is-current {
  background: #ffffff1f;
}
.space-dark .settings-main {
  background: #161617;
}
.space-light .settings-sidebar {
  background: var(--muse-panel);
}
.space-light .settings-main {
  background: #fcfcfc;
}
@media (max-width: 760px) {
  .settings-sidebar-title {
    display: none;
  }
}

.settings-layout {
  width: 100%;
  display: grid;
  grid-template-columns: 224px minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  height: 100%;
  min-height: 0;
}
.settings-sidebar {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 0 12px 12px;
  background: var(--muse-panel);
  border-right: 1px solid var(--line-strong);
  overflow-y: auto;
}
.settings-sidebar .settings-nav {
  color: var(--ink);
  border-radius: 8px;
  min-height: 44px;
  padding: 0 10px;
  font-size: 15px;
  font-weight: 400;
}
.settings-sidebar .settings-nav.is-current {
  background: var(--muse-selected);
}
.settings-spacer {
  flex: 1;
  min-height: 24px;
}
.settings-logout {
  color: var(--ink-2);
}
.settings-main {
  min-width: 0;
  min-height: 0;
  overscroll-behavior: contain;
  overflow-y: auto;
  padding: 28px clamp(16px, 4vw, 48px);
}
.settings-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  max-width: 720px;
  margin-bottom: 18px;
  position: relative;
}
.settings-heading .settings-back {
  position: absolute;
  right: 0;
  top: -6px;
  width: 44px;
  padding: 0;
  border-radius: 8px;
  color: var(--ink-3);
}
.settings-title {
  display: block;
  max-width: 720px;
  margin: 0;
  font-size: 22px;
  line-height: 26px;
  font-weight: 680;
}
.settings-group {
  max-width: 720px;
  margin: 0 0 18px;
  padding: 0 16px;
  border-radius: 16px;
  background: var(--muse-settings-card, var(--paper));
  overflow: visible;
}
.settings-label {
  display: block;
  max-width: 720px;
  margin: 18px 4px 8px;
  padding: 0 4px;
  color: var(--ink-3);
  font-size: 12px;
}
.settings-empty {
  display: block;
  padding: 14px 16px;
  color: var(--ink-2);
  font-size: 14px;
}
.reset-scope {
  display: block;
  padding: 0 0 16px;
  color: var(--ink-3);
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.reset-error {
  display: block;
  padding: 0 0 16px;
  color: var(--ink);
  font-size: 13px;
  line-height: 1.6;
}
.settings-check {
  padding: 6px 0;
}
.settings-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}
.profile-top {
  width: 100%;
  min-height: 72px;
  padding: 14px 0;
  background: transparent;
  color: var(--ink);
}
.profile-top :deep(.base-button__content) {
  width: 100%;
  gap: 12px;
}
.profile-top :deep(.base-button__content > .base-icon) {
  margin-left: auto;
}
.settings-sidebar .settings-nav :deep(.base-icon) {
  width: 20px !important;
  height: 20px !important;
}
.avatar {
  width: 32px;
  height: 32px;
  flex: none;
  border-radius: 50%;
  object-fit: cover;
}
.avatar.avatar--brand {
  border-radius: 0;
  background: transparent;
  object-fit: contain;
}
.profile-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.user-name {
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.login-hint {
  font-size: 12px;
  line-height: 17px;
  font-weight: 400;
  color: var(--ink-3);
}
.appearance-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 52px;
}
.appearance-options {
  display: flex;
  padding: 3px;
  gap: 4px;
  border-radius: 10px;
  background: var(--muse-raised);
}
.appearance-options :deep(.is-selected) {
  background: var(--muse-selected);
  color: var(--ink);
}
.stats-card {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.settings-group :deep(.base-list-row) {
  padding: 0;
  min-height: 52px;
  font-size: 14px;
  line-height: 20px;
}
.settings-group :deep(.base-field__input) {
  font-size: 13px;
}
.settings-group .appearance-row {
  font-size: 14px;
}
.appearance-options .base-button {
  width: 44px;
  padding: 0;
  border-radius: 7px;
}

@media (max-width: 760px) {
  .settings-layout {
    display: flex;
    flex-direction: column;
  }
  .settings-sidebar {
    flex: none;
    flex-direction: row;
    align-items: center;
    padding: 8px 12px;
    padding-top: calc(8px + var(--space-status-top, env(safe-area-inset-top)));
    overflow-x: auto;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
  .settings-sidebar .settings-nav {
    padding: 8px 12px;
    flex: none;
    white-space: nowrap;
  }
  .settings-sidebar .settings-nav :deep(.base-icon),
  .settings-spacer {
    display: none;
  }
  .settings-logout {
    flex: none;
  }
  .settings-main {
    flex: 1;
    padding: 24px 16px;
  }
  .settings-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    max-width: 720px;
    margin-bottom: 18px;
  }
  .settings-heading .settings-back {
    width: 44px;
    padding: 0;
    border-radius: 8px;
    color: var(--ink-3);
  }
  .settings-title {
    font-size: 24px;
  }
  .settings-group {
    padding: 0 16px;
  }
}
</style>

<style scoped>
/* Muse 2 native/main.swift:1759, 520×680. A native compact window keeps
   vertical navigation (Settings.css); it is never the phone layout. */
.native-settings-page .settings-layout {
  display: grid;
  grid-template-columns: 148px minmax(0, 1fr);
  height: 100%;
}
.native-settings-page .settings-sidebar {
  flex-direction: column;
  align-items: stretch;
  padding: 0 8px 8px;
  border-right: 1px solid var(--line);
  border-bottom: 0;
  overflow-x: hidden;
  overflow-y: auto;
}
.native-settings-page .settings-sidebar-title {
  display: none;
}
.native-settings-page .settings-sidebar .settings-nav {
  white-space: normal;
  padding: 0 8px;
  font-size: 13px;
}
.native-settings-page .settings-sidebar .settings-nav :deep(.base-icon) {
  display: inline-flex;
}
.native-settings-page .settings-spacer {
  display: block;
}
.native-settings-page .settings-main {
  padding: 16px;
}
.native-settings-page .settings-heading {
  margin-bottom: 12px;
}
.native-settings-page .settings-title {
  font-size: 18px;
  line-height: 24px;
}
.native-settings-page .settings-group {
  margin-bottom: 16px;
  padding: 0 14px;
  border-radius: 12px;
}
.native-settings-page .settings-label {
  margin-top: 16px;
}
.native-settings-page .profile-top {
  min-height: 60px;
  padding: 10px 0;
}
.native-settings-page .language-row,
.native-settings-page .appearance-row,
.native-settings-page .settings-group :deep(.base-list-row) {
  min-height: 48px;
}
.native-settings-page .appearance-row {
  flex-wrap: wrap;
  gap: 8px;
}
.native-settings-page .user-section {
  flex-wrap: wrap;
}
@media (pointer: fine) {
  .native-settings-page .settings-sidebar .settings-nav {
    min-height: 32px;
    height: 32px;
  }
  .native-settings-page .settings-sidebar .settings-nav :deep(.base-icon) {
    width: 16px !important;
    height: 16px !important;
  }
}
</style>
