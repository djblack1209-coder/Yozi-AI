import { seedLegacyTask } from '../fixtures/legacy-queue.js';
import { readFileSync } from 'node:fs';
import { ref } from 'vue';
import { aiGenerationMixin } from '@/pages/practice-sub/composables/ai-generation-mixin.js';
import { getUserId } from '@/services/auth-storage.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { watch } from 'vue';
import { spawnSync } from 'node:child_process';
import { storageService } from '@/services/storageService.js';
import { captureSession, checkSession } from '@/services/auth-storage.js';
import * as learning from '@/stores/modules/conversation-learning.js';
import { learningRepository } from '@/services/learning/learning-repository.js';
import { learningWriteLease } from '@/services/learning/learning-write-lease.js';
import { recordQuizLearningObservation } from '@/services/learning/quiz-learning-bridge.js';
import {
  parseConnectedMaterial,
  testMaterialConnector,
  requestUploadRecovery,
  requestUploadMaintenance,
  deleteConnectedMaterial
} from '@/services/learning/material-connector.js';
import { callLocalConnector, testLocalConnector } from '@/services/learning/local-connector.js';
import { OfflineQueue } from '@/utils/core/offline-queue.js';
import Quiz from '@/pages/practice-sub/do-quiz.vue';
const read = uni.getStorageSync.getMockImplementation();
let blocked, pinia;
const login = (n = 1) =>
  storageService.saveLoginSession({ userId: `account-${n}`, token: `fixture-${n}`, userInfo: { id: `account-${n}` } });
const defer = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
beforeEach(() => {
  vi.useFakeTimers();
  blocked = null;
  uni.getStorageSync.mockImplementation((key) => {
    if (key === blocked) throw Error('fixture read failure');
    return read(key);
  });
  uni.clearStorageSync();
  login();
  pinia = createPinia();
  setActivePinia(pinia);
});
afterEach(() => {
  blocked = null;
  for (const store of pinia._s.values()) store.$dispose();
  learningWriteLease.release();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it('order-07-01: registration preserves the initiating fence with and without locks', () => {
  const child = spawnSync(process.execPath, ['--experimental-vm-modules', 'tests/fixtures/session-races/round7.mjs'], {
    encoding: 'utf8',
    timeout: 15000
  });
  expect(child.status, child.stderr).toBe(0);
  const rows = child.stdout.trim().split('\n').map(JSON.parse);
  expect(rows).toHaveLength(4);
  for (const row of rows) expect(row.ok, row.name).toBe(true);
});
it.each([
  ['retained legacy', 'false', 'start'],
  ['default coach', 'true', 'startCoach']
])('regress-7-01: first unavailable root leaves a complete retryable store (%s)', (_mode, enabled, start) => {
  // Startup selects coach history by default; retained legacy history has its own opt-in mode.
  vi.stubEnv('VITE_ENABLE_WRITING_COACH', enabled);
  const old = learning.useConversationLearningStore();
  old[start]('已有学习目标');
  old.$dispose();
  pinia = createPinia();
  setActivePinia(pinia);
  blocked = 'u_account-1_conversation_learning_v1';
  let store;
  expect(() => {
    store = learning.useConversationLearningStore();
  }).not.toThrow();
  expect(store.recordReadState).toBe('pending');
  expect(typeof store.refresh).toBe('function');
  expect(typeof store.start).toBe('function');
  expect(() => store.start('暂不可用不写')).toThrow();
  blocked = null;
  const same = learning.useConversationLearningStore();
  expect(same).toBe(store);
  const result = same.searchRecords('已有学习目标');
  expect(result.items.length).toBeGreaterThan(0);
  expect(same.recordReadState).toBe('ready');
  expect(same.active.goal).toBe('已有学习目标');
  same.start('恢复后正常');
  expect(same.state.conversations).toHaveLength(2);
});
it('regress-7-02: pure search navigation uses trusted projection without writes', () => {
  const store = learning.useConversationLearningStore();
  store.start('纯对话阅读');
  const result = store.searchRecords('纯对话阅读'),
    hit = result.items.find((x) => !x.questionKey);
  expect(hit).toBeTruthy();
  const before = JSON.stringify(store.state);
  blocked = '_enc_EXAM_SESSION_EPOCH';
  expect(() => store.openRecord(hit.id, result.context)).not.toThrow();
  expect(JSON.stringify(store.state)).toBe(before);
  blocked = null;
  store.openRecord(hit.id, result.context);
  expect(JSON.stringify(store.state)).toBe(before);
});
it('MIGRATE-16-01: reset fences synchronous locator reentry before rebinding', () => {
  const store = learning.useConversationLearningStore();
  store.start('旧账户');
  store.importText('旧账户私有内容');
  store.locateConversation(store.active.id);
  const material = JSON.parse(JSON.stringify(store.state.materials[0]));
  let reentered = false,
    refused = false;
  const stop = watch(
    () => store.conversationLocation,
    (value) => {
      if (value !== null || reentered) return;
      reentered = true;
      try {
        store.reloadRecords();
        store.commit('material.add', { material });
      } catch {
        refused = true;
      }
    },
    { flush: 'sync' }
  );
  login(2);
  store.reloadRecords();
  stop();
  expect(reentered).toBe(true);
  expect(refused).toBe(true);
  expect(learningRepository.read().owner).toBe('account-2');
  expect(learningRepository.read().materials).toHaveLength(0);
  store.start('新账户正常');
  expect(store.state.conversations).toHaveLength(1);
});
it('regress-7-02: every exported action has an explicit effect classification', () => {
  const store = learning.useConversationLearningStore(),
    table = learning.CONVERSATION_ACTION_EFFECTS;
  const actions = Object.keys(store).filter(
    (k) => typeof store[k] === 'function' && !k.startsWith('$') && !k.startsWith('_')
  );
  expect(table).toBeDefined();
  expect(Object.keys(table).sort()).toEqual(actions.sort());
  for (const name of actions) expect(['read', 'write', 'send']).toContain(table[name]);
  expect(table.openRecord).toBe('read');
  expect(table.locateConversation).toBe('read');
  expect(table.cancelModelIntake).toBe('read');
  expect(table.setLibraryUse).toBe('write');
  expect(table.setPersonalCorpusAllowed).toBe('write');
});
const connection = () => ({
  endpoint: 'http://127.0.0.1:8765/parse',
  allowedOrigins: ['http://127.0.0.1:8765'],
  token: 'fixture-only-connector-token-32-characters',
  consent: true
});
const material = (page) => ({
  scope: 'private',
  segments: [{ page, content: '本页' }],
  totalPages: 2,
  nextPage: page === 1 ? 2 : null,
  original: { connectorFileId: 'a'.repeat(64) }
});
it.each([false, true])('inflight-16-02: paginated parser retains entry session changed=%s', async (changed) => {
  const session = captureSession(),
    gate = defer();
  const fetch = vi.fn(
    async () => new Response(JSON.stringify({ success: true, data: material(fetch.mock.calls.length) }))
  );
  vi.stubGlobal('fetch', fetch);
  const pending = parseConnectedMaterial(
    connection(),
    { name: 'fixture.pdf', size: 4, contentBase64: 'test' },
    {
      platform: 'h5',
      session,
      onBatch: async () => {
        if (fetch.mock.calls.length === 1) await gate.promise;
      }
    }
  ).catch((e) => e);
  for (let i = 0; i < 20 && !fetch.mock.calls.length; i++) await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
  if (changed) login(2);
  gate.resolve();
  const result = await pending;
  expect(fetch).toHaveBeenCalledTimes(changed ? 1 : 2);
  if (changed) expect(result.code).toBe('CONTEXT_CHANGED');
  else expect(result.results).toHaveLength(2);
});
it('inflight-16-02: local model wrapper refuses a revoked explicit session', async () => {
  const session = captureSession();
  login(2);
  const fetch = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { message: 'reply' } })));
  vi.stubGlobal('fetch', fetch);
  const result = await callLocalConnector(
    { ...connection(), endpoint: 'http://127.0.0.1:8765/chat', model: 'fixture' },
    { messages: [] },
    { platform: 'h5', session }
  ).catch((e) => e);
  expect(result.code).toBe('CONTEXT_CHANGED');
  expect(fetch).not.toHaveBeenCalled();
});
it.each(['flipFlashcard', 'rateFlashcardAndNext'])(
  'inflight-16-01: %s releases local processing after unavailable wait',
  async (method) => {
    const gate = defer();
    vi.spyOn(learningWriteLease, 'waitUntilWritable').mockReturnValue(gate.promise);
    const question = { id: 'round7-flashcard', question: '原题', answer: '原参考', type: 'flashcard' };
    const page = {
      ...Quiz.data(),
      boundLoginSession: captureSession(),
      quizOwnerId: 'account-1',
      sessionId: 'quiz_session_round7_test',
      currentQuestion: question,
      currentIndex: 0,
      questions: [question],
      flashcardFlipped: true,
      referenceSaved: method !== 'flipFlashcard',
      referenceObservationId: 'quiz_answer_round7_reference',
      saveCurrentProgress: vi.fn(),
      toNext: vi.fn()
    };
    // The real timer has no active token and returns a valid zero measurement.
    const pending = Quiz.methods[method].call(page, 3);
    expect(page.recordingObservation).toBe(true);
    blocked = '_enc_EXAM_SESSION_EPOCH';
    gate.resolve();
    await pending;
    blocked = null;
    expect(checkSession(page.boundLoginSession)).toBe('current');
    expect(page.recordingObservation).toBe(false);
  }
);
it('MIGRATE-16-02: sent queue survives unread acknowledgement and remount without resending', async () => {
  const queue = new OfflineQueue(),
    send = vi.fn(async () => {
      blocked = 'EXAM_OFFLINE_QUEUE';
      return { code: 0, success: true };
    });
  seedLegacyTask(queue, { requestFn: send, requestData: { answer: 'once' } });
  const first = queue.processQueue();
  await vi.runAllTimersAsync();
  await first;
  expect(queue.queue).toHaveLength(1);
  expect(read('EXAM_OFFLINE_QUEUE')).toHaveLength(1);
  blocked = null;
  const remount = new OfflineQueue();
  remount.registerRebuilder(send);
  const replay = remount.processQueue();
  await vi.runAllTimersAsync();
  await replay;
  expect(send).toHaveBeenCalledTimes(1);
  expect(remount.queue).toHaveLength(0);
  expect(read('EXAM_OFFLINE_QUEUE')).toHaveLength(0);
});
it.each([
  '_enc_EXAM_SESSION_EPOCH',
  'u_account-1_conversation_learning_v1_upload_pending',
  'u_account-1_conversation_learning_v1_sync_conflict'
])('regress-7-01: first %s failure retries all projections without losing actions', (key) => {
  blocked = key;
  let store;
  expect(() => {
    store = learning.useConversationLearningStore();
  }).not.toThrow();
  expect(store.recordReadState).toBe('pending');
  blocked = null;
  store.refresh();
  expect(store.recordReadState).toBe('ready');
  store.start('恢复正常');
  expect(store.state.conversations).toHaveLength(1);
});
it('inflight-16-01: history setup read failure ends its processing flag', async () => {
  const store = learning.useConversationLearningStore();
  store.start('历史');
  const stop = watch(
    () => store.historyBusy,
    (value) => {
      if (value) blocked = '_enc_EXAM_SESSION_EPOCH';
    },
    { flush: 'sync' }
  );
  await Promise.resolve(store.previewRestore(JSON.stringify({ format: 'learning-history-v1' }))).catch(() => {});
  stop();
  blocked = null;
  expect(store.historyBusy).toBe(false);
});
it('inflight-16-01: model payload setup failure never strands busy', async () => {
  const store = learning.useConversationLearningStore();
  store.start('学习目标');
  store.selectedMode = 'cloud';
  store.sharingAllowed = true;
  store.modelId = 'fixture';
  vi.spyOn(learningRepository, 'lifecycleRevision').mockImplementation(() => {
    throw Object.assign(Error('fixture'), { code: 'SESSION_UNAVAILABLE' });
  });
  await store.send('继续学习').catch(() => {});
  expect(store.busy).toBe(false);
});
it.each(['flipFlashcard', 'rateFlashcardAndNext'])(
  'inflight-16-01: normal %s saves and releases processing',
  async (method) => {
    const question = { id: 'round7-normal', question: '完整原题', answer: '完整参考', type: 'flashcard' };
    const page = {
      ...Quiz.data(),
      boundLoginSession: captureSession(),
      quizOwnerId: 'account-1',
      sessionId: 'quiz_session_round7_normal',
      currentQuestion: question,
      currentIndex: 0,
      questions: [question],
      flashcardFlipped: true,
      referenceSaved: method !== 'flipFlashcard',
      referenceObservationId: 'quiz_answer_round7_reference_normal',
      saveCurrentProgress: vi.fn(),
      toNext: vi.fn()
    };
    if (method === 'rateFlashcardAndNext')
      await recordQuizLearningObservation({
        currentQuestion: question,
        sessionId: page.sessionId,
        observationId: page.referenceObservationId,
        kind: 'reference_view',
        session: page.boundLoginSession
      });
    await Quiz.methods[method].call(page, 3);
    expect(page.recordingObservation).toBe(false);
    expect(page.saveCurrentProgress).toHaveBeenCalled();
  }
);

it.each(['local-health', 'material-health', 'upload-recovery', 'maintenance', 'original-delete'])(
  'inflight-16-02: %s wrapper retains an explicit revoked binding',
  async (kind) => {
    const session = captureSession();
    login(2);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const c = {
      ...connection(),
      model: 'fixture',
      capabilities: {
        uploadRecovery: { available: true, contract: 'wenli-upload-v1', storageId: 'b'.repeat(32) },
        uploadMaintenance: { available: true, contract: 'wenli-upload-maintenance-v1', generation: 'c'.repeat(32) }
      }
    };
    const options = { platform: 'h5', session };
    const calls = {
      'local-health': () => testLocalConnector({ ...c, endpoint: c.endpoint.replace('/parse', '/chat') }, options),
      'material-health': () => testMaterialConnector(c, options),
      'upload-recovery': () =>
        requestUploadRecovery(
          c,
          'upload-receipt',
          { id: 'upload_fixture_round7', connectorOrigin: 'http://127.0.0.1:8765', storageId: 'b'.repeat(32), size: 4 },
          options
        ),
      maintenance: () => requestUploadMaintenance(c, null, options),
      'original-delete': () =>
        deleteConnectedMaterial(c, { fileId: 'a'.repeat(64), connectorOrigin: 'http://127.0.0.1:8765' }, options)
    };
    await expect(calls[kind]()).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' });
    expect(fetch).not.toHaveBeenCalled();
  }
);
it('inflight-16-02: last-page callback cannot return a result rebound to another account', async () => {
  const session = captureSession();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ success: true, data: { ...material(1), nextPage: null } })))
  );
  await expect(
    parseConnectedMaterial(
      connection(),
      { name: 'test.pdf', size: 4, contentBase64: 'test' },
      { platform: 'h5', session, onBatch: () => login(2) }
    )
  ).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' });
});
it('inflight-16-01: an old flashcard operation cannot clear a newer local operation', async () => {
  const gate = defer();
  vi.spyOn(learningWriteLease, 'waitUntilWritable').mockReturnValue(gate.promise);
  const question = { id: 'ownership', question: '原题', answer: '原参考', type: 'flashcard' };
  const page = {
    ...Quiz.data(),
    boundLoginSession: captureSession(),
    quizOwnerId: 'account-1',
    sessionId: 'quiz_session_round7_ownership',
    currentQuestion: question,
    currentIndex: 0,
    referenceSaved: false,
    saveCurrentProgress: vi.fn()
  };
  const pending = Quiz.methods.flipFlashcard.call(page);
  const next = {};
  page._observationOperation = next;
  blocked = '_enc_EXAM_SESSION_EPOCH';
  gate.resolve();
  await pending;
  expect(page.recordingObservation).toBe(true);
  expect(page._observationOperation).toBe(next);
});
it('inflight-16-01: cluster identity preflight failure releases loading', async () => {
  const source = readFileSync('src/pages/mistake/index.vue', 'utf8');
  const body = source.slice(
    source.indexOf('async function loadErrorClusters()'),
    source.indexOf('// 基于聚类结果筛选错题')
  );
  const busy = ref(false);
  const load = new Function(
    'clusterLoading',
    'getUserId',
    'studyEngineStore',
    'clustersOwnerId',
    'errorClusters',
    'logger',
    'toast',
    't',
    body + ';return loadErrorClusters;'
  )(busy, getUserId, { getErrorClusters: vi.fn() }, ref(null), ref([]), { error() {} }, { info() {} }, (v) => v);
  blocked = '_enc_EXAM_SESSION_EPOCH';
  await load().catch(() => {});
  expect(busy.value).toBe(false);
});
it('inflight-16-01: upload journal preflight failure never strands file processing', () => {
  const page = {
    generationSession: captureSession(),
    uploadHistoryKey: 'fixture_upload_history',
    isUploadingFile: false,
    saveUploadRecord: aiGenerationMixin.methods.saveUploadRecord,
    startAI: vi.fn()
  };
  blocked = 'u_account-1_fixture_upload_history';
  expect(() => aiGenerationMixin.methods.handleUpload.call(page, { name: 'fixture.txt', size: 4 })).toThrow();
  expect(page.isUploadingFile).toBe(false);
  expect(page.startAI).not.toHaveBeenCalled();
});
