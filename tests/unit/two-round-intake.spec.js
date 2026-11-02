import { describe, expect, it } from 'vitest';
import { emptyLearningState, applyLearningOperation } from '@/services/learning/learning-domain.js';
import { prepareLearningRestore } from '@/services/learning/learning-backup.js';
import {
  MODEL_INTAKE_V2_CONTRACT as CONTRACT,
  INTAKE_CHOICES,
  intakeChoicesFor,
  intakeFinished,
  intakeSystemPrompt,
  normalizeIntakeContext,
  normalizeIntakeReply
} from '../../laf-backend/functions/_shared/learning-intake.js';

const context = (answers = []) => ({
  contract: CONTRACT,
  turns: answers.map((answer) => ({ question: '合成提问', answer }))
});
const reply = (ctx, patch = {}) => ({
  message: ctx.turns.length ? '想先准备哪一科？' : '你在准备什么？',
  intake: { options: intakeChoicesFor(ctx), input: !ctx.turns.length, profile: null },
  question: null,
  tools: [],
  ...patch
});
const proposal = (profile = {}) => ({
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
      foundation: null,
      ...profile
    }
  },
  question: null,
  tools: []
});
function harness() {
  let state = emptyLearningState('synthetic-two-round'),
    serial = 0;
  return {
    state: () => state,
    apply: (type, data) => {
      const result = applyLearningOperation(state, {
        id: `intake-v2-${++serial}`,
        type,
        at: Date.parse('2026-11-02T03:00:00Z') + serial,
        data
      });
      state = result.state;
      return result.result;
    },
    request: (id, answer, patch = {}) => {
      const data = {
        requestId: id,
        modelId: 'synthetic-model',
        explicit: true,
        ...(answer === undefined ? { contract: CONTRACT } : { answer }),
        ...patch
      };
      const result = applyLearningOperation(state, {
        id: `intake-v2-${++serial}`,
        type: 'intake.request',
        at: Date.parse('2026-11-02T03:00:00Z') + serial,
        data
      });
      state = result.state;
    },
    result: (id, value) => {
      const result = applyLearningOperation(state, {
        id: `intake-v2-${++serial}`,
        type: 'intake.result',
        at: Date.parse('2026-11-02T03:00:00Z') + serial,
        data: { requestId: id, modelId: 'synthetic-model', reply: value }
      });
      state = result.state;
    }
  };
}

describe('two-question model intake with host-enumerated choices', () => {
  it('keeps historical v1 choices and receipts unchanged; only explicit v2 uses the new direction set', () => {
    const old = {
      message: '你在准备什么？',
      intake: { options: INTAKE_CHOICES, input: true, profile: null },
      question: null,
      tools: []
    };
    expect(normalizeIntakeReply(old, true)).toEqual(old);
    expect(normalizeIntakeContext({ turns: [] })).toEqual({ turns: [] });
    expect(intakeChoicesFor(context()).map((item) => item.label)).toEqual(['考研', '考公', '其他']);
    expect(normalizeIntakeReply(reply(context()), true, context()).intake.options).toHaveLength(3);
    expect(() => normalizeIntakeContext({ contract: 'invented', turns: [] })).toThrow();
  });
  it.each([
    ['考研', ['英语一写作', '英语二写作', '其他科目', '尚未确定']],
    ['考公', ['申论', '其他科目', '尚未确定']],
    ['想先看看', ['英语写作', '申论', '尚未确定']]
  ])('selects the fixed state-machine branches for %s', (answer, labels) => {
    const ctx = context([answer]);
    expect(intakeChoicesFor(ctx).map((item) => item.label)).toEqual(labels);
    expect(normalizeIntakeReply(reply(ctx), false, ctx).intake.options.map((item) => item.label)).toEqual(labels);
    expect(intakeSystemPrompt(ctx)).toContain('最多2轮');
  });
  it.each(['arbitrary-value', 'new-label', 'omitted-choice', 'free-input', 'tool'])(
    'rejects model-authored %s branches before any fact can be saved',
    (change) => {
      const ctx = context(['考研']),
        value = structuredClone(reply(ctx));
      if (change === 'arbitrary-value') value.intake.options[0].value = 'execute-task';
      if (change === 'new-label') value.intake.options[0].label = '立即创建学习计划';
      if (change === 'omitted-choice') value.intake.options.pop();
      if (change === 'free-input') value.intake.input = true;
      if (change === 'tool') value.tools = [{ name: 'plan.set', arguments: {} }];
      expect(() => normalizeIntakeReply(value, false, ctx)).toThrow();
    }
  );
  it('stops after the second answer without inventing a profile or third question', () => {
    const h = harness();
    h.request('first');
    h.result('first', reply(context()));
    h.request('second', '考研');
    h.result('second', reply(context(['考研'])));
    h.request('third', '其他科目');
    const stopped = {
      message: '方向尚未确定，可稍后重新选择。',
      intake: { options: [], input: false, profile: null },
      question: null,
      tools: []
    };
    h.result('third', stopped);
    expect(intakeFinished(h.state().intake)).toBe(true);
    expect(h.state().conversations).toEqual([]);
    const before = JSON.stringify(h.state());
    expect(() => h.request('fourth', '再问一次')).toThrow('未追加第三轮问题');
    expect(JSON.stringify(h.state())).toBe(before);
    const ctx = context(['考研', '其他科目']);
    expect(() => normalizeIntakeReply(reply(context(['考研'])), false, ctx)).toThrow();
  });
  it('honors an explicit skip immediately, leaving the direction unknown', () => {
    const ctx = context(['跳过']),
      stopped = {
        message: '方向尚未确定，可稍后重新选择。',
        intake: { options: [], input: false, profile: null },
        question: null,
        tools: []
      };
    expect(intakeFinished(ctx)).toBe(true);
    expect(normalizeIntakeReply(stopped, false, ctx)).toEqual(stopped);
  });
  it('keeps proposal confirmation separate, retains initial explicit facts, and accepts a later user correction', () => {
    const h = harness();
    h.request('first');
    h.result('first', reply(context()));
    const initial = '考研，每天20分钟，2026年12月26日';
    h.request('second', initial);
    h.result('second', reply(context([initial])));
    h.request('third', '英语二写作');
    h.result('third', proposal());
    expect(h.state().conversations).toHaveLength(0);
    expect(h.state().intake.reply.intake.profile).toMatchObject({
      exam: 'english2',
      minutes: 20,
      deadline: '2026-12-26'
    });
    h.request('correction', '改为英语一写作，每天25分钟');
    h.result('correction', proposal({ goal: '英语一写作', subjects: ['英语一写作'] }));
    expect(h.state().intake.reply.intake.profile).toMatchObject({
      exam: 'english1',
      minutes: 25,
      deadline: '2026-12-26'
    });
    expect(() => h.apply('intake.accept', {})).toThrow();
    const target = h.apply('intake.accept', { explicit: true });
    expect(target.coach.profile).toMatchObject({ exam: 'english1', minutes: 25 });
    expect(h.state().attempts).toEqual([]);
    const restored = prepareLearningRestore(emptyLearningState(h.state().owner), JSON.stringify(h.state())).state;
    expect(restored.intake).toEqual(h.state().intake);
    expect(restored.conversations).toEqual(h.state().conversations);
  });
  it('cannot promote a generic direction label to a subject or change contracts during an answer', () => {
    expect(() =>
      normalizeIntakeReply(proposal({ exam: 'general', subjects: ['其他科目'] }), false, context(['考研', '其他科目']))
    ).toThrow();
    const h = harness();
    h.request('first');
    h.result('first', reply(context()));
    expect(() => h.request('changed', '考研', { contract: 'model-intake-v1' })).toThrow('沿原建档合同');
  });
  it('leaves unprovided exam details, time, date and foundation unknown even when the model invents them', () => {
    const value = proposal({ subjects: ['英语写作'], minutes: 30, deadline: '2026-12-26', foundation: '基础较弱' });
    expect(normalizeIntakeReply(value, false, context(['考研', '英语写作'])).intake.profile).toMatchObject({
      exam: 'general',
      minutes: null,
      deadline: null,
      foundation: null
    });
  });
  it('rebuilds the intake from events instead of trusting imported draft claims or sensitive payloads', () => {
    const state = emptyLearningState('synthetic-two-round');
    const forged = { ...state, intake: { acceptedConversationId: 'invented', reply: proposal() } };
    expect(prepareLearningRestore(state, JSON.stringify(forged)).state.intake).toBeUndefined();
    expect(() =>
      prepareLearningRestore(state, JSON.stringify({ ...forged, intake: { apiKey: 'fixture-only-secret' } }))
    ).toThrow('敏感配置');
  });
  it('rejects a result from another binding while retaining the original pending request', () => {
    const h = harness();
    h.request('bound', undefined, { binding: 'fixture-request-binding' });
    const data = { requestId: 'bound', modelId: 'synthetic-model', reply: reply(context()) };
    expect(() => h.apply('intake.result', { ...data, binding: 'foreign-binding' })).toThrow('旧模型建档回复');
    expect(h.state().intake.status).toBe('pending');
    h.apply('intake.result', { ...data, binding: 'fixture-request-binding' });
    expect(h.state().intake.status).toBe('ready');
  });
});
