import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { storageService } from '@/services/storageService.js';
import { learningWriteLease } from '@/services/learning/learning-write-lease.js';
import { emptyLearningState } from '@/services/learning/learning-domain.js';
import MuseModelIntake from '@/components/business/learning/muse-model-intake.vue';
import BaseOptions from '@/components/base/base-options/base-options.vue';
import {
  MODEL_INTAKE_V2_CONTRACT as CONTRACT,
  intakeChoicesFor
} from '../../laf-backend/functions/_shared/learning-intake.js';

let store, wrapper, calls, reserved, results, scopeContracts;
const copy = (value) => JSON.parse(JSON.stringify(value));
const envelope = (context) =>
  context.turns.length < 2
    ? {
        message: context.turns.length ? '想先准备哪一科？' : '你在准备什么？',
        intake: { options: intakeChoicesFor(context), input: !context.turns.length, profile: null },
        question: null,
        tools: []
      }
    : {
        message: '请确认学习目标',
        intake: {
          options: [],
          input: false,
          profile: {
            goal: '考研英语二写作',
            category: 'kaoyan',
            exam: 'english2',
            subjects: ['英语二写作'],
            minutes: null,
            deadline: null,
            foundation: null
          }
        },
        question: null,
        tools: []
      };
beforeEach(() => {
  uni.clearStorageSync();
  learningWriteLease.release();
  storageService.saveLoginSession({ userId: 'synthetic-two-round-ui', token: 'fixture-only-token', userInfo: {} });
  setActivePinia(createPinia());
  store = useConversationLearningStore();
  calls = [];
  reserved = false;
  results = new Map();
  scopeContracts = [];
  vi.spyOn(uni, 'request').mockImplementation((options) => {
    const data = copy(options.data);
    calls.push(data);
    const intake = data.intake || data.learningContext?.intake;
    if (intake)
      results.set(data.requestId, {
        requestId: data.requestId,
        modelId: data.modelId,
        requestBinding: data.requestBinding,
        ...envelope(intake)
      });
    const response =
      data.action === 'pull'
        ? { success: true, data: { state: emptyLearningState(store.state.owner) } }
        : data.action === 'list'
          ? {
              success: true,
              data: {
                models: [
                  {
                    id: 'synthetic-model',
                    source: 'byok',
                    configured: true,
                    provider: 'Synthetic provider',
                    model: 'synthetic-model',
                    capabilities: {}
                  }
                ],
                intakeContract: 'model-intake-v1',
                intakeContracts: ['model-intake-v1', CONTRACT],
                intakeScopeContracts: scopeContracts
              }
            }
          : intake
            ? reserved
              ? { success: false, status: 'reserved' }
              : { success: true, data: results.get(data.requestId) }
            : data.action === 'result'
              ? { success: true, data: results.get(data.requestId) }
              : { success: true, data: {} };
    queueMicrotask(() => options.success({ statusCode: 200, data: copy(response) }));
    return { abort: vi.fn() };
  });
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  store?.$dispose();
  learningWriteLease.release();
  vi.restoreAllMocks();
});
async function prepare() {
  await store.loadModels();
  store.modelId = 'synthetic-model';
  store.sharingAllowed = true;
}
const modelCalls = () => calls.filter((call) => call.action === 'test' || call.learningContext?.intake);
async function send() {
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '发送')
    .trigger('tap');
  await flushPromises();
}

describe('two-round native/shared intake component and real store integration', () => {
  it('prefers the newest supported scope only for a new draft and pins an in-progress v1 draft across a catalogue refresh', async () => {
    scopeContracts = ['learning-exam-scope-v1'];
    await prepare();
    await store.beginModelIntake('synthetic-model', { newGoal: true });
    expect(store.state.intake.scopeContract).toBe('learning-exam-scope-v1');
    scopeContracts = ['learning-exam-scope-v1', 'learning-exam-scope-v2'];
    await store.loadModels();
    await store.answerModelIntake('考研');
    expect(store.state.intake.scopeContract).toBe('learning-exam-scope-v1');
    expect(modelCalls().at(-1).learningContext.intake.scopeContract).toBe('learning-exam-scope-v1');
    await store.answerModelIntake('英语二写作');
    store.acceptModelIntake();
    await store.beginModelIntake('synthetic-model', { newGoal: true });
    expect(store.state.intake.scopeContract).toBe('learning-exam-scope-v2');
    expect(modelCalls().at(-1).learningContext.intake.scopeContract).toBe('learning-exam-scope-v2');
  });
  it('opens once after consent, keeps capsule selection as draft, and creates a new goal only on confirmation', async () => {
    const original = store.commit('conversation.start', { goal: 'Synthetic original goal' });
    store.commit('coach.begin', { conversationId: original.id, explicit: true });
    store.commit('coach.profile', {
      conversationId: original.id,
      explicit: true,
      profile: { exam: 'english2', minutes: 20, deadline: null }
    });
    const before = JSON.stringify(store.state.conversations[0]);
    store.selectedConversationId = null;
    await prepare();
    wrapper = mount(MuseModelIntake, { props: { newGoal: true, autoOpen: true } });
    await flushPromises();
    expect(modelCalls()).toHaveLength(1);
    expect(store.state.intake.contract).toBe(CONTRACT);
    expect(wrapper.text()).toContain('你在准备什么？');
    expect(
      wrapper
        .findComponent(BaseOptions)
        .props('options')
        .map((choice) => choice.label)
    ).toEqual(['考研', '考公', '其他']);
    const events = store.state.events.length;
    wrapper.findComponent(BaseOptions).vm.$emit('update:modelValue', 'kaoyan');
    await flushPromises();
    expect(store.state.events).toHaveLength(events);
    expect(modelCalls()).toHaveLength(1);
    await send();
    expect(modelCalls()).toHaveLength(2);
    expect(
      wrapper
        .findComponent(BaseOptions)
        .props('options')
        .map((choice) => choice.label)
    ).toEqual(['英语一写作', '英语二写作', '其他科目', '尚未确定']);
    wrapper.findComponent(BaseOptions).vm.$emit('update:modelValue', 'english2');
    await flushPromises();
    expect(modelCalls()).toHaveLength(2);
    await send();
    expect(modelCalls()).toHaveLength(3);
    expect(store.state.conversations).toHaveLength(1);
    expect(wrapper.text()).toContain('确认目标');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '确认目标')
      .trigger('tap');
    await flushPromises();
    expect(store.state.conversations).toHaveLength(2);
    expect(store.active.coach.profile.exam).toBe('english2');
    expect(JSON.stringify(store.state.conversations[0])).toBe(before);
    expect(modelCalls()).toHaveLength(3);
    expect(
      modelCalls().every((call) => call.learningContext?.intake.contract === CONTRACT && call.requestBinding)
    ).toBe(true);
    expect(calls.filter((call) => call.action === 'test')).toHaveLength(0);
  });
  it('waits for explicit sharing permission and never auto-retries an unresolved request', async () => {
    await prepare();
    store.sharingAllowed = false;
    reserved = true;
    wrapper = mount(MuseModelIntake, { props: { newGoal: true, autoOpen: true } });
    await flushPromises();
    expect(modelCalls()).toHaveLength(0);
    store.sharingAllowed = true;
    await flushPromises();
    expect(modelCalls()).toHaveLength(1);
    const requestId = store.state.intake.requestId;
    store.sharingAllowed = false;
    await flushPromises();
    store.sharingAllowed = true;
    await flushPromises();
    expect(modelCalls()).toHaveLength(1);
    expect(store.state.intake.requestId).toBe(requestId);
    expect(wrapper.text()).toContain('查询原请求');
    expect(wrapper.text()).not.toContain('重新选择方向');
    expect(store.state.conversations).toHaveLength(0);
    reserved = false;
    expect((await store.recoverModelIntake()).success).toBe(true);
    expect(modelCalls()).toHaveLength(1);
    expect(store.state.intake.requestId).toBe(requestId);
    expect(store.state.intake.binding).toBe(modelCalls()[0].requestBinding);
  });
  it('starts a fresh draft after an accepted intake without changing the previously confirmed goal', async () => {
    await prepare();
    await store.beginModelIntake('synthetic-model', { newGoal: true });
    await store.answerModelIntake('考研');
    await store.answerModelIntake('英语二写作');
    const first = store.acceptModelIntake(),
      before = JSON.stringify(first);
    store.selectedConversationId = null;
    wrapper = mount(MuseModelIntake, { props: { newGoal: true, autoOpen: true } });
    await flushPromises();
    expect(store.state.intake.turns).toEqual([]);
    expect(store.state.intake.acceptedConversationId).toBeUndefined();
    expect(JSON.stringify(store.state.conversations.find((item) => item.id === first.id))).toBe(before);
    expect(modelCalls()).toHaveLength(4);
  });
  it('S26 explicitly starts a fresh direction after a terminal failure while retaining prior answers and events', async () => {
    const original = store.commit('conversation.start', { goal: 'Synthetic existing goal' });
    store.selectedConversationId = null;
    scopeContracts = ['learning-exam-scope-v1'];
    await prepare();
    await store.beginModelIntake('synthetic-model', { newGoal: true });
    await store.answerModelIntake('考研');
    store.commit('intake.failed', { requestId: store.state.intake.requestId, final: true });
    const previousEvents = copy(store.state.events),
      previousConversation = copy(original);
    scopeContracts.push('learning-exam-scope-v2');
    await store.loadModels();
    wrapper = mount(MuseModelIntake, { props: { newGoal: true, autoOpen: true } });
    await flushPromises();
    expect(modelCalls()).toHaveLength(2);
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '重新选择方向')
      .trigger('tap');
    await flushPromises();
    expect(modelCalls()).toHaveLength(3);
    expect(modelCalls().at(-1).learningContext.intake).toMatchObject({
      turns: [],
      contract: CONTRACT,
      scopeContract: 'learning-exam-scope-v2'
    });
    expect(modelCalls().at(-1).messages).toEqual([{ role: 'user', content: '请发出学习建档的第一问。' }]);
    expect(store.state.events.slice(0, previousEvents.length)).toEqual(previousEvents);
    expect(
      store.state.events.find((event) => event.type === 'intake.request' && event.data.answer === '考研')
    ).toBeTruthy();
    expect(store.state.conversations).toEqual([previousConversation]);
    expect(store.state.intake.turns).toEqual([]);
    expect(store.state.intake.acceptedConversationId).toBeUndefined();
  });
  it('S26 ordinary retry keeps the failed answers and their pinned scope', async () => {
    scopeContracts = ['learning-exam-scope-v1'];
    await prepare();
    await store.beginModelIntake('synthetic-model', { newGoal: true });
    await store.answerModelIntake('考研');
    store.commit('intake.failed', { requestId: store.state.intake.requestId, final: true });
    const previousTurns = copy(store.state.intake.turns),
      previousEvents = copy(store.state.events);
    scopeContracts.push('learning-exam-scope-v2');
    await store.loadModels();
    wrapper = mount(MuseModelIntake, { props: { newGoal: true, autoOpen: true } });
    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '重新建档')
      .trigger('tap');
    await flushPromises();
    expect(modelCalls()).toHaveLength(3);
    expect(modelCalls().at(-1).learningContext.intake.turns).toEqual(previousTurns);
    expect(store.state.intake.turns).toEqual(previousTurns);
    expect(store.state.intake.scopeContract).toBe('learning-exam-scope-v1');
    expect(store.state.events.slice(0, previousEvents.length)).toEqual(previousEvents);
    expect(store.state.conversations).toEqual([]);
  });
});
