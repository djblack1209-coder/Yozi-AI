import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { storageService } from '@/services/storageService.js';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { captureSession } from '@/services/auth-storage.js';
import { coachFixture } from '../fixtures/writing-coach.js';
import { explicitIntakeFacts } from '../../laf-backend/functions/_shared/learning-intake.js';
import { SINGLE_QUESTION_CONTRACT } from '../../laf-backend/functions/_shared/learning-intake.js';
import { PRESENTATION_CONTRACT } from '../../laf-backend/functions/_shared/learning-content-blocks.js';
import {
  LEARNING_WORKFLOW_CONTRACT,
  workflowPlanDigest
} from '../../laf-backend/functions/_shared/learning-workflow.js';
import { learningRepository } from '@/services/learning/learning-repository.js';
import { synchronizeLearning } from '@/services/learning/learning-sync.js';
import {
  fetchLearningModels,
  saveLearningModelPreferences,
  generateLearningTurn,
  fetchLearningResult
} from '@/services/api/domains/learning.api.js';
vi.mock('@/services/api/domains/learning.api.js', async (original) => ({
  ...(await original()),
  fetchLearningModels: vi.fn(),
  saveLearningModelPreferences: vi.fn(),
  generateLearningTurn: vi.fn(),
  fetchLearningResult: vi.fn()
}));
vi.mock('@/services/learning/learning-sync.js', async (original) => ({
  ...(await original()),
  synchronizeLearning: vi.fn()
}));
const connection = (id) => ({
  id,
  provider: 'fixture',
  model: id,
  source: 'byok',
  configured: true,
  capabilities: { structured: true },
  connectionStatus: 'connected'
});
let store;
const login = (userId) => storageService.saveLoginSession({ userId, token: `fixture-${userId}` });
const catalog = (models = [], preferences = { selectedModelId: null, sharingAllowed: false }) => ({
  success: true,
  data: { models, preferences, presets: [], platformEnabled: false }
});
beforeEach(async () => {
  uni.clearStorageSync();
  await login('byok-owner');
  setActivePinia(createPinia());
  vi.mocked(saveLearningModelPreferences).mockReset().mockResolvedValue({ success: true });
  vi.mocked(fetchLearningModels).mockReset().mockResolvedValue(catalog());
  vi.mocked(generateLearningTurn).mockReset();
  vi.mocked(fetchLearningResult).mockReset();
  vi.mocked(synchronizeLearning)
    .mockReset()
    .mockImplementation(async () => learningRepository.replaceSynchronized(learningRepository.read()));
  store = useConversationLearningStore();
});
afterEach(() => {
  store?.$dispose();
  vi.restoreAllMocks();
});
it('new accounts expose the connector action and reject sending without any model call', async () => {
  await store.loadModels();
  expect(store.needsConnection).toBe(true);
  expect(store.connectionGuide.action).toMatchObject({ type: 'open_connectors', panel: 'connectors' });
  await expect(store.send('我要学考研英语二')).rejects.toMatchObject({ code: 'NEEDS_CONNECTION' });
  expect(generateLearningTurn).not.toHaveBeenCalled();
});
it('server selection and consent restore on reopen, remain explicit on failure, and edits save for that owner', async () => {
  vi.mocked(fetchLearningModels).mockResolvedValue(
    catalog([connection('first'), { ...connection('second'), connectionStatus: 'failed' }], {
      selectedModelId: 'second',
      sharingAllowed: true
    })
  );
  await store.loadModels();
  expect(store.modelId).toBe('second');
  expect(store.sharingAllowed).toBe(true);
  store.$dispose();
  setActivePinia(createPinia());
  store = useConversationLearningStore();
  expect(store.sharingAllowed).toBe(true);
  await store.loadModels();
  expect(store.modelId).toBe('second');
  await store.selectModel('first');
  await store.setSharingAllowed(false);
  expect(saveLearningModelPreferences).toHaveBeenLastCalledWith(
    { selectedModelId: 'first', sharingAllowed: false },
    expect.objectContaining({ expectedOwner: 'byok-owner' })
  );
});
it('account switches clear the current view, models and consent while retaining guest and account records', async () => {
  store.start('Account private math');
  vi.mocked(fetchLearningModels).mockResolvedValue(
    catalog([connection('first')], { selectedModelId: 'first', sharingAllowed: true })
  );
  await store.loadModels();
  await login('different-owner');
  store.refresh();
  expect(store.state.owner).toBe('different-owner');
  expect(store.state.conversations).toHaveLength(0);
  expect(store.models).toEqual([]);
  expect(store.sharingAllowed).toBe(false);
  await login('byok-owner');
  store.refresh();
  expect(store.state.conversations[0].goal).toBe('Account private math');
  storageService._clearRevokedCredentials(captureSession());
  store.refresh();
  store.start('Guest private math');
  const guestRecord = JSON.stringify(store.state);
  await login('fresh-student');
  store.refresh();
  expect(store.state.conversations).toHaveLength(0);
  storageService._clearRevokedCredentials(captureSession());
  store.refresh();
  expect(store.state.conversations).toHaveLength(0);
  expect(
    uni.getStorageInfoSync().keys.some((key) => JSON.stringify(uni.getStorageSync(key)).includes('Guest private math'))
  ).toBe(true);
  expect(guestRecord).toContain('Guest private math');
});
async function prepareCoach() {
  vi.mocked(fetchLearningModels).mockResolvedValue(
    catalog([connection('first')], { selectedModelId: 'first', sharingAllowed: true })
  );
  await store.loadModels();
  store.startCoach('考研英语二，每天25分钟，2027-12-20考试');
  store.coachSave('profile', { profile: { exam: 'english2', minutes: 25, deadline: '2027-12-20' } });
}
it('terminal validation failures close the intent and make a manual retry observable', async () => {
  await prepareCoach();
  vi.mocked(generateLearningTurn).mockResolvedValueOnce({
    success: false,
    status: 'failed',
    error: 'COACH_INVALID',
    repairExhausted: true
  });
  await store.requestCoach('diagnostic');
  expect(store.active.coach.requests[0].status).toBe('closed');
  expect(store.retryState).toMatchObject({ phase: 'failed', errorCode: 'COACH_INVALID' });
  let finish;
  vi.mocked(generateLearningTurn).mockImplementationOnce(
    (body) =>
      new Promise((resolve) => {
        finish = () =>
          resolve({
            success: true,
            data: {
              requestId: body.requestId,
              requestBinding: body.requestBinding,
              modelId: body.modelId,
              coach: coachFixture(body.learningContext.coach)
            }
          });
      })
  );
  const retry = store.requestCoach('diagnostic');
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  expect(store.retryState.phase).toBe('running');
  finish();
  await retry;
  expect(store.retryState.phase).toBe('succeeded');
});
it('recovering an interrupted coach request does not require sharing consent or resend it', async () => {
  await prepareCoach();
  vi.mocked(generateLearningTurn).mockResolvedValueOnce({ success: false, error: 'TIMEOUT' });
  await store.requestCoach('diagnostic');
  const pending = store.active.coach.requests[0];
  await store.setSharingAllowed(false);
  vi.mocked(fetchLearningResult).mockResolvedValueOnce({
    success: true,
    data: {
      requestId: pending.id,
      requestBinding: pending.binding,
      modelId: pending.modelId,
      coach: coachFixture(pending.request)
    }
  });
  await store.requestCoach('diagnostic');
  expect(fetchLearningResult).toHaveBeenCalledOnce();
  expect(generateLearningTurn).toHaveBeenCalledOnce();
});
it('literal goal facts produce a draft and do not guess ambiguous choices or dates', () => {
  expect(explicitIntakeFacts('考研英语二，每天25分钟，2027-12-20考试')).toEqual({
    exam: 'english2',
    minutes: 25,
    deadline: '2027-12-20'
  });
  expect(explicitIntakeFacts('英语一还是英语二，每天20分钟或者30分钟，明年考试')).toEqual({});
});

it('混合摸底拒收后保留五项原答、关闭失败意图并允许下一步重试，不展示半截反馈', async () => {
  await prepareCoach();
  vi.mocked(generateLearningTurn).mockImplementationOnce(async (body) => ({
    success: true,
    data: {
      requestId: body.requestId,
      requestBinding: body.requestBinding,
      modelId: body.modelId,
      coach: coachFixture(body.learningContext.coach)
    }
  }));
  await store.requestCoach('diagnostic');
  for (const [index, card] of store.active.coach.diagnostic.cards.entries())
    store.coachSave('answer', { target: 'diagnostic', cardId: card.id, answer: `Synthetic answer ${index}` });
  const answers = structuredClone(
    store.active.coach.diagnostic.answers.map(({ cardId, answer }) => ({ cardId, answer }))
  );
  vi.mocked(generateLearningTurn).mockResolvedValueOnce({
    success: false,
    status: 'failed',
    error: 'COACH_INVALID',
    repairExhausted: true,
    message: '模型回复未通过教学校验，未计入学习成果；原答已保留，请手动重试。'
  });
  await store.requestCoach('feedback', 'diagnostic');
  expect(store.active.coach.diagnostic.feedback).toBeFalsy();
  expect(store.active.coach.diagnostic.answers.map(({ cardId, answer }) => ({ cardId, answer }))).toEqual(answers);
  expect(store.active.coach.requests.at(-1).status).toBe('closed');
  expect(store.retryState).toMatchObject({ phase: 'failed', errorCode: 'COACH_INVALID' });
  expect(store.coachError).toContain('原答已保留');
  vi.mocked(generateLearningTurn).mockImplementationOnce(async (body) => ({
    success: true,
    data: {
      requestId: body.requestId,
      requestBinding: body.requestBinding,
      modelId: body.modelId,
      coach: coachFixture(body.learningContext.coach)
    }
  }));
  await store.requestCoach('feedback', 'diagnostic');
  expect(store.retryState.phase).toBe('succeeded');
  expect(store.active.coach.diagnostic.feedback).toBeTruthy();
  expect(store.active.coach.diagnostic.answers.map(({ cardId, answer }) => ({ cardId, answer }))).toEqual(answers);
});

it('S3 restores an earlier selected conversation and its connection after store recreation', async () => {
  store.start('First conversation');
  const first = store.active.id;
  store.start('Latest conversation');
  store.locateConversation(first);
  fetchLearningModels.mockResolvedValue(
    catalog([connection('first'), connection('second')], { selectedModelId: 'second', sharingAllowed: true })
  );
  await store.loadModels();
  store.$dispose();
  setActivePinia(createPinia());
  store = useConversationLearningStore();
  expect(store.selectedConversationId).toBe(first);
  expect(store.modelId).toBe('second');
  expect(store.selectedMode).toBe('offline');
  await store.loadModels();
  expect(store.selectedMode).toBe('cloud');
  expect(store.models).toHaveLength(2);
  await store.selectModel('first');
  expect(store.modelId).toBe('first');
});
it('S3 a retired selection is explicit and another saved connection remains selectable', async () => {
  fetchLearningModels.mockResolvedValue(
    catalog([connection('second')], { selectedModelId: 'retired', sharingAllowed: true })
  );
  await store.loadModels();
  expect(store.modelId).toBe('');
  expect(store.selectedMode).toBe('offline');
  expect(store.modelListState.selectionError).toBe('MODEL_NOT_FOUND');
  await store.selectModel('second');
  expect(store.modelId).toBe('second');
  expect(generateLearningTurn).not.toHaveBeenCalled();
});
it('S3 switching accounts cannot retain the other owner selection or receive a late catalog', async () => {
  let finish;
  fetchLearningModels.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const pending = store.loadModels();
  const rejected = expect(pending).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' });
  await vi.waitFor(() => expect(finish).toBeTruthy());
  await login('second-owner');
  store.refresh();
  finish(catalog([connection('private-first')], { selectedModelId: 'private-first', sharingAllowed: true }));
  await rejected;
  expect(store.models).toEqual([]);
  expect(store.modelId).toBe('');
  expect(store.selectedConversationId).toBeNull();
});
it('normal sync restores the saved connection without a model call or a new sharing grant', async () => {
  store.start('Synthetic sync acceptance');
  fetchLearningModels.mockResolvedValue(
    catalog([connection('saved')], { selectedModelId: 'saved', sharingAllowed: false })
  );
  await store.loadModels();
  const before = store.exportData();
  await store.syncRecords(true);
  await vi.waitFor(() => expect(store.modelListState.phase).toBe('ready'));
  expect(fetchLearningModels).toHaveBeenCalledTimes(2);
  expect(store.modelId).toBe('saved');
  expect(store.needsConnection).toBe(false);
  expect(store.sharingAllowed).toBe(false);
  expect(store.exportData()).toBe(before);
  expect(generateLearningTurn).not.toHaveBeenCalled();
  expect(store.syncState.phase).toBe('success');
});
it('a late catalog read after sync cannot restore the previous account connection or consent', async () => {
  let finish;
  fetchLearningModels.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
  await store.syncRecords(true);
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  await login('sync-other-owner');
  store.refresh();
  finish(catalog([connection('private-old')], { selectedModelId: 'private-old', sharingAllowed: true }));
  await Promise.resolve();
  await Promise.resolve();
  expect(store.state.owner).toBe('sync-other-owner');
  expect(store.models).toEqual([]);
  expect(store.modelId).toBe('');
  expect(store.sharingAllowed).toBe(false);
  expect(generateLearningTurn).not.toHaveBeenCalled();
});
it('catalog failure after a completed sync preserves its result and allows an explicit metadata retry', async () => {
  fetchLearningModels.mockRejectedValueOnce(new Error('Synthetic metadata outage'));
  await store.syncRecords(true);
  await vi.waitFor(() => expect(store.modelListState.phase).toBe('error'));
  expect(store.syncState.phase).toBe('success');
  fetchLearningModels.mockResolvedValue(catalog([connection('saved')]));
  await store.loadModels();
  expect(store.modelListState.phase).toBe('ready');
  expect(generateLearningTurn).not.toHaveBeenCalled();
});

const workflowQuestion = '多角度分析：比较邀请邮件两种开头的语气和任务覆盖。';
const workflowPlan = {
  tasks: [
    { id: 'tone', title: '语气', instruction: '分析语气。', dependsOn: [] },
    { id: 'coverage', title: '覆盖', instruction: '分析任务覆盖。', dependsOn: [] }
  ]
};
async function prepareWorkflowStore(enabled = true) {
  const result = catalog([connection('first')], { selectedModelId: 'first', sharingAllowed: true });
  Object.assign(result.data, {
    presentationContracts: [PRESENTATION_CONTRACT],
    questionEntryContracts: [SINGLE_QUESTION_CONTRACT],
    workflowContracts: enabled ? [LEARNING_WORKFLOW_CONTRACT] : []
  });
  vi.mocked(fetchLearningModels).mockResolvedValue(result);
  await store.loadModels();
  store.startSingleQuestion(workflowQuestion);
}
function installWorkflowReplies({ losePlanReply = false } = {}) {
  const saved = new Map();
  vi.mocked(fetchLearningResult).mockImplementation(async (id) =>
    saved.has(id) ? { ...saved.get(id), reused: true } : { success: false, code: 404 }
  );
  vi.mocked(generateLearningTurn).mockImplementation(async (body) => {
    const stage = body.learningContext.workflow,
      root = stage.parentId || body.requestId;
    const data = {
      requestId: body.requestId,
      requestBinding: body.requestBinding,
      modelId: body.modelId,
      model: 'first',
      message: '请按收信人与目的选择开头。',
      question: null,
      tools: [],
      workflowReceipt: {
        contract: LEARNING_WORKFLOW_CONTRACT,
        stage: stage.stage,
        parentId: root,
        ...(stage.taskId ? { taskId: stage.taskId } : {}),
        ...(stage.stage === 'plan' ? {} : { planDigest: workflowPlanDigest(workflowPlan) })
      }
    };
    if (stage.stage === 'plan')
      data.workflow = {
        contract: LEARNING_WORKFLOW_CONTRACT,
        stage: 'plan',
        parentId: root,
        binding: body.requestBinding,
        input: body.messages.at(-1).content,
        plan: workflowPlan
      };
    if (stage.stage === 'final')
      data.contentBlocks = {
        version: 3,
        items: [{ kind: 'knowledge', title: '邮件开头', body: '先交代目的，再说明邀请对象与事项。' }]
      };
    const response = { success: true, data };
    saved.set(body.requestId, response);
    if (losePlanReply && stage.stage === 'plan') return { success: false, code: 503, error: 'NETWORK_FAILED' };
    return response;
  });
  return saved;
}

it('S52 routes only an explicit single-question workflow through independently billed stages without assessment facts', async () => {
  await prepareWorkflowStore();
  installWorkflowReplies();
  const result = await store.send(workflowQuestion, { chatEntry: true, discussionOnly: true });
  expect(result.success).toBe(true);
  const request = store.state.events.find((event) => event.type === 'model.request');
  expect(request.data.workflowContract).toBe(LEARNING_WORKFLOW_CONTRACT);
  expect(generateLearningTurn).toHaveBeenCalledTimes(4);
  expect(vi.mocked(generateLearningTurn).mock.calls.map(([body]) => body.learningContext.workflow.stage)).toEqual([
    'plan',
    'agent',
    'agent',
    'final'
  ]);
  expect(store.active.messages.filter((message) => message.role === 'assistant').at(-1).content).toBe(
    '请按收信人与目的选择开头。'
  );
  expect(store.state.attempts).toHaveLength(0);
  expect(store.active.coach).toBeFalsy();
  expect(store.recoverableRequest).toBeNull();
});

it('S52 restores a lost planner reply after reopening by reads, then requires explicit continuation for missing steps', async () => {
  await prepareWorkflowStore();
  installWorkflowReplies({ losePlanReply: true });
  const failed = await store.send(workflowQuestion, { chatEntry: true, discussionOnly: true });
  expect(failed.success).toBe(false);
  const original = JSON.parse(JSON.stringify(store.recoverableRequest)),
    before = JSON.stringify(store.state.events);
  store.$dispose();
  setActivePinia(createPinia());
  store = useConversationLearningStore();
  await store.loadModels();
  expect(store.selectedConversationId).toBe(original.conversationId);
  vi.mocked(generateLearningTurn).mockClear();
  expect(await store.recoverModelResult()).toMatchObject({ workflowCanContinue: true, status: 'workflow_incomplete' });
  expect(generateLearningTurn).not.toHaveBeenCalled();
  expect(store.workflowCanContinue).toBe(true);
  expect(JSON.stringify(store.state.events)).toBe(before);
  expect(await store.recoverModelResult({ continueWorkflow: true })).toMatchObject({ success: true });
  expect(generateLearningTurn).toHaveBeenCalledTimes(3);
  expect(store.state.events.filter((event) => event.type === 'model.request')).toHaveLength(1);
  expect(store.state.attempts).toHaveLength(0);
  expect(store.recoverableRequest).toBeNull();
});

it.each([true, false])(
  'S52 sync resolves an incomplete workflow notice only for its saved final reply (matching=%s)',
  async (matching) => {
    await prepareWorkflowStore();
    installWorkflowReplies({ losePlanReply: true });
    await store.send(workflowQuestion, { chatEntry: true, discussionOnly: true });
    await store.recoverModelResult();
    const pending = JSON.parse(JSON.stringify(store.recoverableRequest)),
      originalEvents = JSON.parse(JSON.stringify(store.state.events)),
      incompleteError = store.error;
    expect(incompleteError).toBeTruthy();
    vi.mocked(generateLearningTurn).mockClear();
    vi.mocked(synchronizeLearning).mockImplementationOnce(async () => {
      const next = learningRepository.commit({
        id: matching ? `${pending.requestId}:reply` : 'another-saved-reply',
        type: 'message.add',
        data: { conversationId: pending.conversationId, role: 'assistant', content: '已保存的汇总。' }
      }).state;
      return learningRepository.replaceSynchronized(next);
    });
    await store.syncRecords(true);
    expect(store.state.events.slice(0, originalEvents.length)).toEqual(originalEvents);
    expect(store.state.attempts).toHaveLength(0);
    expect(generateLearningTurn).not.toHaveBeenCalled();
    if (matching) {
      expect(store.error).toBe('');
      expect(store.recoverableRequest).toBeNull();
      expect(store.workflowCanContinue).toBe(false);
    } else {
      expect(store.error).toBe(incompleteError);
      expect(store.recoverableRequest.requestId).toBe(pending.requestId);
    }
  }
);

it.each(['unadvertised', 'stream'])(
  'S52 refuses unsupported %s workflow execution before any request is sent',
  async (kind) => {
    await prepareWorkflowStore(kind !== 'unadvertised');
    if (kind === 'stream') store.streamEnabled = true;
    await expect(store.send(workflowQuestion, { chatEntry: true, discussionOnly: true })).rejects.toMatchObject({
      code: 'CAPABILITY_UNAVAILABLE'
    });
    expect(generateLearningTurn).not.toHaveBeenCalled();
    expect(fetchLearningResult).not.toHaveBeenCalled();
  }
);

async function confirmWorkflowGoal(text, expectedType) {
  expect(await store.send(text)).toMatchObject({ proposal: true });
  const message = store.active.messages.findLast((item) => item.proposal?.type === expectedType);
  expect(message).toBeTruthy();
  store.commit(
    expectedType,
    { ...message.proposal.data, proposalId: message.id, explicit: true },
    `${message.id}:accept`
  );
}

it('S53 keeps original workflow recoverable after confirmed Goal pause and resume without regenerating its plan', async () => {
  await prepareWorkflowStore();
  installWorkflowReplies({ losePlanReply: true });
  await store.send(workflowQuestion, { chatEntry: true, discussionOnly: true });
  const original = JSON.parse(JSON.stringify(store.recoverableRequest));
  await confirmWorkflowGoal('目标先暂停。', 'goal.pause');
  expect(store.active.stopped).toBe(true);
  vi.mocked(generateLearningTurn).mockClear();
  store.sharingAllowed = false;
  expect(await store.recoverModelResult()).toMatchObject({ workflowCanContinue: true, status: 'workflow_incomplete' });
  expect(store.workflowCanContinue).toBe(false);
  await expect(store.recoverModelResult({ continueWorkflow: true })).rejects.toMatchObject({ code: 'STOPPED' });
  expect(generateLearningTurn).not.toHaveBeenCalled();
  await confirmWorkflowGoal('目标继续。', 'goal.resume');
  await expect(store.recoverModelResult({ continueWorkflow: true })).rejects.toMatchObject({
    code: 'CONSENT_REQUIRED'
  });
  expect(generateLearningTurn).not.toHaveBeenCalled();
  store.sharingAllowed = true;
  expect(await store.recoverModelResult({ continueWorkflow: true })).toMatchObject({ success: true });
  expect(store.state.events.filter((event) => event.type === 'model.request')).toHaveLength(1);
  expect(store.state.events.find((event) => event.id === `${original.requestId}:reply`)).toBeTruthy();
  expect(generateLearningTurn.mock.calls.map(([body]) => body.learningContext.workflow.stage)).toEqual([
    'agent',
    'agent',
    'final'
  ]);
  expect(store.state.attempts).toHaveLength(0);
});

it('S53 restores a host-paused workflow on reopen and requires an explicit task resume before continuation', async () => {
  await prepareWorkflowStore();
  installWorkflowReplies({ losePlanReply: true });
  await store.send(workflowQuestion, { chatEntry: true, discussionOnly: true });
  const original = JSON.parse(JSON.stringify(store.recoverableRequest));
  store.dispatchLearningAction({ type: 'stop' });
  const pausedEvents = JSON.parse(JSON.stringify(store.state.events));
  store.$dispose();
  setActivePinia(createPinia());
  store = useConversationLearningStore();
  await store.loadModels();
  vi.mocked(generateLearningTurn).mockClear();
  expect(store.active.stopped).toBe(true);
  expect(await store.recoverModelResult()).toMatchObject({ workflowCanContinue: true });
  expect(store.state.events).toEqual(pausedEvents);
  expect(store.workflowCanContinue).toBe(false);
  expect(generateLearningTurn).not.toHaveBeenCalled();
  store.dispatchLearningAction({ type: 'resume' });
  expect(await store.recoverModelResult({ continueWorkflow: true })).toMatchObject({ success: true });
  expect(store.state.events.find((event) => event.id === `${original.requestId}:reply`)).toBeTruthy();
  expect(generateLearningTurn.mock.calls.map(([body]) => body.learningContext.workflow.stage)).toEqual([
    'agent',
    'agent',
    'final'
  ]);
});

it('S53 keeps an explicitly closed Goal read-only until it is reopened, preserving the original workflow intent', async () => {
  await prepareWorkflowStore();
  installWorkflowReplies({ losePlanReply: true });
  await store.send(workflowQuestion, { chatEntry: true, discussionOnly: true });
  const original = JSON.parse(JSON.stringify(store.recoverableRequest));
  await confirmWorkflowGoal('我完成目标了', 'goal.close');
  vi.mocked(generateLearningTurn).mockClear();
  expect(await store.recoverModelResult()).toMatchObject({ workflowCanContinue: true });
  await expect(store.recoverModelResult({ continueWorkflow: true })).rejects.toMatchObject({ code: 'STOPPED' });
  expect(generateLearningTurn).not.toHaveBeenCalled();
  expect(store.active.goalLifecycle.status).toBe('completed');
  await confirmWorkflowGoal('重开目标', 'goal.reopen');
  expect(await store.recoverModelResult({ continueWorkflow: true })).toMatchObject({ success: true });
  expect(store.active.goalLifecycle).toBeUndefined();
  expect(
    store.state.events.filter((event) => event.type === 'model.request').map((event) => event.data.requestId)
  ).toEqual([original.requestId]);
});

it('S53 reads a cached final result while the Goal is paused without resuming it or starting model work', async () => {
  await prepareWorkflowStore();
  installWorkflowReplies({ losePlanReply: true });
  await store.send(workflowQuestion, { chatEntry: true, discussionOnly: true });
  const root = generateLearningTurn.mock.calls[0][0];
  for (const task of [...workflowPlan.tasks, { id: 'final' }])
    await generateLearningTurn({
      ...root,
      requestId: `${root.requestId}:wf:${task.id}`,
      learningContext: {
        ...root.learningContext,
        workflow: {
          contract: LEARNING_WORKFLOW_CONTRACT,
          stage: task.id === 'final' ? 'final' : 'agent',
          parentId: root.requestId,
          ...(task.id === 'final' ? {} : { taskId: task.id })
        }
      }
    });
  await confirmWorkflowGoal('目标先暂停。', 'goal.pause');
  vi.mocked(generateLearningTurn).mockClear();
  const events = JSON.parse(JSON.stringify(store.state.events));
  expect(await store.recoverModelResult()).toMatchObject({ success: true });
  expect(generateLearningTurn).not.toHaveBeenCalled();
  expect(store.active.stopped).toBe(true);
  expect(store.state.events.slice(0, events.length)).toEqual(events);
  expect(store.state.events.at(-1).id).toBe(`${root.requestId}:reply`);
  expect(store.state.attempts).toHaveLength(0);
});

it.each(['question', 'goal', 'method'])(
  'S53 rejects a workflow with an unrelated %s change even after a valid Goal pause and resume',
  async (change) => {
    await prepareWorkflowStore();
    installWorkflowReplies({ losePlanReply: true });
    await store.send(workflowQuestion, { chatEntry: true, discussionOnly: true });
    if (change === 'question')
      store.commit('message.add', { conversationId: store.active.id, role: 'user', content: '改为核对另一份通知。' });
    if (change === 'goal')
      await confirmWorkflowGoal('我的目标是准备考研英语一写作，到2026年12月20日，每天20分钟。', 'goal.revise');
    if (change === 'method') store.dispatchLearningAction({ type: 'change_method' });
    await confirmWorkflowGoal('目标先暂停。', 'goal.pause');
    await confirmWorkflowGoal('目标继续。', 'goal.resume');
    vi.mocked(generateLearningTurn).mockClear();
    vi.mocked(fetchLearningResult).mockClear();
    await expect(store.recoverModelResult({ continueWorkflow: true })).rejects.toMatchObject({
      code: 'CONTEXT_CHANGED'
    });
    expect(generateLearningTurn).not.toHaveBeenCalled();
    expect(fetchLearningResult).not.toHaveBeenCalled();
    expect(store.state.attempts).toHaveLength(0);
  }
);

it('S53 keeps ordinary model-result and tool recovery strict after Goal lifecycle changes', async () => {
  await prepareWorkflowStore();
  generateLearningTurn.mockResolvedValueOnce({ success: false, code: 503, error: 'NETWORK_FAILED' });
  await store.send('请解释邀请邮件的开头。', { chatEntry: true, discussionOnly: true });
  expect(store.recoverableRequest.workflowContract).toBeUndefined();
  await confirmWorkflowGoal('目标先暂停。', 'goal.pause');
  await confirmWorkflowGoal('目标继续。', 'goal.resume');
  vi.mocked(generateLearningTurn).mockClear();
  vi.mocked(fetchLearningResult).mockClear();
  await expect(store.recoverModelResult()).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' });
  expect(generateLearningTurn).not.toHaveBeenCalled();
  expect(fetchLearningResult).not.toHaveBeenCalled();
});

it('S53 observes a saved pause during child calls, then reuses those results after explicit resume', async () => {
  await prepareWorkflowStore();
  const saved = installWorkflowReplies({ losePlanReply: true });
  await store.send(workflowQuestion, { chatEntry: true, discussionOnly: true });
  const original = JSON.parse(JSON.stringify(store.recoverableRequest));
  const generate = vi.mocked(generateLearningTurn).getMockImplementation();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  vi.mocked(generateLearningTurn)
    .mockClear()
    .mockImplementation(async (body) => {
      if (body.learningContext.workflow.stage === 'agent') await gate;
      return generate(body);
    });
  const continuing = store.recoverModelResult({ continueWorkflow: true });
  const observed = continuing.catch((error) => error);
  await vi.waitFor(() => expect(generateLearningTurn).toHaveBeenCalledTimes(2));
  learningRepository.commit({
    id: 's53-race-pause',
    type: 'task.stop',
    data: { conversationId: original.conversationId }
  });
  release();
  expect(await observed).toMatchObject({ code: 'CONTEXT_CHANGED' });
  expect(generateLearningTurn).toHaveBeenCalledTimes(2);
  expect(store.active.stopped).toBe(true);
  expect(saved.has(`${original.requestId}:wf:tone`)).toBe(true);
  expect(saved.has(`${original.requestId}:wf:coverage`)).toBe(true);
  store.dispatchLearningAction({ type: 'resume' });
  vi.mocked(generateLearningTurn).mockClear();
  expect(await store.recoverModelResult({ continueWorkflow: true })).toMatchObject({ success: true });
  expect(generateLearningTurn.mock.calls.map(([body]) => body.learningContext.workflow.stage)).toEqual(['final']);
});
