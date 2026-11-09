/**
 * 认证信息存储工具（独立模块）
 *
 * 从 storageService.js 中提取，避免 storageService 与 API 请求层循环依赖。
 * 两个模块都可以安全地导入此文件，不会产生循环引用。
 *
 * ✅ 加密/解密逻辑已提取到 utils/crypto/cipher.js 共享模块
 */

import { supportsIdentityWrites } from './identity-context.js';
import { deobfuscate } from '../utils/crypto/cipher.js';

const LOCAL_COMPAT_PREFIX = '__exam_storage__:';

function readCompatLocalStorage(key) {
  if (typeof localStorage === 'undefined') {
    return '';
  }

  const directValue = localStorage.getItem(key);
  if (directValue !== null) {
    return directValue;
  }

  const compatValue = localStorage.getItem(`${LOCAL_COMPAT_PREFIX}${key}`);
  if (compatValue === null) {
    return '';
  }

  try {
    const parsed = JSON.parse(compatValue);
    if (parsed && typeof parsed === 'object' && Object.prototype.hasOwnProperty.call(parsed, 'value')) {
      return parsed.value;
    }
  } catch {
    // ignore parse failure, fallback to raw value
  }

  return compatValue;
}

function normalizeStringValue(value) {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return '';
}

function safeGetStorageSync(key, strict = false) {
  try {
    // 与 storageService 使用同一个完整存储运行时。静态 uni 访问会被编译器
    // 改写成另一套 H5 读取函数，导致兼容存储中的已登录账户被读成访客。
    const supportsStorage = (candidate) =>
      candidate &&
      ['getStorageSync', 'setStorageSync', 'removeStorageSync'].every(
        (method) => typeof Reflect.get(candidate, method) === 'function'
      );
    const globalRef = typeof globalThis !== 'undefined' ? globalThis : {};
    const runtimeUni = globalRef['uni'];
    const runtimeWx = globalRef['wx'];
    const runtime = supportsStorage(runtimeUni)
      ? runtimeUni
      : supportsStorage(runtimeWx)
        ? runtimeWx
        : typeof wx !== 'undefined' && supportsStorage(wx)
          ? wx
          : null;
    if (runtime) return readStorageStrict(runtime, key, strict);
  } catch (error) {
    if (strict) throw error;
  }

  try {
    return readCompatLocalStorage(key);
  } catch (error) {
    if (strict) throw error;
  }

  return '';
}

// A runtime may swallow native read errors and return ''. Existing nonempty keys
// cannot silently become guests. Never cross runtime boundaries after a failed read.
export function readStorageStrict(runtime, key, strict = true, { allowEmpty = false } = {}) {
  const reader = strict && runtime.getStorageSyncStrict ? 'getStorageSyncStrict' : 'getStorageSync';
  const value = Reflect.get(runtime, reader).call(runtime, key);
  if (strict && !allowEmpty && (value === '' || value === undefined || value === null) && runtime.getStorageInfoSync) {
    // #ifdef APP-PLUS
    if (reader === 'getStorageSync' && typeof plus !== 'undefined' && runtime === globalThis.uni) {
      // Use the native key list to establish absence without reading stored values to calculate capacity.
      const keys = plus.storage?.getAllKeys?.();
      if (Array.isArray(keys) && !keys.includes(key)) return value;
    }
    // #endif
    const info = runtime.getStorageInfoSync();
    if (!Array.isArray(info?.keys) || info.keys.includes(key)) throw sessionUnavailable();
  }
  return value;
}
export class SessionUnavailableError extends Error {
  constructor() {
    super('登录状态暂不可读，请重试');
    this.name = 'SessionUnavailableError';
    this.code = 'SESSION_UNAVAILABLE';
  }
}
export const sessionUnavailable = () => new SessionUnavailableError();
export const isSessionUnavailable = (error) =>
  error?.code === 'SESSION_UNAVAILABLE' || error?.errorCode === 'SESSION_UNAVAILABLE';

function getStoredAuthValue(key) {
  if (!supportsIdentityWrites()) return null;
  let record, encrypted, plain;
  try {
    const generation = readIdentityGeneration();
    record = strictAuthValue(LOGIN_SESSION_EPOCH_KEY);
    if (record && typeof record === 'object' && typeof record.token === 'string') {
      const revocation = safeGetStorageSync(SESSION_REVOCATION_KEY, true) || null;
      if (generation !== readIdentityGeneration()) throw sessionUnavailable();
      if (record.generation > generation) throw sessionUnavailable();
      if ((generation > 0 || record.generation !== undefined) && record.generation !== generation) return null;
      if ('revocation' in record && record.revocation !== revocation) return null;
      return key === 'EXAM_USER_ID' ? record.owner : record.token;
    }
    encrypted = normalizeStringValue(safeGetStorageSync(`_enc_${key}`, true));
    plain = normalizeStringValue(safeGetStorageSync(key, true));
    if (generation !== readIdentityGeneration()) throw sessionUnavailable();
  } catch {
    throw sessionUnavailable();
  }
  if (encrypted) {
    try {
      const value = deobfuscate(encrypted);
      if (value !== null) return value;
    } catch {
      /* Legacy corrupt alias may use its readable plain copy. */
    }
  }
  return plain || null;
}

/**
 * 获取当前用户ID（统一入口）
 */
export const getUserId = () => getStoredAuthValue('EXAM_USER_ID');

/**
 * 获取当前用户Token（统一入口）
 */
export const getToken = () => getStoredAuthValue('EXAM_TOKEN');

export const LOGIN_SESSION_EPOCH_KEY = 'EXAM_SESSION_EPOCH';

export const SESSION_ENABLED_KEY = 'EXAM_SESSION_ENABLED';
export const LOGIN_ATTEMPT_KEY = 'EXAM_LOGIN_ATTEMPT';
export const SESSION_REVOCATION_KEY = 'EXAM_SESSION_REVOCATION';
export const IDENTITY_GENERATION_KEY = 'EXAM_IDENTITY_GENERATION';
export function readIdentityGeneration() {
  const value = safeGetStorageSync(IDENTITY_GENERATION_KEY, true);
  if (value === '' || value === null || value === undefined) return 0;
  if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) throw sessionUnavailable();
  return value;
}

// Synchronous SHA-256: supported by uni/wx as well as browsers, with no async credential gap.
// This digest detects torn identity writes; it is never an authorization credential or logged.
const shaPrimes = [];
for (let n = 2; shaPrimes.length < 64; n++) {
  if (!shaPrimes.some((p) => n % p === 0)) shaPrimes.push(n);
}
const shaConstants = shaPrimes.map((p) => (Math.cbrt(p) * 0x100000000) | 0);
let lastCredentialProof;
export function sessionCredentialProof(owner, token) {
  if (lastCredentialProof?.owner === owner && lastCredentialProof.token === token) return lastCredentialProof.value;
  const text = unescape(encodeURIComponent(JSON.stringify([owner, token])));
  const words = [];
  for (let i = 0; i < text.length; i++)
    words[i >> 2] = (words[i >> 2] || 0) | (text.charCodeAt(i) << (24 - (i % 4) * 8));
  words[text.length >> 2] = (words[text.length >> 2] || 0) | (0x80 << (24 - (text.length % 4) * 8));
  const length = (((text.length + 8) >> 6) + 1) * 16;
  words[length - 1] = text.length * 8;
  let hash = shaPrimes.slice(0, 8).map((p) => (Math.sqrt(p) * 0x100000000) | 0);
  const rotate = (v, n) => (v >>> n) | (v << (32 - n));
  for (let offset = 0; offset < length; offset += 16) {
    const w = [];
    let [a, b, c, d, e, f, g, h] = hash;
    for (let i = 0; i < 64; i++) {
      if (i < 16) w[i] = words[offset + i] | 0;
      else {
        const x = w[i - 15],
          y = w[i - 2];
        w[i] =
          (w[i - 16] +
            (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3)) +
            w[i - 7] +
            (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10))) |
          0;
      }
      const first =
        (h + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + shaConstants[i] + w[i]) | 0;
      const second = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + first) | 0;
      d = c;
      c = b;
      b = a;
      a = (first + second) | 0;
    }
    hash = hash.map((v, i) => (v + [a, b, c, d, e, f, g, h][i]) | 0);
  }
  const value = hash.map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('');
  lastCredentialProof = { owner, token, value };
  return value;
}
const decodedAuth = new Map();
function strictAuthValue(key) {
  const encrypted = normalizeStringValue(safeGetStorageSync(`_enc_${key}`, true));
  if (encrypted) {
    const value = decodedAuth.has(encrypted) ? decodedAuth.get(encrypted) : deobfuscate(encrypted);
    if (value === null) throw new Error('登录状态暂不可读，请重试');
    decodedAuth.set(encrypted, value);
    if (decodedAuth.size > 12) decodedAuth.delete(decodedAuth.keys().next().value);
    return value;
  }
  return safeGetStorageSync(key, true) || null;
}
const validEpoch = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,120}$/.test(value);
export const getLoginSessionEpoch = () => {
  if (!supportsIdentityWrites()) return null;
  const generation = readIdentityGeneration();
  const value = strictAuthValue(LOGIN_SESSION_EPOCH_KEY);
  const revocation = safeGetStorageSync(SESSION_REVOCATION_KEY, true) || null;
  if (generation !== readIdentityGeneration()) throw sessionUnavailable();
  // A future record has not committed yet; an older record is settled revocation.
  if (value?.generation > generation) throw sessionUnavailable();
  if (
    value &&
    typeof value === 'object' &&
    (generation > 0 || value.generation !== undefined) &&
    value.generation !== generation
  )
    return null;
  if (value && typeof value === 'object' && 'revocation' in value && value.revocation !== revocation) return null;
  return validEpoch(value?.epoch) ? value.epoch : validEpoch(value) ? value : null;
};

// Cache only verified format aliases. They are identity bindings, never credentials.
const migratedEpochs = new Map();
export const sessionBindingEpoch = (session) => {
  const id = JSON.stringify([session?.owner, session?.epoch]);
  return migratedEpochs.has(id) ? migratedEpochs.get(id) : session?.epoch;
};
export const readIdentityRecord = () => strictAuthValue(LOGIN_SESSION_EPOCH_KEY);

export function readSessionSnapshot() {
  if (!supportsIdentityWrites())
    return {
      status: 'current',
      session: Object.freeze({ owner: 'guest', epoch: 'unsupported_browser_guest' }),
      token: null,
      enabled: true,
      reason: 'BROWSER_UPGRADE_REQUIRED'
    };
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const generation = readIdentityGeneration();
      const revocation = safeGetStorageSync(SESSION_REVOCATION_KEY, true) || null;
      const before = strictAuthValue(LOGIN_SESSION_EPOCH_KEY);
      // New commits carry the complete identity in one encrypted value. Aliases are compatibility only.
      const complete = before && typeof before.token === 'string';
      const owner = normalizeStringValue(complete ? before.owner : strictAuthValue('EXAM_USER_ID')) || 'guest';
      const token = normalizeStringValue(complete ? before.token : strictAuthValue('EXAM_TOKEN')) || null;
      const enabled = !!safeGetStorageSync(SESSION_ENABLED_KEY, true);
      const after = strictAuthValue(LOGIN_SESSION_EPOCH_KEY);
      if (generation !== readIdentityGeneration()) continue;
      if (complete && before.generation > generation) return { status: 'unavailable', session: null, token: null };
      if (complete && (generation > 0 || before.generation !== undefined) && before.generation !== generation)
        return { status: 'changed', session: Object.freeze({ owner, epoch: null }), token: null, enabled };
      if (revocation !== (safeGetStorageSync(SESSION_REVOCATION_KEY, true) || null)) continue;
      if (before && typeof before === 'object' && 'revocation' in before && before.revocation !== revocation)
        return { status: 'changed', session: Object.freeze({ owner, epoch: null }), token, enabled };
      if (before !== after && JSON.stringify(before) !== JSON.stringify(after)) continue;
      const epoch =
        owner === 'guest' && !token
          ? revocation
          : validEpoch(before?.epoch)
            ? before.epoch
            : validEpoch(before)
              ? before
              : null;
      if (
        before &&
        typeof before === 'object' &&
        (before.version !== 1 || before.owner !== owner || before.proof !== sessionCredentialProof(owner, token))
      )
        continue;
      if (enabled && before && (typeof before !== 'object' || !epoch)) continue;
      if (enabled && !epoch && (token || owner !== 'guest'))
        return { status: 'changed', session: Object.freeze({ owner, epoch }), token, enabled };
      if (token && owner === 'guest') continue;
      if (complete && Object.prototype.hasOwnProperty.call(before, 'migratedFrom'))
        migratedEpochs.set(JSON.stringify([owner, epoch]), before.migratedFrom);
      return {
        status: enabled && token && !epoch ? 'changed' : 'current',
        session: Object.freeze({ owner, epoch, proof: sessionCredentialProof(owner, token) }),
        token,
        enabled,
        generation,
        record: complete ? before : null
      };
    }
  } catch {
    // A storage exception is not evidence of logout. Never fall back to another runtime.
  }
  return { status: 'unavailable', session: null, token: null };
}
export function captureSession() {
  const snapshot = readSessionSnapshot();
  return snapshot.status === 'current' ? snapshot.session : null;
}
export function isSessionFormatMigration(session, snapshot = readSessionSnapshot()) {
  return (
    snapshot.status === 'current' &&
    !!session &&
    snapshot.session.owner === session.owner &&
    snapshot.record &&
    Object.prototype.hasOwnProperty.call(snapshot.record, 'migratedFrom') &&
    snapshot.record.migratedFrom === session.epoch &&
    snapshot.session.epoch !== session.epoch
  );
}
function sameBinding(session, snapshot) {
  return (
    session &&
    session.owner === snapshot.session.owner &&
    (session.epoch === snapshot.session.epoch || isSessionFormatMigration(session, snapshot))
  );
}
export function checkSession(session) {
  const snapshot = readSessionSnapshot();
  if (snapshot.status === 'unavailable') {
    // A confirmed different/missing epoch revokes old work even while the next login is incomplete.
    // A failed read or mismatched credentials within the same epoch remains retryable.
    try {
      const generation = readIdentityGeneration();
      const epoch =
        session?.owner === 'guest' ? safeGetStorageSync(SESSION_REVOCATION_KEY, true) || null : getLoginSessionEpoch();
      if (generation !== readIdentityGeneration()) return 'unavailable';
      // A formerly absent epoch may have been filled by a format migration. Until
      // the full record is readable, keep that old binding blocked but retryable.
      if (session && epoch !== session.epoch && (session.epoch !== null || epoch === null)) return 'changed';
    } catch {
      /* unavailable */
    }
    return 'unavailable';
  }
  if (snapshot.status !== 'current') return snapshot.status;
  return sameBinding(session, snapshot) ? 'current' : 'changed';
}
export function assertSession(session) {
  const status = checkSession(session);
  if (status === 'unavailable') throw sessionUnavailable();
  if (status !== 'current')
    throw Object.assign(new Error('登录会话已变化，请重新确认后继续'), { code: 'CONTEXT_CHANGED' });
  return session;
}
// Read credentials and validate the originating session together, immediately before transport.
export function sessionForRequest(session) {
  const snapshot = readSessionSnapshot();
  const status =
    snapshot.status !== 'current' ? snapshot.status : sameBinding(session, snapshot) ? 'current' : 'changed';
  if (status === 'unavailable') throw sessionUnavailable();
  if (status !== 'current') throw Object.assign(new Error('登录会话已变化，未发送旧内容'), { code: 'CONTEXT_CHANGED' });
  return snapshot;
}
