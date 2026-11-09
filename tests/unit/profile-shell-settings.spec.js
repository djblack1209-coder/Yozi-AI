import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import Profile from '@/pages/profile/index.vue';
import { storageService } from '@/services/storageService.js';
vi.mock('@/services/desktop/windows.js', async (original) => ({
  ...(await original()),
  isDesktopSettingsWindow: () => true
}));
let wrapper, identityChanged;
beforeEach(() => {
  uni.clearStorageSync();
  setActivePinia(createPinia());
  vi.spyOn(storageService, 'onIdentityChange').mockImplementation((listener) => {
    identityChanged = listener;
    return () => {};
  });
  wrapper = mount(Profile, {
    global: {
      stubs: {
        MuseAIConnectors: true,
        MuseStudyReminders: true,
        CustomModal: true,
        BaseIcon: true
      }
    }
  });
});
afterEach(() => {
  wrapper?.unmount();
  vi.restoreAllMocks();
});
it('labels a compact native settings window independently of the phone breakpoint', () => {
  expect(wrapper.classes()).toContain('native-settings-page');
  expect(wrapper.find('.settings-sidebar[role="navigation"]').exists()).toBe(true);
  expect(wrapper.find('.settings-back').exists()).toBe(false);
  expect(wrapper.find('.muse-rail').exists()).toBe(false);
  expect(wrapper.find('.space-header').exists()).toBe(false);
  expect(wrapper.find('.settings-main').exists()).toBe(true);
});
it('revokes unsaved settings and account dialogs synchronously when the owner changes', () => {
  wrapper.vm.draftAppearance = 'dark';
  wrapper.vm.draftLanguage = 'en';
  wrapper.vm.showDialog = true;
  wrapper.vm.feedbackOpen = true;
  wrapper.vm.languageOpen = true;
  identityChanged();
  expect(wrapper.vm.draftAppearance).toBeNull();
  expect(wrapper.vm.draftLanguage).toBeNull();
  expect(wrapper.vm.showDialog).toBe(false);
  expect(wrapper.vm.feedbackOpen).toBe(false);
  expect(wrapper.vm.languageOpen).toBe(false);
});
