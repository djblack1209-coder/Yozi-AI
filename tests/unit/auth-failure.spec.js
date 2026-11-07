import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, getActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { storageService } from '@/services/storageService.js';
import {
  captureSession,
  readSessionSnapshot,
  sessionForRequest,
  readIdentityGeneration
} from '@/services/auth-storage.js';
import { useUserStore } from '@/stores';
import {
  isAuthenticationFailure,
  reportAuthenticationFailure,
  clearFailedAuthentication
} from '@/services/auth-failure.js';
import { learningRequest } from '@/services/api/domains/learning.api.js';
import { generateLearningTurnStream } from '@/services/learning/learning-stream.js';
import { request } from '@/services/api/domains/_request-core.js';
import App from '@/App.vue';
import WebsiteHome from '@/components/business/website/website-home.vue';
vi.mock('@dcloudio/uni-app', () => ({ onShow: vi.fn(), onHide: vi.fn(), onLoad: vi.fn(), onBackPress: vi.fn() }));

let listeners, user;
const signIn = (id = 'u1', token = 'unit-credential-a') =>
  storageService.saveLoginSession({ userId: id, token, userInfo: { _id: id } });
const bind = () =>
  uni.$on('authFailure', (event) => {
    void clearFailedAuthentication(event, (options) => user.logout(options));
  });
const reply = (statusCode, data) =>
  uni.request.mockImplementation(({ success }) => {
    success({ statusCode, data });
    return { abort: vi.fn() };
  });
beforeEach(async () => {
  uni.clearStorageSync();
  setActivePinia(createPinia());
  vi.clearAllMocks();
  listeners = new Map();
  uni.$on.mockImplementation((name, fn) => {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn);
  });
  uni.$off.mockImplementation((name, fn) => listeners.get(name)?.delete(fn));
  uni.$emit.mockImplementation((name, ...args) => {
    for (const fn of listeners.get(name) || []) fn(...args);
  });
  await signIn();
  user = useUserStore();
  await user.silentLogin();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  [{ code: 401, success: false }, 200, true],
  [{}, 401, true],
  [{ code: 403, errorCode: 'ACCOUNT_UNAVAILABLE' }, 200, true],
  [{ code: 503, errorCode: 'AUTH_CHECK_UNAVAILABLE' }, 200, false],
  [{ code: 403 }, 403, false],
  [{ code: 503 }, 503, false],
  [{ code: 401, connectionError: 'KEY_INVALID' }, 401, false],
  [{ code: 401, errorCode: 'KEY_INVALID' }, 200, false],
  [{ code: 429, errorCode: 'RATE_LIMITED' }, 429, false],
  [{ code: 0, success: true, errorCode: 'AUTH_REQUIRED' }, 200, false],
  [{ code: 0, success: true }, 401, true]
])(
  'distinguishes account rejection from provider, permission and transient errors: %j',
  (value, httpStatus, expected) => {
    expect(isAuthenticationFailure(value, httpStatus)).toBe(expected);
  }
);
it.each([200, 401])(
  'clears the authenticated session on learning HTTP %s/auth rejection and keeps owned records',
  async (statusCode) => {
    const origin = captureSession();
    storageService.save('conversation_learning_v1', { owner: 'u1', preserved: true }, true, origin);
    bind();
    reply(statusCode, { code: 401, success: false, errorCode: 'ACCOUNT_UNAVAILABLE' });
    const result = await learningRequest('/learning-sync', { action: 'pull' }, { session: origin });
    await flushPromises();
    expect(result.code).toBe(401);
    expect(captureSession().owner).toBe('guest');
    expect(readSessionSnapshot().token).toBeNull();
    expect(user.isLogin).toBe(false);
    expect(storageService.get('conversation_learning_v1', null)).toBeNull();
    await signIn('u2', 'unit-credential-b');
    expect(storageService.get('conversation_learning_v1', null)).toBeNull();
    await signIn();
    expect(storageService.get('conversation_learning_v1', null)).toEqual({ owner: 'u1', preserved: true });
  }
);
it.each([200, 401])(
  'clears generic API HTTP %s/auth rejection even when navigation is suppressed',
  async (statusCode) => {
    const session = captureSession();
    bind();
    reply(statusCode, { code: 401, success: false });
    const result = await request(
      '/user-profile',
      { action: 'get', userId: 'u1' },
      { session, suppressAuthFailure: true, skipNetworkCheck: true, skipRateLimit: true, maxRetries: 0 }
    ).catch((error) => error);
    await flushPromises();
    expect(result.code).toBe(401);
    expect(captureSession().owner).toBe('guest');
    expect(uni.$emit.mock.calls.find(([name]) => name === 'authFailure')[1].silent).toBe(true);
  }
);
it('startup defers navigation but never ignores credential revocation', async () => {
  App.methods.initApiErrorInterceptor.call({});
  reply(200, { code: 401, success: false, errorCode: 'ACCOUNT_UNAVAILABLE' });
  await learningRequest('/learning-sync', { action: 'pull' }, { session: captureSession() });
  await flushPromises();
  expect(captureSession().owner).toBe('guest');
  expect(uni.navigateTo).not.toHaveBeenCalled();
});
it.each(['renewed-token', 'new-login', 'other-account'])(
  'ignores a late authentication rejection after %s',
  async (change) => {
    const session = captureSession(),
      credentialProof = sessionForRequest(session).session.proof;
    if (change === 'renewed-token') await storageService.save('EXAM_TOKEN', 'unit-new-token', true, session);
    else await signIn(change === 'other-account' ? 'u2' : 'u1', 'unit-new-token');
    const logout = vi.fn();
    expect(reportAuthenticationFailure({ code: 401 }, { session, credentialProof, path: '/learning-sync' })).toBe(
      false
    );
    expect(await clearFailedAuthentication({ session, credentialProof }, logout)).toBe(false);
    expect(logout).not.toHaveBeenCalled();
    expect(readSessionSnapshot().token).toBe('unit-new-token');
  }
);
it('checks the sent credential proof again inside the identity write lock', async () => {
  const session = captureSession(),
    proof = sessionForRequest(session).session.proof;
  await storageService.save('EXAM_TOKEN', 'unit-new-token', true, session);
  const generation = readIdentityGeneration();
  expect(storageService._clearRevokedCredentialsLocked(session, false, generation, false, {}, proof)).toBe(false);
  expect(readSessionSnapshot().token).toBe('unit-new-token');
});
it('preserves identity when storage cannot be read instead of treating it as logout', async () => {
  const session = captureSession(),
    credentialProof = sessionForRequest(session).session.proof;
  const original = uni.getStorageSync.getMockImplementation();
  const read = vi.spyOn(uni, 'getStorageSync').mockImplementation((key) => {
    if (key === '_enc_EXAM_SESSION_EPOCH' || key === 'EXAM_SESSION_EPOCH') throw new Error('unit unreadable');
    return original(key);
  });
  const logout = vi.fn();
  expect(reportAuthenticationFailure({ code: 401 }, { session, credentialProof, path: '/learning-sync' })).toBe(false);
  expect(await clearFailedAuthentication({ session, credentialProof }, logout)).toBe(false);
  expect(logout).not.toHaveBeenCalled();
  read.mockRestore();
  expect(readSessionSnapshot().token).toBe('unit-credential-a');
});
it('provider key errors do not log out the student', async () => {
  bind();
  reply(401, { code: 401, success: false, connectionError: 'KEY_INVALID' });
  const result = await learningRequest('/learning-models', { action: 'test' }, { session: captureSession() });
  await flushPromises();
  expect(result.connectionError).toBe('KEY_INVALID');
  expect(captureSession().owner).toBe('u1');
  expect(uni.$emit.mock.calls.filter(([name]) => name === 'authFailure')).toHaveLength(0);
});
it.each([false, true])(
  'clears an authenticated H5 stream rejection and releases its reader, malformed=%s',
  async (malformed) => {
    bind();
    const data = new TextEncoder().encode(
      malformed
        ? 'unit non-json error'
        : JSON.stringify({ code: 401, success: false, errorCode: 'ACCOUNT_UNAVAILABLE' })
    );
    let read = false;
    const reader = {
      read: async () => (read ? { done: true } : ((read = true), { done: false, value: data })),
      cancel: vi.fn(async () => undefined),
      releaseLock: vi.fn()
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        body: { getReader: () => reader }
      }))
    );
    const result = await generateLearningTurnStream(
      { modelId: 'unit-model', requestId: 'unit-request', shareConsent: true, learningContext: { owner: 'u1' } },
      { session: captureSession(), platform: 'h5' }
    );
    await flushPromises();
    expect(result.code).toBe(401);
    expect(captureSession().owner).toBe('guest');
    expect(reader.cancel).toHaveBeenCalledOnce();
    expect(reader.releaseLock).toHaveBeenCalledOnce();
  }
);
it('a delayed learning response cannot clear a renewed token', async () => {
  bind();
  const session = captureSession();
  let complete;
  uni.request.mockImplementation(({ success }) => {
    complete = success;
    return { abort: vi.fn() };
  });
  const pending = learningRequest('/learning-sync', { action: 'pull' }, { session });
  await storageService.save('EXAM_TOKEN', 'unit-new-token', true, session);
  complete({ statusCode: 200, data: { code: 401, success: false } });
  await pending;
  await flushPromises();
  expect(readSessionSnapshot().token).toBe('unit-new-token');
  expect(captureSession().owner).toBe('u1');
  expect(uni.$emit.mock.calls.filter(([name]) => name === 'authFailure')).toHaveLength(0);
});
it('the website returns to its visitor view after a deleted-account response, not signed-in empty progress', async () => {
  App.methods.initApiErrorInterceptor.call({});
  reply(200, { code: 401, success: false, errorCode: 'ACCOUNT_UNAVAILABLE' });
  const page = mount(WebsiteHome, {
    global: {
      plugins: [getActivePinia()],
      stubs: {
        NomiLanding: { template: '<div data-test="visitor">Download app or sign in</div>' },
        AnimatedAvatar: true,
        BaseIcon: true,
        view: { template: '<div><slot /></div>' },
        text: { template: '<span><slot /></span>' }
      }
    }
  });
  try {
    await vi.dynamicImportSettled();
    await flushPromises();
    expect(captureSession().owner).toBe('guest');
    expect(page.find('[data-test="visitor"]').exists()).toBe(true);
    expect(page.text()).not.toContain('No synced learning records yet');
    expect(page.find('.portal-metrics').exists()).toBe(false);
  } finally {
    page.unmount();
  }
});
