import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import {
  createLearningRepository,
  learningRepository,
  ASSISTANT_MEMORY_KEY
} from '@/services/learning/learning-repository.js';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { createLearningMemoryReconciler } from '@/services/learning/learning-memory-reconciler.js';
import { parsePastedMaterial } from '@/services/learning/material-intake.js';
import { extractConversationEntries } from '../../laf-backend/functions/_shared/learning-entry-extractor.js';
import {
  assistantMemoryIndex,
  readAssistantMemoryDocument,
  reconcileAssistantMemory,
  retrieveAssistantMemory,
  searchAssistantMemorySources
} from '../../laf-backend/functions/_shared/learning-assistant-memory.js';

const NOW = Date.parse('2026-11-11T12:00:00Z');
let pinia;
beforeEach(() => {
  uni.clearStorageSync();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  pinia = createPinia();
  setActivePinia(pinia);
});
afterEach(() => {
  for (const store of pinia._s.values()) store.$dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
  uni.clearStorageSync();
});

function fixture() {
  const values = new Map();
  let owner = 'memory-learner';
  let fail = false;
  const storage = {
    get: (key, fallback) => structuredClone(values.has(`${owner}:${key}`) ? values.get(`${owner}:${key}`) : fallback),
    save: (key, value) => {
      if (fail && key === ASSISTANT_MEMORY_KEY) return false;
      values.set(`${owner}:${key}`, structuredClone(value));
      return true;
    },
    remove: (key) => {
      values.delete(`${owner}:${key}`);
      return true;
    }
  };
  const reopen = () => createLearningRepository(storage, () => owner, null);
  const repo = reopen();
  const commit = (id, type, data) => repo.commit({ id, type, data, at: Date.now() });
  commit('first-session', 'conversation.start', { goal: '准备考研英语一写作' });
  commit('preference-source', 'message.add', {
    conversationId: 'first-session',
    role: 'user',
    content: '以后讲规则前先给我一个例子，请记住这个学习偏好。'
  });
  const proposals = extractConversationEntries(repo.read(), 'first-session', 'preference-source');
  expect(proposals).toHaveLength(1);
  for (const operation of proposals) repo.commit(operation);
  const proposal = repo.read().conversations[0].messages.find((message) => message.id === proposals[0].id).proposal;
  const memoryId = `${proposals[0].id}:accept`;
  commit(memoryId, proposal.type, { ...proposal.data, explicit: true, proposalId: proposals[0].id });
  commit('deadline', 'profile.set', {
    conversationId: 'first-session',
    field: 'deadline',
    value: '2026-12-20',
    source: 'self_report'
  });
  commit('plan', 'plan.set', {
    conversationId: 'first-session',
    day: '2026-11-11',
    tasks: [{ title: '练习邀请信的开头', condition: 'manual' }]
  });
  return {
    repo,
    reopen,
    commit,
    storage,
    values,
    memoryId,
    switchOwner: (value) => {
      owner = value;
    },
    failWrites: () => {
      fail = true;
    }
  };
}

describe('source-grounded layered assistant memory', () => {
  it('saves accepted memory, reopens it, follows index links, and retrieves it in a later related session', () => {
    const { repo, reopen, commit, memoryId, storage } = fixture();
    const raw = repo.exportData();
    const saved = repo.reconcileAssistantMemory();
    expect(storage.get(ASSISTANT_MEMORY_KEY)).toEqual(saved);
    expect(repo.exportData()).toBe(raw);
    const later = reopen();
    const index = assistantMemoryIndex(later.readAssistantMemory(), 'first-session');
    expect(index).toContain('(goals/first-session.md)');
    expect(index).not.toContain('先给我一个例子');
    const document = later.readMemoryDocument('goals/first-session.md');
    const preferencePath = `notes/${encodeURIComponent(memoryId)}.md`;
    expect(document.links).toContain(preferencePath);
    expect(later.readMemoryDocument(preferencePath)).toMatchObject({
      trust: 'verified',
      basis: 'self_report',
      sourceRefs: expect.arrayContaining(['preference-source', memoryId])
    });
    expect(later.readMemoryDocument(preferencePath).content).toContain('例子');
    commit('later-session', 'conversation.start', { goal: '准备考研英语一写作' });
    const context = later.assistantMemoryContext({
      conversationId: 'later-session',
      query: '请按我的学习偏好继续练习'
    });
    expect(context.index).toContain('synthesis/first-session.md');
    expect(context.reads.some((read) => read.path === preferencePath && read.content.includes('例子'))).toBe(true);
    expect(context.reads.some((read) => read.path === 'synthesis/first-session.md')).toBe(true);
  });

  it('repairs wrong notes, missing documents and dangling links from original records without changing facts', () => {
    const { repo, storage, memoryId } = fixture();
    const memory = repo.reconcileAssistantMemory();
    memory.notes.find((note) => note.id === memoryId).claim = '错误地声称学生已经完全掌握';
    memory.notes.push({ id: 'fabricated', claim: '从未发生的事实', sourceRefs: ['missing-event'] });
    memory.documents = memory.documents.filter((doc) => doc.path !== 'goals/first-session.md');
    memory.documents[0].links.push('notes/not-created.md');
    storage.save(ASSISTANT_MEMORY_KEY, memory);
    const raw = repo.exportData();
    const repaired = repo.reconcileAssistantMemory({ at: NOW + 86400000 });
    expect(repaired.reconciliation).toMatchObject({ corrected: 1, removed: 1, repairedLinks: 1, restoredDocuments: 1 });
    expect(repaired.notes.find((note) => note.id === memoryId).claim).toContain('例子');
    expect(JSON.stringify(repaired)).not.toContain('从未发生');
    expect(repo.exportData()).toBe(raw);
    for (const document of repaired.documents)
      for (const path of document.links) expect(readAssistantMemoryDocument(repaired, path)).not.toBeNull();
  });

  it('keeps explicit current preferences ahead of conflicting related history and leaves unrelated subjects out', () => {
    const { repo, commit, memoryId } = fixture();
    commit('current', 'conversation.start', { goal: '准备考研英语一写作' });
    commit('current-pref', 'profile.set', {
      conversationId: 'current',
      field: 'preference',
      value: '先讲规则，再给例子',
      source: 'self_report'
    });
    commit('unrelated', 'conversation.start', { goal: '准备数学考试' });
    commit('unrelated-pref', 'profile.set', {
      conversationId: 'unrelated',
      field: 'preference',
      value: '先做几何图',
      source: 'self_report'
    });
    const result = repo.assistantMemoryContext({ conversationId: 'current' });
    const paths = result.reads.map((read) => read.path);
    expect(paths.indexOf('notes/current-pref.md')).toBeLessThan(
      paths.indexOf(`notes/${encodeURIComponent(memoryId)}.md`)
    );
    expect(result.reads.find((read) => read.path.startsWith('synthesis/')).content).toContain('不同偏好');
    expect(JSON.stringify(result)).not.toContain('先做几何图');
  });

  it('rebuilds after source supersession and retraction and reevaluates dates on a later study day', () => {
    const { repo, commit, memoryId } = fixture();
    repo.reconcileAssistantMemory();
    commit('changed-pref', 'profile.set', {
      conversationId: 'first-session',
      field: 'preference',
      value: '先让我自己尝试',
      source: 'self_report'
    });
    expect(repo.readAssistantMemory().notes.some((note) => note.id === memoryId)).toBe(false);
    commit('retract-pref', 'profile.retract', {
      conversationId: 'first-session',
      entryId: 'changed-pref',
      explicit: true
    });
    expect(repo.readAssistantMemory().notes.some((note) => note.id === 'changed-pref')).toBe(false);
    const later = repo.readAssistantMemory({ at: Date.parse('2026-12-21T12:00:00Z') });
    expect(assistantMemoryIndex(later, 'first-session')).toContain('目标日期已过');
  });

  it('keeps material lookup in raw search and never ingests a whole source document into the knowledge layer', () => {
    const { repo, commit } = fixture();
    commit('reading-import', 'material.add', {
      material: parsePastedMaterial('唯一定位短语。' + '原文段落。'.repeat(1000), 'reading')
    });
    expect(
      repo
        .assistantMemoryContext({ conversationId: 'first-session', query: '唯一定位短语' })
        .reads.some((read) => read.path.startsWith('materials/'))
    ).toBe(false);
    commit('reading-question', 'question.add', {
      question: {
        id: 'source-q',
        version: 1,
        prompt: '查找原文',
        scope: 'private',
        source: { materialId: 'reading' },
        answerType: 'subjective'
      }
    });
    commit('reading-focus', 'question.focus', { conversationId: 'first-session', questionKey: 'source-q@1' });
    const state = repo.read();
    const memory = reconcileAssistantMemory(state);
    expect(JSON.stringify(memory)).not.toContain('唯一定位短语');
    expect(searchAssistantMemorySources(state, '唯一定位短语')[0]).toMatchObject({
      path: 'materials/reading/reading_1',
      basis: 'source_material'
    });
    expect(memory.growth.rawBytes).toBeGreaterThan(memory.growth.knowledgeBytes + memory.growth.noteBytes);
    const context = retrieveAssistantMemory(memory, state, {
      conversationId: 'first-session',
      query: '唯一定位短语',
      availableChars: 9000
    });
    expect(context.reads.some((read) => read.path === 'materials/reading/reading_1')).toBe(true);
    const narrow = retrieveAssistantMemory(memory, state, { conversationId: 'first-session', availableChars: 600 });
    expect(narrow?.index).toContain('学习记忆索引');
    expect(JSON.stringify(narrow).length).toBeLessThanOrEqual(600);
    expect(memory.notes.length).toBeGreaterThan(narrow.reads.length);
    repo.reconcileAssistantMemory();
    repo.deleteMaterial(repo.previewMaterialDeletion('reading'), true, 'delete-reading');
    expect(JSON.stringify(repo.readAssistantMemory())).not.toContain('唯一定位短语');
  });

  it('removes derived text on replacement/deletion and never reads another learner document', () => {
    const { repo, storage, switchOwner } = fixture();
    const prior = repo.reconcileAssistantMemory();
    switchOwner('other-learner');
    expect(repo.readAssistantMemory().owner).toBe('other-learner');
    expect(JSON.stringify(repo.readAssistantMemory())).not.toContain('例子');
    storage.save(ASSISTANT_MEMORY_KEY, prior);
    expect(repo.readAssistantMemory().notes).toEqual([]);
    switchOwner('memory-learner');
    repo.replaceSynchronized(repo.read());
    expect(storage.get(ASSISTANT_MEMORY_KEY, null)).toBeNull();
    repo.reconcileAssistantMemory();
    repo.deleteData();
    expect(storage.get(ASSISTANT_MEMORY_KEY, null)).toBeNull();
    expect(repo.readAssistantMemory().notes).toEqual([]);
  });

  it('does not report persistence success or lose raw records when a derived write fails', () => {
    const { repo, failWrites } = fixture();
    const raw = repo.exportData();
    failWrites();
    expect(() => repo.reconcileAssistantMemory()).toThrow('记忆文档未保存');
    expect(repo.exportData()).toBe(raw);
    expect(repo.readAssistantMemory().notes.length).toBeGreaterThan(0);
  });
});

describe('application-owned reconciliation and real store flow', () => {
  it('persists after explicit main-flow actions and reads them after a fresh store instance', async () => {
    let store = useConversationLearningStore();
    store.start('12 + 8');
    const conversationId = store.selectedConversationId;
    store.commit(
      'profile.set',
      { conversationId, field: 'preference', value: '先给我一个例子', source: 'self_report' },
      'saved-preference'
    );
    await nextTick();
    await vi.advanceTimersByTimeAsync(1);
    expect(store.memoryStatus.phase).toBe('ready');
    expect(store.memoryStatus.sourceRevision).toBe(store.state.revision);
    const savedRevision = store.state.revision;
    for (const current of pinia._s.values()) current.$dispose();
    pinia = createPinia();
    setActivePinia(pinia);
    store = useConversationLearningStore();
    expect(store.state.revision).toBe(savedRevision);
    expect(learningRepository.readMemoryDocument('notes/saved-preference.md').content).toBe('先给我一个例子');
    await nextTick();
    await vi.advanceTimersByTimeAsync(1);
    expect(store.memoryStatus.phase).toBe('ready');
    const firstAt = store.memoryStatus.reconciledAt;
    await vi.advanceTimersByTimeAsync(86400000);
    expect(store.memoryStatus.reconciledAt).toBeGreaterThan(firstAt);
    expect(store.state.revision).toBe(savedRevision);
  });

  it('distinguishes actual independent follow-up from self-report and retracts a corrected strategy conclusion', async () => {
    const store = useConversationLearningStore();
    store.start('12 + 8');
    await store.send('直接讲解', { discussionOnly: true, id: 'explanation' });
    let memory = learningRepository.readAssistantMemory();
    expect(memory.notes.find((note) => note.kind === 'strategy').trust).toBe('unconfirmed');
    store.submit('20', true, 'helped');
    store.generateVariant();
    store.submit('12', true, 'transfer');
    memory = learningRepository.reconcileAssistantMemory();
    expect(memory.notes.find((note) => note.kind === 'strategy')).toMatchObject({
      trust: 'verified',
      basis: 'observed_followup'
    });
    expect(memory.notes.find((note) => note.kind === 'strategy').claim).toContain('不能证明因果');
    store.commit(
      'assessment.review',
      { attemptId: 'transfer', outcome: 'wrong', evidenceId: 'review-evidence', reason: '独立复核更正' },
      'correction'
    );
    memory = learningRepository.reconcileAssistantMemory();
    expect(memory.notes.find((note) => note.kind === 'strategy').trust).toBe('unconfirmed');
  });

  it('cancels stale-account, paused and disposed work and retries a failed save only on the next activation', async () => {
    let identity = 'first';
    const reconcile = vi.fn(() => ({ reconciledAt: Date.now() }));
    const onError = vi.fn();
    const runtime = createLearningMemoryReconciler({ context: () => identity, ready: () => true, reconcile, onError });
    runtime.schedule();
    identity = 'second';
    await vi.advanceTimersByTimeAsync(1);
    expect(reconcile).not.toHaveBeenCalled();
    runtime.resume();
    runtime.pause();
    await vi.advanceTimersByTimeAsync(1);
    expect(reconcile).not.toHaveBeenCalled();
    reconcile.mockImplementationOnce(() => {
      throw new Error('storage unavailable');
    });
    runtime.resume();
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(86400000);
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledOnce();
    runtime.resume();
    await vi.advanceTimersByTimeAsync(1);
    expect(reconcile).toHaveBeenCalledTimes(2);
    runtime.dispose();
    await vi.advanceTimersByTimeAsync(86400000);
    expect(reconcile).toHaveBeenCalledTimes(2);
  });

  it('waits for an existing write lease and cancels an in-flight reconciliation before it can write', async () => {
    let release;
    const lease = new Promise((resolve) => {
      release = resolve;
    });
    const write = vi.fn(() => ({ reconciledAt: Date.now() }));
    const result = vi.fn();
    const error = vi.fn();
    const runtime = createLearningMemoryReconciler({
      context: () => 'learner',
      ready: () => true,
      reconcile: async (isCurrent) => {
        await lease;
        if (!isCurrent()) throw new Error('Cancelled while acquiring lease');
        return write();
      },
      onResult: result,
      onError: error
    });
    runtime.resume();
    await vi.advanceTimersByTimeAsync(1);
    expect(write).not.toHaveBeenCalled();
    runtime.pause();
    release();
    await Promise.resolve();
    await Promise.resolve();
    expect(write).not.toHaveBeenCalled();
    expect(result).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    runtime.resume();
    await vi.advanceTimersByTimeAsync(1);
    expect(write).toHaveBeenCalledOnce();
    expect(result).toHaveBeenCalledOnce();
    runtime.dispose();
  });
});
