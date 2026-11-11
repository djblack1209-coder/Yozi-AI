import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openDesktopSettings, restoreDesktopSettingsFocus, handleDesktopTitlebar } from '@/services/desktop/windows.js';
import { invoke } from '@tauri-apps/api/core';
const windowApi = vi.hoisted(() => ({ toggleMaximize: vi.fn(), startDragging: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => windowApi }));
beforeEach(() => {
  vi.stubGlobal('getCurrentPages', () => [{ route: 'pages/learning/index' }]);
  uni.navigateTo = vi.fn(({ success }) => success?.({}));
  windowApi.toggleMaximize.mockResolvedValue(undefined);
  windowApi.startDragging.mockResolvedValue(undefined);
});
afterEach(() => {
  restoreDesktopSettingsFocus();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});
it('keeps rapid settings and connector changes inside one workspace route', async () => {
  let release;
  let route = 'pages/learning/index';
  vi.stubGlobal('getCurrentPages', () => [{ route }]);
  uni.navigateTo.mockImplementation(({ success }) => {
    release = () => {
      route = 'pages/profile/index';
      success?.({});
    };
  });
  const first = openDesktopSettings('settings');
  expect(openDesktopSettings('settings')).toBe(first);
  const next = openDesktopSettings('connectors');
  await vi.waitFor(() => expect(uni.navigateTo).toHaveBeenCalledTimes(1));
  release();
  await Promise.all([first, next]);
  expect(uni.navigateTo.mock.calls[0][0].url).toBe('/pages/profile/index?panel=settings');
  expect(uni.$emit).toHaveBeenCalledWith('profilePanel', 'connectors');
  expect(invoke).not.toHaveBeenCalled();
});
it('returns focus to the original input and retains its draft when settings closes', async () => {
  document.body.innerHTML = '<textarea>未提交的原答</textarea><button>设置</button>';
  const input = document.querySelector('textarea');
  input.focus();
  await openDesktopSettings('settings');
  document.querySelector('button').focus();
  restoreDesktopSettingsFocus();
  expect(document.activeElement).toBe(input);
  expect(input.value).toBe('未提交的原答');
});
it('rejects unknown panels before navigating', async () => {
  await expect(openDesktopSettings('remote')).rejects.toThrow();
  expect(uni.navigateTo).not.toHaveBeenCalled();
});
it('toggles maximize once on the titlebar double click and drags on a single click', () => {
  document.body.innerHTML = '<div class="native-titlebar"></div><button>设置</button>';
  const target = document.querySelector('div');
  const event = { target, button: 0, detail: 2, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() };
  handleDesktopTitlebar(event);
  expect(windowApi.toggleMaximize).toHaveBeenCalledTimes(1);
  expect(windowApi.startDragging).not.toHaveBeenCalled();
  handleDesktopTitlebar({ ...event, detail: 1 });
  expect(windowApi.startDragging).toHaveBeenCalledTimes(1);
  handleDesktopTitlebar({ ...event, target: document.querySelector('button') });
  expect(windowApi.toggleMaximize).toHaveBeenCalledTimes(1);
});
