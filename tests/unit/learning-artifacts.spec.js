import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLearningArtifacts,
  studentEssaySources,
  ARTIFACT_SCHEMA,
  ARTIFACT_CONFLICT
} from '@/services/learning/learning-artifacts.js';
import { artifactFixtureState, artifactMemoryStorage } from '../fixtures/learning-artifacts.js';
import { createLearningRepository, LEARNING_KEY } from '@/services/learning/learning-repository.js';
import { storageService } from '@/services/storageService.js';
import { parsePastedMaterial } from '@/services/learning/material-intake.js';
import {
  applyLearningOperation,
  emptyLearningState,
  materialDeletedConversationIds
} from '@/services/learning/learning-domain.js';
import { prepareLearningRestore } from '@/services/learning/learning-backup.js';
let storage, session, item, request, check, doc, revisions;
beforeEach(() => {
  storage = artifactMemoryStorage();
  session = { owner: 'artifact-student', epoch: 'session-one' };
  check = vi.fn((s) => {
    if (s.owner !== session.owner || s.epoch !== session.epoch) throw new Error('登录会话已变化，未发送旧内容');
  });
  item = studentEssaySources(artifactFixtureState())[0];
  revisions = [{ version: 1, title: item.title, content: item.content, created: 1000 }];
  doc = {
    schema: ARTIFACT_SCHEMA,
    artifact: { id: item.id, owner: session.owner, source: item.source, title: item.title, version: 1 },
    revision: revisions[0]
  };
  const receipts = new Map();
  request = vi.fn(async (body) => {
    let value;
    if (body.action === 'open' || body.action === 'get')
      value = { ...doc, revision: revisions[(body.version || doc.artifact.version) - 1] };
    else if (body.action === 'versions')
      value = {
        schema: ARTIFACT_SCHEMA,
        id: item.id,
        owner: session.owner,
        items: revisions.map(({ version, created }) => ({ version, created }))
      };
    else {
      if (receipts.has(body.requestId)) return { success: true, data: structuredClone(receipts.get(body.requestId)) };
      if (body.expectedVersion !== doc.artifact.version) return { success: false, errorCode: 'ARTIFACT_CHANGED' };
      const from = body.action === 'restore' ? revisions[body.sourceVersion - 1] : null;
      const revision = {
        version: doc.artifact.version + 1,
        title: from?.title || body.title,
        content: from?.content ?? body.content,
        created: 2000 + revisions.length,
        ...(from ? { restoredFrom: body.sourceVersion } : {})
      };
      revisions.push(revision);
      doc = { ...doc, artifact: { ...doc.artifact, title: revision.title, version: revision.version }, revision };
      value = {
        ...doc,
        receipt: {
          requestId: body.requestId,
          expectedVersion: body.expectedVersion,
          version: revision.version,
          action: body.action
        }
      };
      receipts.set(body.requestId, structuredClone(value));
    }
    return { success: true, data: structuredClone(value) };
  });
});
const client = () =>
  createLearningArtifacts({
    request,
    storage,
    session: { ...session },
    check,
    api: 'https://synthetic.invalid',
    keys: () =>
      [...storage.rows.keys()].map((entry) => {
        const cut = entry.indexOf(':');
        return `u_${entry.slice(0, cut)}_${entry.slice(cut + 1)}`;
      })
  });
const draft = (content = 'My revised copy') => ({
  version: 1,
  title: item.title,
  content,
  mode: 'edit',
  scrollTop: 124,
  editorScrollTop: 33,
  pending: null
});

afterEach(() => {
  vi.restoreAllMocks();
  uni.clearStorageSync();
  localStorage.clear();
});
function s45DeviceFixture() {
  uni.clearStorageSync();
  localStorage.clear();
  uni.setStorageSync('EXAM_USER_ID', 'artifact-student');
  uni.setStorageSync('EXAM_TOKEN', 'S45_LOCAL_SYNTHETIC_NOT_VALID');
  const state = artifactFixtureState('artifact-student');
  state.materials.push(parsePastedMaterial('S45 private material.', 's45-material'));
  state.conversations[0].coach.materialIds = ['s45-material'];
  const c = createLearningArtifacts();
  c.writeDraft(item.id, {
    ...draft('S45 private pending words.'),
    pending: { requestId: 's45-original', signature: 'S45_PRIVATE_PENDING' }
  });
  c.setPin(item.id, true);
  const independentId = 'essay:s45-independent:coach-submission:independent-answer';
  c.writeDraft(independentId, draft('Keep independent local words.'));
  c.setPin(independentId, true);
  expect(storageService.save(LEARNING_KEY, state, true)).toBe(true);
  const repo = createLearningRepository(storageService, () => 'artifact-student', null);
  const deletion = {
    id: 's45-delete-material',
    type: 'material.delete',
    at: Date.now(),
    data: { materialId: 's45-material', questionKeys: [] }
  };
  return { c, repo, state, deletion, independentId };
}

describe('S4 device state and confirmed mutations', () => {
  it('explicit local deletion clears only this account/API scratch and pin keys', () => {
    const c = client();
    c.writeDraft(item.id, draft());
    c.setPin(item.id, true);
    session.owner = 'another-student';
    client().setPin(item.id, true);
    session.owner = 'artifact-student';
    const anotherApi = createLearningArtifacts({
      request,
      storage,
      session: { ...session },
      check,
      api: 'https://other.invalid'
    });
    anotherApi.setPin(item.id, true);
    expect(c.clearDeviceState()).toBe(2);
    expect(c.readDraft(item.id)).toBeNull();
    expect(c.readPin(item.id)).toBe(false);
    expect(anotherApi.readPin(item.id)).toBe(true);
    session.owner = 'another-student';
    expect(client().readPin(item.id)).toBe(true);
  });
  it('B2 both entrances resolve the same stable source identity and confirmed revision', async () => {
    const first = await client().open(item),
      library = await client().open({ ...item });
    expect(first).toEqual(library);
    expect(first.revision.content).toBe(item.content);
  });
  it('B3 validates the save receipt and rejects stale versions without changing the draft', async () => {
    const c = client();
    await c.open(item);
    const value = await c.mutate(item.id, draft());
    expect(value.revision.version).toBe(2);
    c.writeDraft(item.id, draft('stale edit'));
    await expect(c.mutate(item.id, draft('stale edit'))).rejects.toThrow(ARTIFACT_CONFLICT);
    expect(c.readDraft(item.id).content).toBe('stale edit');
    expect(revisions).toHaveLength(2);
  });
  it('B3 a reply lost after commit survives a client/App restart and retries the identical request id', async () => {
    const original = request.getMockImplementation();
    request.mockImplementationOnce(async (body, options) => {
      await original(body, options);
      throw new Error('synthetic reply lost');
    });
    await expect(client().mutate(item.id, draft())).rejects.toThrow('synthetic reply lost');
    const pending = client().readDraft(item.id);
    expect(pending.pending.requestId).toBeTruthy();
    const value = await client().mutate(item.id, pending);
    expect(value.revision.version).toBe(2);
    expect(revisions).toHaveLength(2);
    expect(request.mock.calls[0][0].requestId).toBe(request.mock.calls[1][0].requestId);
    expect(client().readDraft(item.id)).toMatchObject({ version: 2, content: 'My revised copy', pending: null });
  });
  it('B4 a restore also uses durable idempotency and yields a new revision', async () => {
    const c = client();
    await c.mutate(item.id, draft());
    const saved = c.readDraft(item.id);
    const restored = await c.mutate(item.id, saved, 1);
    expect(restored.revision).toMatchObject({ version: 3, restoredFrom: 1, content: item.content });
    expect((await c.get(item.id, 2)).revision.content).toBe('My revised copy');
    expect((await c.versions(item.id)).map((v) => v.version)).toEqual([1, 2, 3]);
  });
  it('B5 restores unsaved content, mode and both reading positions after reconstruction', () => {
    client().writeDraft(item.id, draft());
    expect(client().readDraft(item.id)).toMatchObject(draft());
    session.epoch = 'new-login-same-owner';
    expect(client().readDraft(item.id).content).toBe('My revised copy');
  });
  it('B6 pins persist across restart and same-account relogin, and are isolated by owner and API', () => {
    expect(client().setPin(item.id, true)).toBe(true);
    expect(client().readPin(item.id)).toBe(true);
    session.epoch = 'new-login';
    expect(client().readPin(item.id)).toBe(true);
    session.owner = 'another-student';
    expect(client().readPin(item.id)).toBe(false);
    session.owner = 'artifact-student';
    expect(
      createLearningArtifacts({ request, storage, session, check, api: 'https://other.invalid' }).readPin(item.id)
    ).toBe(false);
    expect(client().setPin(item.id, false)).toBe(false);
    expect(client().readPin(item.id)).toBe(false);
  });
  it('does not send when the request-id/draft or pin has no device readback receipt', async () => {
    storage.save = vi.fn(() => false);
    await expect(client().mutate(item.id, draft())).rejects.toThrow('保存失败');
    expect(request).not.toHaveBeenCalled();
    expect(() => client().setPin(item.id, true)).toThrow('保存失败');
  });
  it('rejects malformed/mismatched mutation acknowledgements instead of showing saved', async () => {
    request.mockResolvedValueOnce({ success: true, data: { ...doc, receipt: { version: 2 } } });
    await expect(client().mutate(item.id, draft())).rejects.toThrow('回执');
    expect(client().readDraft(item.id).version).toBe(1);
    request.mockResolvedValueOnce({ success: true, data: { ...doc, artifact: { ...doc.artifact, owner: 'other' } } });
    await expect(client().open(item)).rejects.toThrow('回执');
  });
  it('an identity change rejects late data, and old clients cannot read or write into the new account', async () => {
    const c = client(),
      original = request.getMockImplementation();
    request.mockImplementationOnce(async (...args) => {
      const result = await original(...args);
      session.owner = 'other';
      return result;
    });
    await expect(c.mutate(item.id, draft())).rejects.toThrow('登录会话已变化');
    expect(() => c.setPin(item.id, true)).toThrow('登录会话已变化');
    expect(client().readDraft(item.id)).toBeNull();
  });
  it('a late save never overwrites a newer scratch buffer made after closing/reopening', async () => {
    const c = client(),
      original = request.getMockImplementation();
    request.mockImplementationOnce(async (...args) => {
      const result = await original(...args);
      const old = c.readDraft(item.id);
      c.writeDraft(item.id, { ...old, content: 'Newer unsaved text' });
      return result;
    });
    await c.mutate(item.id, draft());
    expect(c.readDraft(item.id).content).toBe('Newer unsaved text');
  });
  it.each([
    ['foreign id', { action: 'save', id: 'another-document', expectedVersion: 1, title: 'x', content: 'x' }],
    ['wrong base', { action: 'save', expectedVersion: 2, title: 'x', content: 'x' }],
    ['extra field', { action: 'save', expectedVersion: 1, title: 'x', content: 'x', unexpected: true }],
    ['invalid action', { action: 'delete', expectedVersion: 1, sourceVersion: 1 }],
    ['invalid restore source', { action: 'restore', expectedVersion: 1, sourceVersion: 0 }]
  ])('S44 rejects a damaged pending retry without sending or changing local text: %s', async (_name, patch) => {
    const c = client();
    const frozen = { id: item.id, ...patch };
    c.writeDraft(item.id, {
      ...draft('Preserve my independent later edit.'),
      pending: { signature: JSON.stringify(frozen), requestId: 'original-pending-request' }
    });
    const before = structuredClone(c.readDraft(item.id));
    await expect(c.mutate(item.id, before, null, { retryPending: true })).rejects.toThrow('请求不可用');
    expect(request).not.toHaveBeenCalled();
    expect(c.readDraft(item.id)).toEqual(before);
  });
  it('S44 old restore pending without a frozen input conservatively retains the local text', async () => {
    const c = client();
    await c.mutate(item.id, draft('Saved second version.'));
    const base = c.readDraft(item.id);
    const body = { action: 'restore', id: item.id, expectedVersion: 2, sourceVersion: 1 };
    await request({ ...body, requestId: 'legacy-lost-restore' });
    c.writeDraft(item.id, {
      ...base,
      content: 'Legacy scratch with unknown edit timing.',
      pending: { signature: JSON.stringify(body), requestId: 'legacy-lost-restore' }
    });
    const value = await c.mutate(item.id, c.readDraft(item.id), 1, { retryPending: true });
    expect(value.revision).toMatchObject({ version: 3, restoredFrom: 1, content: item.content });
    expect(revisions).toHaveLength(3);
    expect(c.readDraft(item.id)).toMatchObject({
      version: 3,
      content: 'Legacy scratch with unknown edit timing.',
      pending: null
    });
  });
  it('S44 a retry validates the frozen content receipt rather than the newer scratch text', async () => {
    const c = client();
    const send = request.getMockImplementation();
    request.mockImplementationOnce(async (...args) => {
      await send(...args);
      throw new Error('Synthetic lost acknowledgement');
    });
    await expect(c.mutate(item.id, draft('Frozen saved copy.'))).rejects.toThrow('lost acknowledgement');
    c.writeDraft(item.id, { ...c.readDraft(item.id), content: 'Later local words.' });
    const before = structuredClone(c.readDraft(item.id));
    request.mockImplementationOnce(async (...args) => {
      const response = await send(...args);
      response.data.revision.content = 'Later local words.';
      return response;
    });
    await expect(c.mutate(item.id, before, null, { retryPending: true })).rejects.toThrow('回执');
    expect(c.readDraft(item.id)).toEqual(before);
    expect(revisions).toHaveLength(2);
    expect(revisions[1].content).toBe('Frozen saved copy.');
  });
  it('S45 confirmed material deletion clears linked device drafts, pending text and pins', () => {
    uni.clearStorageSync();
    localStorage.clear();
    uni.setStorageSync('EXAM_USER_ID', 'artifact-student');
    uni.setStorageSync('EXAM_TOKEN', 'S45_LOCAL_SYNTHETIC_NOT_VALID');
    try {
      const state = artifactFixtureState('artifact-student');
      state.materials.push(parsePastedMaterial('S45 private material.', 's45-material'));
      state.conversations[0].coach.materialIds = ['s45-material'];
      const c = createLearningArtifacts();
      c.writeDraft(item.id, {
        ...draft('S45 private unsaved text'),
        pending: { requestId: 's45-original-request', signature: 'S45_PRIVATE_PENDING_TEXT' }
      });
      c.setPin(item.id, true);
      expect(storageService.save(LEARNING_KEY, state, true)).toBe(true);
      const repo = createLearningRepository(storageService, () => 'artifact-student', null);
      repo.deleteMaterial(repo.previewMaterialDeletion('s45-material'), true, 's45-delete-material');
      expect(c.readDraft(item.id)).toBeNull();
      expect(c.readPin(item.id)).toBe(false);
    } finally {
      uni.clearStorageSync();
      localStorage.clear();
    }
  });

  it('S45 scoped device cleanup keeps unrelated documents, APIs and accounts exactly', () => {
    const f = s45DeviceFixture();
    const otherApi = createLearningArtifacts({ api: 'https://s45-other.synthetic.invalid' });
    otherApi.writeDraft(item.id, draft('Keep another API draft.'));
    otherApi.setPin(item.id, true);
    const foreignKey =
      'u_another-owner_conversation_learning_v1_artifacts:unrelated:draft:essay:essay-chat:coach-submission:essay-submission';
    uni.setStorageSync(foreignKey, { content: 'Keep another account.' });
    const independent = structuredClone(f.c.readDraft(f.independentId));
    const other = structuredClone(otherApi.readDraft(item.id));
    f.repo.deleteMaterial(f.repo.previewMaterialDeletion('s45-material'), true, f.deletion.id);
    expect(f.c.readDraft(item.id)).toBeNull();
    expect(f.c.readPin(item.id)).toBe(false);
    expect(f.c.readDraft(f.independentId)).toEqual(independent);
    expect(f.c.readPin(f.independentId)).toBe(true);
    expect(otherApi.readDraft(item.id)).toEqual(other);
    expect(otherApi.readPin(item.id)).toBe(true);
    expect(uni.getStorageSync(foreignKey)).toEqual({ content: 'Keep another account.' });
  });
  it('S45 failed device cleanup keeps the privacy journal and completes on the next checked read', () => {
    const f = s45DeviceFixture();
    const remove = storageService.remove.bind(storageService);
    let blocked = true;
    vi.spyOn(storageService, 'remove').mockImplementation((key, ...args) =>
      blocked && key.includes('_artifacts:') && key.includes(':pin:') ? false : remove(key, ...args)
    );
    expect(() => f.repo.deleteMaterial(f.repo.previewMaterialDeletion('s45-material'), true, f.deletion.id)).toThrow(
      '清理失败'
    );
    expect(() => f.repo.read()).toThrow('清理失败');
    const pending = storageService.get(LEARNING_KEY + '_privacy_pending', null);
    expect(pending.operation.id).toBe(f.deletion.id);
    expect(JSON.stringify(pending)).not.toContain('S45 private');
    blocked = false;
    const state = f.repo.read();
    expect(state.materials).toHaveLength(0);
    expect(storageService.get(LEARNING_KEY + '_privacy_pending', null)).toBeNull();
    expect(f.c.readDraft(item.id)).toBeNull();
    expect(f.c.readPin(item.id)).toBe(false);
    expect(f.c.readDraft(f.independentId).content).toBe('Keep independent local words.');
  });
  it('S45 an unavailable device key catalog cannot falsely confirm material deletion', () => {
    const f = s45DeviceFixture();
    const info = vi.spyOn(storageService, 'getStorageInfo').mockReturnValue({ keys: [], limitSize: 0 });
    expect(() => f.repo.deleteMaterial(f.repo.previewMaterialDeletion('s45-material'), true, f.deletion.id)).toThrow(
      '清理失败'
    );
    expect(storageService.get(LEARNING_KEY + '_privacy_pending', null)).not.toBeNull();
    expect(f.c.readDraft(item.id).content).toBe('S45 private pending words.');
    info.mockRestore();
    expect(f.repo.read().materials).toHaveLength(0);
    expect(f.c.readDraft(item.id)).toBeNull();
  });
  it('S45 reading an already-redacted legacy state clears only its residual device copies without new facts', () => {
    const f = s45DeviceFixture();
    const deleted = applyLearningOperation(f.state, f.deletion).state;
    storageService.save(LEARNING_KEY, deleted, true);
    expect(f.repo.read()).toEqual(deleted);
    expect(f.c.readDraft(item.id)).toBeNull();
    expect(f.c.readPin(item.id)).toBe(false);
    expect(f.c.readDraft(f.independentId).content).toBe('Keep independent local words.');
    expect(storageService.get(LEARNING_KEY, null)).toEqual(deleted);
  });
  it('S45 adopting cloud privacy tombstones clears device copies before returning the adopted state', () => {
    const f = s45DeviceFixture();
    const deleted = applyLearningOperation(f.state, f.deletion).state;
    expect(f.repo.replaceSynchronized(deleted)).toEqual(deleted);
    expect(f.c.readDraft(item.id)).toBeNull();
    expect(f.c.readPin(item.id)).toBe(false);
    expect(f.c.readDraft(f.independentId).content).toBe('Keep independent local words.');
  });
  it('S45 foreign deletion receipts and ordinary source absence cannot clear owned drafts', () => {
    const f = s45DeviceFixture();
    const before = structuredClone(f.c.readDraft(item.id));
    const deleted = applyLearningOperation(f.state, f.deletion).state;
    expect(() => f.c.clearMaterialDeletedState({ ...deleted, owner: 'other-owner' })).toThrow('其他账户');
    const ordinary = structuredClone(f.state);
    ordinary.conversations = [];
    ordinary.materials = [];
    expect(f.c.clearMaterialDeletedState(ordinary)).toBe(0);
    expect(f.c.readDraft(item.id)).toEqual(before);
  });

  it('S45 an empty-device restore keeps the redacted conversation receipt and removes its old device draft', () => {
    const f = s45DeviceFixture();
    let state = emptyLearningState('artifact-student', 'Asia/Shanghai');
    const at = Date.now() - 1000;
    const put = (id, type, data) => {
      state = applyLearningOperation(state, { id, type, at, data }).state;
    };
    put('s45-mat-add', 'material.add', { material: parsePastedMaterial('S45 raw source never restored.', 's45-mat') });
    put('s45-redacted-chat', 'conversation.start', { goal: 'S45 raw source never restored.' });
    put('s45-q-add', 'question.add', {
      question: {
        id: 's45-q',
        version: 1,
        prompt: 'S45 raw source never restored.',
        source: { materialId: 's45-mat' },
        scope: 'private',
        answerType: 'subjective'
      }
    });
    put('s45-focus', 'question.focus', { conversationId: 's45-redacted-chat', questionKey: 's45-q@1' });
    put('s45-redact', 'material.delete', { materialId: 's45-mat', questionKeys: ['s45-q@1'] });
    const restored = prepareLearningRestore(
      emptyLearningState('artifact-student', 'Asia/Shanghai'),
      JSON.stringify(state)
    ).state;
    expect(JSON.stringify(restored)).not.toContain('S45 raw source never restored.');
    expect([...materialDeletedConversationIds(restored)]).toEqual(['s45-redacted-chat']);
    const id = 'essay:s45-redacted-chat:writing-attempt:legacy-answer';
    f.c.writeDraft(id, draft('S45 stale device content.'));
    f.c.setPin(id, true);
    expect(f.c.clearMaterialDeletedState(restored)).toBe(2);
    expect(f.c.readDraft(id)).toBeNull();
    expect(f.c.readPin(id)).toBe(false);
    expect(f.c.readDraft(f.independentId).content).toBe('Keep independent local words.');
  });
  it('S45 a readonly window cannot purge residual drafts but can read once the writer cleaned them', () => {
    const f = s45DeviceFixture();
    const deleted = applyLearningOperation(f.state, f.deletion).state;
    storageService.save(LEARNING_KEY, deleted, true);
    const lease = {
      prepare() {},
      assertWritable() {
        throw Object.assign(new Error('另一窗口仍在写入'), { code: 'OTHER_WINDOW_ACTIVE' });
      }
    };
    const reader = createLearningRepository(storageService, () => 'artifact-student', lease);
    expect(() => reader.read()).toThrow('另一窗口');
    expect(f.c.readDraft(item.id).content).toBe('S45 private pending words.');
    expect(f.c.readPin(item.id)).toBe(true);
    expect(f.repo.read()).toEqual(deleted);
    expect(reader.read()).toEqual(deleted);
    expect(f.c.readDraft(item.id)).toBeNull();
    expect(f.c.readDraft(f.independentId).content).toBe('Keep independent local words.');
  });
});
