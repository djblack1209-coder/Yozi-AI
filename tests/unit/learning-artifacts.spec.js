import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLearningArtifacts,
  studentEssaySources,
  ARTIFACT_SCHEMA,
  ARTIFACT_CONFLICT
} from '@/services/learning/learning-artifacts.js';
import { artifactFixtureState, artifactMemoryStorage } from '../fixtures/learning-artifacts.js';
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
});
