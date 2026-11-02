// Internal callable only; intentionally no HTTP function, cron, account discovery or model client.
import { createLearningOperationBatch } from './learning-domain.js';
import { stageConversationEntryScan } from './learning-entry-extractor.js';
import { decodeServerHistory, encodeServerHistory } from './learning-history-server.js';

export async function runConversationEntryScan(db: any, userId: string, options: any = {}) {
  const clock = options.clock || Date.now;
  const began = clock(),
    token = options.token;
  if (!token || typeof token !== 'string' || token.length > 160)
    throw Object.assign(new Error('需要独立执行租约标识'), { code: 'PRECONDITION' });
  const collection = db.collection('learning_states');
  for (let conflict = 0; conflict < 5 && clock() - began < 30000; conflict++) {
    const doc = (await collection.where({ user_id: userId }).get()).data?.[0];
    const meta = doc?.extraction;
    if (!doc || !meta?.enabled || !meta.consentVersion || !Number.isFinite(meta.enabledAt))
      return { status: 'disabled' };
    if (meta.retryAt > clock() || meta.attempts >= 3) return { status: 'retry_pending' };
    if (meta.leaseUntil > clock()) return { status: 'leased' };
    const lease = { ...meta, leaseToken: token, leaseUntil: clock() + 30000 };
    const claimed = await collection
      .where({ _id: doc._id, user_id: userId, revision: doc.revision, extraction: meta })
      .update({ extraction: lease });
    if (!claimed.updated) continue;
    try {
      const state = await decodeServerHistory(doc.state, userId);
      if (state.owner !== userId) throw Object.assign(new Error('回扫账户不匹配'), { code: 'OWNER_MISMATCH' });
      const staged = stageConversationEntryScan(state, lease, clock(), options.extract);
      const batch = createLearningOperationBatch(state, Math.max(1, staged.operations.length));
      for (const op of staged.operations) batch.apply(op);
      const next = staged.operations.length ? batch.finish() : state;
      if (clock() >= lease.leaseUntil) return { status: 'lease_expired' };
      const extraction = { ...staged.extraction, leaseToken: null, leaseUntil: 0 };
      const encoded = await encodeServerHistory(next, userId);
      if (clock() >= lease.leaseUntil) return { status: 'lease_expired' };
      const write = await collection
        .where({ _id: doc._id, user_id: userId, revision: doc.revision, extraction: lease })
        .update({ state: encoded, revision: doc.revision + 1, extraction });
      if (write.updated)
        return { status: 'completed', scanned: staged.scanned || 0, candidates: staged.operations.length };
      // A sync/deletion/consent change won the CAS. Release only our exact lease; retry fresh state.
      await collection
        .where({ _id: doc._id, user_id: userId, extraction: lease })
        .update({ extraction: { ...meta, leaseToken: null, leaseUntil: 0 } });
    } catch (e) {
      const attempts = (meta.attempts || 0) + 1;
      await collection.where({ _id: doc._id, user_id: userId, extraction: lease }).update({
        extraction: {
          ...meta,
          attempts,
          retryAt: clock() + [60000, 300000, 1800000][Math.min(2, attempts - 1)],
          leaseToken: null,
          leaseUntil: 0,
          error: 'SCAN_FAILED'
        }
      });
      return { status: 'failed', attempts }; // Never copy message bodies or exception text to metadata.
    }
  }
  return { status: 'conflict' };
}
