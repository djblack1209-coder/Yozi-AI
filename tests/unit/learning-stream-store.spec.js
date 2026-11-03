import { acknowledgePreferences } from '../fixtures/learning/saved-byok.js';
import { toolParameterHash } from '../../laf-backend/functions/_shared/learning-runtime-policy.js';
import { storageService } from '@/services/storageService.js';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { learningRepository } from '@/services/learning/learning-repository.js';
import LearningPage from '@/pages/learning/index.vue';
import { createLearningRepository } from '@/services/learning/learning-repository.js';
import { emptyLearningState, applyLearningOperation } from '@/services/learning/learning-domain.js';
import MuseComposer from '@/components/business/learning/muse-composer.vue';
import MusePresentationControl from '@/components/business/learning/muse-presentation-control.vue';
import config from '@/config/index.js';
import { onHide } from '@dcloudio/uni-app';
import { coachFixture } from '../fixtures/writing-coach.js';
import { PRESENTATION_CONTRACT } from '../../laf-backend/functions/_shared/learning-content-blocks.js';
import { SINGLE_QUESTION_CONTRACT } from '../../laf-backend/functions/_shared/learning-intake.js';
import BaseSegmented from '@/components/base/base-segmented/base-segmented.vue';
vi.mock('@dcloudio/uni-app', () => ({ onShow: vi.fn(), onLoad: vi.fn(), onBackPress: vi.fn(), onHide: vi.fn() }));
let previousBaseUrl;
const stores = [];
const wrappers = [];
beforeEach(() => {
  previousBaseUrl = config.api.baseUrl;
  uni.clearStorageSync();
  setActivePinia(createPinia());
  vi.stubGlobal('ReadableStream', class {});
});
afterEach(async () => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  for (const store of stores.splice(0)) {
    store.cancel();
    store.$dispose();
  }
  await flushPromises();
  config.api.baseUrl = previousBaseUrl;
  delete uni.requireNativePlugin;
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
function setup(platform = 'h5') {
  let bridge;
  if (platform === 'app') {
    config.api.baseUrl = 'https://synthetic-app.invalid';
    vi.stubGlobal('plus', { os: { name: 'Android' } });
    bridge = {
      getCapabilities: () => ({
        contract: 'wenli-app-connector-v1',
        redirect: 'reject',
        responseLimit: 'bytes',
        utf8: 'strict',
        tls: 'system',
        cancel: true,
        stream: {
          contract: 'wenli-app-stream-v1',
          chunks: 'base64',
          sequence: true,
          maxBytes: 2097152,
          maxChunks: 256,
          timeoutMs: 45000
        }
      }),
      request: vi.fn(),
      stream: vi.fn(),
      cancel: vi.fn()
    };
    uni.requireNativePlugin = vi.fn(() => bridge);
  }
  uni.setStorageSync('EXAM_USER_ID', 'stream-store-owner');
  uni.setStorageSync('EXAM_TOKEN', platform === 'app' ? 'SYNTHETIC_APP_STREAM_TOKEN_32_CHARS' : 'fixture-only-token');
  const store = useConversationLearningStore();
  stores.push(store);
  store.start(platform === 'app' ? '雅思写作观点与依据' : '理解函数');
  store.models = [
    {
      id: 'fixture',
      provider: 'synthetic',
      model: 'explicit',
      source: 'byok',
      configured: true,
      capabilities: { stream: true }
    }
  ];
  store.modelId = 'fixture';
  store.selectedMode = 'cloud';
  store.sharingAllowed = true;
  store.streamEnabled = true;
  let request,
    waiting,
    closed = false,
    nativeInput,
    nativeDone,
    nativeSequence = 1,
    receivedBytes = 0;
  const queue = [];
  const push = (text) => {
    if (platform === 'app') {
      const bytes = new TextEncoder().encode(text);
      for (let i = 0; i < bytes.length; i += 11) {
        const part = bytes.slice(i, i + 11);
        receivedBytes += part.length;
        nativeDone({
          id: nativeInput.id,
          kind: 'chunk',
          sequence: nativeSequence++,
          receivedBytes,
          data: Buffer.from(part).toString('base64')
        });
      }
      return;
    }
    queue.push({ value: new TextEncoder().encode(text), done: false });
    if (waiting) {
      const next = waiting;
      waiting = null;
      next.resolve(queue.shift());
    }
  };
  const end = () => {
    closed = true;
    if (platform === 'app') {
      nativeDone({ id: nativeInput.id, kind: 'complete', sequence: nativeSequence++, receivedBytes });
      return;
    }
    if (waiting) {
      waiting.resolve({ done: true });
      waiting = null;
    }
  };
  const frame = (name, id, data) => `event: ${name}\nid: ${id}\ndata: ${JSON.stringify(data)}\n\n`;
  const fetch = vi.fn(async (_url, options) => {
    request = JSON.parse(options.body);
    options.signal.addEventListener('abort', () => {
      if (waiting) {
        waiting.reject(new Error('fixture abort'));
        waiting = null;
      }
      closed = true;
    });
    return {
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: {
        getReader: () => ({
          read: () =>
            queue.length
              ? Promise.resolve(queue.shift())
              : closed
                ? Promise.resolve({ done: true })
                : new Promise((resolve, reject) => (waiting = { resolve, reject })),
          cancel: vi.fn(),
          releaseLock: vi.fn()
        })
      }
    };
  });
  vi.stubGlobal('fetch', fetch);
  if (bridge)
    bridge.stream.mockImplementation((input, done) => {
      nativeInput = input;
      nativeDone = done;
      request = JSON.parse(input.body);
      done({
        id: input.id,
        kind: 'headers',
        sequence: nativeSequence++,
        receivedBytes: 0,
        status: 200,
        contentType: 'text/event-stream'
      });
    });
  return {
    store,
    bridge,
    fetch,
    push,
    end,
    frame,
    prepareNextReply() {
      closed = false;
      queue.length = 0;
    },
    get request() {
      return request;
    },
    preview() {
      push(
        frame('start', 1, { version: 1, requestId: request.requestId, modelId: 'fixture', model: 'explicit' }) +
          frame('preview', 2, {
            text: platform === 'app' ? '先区分观点与例子🙂' : '先用一个映射的例子理解函数',
            provisional: true
          })
      );
    },
    complete(patch = {}) {
      push(
        frame('result', 3, {
          success: true,
          data: {
            requestId: request.requestId,
            requestBinding: request.requestBinding,
            modelId: 'fixture',
            model: 'explicit',
            message: platform === 'app' ? '观点需要相关且充分的依据。' : '每个输入对应唯一输出。',
            tools: [
              {
                name: 'plan',
                arguments: {
                  reason: '先理解再独立检验',
                  tasks: [
                    { title: platform === 'app' ? '独立说明观点与依据' : '独立说明唯一对应', condition: 'manual' }
                  ]
                }
              }
            ],
            ...patch
          }
        })
      );
      end();
    }
  };
}
it('S22 binds advertised presentation to a new request and saves only the validated final descriptors', async () => {
  const harness = setup(),
    { store } = harness;
  vi.spyOn(uni, 'request').mockImplementation((options) => {
    if (acknowledgePreferences(options)) return { abort: vi.fn() };
    options.success({
      data: {
        code: 0,
        success: true,
        data: { models: [...store.models], presentationContracts: [PRESENTATION_CONTRACT] }
      }
    });
    return { abort: vi.fn() };
  });
  expect((await store.loadModels()).success).toBe(true);
  const pending = store.send('比较两个表达的语气。');
  await flushPromises();
  expect(harness.request.presentationContract).toBe(PRESENTATION_CONTRACT);
  const request = store.state.events.find((event) => event.type === 'model.request');
  expect(request.data.presentationContract).toBe(PRESENTATION_CONTRACT);
  const beforePreview = store.exportData();
  harness.preview();
  await flushPromises();
  expect(store.exportData()).toBe(beforePreview);
  const contentBlocks = { version: 3, items: [{ kind: 'checklist', items: [{ id: 'reader', label: '核对读者' }] }] };
  harness.complete({ tools: [], contentBlocks });
  await pending;
  expect(store.error).toBe('');
  expect(store.active.messages.at(-1).contentBlocks).toEqual(contentBlocks);
  expect(store.state.attempts).toHaveLength(0);
  let restored = emptyLearningState(store.state.owner, store.state.timezone);
  for (const event of JSON.parse(JSON.stringify(store.state.events)))
    restored = applyLearningOperation(restored, event).state;
  expect(restored).toEqual(store.state);
});

it('S22 explicit display input changes only the account view preference and never sends or saves a learning turn', async () => {
  const harness = setup(),
    { store } = harness;
  const wrapper = mount(LearningPage, {
    global: { stubs: { BaseIcon: true, AnimatedAvatar: true, YoziMascot: true } }
  });
  wrappers.push(wrapper);
  await flushPromises();
  const before = store.exportData();
  const composer = wrapper.findComponent(MuseComposer);
  expect(composer.exists()).toBe(true);
  composer.vm.$emit('update:modelValue', '显示方式：文字');
  await flushPromises();
  composer.vm.$emit('submit');
  await flushPromises();
  expect(wrapper.findComponent(MusePresentationControl).props('presentation').mode).toBe('text');
  expect(composer.props('modelValue')).toBe('');
  expect(store.exportData()).toBe(before);
  expect(harness.fetch).not.toHaveBeenCalled();
});

it('S23 requires an explicit versioned question entry and replays it without a fabricated profile or local quiz', () => {
  const state = emptyLearningState('question-entry-owner');
  for (const data of [{ entryContract: SINGLE_QUESTION_CONTRACT }, { entryContract: 'unknown', explicit: true }])
    expect(() =>
      applyLearningOperation(state, {
        id: 'entry',
        type: 'conversation.start',
        at: 123,
        data: { goal: '12 + 8', ...data }
      })
    ).toThrow();
  const operation = {
    id: 'entry',
    type: 'conversation.start',
    at: 123,
    data: { goal: '12 + 8', entryContract: SINGLE_QUESTION_CONTRACT, explicit: true }
  };
  const next = applyLearningOperation(state, operation).state;
  expect(next.conversations[0]).toMatchObject({ goal: '12 + 8', entryContract: SINGLE_QUESTION_CONTRACT });
  expect(next.conversations[0]).not.toHaveProperty('studyProfile');
  expect(next.questions).toEqual([]);
  expect(next.profile).toEqual([]);
  expect(applyLearningOperation(emptyLearningState(state.owner), operation).state).toEqual(next);
  expect(
    applyLearningOperation(state, { id: 'legacy', type: 'conversation.start', at: 123, data: { goal: '12 + 8' } }).state
      .conversations[0]
  ).not.toHaveProperty('entryContract');
});

async function singleQuestionHarness(resultState = 'failed') {
  const harness = setup(),
    { store } = harness;
  store.commit('intake.request', {
    explicit: true,
    requestId: 'previous-intake',
    modelId: 'fixture',
    contract: 'model-intake-v2',
    binding: 'fixture_binding_previous'
  });
  store.commit('intake.failed', { requestId: 'previous-intake', final: true });
  vi.spyOn(uni, 'request').mockImplementation((options) => {
    if (acknowledgePreferences(options)) return { abort: vi.fn() };
    if (options.data.action === 'result') {
      const pending = store.recoverableRequest;
      options.success({
        data:
          resultState === 'completed'
            ? {
                success: true,
                data: {
                  requestId: pending.requestId,
                  requestBinding: pending.binding,
                  modelId: pending.modelId,
                  model: pending.model,
                  message: '恢复原讲解。',
                  tools: [],
                  question: null,
                  contentBlocks: {
                    version: 3,
                    items: [{ kind: 'knowledge', title: '原结果', body: '原请求已经完成。' }]
                  }
                }
              }
            : {
                success: false,
                status: resultState,
                error: resultState === 'failed' ? 'INVALID_STRUCTURE' : 'RESERVED'
              }
      });
      return { abort: vi.fn() };
    }
    options.success({
      data: {
        code: 0,
        success: true,
        data: {
          models: [...store.models],
          presentationContracts: [PRESENTATION_CONTRACT],
          questionEntryContracts: [SINGLE_QUESTION_CONTRACT]
        }
      }
    });
    return { abort: vi.fn() };
  });
  expect((await store.loadModels()).success).toBe(true);
  return harness;
}

it('S23 question selection and restart stay local drafts; explicit send skips intake and invokes one bound general request', async () => {
  const harness = await singleQuestionHarness(),
    { store } = harness;
  store.selectedConversationId = null;
  const before = JSON.parse(JSON.stringify(store.state)),
    oldIntake = JSON.parse(JSON.stringify(store.state.intake));
  let wrapper = mount(LearningPage, { global: { stubs: { BaseIcon: true, AnimatedAvatar: true, YoziMascot: true } } });
  wrappers.push(wrapper);
  await flushPromises();
  wrapper
    .findAllComponents(BaseSegmented)
    .find((item) => item.props('label') === '开始方式')
    .vm.$emit('update:modelValue', 'question');
  wrapper.findComponent(MuseComposer).vm.$emit('update:modelValue', '怎样区分事实、推测和建议？');
  await flushPromises();
  expect(store.state).toEqual(before);
  expect(harness.fetch).not.toHaveBeenCalled();
  wrapper.unmount();
  wrappers.pop();
  wrapper = mount(LearningPage, { global: { stubs: { BaseIcon: true, AnimatedAvatar: true, YoziMascot: true } } });
  wrappers.push(wrapper);
  await flushPromises();
  expect(
    wrapper
      .findAllComponents(BaseSegmented)
      .find((item) => item.props('label') === '开始方式')
      .props('modelValue')
  ).toBe('question');
  expect(wrapper.findComponent(MuseComposer).props('modelValue')).toBe('怎样区分事实、推测和建议？');
  wrapper.findComponent(MuseComposer).vm.$emit('submit');
  await flushPromises();
  expect(harness.fetch).toHaveBeenCalledTimes(1);
  expect(harness.request.learningContext).toMatchObject({
    generalQAOnly: true,
    questionEntryContract: SINGLE_QUESTION_CONTRACT
  });
  expect(harness.request.learningContext).not.toHaveProperty('intake');
  expect(harness.request.presentationContract).toBe(PRESENTATION_CONTRACT);
  harness.preview();
  harness.complete({
    tools: [],
    contentBlocks: { version: 3, items: [{ kind: 'knowledge', title: '区分', body: '分别写明证据、推断与拟议动作。' }] }
  });
  await flushPromises();
  expect(store.active.entryContract).toBe(SINGLE_QUESTION_CONTRACT);
  expect(store.active.messages.filter((item) => item.role === 'user').map((item) => item.content)).toEqual([
    '怎样区分事实、推测和建议？'
  ]);
  expect(store.active).not.toHaveProperty('studyProfile');
  expect(store.state.intake).toEqual(oldIntake);
  for (const key of ['questions', 'attempts', 'profile', 'plans']) expect(store.state[key]).toEqual(before[key]);
  let replayed = emptyLearningState(store.state.owner, store.state.timezone);
  for (const operation of store.state.events) replayed = applyLearningOperation(replayed, operation).state;
  expect(replayed).toEqual(store.state);
});

it('S23 refuses unadvertised or unconsented entries before saving and blocks unexpected learning tools at the host', async () => {
  const harness = setup(),
    { store } = harness;
  const before = store.exportData();
  expect(() => store.startSingleQuestion('只问一句')).toThrow();
  expect(store.exportData()).toBe(before);
  store.$dispose();
  stores.pop();
  const next = await singleQuestionHarness(),
    owner = next.store;
  owner.sharingAllowed = false;
  const notSent = owner.exportData();
  expect(() => owner.startSingleQuestion('只问一句')).toThrow();
  expect(owner.exportData()).toBe(notSent);
  owner.sharingAllowed = true;
  owner.startSingleQuestion('12 + 8');
  expect(owner.activeQuestion).toBeUndefined();
  const pending = owner.send('12 + 8');
  await flushPromises();
  next.preview();
  next.complete({ contentBlocks: { version: 3, items: [{ kind: 'knowledge', title: '计算', body: '20。' }] } });
  await pending;
  expect(owner.error).toBeTruthy();
  expect(owner.state.plans).toEqual([]);
  expect(owner.state.attempts).toEqual([]);
  expect(owner.active.messages.some((message) => message.role === 'assistant')).toBe(false);
});

async function lostSingleQuestion(harness) {
  const { store } = harness;
  store.startSingleQuestion('怎样区分事实、推测和建议？');
  const send = store.send('怎样区分事实、推测和建议？');
  await flushPromises();
  harness.preview();
  harness.end();
  await send;
  expect(store.recoverableRequest).not.toBeNull();
}
it('S23 explicit retry queries the failed original, preserves its text and deduplicates a double click under a new request id', async () => {
  const harness = await singleQuestionHarness(),
    { store } = harness;
  await lostSingleQuestion(harness);
  const original = { ...store.recoverableRequest },
    prefix = JSON.parse(JSON.stringify(store.state.events));
  harness.prepareNextReply();
  const first = store.retrySingleQuestion(),
    second = store.retrySingleQuestion();
  await flushPromises();
  expect(harness.fetch).toHaveBeenCalledTimes(2);
  expect(harness.request.requestId).not.toBe(original.requestId);
  expect(vi.mocked(uni.request).mock.calls.filter(([options]) => options.data.action === 'result')).toHaveLength(1);
  harness.preview();
  harness.complete({
    tools: [],
    contentBlocks: { version: 3, items: [{ kind: 'knowledge', title: '说明', body: '事实有可追溯依据，推测需注明。' }] }
  });
  expect((await first).success).toBe(true);
  expect((await second).success).toBe(true);
  expect(store.state.events.slice(0, prefix.length)).toEqual(prefix);
  expect(store.active.messages.find((item) => item.id === original.messageId).content).toBe(
    '怎样区分事实、推测和建议？'
  );
  expect(store.active.messages.filter((item) => item.role === 'user')).toHaveLength(2);
  expect(store.recoverableRequest).toBeNull();
  expect(store.state.plans).toEqual([]);
  expect(store.state.attempts).toEqual([]);
});
it.each(['reserved', 'completed'])(
  'S23 retry of a %s original only reads or restores it, without another inference',
  async (status) => {
    const harness = await singleQuestionHarness(status),
      { store } = harness;
    await lostSingleQuestion(harness);
    const result = await store.retrySingleQuestion();
    expect(harness.fetch).toHaveBeenCalledTimes(1);
    expect(store.active.messages.filter((item) => item.role === 'user')).toHaveLength(1);
    if (status === 'completed') {
      expect(result).toMatchObject({ success: true, restored: true });
      expect(store.recoverableRequest).toBeNull();
    } else {
      expect(result).toMatchObject({ success: false, status: 'reserved' });
      expect(store.recoverableRequest).not.toBeNull();
    }
  }
);

it('带练复用流式片段，预览不写学习事实，最终校验后保存当前会话', async () => {
  const harness = setup(),
    { store } = harness;
  store.startCoach('考研英语二写作');
  store.coachSave('profile', { profile: { exam: 'english2', minutes: 25, deadline: null } });
  vi.spyOn(uni, 'request').mockImplementation((options) => {
    if (acknowledgePreferences(options)) return { abort: vi.fn() };
    options.success({
      data: {
        success: true,
        data: {
          platformEnabled: true,
          models: [
            { id: 'fixture', provider: 'synthetic', model: 'explicit', source: 'byok', capabilities: { stream: true } }
          ]
        }
      }
    });
    return { abort: vi.fn() };
  });
  const pending = store.requestCoach('diagnostic');
  await flushPromises();
  const snapshot = store.exportData();
  harness.preview();
  await flushPromises();
  expect(store.streamPreview).toBe('先用一个映射的例子理解函数');
  expect(store.exportData()).toBe(snapshot);
  expect(store.active.coach.diagnostic).toBeNull();
  harness.complete({ tools: [], coach: coachFixture(harness.request.learningContext.coach) });
  expect((await pending).success).toBe(true);
  expect(store.streamPreview).toBe('');
  expect(store.active.coach.requests[0].status).toBe('completed');
  expect(store.active.coach.diagnostic.cards.length).toBeGreaterThan(0);
});

it('合法提示后无效计划保留部分成功、失败收据和重开重试的幂等边界', async () => {
  const harness = setup(),
    { store } = harness;
  store.start('12 + 8');
  const question = store.activeQuestion;
  const originalPlans = JSON.stringify(store.state.plans);
  const tools = [
    { name: 'hint', arguments: { content: '先把个位相加，再看十位。', level: 1 } },
    { name: 'plan', arguments: { tasks: [{ title: '独立检验', questionKey: 'missing:1' }] } }
  ];
  const send = store.send('帮我组织下一步', { id: 'partial-tools', discussionOnly: true });
  await flushPromises();
  harness.preview();
  harness.complete({ message: '提示与计划都已保存。', tools });
  await send;
  expect(store.activeQuestion).toEqual(question);
  expect(store.active.pendingHints).toHaveLength(1);
  expect(JSON.stringify(store.state.plans)).toBe(originalPlans);
  expect(store.state.attempts).toHaveLength(0);
  expect(store.active.messages.some((m) => m.content === '提示与计划都已保存。')).toBe(false);
  expect(store.state.executions.map(({ at, ...receipt }) => receipt)).toEqual([
    {
      id: 'partial-tools:tool:0:receipt',
      tool: 'hint',
      status: 'success',
      version: '1.1',
      permission: 'learn',
      decision: 'allowed',
      parameterHash: toolParameterHash(tools[0].arguments),
      remainingBudget: 2
    },
    {
      id: `partial-tools:tool:1:denied:${toolParameterHash(tools[1].arguments).split(':')[1]}`,
      tool: 'plan',
      status: 'failed',
      version: '2.0',
      permission: 'learn',
      decision: 'denied',
      parameterHash: toolParameterHash(tools[1].arguments),
      remainingBudget: 1
    }
  ]);
  expect(store.error).toContain('已保存1项操作');
  const snapshot = store.exportData();
  setActivePinia(createPinia());
  const reopened = useConversationLearningStore();
  stores.push(reopened);
  reopened.selectedMode = 'cloud';
  reopened.modelId = 'fixture';
  reopened.sharingAllowed = true;
  vi.spyOn(uni, 'request').mockImplementation((options) => {
    if (acknowledgePreferences(options)) return { abort: vi.fn() };
    expect(options.data).toEqual({ action: 'result', requestId: 'partial-tools' });
    options.success({
      data: {
        success: true,
        reused: true,
        data: {
          requestId: 'partial-tools',
          requestBinding: harness.request.requestBinding,
          modelId: 'fixture',
          model: 'explicit',
          message: '提示与计划都已保存。',
          tools
        }
      }
    });
    return { abort: vi.fn() };
  });
  await expect(reopened.recoverModelResult()).rejects.toThrow('已保存1项操作');
  expect(reopened.exportData()).toBe(snapshot);
  expect(reopened.error).toContain('其余未完成');
  expect(reopened.active.pendingHints).toHaveLength(1);
  expect(harness.fetch).toHaveBeenCalledOnce();
});
it('预览只在临时区域出现，完整终止前无计划/工具/教学事实；重复消息不重扣', async () => {
  const harness = setup(),
    { store } = harness;
  const wrapper = mount(LearningPage, {
    global: {
      stubs: {
        view: { template: '<div><slot /></div>' },
        text: { template: '<span><slot /></span>' },
        LearningShell: { template: '<div><slot /></div>' },
        NumberLine: true,
        BaseIcon: true,
        LearningOverview: true
      }
    }
  });
  wrappers.push(wrapper);
  const send = store.send('请讲解函数', { id: 'stream-task' });
  await flushPromises();
  harness.preview();
  await flushPromises();
  expect(store.streamPreview).toContain('映射');
  expect(wrapper.get('[id="stream-task:reply"] .learning-card-placeholder').exists()).toBe(true);
  expect(wrapper.get('[id="stream-task:reply"]').text()).toContain('映射');
  expect(store.state.plans).toHaveLength(0);
  expect(store.state.executions).toHaveLength(0);
  expect(store.active.messages.filter((m) => m.role === 'assistant')).toHaveLength(0);
  harness.complete();
  await send;
  await flushPromises();
  expect(store.streamPreview).toBe('');
  expect(store.state.plans).toHaveLength(0);
  expect(store.active.messages.filter((m) => m.proposal?.type === 'plan.set')).toHaveLength(1);
  expect(wrapper.find('.message.notice[aria-live="polite"]').exists()).toBe(false);
  expect(store.active.messages.filter((m) => m.role === 'assistant' && !m.proposal)).toHaveLength(1);
  expect(store.summary.first.denominator).toBe(0);
  await store.send('请讲解函数', { id: 'stream-task' });
  expect(harness.fetch).toHaveBeenCalledOnce();
  expect(store.recoverableRequest).toBeNull();
  wrapper.unmount();
});
it('断流仅保存请求意图；重开读取绑定的原结果，两个动作都不重复调用模型', async () => {
  const harness = setup(),
    send = harness.store.send('请讲解函数', { id: 'lost-task' });
  await flushPromises();
  harness.preview();
  harness.end();
  await send;
  expect(harness.store.state.plans).toHaveLength(0);
  expect(harness.store.recoverableRequest.requestId).toBe('lost-task');
  setActivePinia(createPinia());
  const reopened = useConversationLearningStore();
  reopened.selectedMode = 'cloud';
  reopened.modelId = 'fixture';
  reopened.sharingAllowed = true;
  const transport = vi.spyOn(uni, 'request').mockImplementation((options) => {
    if (acknowledgePreferences(options)) return { abort: vi.fn() };
    expect(options.data).toEqual({ action: 'result', requestId: 'lost-task' });
    options.success({
      data: {
        success: true,
        reused: true,
        data: {
          requestId: 'lost-task',
          requestBinding: harness.request.requestBinding,
          modelId: 'fixture',
          model: 'explicit',
          message: '已完成的原教学结果',
          tools: [{ name: 'progress', arguments: {} }]
        }
      }
    });
    return { abort: vi.fn() };
  });
  expect((await reopened.recoverModelResult()).reused).toBe(true);
  expect(reopened.active.messages.at(-1).content).toBe('已完成的原教学结果');
  expect(reopened.state.executions).toHaveLength(1);
  expect(harness.fetch).toHaveBeenCalledOnce();
  expect(
    transport.mock.calls.filter(
      ([options]) => options.url.endsWith('/learning-models') && options.data.action === 'result'
    )
  ).toHaveLength(1);
  expect(transport.mock.calls.every(([options]) => ['result', 'preferences'].includes(options.data.action))).toBe(true);
  await expect(reopened.recoverModelResult()).rejects.toThrow('没有');
});
it('上下文已调整、隐私删除/恢复或取消之后，拒绝迟到片段及旧工具', async () => {
  const harness = setup(),
    send = harness.store.send('请讲解函数');
  await flushPromises();
  harness.preview();
  await flushPromises();
  harness.store.sharingAllowed = false;
  harness.complete();
  await send;
  expect(harness.store.state.plans).toHaveLength(0);
  expect(harness.store.streamPreview).toBe('');
  harness.store.sharingAllowed = true;
  harness.store.commit('profile.set', {
    field: 'preference',
    value: '用另一种方法',
    source: 'self_report',
    scope: '当前任务',
    evidenceIds: []
  });
  await expect(harness.store.recoverModelResult()).rejects.toThrow('上下文已变化');
  expect(harness.fetch).toHaveBeenCalledOnce();
  const second = setup(),
    next = second.store.send('请讲解');
  await flushPromises();
  second.preview();
  await flushPromises();
  learningRepository.deleteData();
  second.complete();
  await next;
  expect(second.store.state.plans).toHaveLength(0);
  expect(second.store.state.conversations).toHaveLength(0);
});
it('取消清除临时预览并发送同账户服务端取消，不把取消当零成本成功', async () => {
  const harness = setup();
  const transport = vi.spyOn(uni, 'request').mockImplementation((options) => {
    if (acknowledgePreferences(options)) return { abort: vi.fn() };
    options.success({ data: { success: true, data: { cancellationRecorded: true, status: 'reserved' } } });
    return { abort: vi.fn() };
  });
  const send = harness.store.send('请讲解', { id: 'cancel-task' });
  await flushPromises();
  harness.preview();
  await flushPromises();
  harness.store.cancel();
  await send;
  expect(harness.store.streamPreview).toBe('');
  expect(harness.store.recoverableRequest).toBeNull();
  expect(harness.store.state.plans).toHaveLength(0);
  const cancellations = transport.mock.calls.filter(
    ([options]) => options.url.endsWith('/learning-models') && options.data.action === 'cancel'
  );
  expect(cancellations).toHaveLength(1);
  expect(cancellations[0][0].data).toEqual({ action: 'cancel', requestId: 'cancel-task' });
  expect(harness.store.error).toContain('取消');
});

it('备份中的请求意图只重建历史；不恢复执行授权或导入密钥', async () => {
  const harness = setup(),
    pending = harness.store.send('请讲解', { id: 'history-only-task' });
  await flushPromises();
  harness.preview();
  harness.end();
  await pending;
  const exported = harness.store.exportData(),
    map = new Map();
  const repository = createLearningRepository(
    {
      get: (key, fallback) => (map.has(key) ? map.get(key) : fallback),
      save: (key, value) => {
        map.set(key, structuredClone(value));
        return true;
      },
      remove: (key) => {
        map.delete(key);
        return true;
      }
    },
    () => 'stream-store-owner'
  );
  const preview = repository.previewRestore(exported);
  repository.restoreData(exported, preview.expectedRevision);
  expect(repository.read().events.find((e) => e.type === 'model.request').data.historyOnly).toBe(true);
  expect(repository.read().attempts).toHaveLength(0);
  expect(repository.read().plans).toHaveLength(0);
  const hostile = JSON.parse(exported);
  hostile.events.find((e) => e.type === 'model.request').data.apiKey = 'fixture-only-secret';
  expect(() => repository.previewRestore(JSON.stringify(hostile))).toThrow('敏感');
  expect(emptyLearningState('stream-store-owner').revision).toBe(0);
});

it('App Store只在原生EOF和完整收据后执行一次学习计划，预览不写事实', async () => {
  const harness = setup('app'),
    { store, bridge } = harness;
  try {
    expect(store.streamSupported).toBe(true);
    const send = store.send('请讲解写作观点与依据', { id: 'synthetic-app-stream-task' });
    await flushPromises();
    harness.preview();
    await flushPromises();
    expect(store.streamPreview).toBe('先区分观点与例子🙂');
    expect(store.state.plans).toHaveLength(0);
    expect(store.state.attempts).toHaveLength(0);
    expect(store.active.messages.filter((m) => m.role === 'assistant')).toHaveLength(0);
    const before = JSON.parse(store.exportData());
    expect(JSON.stringify(before)).not.toContain('先区分观点与例子');
    expect(JSON.stringify(before)).not.toContain('SYNTHETIC_APP_STREAM_TOKEN');
    harness.complete();
    await send;
    expect(store.state.plans).toHaveLength(0);
    expect(store.active.messages.filter((m) => m.proposal?.type === 'plan.set')).toHaveLength(1);
    expect(store.active.messages.filter((m) => m.role === 'assistant' && !m.proposal)).toHaveLength(1);
    expect(store.streamPreview).toBe('');
    expect(store.summary.first.denominator).toBe(0);
    await store.send('请讲解写作观点与依据', { id: 'synthetic-app-stream-task' });
    expect(bridge.stream).toHaveBeenCalledOnce();
    expect(bridge.request).not.toHaveBeenCalled();
    expect(harness.fetch).not.toHaveBeenCalled();
    expect(store.recoverableRequest).toBeNull();
  } finally {
    store.$dispose();
  }
});
it.each(['incomplete', 'binding', 'model'])('App %s回执不能执行工具或生成可靠首答', async (kind) => {
  const harness = setup('app'),
    { store } = harness;
  try {
    const send = store.send('请讲解观点与依据');
    await flushPromises();
    harness.preview();
    if (kind === 'incomplete') harness.end();
    else harness.complete(kind === 'binding' ? { requestBinding: 'wrong' } : { model: 'other' });
    await send;
    expect(store.state.plans).toHaveLength(0);
    expect(store.state.attempts).toHaveLength(0);
    expect(store.summary.first.denominator).toBe(0);
    expect(store.streamPreview).toBe('');
    expect(store.recoverableRequest).not.toBeNull();
  } finally {
    store.$dispose();
  }
});
it.each(['owner', 'epoch', 'model', 'stop', 'withdraw', 'hide'])(
  'App预览后%s变化拒绝迟到工具与事实',
  async (change) => {
    const harness = setup('app'),
      { store, bridge } = harness;
    let wrapper;
    vi.spyOn(uni, 'request').mockImplementation((options) => {
      if (acknowledgePreferences(options)) return { abort: vi.fn() };
      options.success({ data: { success: true, data: { cancellationRecorded: true, status: 'reserved' } } });
      return { abort: vi.fn() };
    });
    if (change === 'hide')
      wrapper = mount(LearningPage, {
        global: {
          stubs: {
            view: { template: '<div><slot /></div>' },
            text: { template: '<span><slot /></span>' },
            LearningShell: { template: '<div><slot /></div>' },
            NumberLine: true,
            BaseIcon: true,
            LearningOverview: true
          }
        }
      });
    if (wrapper) wrappers.push(wrapper);
    try {
      const send = store.send('请讲解观点与依据');
      const rejected = ['owner', 'epoch'].includes(change)
        ? expect(send).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' })
        : null;
      await flushPromises();
      harness.preview();
      await flushPromises();
      expect(store.streamPreview).toContain('观点');
      if (change === 'owner')
        storageService.saveLoginSession({ userId: 'other-synthetic-owner', token: 'fixture-peer-token', userInfo: {} });
      else if (change === 'epoch') {
        storageService.saveLoginSession({ userId: 'stream-store-owner', token: 'stream-test-token', userInfo: {} });
      } else if (change === 'model') store.modelId = 'other-model';
      else if (change === 'stop') await store.send('请停止当前任务');
      else if (change === 'withdraw') store.sharingAllowed = false;
      else onHide.mock.calls.at(-1)[0]();
      await flushPromises();
      harness.complete();
      if (rejected) await rejected;
      else await send;
      expect(store.state.plans).toHaveLength(0);
      expect(store.state.attempts).toHaveLength(0);
      expect(store.streamPreview).toBe('');
      expect(store.summary.first.denominator).toBe(0);
      expect(bridge.cancel).toHaveBeenCalledOnce();
      expect(bridge.stream).toHaveBeenCalledOnce();
      expect(harness.fetch).not.toHaveBeenCalled();
      if (change === 'stop') expect(store.activeStrategy.stopped).toBe(true);
      if (change === 'hide') expect(store.sharingAllowed).toBe(false);
    } finally {
      wrapper?.unmount();
      store.$dispose();
    }
  }
);
it.each(['stop', 'hide'])('取消后的迟到错误不抢走%s页面焦点，原答与预算事实保持', async (change) => {
  const harness = setup('app'),
    { store, bridge } = harness;
  store.start('12 + 8');
  store.submit('19', true);
  const originals = JSON.stringify(store.state.attempts);
  vi.spyOn(uni, 'request').mockImplementation((options) => {
    if (acknowledgePreferences(options)) return { abort: vi.fn() };
    options.success({ data: { success: true, data: { cancellationRecorded: true, status: 'reserved' } } });
    return { abort: vi.fn() };
  });
  const wrapper = mount(LearningPage, {
    attachTo: document.body,
    global: {
      stubs: {
        view: { template: '<div><slot /></div>' },
        text: { template: '<span><slot /></span>' },
        LearningShell: { template: '<div><slot /><slot name="composer" /></div>' },
        NumberLine: true,
        BaseIcon: true,
        LearningOverview: true
      }
    }
  });
  wrappers.push(wrapper);
  const otherPage = document.createElement('button');
  otherPage.textContent = '另一页面当前操作';
  document.body.append(otherPage);
  let expected, expectedError;
  try {
    const pending = store.send('直接讲解', { discussionOnly: true });
    await flushPromises();
    harness.preview();
    await flushPromises();
    if (change === 'stop') {
      expect(wrapper.findAll('#learning-composer .muse-send[aria-label="取消请求"]')).toHaveLength(1);
      expect(wrapper.findAll('#learning-composer [aria-label="停止当前任务"]')).toHaveLength(1);
      const stop = wrapper.get('#learning-composer .muse-send[aria-label="取消请求"]');
      await stop.trigger('keydown', { key: 'Enter' });
      // The square cancels this request; stopping the task is a separate idle action.
      await flushPromises();
      expect(store.active.stopped).toBeFalsy();
      expect(store.error).toContain('取消');
      expect(wrapper.find('#learning-composer .muse-send[aria-label="取消请求"]').exists()).toBe(false);
      // 取消请求与停止任务保留不同语义；文字停止仍走结构化动作。
      expect(wrapper.findAll('#learning-composer [aria-label="停止当前任务"]')).toHaveLength(1);
      await wrapper.get('#learning-composer textarea').setValue('停止当前任务');
      await wrapper.get('#learning-composer [aria-label="发送"]').trigger('keydown', { key: 'Enter' });
      await flushPromises();
      expect(store.active.stopped).toBe(true);
      expected = wrapper.get('#learning-stop-state').element;
      expectedError = store.error;
    } else {
      otherPage.focus();
      expected = otherPage;
      onHide.mock.calls.at(-1)[0]();
    }
    harness.push(harness.frame('error', 3, { success: false, error: '迟到的模型错误', errorCode: 'UPSTREAM_FAILED' }));
    harness.end();
    await pending;
    await flushPromises();
    expect(document.activeElement).toBe(expected);
    expect(JSON.stringify(store.state.attempts)).toBe(originals);
    expect(store.streamPreview).toBe('');
    if (change === 'stop') expect(store.error).toBe(expectedError);
    else expect(store.error).toContain('取消');
    expect(bridge.cancel).toHaveBeenCalledOnce();
    expect(bridge.stream).toHaveBeenCalledOnce();
    expect(harness.fetch).not.toHaveBeenCalled();
  } finally {
    otherPage.remove();
  }
});
