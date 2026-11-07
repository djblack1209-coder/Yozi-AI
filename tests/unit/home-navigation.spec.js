import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentRoute, isHomeRoute, openHomeTab, openLearningEntry } from '@/utils/home-navigation.js';
import { safeNavigateBack, safeNavigateTo } from '@/utils/safe-navigate.js';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { resolve } from 'node:path';
import { parseAst } from 'rollup/parseAst';

const require = createRequire(import.meta.url);
const { uniViteInjectPlugin } = require('@dcloudio/uni-cli-shared/dist/vite/plugins/inject.js');
const h5ApiNames = require('@dcloudio/uni-h5-vite/lib/api.json');

function compileNavigationForH5(h5Apis) {
  const filename = resolve('src/utils/home-navigation.js');
  const plugin = uniViteInjectPlugin('uni:h5-inject', {
    sourceMap: false,
    'uni.': ['@dcloudio/uni-h5', (method) => h5ApiNames.includes(method)],
    getCurrentPages: ['@dcloudio/uni-h5', 'getCurrentPages']
  });
  let code = plugin.transform.call({ parse: parseAst }, readFileSync(filename, 'utf8'), filename).code;
  for (const node of parseAst(code).body.toReversed()) {
    if (node.type === 'ImportDeclaration') {
      const replacement =
        node.source.value === '@dcloudio/uni-h5'
          ? node.specifiers.map((item) => `const ${item.local.name} = h5Apis.${item.imported.name};`).join('\n')
          : '';
      code = code.slice(0, node.start) + replacement + code.slice(node.end);
    } else if (node.type === 'ExportNamedDeclaration') {
      code = code.slice(0, node.start) + code.slice(node.declaration.start);
    } else if (node.type === 'ExportDefaultDeclaration') {
      code = code.slice(0, node.start) + code.slice(node.end);
    }
  }
  return runInNewContext(`${code}\n({ openLearningEntry, openHomeTab });`, {
    h5Apis,
    uni: {},
    logger: { warn: vi.fn(), error: vi.fn() }
  });
}

describe('home-navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.getCurrentPages = vi.fn(() => [{ route: 'pages/index/index', options: {} }]);
  });

  const runImmediately = (callback) => callback();

  it('opens the reset confirmation in the native main window', () => {
    const invoke = vi.fn();
    vi.stubGlobal('__YOZI_DESKTOP__', true);
    vi.stubGlobal('__TAURI_INTERNALS__', { invoke, metadata: { currentWindow: { label: 'main' } } });
    try {
      safeNavigateTo('/pages/profile/index?panel=reset');
      expect(uni.navigateTo).toHaveBeenCalledWith(expect.objectContaining({ url: '/pages/profile/index?panel=reset' }));
      expect(invoke).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ['openLearningEntry', 'redirectTo', 'pages/learning/index'],
    ['openHomeTab', 'switchTab', 'pages/index/index']
  ])('H5 compiled %s lands through imported %s with an empty global uni', (entry, method, destination) => {
    let route = 'pages/login/onboarding';
    const h5Apis = {
      getCurrentPages: () => [{ route }],
      redirectTo: vi.fn(),
      switchTab: vi.fn(),
      reLaunch: vi.fn()
    };
    h5Apis[method].mockImplementation(({ url, success }) => {
      route = url.slice(1);
      success?.();
    });
    const onSuccess = vi.fn();
    compileNavigationForH5(h5Apis)[entry]({ verifyDelays: [10], schedule: runImmediately, onSuccess });
    expect(route).toBe(destination);
    expect(h5Apis[method]).toHaveBeenCalledOnce();
    expect(h5Apis.reLaunch).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it('completed onboarding enters the learning page without using tab navigation', () => {
    let route = 'pages/splash/index';
    globalThis.getCurrentPages = vi.fn(() => [{ route }]);
    uni.redirectTo.mockImplementationOnce(({ success }) => {
      route = 'pages/learning/index';
      success?.();
      return Promise.resolve();
    });
    const onSuccess = vi.fn();
    openLearningEntry({ verifyDelays: [10], schedule: runImmediately, onSuccess });
    expect(uni.redirectTo).toHaveBeenCalledWith(expect.objectContaining({ url: '/pages/learning/index' }));
    expect(uni.switchTab).not.toHaveBeenCalled();
    expect(uni.reLaunch).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it('late learning-entry acknowledgements cannot navigate after the page closes', () => {
    let active = true;
    let acknowledgement;
    uni.redirectTo.mockImplementationOnce((options) => {
      acknowledgement = options;
      return Promise.resolve();
    });
    openLearningEntry({ verifyDelays: [10], schedule: runImmediately, isCurrent: () => active });
    active = false;
    acknowledgement.success?.();
    acknowledgement.fail?.({ errMsg: 'synthetic late acknowledgement' });
    expect(uni.redirectTo).toHaveBeenCalledOnce();
    expect(uni.switchTab).not.toHaveBeenCalled();
    expect(uni.reLaunch).not.toHaveBeenCalled();
  });

  it('normalizes the current route', () => {
    globalThis.getCurrentPages = vi.fn(() => [{ route: '/pages/index/index?from=splash' }]);
    expect(getCurrentRoute()).toBe('pages/index/index');
    expect(isHomeRoute()).toBe(true);
  });

  it('uses switchTab for the home tab and confirms the target route', () => {
    const onSuccess = vi.fn();

    openHomeTab({ verifyDelays: [10], schedule: runImmediately, onSuccess });

    expect(uni.switchTab).toHaveBeenCalledWith(expect.objectContaining({ url: '/pages/index/index' }));
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(uni.reLaunch).not.toHaveBeenCalled();
  });

  it('falls back when switchTab reports success but the route remains on splash', () => {
    const onFail = vi.fn();
    let currentRoute = 'pages/splash/index';
    globalThis.getCurrentPages = vi.fn(() => [{ route: currentRoute }]);
    uni.reLaunch.mockImplementationOnce(({ success }) => {
      currentRoute = 'pages/index/index';
      success?.();
      return Promise.resolve();
    });

    openHomeTab({ verifyDelays: [10], schedule: runImmediately, onFail });

    expect(uni.switchTab).toHaveBeenCalledWith(expect.objectContaining({ url: '/pages/index/index' }));
    expect(uni.reLaunch).toHaveBeenCalledWith(expect.objectContaining({ url: '/pages/index/index' }));
    expect(onFail).not.toHaveBeenCalled();
  });

  it('falls back to reLaunch when switchTab fails immediately', () => {
    uni.switchTab.mockImplementationOnce(({ fail }) => fail?.({ errMsg: 'switchTab:fail' }));

    openHomeTab({ verifyDelays: [10], schedule: runImmediately });

    expect(uni.reLaunch).toHaveBeenCalledWith(expect.objectContaining({ url: '/pages/index/index' }));
  });
});

describe('single-page back recovery', () => {
  let route;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    route = 'pages/settings/privacy';
    globalThis.getCurrentPages = vi.fn(() => [{ route }]);
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('refreshing a deep route returns home and only reports success after landing', () => {
    const success = vi.fn();
    const complete = vi.fn();
    uni.switchTab.mockImplementationOnce(({ success: landed }) => {
      route = 'pages/index/index';
      landed?.();
    });
    safeNavigateBack({ success, complete });
    expect(uni.navigateBack).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    vi.advanceTimersByTime(350);
    expect(success).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(isHomeRoute()).toBe(true);
  });

  it('recovers a switchTab success that left the original route unchanged', () => {
    uni.reLaunch.mockImplementationOnce(({ success }) => {
      route = 'pages/index/index';
      success?.();
    });
    const success = vi.fn();
    safeNavigateBack({ success });
    vi.runAllTimers();
    expect(uni.reLaunch).toHaveBeenCalledTimes(1);
    expect(success).toHaveBeenCalledTimes(1);
    expect(isHomeRoute()).toBe(true);
  });

  it('preserves the ordinary back stack', () => {
    globalThis.getCurrentPages = vi.fn(() => [{ route: 'pages/login/index' }, { route }]);
    safeNavigateBack();
    expect(uni.navigateBack).toHaveBeenCalledWith(expect.objectContaining({ delta: 1 }));
    expect(uni.switchTab).not.toHaveBeenCalled();
  });

  it('keeps a caller-owned failure path instead of forcing a home fallback', () => {
    const fail = vi.fn();
    uni.navigateBack.mockImplementationOnce(({ fail: denied }) => denied?.({ errMsg: 'navigateBack:fail' }));
    safeNavigateBack({ fail });
    expect(fail).toHaveBeenCalledTimes(1);
    expect(uni.switchTab).not.toHaveBeenCalled();
  });

  it('does not replace a later page with a delayed fallback', () => {
    const success = vi.fn();
    safeNavigateBack({ success });
    route = 'pages/learning/index';
    vi.runAllTimers();
    expect(uni.reLaunch).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    expect(getCurrentRoute()).toBe('pages/learning/index');
  });

  it('does not run a stale failure fallback after the user has navigated away', () => {
    let fail;
    uni.switchTab.mockImplementationOnce((options) => {
      fail = options.fail;
    });
    safeNavigateBack();
    route = 'pages/learning/index';
    fail({ errMsg: 'switchTab:fail' });
    vi.runAllTimers();
    expect(uni.reLaunch).not.toHaveBeenCalled();
    expect(getCurrentRoute()).toBe('pages/learning/index');
  });
});
