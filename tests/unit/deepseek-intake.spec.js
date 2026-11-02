import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { storageService } from '@/services/storageService.js';
import { learningWriteLease } from '@/services/learning/learning-write-lease.js';
import MuseModelIntake from '@/components/business/learning/muse-model-intake.vue';
import BaseOptions from '@/components/base/base-options/base-options.vue';
import { INTAKE_CHOICES } from '../../laf-backend/functions/_shared/learning-intake.js';
import { deepseekIntakeReceipt } from '../fixtures/deepseek-intake.js';
import { emptyLearningState } from '@/services/learning/learning-domain.js';

let store, wrapper, calls, queue;
const copy = (value) => JSON.parse(JSON.stringify(value));
beforeEach(() => {
  uni.clearStorageSync();
  learningWriteLease.release();
  storageService.saveLoginSession({ userId: 'synthetic-intake-owner', token: 'fixture-only-token', userInfo: {} });
  setActivePinia(createPinia());
  store = useConversationLearningStore();
  store.sharingAllowed = true;
  calls = [];
  queue = [];
  vi.spyOn(uni, 'request').mockImplementation((options) => {
    calls.push(copy(options.data));
    const response =
      options.data.action === 'pull'
        ? { success: true, data: { state: emptyLearningState(store.state.owner) } }
        : queue.shift();
    if (response) queueMicrotask(() => options.success({ statusCode: 200, data: copy(response) }));
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
async function greeting() {
  queue.push(
    {
      success: true,
      data: {
        models: [{ id: 'fixture-model', provider: 'DeepSeek', model: 'deepseek-flash', capabilities: {} }],
        intakeContract: 'model-intake-v1'
      }
    },
    {
      success: true,
      data: {
        message: '你在准备什么？',
        intake: { options: INTAKE_CHOICES, input: true, profile: null },
        question: null,
        tools: []
      }
    }
  );
  expect((await store.beginModelIntake('fixture-model')).success).toBe(true);
}
function panel() {
  wrapper = mount(MuseModelIntake);
  return wrapper;
}
const modelCalls = () => calls.filter((c) => c.action === 'test');

describe('DeepSeek intake receipt and request recovery', () => {
  it('does not transmit an answer or register a new request after sharing consent is withdrawn', async () => {
    await greeting();
    store.sharingAllowed = false;
    const before = JSON.stringify(store.state),
      count = modelCalls().length;
    await expect(store.answerModelIntake('考研')).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
    expect(modelCalls()).toHaveLength(count);
    expect(JSON.stringify(store.state)).toBe(before);
  });
  it('uses confirmed account data when connecting a model from a different conversation', async () => {
    const original = store.commit('conversation.start', { goal: '考研英语二' });
    store.commit('coach.begin', { conversationId: original.id, explicit: true });
    store.commit('coach.profile', {
      conversationId: original.id,
      explicit: true,
      profile: { exam: 'english2', minutes: 15, deadline: null }
    });
    const next = store.commit('conversation.start', { goal: '继续学习' });
    store.selectedConversationId = next.id;
    queue.push({ success: true }, { success: true, data: { models: [], intakeContract: 'model-intake-v1' } });
    expect((await store.beginModelIntake('another-model')).success).toBe(true);
    expect(modelCalls()).toHaveLength(1);
    expect(modelCalls()[0].intake).toBeUndefined();
    expect(store.state.intake).toBeUndefined();
    expect(store.state.conversations[0].coach.profile.exam).toBe('english2');
  });
  it('does not reopen completed unknown intake on a new model, while explicit restart still works', async () => {
    await greeting();
    for (let index = 0; index < 4; index++) {
      const requestId = `unknown-${index}`;
      store.commit('intake.request', { modelId: 'fixture-model', requestId, explicit: true, answer: '跳过' });
      store.commit('intake.result', {
        modelId: 'fixture-model',
        requestId,
        reply: {
          message: index === 3 ? '先开始学习，需要时再补充。' : '还有要补充的吗？',
          intake: {
            options:
              index === 3
                ? []
                : [
                    { value: 'unsure', label: '不确定' },
                    { value: 'skip', label: '跳过' }
                  ],
            input: index !== 3,
            profile: null
          },
          question: null,
          tools: []
        }
      });
    }
    const turns = copy(store.state.intake.turns);
    queue.push({ success: true }, { success: true, data: { models: [], intakeContract: 'model-intake-v1' } });
    await store.beginModelIntake('another-model');
    expect(modelCalls().at(-1).intake).toBeUndefined();
    expect(store.state.intake.turns).toEqual(turns);
    expect(store.state.conversations).toHaveLength(0);
    queue.push({
      success: true,
      data: {
        message: '你在准备什么？',
        intake: { options: INTAKE_CHOICES, input: true, profile: null },
        question: null,
        tools: []
      }
    });
    expect((await store.restartModelIntake()).success).toBe(true);
    expect(modelCalls().at(-1).intake.turns).toEqual([]);
  });
  it('renders the observed four choices, saves no profile, and waits for explicit confirmation', async () => {
    await greeting();
    queue.push(deepseekIntakeReceipt);
    await store.answerModelIntake('考研');
    panel();
    expect(wrapper.text()).toContain(deepseekIntakeReceipt.data.message);
    expect(wrapper.findComponent(BaseOptions).props('options')).toEqual(deepseekIntakeReceipt.data.intake.options);
    expect(wrapper.text()).toContain('跳过');
    expect(store.state.conversations).toHaveLength(0);
    expect(modelCalls()).toHaveLength(2);
    wrapper.findComponent(BaseOptions).vm.$emit('update:modelValue', 'english');
    await flushPromises();
    expect(modelCalls()).toHaveLength(2);
    queue.push({ success: false, status: 'reserved' });
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '发送')
      .trigger('tap');
    await flushPromises();
    expect(modelCalls()).toHaveLength(3);
    expect(modelCalls()[2].intake.turns.at(-1)).toEqual({
      question: deepseekIntakeReceipt.data.message,
      answer: '英语'
    });
  });
  it.each(['empty-message', 'non-null-question', 'tools', 'no-data', 'bad-options', 'premature-profile'])(
    'ends invalid receipt %s with a safe error and requestId',
    async (kind) => {
      await greeting();
      const bad = copy(deepseekIntakeReceipt);
      if (kind === 'empty-message') bad.data.message = ' ';
      if (kind === 'non-null-question') bad.data.question = '';
      if (kind === 'tools') bad.data.tools = [{ name: 'plan' }];
      if (kind === 'no-data') delete bad.data;
      if (kind === 'bad-options') bad.data.intake.options = [];
      if (kind === 'premature-profile')
        bad.data.intake.profile = {
          goal: '考研',
          category: 'kaoyan',
          exam: 'general',
          subjects: ['英语'],
          minutes: null,
          deadline: null,
          foundation: null
        };
      queue.push(bad);
      const result = await store.answerModelIntake('考研');
      expect(result).toMatchObject({ success: false, error: 'INTAKE_INVALID', status: 'failed' });
      expect(store.state.intake).toMatchObject({ status: 'failed', finalFailure: true, reply: null });
      panel();
      expect(wrapper.text()).toContain('模型回复格式不完整');
      expect(wrapper.text()).toContain(store.state.intake.requestId);
      expect(wrapper.text()).toContain('重新建档');
      expect(wrapper.text()).not.toContain('查询原请求');
      const error = store.intakeError;
      await store.recoverModelIntake();
      expect(store.intakeError).toBe(error);
      expect(modelCalls()).toHaveLength(2);
      expect(store.state.intake.turns.at(-1).answer).toBe('考研');
    }
  );
  it('queries the original request, restores ready state, and never retries generation on repeated reads', async () => {
    await greeting();
    queue.push({ success: false, code: 503 });
    await store.answerModelIntake('考研');
    const requestId = store.state.intake.requestId;
    queue.push({ ...copy(deepseekIntakeReceipt), reused: true });
    await store.recoverModelIntake();
    expect(calls.at(-1)).toEqual({ action: 'result', requestId });
    expect(store.state.intake).toMatchObject({ status: 'ready', finalFailure: false });
    panel();
    expect(wrapper.text()).toContain(deepseekIntakeReceipt.data.message);
    const count = calls.length;
    await store.recoverModelIntake();
    expect(calls).toHaveLength(count);
    expect(modelCalls()).toHaveLength(2);
  });
  it('ends a malformed cached result and rejects a receipt belonging to a different request', async () => {
    await greeting();
    queue.push({ success: false, code: 503 });
    await store.answerModelIntake('考研');
    const wrong = copy(deepseekIntakeReceipt);
    wrong.data.requestId = 'another-request';
    queue.push(wrong);
    await expect(store.recoverModelIntake()).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' });
    expect(store.state.intake.reply).toBeNull();
    const invalid = copy(deepseekIntakeReceipt);
    invalid.data.message = '';
    queue.push(invalid);
    expect(await store.recoverModelIntake()).toMatchObject({ error: 'INTAKE_INVALID' });
    expect(store.state.intake.finalFailure).toBe(true);
    expect(modelCalls()).toHaveLength(2);
  });
  it.each([{ status: 'failed', code: 503 }, { status: 'cancelled', code: 499 }, { code: 410 }, { code: 404 }])(
    'shows a terminal read failure %j without another model call',
    async (failure) => {
      await greeting();
      queue.push({ success: false, code: 503 });
      await store.answerModelIntake('考研');
      queue.push({ success: false, ...failure });
      await store.recoverModelIntake();
      expect(store.state.intake.finalFailure).toBe(true);
      panel();
      expect(wrapper.text()).toContain('查询已结束');
      expect(wrapper.text()).toContain(store.state.intake.requestId);
      const count = calls.length;
      await store.recoverModelIntake();
      expect(calls).toHaveLength(count);
      expect(modelCalls()).toHaveLength(2);
    }
  );
  it('keeps reserved reads pending and prevents a concurrent query or duplicate answer', async () => {
    await greeting();
    const pending = store.answerModelIntake('考研');
    await flushPromises();
    expect((await store.recoverModelIntake()).success).toBe(false);
    expect((await store.answerModelIntake('考研')).success).toBe(false);
    expect(modelCalls()).toHaveLength(2);
    // Release the one in-flight request without issuing another request.
    const options = uni.request.mock.calls.at(-1)[0];
    options.success({ data: { success: false, status: 'reserved', code: 409 } });
    await pending;
    expect(store.state.intake.finalFailure).toBe(false);
    expect(store.intakeError).toContain('仍在处理');
  });
});
