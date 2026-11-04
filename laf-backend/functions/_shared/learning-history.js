// 有界分页载荷；校验和只检测损坏，不是签名、授权或判分依据。
import { intakeScopeReplaySnapshot, normalizeIntakeScopeSnapshot } from './learning-intake.js';
export const HISTORY_FORMAT = 'learning-pages-v1';
export const HISTORY_PACKAGE = 'learning-history-v1';
export const HISTORY_LIMITS = Object.freeze({
  stateCharacters: 6000000,
  pageCharacters: 120000,
  operations: 20000,
  restoreBatch: 20
});
export function historyAssert(condition, code, message) {
  if (!condition) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
}
export function historyChecksum(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, '0');
}
export function splitHistoryText(text) {
  const pages = [];
  for (let offset = 0; offset < text.length;) {
    let end = Math.min(text.length, offset + HISTORY_LIMITS.pageCharacters);
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    pages.push(text.slice(offset, end));
    offset = end;
  }
  return pages;
}
export function encodeHistory(value, owner, generation, maximum = HISTORY_LIMITS.stateCharacters) {
  const text = JSON.stringify(value);
  historyAssert(
    typeof owner === 'string' && owner && /^[a-z0-9_-]{8,80}$/.test(generation),
    'INVALID_INPUT',
    '分页身份不合法'
  );
  historyAssert(text.length <= maximum, 'RESOURCE_LIMIT', '学习历史达到配置上限，请导出记录；不会自动删除旧记录');
  const pages = splitHistoryText(text);
  return {
    manifest: {
      format: HISTORY_FORMAT,
      owner,
      generation,
      characters: text.length,
      checksums: pages.map(historyChecksum)
    },
    pages
  };
}
export function validateHistoryManifest(manifest, owner, maximum = HISTORY_LIMITS.stateCharacters) {
  historyAssert(manifest?.format === HISTORY_FORMAT && manifest.owner === owner, 'OWNER_MISMATCH', '分页属于其他账户');
  historyAssert(
    Object.keys(manifest).every((key) => ['format', 'owner', 'generation', 'characters', 'checksums'].includes(key)) &&
      /^[a-z0-9_-]{8,80}$/.test(manifest.generation) &&
      Number.isInteger(manifest.characters) &&
      manifest.characters > 0 &&
      manifest.characters <= maximum &&
      Array.isArray(manifest.checksums) &&
      manifest.checksums.length > 0 &&
      manifest.checksums.length <= Math.ceil(maximum / (HISTORY_LIMITS.pageCharacters - 1)) &&
      manifest.checksums.every((hash) => /^[a-f0-9]{8}$/.test(hash)),
    'INVALID_HISTORY',
    '分页目录损坏或超限，原记录保留'
  );
  return manifest;
}
export function decodeHistory(manifest, pages, owner, maximum = HISTORY_LIMITS.stateCharacters) {
  validateHistoryManifest(manifest, owner, maximum);
  historyAssert(
    Array.isArray(pages) && pages.length === manifest.checksums.length,
    'MISSING_HISTORY_PAGE',
    '历史分页缺失，未采用不完整记录'
  );
  pages.forEach((page, index) =>
    historyAssert(
      typeof page === 'string' &&
        page.length <= HISTORY_LIMITS.pageCharacters &&
        historyChecksum(page) === manifest.checksums[index],
      'CORRUPT_HISTORY_PAGE',
      '历史分页损坏，未采用不完整记录'
    )
  );
  const text = pages.join('');
  historyAssert(text.length === manifest.characters, 'CORRUPT_HISTORY_PAGE', '历史长度不一致');
  try {
    return JSON.parse(text);
  } catch {
    historyAssert(false, 'INVALID_HISTORY', '历史不是有效 JSON');
  }
}
export function historyPageKey(generation, index) {
  historyAssert(
    /^[a-z0-9_-]{8,80}$/.test(generation) && Number.isInteger(index) && index >= 0 && index < 110,
    'INVALID_HISTORY',
    '历史分页标识不合法'
  );
  return `conversation_learning_v1_history_${generation}_${index}`;
}
export function readStoredHistory(value, get, owner, maximum = HISTORY_LIMITS.stateCharacters * 2) {
  if (value?.format !== HISTORY_FORMAT) return value;
  validateHistoryManifest(value, owner, maximum);
  return decodeHistory(
    value,
    value.checksums.map((_, index) => {
      const page = get(historyPageKey(value.generation, index));
      historyAssert(
        page?.owner === owner && page.generation === value.generation && page.index === index,
        'MISSING_HISTORY_PAGE',
        '历史分页缺失或账户不匹配'
      );
      return page.text;
    }),
    owner,
    maximum
  );
}
export function createHistoryPackage(state) {
  historyAssert(state.events.length <= HISTORY_LIMITS.operations, 'RESOURCE_LIMIT', '历史操作超过配置上限');
  const events = state.events.map((event) => {
    const { id, type, at, data } = event,
      intakeScope = intakeScopeReplaySnapshot(event);
    return { id, type, at, data, ...(intakeScope ? { intakeScope } : {}) };
  });
  const encoded = encodeHistory(events, state.owner, `export_${state.revision.toString(36).padStart(8, '0')}`);
  return {
    format: HISTORY_PACKAGE,
    version: events.some((event) => event.intakeScope) ? 2 : 1,
    owner: state.owner,
    timezone: state.timezone,
    count: events.length,
    manifest: encoded.manifest,
    pages: encoded.pages
  };
}
export function readHistoryPackage(content, owner) {
  historyAssert(
    typeof content === 'string' && content.length <= HISTORY_LIMITS.stateCharacters * 2,
    'RESOURCE_LIMIT',
    '历史备份超过配置上限'
  );
  let value;
  try {
    value = JSON.parse(content);
  } catch {
    historyAssert(false, 'INVALID_BACKUP', '历史备份不是有效 JSON');
  }
  historyAssert(
    value?.format === HISTORY_PACKAGE && [1, 2].includes(value.version) && value.owner === owner,
    'OWNER_MISMATCH',
    '历史备份版本或账户不匹配'
  );
  historyAssert(
    Object.keys(value).every((key) =>
      ['format', 'version', 'owner', 'timezone', 'count', 'manifest', 'pages'].includes(key)
    ) &&
      Number.isInteger(value.count) &&
      value.count >= 0 &&
      value.count <= HISTORY_LIMITS.operations,
    'INVALID_BACKUP',
    '历史备份字段不合法'
  );
  const events = decodeHistory(value.manifest, value.pages, owner);
  historyAssert(Array.isArray(events) && events.length === value.count, 'INVALID_BACKUP', '历史操作计数不一致');
  for (const event of events) {
    if (value.version === 2) {
      historyAssert(
        event && Object.keys(event).every((key) => ['id', 'type', 'at', 'data', 'intakeScope'].includes(key)),
        'INVALID_BACKUP',
        '历史操作含未知字段'
      );
      historyAssert(
        event.type !== 'intake.result' || !event.data?.reply?.intake?.profile?.examScope || event.intakeScope,
        'INVALID_BACKUP',
        '建档确认范围快照缺失，原记录保留'
      );
    }
    if (event?.intakeScope !== undefined) {
      historyAssert(
        value.version === 2 && event.type === 'intake.result',
        'INVALID_BACKUP',
        '考试范围快照版本或操作不符'
      );
      normalizeIntakeScopeSnapshot(event.intakeScope);
    }
  }
  return { ...value, events };
}
