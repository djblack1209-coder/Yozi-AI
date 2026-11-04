import crypto from 'node:crypto';
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { HISTORY_LIMITS, encodeHistory, historyAssert } from './learning-history.js';
import { INTAKE_SCOPE_REPLAY_CONTRACT } from './learning-intake.js';

const compress = promisify(gzip),
  decompress = promisify(gunzip);
const FORMAT = 'learning-gzip-v1';
// Base64 约 10.7 MiB，给 BSON 的 16 MiB 上限保留余量；解压也有硬边界。
const MAX_PACKED = 8 * 1024 * 1024;
export function checkHistoryState(state: any, owner: string) {
  historyAssert(state?.owner === owner && state.version === 1, 'OWNER_MISMATCH', '学习历史账户或版本不匹配');
  historyAssert(
    Number.isInteger(state.revision) &&
      state.revision >= 0 &&
      [
        'events',
        'conversations',
        'questions',
        'materials',
        'attempts',
        'plans',
        'reviews',
        'executions',
        'profile'
      ].every((key) => Array.isArray(state[key])) &&
      state.events.length <= HISTORY_LIMITS.operations &&
      JSON.stringify(state).length <= HISTORY_LIMITS.stateCharacters,
    'RESOURCE_LIMIT',
    '学习历史结构无效或超过容量边界'
  );
  return state;
}
export async function encodeServerHistory(state: any, owner: string) {
  checkHistoryState(state, owner);
  const text = JSON.stringify(state);
  if (text.length < HISTORY_LIMITS.pageCharacters) return state;
  const packed = await compress(Buffer.from(text), { level: 3, maxOutputLength: MAX_PACKED });
  return {
    format: FORMAT,
    owner,
    characters: text.length,
    digest: crypto.createHash('sha256').update(text).digest('hex'),
    payload: packed.toString('base64')
  };
}
export async function decodeServerHistory(value: any, owner: string) {
  if (value?.format !== FORMAT) return checkHistoryState(value, owner);
  historyAssert(value.owner === owner, 'OWNER_MISMATCH', '压缩历史属于其他账户');
  historyAssert(
    typeof value.payload === 'string' &&
      value.payload.length <= Math.ceil(MAX_PACKED / 3) * 4 &&
      value.payload.length % 4 === 0 &&
      !/[^a-zA-Z0-9+/=]/.test(value.payload) &&
      Number.isInteger(value.characters) &&
      value.characters > 0 &&
      value.characters <= HISTORY_LIMITS.stateCharacters &&
      /^[a-f0-9]{64}$/.test(value.digest),
    'INVALID_HISTORY',
    '压缩历史损坏或超限'
  );
  const bytes = Buffer.from(value.payload, 'base64');
  historyAssert(
    bytes.length <= MAX_PACKED && bytes.toString('base64') === value.payload,
    'INVALID_HISTORY',
    '压缩编码不合法'
  );
  const text = (
    await decompress(bytes, {
      maxOutputLength: HISTORY_LIMITS.stateCharacters * 4
    })
  ).toString('utf8');
  historyAssert(
    text.length === value.characters && crypto.createHash('sha256').update(text).digest('hex') === value.digest,
    'CORRUPT_HISTORY_PAGE',
    '压缩历史校验不一致'
  );
  return checkHistoryState(JSON.parse(text), owner);
}
export function historyWire(state: any, revision: number) {
  return encodeHistory(state, state.owner, `revision_${revision.toString(36).padStart(8, '0')}`);
}
export function syncWireResult(result: any, compact = false) {
  const { state, accepted, revision } = result;
  const intakeScopeReplayContracts = [INTAKE_SCOPE_REPLAY_CONTRACT];
  if (compact) return { accepted, revision, snapshotRequired: true, intakeScopeReplayContracts };
  if (JSON.stringify(state).length < HISTORY_LIMITS.pageCharacters) return { ...result, intakeScopeReplayContracts };
  return { history: historyWire(state, revision).manifest, accepted, revision, intakeScopeReplayContracts };
}
