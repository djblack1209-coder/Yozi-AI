import crypto from 'node:crypto';
import cloud from '@lafjs/cloud';
import { requireAuth, isAuthError } from './_shared/auth-middleware.js';
import { requireActiveUser } from './_shared/active-user.js';
import { checkRateLimitDistributed } from './_shared/api-response.js';
import { decodeServerHistory } from './_shared/learning-history-server.js';
import { materialDeletedConversationIds } from './_shared/learning-domain.js';

const SCHEMA = 'yozi.learning-artifact.v1';
const conflict = '文档已有新版本。你的修改已保留，请重新载入核对后保存。';
const unavailable = '文档服务暂不可用。修改已保留，请恢复连接后重试。';
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const positive = (n: any) => Number.isSafeInteger(n) && n > 0;
const object = (v: any) => v && typeof v === 'object' && !Array.isArray(v);
function requireValue(value: any, code = 'ARTIFACT_INVALID') {
  if (!value) throw Object.assign(new Error(code), { code });
}
function checkedSource(source: any) {
  requireValue(
    object(source) &&
      Object.keys(source).every((k) => ['conversationId', 'kind', 'sourceId', 'day'].includes(k)) &&
      ['coach-submission', 'coach-legacy', 'writing-attempt'].includes(source.kind) &&
      [source.conversationId, source.sourceId].every(
        (v) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(v)
      ) &&
      (source.kind === 'writing-attempt' ? source.day === undefined : /^\d{4}-\d{2}-\d{2}$/.test(source.day))
  );
  return {
    conversationId: source.conversationId,
    kind: source.kind,
    sourceId: source.sourceId,
    ...(source.day ? { day: source.day } : {})
  };
}
const sourceId = (source: any) =>
  `essay:${encodeURIComponent(source.conversationId)}:${source.kind}:${encodeURIComponent(source.sourceId)}`;
function response(stored: any, version = stored.artifact.version, receipt?: any) {
  const revision = stored.versions.find((v: any) => v.version === version);
  requireValue(revision, 'ARTIFACT_NOT_FOUND');
  return { schema: SCHEMA, artifact: stored.artifact, revision, ...(receipt ? { receipt } : {}) };
}

// Resolve v1 from learning-sync's authoritative snapshot. Never accept an essay,
// receipt, grade or learning operation supplied by this endpoint's caller.
async function originalEssay(db: any, owner: string, source: any) {
  const row = (
    await db
      .collection('learning_states')
      .where({
        _id: `learning_sync_${hash(owner)}`,
        user_id: owner
      })
      .get()
  ).data?.[0];
  requireValue(row, 'ARTIFACT_SOURCE_UNSYNCED');
  const state = await decodeServerHistory(row.state, owner);
  const conversation = state.conversations.find((c: any) => c.id === source.conversationId);
  requireValue(conversation, 'ARTIFACT_NOT_FOUND');
  let content: any, title: string, at: number;
  if (source.kind === 'writing-attempt') {
    const attempt = state.attempts.find((a: any) => a.id === source.sourceId && a.conversationId === conversation.id);
    const question = state.questions.find((q: any) => `${q.id}@${q.version}` === attempt?.questionKey);
    requireValue(question?.writingExercise && typeof attempt?.answer === 'string', 'ARTIFACT_NOT_FOUND');
    content = attempt.answer;
    title = question.title || '写作';
    at = attempt.at;
  } else {
    const day = conversation.coach?.days.find((d: any) => d.day === source.day);
    requireValue(day, 'ARTIFACT_NOT_FOUND');
    if (source.kind === 'coach-submission') {
      const submission = day.writingSubmissions?.find(
        (s: any) => s.submissionId === source.sourceId && s.authorship === 'user_typed'
      );
      content = submission?.text;
      at = submission?.submittedAt || conversation.at;
    } else {
      requireValue(
        source.sourceId === day.day &&
          !day.writingSubmissions?.length &&
          day.essay &&
          day.pack?.writing?.patterns?.length === day.rewrites?.length &&
          day.rewrites.every((p: any) => p?.text?.trim()),
        'ARTIFACT_NOT_FOUND'
      );
      content = day.rewrites.map((p: any) => p.text).join('\n\n');
      at = conversation.at;
    }
    title = `${day.day} · 写作`;
  }
  requireValue(typeof content === 'string' && content.trim() && content.length <= 64000, 'ARTIFACT_NOT_FOUND');
  return { content, title, at };
}

export async function handleLearningArtifacts(db: any, owner: string, body: any) {
  requireValue(object(body) && ['open', 'get', 'versions', 'save', 'restore'].includes(body.action));
  const allowed: Record<string, string[]> = {
    open: ['action', 'id', 'source'],
    get: ['action', 'id', 'version'],
    versions: ['action', 'id'],
    save: ['action', 'id', 'expectedVersion', 'requestId', 'title', 'content'],
    restore: ['action', 'id', 'expectedVersion', 'requestId', 'sourceVersion']
  };
  requireValue(
    Object.keys(body).every((k) => allowed[body.action].includes(k)) &&
      typeof body.id === 'string' &&
      /^essay:[a-zA-Z0-9_-]{1,160}:(coach-submission|coach-legacy|writing-attempt):[a-zA-Z0-9_-]{1,160}$/.test(body.id)
  );
  const source = body.action === 'open' ? checkedSource(body.source) : null;
  if (source) requireValue(sourceId(source) === body.id);
  if (body.action === 'get') requireValue(body.version === undefined || positive(body.version));
  if (['save', 'restore'].includes(body.action)) {
    requireValue(
      positive(body.expectedVersion) &&
        typeof body.requestId === 'string' &&
        /^[a-zA-Z0-9_-]{8,120}$/.test(body.requestId)
    );
    if (body.action === 'save')
      requireValue(
        typeof body.title === 'string' &&
          body.title.trim().length > 0 &&
          body.title.length <= 200 &&
          typeof body.content === 'string' &&
          body.content.length <= 64000
      );
    else requireValue(positive(body.sourceVersion) && body.sourceVersion <= body.expectedVersion);
  }
  const collection = db.collection('learning_states');
  const query = { _id: `learning_sync_${hash(owner)}`, user_id: owner };
  const key = `essay_${hash(body.id)}`;
  const signature = hash(JSON.stringify(body));
  // One existing account row, a separate namespace and CAS counter. Never add
  // another learning_states row: some existing readers select by owner only.
  // learning-sync updates state/revision without replacing these own fields;
  // its existing account-wide deletion removes every essay copy/version too.
  for (let retry = 0; retry < 3; retry++) {
    const row = (await collection.where(query).get()).data?.[0];
    requireValue(row, body.action === 'open' ? 'ARTIFACT_SOURCE_UNSYNCED' : 'ARTIFACT_NOT_FOUND');
    requireValue(
      (row.essayArtifacts === undefined || object(row.essayArtifacts)) &&
        (row.essayArtifactRevision === undefined ||
          (Number.isSafeInteger(row.essayArtifactRevision) && row.essayArtifactRevision >= 0)),
      'ARTIFACT_UNAVAILABLE'
    );
    const state = await decodeServerHistory(row.state, owner);
    const deletedConversations = materialDeletedConversationIds(state);
    if (deletedConversations.size && row.essayArtifacts) {
      const kept = Object.fromEntries(
        Object.entries(row.essayArtifacts).filter(
          ([, copy]: any) => !deletedConversations.has(copy?.artifact?.source?.conversationId)
        )
      );
      if (Object.keys(kept).length !== Object.keys(row.essayArtifacts).length) {
        await collection
          .where({
            ...query,
            revision: row.revision,
            essayArtifactRevision:
              row.essayArtifactRevision === undefined ? { $exists: false } : row.essayArtifactRevision
          })
          .update({ essayArtifacts: kept, essayArtifactRevision: (row.essayArtifactRevision || 0) + 1 });
        continue;
      }
    }
    requireValue(!deletedConversations.has(body.id.split(':')[1]), 'ARTIFACT_NOT_FOUND');
    const copies = row.essayArtifacts || {},
      stored = copies[key];
    let next: any, receipt: any;
    if (body.action === 'open') {
      if (stored) return response(stored);
      const original = await originalEssay(db, owner, source),
        now = Date.now();
      next = {
        artifact: { id: body.id, owner, source, title: original.title, version: 1, created: now, updated: now },
        versions: [{ version: 1, title: original.title, content: original.content, created: now }],
        requests: []
      };
    } else {
      requireValue(stored, 'ARTIFACT_NOT_FOUND');
      if (body.action === 'get') return response(stored, body.version || stored.artifact.version);
      if (body.action === 'versions')
        return {
          schema: SCHEMA,
          owner,
          id: body.id,
          items: stored.versions.map(({ version, created, restoredFrom }: any) => ({
            version,
            created,
            ...(restoredFrom ? { restoredFrom } : {})
          }))
        };
      const prior = stored.requests.find((r: any) => r.requestId === body.requestId);
      if (prior) {
        requireValue(prior.signature === signature, 'ARTIFACT_REQUEST_CHANGED');
        return response(stored, prior.version, prior);
      }
      requireValue(stored.artifact.version === body.expectedVersion, 'ARTIFACT_CHANGED');
      const from =
        body.action === 'restore' ? stored.versions.find((v: any) => v.version === body.sourceVersion) : null;
      requireValue(body.action !== 'restore' || from, 'ARTIFACT_NOT_FOUND');
      const version = stored.artifact.version + 1,
        now = Date.now();
      const revision = {
        version,
        title: from?.title || body.title,
        content: from ? from.content : body.content,
        created: now,
        ...(from ? { restoredFrom: from.version } : {})
      };
      receipt = {
        requestId: body.requestId,
        action: body.action,
        expectedVersion: body.expectedVersion,
        version,
        signature
      };
      next = {
        artifact: { ...stored.artifact, title: revision.title, version, updated: now },
        versions: [...stored.versions, revision],
        requests: [...stored.requests, receipt]
      };
    }
    const updatedCopies = { ...copies, [key]: next },
      counter = row.essayArtifactRevision || 0;
    // Reserve headroom for the existing compressed learning snapshot and facts.
    // Reject a copy write at the boundary; never prune history or learning data.
    requireValue(
      next.versions.length <= 256 &&
        Buffer.byteLength(JSON.stringify(updatedCopies)) <= 2097152 &&
        Buffer.byteLength(JSON.stringify({ ...row, essayArtifacts: updatedCopies })) <= 15728640,
      'ARTIFACT_LIMIT'
    );
    const result = await collection
      .where({
        ...query,
        essayArtifactRevision: row.essayArtifactRevision === undefined ? { $exists: false } : counter,
        revision: row.revision
      })
      .update({ essayArtifacts: updatedCopies, essayArtifactRevision: counter + 1 });
    if (result.updated === 1) return response(next, next.artifact.version, receipt);
  }
  throw Object.assign(new Error('ARTIFACT_CHANGED'), { code: 'ARTIFACT_CHANGED' });
}

export default async function (ctx: any) {
  const auth = requireAuth(ctx);
  if (isAuthError(auth)) return auth;
  const db = cloud.database();
  const inactive = await requireActiveUser(db, auth.userId);
  if (inactive) return inactive;
  const limit = await checkRateLimitDistributed(`learning-artifacts:${auth.userId}`, 30, 60000);
  if (!limit.allowed) return { code: 429, success: false, message: unavailable };
  try {
    return { code: 0, success: true, data: await handleLearningArtifacts(db, auth.userId, ctx.body) };
  } catch (error: any) {
    const code = error?.code || 'ARTIFACT_UNAVAILABLE';
    return {
      code: ['ARTIFACT_CHANGED', 'ARTIFACT_REQUEST_CHANGED'].includes(code) ? 409 : 422,
      success: false,
      errorCode: code,
      message: ['ARTIFACT_CHANGED', 'ARTIFACT_REQUEST_CHANGED'].includes(code) ? conflict : unavailable
    };
  }
}
