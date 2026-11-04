import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { artifactFixtureState, artifactMemoryDatabase } from '../fixtures/learning-artifacts.js';
import { studentEssaySources } from '@/services/learning/learning-artifacts.js';
import { parsePastedMaterial } from '@/services/learning/material-intake.js';
import { syncLearningOperations } from '../../laf-backend/functions/_shared/learning-sync';
import { applyLearningOperation } from '@/services/learning/learning-domain.js';
const gate = vi.hoisted(() => ({
  auth: { userId: 'artifact-student' } as any,
  inactive: null as any,
  allowed: true,
  db: null as any
}));
vi.mock('@lafjs/cloud', () => ({ default: { database: () => gate.db } }));
vi.mock('../../laf-backend/functions/_shared/auth-middleware.js', () => ({
  requireAuth: () => gate.auth,
  isAuthError: (v: any) => v.success === false
}));
vi.mock('../../laf-backend/functions/_shared/active-user.js', () => ({ requireActiveUser: async () => gate.inactive }));
vi.mock('../../laf-backend/functions/_shared/api-response.js', () => ({
  checkRateLimitDistributed: async () => ({ allowed: gate.allowed })
}));
import endpoint, { handleLearningArtifacts } from '../../laf-backend/functions/learning-artifacts';
let fixture: ReturnType<typeof artifactMemoryDatabase>, state: any, source: any, original: string;
const owner = 'artifact-student';
const learningRows = () =>
  [...fixture.rows].map(([key, row]) => [
    key,
    Object.fromEntries(
      Object.entries(row).filter(([name]) => !['essayArtifacts', 'essayArtifactRevision'].includes(name))
    )
  ]);
beforeEach(async () => {
  fixture = artifactMemoryDatabase();
  gate.db = fixture.db;
  gate.auth = { userId: owner };
  gate.inactive = null;
  gate.allowed = true;
  state = artifactFixtureState(owner);
  source = studentEssaySources(state)[0];
  await fixture.db.collection('learning_states').add({
    _id: 'learning_sync_' + crypto.createHash('sha256').update(owner).digest('hex'),
    user_id: owner,
    revision: 7,
    state
  });
  original = JSON.stringify(learningRows());
  fixture.writes.length = 0;
});
const run = (body: any, user = owner) => handleLearningArtifacts(fixture.db, user, body);
const open = () => run({ action: 'open', id: source.id, source: source.source });
const save = (expectedVersion = 1, requestId = 'save-request-one', content = 'My revised invitation.') =>
  run({ action: 'save', id: source.id, expectedVersion, requestId, title: source.title, content });

async function s45CopyFixture() {
  const marker = 'S45_ONLY_LINKED_PRIVATE_BODY';
  state.materials.push(parsePastedMaterial(marker, 's45-material'));
  state.conversations[0].coach.materialIds = ['s45-material'];
  state.conversations[0].coach.days[0].writingSubmissions[0].text = marker;
  const other = structuredClone(state.conversations[0]);
  other.id = 's45-independent-chat';
  other.goal = 'Independent original must remain';
  other.coach.materialIds = [];
  other.coach.days[0].writingSubmissions[0].text = 'S45 independent source.';
  state.conversations.push(other);
  source = studentEssaySources(state)[0];
  const independent = studentEssaySources(state)[1];
  for (const [key, row] of fixture.rows)
    if (key.startsWith('learning_states:')) fixture.rows.set(key, { ...row, state });
  await open();
  await save(1, 's45-private-save', marker + ' revised');
  await run({ action: 'open', id: independent.id, source: independent.source });
  const storedRow = () => [...fixture.rows.values()].find((value) => value.user_id === owner && value.state);
  const deletion = {
    id: 's45-delete-material',
    type: 'material.delete',
    at: Date.now(),
    data: { materialId: 's45-material', questionKeys: [] }
  };
  const row = storedRow();
  const untouched = structuredClone(
    Object.values(row.essayArtifacts).find((value: any) => value.artifact.id === independent.id)
  );
  return { marker, independent, storedRow, deletion, untouched };
}
function s45LegacyDeletion(deletion: any) {
  const [key, row] = [...fixture.rows].find(([key]) => key.startsWith('learning_states:'))!;
  const deleted = applyLearningOperation(row.state, deletion).state;
  fixture.rows.set(key, { ...row, state: deleted, revision: row.revision + 1 });
  return structuredClone(fixture.rows.get(key));
}

describe('S4 essay copy CAS and immutable originals', () => {
  it('B2 starts v1 from the authoritative original, and repeated opens return the same copy', async () => {
    const first = await open(),
      second = await open();
    expect(first.revision).toMatchObject({ version: 1, content: source.content });
    expect(second).toEqual(first);
    expect(fixture.writes).toHaveLength(1);
    expect(JSON.stringify(learningRows())).toBe(original);
    expect(fixture.rows.size).toBe(1);
  });
  it('B3 rejects an old base version and keeps the original, receipt and statistics byte-for-byte', async () => {
    await open();
    expect((await save()).receipt).toMatchObject({ version: 2, expectedVersion: 1 });
    await expect(save(1, 'stale-request-two')).rejects.toMatchObject({ code: 'ARTIFACT_CHANGED' });
    expect((await run({ action: 'get', id: source.id })).revision.content).toBe('My revised invitation.');
    expect(JSON.stringify(learningRows())).toBe(original);
  });
  it('B3 replays a lost acknowledgement without another version, including concurrent retries', async () => {
    await open();
    const results = await Promise.all([save(), save(), save()]);
    expect(results.map((r) => r.revision.version)).toEqual([2, 2, 2]);
    await expect(save(1, 'save-request-one', 'different')).rejects.toMatchObject({ code: 'ARTIFACT_REQUEST_CHANGED' });
    expect((await run({ action: 'versions', id: source.id })).items).toHaveLength(2);
  });
  it('B4 reads an immutable old revision and restores it as a new version, with idempotent restore', async () => {
    await open();
    await save();
    const body = {
      action: 'restore',
      id: source.id,
      expectedVersion: 2,
      sourceVersion: 1,
      requestId: 'restore-request-one'
    };
    const restored = await run(body);
    expect(restored.revision).toMatchObject({ version: 3, content: source.content, restoredFrom: 1 });
    expect((await run(body)).revision).toEqual(restored.revision);
    expect((await run({ action: 'get', id: source.id, version: 2 })).revision.content).toBe('My revised invitation.');
    expect((await run({ action: 'versions', id: source.id })).items.map((r: any) => r.version)).toEqual([1, 2, 3]);
  });
  it('B3 only one of two different saves with the same base can commit', async () => {
    await open();
    const results = await Promise.allSettled([save(), save(1, 'another-request', 'Second writer')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect((await run({ action: 'versions', id: source.id })).items).toHaveLength(2);
  });
  it('isolates owners, rejects forged sources and unsupported fact writes, and fails closed before sync', async () => {
    await open();
    const before = JSON.stringify([...fixture.rows]);
    await expect(run({ action: 'get', id: source.id }, 'another-student')).rejects.toMatchObject({
      code: 'ARTIFACT_NOT_FOUND'
    });
    await expect(
      run({ action: 'open', id: source.id, source: source.source }, 'another-student')
    ).rejects.toMatchObject({ code: 'ARTIFACT_SOURCE_UNSYNCED' });
    await expect(
      run({ action: 'open', id: source.id, source: { ...source.source, sourceId: 'forged' } })
    ).rejects.toBeTruthy();
    await expect(run({ action: 'save', id: source.id, operations: [] })).rejects.toBeTruthy();
    expect(JSON.stringify([...fixture.rows])).toBe(before);
  });
  it('copies independent writing attempts and legacy completed essays without promoting partial cards', async () => {
    state.conversations[0].coach.days[0].writingSubmissions = [];
    state.questions.push({ id: 'q', version: 1, title: '作文', writingExercise: { genreId: 'email' } });
    state.attempts.push({
      id: 'attempt-one',
      conversationId: 'essay-chat',
      questionKey: 'q@1',
      answer: 'Dear teacher,',
      at: 1,
      grade: { status: 'pending' }
    });
    for (const [key, row] of fixture.rows) if (key.includes('learning_sync_')) fixture.rows.set(key, { ...row, state });
    const sources = studentEssaySources(state);
    expect(sources).toHaveLength(2);
    for (const item of sources)
      expect((await run({ action: 'open', id: item.id, source: item.source })).revision.content).toBe(item.content);
    state.conversations[0].coach.days[0].essay = null;
    expect(studentEssaySources(state)).toHaveLength(1);
  });
  it('retains auth, active-user and rate gates; existing account-wide deletion covers every copy version', async () => {
    gate.auth = { success: false, code: 401 };
    expect((await endpoint({ body: {} })).code).toBe(401);
    gate.auth = { userId: owner };
    gate.inactive = { success: false, code: 403 };
    expect((await endpoint({ body: {} })).code).toBe(403);
    gate.inactive = null;
    gate.allowed = false;
    expect((await endpoint({ body: {} })).code).toBe(429);
    gate.allowed = true;
    expect((await endpoint({ body: { action: 'open', id: source.id, source: source.source } })).success).toBe(true);
    await save();
    await fixture.db.collection('learning_states').where({ user_id: owner }).remove();
    expect(fixture.rows.size).toBe(0);
  });
  it('S45 material deletion removes every linked cloud document version in the same sync', async () => {
    const marker = 'S45_PRIVATE_ESSAY_SOURCE_MUST_BE_REMOVED';
    state.materials.push(parsePastedMaterial(marker, 's45-material'));
    state.conversations[0].coach.materialIds = ['s45-material'];
    state.conversations[0].coach.days[0].writingSubmissions[0].text = marker;
    source = studentEssaySources(state)[0];
    for (const [key, row] of fixture.rows)
      if (key.startsWith('learning_states:')) fixture.rows.set(key, { ...row, state });
    await open();
    await save(1, 's45-private-version-two', marker + ' revised copy');
    await syncLearningOperations(
      fixture.db,
      owner,
      [
        {
          id: 's45-delete-material',
          type: 'material.delete',
          at: Date.now(),
          data: { materialId: 's45-material', questionKeys: [] }
        }
      ],
      state.timezone
    );
    const row = [...fixture.rows.values()].find((value) => value.user_id === owner && value.state);
    expect(JSON.stringify(row.state)).not.toContain(marker);
    expect(JSON.stringify(row.essayArtifacts)).not.toContain(marker);
    await expect(run({ action: 'get', id: source.id })).rejects.toMatchObject({ code: 'ARTIFACT_NOT_FOUND' });
  });

  it.each(['open', 'get', 'versions', 'save', 'restore'])(
    'S45 old revoked copies are purged and refused before %s, while unrelated history stays exact',
    async (action) => {
      const f = await s45CopyFixture();
      const before = s45LegacyDeletion(f.deletion);
      const body: any = { action, id: source.id };
      if (action === 'open') body.source = source.source;
      if (action === 'save')
        Object.assign(body, {
          expectedVersion: 1,
          requestId: 's45-private-save',
          title: source.title,
          content: f.marker + ' revised'
        });
      if (action === 'restore')
        Object.assign(body, { expectedVersion: 2, requestId: 's45-late-restore', sourceVersion: 1 });
      await expect(run(body)).rejects.toMatchObject({ code: 'ARTIFACT_NOT_FOUND' });
      const after = f.storedRow();
      expect(after.state).toEqual(before.state);
      expect(after.revision).toBe(before.revision);
      expect(after.essayArtifactRevision).toBe(before.essayArtifactRevision + 1);
      expect(JSON.stringify(after.essayArtifacts)).not.toContain(f.marker);
      expect(Object.values(after.essayArtifacts)).toEqual([f.untouched]);
    }
  );
  it('S45 empty or repeated sync purges old revoked metadata without advancing learning facts', async () => {
    const f = await s45CopyFixture();
    const before = s45LegacyDeletion(f.deletion);
    const result = await syncLearningOperations(fixture.db, owner, [], state.timezone);
    expect(result.revision).toBe(before.revision);
    expect(result.state).toEqual(before.state);
    const clean = structuredClone(f.storedRow());
    expect(Object.values(clean.essayArtifacts)).toEqual([f.untouched]);
    expect(clean.essayArtifactRevision).toBe(before.essayArtifactRevision + 1);
    await syncLearningOperations(fixture.db, owner, [], state.timezone);
    expect(f.storedRow()).toEqual(clean);
  });
  it('S45 deletion CAS retries across a concurrent independent document save without losing it', async () => {
    const f = await s45CopyFixture();
    const collection = fixture.db.collection;
    let raced = false,
      attempts = 0;
    fixture.db.collection = (name) => {
      const c = collection(name);
      return {
        ...c,
        where(query) {
          const w = c.where(query);
          return {
            ...w,
            async update(patch) {
              if (name === 'learning_states' && patch.state?.materialDeletions?.length) {
                attempts++;
                expect(query).toHaveProperty('essayArtifactRevision');
                if (!raced) {
                  raced = true;
                  await run({
                    action: 'save',
                    id: f.independent.id,
                    expectedVersion: 1,
                    requestId: 's45-independent-race',
                    title: f.independent.title,
                    content: 'Concurrent independent edit.'
                  });
                }
              }
              return w.update(patch);
            }
          };
        }
      };
    };
    await syncLearningOperations(fixture.db, owner, [f.deletion], state.timezone);
    expect(raced).toBe(true);
    expect(attempts).toBe(2);
    const row = f.storedRow();
    expect(JSON.stringify(row)).not.toContain(f.marker);
    const survivor: any = Object.values(row.essayArtifacts)[0];
    expect(survivor.versions[0]).toEqual((f.untouched as any).versions[0]);
    expect(survivor.versions[1].content).toBe('Concurrent independent edit.');
  });
  it('S45 a document write begun before deletion cannot resurrect its source after the tombstone commits', async () => {
    const f = await s45CopyFixture();
    const collection = fixture.db.collection;
    let raced = false;
    fixture.db.collection = (name) => {
      const c = collection(name);
      return {
        ...c,
        where(query) {
          const w = c.where(query);
          return {
            ...w,
            async update(patch) {
              const pending: any = Object.values(patch.essayArtifacts || {}).find(
                (value: any) => value.artifact.id === source.id
              );
              if (!raced && name === 'learning_states' && !patch.state && pending?.artifact.version === 3) {
                raced = true;
                expect(query).toHaveProperty('revision');
                await syncLearningOperations(fixture.db, owner, [f.deletion], state.timezone);
              }
              return w.update(patch);
            }
          };
        }
      };
    };
    await expect(save(2, 's45-late-private-save', f.marker + ' late')).rejects.toMatchObject({
      code: 'ARTIFACT_NOT_FOUND'
    });
    expect(raced).toBe(true);
    expect(Object.values(f.storedRow().essayArtifacts)).toEqual([f.untouched]);
    expect(JSON.stringify(f.storedRow())).not.toContain(f.marker);
  });
  it('S45 ordinary stopped or missing sources without a privacy receipt keep immutable copies', async () => {
    const f = await s45CopyFixture();
    const [key, row] = [...fixture.rows].find(([key]) => key.startsWith('learning_states:'))!;
    const changed = structuredClone(row.state);
    changed.conversations = [];
    fixture.rows.set(key, { ...row, state: changed });
    expect((await run({ action: 'get', id: source.id })).revision.content).toBe(f.marker + ' revised');
    expect((await run({ action: 'get', id: f.independent.id })).revision.content).toBe('S45 independent source.');
    expect(Object.values(f.storedRow().essayArtifacts)).toHaveLength(2);
  });
});
