import { learningDateTimeFormat } from '../../../laf-backend/functions/_shared/learning-date-time.js';
import { ENTRY_EVENTS } from '../../../laf-backend/functions/_shared/learning-entries.js';
import { storageService } from '../storageService.js';
import { getUserId, captureSession, assertSession } from '../auth-storage.js';
import {
  emptyLearningState,
  dayKey,
  applyLearningOperation,
  createLearningOperationBatch,
  assert,
  operationFingerprint,
  inspectMaterialDeletion,
  enforceMaterialDeletions
} from './learning-domain.js';
import { learningWriteLease } from './learning-write-lease.js';
import {
  prepareLearningRestore,
  prepareGuestMigration,
  prepareGuestHistoryMigration,
  prepareLearningHistoryRestore
} from './learning-backup.js';
import { createHistoryStorage } from './history-storage.js';
import { createHistoryPackage } from '../../../laf-backend/functions/_shared/learning-history.js';
import { createLearningArtifacts } from './learning-artifacts.js';
import {
  ASSISTANT_MEMORY_CONTRACT,
  reconcileAssistantMemory,
  retrieveAssistantMemory,
  readAssistantMemoryDocument
} from '../../../laf-backend/functions/_shared/learning-assistant-memory.js';

export const LEARNING_KEY = 'conversation_learning_v1';
export const ASSISTANT_MEMORY_KEY = `${LEARNING_KEY}_assistant_memory`;
export function createLearningRepository(
  storage = storageService,
  owner = () => getUserId() || 'guest',
  writeLease = storage === storageService ? learningWriteLease : null
) {
  const writeChecks = [];
  const sessionBindings = [];
  const usesSessionStorage = storage === storageService;
  storage = new Proxy(storage, {
    get(target, key) {
      const method = Reflect.get(target, key);
      if (typeof method !== 'function') return method;
      return (...args) => {
        if (key === 'save' || key === 'remove') for (const check of writeChecks) check();
        const session = sessionBindings.at(-1);
        if (usesSessionStorage && session) {
          if (key === 'save') args[3] = session;
          if (key === 'remove') args[2] = session;
          if (key === 'get') args[2] = { ...args[2], session };
        }
        return method.apply(target, args);
      };
    }
  });
  storage = createHistoryStorage(storage, owner, {
    canCleanup: () => {
      try {
        writeLease?.assertWritable(owner());
        return true;
      } catch (error) {
        if (['OTHER_WINDOW_ACTIVE', 'WRITE_LEASE_PENDING'].includes(error.code)) return false;
        throw error;
      }
    }
  });
  let lifecycleRevision = 0;
  let preparedHistory = null;
  let previewSequence = 0;
  let observedLifecycle;
  const lifecycleKey = `${LEARNING_KEY}_lifecycle`;
  function lifecycleMarker() {
    const value = storage.get(lifecycleKey, null);
    assert(
      value === null ||
        (value?.owner === owner() &&
          value.contract === 'learning-lifecycle-v1' &&
          typeof value.generation === 'string' &&
          /^[a-zA-Z0-9_-]{8,120}$/.test(value.generation) &&
          Object.keys(value).length === 3),
      'INVALID_LIFECYCLE',
      '本机记录撤销标记不合法，原记录保留，请重新核对'
    );
    return value;
  }
  function observeLifecycle() {
    const marker = lifecycleMarker();
    const identity = JSON.stringify([owner(), marker?.generation || null]);
    if (observedLifecycle !== undefined && observedLifecycle !== identity) {
      lifecycleRevision++;
      preparedHistory = null;
    }
    observedLifecycle = identity;
    return lifecycleRevision;
  }
  function invalidateLifecycle(advance = true) {
    observeLifecycle();
    // Derived documents must not retain text removed by deletion, restore or sync.
    if (storage.get(ASSISTANT_MEMORY_KEY, null) !== null)
      assert(storage.remove(ASSISTANT_MEMORY_KEY, true), 'STORAGE_FAILED', '旧记忆副本清理失败，请重试');
    const generation =
      globalThis.crypto?.randomUUID?.() ||
      `life_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
    const marker = { owner: owner(), contract: 'learning-lifecycle-v1', generation };
    assert(generation !== lifecycleMarker()?.generation, 'INVALID_LIFECYCLE', '本机撤销标记无法换代，原记录保留');
    assert(
      storage.save(lifecycleKey, marker, true),
      'STORAGE_FAILED',
      '本机记录撤销标记保存失败，资料与记录动作未执行'
    );
    observedLifecycle = JSON.stringify([owner(), generation]);
    if (advance) {
      lifecycleRevision++;
      preparedHistory = null;
    }
  }
  const assertWriteAccess = () => writeLease?.assertWritable(owner());
  const privacyKey = `${LEARNING_KEY}_privacy_pending`;
  function clearDeletedArtifactState(state) {
    if (!usesSessionStorage) return;
    const session = sessionBindings.at(-1) || captureSession();
    createLearningArtifacts({
      storage,
      session,
      keys: () => {
        const info = storageService.getStorageInfo();
        assert(info?.limitSize !== 0 && Array.isArray(info?.keys), 'STORAGE_FAILED', '文档设备副本清理失败，请重试');
        return info.keys;
      }
    }).clearMaterialDeletedState(state, assertWriteAccess);
  }
  function finishPrivacy(state, operation) {
    assert(state.owner === owner(), 'OWNER_MISMATCH', '隐私删除属于其他账户');
    const outcome = applyLearningOperation(state, operation);
    for (const suffix of ['_recovery', '_migration_backup', '_sync_conflict'])
      assert(storage.remove(`${LEARNING_KEY}${suffix}`, true), 'STORAGE_FAILED', '隐私副本未清理，删除待重试');
    clearDeletedArtifactState(outcome.state);
    assert(storage.save(LEARNING_KEY, outcome.state, true), 'STORAGE_FAILED', '隐私删除未保存，待重试');
    assert(storage.remove(privacyKey, true), 'STORAGE_FAILED', '删除已保存，收尾待重试');
    return outcome;
  }
  const read = () => {
    writeLease?.prepare(owner());
    observeLifecycle();
    const state = storage.get(LEARNING_KEY, null);
    if (!state)
      return emptyLearningState(owner(), learningDateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai');
    assert(state.owner === owner(), 'OWNER_MISMATCH', '学习记录属于其他用户');
    assert(state.version === 1, 'SCHEMA_VERSION', '学习数据版本不支持，原始数据已保留');
    const pending = storage.get(privacyKey, null);
    if (pending) {
      assertWriteAccess();
      assert(pending.owner === owner(), 'OWNER_MISMATCH', '删除任务属于其他用户');
      invalidateLifecycle();
      return finishPrivacy(state, pending.operation).state;
    }
    const current = JSON.parse(JSON.stringify(state));
    clearDeletedArtifactState(current);
    return current;
  };
  const conflictKey = `${LEARNING_KEY}_sync_conflict`;
  const conflict = () => {
    const archive = storage.get(conflictKey, null);
    assert(!archive || archive.owner === owner(), 'OWNER_MISMATCH', '冲突副本属于其他用户');
    return archive ? JSON.parse(JSON.stringify(archive)) : null;
  };
  const assertPreview = (preview) => {
    const current = read();
    assert(preview?.owner === current.owner, 'OWNER_MISMATCH', '账户已切换，请重新预览');
    assert(preview.expectedRevision === current.revision, 'CONFLICT', '记录已更新，请重新预览');
    return current;
  };
  // 新归档使用独立代次；旧归档仍可通过完整原文建立确认身份。
  const conflictIdentity = (archive) => archive.generation || operationFingerprint(archive);
  const checkedConflictPreview = (preview) => {
    assertPreview(preview);
    assert(preview.expectedLifecycle === observeLifecycle(), 'CONTEXT_CHANGED', '学习记录已变化，请重新核对冲突副本');
    const archive = conflict();
    assert(archive, 'NOT_FOUND', '没有冲突副本');
    assert(
      preview.archiveIdentity === conflictIdentity(archive),
      'CONFLICT',
      '冲突副本已变化，请重新打开并核对；当前记录与新副本保留'
    );
    return archive;
  };
  function capturePlanTimezone(state, operation) {
    if (operation.type !== 'plan.set' || operation.data?.timezone !== undefined) return operation;
    const previous = state.events.find((event) => event.id === operation.id);
    // Old operation identities keep their original payload; repeats of new plans reuse the captured zone.
    if (previous && previous.data?.timezone === undefined) return operation;
    return {
      ...operation,
      data: { ...operation.data, timezone: previous ? previous.data.timezone : state.timezone }
    };
  }
  const repository = {
    read,
    assertWriteAccess,
    readAssistantMemory({ at = Date.now() } = {}) {
      const state = read();
      const saved = storage.get(ASSISTANT_MEMORY_KEY, null);
      if (
        saved?.contract === ASSISTANT_MEMORY_CONTRACT &&
        saved.owner === state.owner &&
        saved.sourceRevision === state.revision &&
        Array.isArray(saved.notes) &&
        Array.isArray(saved.documents) &&
        saved.studyDay === dayKey(at, state.timezone) &&
        saved.reconciledAt + 86400000 > at
      )
        return JSON.parse(JSON.stringify(saved));
      // Reads can reconstruct without acquiring a write lease or gating learning.
      return reconcileAssistantMemory(state, saved, { at });
    },
    reconcileAssistantMemory({ at = Date.now(), force = false } = {}) {
      const state = read();
      const saved = storage.get(ASSISTANT_MEMORY_KEY, null);
      if (
        !force &&
        saved?.contract === ASSISTANT_MEMORY_CONTRACT &&
        saved.owner === state.owner &&
        saved.sourceRevision === state.revision &&
        Array.isArray(saved.notes) &&
        Array.isArray(saved.documents) &&
        saved.studyDay === dayKey(at, state.timezone) &&
        saved.reconciledAt + 86400000 > at
      )
        return JSON.parse(JSON.stringify(saved));
      const next = reconcileAssistantMemory(state, saved, { at });
      assertWriteAccess();
      assert(read().revision === state.revision, 'CONFLICT', '记忆整理期间记录已更新');
      assert(storage.save(ASSISTANT_MEMORY_KEY, next, true), 'STORAGE_FAILED', '记忆文档未保存，原学习记录保持');
      assert(
        JSON.stringify(storage.get(ASSISTANT_MEMORY_KEY, null)) === JSON.stringify(next),
        'STORAGE_FAILED',
        '记忆文档读回失败，原学习记录保持'
      );
      return next;
    },
    readMemoryDocument(path) {
      return readAssistantMemoryDocument(this.readAssistantMemory(), path);
    },
    assistantMemoryContext(options) {
      return retrieveAssistantMemory(this.readAssistantMemory(), read(), options);
    },
    lifecycleRevision: observeLifecycle,
    lifecycleContext: () => [owner(), observeLifecycle()],
    notificationConsentContext: () => [owner(), lifecycleMarker()?.generation || 'initial'],
    prepareAsyncAction() {
      this.assertWriteAccess();
      if (!lifecycleMarker()) invalidateLifecycle(false);
      return observeLifecycle();
    },
    commit(operation, expectedRevision) {
      assertWriteAccess();
      const before = read();
      assert(
        expectedRevision === undefined || before.revision === expectedRevision,
        'CONFLICT',
        '学习记录已更新，请重新读取后重试'
      );
      const outcome = applyLearningOperation(before, capturePlanTimezone(before, operation));
      if (!outcome.reused) {
        preparedHistory = null;
        if (operation.type === 'material.delete') {
          invalidateLifecycle();
          assert(
            storage.save(privacyKey, { owner: before.owner, operation }, true),
            'STORAGE_FAILED',
            '无法保存删除任务，资料未删除'
          );
          preparedHistory = null;
          return finishPrivacy(before, operation);
        }
        assert(storage.save(`${LEARNING_KEY}_recovery`, before, true), 'STORAGE_FAILED', '无法创建恢复副本');
        assert(storage.save(LEARNING_KEY, outcome.state, true), 'STORAGE_FAILED', '学习记录保存失败，未宣称执行成功');
        if (usesSessionStorage && !lifecycleMarker()) invalidateLifecycle(false);
      }
      return outcome;
    },
    commitBatch(operations, expectedRevision) {
      assertWriteAccess();
      const before = read();
      assert(before.revision === expectedRevision, 'CONFLICT', '学习记录已更新，请重新核对整批作答');
      assert(
        Array.isArray(operations) && operations.length >= 1 && operations.length <= 100,
        'RESOURCE_LIMIT',
        '学习批次最多100个操作'
      );
      assert(
        operations.every((op) =>
          [
            ...ENTRY_EVENTS,
            'reminder.set',
            'reminder.complete',
            'reminder.cancel',
            'conversation.start',
            'question.add',
            'question.focus',
            'attempt.submit',
            'attempt.submit-original-v1',
            'plan.set',
            'profile.set',
            'training.open',
            'training.complete',
            'review.schedule',
            'recap.confirm',
            'message.add'
          ].includes(op.type)
        ),
        'FORBIDDEN',
        '学习批次包含不支持的操作'
      );
      const batch = createLearningOperationBatch(before, operations.length);
      let staged = before;
      const results = operations.map((operation) => {
        const result = batch.apply(capturePlanTimezone(staged, operation));
        staged = result.state;
        return result;
      });
      const after = batch.finish();
      if (after.revision !== before.revision) {
        preparedHistory = null;
        assert(storage.save(`${LEARNING_KEY}_recovery`, before, true), 'STORAGE_FAILED', '无法创建恢复副本');
        assert(storage.save(LEARNING_KEY, after, true), 'STORAGE_FAILED', '整批保存失败，原记录保留，请重试');
        if (usesSessionStorage && !lifecycleMarker()) invalidateLifecycle(false);
      }
      return { state: after, results: results.map((r) => r.result), reused: results.every((r) => r.reused) };
    },
    previewMaterialDeletion(materialId) {
      const current = read();
      const material = current.materials.find((m) => m.id === materialId);
      assert(material, 'NOT_FOUND', '资料不存在');
      return {
        ...inspectMaterialDeletion(current, materialId),
        owner: current.owner,
        expectedRevision: current.revision,
        name: material.name,
        original: material.original?.connectorFileId
          ? {
              fileId: material.original.connectorFileId,
              connectorOrigin: material.original.connectorOrigin || null
            }
          : null
      };
    },
    deleteMaterial(preview, consent, id) {
      assert(consent, 'CONSENT_REQUIRED', '删除范围需要确认');
      const current = assertPreview(preview);
      const fresh = this.previewMaterialDeletion(preview.materialId);
      assert(operationFingerprint(fresh) === operationFingerprint(preview), 'CONFLICT', '删除范围已变化，请重新预览');
      return this.commit(
        {
          id,
          type: 'material.delete',
          at: Date.now(),
          data: {
            materialId: preview.materialId,
            materialIds: preview.materialIds,
            questionKeys: preview.questionKeys,
            original: preview.original
          }
        },
        current.revision
      );
    },
    migrateLegacy() {
      if (storage.get(LEARNING_KEY, null)) return read();
      assertWriteAccess();
      const state = read();
      // 旧记录缺少尝试级证据，保留原键并作为未复核快照，不臆造首答或掌握。
      state.legacy = {
        version: 1,
        at: Date.now(),
        reviewRequired: true,
        mistakes: storage.get('mistake_book', []),
        progress: storage.get('studyProgress', {}),
        engine: storage.get('study_engine_state_v1', {}),
        imports: storage.get('imported_files', [])
      };
      assert(storage.save(`${LEARNING_KEY}_migration_backup`, state.legacy, true), 'STORAGE_FAILED', '迁移备份失败');
      assert(storage.save(LEARNING_KEY, state, true), 'STORAGE_FAILED', '迁移保存失败');
      return state;
    },
    rollback() {
      assertWriteAccess();
      const before = storage.get(`${LEARNING_KEY}_recovery`, null);
      assert(before?.owner === owner(), 'PRECONDITION', '没有当前用户的恢复副本');
      invalidateLifecycle();
      assert(storage.save(LEARNING_KEY, enforceMaterialDeletions(before, read()), true), 'STORAGE_FAILED', '恢复失败');
      preparedHistory = null;
      return read();
    },
    exportData() {
      const state = read();
      return JSON.stringify(
        state.events.length > 500 || JSON.stringify(state).length > 1500000 ? createHistoryPackage(state) : state,
        null,
        2
      );
    },
    inspectHistory: () => storage.inspectHistory(),
    cancelPreview() {
      previewSequence++;
      preparedHistory = null;
    },
    previewRestore(content) {
      this.cancelPreview();
      assert(typeof content === 'string' && content.length <= 12000000, 'RESOURCE_LIMIT', '备份超过资源上限');
      let value;
      try {
        value = JSON.parse(content);
      } catch {
        /* 原恢复器返回明确错误。 */
      }
      if (content.length > 1500000 || value?.events?.length > 500 || value?.format === 'learning-history-v1')
        return this.previewHistoryRestore(content);
      const before = read();
      const { state: _state, ...preview } = prepareLearningRestore(before, content);
      const token = `restore_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
      preparedHistory = { kind: 'restore-small', token, content, lifecycle: lifecycleRevision };
      return { ...preview, token };
    },
    async previewHistoryRestore(content, options) {
      const session = captureSession();
      options?.assertCurrent?.();
      this.cancelPreview();
      const sequence = previewSequence;
      const before = read(),
        lifecycle = lifecycleRevision;
      const result = await prepareLearningHistoryRestore(before, content, options);
      options?.assertCurrent?.();
      if (usesSessionStorage) assertSession(session);
      assert(!options?.signal?.aborted, 'CANCELLED', '历史校验已取消，当前记录保留');
      assert(
        sequence === previewSequence &&
          read().owner === before.owner &&
          read().revision === before.revision &&
          lifecycleRevision === lifecycle,
        'CONTEXT_CHANGED',
        '校验期间记录或账户已变化，请重新预览'
      );
      const token = `history_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
      preparedHistory = { kind: 'restore', result, token, content, lifecycle };
      const { state: _state, ...preview } = result;
      return { ...preview, token };
    },
    restoreHistory(content, preview) {
      assertWriteAccess();
      const before = assertPreview(preview),
        cached = preparedHistory;
      assert(
        cached?.kind === 'restore' &&
          cached.token === preview.token &&
          cached.content === content &&
          cached.lifecycle === lifecycleRevision,
        'PRECONDITION',
        '历史预览已失效，请重新校验'
      );
      const result = cached.result;
      if (result.imported) {
        invalidateLifecycle();
        if (result.state.events.some((e) => e.type === 'material.delete' && !before.events.some((b) => b.id === e.id)))
          for (const suffix of ['_migration_backup', '_sync_conflict'])
            assert(storage.remove(`${LEARNING_KEY}${suffix}`, true), 'STORAGE_FAILED', '恢复中的隐私副本清理待重试');
        assert(storage.save(`${LEARNING_KEY}_recovery`, before, true), 'STORAGE_FAILED', '无法创建恢复前副本');
        assert(storage.save(LEARNING_KEY, result.state, true), 'STORAGE_FAILED', '历史恢复保存失败');
        preparedHistory = null;
      }
      preparedHistory = null;
      return result;
    },
    restoreData(content, expectedRevision) {
      assertWriteAccess();
      const preview = typeof expectedRevision === 'object' ? expectedRevision : null;
      const before = preview ? assertPreview(preview) : read();
      if (preview)
        assert(
          preparedHistory?.kind === 'restore-small' &&
            preparedHistory.token === preview.token &&
            preparedHistory.content === content &&
            preparedHistory.lifecycle === lifecycleRevision,
          'PRECONDITION',
          '备份预览已失效，请重新校验'
        );
      else assert(before.revision === expectedRevision, 'CONFLICT', '记录已更新，请重新预览备份再恢复');
      const result = prepareLearningRestore(before, content);
      if (result.imported) {
        invalidateLifecycle();
        if (
          result.state.events.some(
            (event) => event.type === 'material.delete' && !before.events.some((e) => e.id === event.id)
          )
        )
          for (const suffix of ['_migration_backup', '_sync_conflict'])
            assert(storage.remove(`${LEARNING_KEY}${suffix}`, true), 'STORAGE_FAILED', '恢复中的隐私副本清理待重试');
        assert(storage.save(`${LEARNING_KEY}_recovery`, before, true), 'STORAGE_FAILED', '无法创建恢复前副本');
        assert(storage.save(LEARNING_KEY, result.state, true), 'STORAGE_FAILED', '备份恢复保存失败');
        preparedHistory = null;
      }
      if (preview) preparedHistory = null;
      return result;
    },
    previewGuestMigration(options) {
      const session = captureSession();
      options?.assertCurrent?.();
      this.cancelPreview();
      const sequence = previewSequence;
      const before = read(),
        guest = storage.getGuestLearningSnapshot?.();
      if (guest && (guest.events?.length > 500 || JSON.stringify(guest).length > 1500000)) {
        preparedHistory = null;
        const lifecycle = lifecycleRevision;
        return prepareGuestHistoryMigration(before, guest, options).then((result) => {
          options?.assertCurrent?.();
          if (usesSessionStorage) assertSession(session);
          assert(!options?.signal?.aborted, 'CANCELLED', '访客历史校验已取消，当前记录保留');
          assert(
            sequence === previewSequence &&
              read().owner === before.owner &&
              read().revision === before.revision &&
              lifecycleRevision === lifecycle &&
              operationFingerprint(storage.getGuestLearningSnapshot?.()) === result.guestFingerprint,
            'CONTEXT_CHANGED',
            '校验期间账户或访客记录已变化，请重新预览'
          );
          const token = `guest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
          preparedHistory = { kind: 'guest', result, token, lifecycle };
          const { state: _state, ...preview } = result;
          return { ...preview, token };
        });
      }
      const { state: _state, ...preview } = prepareGuestMigration(before, guest);
      return preview;
    },
    migrateGuest(preview, consent) {
      assert(consent, 'CONSENT_REQUIRED', '归入当前账户需要确认访客记录属于你');
      assertWriteAccess();
      const before = assertPreview(preview);
      const guest = storage.getGuestLearningSnapshot?.();
      assert(operationFingerprint(guest) === preview.guestFingerprint, 'CONFLICT', '访客记录已更新，请重新预览');
      if (preview.history)
        assert(
          preparedHistory?.kind === 'guest' &&
            preparedHistory.token === preview.token &&
            preparedHistory.lifecycle === lifecycleRevision,
          'PRECONDITION',
          '访客历史预览已失效，请重新校验'
        );
      const result = preview.history ? preparedHistory.result : prepareGuestMigration(before, guest);
      if (result.imported) {
        invalidateLifecycle();
        assert(storage.save(`${LEARNING_KEY}_recovery`, before, true), 'STORAGE_FAILED', '无法创建迁移前副本');
        assert(storage.save(LEARNING_KEY, result.state, true), 'STORAGE_FAILED', '访客迁移保存失败，原记录保留');
        preparedHistory = null;
      }
      return result;
    },
    captureSyncConflict(remote, ids) {
      assertWriteAccess();
      let local = read();
      assert(remote?.owner === local.owner && remote.version === 1, 'OWNER_MISMATCH', '冲突数据用户不一致');
      remote = enforceMaterialDeletions(remote, local);
      local = enforceMaterialDeletions(local, remote);
      const generation =
        globalThis.crypto?.randomUUID?.() ||
        `conflict_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
      const archive = { owner: local.owner, at: Date.now(), generation, ids, local, remote };
      const prior = conflict();
      if (prior) {
        assert(
          operationFingerprint(prior.local) === operationFingerprint(local) &&
            operationFingerprint(prior.remote) === operationFingerprint(remote),
          'ARCHIVE_EXISTS',
          '已有另一份冲突副本；请先导出并明确移除该副本，再重新同步'
        );
        return;
      }
      assert(storage.save(conflictKey, archive, true), 'STORAGE_FAILED', '冲突副本保存失败，本机数据保持完整');
    },
    previewSyncConflict() {
      const archive = conflict();
      return archive
        ? {
            owner: archive.owner,
            at: archive.at,
            ids: archive.ids,
            localEvents: archive.local.events.length,
            remoteEvents: archive.remote.events.length,
            expectedRevision: read().revision,
            expectedLifecycle: observeLifecycle(),
            archiveIdentity: conflictIdentity(archive),
            remoteFingerprint: operationFingerprint(archive.remote)
          }
        : null;
    },
    isSyncConflictCurrent(preview) {
      try {
        checkedConflictPreview(preview);
        return true;
      } catch {
        return false;
      }
    },
    exportSyncConflict(side) {
      assert(['local', 'remote'].includes(side), 'INVALID_INPUT', '请选择本机或云端副本');
      const archive = conflict();
      assert(archive, 'NOT_FOUND', '没有冲突副本');
      return JSON.stringify(archive[side], null, 2);
    },
    adoptConflictRemote(remote, preview) {
      assertWriteAccess();
      checkedConflictPreview(preview);
      assert(
        conflict() && operationFingerprint(remote) === preview.remoteFingerprint,
        'CONFLICT',
        '云端记录已更新，请重新同步预览；本机与冲突副本保留'
      );
      return this.replaceSynchronized(remote);
    },
    restoreConflictLocal(preview) {
      assertWriteAccess();
      const archive = checkedConflictPreview(preview);
      return this.replaceSynchronized(archive.local);
    },
    clearSyncConflict(preview) {
      assertWriteAccess();
      // 无参数仅供既有同步内部调用；页面必须传入已确认的归档预览。
      if (preview !== undefined) checkedConflictPreview(preview);
      assert(storage.remove(conflictKey, true), 'STORAGE_FAILED', '冲突副本移除失败');
    },
    replaceSynchronized(state) {
      assertWriteAccess();
      assert(state.owner === owner() && state.version === 1, 'OWNER_MISMATCH', '同步数据用户或版本不匹配');
      const before = read();
      state = enforceMaterialDeletions(state, before);
      const safeBefore = enforceMaterialDeletions(before, state);
      invalidateLifecycle();
      assert(storage.save(`${LEARNING_KEY}_recovery`, safeBefore, true), 'STORAGE_FAILED', '同步恢复副本创建失败');
      assert(storage.save(LEARNING_KEY, state, true), 'STORAGE_FAILED', '同步保存失败');
      preparedHistory = null;
      return read();
    },
    deleteData() {
      assertWriteAccess();
      preparedHistory = null;
      invalidateLifecycle();
      for (const suffix of [
        '',
        '_recovery',
        '_migration_backup',
        '_sync_conflict',
        '_privacy_pending',
        '_assistant_memory'
      ]) {
        assert(storage.remove(`${LEARNING_KEY}${suffix}`, true), 'STORAGE_FAILED', '删除失败，请重试');
      }
      assert(storage.clearHistoryCatalog(), 'STORAGE_FAILED', '历史目录清理待重试');
      return read();
    }
  };
  // Pin each synchronous repository operation, including history pages and recovery copies,
  // to its initiating login. Check again immediately before every underlying storage write.
  for (const [name, action] of Object.entries(repository)) {
    repository[name] = function (...args) {
      if (name === 'cancelPreview') return action.apply(repository, args);
      const session = args.at(-1)?.session || captureSession(),
        identity = owner();
      if (usesSessionStorage) assertSession(session);
      const check = () => {
        if (usesSessionStorage) assertSession(session);
        assert(
          (!usesSessionStorage || storageService.checkSession(session) === 'current') && owner() === identity,
          'CONTEXT_CHANGED',
          '登录会话已变化，旧记录未写入'
        );
      };
      writeChecks.push(check);
      sessionBindings.push(session);
      try {
        return action.apply(repository, args);
      } finally {
        writeChecks.pop();
        sessionBindings.pop();
      }
    };
  }
  return repository;
}
export const learningRepository = createLearningRepository();
