import { reactive } from 'vue';
import { captureSession, assertSession } from '../auth-storage.js';
import { storageService } from '../storageService.js';
import { requestLearningArtifact } from '../api/domains/learning.api.js';
import config from '../../config/index.js';
import { materialDeletedConversationIds } from './learning-domain.js';

export const ARTIFACT_SCHEMA = 'yozi.learning-artifact.v1';
// Reuse Muse 2 api.ts ArtifactError copy; no teaching/fact mutation belongs here.
export const ARTIFACT_CONFLICT = '文档已有新版本。你的修改已保留，请重新载入核对后保存。';
const unavailable = '文档服务暂不可用。修改已保留，请恢复连接后重试。';
const invalidReceipt = '未收到有效的文档回执。请核对后重试。';
const storageFailed = '保存失败，请检查存储空间';
const positive = (n) => Number.isSafeInteger(n) && n > 0;
const clone = (v) => JSON.parse(JSON.stringify(v));
export const essayArtifactId = (source) =>
  `essay:${encodeURIComponent(source.conversationId)}:${source.kind}:${encodeURIComponent(source.sourceId)}`;

// Only submitted full essays are eligible. Partial paragraph cards stay in chat.
// A legacy day without a submission snapshot is eligible only after essay feedback.
export function studentEssaySources(state) {
  const items = [];
  for (const conversation of state.conversations || []) {
    for (const day of conversation.coach?.days || []) {
      const submissions = day.writingSubmissions || [];
      const originals = submissions.length
        ? submissions
            .filter((s) => s.authorship === 'user_typed' && s.text?.trim())
            .map((s) => ({
              sourceId: s.submissionId,
              content: s.text,
              at: s.submittedAt,
              kind: 'coach-submission'
            }))
        : day.essay &&
            day.pack?.writing?.patterns?.length === day.rewrites?.length &&
            day.rewrites.every((p) => p?.text?.trim())
          ? [{ sourceId: day.day, content: day.rewrites.map((p) => p.text).join('\n\n'), kind: 'coach-legacy' }]
          : [];
      for (const original of originals) {
        const source = {
          conversationId: conversation.id,
          kind: original.kind,
          sourceId: original.sourceId,
          day: day.day
        };
        items.push({
          id: essayArtifactId(source),
          source,
          content: original.content,
          title: `${day.day} · 写作`,
          at: original.at || conversation.at,
          conversationId: conversation.id,
          day: day.day,
          goal: conversation.goal,
          kind: 'writing',
          icon: 'file-text',
          detail: '你的全文'
        });
      }
    }
  }
  // The independent writing route also keeps its original answer on the attempt.
  for (const attempt of state.attempts || []) {
    const question = (state.questions || []).find((q) => `${q.id}@${q.version}` === attempt.questionKey);
    if (!question?.writingExercise || typeof attempt.answer !== 'string' || !attempt.answer.trim()) continue;
    const conversation = (state.conversations || []).find((c) => c.id === attempt.conversationId);
    if (!conversation) continue;
    const source = { conversationId: conversation.id, kind: 'writing-attempt', sourceId: attempt.id };
    items.push({
      id: essayArtifactId(source),
      source,
      content: attempt.answer,
      title: question.title || '写作',
      at: attempt.at,
      conversationId: conversation.id,
      goal: conversation.goal,
      kind: 'writing',
      icon: 'file-text',
      detail: '已提交原答'
    });
  }
  return items;
}

export function createLearningArtifacts({
  request = requestLearningArtifact,
  storage = storageService,
  session = captureSession(),
  check = assertSession,
  api = config.api.baseUrl,
  keys = () => {
    const info = storage.getStorageInfo();
    if (info?.limitSize === 0) throw new Error('删除失败，请重试');
    return info?.keys;
  }
} = {}) {
  const owner = session.owner;
  const prefix = `conversation_learning_v1_artifacts:${encodeURIComponent(api)}:`;
  const key = (type, id) => `${prefix}${type}:${id}`;
  const current = () => check(session);
  function read(type, id, fallback = null) {
    current();
    const value = storage.get(key(type, id), fallback, { session, migrateLegacy: false });
    current();
    if (value !== fallback && (value?.owner !== owner || value?.id !== id)) throw new Error(storageFailed);
    return value;
  }
  function write(type, id, value) {
    current();
    const record = { ...clone(value), owner, id };
    if (storage.save(key(type, id), record, true, session) !== true) throw new Error(storageFailed);
    current();
    if (JSON.stringify(read(type, id)) !== JSON.stringify(record)) throw new Error(storageFailed);
    return record;
  }
  function document(value, id) {
    const a = value?.artifact,
      r = value?.revision;
    if (
      value?.schema !== ARTIFACT_SCHEMA ||
      a?.owner !== owner ||
      a?.id !== id ||
      !positive(a.version) ||
      typeof a.title !== 'string' ||
      !a.title.trim() ||
      essayArtifactId(a.source || {}) !== id ||
      !positive(r?.version) ||
      r.version > a.version ||
      typeof r.title !== 'string' ||
      typeof r.content !== 'string' ||
      !Number.isFinite(r.created)
    )
      throw new Error(invalidReceipt);
    return clone(value);
  }
  async function send(body) {
    current();
    const response = await request(body, { session, expectedOwner: owner, assertCurrent: current });
    current();
    if (!response?.success) {
      const code = response?.errorCode || response?.error;
      throw Object.assign(
        new Error(
          ['ARTIFACT_CHANGED', 'ARTIFACT_REQUEST_CHANGED'].includes(code)
            ? ARTIFACT_CONFLICT
            : response?.message || unavailable
        ),
        { code }
      );
    }
    return response.data;
  }
  const readDraft = (id) => {
    const value = read('draft', id);
    if (
      value &&
      (!positive(value.version) ||
        typeof value.content !== 'string' ||
        typeof value.title !== 'string' ||
        !Number.isFinite(value.scrollTop) ||
        value.scrollTop < 0 ||
        !['read', 'edit'].includes(value.mode))
    )
      throw new Error(storageFailed);
    return value;
  };
  return {
    owner,
    // Called only after the existing, explicitly confirmed local-data deletion.
    // Match this account/API's own keys; never enumerate or delete other content.
    clearDeviceState() {
      current();
      const scoped = `${owner === 'guest' ? `g_${session.epoch}` : `u_${owner}`}_${prefix}`;
      const all = keys();
      if (!Array.isArray(all)) throw new Error('删除失败，请重试');
      const owned = all.filter(
        (k) => typeof k === 'string' && k.startsWith(scoped) && /^(draft|pin):/.test(k.slice(scoped.length))
      );
      for (const raw of owned) {
        current();
        const localKey = raw.slice(scoped.length - prefix.length);
        if (
          storage.remove(localKey, true, session) !== true ||
          storage.get(localKey, null, { session, migrateLegacy: false }) !== null
        )
          throw new Error('删除失败，请重试');
      }
      current();
      const remaining = keys();
      if (!Array.isArray(remaining) || owned.some((k) => remaining.includes(k))) throw new Error('删除失败，请重试');
      return owned.length;
    },
    clearMaterialDeletedState(state, beforeRemove) {
      current();
      if (state?.owner !== owner) throw new Error('资料删除属于其他账户，未清理文档副本');
      const deleted = materialDeletedConversationIds(state);
      if (!deleted.size) return 0;
      const scoped = `${owner === 'guest' ? `g_${session.epoch}` : `u_${owner}`}_${prefix}`;
      const all = keys();
      if (!Array.isArray(all)) throw new Error('文档设备副本清理失败，请重试');
      const owned = all.filter((raw) => {
        if (typeof raw !== 'string' || !raw.startsWith(scoped)) return false;
        const match =
          /^(draft|pin):essay:([a-zA-Z0-9_-]{1,160}):(coach-submission|coach-legacy|writing-attempt):[a-zA-Z0-9_-]{1,160}$/.exec(
            raw.slice(scoped.length)
          );
        return match && deleted.has(match[2]);
      });
      if (owned.length) beforeRemove?.();
      for (const raw of owned) {
        current();
        const localKey = raw.slice(scoped.length - prefix.length);
        if (
          storage.remove(localKey, true, session) !== true ||
          storage.get(localKey, null, { session, migrateLegacy: false }) !== null
        )
          throw new Error('文档设备副本清理失败，请重试');
      }
      current();
      const remaining = keys();
      if (!Array.isArray(remaining) || owned.some((raw) => remaining.includes(raw)))
        throw new Error('文档设备副本清理失败，请重试');
      return owned.length;
    },
    readDraft,
    writeDraft(id, value) {
      return write('draft', id, value);
    },
    readPin(id) {
      return read('pin', id)?.pinned === true;
    },
    setPin(id, pinned) {
      return write('pin', id, { pinned: pinned === true }).pinned;
    },
    async open(item) {
      const value = document(await send({ action: 'open', id: item.id, source: item.source }), item.id);
      if (value.revision.version !== value.artifact.version) throw new Error(invalidReceipt);
      return value;
    },
    async get(id, version) {
      const value = document(await send({ action: 'get', id, ...(version ? { version } : {}) }), id);
      if (value.revision.version !== (version || value.artifact.version)) throw new Error(invalidReceipt);
      return value;
    },
    async versions(id) {
      const value = await send({ action: 'versions', id });
      if (
        value?.schema !== ARTIFACT_SCHEMA ||
        value.owner !== owner ||
        value.id !== id ||
        !Array.isArray(value.items) ||
        !value.items.every((v, i) => v.version === i + 1 && Number.isFinite(v.created))
      )
        throw new Error(invalidReceipt);
      return value.items;
    },
    // Persist request identity before sending. Lost replies, panel recreation and
    // App restarts retry the exact same mutation instead of appending twice.
    async mutate(id, draft, sourceVersion = null, { retryPending = false } = {}) {
      let body = sourceVersion
        ? { action: 'restore', id, expectedVersion: draft.version, sourceVersion }
        : { action: 'save', id, expectedVersion: draft.version, title: draft.title, content: draft.content };
      const saved = readDraft(id);
      let pending = saved?.pending;
      if (retryPending) {
        let frozen;
        try {
          frozen = JSON.parse(pending?.signature);
        } catch {
          // Keep the local text when an old or damaged pending record cannot be retried.
        }
        const fields =
          frozen?.action === 'save'
            ? ['action', 'id', 'expectedVersion', 'title', 'content']
            : ['action', 'id', 'expectedVersion', 'sourceVersion'];
        if (
          !frozen ||
          !['save', 'restore'].includes(frozen.action) ||
          frozen.id !== id ||
          !positive(frozen.expectedVersion) ||
          frozen.expectedVersion !== draft.version ||
          typeof pending?.requestId !== 'string' ||
          !pending.requestId ||
          Object.keys(frozen).length !== fields.length ||
          !fields.every((field) => Object.hasOwn(frozen, field)) ||
          (frozen.action === 'save'
            ? typeof frozen.title !== 'string' || typeof frozen.content !== 'string'
            : !positive(frozen.sourceVersion))
        )
          throw new Error('待确认的文档请求不可用。修改已保留，请重新载入核对。');
        body = frozen;
      } else {
        const signature = JSON.stringify(body);
        if (pending && pending.signature !== signature)
          throw new Error('上一项保存或恢复尚待确认。请先重试，当前修改已保留。');
        pending ||= {
          signature,
          requestId:
            globalThis.crypto?.randomUUID?.() || `artifact_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          input: { title: draft.title, content: draft.content }
        };
      }
      write('draft', id, { ...draft, pending });
      const value = document(await send({ ...body, requestId: pending.requestId }), id);
      const receipt = value.receipt;
      if (
        receipt?.requestId !== pending.requestId ||
        receipt.action !== body.action ||
        receipt.expectedVersion !== body.expectedVersion ||
        receipt.version !== body.expectedVersion + 1 ||
        value.revision.version !== receipt.version ||
        value.artifact.version !== receipt.version ||
        (body.action === 'save' && (value.revision.title !== body.title || value.revision.content !== body.content)) ||
        (body.action === 'restore' && value.revision.restoredFrom !== body.sourceVersion)
      )
        throw new Error(invalidReceipt);
      // Do not erase edits made after a closed panel sent this request.
      const latest = readDraft(id);
      if (latest?.pending?.requestId === pending.requestId && latest.version === body.expectedVersion) {
        const input = body.action === 'save' ? body : pending.input;
        const unchanged = input && latest.title === input.title && latest.content === input.content;
        write('draft', id, {
          ...latest,
          version: value.revision.version,
          ...(unchanged ? { title: value.revision.title, content: value.revision.content } : {}),
          pending: null
        });
      }
      return value;
    }
  };
}

const workspaces = new WeakMap();
export function artifactWorkspace(learning) {
  if (!workspaces.has(learning)) workspaces.set(learning, reactive({ target: null }));
  return workspaces.get(learning);
}
export function openStudentArtifact(learning, item) {
  artifactWorkspace(learning).target = {
    id: item.id,
    source: clone(item.source),
    owner: learning.state.owner,
    context: learning.recordContext(),
    route: typeof getCurrentPages === 'function' ? getCurrentPages().at(-1)?.route || '' : ''
  };
}
