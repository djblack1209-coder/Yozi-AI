import { learningRequest } from '../api/domains/learning.api.js';
import { captureSession, assertSession } from '../auth-storage.js';
import {
  intakeScopeReplaySnapshot,
  INTAKE_SCOPE_REPLAY_CONTRACT
} from '../../../laf-backend/functions/_shared/learning-intake.js';
import {
  HISTORY_LIMITS,
  validateHistoryManifest,
  decodeHistory
} from '../../../laf-backend/functions/_shared/learning-history.js';
import {
  assert,
  applyLearningOperation,
  normalizePrivateSyncOperation,
  operationFingerprint,
  samePrivacyRedaction,
  enforceMaterialDeletions
} from './learning-domain.js';

function checkedRemote(result, owner) {
  assert(result?.success, 'SYNC_FAILED', result?.message || '学习同步连接不可用');
  const state = result.data?.state;
  assert(state?.owner === owner, 'OWNER_MISMATCH', '同步用户不一致');
  assert(
    state.version === 1 &&
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
    'INVALID_RESPONSE',
    '同步数据结构无效，本机记录保留'
  );
  return state;
}
function checkSharedEvents(repository, local, remote, assertCurrent) {
  const known = new Map(remote.events.map((event) => [event.id, event]));
  const conflicts = local.events
    .filter((event) => {
      const previous = known.get(event.id);
      if (!previous) return false;
      const normalized = normalizePrivateSyncOperation(event);
      if (samePrivacyRedaction(previous, normalized)) return false;
      // 已确认范围是回放输入；其他派生结果仍以服务端事实为准。
      return (
        previous.type !== normalized.type ||
        operationFingerprint(previous.data) !== operationFingerprint(normalized.data) ||
        operationFingerprint(intakeScopeReplaySnapshot(previous)) !==
          operationFingerprint(intakeScopeReplaySnapshot(event))
      );
    })
    .map((event) => event.id);
  if (conflicts.length) {
    assertCurrent();
    repository.captureSyncConflict?.(remote, conflicts);
    assert(false, 'CONFLICT', '同一操作对应不同内容；本机与云端副本保留，可在记录与隐私中处理');
  }
  return known;
}

function assertRichMessagesPreserved(local, remote) {
  for (const session of local.conversations || []) {
    const target = remote.conversations.find((item) => item.id === session.id);
    for (const message of session.messages) {
      if (!message.contentBlocks && !message.proposal) continue;
      const saved = target?.messages.find((item) => item.id === message.id);
      assert(
        saved &&
          operationFingerprint(saved.contentBlocks || null) === operationFingerprint(message.contentBlocks || null) &&
          operationFingerprint(saved.proposal || null) === operationFingerprint(message.proposal || null),
        'SYNC_UPGRADE_REQUIRED',
        '服务尚未完整保留教学卡或建议，本机记录保留，请先更新学习服务'
      );
    }
  }
}
function checkedPush(repository, result, operations, owner, assertCurrent) {
  if (result?.data?.snapshotRequired || result?.data?.history) {
    assert(
      result.success &&
        Array.isArray(result.data.accepted) &&
        operations.every((event) => result.data.accepted.includes(event.id)),
      'INVALID_RESPONSE',
      '同步接收回执不完整，本机记录保留'
    );
    // 兼容旧服务忽略精简选项而返回分页快照；重新读取当前完整版本。
    return null;
  }
  const remote = checkedRemote(result, owner);
  const received = checkSharedEvents(repository, { events: operations }, remote, assertCurrent);
  assert(
    operations.every((event) => received.has(event.id)),
    'INVALID_RESPONSE',
    '同步接收回执不完整，本机记录保留'
  );
  return remote;
}

// 保持服务端 30 次/分钟限制；本次最多 512 请求/10 分钟，不无界重试。
function syncTransport(request, owner, signal, assertContext, onProgress) {
  const origin = captureSession();
  const began = Date.now(),
    recent = [];
  let calls = 0;
  const check = () => {
    assertSession(origin);
    assertContext();
    assert(
      Date.now() - began < 600000 && calls < 512,
      'RESOURCE_LIMIT',
      '同步达到本次预算，保留本机记录；已接收操作可继续幂等补传'
    );
  };
  const wait = (ms) =>
    new Promise((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        reject(Object.assign(new Error('同步已取消，本机记录保留'), { code: 'CANCELLED' }));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', abort);
        resolve();
      }, ms);
      if (signal?.aborted) abort();
      else signal?.addEventListener('abort', abort, { once: true });
    });
  return async (body) => {
    check();
    while (recent.length && Date.now() - recent[0] >= 61000) recent.shift();
    if (recent.length >= 24) {
      onProgress?.({ phase: '等待同步窗口', calls });
      await wait(Math.max(1, 61000 - (Date.now() - recent[0])));
      check();
      while (recent.length && Date.now() - recent[0] >= 61000) recent.shift();
    }
    recent.push(Date.now());
    calls++;
    onProgress?.({
      phase: body.action === 'page' ? '读取历史分页' : body.action === 'push' ? '补传学习操作' : '读取云端记录',
      calls
    });
    check();
    assertSession(origin);
    const result = await request('/learning-sync', body, {
      session: origin,
      expectedOwner: owner,
      signal,
      assertCurrent: check
    });
    check();
    return result;
  };
}
async function pullSnapshot(send, timezone, owner) {
  // 并发更新使分页失效时仅重新拉取一次；不拼接两个版本。
  for (let retry = 0; retry < 2; retry++) {
    const result = await send({ action: 'pull', timezone });
    if (!result?.data?.history) return checkedRemote(result, owner);
    assert(result.success, 'SYNC_FAILED', result.message || '同步读取失败');
    const manifest = validateHistoryManifest(result.data.history, owner),
      revision = result.data.revision;
    assert(Number.isInteger(revision) && revision >= 0, 'INVALID_RESPONSE', '同步版本无效');
    const pages = [];
    let stale = false;
    for (let offset = 0; offset < manifest.checksums.length; offset += 3) {
      const part = await send({ action: 'page', revision, generation: manifest.generation, offset, count: 3 });
      if (part?.error === 'STALE_SYNC') {
        stale = true;
        break;
      }
      const data = part?.data;
      assert(
        part?.success &&
          data?.owner === owner &&
          data.revision === revision &&
          data.generation === manifest.generation &&
          data.offset === offset &&
          Array.isArray(data.pages) &&
          data.pages.length === Math.min(3, manifest.checksums.length - offset),
        'INVALID_RESPONSE',
        '同步历史分页无效，本机记录保留'
      );
      pages.push(...data.pages);
    }
    if (!stale) return checkedRemote({ success: true, data: { state: decodeHistory(manifest, pages, owner) } }, owner);
  }
  assert(false, 'CONFLICT', '云端持续更新，未采用混合分页；请稍后重新同步');
}

// Website projection: uses the existing pull/page contract and never adopts or pushes local facts.
export async function readLearningSnapshot({
  session = captureSession(),
  signal,
  timezone = 'Asia/Shanghai',
  request = learningRequest
} = {}) {
  assertSession(session);
  assert(session.owner !== 'guest', 'AUTH_REQUIRED', '请先登录');
  const send = syncTransport(request, session.owner, signal, () => assertSession(session));
  const state = await pullSnapshot(send, timezone, session.owner);
  assertSession(session);
  return state;
}
function operationBatches(events, scopeReplayAvailable = false) {
  const batches = [];
  let batch = [],
    size = 2;
  for (const event of events) {
    const { id, type, data, at } = event,
      intakeScope = intakeScopeReplaySnapshot(event);
    assert(
      !intakeScope || scopeReplayAvailable,
      'UPDATE_REQUIRED',
      '学习服务尚不支持保留考试范围，请先更新服务；本机记录保留'
    );
    const operation = { id, type, data, at, ...(intakeScope ? { intakeScope } : {}) },
      length = JSON.stringify(operation).length + 1;
    assert(length <= 600000, 'RESOURCE_LIMIT', '单个同步操作超过传输上限，请分段处理；本机记录保留');
    if (batch.length && (batch.length >= 100 || size + length > 600000)) {
      batches.push(batch);
      batch = [];
      size = 2;
    }
    batch.push(operation);
    size += length;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
function bindRepository(repository, session) {
  const arity = { commit: 2, captureSyncConflict: 2, replaceSynchronized: 1, adoptConflictRemote: 2 };
  return new Proxy(repository, {
    get(target, name) {
      const method = target[name];
      if (!(name in arity) || typeof method !== 'function') return method;
      return (...args) => {
        assertSession(session);
        while (args.length < arity[name]) args.push(undefined);
        return method.call(target, ...args, { session });
      };
    }
  });
}
export async function synchronizeLearning(
  repository,
  consent,
  request = learningRequest,
  { signal, onProgress, assertCurrent } = {}
) {
  const session = captureSession();
  repository = bindRepository(repository, session);
  const checkSession = () => {
    assertCurrent?.();
    assertSession(session);
    assert(!signal?.aborted, 'CANCELLED', '同步已取消，本机记录保留');
  };
  checkSession();
  assert(consent, 'CONSENT_REQUIRED', '同步会上传当前用户的对话、资料片段和学习记录，需要明确授权');
  repository.assertWriteAccess?.();
  let initial = repository.read();
  let lifecycle = repository.lifecycleRevision?.();
  let completed = 0,
    total = null,
    lastProgress = {};
  const notify = (progress) => {
    checkSession();
    lastProgress = { ...lastProgress, ...progress };
    onProgress?.({ ...lastProgress, completed, total });
  };
  const assertContext = () => {
    checkSession();
    assert(!signal?.aborted, 'CANCELLED', '同步已取消，本机记录保留；已发送批次可能已保存云端');
    assert(repository.read().owner === initial.owner, 'OWNER_MISMATCH', '用户已切换，停止旧账户同步');
    assert(repository.lifecycleRevision?.() === lifecycle, 'CONTEXT_CHANGED', '记录已删除或恢复，旧同步结果未写入');
  };
  assertContext();
  const transport = syncTransport(request, initial.owner, signal, assertContext, notify);
  let scopeReplayAvailable = false;
  const send = async (body) => {
    const response = await transport(body);
    if (body.action === 'pull')
      scopeReplayAvailable = response.data?.intakeScopeReplayContracts?.includes(INTAKE_SCOPE_REPLAY_CONTRACT) === true;
    return response;
  };
  let remote = await pullSnapshot(send, initial.timezone, initial.owner);
  // 先传播隐私墓碑，绝不先把已删除资料的旧正文补传到服务器。
  const deletionOps = initial.events.filter(
    (e) => e.type === 'material.delete' && !remote.events.some((r) => r.id === e.id)
  );
  for (const operations of operationBatches(deletionOps)) {
    const result = await send({ action: 'push', operations, timezone: initial.timezone, returnSnapshot: false });
    const received = checkedPush(repository, result, operations, initial.owner, assertContext);
    remote = received || (await pullSnapshot(send, initial.timezone, initial.owner));
    const ids = checkSharedEvents(repository, { events: operations }, remote, assertContext);
    assert(
      operations.every((event) => ids.has(event.id)),
      'INVALID_RESPONSE',
      '云端未保留已确认的隐私删除，本机记录保留'
    );
  }
  for (const event of remote.events.filter(
    (e) => e.type === 'material.delete' && !initial.events.some((local) => local.id === e.id)
  )) {
    assertContext();
    repository.commit({ id: event.id, type: event.type, data: event.data, at: event.at });
    lifecycle = repository.lifecycleRevision?.();
    initial = repository.read();
  }
  const known = checkSharedEvents(repository, initial, remote, assertContext),
    pending = initial.events.filter((e) => !known.has(e.id));
  assert(
    pending.every((e) => e.data),
    'MIGRATION_REQUIRED',
    '早期记录缺少可重放操作，请先导出复核，不覆盖记录'
  );
  total = pending.length;
  notify({ phase: total ? '准备补传学习操作' : '核对云端记录' });
  let snapshotRequired = false;
  for (const operations of operationBatches(pending, scopeReplayAvailable)) {
    const result = await send({ action: 'push', operations, timezone: initial.timezone, returnSnapshot: false });
    const received = checkedPush(repository, result, operations, initial.owner, assertContext);
    snapshotRequired = !received;
    if (received) remote = received;
    completed += operations.length;
    notify({ phase: '云端已接收本批，完整结果仍需核对' });
  }
  if (snapshotRequired) remote = await pullSnapshot(send, initial.timezone, initial.owner);
  const current = repository.read();
  assertContext();
  const remoteIds = checkSharedEvents(repository, current, remote, assertContext);
  assert(
    initial.events.every((event) => remoteIds.has(event.id)),
    'INVALID_RESPONSE',
    '云端未保留本次已确认的学习操作，本机记录保留；请核对其他设备或重新同步'
  );
  for (const event of current.events.filter((e) => !remoteIds.has(e.id))) {
    const intakeScope = intakeScopeReplaySnapshot(event);
    remote = applyLearningOperation(remote, {
      id: event.id,
      type: event.type,
      data: event.data,
      at: event.at,
      ...(intakeScope ? { intakeScope } : {})
    }).state;
  }
  assertContext();
  assertRichMessagesPreserved(enforceMaterialDeletions(current, remote), remote);
  return repository.replaceSynchronized(remote);
}
export async function adoptRemoteConflict(
  repository,
  preview,
  consent,
  request = learningRequest,
  { signal, onProgress, assertCurrent } = {}
) {
  const session = captureSession();
  repository = bindRepository(repository, session);
  assertCurrent?.();
  assert(consent, 'CONSENT_REQUIRED', '采用云端记录需要明确确认；未合并的本机副本保留');
  assert(repository.isSyncConflictCurrent?.(preview) !== false, 'CONFLICT', '冲突副本已变化，请重新打开并核对');
  const lifecycle = repository.lifecycleRevision?.(),
    current = repository.read();
  assert(current.owner === preview?.owner, 'OWNER_MISMATCH', '账户已切换，请重新预览');
  const check = () => {
    assertCurrent?.();
    assertSession(session);
    assert(!signal?.aborted, 'CANCELLED', '已取消采用云端记录');
    assert(repository.read().owner === current.owner, 'OWNER_MISMATCH', '账户已切换');
    assert(repository.lifecycleRevision?.() === lifecycle, 'CONTEXT_CHANGED', '记录已恢复或删除，未采用旧结果');
  };
  const remote = await pullSnapshot(
    syncTransport(request, current.owner, signal, check, onProgress),
    current.timezone,
    current.owner
  );
  check();
  return repository.adoptConflictRemote(remote, preview);
}
