import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
vi.mock('@dcloudio/uni-app', () => ({ onShow: () => {}, onHide: () => {}, onLoad: () => {}, onBackPress: () => {} }));
import WritingCoach from '@/pages/learning/components/writing-coach.vue';
import { learningWriteLease } from '@/services/learning/learning-write-lease.js';
import { createPinia, setActivePinia } from 'pinia';
import MusePracticeSheet from '@/pages/learning/components/muse-practice-sheet.vue';
import BaseOptions from '@/components/base/base-options/base-options.vue';
import MuseWritingCard from '@/components/business/learning/muse-writing-card.vue';
import MuseModelIntake from '@/components/business/learning/muse-model-intake.vue';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import {
  normalizeCoachRequest,
  normalizeCoachOutput,
  coachSystemPrompt,
  coachInputFor,
  WRITING_COACH_CONTRACT
} from '../../laf-backend/functions/_shared/learning-writing-coach.js';
import {
  normalizeIntakeReply,
  normalizeIntakeContext,
  parseIntakeOutput,
  intakeSystemPrompt,
  INTAKE_CHOICES
} from '../../laf-backend/functions/_shared/learning-intake.js';
import { applyLearningOperation, emptyLearningState } from '@/services/learning/learning-domain.js';
import { coachFixture } from '../fixtures/writing-coach.js';

const request = normalizeCoachRequest({
  contract: WRITING_COACH_CONTRACT,
  phase: 'daily',
  exam: 'english1',
  day: '2026-10-21'
});
const cards = [
  {
    id: 'c1',
    kind: 'collocation',
    title: '固定搭配',
    prompt: '请选择搭配：look forward ___ hearing from you.',
    options: ['to', 'for', 'at']
  },
  {
    id: 'c2',
    kind: 'translate_en',
    title: '翻译',
    prompt: '请翻译短句。',
    options: ['A sentence.', 'Another sentence.']
  },
  { id: 'c3', kind: 'long_sentence', title: '拆分句子', prompt: '请写下主干。' }
];
let wrapper;
afterEach(() => wrapper?.unmount());

describe('3B optional choices schema', () => {
  it.each([2, 3, 4])('accepts %i plain strings, retains normalization and permits reloading normalized cards', (n) => {
    const output = coachFixture(request);
    output.cards[0].options = Array.from({ length: n }, (_, i) => ` ${i}${'a'.repeat(79)} `.trim());
    const normalized = normalizeCoachOutput(output, request);
    expect(normalized.cards[0].options).toHaveLength(n);
    expect(normalizeCoachOutput(normalized, request)).toEqual(normalized);
  });
  it.each([
    [],
    ['one'],
    ['a', 'b', 'c', 'd', 'e'],
    ['same', ' same '],
    ['a', 'b'.repeat(81)],
    ['a', ''],
    ['a', { label: 'b', answer: true }],
    null
  ])('rejects invalid options %j', (options) => {
    const output = coachFixture(request);
    output.cards[0].options = options;
    expect(() => normalizeCoachOutput(output, request)).toThrow();
  });
  it.each(['answer', 'correct', 'isCorrect', 'why', 'score', 'unknown'])(
    'rejects card field %s instead of silently stripping it',
    (field) => {
      const output = coachFixture(request);
      output.cards[0][field] = 'answer';
      expect(() => normalizeCoachOutput(output, request)).toThrow('未知字段');
    }
  );
  it.each(['collocation', 'translate_zh', 'translate_en', 'long_sentence'])(
    'supports %s only on the existing daily contract',
    (kind) => {
      const output = coachFixture(request);
      output.cards.find((c) => c.kind === kind).options = ['one', 'two'];
      expect(normalizeCoachOutput(output, request).cards.find((c) => c.kind === kind).options).toEqual(['one', 'two']);
    }
  );
  it('rejects options on a diagnostic card and describes uncertainty without answers in the prompt', () => {
    const diagnostic = { ...request, phase: 'diagnostic', target: 'diagnostic' };
    const output = coachFixture(diagnostic);
    output.cards[0].options = ['one', 'two'];
    expect(() => normalizeCoachOutput(output, diagnostic)).toThrow('不支持选项');
    expect(coachSystemPrompt(request)).toContain('没有把握时省略options');
  });
});

describe('3B practice: draft → explicit submit → read-only receipt', () => {
  it('saves a selected answer through the existing WritingCoach parent and keeps the receipt on remount', async () => {
    uni.clearStorageSync();
    setActivePinia(createPinia());
    const store = useConversationLearningStore();
    try {
      store.startCoach('考研英语一写作');
      store.coachSave('profile', { profile: { exam: 'english1', deadline: null, minutes: 25 } });
      const generate = (phase, target = phase) => {
        const request = normalizeCoachRequest({
          contract: WRITING_COACH_CONTRACT,
          phase,
          target,
          exam: 'english1',
          day: store.todaySummary.day,
          ...coachInputFor(store.active.coach, null, phase, target)
        });
        const data = { conversationId: store.active.id, explicit: true, requestId: `3b-${phase}` };
        const output = coachFixture(request);
        if (phase === 'daily') output.cards[0].options = ['to', 'for', 'at'];
        store.commit('coach.request', { ...data, request, modelId: 'synthetic', binding: 'synthetic' });
        store.commit('coach.result', { ...data, output });
      };
      generate('diagnostic');
      for (const card of store.active.coach.diagnostic.cards)
        store.coachSave('answer', { target: 'diagnostic', cardId: card.id, answer: 'Synthetic answer.' });
      generate('feedback', 'diagnostic');
      generate('daily');
      const mountCoach = () =>
        mount(WritingCoach, {
          global: {
            stubs: {
              view: { template: '<div><slot /></div>' },
              text: { template: '<span><slot /></span>' },
              BaseIcon: true
            }
          }
        });
      wrapper = mountCoach();
      await flushPromises();
      const day = () => store.active.coach.days.find((d) => d.day === store.todaySummary.day);
      await wrapper.get('[data-value="for"]').trigger('tap');
      expect(day().answers).toHaveLength(0);
      await wrapper
        .findAll('button')
        .find((b) => b.text() === '提交答案')
        .trigger('tap');
      await flushPromises();
      expect(day().answers).toEqual([expect.objectContaining({ cardId: 'c0', answer: 'for' })]);
      const before = store.exportData();
      wrapper.unmount();
      wrapper = mountCoach();
      await flushPromises();
      expect(wrapper.findComponent(BaseOptions).props()).toMatchObject({ disabled: true, modelValue: 'for' });
      expect(store.exportData()).toBe(before);
    } finally {
      wrapper?.unmount();
      wrapper = null;
      store.$dispose();
      learningWriteLease.release();
      uni.clearStorageSync();
    }
  });
  it('keeps picks local, emits model update before submit and derives receipt/progress from answers', async () => {
    const order = [];
    wrapper = mount(MusePracticeSheet, {
      props: {
        title: '今日训练',
        cards,
        currentId: 'c1',
        'onUpdate:modelValue': () => order.push('update'),
        onSubmit: () => order.push('submit')
      }
    });
    expect(wrapper.findComponent(MuseWritingCard).exists()).toBe(false);
    expect(wrapper.findAll('input,textarea')).toHaveLength(0);
    const submit = () => wrapper.findAll('button').find((b) => b.text() === '提交答案');
    expect(submit().attributes('disabled')).toBeDefined();
    await wrapper.get('[data-value="to"]').trigger('tap');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(submit().attributes('disabled')).toBeUndefined();
    await submit().trigger('tap');
    expect(wrapper.emitted('update:modelValue')).toEqual([['to']]);
    expect(wrapper.emitted('submit')).toEqual([[cards[0]]]);
    expect(order).toEqual(['update', 'submit']);
    await wrapper.setProps({ answers: [{ cardId: 'c1', answer: 'to' }], currentId: 'c2' });
    expect(wrapper.findComponent(BaseOptions).props('modelValue')).toBe('');
    await wrapper.get('[aria-label="固定搭配，已提交"]').trigger('tap');
    expect(wrapper.findComponent(BaseOptions).props()).toMatchObject({ disabled: true, modelValue: 'to' });
    expect(wrapper.text()).toContain('已提交，等待 AI 评估');
    expect(wrapper.text()).not.toContain('未提交');
    expect(
      wrapper
        .findComponent(BaseOptions)
        .props('options')
        .find((o) => o.value === 'to').state
    ).toBe('pending');
    expect(wrapper.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('1');
    expect(wrapper.get('.practice-progress-fill').attributes('style')).toContain('33.333');
    await wrapper.get('[data-value="for"]').trigger('tap');
    expect(wrapper.findComponent(BaseOptions).props('modelValue')).toBe('to');
    expect(wrapper.text()).not.toMatch(/正确答案|答对|答错/);
  });
  it('resets a discarded local choice on question navigation and preserves writing cards', async () => {
    wrapper = mount(MusePracticeSheet, { props: { title: '练习', cards, currentId: 'c1' } });
    await wrapper.get('[data-value="to"]').trigger('tap');
    await wrapper.setProps({ currentId: 'c2' });
    expect(wrapper.findComponent(BaseOptions).props('modelValue')).toBe('');
    await wrapper.setProps({ currentId: 'c3', modelValue: '自己的原答' });
    expect(wrapper.findComponent(BaseOptions).exists()).toBe(false);
    expect(wrapper.findComponent(MuseWritingCard).props('modelValue')).toBe('自己的原答');
  });
});

const reply = (
  options = [
    { value: 'english', label: '英语' },
    { value: 'skip', label: '尚未确定' }
  ]
) => ({ message: '先学哪个方向？', intake: { options, input: false, profile: null }, question: null, tools: [] });
const context = (answers) => ({ turns: answers.map((answer) => ({ question: '你准备什么？', answer })) });
const profileReply = () => ({
  ...reply([]),
  intake: {
    options: [],
    input: false,
    profile: {
      category: 'kaoyan',
      goal: '考研英语',
      exam: 'english1',
      subjects: ['英语'],
      minutes: null,
      deadline: null,
      foundation: null
    }
  }
});

describe('3B intake facts and bounded questions', () => {
  it('preserves the fixed six-choice first question', () => {
    const greeting = {
      ...reply(INTAKE_CHOICES),
      message: '你在准备什么？',
      intake: { options: INTAKE_CHOICES, input: true, profile: null }
    };
    expect(normalizeIntakeReply(greeting, true).intake.options).toEqual(INTAKE_CHOICES);
  });
  it.each(
    [
      [],
      [{ value: 'a', label: '英语' }],
      Array.from({ length: 5 }, (_, i) => ({ value: `${i}`, label: i ? `${i}` : '尚未确定' })),
      [
        { value: 'a', label: '英语' },
        { value: 'b', label: '数学' }
      ]
    ].map((options) => [options])
  )('rejects non-choice/min-max/no-skip followups %j', (options) => {
    expect(() => parseIntakeOutput(JSON.stringify(reply(options)), context(['考研']))).toThrow();
  });
  it('rejects premature profiles both at model parsing and at the reducer receipt boundary', () => {
    expect(() => parseIntakeOutput(JSON.stringify(profileReply()), context(['考研']))).toThrow();
    expect(() => parseIntakeOutput(JSON.stringify(profileReply()), context(['考研', '尚未确定']))).toThrow();
    const mixed = profileReply();
    mixed.intake.profile.subjects.push('尚未确定');
    expect(() => parseIntakeOutput(JSON.stringify(mixed), context(['考研', '英语', '尚未确定']))).toThrow();
    let state = emptyLearningState('student');
    const apply = (type, data) => {
      state = applyLearningOperation(state, { id: type + Math.random(), type, data, at: 1 }).state;
    };
    apply('intake.request', { requestId: 'r', modelId: 'm', explicit: true });
    apply('intake.result', {
      requestId: 'r',
      modelId: 'm',
      reply: {
        ...reply(INTAKE_CHOICES),
        message: '你在准备什么？',
        intake: { options: INTAKE_CHOICES, input: true, profile: null }
      }
    });
    apply('intake.request', { requestId: 'r2', modelId: 'm', answer: '考研', explicit: true });
    expect(() => apply('intake.result', { requestId: 'r2', modelId: 'm', reply: profileReply() })).toThrow();
    expect(state.conversations).toHaveLength(0);
    expect(state.intake.reply).toBeNull();
    expect(
      parseIntakeOutput(JSON.stringify(profileReply()), context(['考研', '英语'])).intake.profile.subjects
    ).toEqual(['英语']);
  });
  it('ends after four answers without inventing a profile when direction is still unknown', () => {
    const ctx = context(['考研', '尚未确定', '跳过', '不确定']);
    expect(() => parseIntakeOutput(JSON.stringify(reply()), ctx)).toThrow();
    expect(parseIntakeOutput(JSON.stringify(reply([])), ctx).intake).toEqual({
      options: [],
      input: false,
      profile: null
    });
    const legacy = context(Array(5).fill('跳过'));
    expect(normalizeIntakeContext(legacy)).toEqual(legacy);
    expect(() => parseIntakeOutput(JSON.stringify(reply()), legacy)).toThrow();
    expect(parseIntakeOutput(JSON.stringify(reply([])), legacy).intake).toEqual({
      options: [],
      input: false,
      profile: null
    });
    expect(() => normalizeIntakeContext(context(Array(6).fill('跳过')))).toThrow();
    const prompt = intakeSystemPrompt(context(['考研']));
    expect(prompt).toContain('2–4个选项');
    expect(prompt).toContain('最多4轮');
    expect(prompt).toContain('只回答“考研”不允许生成档案');
  });
  it('has options first, uses only the shared composer, and offers restart when all four answers were unknown', () => {
    setActivePinia(createPinia());
    const store = useConversationLearningStore();
    store.state.intake = { status: 'ready', requestId: 'r', turns: context(['考研']).turns, reply: reply() };
    wrapper = mount(MuseModelIntake, { props: { sharedInput: true } });
    expect(wrapper.findComponent(BaseOptions).exists()).toBe(true);
    expect(wrapper.findAll('input,textarea')).toHaveLength(0);
    store.state.intake.turns = context(['考研', '尚未确定', '跳过', '不确定']).turns;
    return wrapper.vm.$nextTick().then(() => {
      expect(wrapper.text()).toContain('重新选择方向');
      expect(wrapper.findComponent(BaseOptions).exists()).toBe(false);
    });
  });
});
