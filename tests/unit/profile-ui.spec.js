import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('profile page static UI contract', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/pages/profile/index.vue'), 'utf8');

  it('does not render escaped HTML entities for menu arrows', () => {
    expect(source).not.toContain('<text class="menu-arrow">></text>');
    expect(source).toContain('<BaseListRow');
    expect(source).toContain("goTo('/pages/settings/privacy')");
  });
});

import ProfilePage from '@/pages/profile/index.vue';
import { requestProfilePanel, consumeProfilePanel, safeNavigateTo } from '@/utils/safe-navigate.js';

it('账户资料详情仅显示本次返回UID，401明确未认证且不触发退出或同步', async () => {
  const { storageService } = await import('@/services/storageService.js');
  uni.clearStorageSync();
  storageService.saveLoginSession({
    userId: 'profile-read-owner',
    token: 'fixture-profile-read',
    userInfo: { _id: 'profile-read-owner' }
  });
  const context = {
    dialogSequence: 0,
    showDialog: false,
    userStore: {
      userInfo: { _id: 'cached-owner' },
      readCurrentProfile: vi.fn().mockResolvedValue({ success: true, code: 0, uid: 'profile-read-owner' }),
      logout: vi.fn()
    },
    learning: { syncRecords: vi.fn() }
  };
  try {
    await ProfilePage.methods.showAccountInfo.call(context);
    expect(context.dialog.content).toBe('用户编号：profile-read-owner');
    ProfilePage.methods.confirmDialog.call(context);
    expect(context.showDialog).toBe(false);
    context.userStore.readCurrentProfile.mockResolvedValue({ success: false, code: 401, uid: null });
    await ProfilePage.methods.showAccountInfo.call(context);
    expect(context.dialog.content).toBe('未认证，请重新登录');
    expect(context.userStore.logout).not.toHaveBeenCalled();
    expect(context.learning.syncRecords).not.toHaveBeenCalled();
  } finally {
    uni.clearStorageSync();
  }
});

it('同步只在明确确认后执行，账户变化会作废旧确认', async () => {
  const { storageService } = await import('@/services/storageService.js');
  const login = (userId) =>
    storageService.saveLoginSession({ userId, token: `fixture-${userId}`, userInfo: { id: userId } });
  uni.clearStorageSync();
  login('sync-owner-a');
  const context = {
    isLoggedIn: true,
    dialogSequence: 0,
    showDialog: false,
    learning: {
      busy: false,
      syncBusy: false,
      syncState: { message: '同步完成' },
      syncRecords: vi.fn().mockResolvedValue({})
    }
  };
  ProfilePage.methods.handleLearningSync.call(context);
  expect(context.showDialog).toBe(true);
  expect(context.learning.syncRecords).not.toHaveBeenCalled();
  login('sync-owner-b');
  await ProfilePage.methods.confirmDialog.call(context);
  expect(context.learning.syncRecords).not.toHaveBeenCalled();
  ProfilePage.methods.handleLearningSync.call(context);
  await ProfilePage.methods.confirmDialog.call(context);
  expect(context.learning.syncRecords).toHaveBeenCalledExactlyOnceWith(true);
  uni.clearStorageSync();
});

it('独立设置窗口将同步交给主窗口，不在只读镜像弹出写入确认或执行同步', () => {
  const context = {
    nativeSettings: true,
    isLoggedIn: true,
    dialogSequence: 0,
    showDialog: false,
    goTo: vi.fn(),
    learning: {
      busy: false,
      syncBusy: false,
      syncRecords: vi.fn(() => {
        throw new Error('Settings does not own the record write lease');
      })
    }
  };
  ProfilePage.methods.handleLearningSync.call(context);
  expect(context.goTo).toHaveBeenCalledExactlyOnceWith('/pages/learning/index?panel=data');
  expect(context.showDialog).toBe(false);
  expect(context.dialogSequence).toBe(0);
  expect(context.learning.syncRecords).not.toHaveBeenCalled();
});

it('设置同步交接仍先检查正在处理的任务与登录，不触发后台写入', () => {
  const context = {
    nativeSettings: true,
    isLoggedIn: true,
    goTo: vi.fn(),
    goLogin: vi.fn(),
    learning: { busy: true, syncBusy: false, syncRecords: vi.fn() }
  };
  ProfilePage.methods.handleLearningSync.call(context);
  expect(context.goTo).not.toHaveBeenCalled();
  context.learning.busy = false;
  context.learning.syncBusy = true;
  ProfilePage.methods.handleLearningSync.call(context);
  expect(context.goTo).not.toHaveBeenCalled();
  context.learning.syncBusy = false;
  context.isLoggedIn = false;
  ProfilePage.methods.handleLearningSync.call(context);
  expect(context.goLogin).toHaveBeenCalledOnce();
  expect(context.goTo).not.toHaveBeenCalled();
  expect(context.learning.syncRecords).not.toHaveBeenCalled();
});

describe('profile panel navigation across page registration', () => {
  afterEach(() => {
    consumeProfilePanel();
    vi.restoreAllMocks();
  });
  function page() {
    const context = {
      settingsMode: false,
      syncTheme: vi.fn(),
      syncIdeasModel: vi.fn(),
      initLayout: vi.fn(),
      studyStore: { restoreProgress: vi.fn() },
      userStore: { restoreUserInfo: vi.fn() }
    };
    context.syncPanelTitle = ProfilePage.methods.syncPanelTitle.bind(context);
    context.setProfilePanel = ProfilePage.methods.setProfilePanel.bind(context);
    return context;
  }
  it('first tab navigation retains settings until onLoad, even when success precedes registration', () => {
    uni.setNavigationBarTitle = vi.fn();
    vi.spyOn(uni, 'switchTab').mockImplementation(({ success }) => success?.({}));
    requestProfilePanel('settings');
    safeNavigateTo('/pages/profile/index');
    const context = page();
    ProfilePage.onLoad.call(context, {});
    ProfilePage.onShow.call(context);
    expect(context.settingsMode).toBe(true);
    expect(uni.setNavigationBarTitle).toHaveBeenLastCalledWith({ title: '设置' });
    expect(consumeProfilePanel()).toBeNull();
  });
  it('AI 连接器目标不会被面板交接归一成账户首页', () => {
    const context = page();
    requestProfilePanel('connectors');
    ProfilePage.onLoad.call(context, {});
    expect(context.settingsSection).toBe('connectors');
    expect(context.settingsMode).toBe(true);
    expect(consumeProfilePanel()).toBeNull();
  });
  it('复用原生设置窗从连接器返回通用，不残留上一分组', () => {
    const context = page();
    context.setProfilePanel('connectors');
    context.setProfilePanel('settings');
    expect(context.settingsMode).toBe(true);
    expect(context.settingsSection).toBe('general');
    context.setProfilePanel('profile');
    expect(context.settingsMode).toBe(false);
    // Muse puts the account at the top of General; there is no separate account section.
    expect(context.settingsSection).toBe('general');
  });
  it('a reused tab consumes each latest target once in onShow', () => {
    const context = page();
    requestProfilePanel('settings');
    ProfilePage.onShow.call(context);
    expect(context.settingsMode).toBe(true);
    ProfilePage.onShow.call(context);
    expect(context.settingsMode).toBe(true);
    requestProfilePanel('profile');
    ProfilePage.onShow.call(context);
    expect(context.settingsMode).toBe(false);
  });
  it('an already visible tab consumes the target through its listener', () => {
    const context = page();
    requestProfilePanel('settings');
    context.setProfilePanel();
    expect(context.settingsMode).toBe(true);
    expect(consumeProfilePanel()).toBeNull();
  });
});

it('order-03: mounted profile reacts to unavailable, recovery and revoked login without stale alias fallback', async () => {
  const { createPinia, setActivePinia } = await import('pinia');
  const { mount } = await import('@vue/test-utils');
  const { nextTick } = await import('vue');
  const { storageService } = await import('@/services/storageService.js');
  const { useUserStore } = await import('@/stores/modules/user.js');
  uni.clearStorageSync();
  const pinia = createPinia();
  setActivePinia(pinia);
  storageService.saveLoginSession({
    userId: 'profile-fixture',
    token: 'fixture-profile-token',
    userInfo: { id: 'profile-fixture', nickName: '保留昵称' }
  });
  const user = useUserStore();
  await user.setUserInfo({ id: 'profile-fixture', nickName: '保留昵称' });
  user.restoreUserInfo();
  const wrapper = mount(ProfilePage, {
    global: {
      plugins: [pinia],
      stubs: { LearningShell: { template: '<div><slot/></div>' }, CustomModal: true, CustomTabbar: true, image: true }
    }
  });
  try {
    expect(wrapper.vm.isLoggedIn).toBe(true);
    user.sessionStatus = 'unavailable';
    await nextTick();
    expect(wrapper.vm.isLoggedIn).toBeNull();
    expect(wrapper.get('[role="status"]').text()).toContain('暂不可用');
    expect(wrapper.text()).not.toContain('未登录');
    expect(user.userInfo.nickName).toBe('保留昵称');
    user.sessionStatus = 'current';
    await nextTick();
    expect(wrapper.vm.isLoggedIn).toBe(true);
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    uni.removeStorageSync('_enc_EXAM_SESSION_EPOCH');
    user.sessionStatus = 'changed';
    user.isLogin = false;
    await nextTick();
    expect(wrapper.vm.isLoggedIn).toBe(false);
    expect(wrapper.text()).toContain('登录后同步学习轨迹');
  } finally {
    wrapper.unmount();
    for (const store of pinia._s.values()) store.$dispose();
  }
});

it('我的账户在普通构建中显示当前认证用户本人的邮箱', async () => {
  const { storageService } = await import('@/services/storageService.js');
  uni.clearStorageSync();
  await storageService.saveLoginSession({ userId: 'email-owner', token: 'fixture-only-session' });
  const context = {
    dialogSequence: 0,
    showDialog: false,
    userStore: {
      readCurrentProfile: vi.fn().mockResolvedValue({ success: true, uid: 'email-owner', email: 'owner@example.test' })
    }
  };
  await ProfilePage.methods.showAccountInfo.call(context);
  expect(context.dialog.content).toBe('邮箱：owner@example.test\n用户编号：email-owner');
  uni.clearStorageSync();
});
