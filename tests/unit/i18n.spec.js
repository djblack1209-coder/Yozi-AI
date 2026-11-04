import { computed, nextTick } from 'vue';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  currentLanguage,
  initI18n,
  setLanguage,
  t,
  resolveLanguage,
  normalizeLanguage,
  LANGUAGE_KEY,
  installI18n,
  registerMessages,
  publicError
} from '@/i18n/index.js';
import { formatDate, formatTime, formatNumber } from '@/i18n/format.js';
import shell, { PAGE_TITLE_KEYS } from '@/i18n/messages/shell.js';
import learningShell from '@/i18n/messages/learning-shell.js';

beforeEach(() => {
  vi.stubGlobal('uni', {
    getStorageSync: vi.fn(() => ''),
    setStorageSync: vi.fn(),
    getAppBaseInfo: vi.fn(() => ({ language: 'zh-CN' })),
    getSystemInfoSync: vi.fn(() => ({ language: 'zh-CN' })),
    setLocale: vi.fn(),
    setNavigationBarTitle: vi.fn()
  });
  vi.stubGlobal('getCurrentPages', () => [{ route: 'pages/profile/index' }]);
  initI18n();
});
afterEach(() => vi.unstubAllGlobals());

describe('lightweight i18n', () => {
  it.each(['zh-CN', 'en'])('S40 retained-conflict message survives both public UI filters in %s', (language) => {
    setLanguage(language);
    const message = '本机与云端记录存在差异，两份副本已保留；请在下方查看并选择要继续的记录。';
    expect(t('ui.syncConflictRetained')).not.toBe('ui.syncConflictRetained');
    expect(publicError({ code: 'CONFLICT', message })).toBe(t('ui.syncConflictRetained'));
    expect(publicError(publicError({ code: 'CONFLICT', message }))).toBe(t('ui.syncConflictRetained'));
    expect(publicError(t('ui.syncConflictRetained'))).toBe(t('ui.syncConflictRetained'));
    expect(publicError({ code: 'CONFLICT', message: 'private raw scope result or provider trace' })).toBe(
      t('ui.operationFailed')
    );
  });
  it('shows safe recovery steps for known sync preview and archive failures in both languages', () => {
    const cases = [
      ['CONFLICT', '云端记录已更新，请重新同步预览；本机与冲突副本保留', 'ui.syncPreviewChanged'],
      ['ARCHIVE_EXISTS', '已有另一份冲突副本；请先导出并明确移除该副本，再重新同步', 'ui.syncArchiveExists']
    ];
    for (const language of ['zh-CN', 'en']) {
      setLanguage(language);
      for (const [code, message, key] of cases) expect(publicError({ code, message })).toBe(t(key));
      expect(publicError({ code: 'CONFLICT', message: 'private provider response or original answer' })).toBe(
        t('ui.operationFailed')
      );
    }
  });
  it('has shared record-search labels before a learning page registers its feature dictionary', () => {
    for (const language of ['zh-CN', 'en']) {
      setLanguage(language);
      for (const key of Object.keys(learningShell[language]).filter((key) => key.startsWith('learning.records.'))) {
        expect(t(key)).toBe(learningShell[language][key]);
        expect(t(key)).not.toBe(key);
      }
    }
  });
  it.each([
    ['en_US', 'en'],
    ['en-GB', 'en'],
    ['zh-Hans', 'zh-CN'],
    ['zh_TW', 'zh-CN'],
    ['de-DE', null],
    [null, null]
  ])('normalizes %s to %s', (input, expected) => expect(normalizeLanguage(input)).toBe(expected));
  it('prioritizes the saved selection, then system, then Chinese', () => {
    expect(resolveLanguage('zh-CN', 'en-US')).toBe('zh-CN');
    expect(resolveLanguage('en', 'zh-CN')).toBe('en');
    expect(resolveLanguage('unknown', 'en-US')).toBe('en');
    expect(resolveLanguage(null, 'fr')).toBe('zh-CN');
  });
  it('loads a saved preference without persisting an inferred choice', () => {
    uni.getStorageSync.mockReturnValue('en');
    expect(initI18n()).toBe('en');
    expect(uni.setStorageSync).not.toHaveBeenCalled();
    expect(uni.setLocale).toHaveBeenLastCalledWith('en');
  });
  it('stays Chinese on an English system until the user chooses English', () => {
    uni.getAppBaseInfo.mockReturnValue({ language: 'en-US' });
    uni.getSystemInfoSync.mockReturnValue({ language: 'en-US' });
    expect(initI18n()).toBe('zh-CN');
    expect(uni.setLocale).toHaveBeenLastCalledWith('zh-Hans');
  });
  it('falls back safely when storage and system APIs are unavailable', () => {
    uni.getStorageSync.mockImplementation(() => {
      throw Error('unavailable');
    });
    uni.getAppBaseInfo.mockImplementation(() => {
      throw Error('unavailable');
    });
    uni.getSystemInfoSync.mockImplementation(() => {
      throw Error('unavailable');
    });
    expect(initI18n()).toBe(false);
    uni.getStorageSync.mockReturnValue('en');
    expect(initI18n()).toBe('en');
  });
  it('refreshes existing reactive text and current navigation title without remounting', async () => {
    const label = computed(() => t('nav.practice'));
    expect(label.value).toBe('刷题');
    expect(setLanguage('en')).toBe(true);
    await nextTick();
    expect(label.value).toBe('Practice');
    expect(uni.setStorageSync).toHaveBeenCalledWith(LANGUAGE_KEY, 'en');
    expect(uni.setNavigationBarTitle).toHaveBeenLastCalledWith({ title: 'My account' });
    expect(document.documentElement.lang).toBe('en');
    expect(setLanguage('zh-CN')).toBe(true);
    expect(uni.setLocale).toHaveBeenLastCalledWith('zh-Hans');
  });
  it('does not change language if saving fails or the value is unsupported', () => {
    expect(setLanguage('fr')).toBe(false);
    uni.setStorageSync.mockImplementation(() => {
      throw Error('full');
    });
    expect(setLanguage('en')).toBe(false);
    expect(currentLanguage.value).toBe('zh-CN');
  });
  it('supports bounded interpolation, zero, and readable missing keys', () => {
    expect(t('missing.{count}', { count: 0 })).toBe('missing.0');
    expect(t('missing.{count}', {})).toBe('missing.{count}');
    expect(t('missing.{count}', Object.create({ count: 'inherited' }))).toBe('missing.{count}');
  });
  it('all configured titles and tab labels have both locale entries', () => {
    const pages = JSON.parse(readFileSync('src/pages.json', 'utf8'));
    const routes = [
      ...pages.pages,
      ...pages.subPackages.flatMap((pack) => pack.pages.map((page) => ({ ...page, path: `${pack.root}/${page.path}` })))
    ];
    expect(Object.keys(shell.en).sort()).toEqual(Object.keys(shell['zh-CN']).sort());
    for (const page of routes) {
      expect(page.style.navigationBarTitleText).toBe(`%${PAGE_TITLE_KEYS[page.path]}%`);
      for (const pack of Object.values(shell)) expect(pack[PAGE_TITLE_KEYS[page.path]]).toBeTruthy();
    }
    expect(pages.tabBar).toBeUndefined();
  });
  it('updates the knowledge map native title when switching languages', () => {
    vi.stubGlobal('getCurrentPages', () => [{ route: 'pages/learning/knowledge' }]);
    expect(setLanguage('en')).toBe(true);
    expect(uni.setNavigationBarTitle).toHaveBeenLastCalledWith({ title: 'Knowledge map' });
    expect(setLanguage('zh-CN')).toBe(true);
    expect(uni.setNavigationBarTitle).toHaveBeenLastCalledWith({ title: '知识框架' });
  });
  it.each([
    ['materials', 'muse.library'],
    ['plan', 'muse.goals'],
    ['all', 'muse.activity'],
    ['phrases', 'muse.phrases'],
    ['ideas', 'muse.ideas'],
    ['usage', 'muse.usage']
  ])('keeps the %s workspace title when a global onShow runs after search closes', async (view, key) => {
    await import('@/i18n/muse.js');
    const app = { config: { globalProperties: {} }, mixin: vi.fn() };
    installI18n(app);
    for (const page of [
      { route: 'pages/archive/index', options: { view } },
      { route: 'pages/archive/index', $page: { options: { view } } }
    ]) {
      vi.stubGlobal('getCurrentPages', () => [page]);
      setLanguage('en');
      expect(uni.setNavigationBarTitle).toHaveBeenLastCalledWith({ title: t(key) });
      app.mixin.mock.calls[0][0].onShow();
      expect(uni.setNavigationBarTitle).toHaveBeenLastCalledWith({ title: t(key) });
      setLanguage('zh-CN');
      expect(uni.setNavigationBarTitle).toHaveBeenLastCalledWith({ title: t(key) });
    }
  });
  it('updates the batch review native title through the same locale contract', () => {
    vi.stubGlobal('getCurrentPages', () => [{ route: 'pages/learning/review' }]);
    expect(setLanguage('en')).toBe(true);
    expect(uni.setNavigationBarTitle).toHaveBeenLastCalledWith({ title: 'Batch review' });
    expect(setLanguage('zh-CN')).toBe(true);
    expect(uni.setNavigationBarTitle).toHaveBeenLastCalledWith({ title: '分批复习' });
  });
  it('installs the translator and navigation lifecycle bridge', () => {
    const app = { config: { globalProperties: {} }, mixin: vi.fn() };
    installI18n(app);
    expect(app.config.globalProperties.$t).toBe(t);
    app.mixin.mock.calls[0][0].onShow();
    expect(uni.setNavigationBarTitle).toHaveBeenLastCalledWith({ title: '我的账户' });
  });
  it('a not-yet-ready page does not prevent language initialization or saving', () => {
    vi.stubGlobal('getCurrentPages', () => {
      throw Error('no pages');
    });
    expect(initI18n()).toBe('zh-CN');
    expect(setLanguage('en')).toBe(true);
    expect(currentLanguage.value).toBe('en');
  });
});

describe('subpackage message registration', () => {
  it('returns a readable key before a feature registers, without loading its dictionary', () => {
    expect(() => t('unregisteredLesson.title')).not.toThrow();
    expect(t('unregisteredLesson.title')).toBe('unregisteredLesson.title');
    expect(t('learning.hint')).toBe('learning.hint');
  });
  it('refreshes already rendered text on registration and on both language switches', async () => {
    const label = computed(() => t('registeredLesson.title', { count: 2 }));
    expect(label.value).toBe('registeredLesson.title');
    expect(
      registerMessages('registeredLesson', {
        'zh-CN': { title: '学习 {count} 项' },
        en: { title: 'Learn {count} topics' }
      })
    ).toBe(true);
    await nextTick();
    expect(label.value).toBe('学习 2 项');
    setLanguage('en');
    expect(label.value).toBe('Learn 2 topics');
    setLanguage('zh-CN');
    expect(label.value).toBe('学习 2 项');
  });
  it('registers after English is chosen and treats identical repeat registrations as a no-op', () => {
    setLanguage('en');
    const dictionary = { 'zh-CN': { title: '开始' }, en: { title: 'Start' } };
    registerMessages('idempotentLesson', dictionary);
    let evaluations = 0;
    const label = computed(() => {
      evaluations++;
      return t('idempotentLesson.title');
    });
    expect(label.value).toBe('Start');
    registerMessages('idempotentLesson', structuredClone(dictionary));
    expect(label.value).toBe('Start');
    expect(evaluations).toBe(1);
  });
  it('keeps namespaces separate, supports qualified keys, and falls back to Chinese', () => {
    registerMessages('firstLesson', {
      'zh-CN': { title: '第一课', 'firstLesson.help': '帮助' },
      en: { title: 'First lesson' }
    });
    registerMessages('secondLesson', { 'zh-CN': { title: '第二课' }, en: { title: 'Second lesson' } });
    setLanguage('en');
    expect(t('firstLesson.title')).toBe('First lesson');
    expect(t('secondLesson.title')).toBe('Second lesson');
    expect(t('firstLesson.help')).toBe('帮助');
    expect(t('nav.practice')).toBe('Practice');
  });
  it('rejects malformed registration atomically without changing existing text', () => {
    registerMessages('validatedLesson', { 'zh-CN': { title: '保留' }, en: { title: 'Keep' } });
    expect(registerMessages('validatedLesson', { 'zh-CN': { title: '替换', invalid: 0 } })).toBe(false);
    expect(t('validatedLesson.title')).toBe('保留');
    expect(registerMessages('', {})).toBe(false);
    expect(registerMessages('bad.name', {})).toBe(false);
  });
});

describe('locale formats', () => {
  const date = new Date(2026, 9, 11, 13, 5);
  it.each(['zh-CN', 'en'])('formats dates, times and numbers through Intl in %s', (locale) => {
    setLanguage(locale);
    const tag = locale === 'en' ? 'en-US' : 'zh-CN';
    expect(formatDate(date)).toBe(
      new Intl.DateTimeFormat(tag, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
    );
    expect(formatTime(date)).toBe(
      new Intl.DateTimeFormat(tag, { hour: '2-digit', minute: '2-digit', hour12: locale === 'en' }).format(date)
    );
    expect(formatNumber(12345.67)).toBe('12,345.67');
  });
  it.each(['zh-CN', 'en'])('has consistent fallback formats without Intl in %s', (locale) => {
    setLanguage(locale);
    vi.stubGlobal('Intl', undefined);
    expect(formatDate(date)).toBe(locale === 'en' ? '10/11/2026' : '2026/10/11');
    expect(formatTime(date)).toBe(locale === 'en' ? '01:05 PM' : '13:05');
    expect(formatNumber(-12345.6, { minimumFractionDigits: 2 })).toBe('-12,345.60');
    expect(formatNumber(1234, { useGrouping: false })).toBe('1234');
  });
  it('handles partially implemented Intl, midnight/noon and invalid input', () => {
    setLanguage('en');
    vi.stubGlobal('Intl', {
      DateTimeFormat() {
        throw Error('unsupported');
      }
    });
    expect(formatTime(new Date(2026, 9, 11, 0, 0))).toBe('12:00 AM');
    expect(formatTime(new Date(2026, 9, 11, 12, 0))).toBe('12:00 PM');
    expect(formatNumber(1.234, { maximumFractionDigits: 2 })).toBe('1.23');
    expect(formatDate('invalid')).toBe('');
    expect(formatTime('invalid')).toBe('');
    expect(formatNumber(NaN)).toBe('');
  });
});
