import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import MuseErrorReview from '@/components/business/learning/muse-error-review.vue';
import BaseInput from '@/components/base/base-input/base-input.vue';
import { workspaceDrafts } from '@/services/learning/workspace-drafts.js';
import { COACH_RECALL_CONTRACT, coachErrorReviews } from '../../laf-backend/functions/_shared/learning-coach-review.js';
import { reviewFacts } from '../../laf-backend/functions/_shared/learning-adherence.js';
import { applyLearningOperation, summarizeLearning } from '@/services/learning/learning-domain.js';
import {
  coachInputFor,
  normalizeCoachRequest,
  coachAssessmentTask,
  coachInferenceContext,
  coachAssessmentCounts,
  WRITING_COACH_CONTRACT
} from '../../laf-backend/functions/_shared/learning-writing-coach.js';
import { coachSavedRecords } from '../../laf-backend/functions/_shared/learning-coach-records.js';
import { progressBoundaryFixture } from '../fixtures/learning-progress.js';

const AT = Date.parse('2026-10-30T03:00:00Z');
const harness = vi.hoisted(() => ({ store: null }));
vi.mock('@/stores/modules/conversation-learning.js', () => ({ useConversationLearningStore: () => harness.store }));
export function errorReviewFixture() {
  const state = progressBoundaryFixture(1, 0),
    coach = state.conversations[0].coach,
    day = coach.days[0];
  coach.contract = WRITING_COACH_CONTRACT;
  coach.materialIds = [];
  Object.assign(day.pack.cards[0], {
    kind: 'collocation',
    prompt: '请补全句子：They work ___ accordance with the policy.'
  });
  day.answers[0].answer = 'On';
  const feedback = day.feedback['card-card0'];
  feedback.weaknesses = ['介词搭配'];
  feedback.weaknessEvidence = [{ label: '介词搭配', quote: 'On', classification: 'error' }];
  feedback.dimensions = [{ name: '搭配', score: 1, evidence: ['On'], comment: '合成错误反馈' }];
  Object.assign(coach.requests[0].request, {
    contract: WRITING_COACH_CONTRACT,
    exam: 'english2',
    task: day.pack.cards[0].prompt,
    input: 'On',
    sources: []
  });
  return state;
}
function operation(state, type, data, id = type) {
  return applyLearningOperation(state, {
    id,
    type,
    at: AT,
    data: { conversationId: 'writing', explicit: true, ...data }
  }).state;
}
function submitted(state = errorReviewFixture()) {
  return operation(
    state,
    'coach.errorAnswer',
    { reviewId: coachErrorReviews(state, AT)[0].id, answer: 'in' },
    'new-original'
  );
}
function requested(state = submitted()) {
  const coach = state.conversations[0].coach;
  const request = normalizeCoachRequest({
    contract: WRITING_COACH_CONTRACT,
    phase: 'feedback',
    target: 'error-review',
    exam: 'english2',
    day: '2026-10-30',
    sources: [],
    feedbackVersion: 2,
    dimensionContract: 'writing-dimensions-v1',
    ...coachInputFor(coach, coach.days[0], 'feedback', 'error-review')
  });
  return operation(
    state,
    'coach.request',
    { requestId: 'retry-feedback', request, modelId: 'synthetic-model', binding: 'synthetic-binding' },
    'new-request'
  );
}
function assessed(state = requested(), patch = {}) {
  return operation(
    state,
    'coach.result',
    {
      requestId: 'retry-feedback',
      output: {
        kind: 'feedback',
        target: 'error-review',
        feedbackVersion: 2,
        lines: [{ original: 'in', advice: '合成核对结果', rewrite: 'in' }],
        weaknesses: [],
        weaknessEvidence: [],
        strengths: [],
        strengthEvidence: [],
        phrases: [],
        dimensions: [{ name: '搭配', score: 2, evidence: ['in'], comment: '合成达成反馈' }],
        ...patch
      }
    },
    'new-receipt'
  );
}

describe('saved grading errors are traceable review queue items', () => {
  it('projects an immediate, persistent item without changing originals or inventing grades', () => {
    const state = errorReviewFixture(),
      before = JSON.stringify(state);
    const [row] = coachErrorReviews(state, AT);
    expect(row).toMatchObject({
      kind: 'coach_error',
      sourceFeedbackId: 'receipt-0',
      sourceRequestId: 'request-0',
      sourceAnswerId: 'writing-answer-0',
      sourceDay: '2026-10-30',
      original: 'On',
      labels: ['介词搭配'],
      completedBy: null,
      dimensions: ['搭配']
    });
    expect(coachErrorReviews(state, AT + 86400000)[0]).toEqual(row);
    expect(reviewFacts(state, AT)).toContainEqual(row);
    expect(summarizeLearning(state, AT).due).not.toContain(undefined);
    expect(JSON.stringify(state)).toBe(before);
  });
  it('does not use suggestions, uncertainty, superseded feedback, missing receipts or other conversations', () => {
    for (const classification of ['suggestion', 'uncertain']) {
      const state = errorReviewFixture();
      state.conversations[0].coach.days[0].feedback['card-card0'].weaknessEvidence[0].classification = classification;
      expect(coachErrorReviews(state, AT)).toEqual([]);
    }
    const state = errorReviewFixture();
    expect(coachErrorReviews(state, AT, 'math')).toEqual([]);
    state.events.find((event) => event.id === 'receipt-0').data.conversationId = 'math';
    expect(coachErrorReviews(state, AT)).toEqual([]);
  });
  it('binds a diagnostic assessed on a later day and excludes a short quote shared by two original answers', () => {
    const state = errorReviewFixture(),
      coach = state.conversations[0].coach,
      day = coach.days[0];
    coach.diagnostic = { cards: day.pack.cards, answers: day.answers, feedback: { ...day.feedback['card-card0'] } };
    delete coach.diagnostic.feedback.id;
    coach.requests[0].request.target = 'diagnostic';
    coach.requests[0].request.day = '2026-10-31';
    day.feedback = {};
    expect(coachErrorReviews(state, AT)[0]).toMatchObject({ sourceTarget: 'diagnostic', sourceDay: '2026-10-30' });
    coach.diagnostic.answers.push({ ...coach.diagnostic.answers[0], id: 'ambiguous' });
    expect(coachErrorReviews(state, AT)).toEqual([]);
  });
  it('queues a paragraph error and retires it only when a separately typed full submission has matching successful feedback', () => {
    const state = errorReviewFixture(),
      coach = state.conversations[0].coach,
      day = coach.days[0];
    const original = day.answers[0],
      feedback = day.feedback['card-card0'];
    day.drafts = [{ id: original.id, text: 'On', at: original.at }];
    state.events.find((event) => event.id === original.id).type = 'coach.paragraph';
    day.answers = [];
    day.feedback = { 'paragraph-0': feedback };
    coach.requests[0].request.target = 'paragraph-0';
    expect(coachErrorReviews(state, AT)[0]).toMatchObject({ sourceTarget: 'paragraph-0', completedBy: null });
    day.rewrites = [{ id: 'typed-paragraph', text: 'A corrected paragraph.', authorship: 'user_typed' }];
    day.essay = {
      id: 'full-receipt',
      feedbackVersion: 2,
      weaknessEvidence: [],
      dimensions: [{ name: '搭配', score: 2 }]
    };
    coach.requests.push({
      id: 'full-request',
      status: 'completed',
      resultId: 'full-receipt',
      request: { target: 'essay', input: 'A corrected paragraph.' }
    });
    state.events.push({
      id: 'full-receipt',
      type: 'coach.result',
      at: AT,
      data: { conversationId: 'writing', requestId: 'full-request' }
    });
    expect(coachErrorReviews(state, AT)[0].completedBy).toBe('full-receipt');
    delete day.rewrites[0].authorship;
    expect(coachErrorReviews(state, AT)[0].completedBy).toBeNull();
  });
  it('an incidental short word inside another answer cannot steal a complete cloze answer', () => {
    const state = errorReviewFixture(),
      coach = state.conversations[0].coach,
      day = coach.days[0];
    coach.diagnostic = {
      cards: day.pack.cards,
      answers: [
        ...day.answers,
        { id: 'long-analysis', cardId: 'analysis', answer: 'On the basis of the full analysis.' }
      ],
      feedback: { ...day.feedback['card-card0'] }
    };
    coach.requests[0].request.target = 'diagnostic';
    day.feedback = {};
    expect(coachErrorReviews(state, AT)[0].sourceAnswerId).toBe('writing-answer-0');
  });
  it('keeps original and new answers separate, requires explicit submission, and binds the checked source task', () => {
    const original = errorReviewFixture(),
      preserved = JSON.stringify(original.conversations[0].coach.days);
    const state = submitted(original),
      coach = state.conversations[0].coach;
    expect(JSON.stringify(coach.days)).toBe(preserved);
    expect(coach.errorReviews[0]).toMatchObject({
      answer: 'in',
      sourceAnswerId: 'writing-answer-0',
      sourceFeedbackId: 'receipt-0',
      feedback: null
    });
    expect(
      coachAssessmentTask({ phase: 'feedback', target: 'error-review', task: coach.errorReviews[0].task })
    ).toMatchObject({ kind: 'cloze', selectedSentence: 'They work in accordance with the policy.' });
    expect(coachErrorReviews(state, AT)[0].completedBy).toBeNull();
    expect(() =>
      operation(
        state,
        'coach.errorAnswer',
        { reviewId: coachErrorReviews(state, AT)[0].id, answer: 'in' },
        'duplicate-answer'
      )
    ).toThrow('请先完成已提交重练的反馈');
    expect(() =>
      applyLearningOperation(original, {
        id: 'implicit',
        type: 'coach.errorAnswer',
        at: AT,
        data: { conversationId: 'writing', reviewId: coachErrorReviews(original, AT)[0].id, answer: 'in' }
      })
    ).toThrow('明确提交');
  });
  it('keeps a cloze retry within its original word-level scope without rewriting the saved task or receipt', () => {
    const state = requested(),
      request = state.conversations[0].coach.requests.at(-1).request;
    const saved = JSON.stringify(state);
    expect(JSON.parse(coachInferenceContext(request).task)).toMatchObject({
      kind: 'cloze',
      category: 'collocation',
      selectedSentence: 'They work in accordance with the policy.'
    });
    expect(JSON.parse(request.task)).not.toHaveProperty('category');
    expect(JSON.stringify(state)).toBe(saved);
  });
  it('closes only after matching new feedback reaches the originally failed dimension; no mastery claim', () => {
    const state = assessed();
    expect(coachErrorReviews(state, AT)[0]).toMatchObject({
      completedBy: 'new-receipt',
      sourceFeedbackId: 'receipt-0'
    });
    expect(coachErrorReviews(state, AT - 1)[0].completedBy).toBeNull();
    expect(coachAssessmentCounts(state.conversations[0].coach)).toMatchObject({
      submitted: 2,
      assessed: 2,
      pending: 0
    });
    expect(coachSavedRecords(state.conversations[0]).find((row) => row.key === 'new-original')).toMatchObject({
      answer: 'in',
      title: '错因重练',
      sourceAnswerId: 'writing-answer-0',
      feedback: { id: 'new-receipt' }
    });
    expect(state.conversations[0].coach.days[0].answers[0].answer).toBe('On');
  });
  it.each([
    [false, 'good', 3],
    [true, 'hard', 1]
  ])('creates a dated recall after a new graded answer (reference shown: %s)', (referenceShown, rating, days) => {
    const initial = errorReviewFixture();
    const [before] = coachErrorReviews(initial, AT);
    const recalled = operation(
      initial,
      'coach.errorAnswer',
      { reviewId: before.id, answer: 'in', recallContract: COACH_RECALL_CONTRACT, referenceShown },
      'new-original'
    );
    const due = AT + days * 86400000;
    const rows = coachErrorReviews(assessed(requested(recalled)), AT);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: before.id,
      completedBy: 'new-receipt',
      recall: { rating, due }
    });
    expect(rows[1]).toMatchObject({
      id: 'coach-recall:new-original',
      availableAt: due,
      completedBy: null,
      sourceAnswerId: before.sourceAnswerId
    });
  });
  it('retains the item when the new error remains, the failed dimension is null, or a judgment is uncertain', () => {
    for (const patch of [
      {
        weaknesses: ['仍待重练'],
        weaknessEvidence: [{ label: '仍待重练', quote: 'in', classification: 'error' }],
        dimensions: [{ name: '搭配', score: 1, evidence: ['in'], comment: '合成仍未达成' }]
      },
      {
        dimensions: [
          { name: '搭配', score: null, evidence: [], comment: '证据不足' },
          { name: '语法', score: 2, evidence: ['in'], comment: '另一维不替代原维' }
        ]
      },
      { weaknessEvidence: [{ label: '待核对', quote: 'in', classification: 'uncertain' }] }
    ])
      expect(coachErrorReviews(assessed(requested(), patch), AT)[0].completedBy).toBeNull();
  });
  it('rejects an unrelated attempt identity, stopped goal, or deferred item without changing history', () => {
    const state = submitted(),
      coach = state.conversations[0].coach;
    const request = normalizeCoachRequest({
      contract: WRITING_COACH_CONTRACT,
      phase: 'feedback',
      target: 'error-review',
      exam: 'english2',
      day: '2026-10-30',
      sources: [],
      ...coachInputFor(coach, coach.days[0], 'feedback', 'error-review'),
      errorReviewId: 'someone-else'
    });
    expect(() =>
      operation(state, 'coach.request', { requestId: 'bad', request, modelId: 'synthetic', binding: 'synthetic' })
    ).toThrow('重练原答已变化');
    const stopped = errorReviewFixture();
    stopped.conversations[0].stopped = true;
    expect(() => submitted(stopped)).toThrow('已停止');
    const deferred = errorReviewFixture(),
      reviewId = coachErrorReviews(deferred, AT)[0].id;
    deferred.events.push({
      id: 'defer',
      type: 'review.skip',
      at: AT,
      data: { conversationId: 'writing', reviewId },
      result: { availableAt: AT + 86400000 }
    });
    expect(() => submitted(deferred)).toThrow('待重练错误已变化');
  });
});

describe('error review uses its own explicit answer and device draft', () => {
  beforeEach(() => {
    uni.clearStorageSync();
    harness.store = reactive({
      state: errorReviewFixture(),
      get active() {
        return this.state.conversations[0];
      },
      recordContext() {
        return this.state.owner + ':epoch';
      },
      calendarTime: AT,
      busy: false,
      sharingAllowed: false,
      requestCoach: vi.fn(async () => ({ success: false })),
      coachSave: vi.fn((type, data) => {
        harness.store.state = operation(harness.store.state, `coach.${type}`, data, 'ui-original');
      })
    });
  });
  const render = () =>
    mount(MuseErrorReview, { props: { conversationId: 'writing' }, global: { stubs: { MuseFeedbackCard: true } } });
  const tap = async (wrapper, label) => {
    const button = wrapper.findAll('button').find((node) => node.text() === label);
    expect(button).toBeDefined();
    await button.trigger('tap');
    await flushPromises();
  };
  it('opens read-only source evidence without upload; explicit submission stores a new answer without changing the main composer', async () => {
    const store = harness.store,
      drafts = workspaceDrafts(store);
    const key = 'coach:writing:2026-10-30';
    drafts.save(store.recordContext(), key, { answer: 'Unsubmitted main composer' });
    const wrapper = render();
    await tap(wrapper, '开始重练');
    expect(wrapper.text()).not.toContain('上次原答On');
    await tap(wrapper, '查看上次原答');
    expect(wrapper.text()).toContain('On');
    expect(store.coachSave).not.toHaveBeenCalled();
    expect(store.requestCoach).not.toHaveBeenCalled();
    wrapper.getComponent(BaseInput).vm.$emit('update:modelValue', 'in');
    await flushPromises();
    await tap(wrapper, '提交重练');
    expect(store.coachSave).toHaveBeenCalledExactlyOnceWith('errorAnswer', expect.objectContaining({ answer: 'in' }));
    expect(store.requestCoach).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('重练原答已保存');
    expect(drafts.read(store.recordContext(), key).answer).toBe('Unsubmitted main composer');
    expect(store.active.coach.days[0].answers[0].answer).toBe('On');
    wrapper.unmount();
  });
  it('restores only the current owner draft on reopen and clears it on account change without a learning write', async () => {
    const first = render();
    await tap(first, '开始重练');
    first.getComponent(BaseInput).vm.$emit('update:modelValue', 'Private unsubmitted retry');
    await flushPromises();
    first.unmount();
    const reopened = render();
    await flushPromises();
    expect(reopened.getComponent(BaseInput).props('modelValue')).toBe('Private unsubmitted retry');
    harness.store.state = { ...errorReviewFixture(), owner: 'another-owner' };
    await flushPromises();
    expect(reopened.text()).not.toContain('Private unsubmitted retry');
    await tap(reopened, '开始重练');
    expect(reopened.getComponent(BaseInput).props('modelValue')).toBe('');
    expect(harness.store.coachSave).not.toHaveBeenCalled();
    reopened.unmount();
  });
  it('a calendar refresh keeps an open blank editor and typed draft without a learning write', async () => {
    const wrapper = render();
    await tap(wrapper, '开始重练');
    harness.store.calendarTime += 60000;
    await flushPromises();
    expect(wrapper.findComponent(BaseInput).exists()).toBe(true);
    wrapper.getComponent(BaseInput).vm.$emit('update:modelValue', 'in');
    await flushPromises();
    harness.store.calendarTime += 60000;
    await flushPromises();
    expect(wrapper.getComponent(BaseInput).props('modelValue')).toBe('in');
    expect(harness.store.coachSave).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('does not use an unrelated closed request while the calendar is older than the newly saved answer', async () => {
    const store = harness.store;
    store.sharingAllowed = true;
    store.active.coach.requests.push({
      id: 'unrelated-closed',
      status: 'closed',
      request: { phase: 'feedback', target: 'analysis' }
    });
    store.coachSave.mockImplementation((type, data) => {
      store.state = operation(store.state, `coach.${type}`, data, 'newer-original');
      store.active.coach.errorReviews[0].at = AT + 1000;
      store.state.events.at(-1).at = AT + 1000;
    });
    const wrapper = render();
    await tap(wrapper, '开始重练');
    wrapper.getComponent(BaseInput).vm.$emit('update:modelValue', 'in');
    await flushPromises();
    await tap(wrapper, '提交重练');
    expect(store.requestCoach).toHaveBeenCalledExactlyOnceWith('feedback', 'error-review', null);
    expect(wrapper.text()).toContain('重练原答已保存');
    wrapper.unmount();
  });
});
