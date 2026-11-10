import { beforeEach, expect, it } from 'vitest';
import {
  DEFAULT_NAVIGATION,
  NAVIGATION_KEY,
  SHELL_ROUTES,
  SIDEBAR_KEY,
  shellNavigation,
  parseShellNavigation,
  readSidebar,
  saveSidebar,
  clampSidebarWidth,
  restoredConversation
} from '@/services/learning/shell-navigation.js';
beforeEach(() => uni.clearStorageSync());
it('follows the Muse rail order with Ideas after Search and keeps Feed hidden', () => {
  expect(SHELL_ROUTES).toMatchObject({
    learning: '/pages/learning/index',
    search: null,
    ideas: '/pages/archive/index?view=ideas',
    plan: '/pages/archive/index?view=plan',
    materials: '/pages/archive/index?view=materials'
  });
  expect(DEFAULT_NAVIGATION.modules.filter((item) => item.visible).map((item) => item.id)).toEqual([
    'learning',
    'search',
    'ideas',
    'plan',
    'materials'
  ]);
});
it('sorts and hides with an owned snapshot, persists it, and rejects bad refreshes atomically', () => {
  const navigation = shellNavigation();
  const value = {
    schema: DEFAULT_NAVIGATION.schema,
    modules: [
      { id: 'materials', visible: true },
      { id: 'learning', visible: false },
      { id: 'search', visible: true }
    ]
  };
  expect(navigation.apply(value)).toBe(true);
  const saved = navigation.snapshot();
  value.modules.reverse();
  expect(navigation.snapshot()).toEqual(saved);
  for (const bad of [
    null,
    {},
    { ...saved, schema: 'next' },
    { ...saved, modules: [] },
    { ...saved, modules: [{ id: 'unknown', visible: true }] },
    { ...saved, modules: [{ id: 1, visible: true }] },
    { ...saved, modules: [{ id: {}, visible: true }] },
    { ...saved, modules: [{ id: { toString: 0, valueOf: 0 }, visible: true }] },
    { ...saved, modules: [...saved.modules, saved.modules[0]] },
    { ...saved, modules: [{ id: 'learning', visible: false }] },
    { ...saved, modules: [{ id: 'feed', visible: true }] },
    { ...saved, modules: [{ id: 'learning', visible: 1 }] }
  ]) {
    expect(navigation.apply(bad)).toBe(false);
    expect(navigation.snapshot()).toEqual(saved);
    expect(uni.getStorageSync(NAVIGATION_KEY)).toEqual(saved);
  }
  expect(shellNavigation().snapshot()).toEqual(saved);
  saved.modules[0].visible = false;
  expect(navigation.snapshot().modules[0].visible).toBe(true);
});
it('a corrupt startup cache leaves bootstrap navigation usable', () => {
  uni.setStorageSync(NAVIGATION_KEY, '{broken');
  expect(shellNavigation().snapshot()).toEqual(parseShellNavigation(DEFAULT_NAVIGATION));
});
it('opens the selected 224 px layout and normalizes legacy widths without losing preferences', () => {
  expect(readSidebar()).toEqual({ version: 1, width: 224, collapsed: false });
  uni.setStorageSync(SIDEBAR_KEY, { version: 1, width: 217, collapsed: false });
  expect(readSidebar().width).toBe(224);
  expect(clampSidebarWidth(90)).toBe(224);
  expect(clampSidebarWidth(999)).toBe(384);
  expect(saveSidebar({ version: 1, width: 272, collapsed: true, historyExpanded: false })).toBe(true);
  expect(readSidebar()).toEqual({ version: 1, width: 272, collapsed: true, historyExpanded: false });
  uni.setStorageSync(SIDEBAR_KEY, { version: 1, width: 420, collapsed: false });
  expect(readSidebar().width).toBe(384);
  expect(saveSidebar({ version: 1, width: NaN, collapsed: false })).toBe(false);
  uni.setStorageSync(SIDEBAR_KEY, { version: 8, width: 999 });
  expect(readSidebar().width).toBe(224);
});
it('restores only existing conversation identities, including an explicitly empty workspace', () => {
  const state = { conversations: [{ id: 'first' }, { id: 'latest' }] };
  expect(restoredConversation({ version: 1, conversationId: 'first' }, state, 'latest')).toBe('first');
  expect(restoredConversation({ version: 1, conversationId: null }, state, 'latest')).toBe(null);
  expect(restoredConversation({ version: 1, conversationId: 'foreign' }, state, 'latest')).toBe('latest');
});
