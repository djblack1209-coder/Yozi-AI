import crypto from 'node:crypto';
import { coachingMetricFacts } from './learning-trial-metrics.js';
import {
  emptyLearningState,
  createLearningOperationBatch,
  normalizePrivateSyncOperation,
  materialDeletedConversationIds
} from './learning-domain.js';
import { AccountError } from './learning-account.js';
import { decodeServerHistory, encodeServerHistory, historyWire } from './learning-history-server.js';
import { eraseLearningModelResultCache } from './learning-model-runtime.js';

const syncId = (userId: string) => `learning_sync_${crypto.createHash('sha256').update(userId).digest('hex')}`;
export async function readLearningHistoryPages(db: any, userId: string, body: any) {
  if (
    !Number.isInteger(body.revision) ||
    body.revision < 0 ||
    !Number.isInteger(body.offset) ||
    body.offset < 0 ||
    !Number.isInteger(body.count) ||
    body.count < 1 ||
    body.count > 3
  )
    throw new AccountError('INVALID_INPUT', '历史分页请求不合法');
  const stored = (
    await db
      .collection('learning_states')
      .where({ _id: syncId(userId), user_id: userId, revision: body.revision })
      .get()
  ).data?.[0];
  if (!stored) throw new AccountError('STALE_SYNC', '历史已更新，请重新同步；未采用旧分页');
  const { manifest, pages } = historyWire(await decodeServerHistory(stored.state, userId), stored.revision);
  if (manifest.generation !== body.generation || body.offset >= pages.length)
    throw new AccountError('STALE_SYNC', '历史分页标识已失效');
  return {
    owner: userId,
    revision: stored.revision,
    generation: manifest.generation,
    offset: body.offset,
    pages: pages.slice(body.offset, body.offset + body.count)
  };
}

export function validateSyncOperation(raw: any) {
  if (
    !raw ||
    typeof raw.id !== 'string' ||
    raw.id.length > 160 ||
    typeof raw.type !== 'string' ||
    !raw.data ||
    typeof raw.data !== 'object' ||
    Array.isArray(raw.data) ||
    !Number.isFinite(raw.at) ||
    raw.at > Date.now() + 300000 ||
    raw.at < 0 ||
    JSON.stringify(raw).length > 800000
  ) {
    throw new AccountError('INVALID_INPUT', '同步操作不合法');
  }
  return normalizePrivateSyncOperation(raw);
}
export async function syncLearningOperations(db: any, userId: string, operations: any[], timezone: string) {
  if (!Array.isArray(operations) || operations.length > 100 || JSON.stringify(operations).length > 2000000) {
    throw new AccountError('RESOURCE_LIMIT', '每批同步最多100个操作');
  }
  const id = syncId(userId);
  const collection = db.collection('learning_states');
  const seed = { _id: id, user_id: userId, revision: 0, state: emptyLearningState(userId, timezone) };
  for (let retry = 0; retry < 5; retry++) {
    let stored = (await collection.where({ _id: id, user_id: userId }).get()).data?.[0];
    if (!stored) {
      try {
        await collection.add(seed);
      } catch (error: any) {
        if (error?.code !== 11000) throw error;
      }
      stored = (await collection.where({ _id: id, user_id: userId }).get()).data?.[0];
      if (!stored) throw new AccountError('DATABASE_UNAVAILABLE', '学习同步数据库不可用');
    }
    let state = await decodeServerHistory(stored.state, userId);
    // A read can seed an empty account before its first real device sync.
    // Use that first write's timezone; never rebase existing learning facts.
    if (
      stored.revision === 0 &&
      state.revision === 0 &&
      operations.length > 0 &&
      Object.values(state)
        .filter(Array.isArray)
        .every((items: any[]) => items.length === 0)
    ) {
      state = emptyLearningState(userId, timezone);
    }
    const batch = createLearningOperationBatch(state, Math.max(1, operations.length));
    const accepted = [];
    let changed = false;
    let materialDeleted = false;
    for (const raw of operations) {
      const operation = validateSyncOperation(raw);
      const outcome = batch.apply(operation);
      state = outcome.state;
      changed ||= !outcome.reused;
      materialDeleted ||= !outcome.reused && operation.type === 'material.delete';
      accepted.push(operation.id);
    }
    state = batch.finish();
    const deletedConversations = materialDeletedConversationIds(state);
    const privacyGuard = materialDeleted || deletedConversations.size > 0;
    let artifactPatch: any = {};
    if (privacyGuard && stored.essayArtifacts !== undefined) {
      if (!stored.essayArtifacts || typeof stored.essayArtifacts !== 'object' || Array.isArray(stored.essayArtifacts))
        throw new AccountError('CONFLICT', '文档副本清理待重试，未确认资料删除完成');
      const kept = Object.fromEntries(
        Object.entries(stored.essayArtifacts).filter(
          ([, copy]: any) => !deletedConversations.has(copy?.artifact?.source?.conversationId)
        )
      );
      if (Object.keys(kept).length !== Object.keys(stored.essayArtifacts).length) {
        const counter = stored.essayArtifactRevision ?? 0;
        if (!Number.isSafeInteger(counter) || counter < 0)
          throw new AccountError('CONFLICT', '文档副本清理待重试，未确认资料删除完成');
        artifactPatch = { essayArtifacts: kept, essayArtifactRevision: counter + 1 };
      }
    }
    // 读取和重复补传不生成新版本，不让分段读取无故失效。
    if (!changed && !Object.keys(artifactPatch).length) return { state, accepted, revision: stored.revision };
    // 题源关联目前不足以证明所有缓存的材料范围，保守清除本账户全部教学结果。
    // 先提交取消/清除，再提交学习墓碑；任一步失败都不返回删除成功。
    if (materialDeleted) await eraseLearningModelResultCache(db, userId);
    const revision = stored.revision + (changed ? 1 : 0);
    const learningPatch = changed
      ? { state: await encodeServerHistory(state, userId), trialFacts: coachingMetricFacts(state), revision }
      : {};
    const result = await collection
      .where({
        _id: id,
        user_id: userId,
        revision: stored.revision,
        ...(privacyGuard
          ? {
              essayArtifactRevision:
                stored.essayArtifactRevision === undefined ? { $exists: false } : stored.essayArtifactRevision
            }
          : {})
      })
      .update({ ...learningPatch, ...artifactPatch });
    if (result.updated === 1) return { state, accepted, revision };
  }
  throw new AccountError('CONFLICT', '学习同步同时更新，请保留本地操作后重试');
}
