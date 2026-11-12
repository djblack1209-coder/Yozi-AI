import { seedLegacyTask } from '../fixtures/legacy-queue.js';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { storageService } from '@/services/storageService.js';
import { captureSession, sessionUnavailable } from '@/services/auth-storage.js';
import { OfflineQueue } from '@/utils/core/offline-queue.js';
import { analytics } from '@/utils/analytics/event-bus-analytics.js';
import { tokenRefreshPlugin } from '@/utils/auth/token-refresh-plugin.js';
import questionTimer from '@/pages/practice-sub/question-timer.js';
import App from '@/App.vue';
const read = uni.getStorageSync.getMockImplementation();
let blocked;
const login = (n = 1) =>
  storageService.saveLoginSession({ userId: `account-${n}`, token: `fixture-${n}`, userInfo: { id: `account-${n}` } });
beforeEach(() => {
  vi.useFakeTimers();
  blocked = null;
  uni.getStorageSync.mockImplementation((key) => {
    if (key === blocked) throw sessionUnavailable();
    return read(key);
  });
  uni.clearStorageSync();
  login();
  setActivePinia(createPinia());
});
afterEach(() => {
  blocked = null;
  App.beforeUnmount.call({});
  tokenRefreshPlugin.stopPreCheckTimer();
  analytics.stopIdentity?.();
  clearInterval(analytics.uploadTimer);
  analytics.uploadTimer = null;
  analytics.isInitialized = false;
  analytics.eventQueue = [];
  analytics.session = null;
  questionTimer.stop();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each(['preflight', 'fulfilled', 'thrown'])(
  'inflight-17-02/regress-8-01/migrate-08-03: unavailable %s reports unsynced',
  async (kind) => {
    const q = new OfflineQueue();
    seedLegacyTask(q, {
      requestData: { value: 1 },
      requestFn: async () => {
        if (kind === 'thrown') throw sessionUnavailable();
        return { success: false, code: 'SESSION_UNAVAILABLE' };
      }
    });
    if (kind === 'preflight') blocked = '_enc_EXAM_SESSION_EPOCH';
    const result = await q.processQueue();
    expect(q.queue).toHaveLength(1);
    expect(q.queue[0].retryCount).toBe(0);
    expect(result).toMatchObject({ success: false, reason: 'SESSION_UNAVAILABLE' });
    expect(q.processing).toBe(false);
  }
);
it('migrate-08-02: cancellation after unread restore refuses unknown tasks', () => {
  const first = new OfflineQueue();
  const a = seedLegacyTask(first, { requestData: { value: 1 } });
  blocked = 'EXAM_OFFLINE_QUEUE';
  const second = new OfflineQueue();
  expect(second.dequeue(a)).toBe(false);
  blocked = null;
  expect(second.clear()).toBe(true);
  expect(read('EXAM_OFFLINE_QUEUE').map((x) => x.id)).toEqual([a]);
});
it('writes-08-01: unavailable analytics cannot abort core launch and show retries init', () => {
  const prior = { id: 'previous-event', name: 'original' };
  storageService.save('analytics_events', [prior], true, captureSession());
  blocked = 'u_account-1_analytics_events';
  const app = {
    $pinia: createPinia(),
    initApiErrorInterceptor: vi.fn(),
    initRouteGuard: vi.fn(),
    initThemeSystem: vi.fn(),
    performSilentLogin: vi.fn(),
    switchTheme: vi.fn()
  };
  expect(() => App.onLaunch.call(app)).not.toThrow();
  expect(app.initRouteGuard).toHaveBeenCalledOnce();
  blocked = null;
  App.onShow.call(app);
  expect(analytics.isInitialized).toBe(true);
  expect(
    [...analytics.eventQueue, ...storageService.get('analytics_uploaded', [])].some((x) => x.id === prior.id)
  ).toBe(true);
  const timersBeforeUnmount = vi.getTimerCount();
  App.beforeUnmount.call(app);
  expect(vi.getTimerCount()).toBe(timersBeforeUnmount - 1);
});
it('regress-8-02: initially unread precheck binds after recovery and refreshes', async () => {
  await tokenRefreshPlugin.saveTokens('fixture-access', 'fixture-refresh', 240);
  const refresh = vi.fn(async () => ({ accessToken: 'renewed', refreshToken: 'fixture-refresh', expiresIn: 3600 }));
  blocked = '_enc_EXAM_SESSION_EPOCH';
  tokenRefreshPlugin.init({ refreshTokenFn: refresh });
  await vi.advanceTimersByTimeAsync(60000);
  blocked = null;
  await vi.advanceTimersByTimeAsync(60000);
  expect(refresh).toHaveBeenCalledOnce();
  expect(tokenRefreshPlugin._preCheckTimer).not.toBeNull();
});
it('writes-08-02: rebinding clears old reminder intervals before resetting', async () => {
  questionTimer.start({ customTimeLimit: 1 });
  login(2);
  const tick = vi.fn(),
    timeout = vi.fn();
  questionTimer.start({ customTimeLimit: 1, notificationsEnabled: false, onTick: tick, onTimeout: timeout });
  await vi.advanceTimersByTimeAsync(2000);
  expect(tick).not.toHaveBeenCalled();
  expect(timeout).not.toHaveBeenCalled();
  questionTimer.stop();
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['sending', 'confirmed'])('normal restored states: %s keeps stable id and handles receipt', async (state) => {
  const q = new OfflineQueue(),
    id = seedLegacyTask(q, { requestData: { value: 1 } });
  const saved = read('EXAM_OFFLINE_QUEUE');
  saved[0].state = state;
  uni.setStorageSync('EXAM_OFFLINE_QUEUE', saved);
  const restored = new OfflineQueue(),
    send = vi.fn(async () => ({ success: true }));
  restored.registerRebuilder(send);
  expect(restored.queue[0]).toMatchObject({ id, state: state === 'sending' ? 'retry' : state });
  const result = restored.processQueue();
  await vi.runAllTimersAsync();
  expect(await result).toMatchObject({ success: true, processed: 1 });
  expect(send).toHaveBeenCalledTimes(state === 'sending' ? 1 : 0);
});
it('normal unread cancellation: clear affects known ids and refuses unknown ids', () => {
  const first = new OfflineQueue(),
    a = seedLegacyTask(first, { requestData: { value: 1 } });
  blocked = 'EXAM_OFFLINE_QUEUE';
  const q = new OfflineQueue();
  expect(q.dequeue(a)).toBe(false);
  blocked = null;
  expect(q.clear()).toBe(true);
  expect(read('EXAM_OFFLINE_QUEUE').map((x) => x.id)).toEqual([a]);
});
it('normal reminders: enabled binding fires once and an old callback cannot target a new token', async () => {
  const callbacks = [],
    original = globalThis.setInterval;
  vi.spyOn(globalThis, 'setInterval').mockImplementation((fn, delay) => {
    callbacks.push(fn);
    return original(fn, delay);
  });
  const timeout = vi.fn();
  questionTimer.start({ customTimeLimit: 1, onTimeout: timeout });
  await vi.advanceTimersByTimeAsync(1000);
  expect(timeout).toHaveBeenCalledOnce();
  login(2);
  const next = vi.fn();
  questionTimer.start({ notificationsEnabled: false, onTick: next });
  callbacks[0]();
  expect(next).not.toHaveBeenCalled();
  questionTimer.stop();
  expect(vi.getTimerCount()).toBe(0);
});
it('same-class timers: old generation progress cannot read or update a newer account', async () => {
  const { aiGenerationMixin } = await import('@/pages/practice-sub/composables/ai-generation-mixin.js');
  const page = {
    ...aiGenerationMixin.methods,
    generationSession: captureSession(),
    progressTimer: null,
    updateGenerationProgress: vi.fn()
  };
  aiGenerationMixin.methods.startProgressTimer.call(page);
  login(2);
  await vi.advanceTimersByTimeAsync(1000);
  expect(page.updateGenerationProgress).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it('same-class startup: failed sound preference reads remain silent and retry saved preference', async () => {
  uni.setStorageSync('quiz_sound_enabled', false);
  blocked = 'quiz_sound_enabled';
  const sound = await import('@/pages/practice-sub/utils/quiz-sound.js');
  expect(sound.isSoundEnabled()).toBe(false);
  blocked = null;
  expect(sound.isSoundEnabled()).toBe(false);
  sound.setSoundEnabled(true);
  expect(sound.isSoundEnabled()).toBe(true);
  sound.destroySoundResources();
});
it('same-class startup: study engine factory stays complete and restores pending state', async () => {
  const { useStudyEngineStore } = await import('@/stores/modules/study-engine.js');
  storageService.save(
    'study_engine_state_v1',
    { currentSession: { id: 'original-session' }, sessionHistory: [{ id: 'saved-history' }] },
    true,
    captureSession()
  );
  blocked = 'u_account-1_study_engine_state_v1';
  let engine;
  expect(() => {
    engine = useStudyEngineStore();
  }).not.toThrow();
  expect(typeof engine.startSession).toBe('function');
  blocked = null;
  expect(useStudyEngineStore()).toBe(engine);
  expect(await engine.startSession()).toMatchObject({ success: true, data: { id: 'original-session' }, reused: true });
  expect(engine.sessionHistory).toEqual([{ id: 'saved-history' }]);
  engine.$dispose();
});
it('normal legacy state migration: unknown send state restores retry and stable id', async () => {
  const id = 'legacy-stable-fixture';
  uni.setStorageSync('EXAM_OFFLINE_QUEUE', [
    {
      id,
      timestamp: Date.now(),
      retryCount: 2,
      priority: 'normal',
      session: captureSession(),
      dedupeKey: 'same',
      requestData: { value: 1 }
    }
  ]);
  const queue = new OfflineQueue();
  expect(queue.queue[0]).toMatchObject({ id, state: 'retry', retryCount: 2 });
  const send = vi.fn(async () => ({ success: true }));
  queue.registerRebuilder(send);
  const pending = queue.processQueue();
  await vi.runAllTimersAsync();
  expect(await pending).toMatchObject({ success: true, processed: 1 });
  expect(send.mock.calls.map(([body]) => body.value)).toEqual([1]);
});
