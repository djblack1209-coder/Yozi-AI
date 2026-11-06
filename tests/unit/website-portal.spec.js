import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { emptyLearningState } from '@/services/learning/learning-domain.js';
import { websiteProgress } from '@/services/learning/website-progress.js';
import { readLearningSnapshot } from '@/services/learning/learning-sync.js';
import { captureSession } from '@/services/auth-storage.js';
import { websiteRoutes, WEBSITE_ROUTES } from '../../scripts/build/website-routes.mjs';
import { websiteLoginText } from '@/pages/login/messages.js';
import { installWebsiteRouteFallback } from '@/config/website.js';

beforeEach(() => {
  uni.clearStorageSync();
  vi.clearAllMocks();
});
describe('public website boundary', () => {
  function browser(hash) {
    const listeners = new Map();
    const location = { pathname: '/preview/', search: '?channel=test', hash };
    const target = {
      location,
      history: {
        state: { retained: true },
        replaceState: vi.fn((_state, _title, url) => {
          location.hash = url.slice(url.indexOf('#'));
        })
      },
      addEventListener: (type, handler) => listeners.set(type, handler),
      removeEventListener: (type, handler) => {
        if (listeners.get(type) === handler) listeners.delete(type);
      }
    };
    return { target, listeners };
  }
  it.each([
    '#/pages/profile/index?panel=connectors',
    '#/pages/learning/index',
    '#/pages/learning/index?from=external',
    '#/unknown'
  ])('normalizes unavailable route %s before router startup', (hash) => {
    const { target, listeners } = browser(hash);
    const release = installWebsiteRouteFallback(target);
    expect(target.location.hash).toBe('#/pages/index/index');
    expect(target.history.replaceState).toHaveBeenCalledExactlyOnceWith(
      { retained: true },
      '',
      '/preview/?channel=test#/pages/index/index'
    );
    listeners.get('hashchange')();
    expect(target.history.replaceState).toHaveBeenCalledTimes(1);
    release();
    expect(listeners.size).toBe(0);
  });
  it.each(['', '#/', ...WEBSITE_ROUTES.map((route) => `#/${route}?code=unit-callback`)])(
    'leaves supported address %s and its query intact',
    (hash) => {
      const { target } = browser(hash);
      const release = installWebsiteRouteFallback(target);
      expect(target.location.hash).toBe(hash);
      expect(target.history.replaceState).not.toHaveBeenCalled();
      release();
    }
  );
  it.each(['hashchange', 'popstate'])('handles a later unsupported address on %s', (event) => {
    const { target, listeners } = browser('#/pages/login/index');
    const release = installWebsiteRouteFallback(target);
    target.location.hash = '#/pages/learning/index';
    listeners.get(event)();
    expect(target.location.hash).toBe('#/pages/index/index');
    release();
  });
  it('keeps only download, identity and policy routes without mutating app routes', () => {
    const source = JSON.parse(readFileSync('src/pages.json', 'utf8')),
      before = JSON.stringify(source);
    const result = websiteRoutes(source);
    const routes = [
      ...result.pages.map((page) => page.path),
      ...result.subPackages.flatMap((group) => group.pages.map((page) => group.root + '/' + page.path))
    ];
    expect(routes.sort()).toEqual([...WEBSITE_ROUTES].sort());
    expect(result.tabBar).toBeUndefined();
    expect(result.preloadRule).toBeUndefined();
    expect(JSON.stringify(source)).toBe(before);
    expect(
      source.subPackages.some(
        (group) => group.root === 'pages/learning' && group.pages.some((page) => page.path === 'index')
      )
    ).toBe(true);
  });
  it('keeps website actions and form fields in Chinese', () => {
    expect(websiteLoginText('login.submit')).toBe('登录');
    expect(websiteLoginText('login.register')).toBe('注册');
    expect(websiteLoginText('login.emailAddress')).toBe('邮箱地址');
    expect(websiteLoginText('login.providerClosed')).toBe('登录服务暂时不可用，请稍后再试');
  });
});
describe('personal saved-progress projection', () => {
  it('empty state stays empty with seven dated bins rather than fabricated examples', () => {
    const value = websiteProgress(emptyLearningState('u1'), Date.parse('2026-10-20T05:00:00Z'));
    expect(value.hasRecords).toBe(false);
    expect(value.studyDays).toBe(0);
    expect(value.days).toHaveLength(7);
    expect(value.days.at(-1)).toEqual({ day: '2026-10-20', count: 0 });
  });
  it('counts saved practice, coach answers, essays and phrase reviews in the account timezone without changing facts', () => {
    const state = emptyLearningState('u1');
    state.attempts = [{ at: Date.parse('2026-10-19T16:30:00Z') }];
    state.events = [{ at: 100 }, { at: 200 }];
    state.conversations = [
      {
        coach: {
          profile: { deadline: '2026-10-25' },
          diagnostic: { answers: [{}], feedback: { weaknesses: ['collocations'] } },
          days: [
            {
              day: '2026-10-19',
              answers: [{}, {}],
              rewrites: [{}],
              essay: 'Saved draft',
              pack: { writing: { patterns: [{}] } },
              feedback: {}
            }
          ],
          library: [
            {
              reviews: [
                { day: '2026-10-18', rating: 3 },
                { day: '2026-10-20', rating: 4 }
              ]
            }
          ]
        }
      }
    ];
    const original = JSON.stringify(state),
      value = websiteProgress(state, Date.parse('2026-10-20T05:00:00Z'));
    expect(value.owner).toBe('u1');
    expect(value.studyDays).toBe(3);
    expect(value.answers).toBe(4);
    expect(value.essays).toBe(1);
    expect(value.familiar).toBe(1);
    expect(value.daysToExam).toBe(5);
    expect(value.days.at(-1).count).toBe(2);
    expect(value.lastActivity).toBe(200);
    expect(JSON.stringify(state)).toBe(original);
  });
});
describe('read-only sync transport', () => {
  function signIn(owner = 'u1') {
    uni.setStorageSync('EXAM_USER_ID', owner);
    uni.setStorageSync('EXAM_TOKEN', 'test-only-token');
    return captureSession();
  }
  it('uses pull only, binds the owner, and never writes a learning repository', async () => {
    const session = signIn(),
      state = emptyLearningState('u1'),
      request = vi.fn(async () => ({ success: true, data: { state } }));
    const save = vi.spyOn(uni, 'setStorageSync');
    save.mockClear();
    expect(await readLearningSnapshot({ session, request })).toEqual(state);
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][1]).toEqual({ action: 'pull', timezone: 'Asia/Shanghai' });
    expect(request.mock.calls[0][2].expectedOwner).toBe('u1');
    expect(save).not.toHaveBeenCalled();
    save.mockRestore();
  });
  it('rejects another account and stale replies after switching identities', async () => {
    const session = signIn();
    await expect(
      readLearningSnapshot({
        session,
        request: async () => ({ success: true, data: { state: emptyLearningState('u2') } })
      })
    ).rejects.toThrow('同步用户不一致');
    let finish;
    const pending = readLearningSnapshot({
      session,
      request: () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    });
    const assertion = expect(pending).rejects.toThrow();
    signIn('u2');
    finish({ success: true, data: { state: emptyLearningState('u1') } });
    await assertion;
  });
  it('guest view never requests cloud records', async () => {
    const request = vi.fn();
    await expect(readLearningSnapshot({ request })).rejects.toThrow('请先登录');
    expect(request).not.toHaveBeenCalled();
  });
});
