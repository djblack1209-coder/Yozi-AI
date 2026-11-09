import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { storageService } from '@/services/storageService.js';
import {
  captureSession,
  checkSession,
  getLoginSessionEpoch,
  getToken,
  getUserId,
  readIdentityRecord,
  readStorageStrict
} from '@/services/auth-storage.js';
import { obfuscate } from '@/utils/crypto/cipher.js';

const login = (n = 1) => storageService.saveLoginSession({ userId: `account-${n}`, token: `fixture-${n}` });
beforeEach(async () => {
  uni.clearStorageSync();
  await login();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('uses the native key list only to confirm a missing App storage key', () => {
  const runtime = {
    getStorageSync: vi.fn(() => ''),
    getStorageInfoSync: vi.fn(() => ({ keys: ['present'] }))
  };
  const getAllKeys = vi.fn(() => ['present']);
  vi.stubGlobal('uni', runtime);
  vi.stubGlobal('plus', { storage: { getAllKeys } });

  expect(readStorageStrict(runtime, 'absent')).toBe('');
  expect(runtime.getStorageInfoSync).not.toHaveBeenCalled();
  expect(() => readStorageStrict(runtime, 'present')).toThrow(expect.objectContaining({ code: 'SESSION_UNAVAILABLE' }));

  getAllKeys.mockReturnValueOnce(null);
  expect(() => readStorageStrict(runtime, 'present')).toThrow(expect.objectContaining({ code: 'SESSION_UNAVAILABLE' }));
  expect(runtime.getStorageInfoSync).toHaveBeenCalledTimes(2);
});

it.each(['sign-out', 'revocation', 'account-switch'])(
  'settled %s invalidates a leftover epoch without requiring a retry',
  async (change) => {
    const origin = captureSession();
    const stale = readIdentityRecord();
    if (change === 'account-switch') await login(2);
    else if (change === 'revocation') storageService.remove('EXAM_SESSION_EPOCH', true);
    else storageService._clearRevokedCredentials();
    // A legacy migration can finish its physical write after another tab revokes it.
    uni.setStorageSync('_enc_EXAM_SESSION_EPOCH', obfuscate(stale));
    const generation = uni.getStorageSync('EXAM_IDENTITY_GENERATION');
    expect(getLoginSessionEpoch()).toBeNull();
    expect(getToken()).toBeNull();
    expect(getUserId()).toBeNull();
    expect(captureSession()).toBeNull();
    expect(checkSession(origin)).toBe('changed');
    expect(uni.getStorageSync('EXAM_IDENTITY_GENERATION')).toBe(generation);
  }
);

it('stable revocation marker mismatch invalidates an otherwise matching generation', () => {
  const origin = captureSession();
  uni.setStorageSync('EXAM_SESSION_REVOCATION', 'revoked_fixture');
  expect(getLoginSessionEpoch()).toBeNull();
  expect(getToken()).toBeNull();
  expect(getUserId()).toBeNull();
  expect(captureSession()).toBeNull();
  expect(checkSession(origin)).toBe('changed');
});

it('a stable record ahead of the committed generation remains retryable', () => {
  const record = readIdentityRecord();
  uni.setStorageSync('_enc_EXAM_SESSION_EPOCH', obfuscate({ ...record, generation: record.generation + 1 }));
  for (const read of [getLoginSessionEpoch, getToken, getUserId]) {
    expect(read).toThrow(expect.objectContaining({ code: 'SESSION_UNAVAILABLE' }));
  }
  expect(captureSession()).toBeNull();
});

it.each([
  ['epoch', getLoginSessionEpoch],
  ['token', getToken],
  ['owner', getUserId]
])('a generation change during the %s read stays retryable', (_kind, readValue) => {
  const read = uni.getStorageSync.getMockImplementation();
  let recordRead = false;
  let changed = false;
  uni.getStorageSync.mockImplementation((key) => {
    if (key === '_enc_EXAM_SESSION_EPOCH') recordRead = true;
    if (key === 'EXAM_IDENTITY_GENERATION' && recordRead && !changed) {
      changed = true;
      uni.setStorageSync(key, read(key) + 1);
    }
    return read(key);
  });
  expect(readValue).toThrow(expect.objectContaining({ code: 'SESSION_UNAVAILABLE' }));
  expect(changed).toBe(true);
  uni.getStorageSync.mockImplementation(read);
  expect(getLoginSessionEpoch()).toBeNull();
});
