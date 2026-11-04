import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MODEL_INTAKE_V2_CONTRACT,
  INTAKE_SCOPE_REPLAY_CONTRACT,
  intakeChoicesFor,
  normalizeIntakeReply,
  normalizeSavedIntakeReply,
  intakeScopeReplaySnapshot
} from '../../laf-backend/functions/_shared/learning-intake.js';
import { EXAM_SCOPE_V2_CONTRACT } from '../../laf-backend/functions/_shared/learning-exam-scope.js';
import {
  emptyLearningState,
  applyLearningOperation,
  createLearningOperationBatch,
  normalizePrivateSyncOperation
} from '@/services/learning/learning-domain.js';
import {
  createHistoryPackage,
  readHistoryPackage,
  encodeHistory
} from '../../laf-backend/functions/_shared/learning-history.js';
import { prepareLearningRestore, prepareLearningHistoryRestore } from '@/services/learning/learning-backup.js';
import { createLearningRepository, LEARNING_KEY } from '@/services/learning/learning-repository.js';
import { synchronizeLearning } from '@/services/learning/learning-sync.js';
import { syncWireResult } from '../../laf-backend/functions/_shared/learning-history-server.ts';
import { validateSyncOperation } from '../../laf-backend/functions/_shared/learning-sync.ts';
import { storageService } from '@/services/storageService.js';
import { learningWriteLease } from '@/services/learning/learning-write-lease.js';

const OWNER = 's39-synthetic-owner',
  AT = Date.parse('2026-11-04T14:00:00Z');
const ANSWER = '准备2027年广东省考公安执法勤务类申论。';
const scope = (patch = {}) => ({
  contract: EXAM_SCOPE_V2_CONTRACT,
  year: 2027,
  examLevel: 'provincial',
  region: 'CN-GD',
  positionCategory: null,
  ...patch
});
const receipt = (value = scope()) => ({ contract: INTAKE_SCOPE_REPLAY_CONTRACT, scope: value });
const context = {
  contract: MODEL_INTAKE_V2_CONTRACT,
  scopeContract: EXAM_SCOPE_V2_CONTRACT,
  turns: [{ question: '你在准备什么？', answer: ANSWER }]
};
const proposal = () => ({
  message: '请确认学习目标',
  intake: {
    options: [],
    input: false,
    profile: {
      goal: '合成申论目标',
      category: 'civil',
      exam: 'general',
      subjects: ['申论'],
      minutes: null,
      deadline: null,
      foundation: null,
      examScope: scope()
    }
  },
  question: null,
  tools: []
});
const greeting = () => ({
  message: '你在准备什么？',
  intake: { options: intakeChoicesFor({ contract: MODEL_INTAKE_V2_CONTRACT, turns: [] }), input: true, profile: null },
  question: null,
  tools: []
});
function harness() {
  let state = emptyLearningState(OWNER, 'Asia/Shanghai'),
    serial = 0;
  const apply = (type, data, intakeScope) => {
    const outcome = applyLearningOperation(state, {
      id: 's39-' + ++serial,
      type,
      at: AT + serial,
      data,
      ...(intakeScope ? { intakeScope } : {})
    });
    state = outcome.state;
    return outcome.result;
  };
  const start = () => {
    apply('intake.request', {
      requestId: 'greeting-' + serial,
      modelId: 'synthetic',
      explicit: true,
      reset: true,
      contract: MODEL_INTAKE_V2_CONTRACT,
      scopeContract: EXAM_SCOPE_V2_CONTRACT,
      binding: 'greeting-binding'
    });
    apply('intake.result', {
      requestId: state.intake.requestId,
      modelId: 'synthetic',
      binding: 'greeting-binding',
      reply: greeting()
    });
    apply('intake.request', {
      requestId: 'proposal-' + serial,
      modelId: 'synthetic',
      explicit: true,
      answer: ANSWER,
      binding: 'proposal-binding'
    });
  };
  const complete = (saved) => {
    start();
    apply(
      'intake.result',
      { requestId: state.intake.requestId, modelId: 'synthetic', binding: 'proposal-binding', reply: proposal() },
      receipt(saved)
    );
    apply('intake.accept', { explicit: true, coachMethod: 'shenlun-writing-method-v2' });
  };
  return { get: () => state, apply, start, complete };
}
function mixedHistory() {
  const h = harness();
  h.complete(scope());
  h.complete(scope({ positionCategory: 'gd-police' }));
  return h.get();
}
function replayOperation(event) {
  const intakeScope = intakeScopeReplaySnapshot(event),
    { id, type, at, data } = event;
  return { id, type, at, data, ...(intakeScope ? { intakeScope } : {}) };
}
function alteredPackage(state, change) {
  const value = createHistoryPackage(state),
    decoded = readHistoryPackage(JSON.stringify(value), OWNER);
  change(decoded.events);
  const encoded = encodeHistory(decoded.events, OWNER, 'export_s39tamper');
  return JSON.stringify({ ...value, manifest: encoded.manifest, pages: encoded.pages });
}

describe('S39 frozen confirmed scope without changing original operation identities', () => {
  it('keeps live extraction unchanged but validates either historical confirmation of the same raw reply', () => {
    const value = proposal(),
      before = structuredClone(value);
    expect(normalizeIntakeReply(value, false, context).intake.profile.examScope.positionCategory).toBe('gd-police');
    expect(normalizeSavedIntakeReply(value, false, context, receipt()).intake.profile.examScope).toEqual(scope());
    expect(
      normalizeSavedIntakeReply(value, false, context, receipt(scope({ positionCategory: 'gd-police' }))).intake.profile
        .examScope.positionCategory
    ).toBe('gd-police');
    expect(value).toEqual(before);
  });
  it('retains saved nulls; no snapshot follows the prior live and v1 behavior', () => {
    const unknown = scope({ year: null, examLevel: null, region: null });
    expect(normalizeSavedIntakeReply(proposal(), false, context, receipt(unknown)).intake.profile.examScope).toEqual(
      unknown
    );
    expect(normalizeSavedIntakeReply(proposal(), false, context)).toEqual(
      normalizeIntakeReply(proposal(), false, context)
    );
    const ctx = { ...context, scopeContract: 'learning-exam-scope-v1' };
    expect(
      normalizeSavedIntakeReply(proposal(), false, ctx, receipt(scope({ contract: ctx.scopeContract }))).intake.profile
        .examScope.positionCategory
    ).toBeNull();
  });
  it.each([
    { year: 2099 },
    { examLevel: 'national', region: 'CN' },
    { region: 'CN-JS' },
    { positionCategory: 'gd-shenlun-2' },
    { contract: 'learning-exam-scope-v1' },
    { sourceId: 'forged' }
  ])('rejects snapshot facts beyond literal evidence/version: %j', (patch) => {
    expect(() => normalizeSavedIntakeReply(proposal(), false, context, receipt(scope(patch)))).toThrow();
  });
  it('requires matching context, rejects unknown metadata and ignores arbitrary result claims', () => {
    expect(() =>
      normalizeSavedIntakeReply(proposal(), false, { ...context, scopeContract: undefined }, receipt())
    ).toThrow();
    expect(() =>
      normalizeSavedIntakeReply(proposal(), false, context, { ...receipt(), contract: 'unknown' })
    ).toThrow();
    const h = harness();
    h.start();
    const state = h.get(),
      pending = state.intake;
    const op = {
      id: 'forged-result',
      type: 'intake.result',
      at: AT + 100,
      data: { requestId: pending.requestId, modelId: pending.modelId, binding: pending.binding, reply: proposal() },
      result: { tools: [{ status: 'succeeded' }], intake: { profile: { examScope: scope() } } }
    };
    const next = applyLearningOperation(state, op).state;
    expect(next.intake.reply.intake.profile.examScope.positionCategory).toBe('gd-police');
    expect(next.executions).toHaveLength(0);
    expect(() =>
      applyLearningOperation(state, { ...op, intakeScope: receipt(), data: { ...op.data, binding: 'foreign' } })
    ).toThrow('旧模型建档回复');
    expect(() =>
      applyLearningOperation(state, {
        id: 'wrong-type',
        type: 'conversation.start',
        at: AT + 100,
        data: { goal: 'Synthetic' },
        intakeScope: receipt()
      })
    ).toThrow();
  });
  it('preserves confirmation gates, immutable data/result and idempotency for both historical cases', () => {
    const state = mixedHistory(),
      before = JSON.stringify(state);
    let replay = emptyLearningState(OWNER, state.timezone);
    for (const e of state.events)
      replay = applyLearningOperation(replay, normalizePrivateSyncOperation(replayOperation(e))).state;
    expect(replay).toEqual(state);
    expect(state.conversations.map((c) => c.coach.profile.examScope.positionCategory)).toEqual([null, 'gd-police']);
    const result = state.events.find((e) => intakeScopeReplaySnapshot(e));
    expect(result.data.reply.intake.profile.examScope.positionCategory).toBeNull();
    expect(result.result.intake.profile.examScope.positionCategory).toBeNull();
    expect(applyLearningOperation(state, replayOperation(result)).reused).toBe(true);
    expect(() =>
      applyLearningOperation(state, {
        ...replayOperation(result),
        intakeScope: receipt(scope({ positionCategory: 'gd-police' }))
      })
    ).toThrow('已有建档范围');
    expect(JSON.stringify(state)).toBe(before);
    const h = harness();
    h.start();
    h.apply(
      'intake.result',
      { requestId: h.get().intake.requestId, modelId: 'synthetic', binding: 'proposal-binding', reply: proposal() },
      receipt()
    );
    expect(h.get().conversations).toHaveLength(0);
    expect(() => h.apply('intake.accept', { explicit: false, coachMethod: 'shenlun-writing-method-v2' })).toThrow();
  });
  it('round-trips full snapshots and v2 exports exactly, carrying only the exam-scope result fields', async () => {
    const state = mixedHistory(),
      original = JSON.stringify(state),
      packaged = createHistoryPackage(state);
    expect(packaged.version).toBe(2);
    const decoded = readHistoryPackage(JSON.stringify(packaged), OWNER);
    expect(decoded.events.filter((e) => e.intakeScope)).toHaveLength(2);
    expect(decoded.events.map((e) => e.data)).toEqual(state.events.map((e) => e.data));
    expect(decoded.events.every((e) => !('result' in e))).toBe(true);
    expect(
      prepareLearningRestore(emptyLearningState(OWNER, state.timezone), original, { now: AT + 1000 }).state
    ).toEqual(state);
    expect(
      (
        await prepareLearningHistoryRestore(emptyLearningState(OWNER, state.timezone), JSON.stringify(packaged), {
          now: AT + 1000
        })
      ).state
    ).toEqual(state);
    expect(() => prepareLearningRestore(emptyLearningState('another-owner'), original)).toThrow();
    expect(JSON.stringify(state)).toBe(original);
  });
  it('keeps ordinary v1 packages readable without inventing old missing confirmation snapshots', async () => {
    const h = harness();
    h.start();
    const state = h.get(),
      packaged = createHistoryPackage(state);
    expect(packaged.version).toBe(1);
    expect(
      (
        await prepareLearningHistoryRestore(emptyLearningState(OWNER, state.timezone), JSON.stringify(packaged), {
          now: AT + 1000
        })
      ).state
    ).toEqual(state);
  });
  it('refuses ambiguous old v1 scope replay instead of inventing a missing confirmation snapshot', async () => {
    const state = mixedHistory(),
      value = createHistoryPackage(state);
    const decoded = readHistoryPackage(JSON.stringify(value), OWNER);
    for (const event of decoded.events) delete event.intakeScope;
    const encoded = encodeHistory(decoded.events, OWNER, 'export_s39legacy');
    const content = JSON.stringify({ ...value, version: 1, manifest: encoded.manifest, pages: encoded.pages });
    const current = emptyLearningState(OWNER, state.timezone),
      original = JSON.stringify(current);
    await expect(prepareLearningHistoryRestore(current, content, { now: AT + 1000 })).rejects.toMatchObject({
      code: 'MISSING_INTAKE_SCOPE'
    });
    expect(JSON.stringify(current)).toBe(original);
  });
  it.each(['missing', 'wrong-operation', 'unknown-version', 'fabricated-fact'])(
    'rejects %s metadata even with recomputed checksums',
    async (kind) => {
      const content = alteredPackage(mixedHistory(), (events) => {
        const e = events.find((v) => v.intakeScope);
        if (kind === 'missing') delete e.intakeScope;
        if (kind === 'wrong-operation') e.type = 'conversation.start';
        if (kind === 'unknown-version') e.intakeScope.contract = 'unknown';
        if (kind === 'fabricated-fact') e.intakeScope.scope.year = 2099;
      });
      await expect(
        prepareLearningHistoryRestore(emptyLearningState(OWNER, 'Asia/Shanghai'), content, { now: AT + 1000 })
      ).rejects.toThrow();
    }
  );
});

beforeEach(() => {
  uni.clearStorageSync();
  storageService.saveLoginSession({ userId: OWNER, token: 'synthetic-only', userInfo: {} });
});
afterEach(() => {
  learningWriteLease.release();
  vi.restoreAllMocks();
});
function repository(state) {
  const cache = new Map([[LEARNING_KEY, state]]);
  return createLearningRepository(
    {
      get: (key, fallback) => cache.get(key) ?? fallback,
      save: (key, value) => {
        cache.set(key, value);
        return true;
      },
      remove: (key) => cache.delete(key)
    },
    () => OWNER
  );
}
describe('S39 sync capability and immutable operation payloads', () => {
  it('refuses lossy upload to a legacy service before sending pending scope operations', async () => {
    const state = mixedHistory(),
      repo = repository(state),
      request = vi.fn(async () => ({ success: true, data: { state: emptyLearningState(OWNER, state.timezone) } }));
    await expect(synchronizeLearning(repo, true, request)).rejects.toMatchObject({ code: 'UPDATE_REQUIRED' });
    expect(request.mock.calls.map(([, body]) => body.action)).toEqual(['pull']);
    expect(repo.read()).toEqual(state);
  });
  it('synchronizes both confirmations to a supported service and remains idempotent', async () => {
    const state = mixedHistory(),
      repo = repository(state);
    let remote = emptyLearningState(OWNER, state.timezone),
      revision = 0;
    const request = vi.fn(async (_path, body) => {
      if (body.action === 'push') {
        const batch = createLearningOperationBatch(remote);
        for (const op of body.operations) batch.apply(validateSyncOperation(op));
        remote = batch.finish();
        revision++;
        return {
          success: true,
          data: syncWireResult({ state: remote, accepted: body.operations.map((e) => e.id), revision }, true)
        };
      }
      return { success: true, data: syncWireResult({ state: remote, revision }) };
    });
    await synchronizeLearning(repo, true, request);
    expect(remote).toEqual(state);
    expect(repo.read()).toEqual(state);
    const wire = request.mock.calls.find(([, body]) => body.action === 'push')[1].operations;
    expect(wire.filter((e) => e.intakeScope)).toHaveLength(2);
    expect(wire.map((e) => e.data)).toEqual(state.events.map((e) => e.data));
    await synchronizeLearning(repo, true, request);
    expect(request.mock.calls.filter(([, body]) => body.action === 'push')).toHaveLength(1);
    expect(repo.read()).toEqual(state);
  });
});

describe('S40 same-id confirmed scope synchronization boundaries', () => {
  const oneScope = (value) => {
    const h = harness();
    h.complete(value);
    return h.get();
  };
  const proposalId = (state) => state.events.find((e) => e.type === 'intake.result' && e.result?.intake?.profile).id;
  const assertConflict = async (local, remote, request) => {
    const repo = repository(local);
    await expect(synchronizeLearning(repo, true, request)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(repo.read()).toEqual(local);
    expect(repo.previewSyncConflict()?.ids).toEqual([proposalId(local)]);
    expect(JSON.parse(repo.exportSyncConflict('local'))).toEqual(local);
    expect(JSON.parse(repo.exportSyncConflict('remote'))).toEqual(remote);
    return repo;
  };
  it.each([false, true])(
    'preserves both copies when shared original input has different saved scope, reversed=%s',
    async (reverse) => {
      const unknown = oneScope(scope()),
        confirmed = oneScope(scope({ positionCategory: 'gd-police' }));
      const [local, remote] = reverse ? [confirmed, unknown] : [unknown, confirmed];
      expect(local.events.map((e) => e.data)).toEqual(remote.events.map((e) => e.data));
      const request = vi.fn(async () => ({ success: true, data: syncWireResult({ state: remote, revision: 1 }) }));
      await assertConflict(local, remote, request);
      expect(request.mock.calls.map(([, body]) => body.action)).toEqual(['pull']);
    }
  );
  it.each([false, true])('treats a missing saved scope on one side as a conflict, reversed=%s', async (reverse) => {
    const complete = oneScope(scope()),
      missing = structuredClone(complete);
    delete missing.events.find((e) => e.id === proposalId(complete)).result.intake.profile.examScope;
    const [local, remote] = reverse ? [missing, complete] : [complete, missing];
    const request = vi.fn(async () => ({ success: true, data: syncWireResult({ state: remote, revision: 1 }) }));
    await assertConflict(local, remote, request);
  });
  it.each([false, true])(
    'rejects changed saved scope in the final server acknowledgement, compact=%s',
    async (compact) => {
      const local = oneScope(scope()),
        remote = oneScope(scope({ positionCategory: 'gd-police' }));
      let pushed = false;
      const request = vi.fn(async (_path, body) => {
        if (body.action === 'push') {
          pushed = true;
          expect(body.operations.find((e) => e.id === proposalId(local)).intakeScope).toEqual(receipt());
          return {
            success: true,
            data: syncWireResult({ state: remote, revision: 1, accepted: body.operations.map((e) => e.id) }, compact)
          };
        }
        return {
          success: true,
          data: syncWireResult({
            state: pushed ? remote : emptyLearningState(OWNER, local.timezone),
            revision: pushed ? 1 : 0
          })
        };
      });
      await assertConflict(local, remote, request);
      expect(request.mock.calls.filter(([, body]) => body.action === 'push')).toHaveLength(1);
    }
  );
  it.each([null, 'gd-police'])(
    'accepts equal saved scopes and keeps non-scope server results authoritative, category=%s',
    async (positionCategory) => {
      const local = oneScope(scope({ positionCategory })),
        remote = structuredClone(local);
      remote.events.find((e) => e.id === proposalId(local)).result.message = '服务端已保存的确认说明';
      const repo = repository(local),
        request = vi.fn(async () => ({ success: true, data: syncWireResult({ state: remote, revision: 1 }) }));
      await synchronizeLearning(repo, true, request);
      expect(repo.read()).toEqual(remote);
      expect(repo.previewSyncConflict()).toBeNull();
      expect(request.mock.calls.map(([, body]) => body.action)).toEqual(['pull']);
    }
  );
  it('keeps ordinary shared records without any scope receipt readable', async () => {
    const h = harness();
    h.start();
    const state = h.get(),
      repo = repository(state),
      request = vi.fn(async () => ({ success: true, data: syncWireResult({ state, revision: 1 }) }));
    await synchronizeLearning(repo, true, request);
    expect(repo.read()).toEqual(state);
    expect(repo.previewSyncConflict()).toBeNull();
  });
});
