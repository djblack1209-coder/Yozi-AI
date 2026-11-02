import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  applyLearningOperation,
  emptyLearningState,
  normalizePrivateSyncOperation
} from '@/services/learning/learning-domain.js';
import { REVIEW_REASONS, reviewAdjustmentSuggestion } from '../../laf-backend/functions/_shared/learning-adherence.js';
import {
  reviewBatch,
  learningBehaviors,
  weeklyAdherence,
  learningLeaveOperation
} from '../../src/pages/learning/learning-adherence-view.js';
import { coachDueItem } from '../../laf-backend/functions/_shared/learning-reminders.js';
import { entryObjects } from '../../laf-backend/functions/_shared/learning-entries.js';
import { prepareLearningRestore, prepareGuestMigration } from '@/services/learning/learning-backup.js';
import { createLearningRepository } from '@/services/learning/learning-repository.js';
const NOW = Date.parse('2026-10-22T10:00:00Z'),
  DAY = 86400000;
let state, serial;
function op(type, data, id = `op${++serial}`, at = NOW) {
  const out = applyLearningOperation(state, { id, type, data, at });
  state = out.state;
  return out;
}
function question(id) {
  return {
    id,
    version: 1,
    prompt: '计算 2 + 2。',
    scope: 'private',
    subject: '数学',
    source: { kind: 'executable' },
    validation: { type: 'number', answer: '4', authority: 'executable', evidenceId: 'integer-arithmetic-v1' },
    publishable: false,
    uncertainties: []
  };
}
function addDue(count = 23, { returning = false } = {}) {
  op('conversation.start', { goal: '复习英语写作' }, 'goal', NOW - 20 * DAY);
  for (let i = 0; i < count; i++) {
    const at = NOW - 3 * DAY,
      q = question(`q${i}`);
    op('question.add', { question: q }, `add${i}`, at);
    op('question.focus', { conversationId: 'goal', questionKey: `q${i}@1` }, `focus${i}`, at);
    op('attempt.submit', { conversationId: 'goal', answer: i % 2 ? '4' : '0', explicit: true }, `answer${i}`, at);
    op('review.schedule', { attemptId: `answer${i}`, due: NOW - DAY - i * 1000, rating: 'good' }, `review${i}`, at);
  }
  if (!returning) {
    op('question.add', { question: question('recent') }, 'recent', NOW - 1000);
    op('question.focus', { conversationId: 'goal', questionKey: 'recent@1' }, 'recent-focus', NOW - 1000);
    op('attempt.submit', { conversationId: 'goal', answer: '4', explicit: true }, 'recent-answer', NOW - 1000);
  }
}
function data(questionKey = null) {
  return { owner: state.owner, source: 'plan', conversationId: 'goal', questionKey, reason: null };
}
function startBatch() {
  const batch = reviewBatch(state, NOW, { conversationId: 'goal' });
  return op('review.batch.start', { ...data(), reviewIds: batch.items.map((r) => r.id) }, 'batch');
}
function defer(type = 'review.skip', reviewId = 'review22', reason = 'time_short', at = NOW) {
  return op(
    type,
    {
      ...data(`${reviewId.replace('review', 'q')}@1`),
      reviewId,
      reason,
      ...(type === 'review.reschedule' ? { availableAt: at + 2 * DAY } : {})
    },
    `${reviewId}:${type}`,
    at
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  state = emptyLearningState('u1', 'Asia/Shanghai');
  serial = 0;
});
afterEach(() => vi.useRealTimers());
describe('T3/T4 existing private event stream', () => {
  it('records an unanswered departure once, never after a submitted answer', () => {
    addDue(1);
    expect(learningLeaveOperation(state, 'goal')).toBeNull();
    op('question.focus', { conversationId: 'goal', questionKey: 'q0@1', kind: 'review' }, 'departure-focus');
    const leave = learningLeaveOperation(state, 'goal');
    expect(leave.data.questionKey).toBe('q0@1');
    op(leave.type, leave.data, leave.id);
    expect(learningLeaveOperation(state, 'goal')).toBeNull();
    expect(weeklyAdherence(state, NOW).abandoned).toBe(1);
  });
  it('batches coach library facts and honors skip, chosen item, completion and self-report boundaries', () => {
    op('conversation.start', { goal: '考研写作' }, 'goal', NOW - 20 * DAY);
    state.conversations[0].coach = {
      contract: 'kaoyan-writing-coach-v1',
      profile: { exam: 'english1' },
      days: [],
      library: Array.from({ length: 23 }, (_, i) => ({
        id: `phrase${i}`,
        text: `短语${i}`,
        at: NOW - 2 * DAY,
        due: NOW - DAY,
        reviews: [],
        schedule: null
      })),
      requests: []
    };
    const batch = reviewBatch(state, NOW);
    expect(batch.total).toBe(23);
    expect(batch.items.length).toBeLessThanOrEqual(10);
    expect(batch.items[0].wrongCount).toBe(0);
    const chosen = batch.items[1];
    op('review.open', { ...data(), reviewId: chosen.id }, 'open-phrase');
    expect(coachDueItem(state.conversations[0].coach, NOW, state.events, 'goal').id).toBe(chosen.itemId);
    const first = batch.items[0],
      original = structuredClone(state.conversations[0].coach.library);
    op('review.skip', { ...data(), reviewId: first.id, reason: 'tired' }, 'skip-phrase');
    expect(state.conversations[0].coach.library).toEqual(original);
    expect(coachDueItem(state.conversations[0].coach, NOW, state.events, 'goal').id).not.toBe(first.itemId);
    expect(() =>
      op(
        'coach.review',
        {
          conversationId: 'goal',
          itemId: first.itemId,
          answer: '原答',
          rating: 3,
          explicit: true,
          schedule: { due: new Date(NOW + DAY).toISOString() }
        },
        'early-phrase'
      )
    ).toThrow(/尚未/);
    op(
      'coach.review',
      {
        conversationId: 'goal',
        itemId: chosen.itemId,
        answer: '原答',
        rating: 3,
        explicit: true,
        schedule: { due: new Date(NOW + DAY).toISOString() }
      },
      'complete-phrase'
    );
    expect(weeklyAdherence(state, NOW).completed).toBe(1);
    expect(entryObjects(state, 'Goal', NOW)[0].reviewProgress.numerator).toBe(1);
    expect(state.attempts).toHaveLength(0);
    expect(learningBehaviors(state, NOW).filter((e) => e.action === 'review.opened')).toHaveLength(1);
  });
  it('continues to expose pending coach facts in the existing Goal view without forging reliable wrong counts', () => {
    op('conversation.start', { goal: '考研写作' }, 'goal', NOW - 20 * DAY);
    state.conversations[0].coach = { library: [{ id: 'phrase', at: NOW - 5 * DAY, due: NOW - DAY, reviews: [] }] };
    expect(reviewBatch(state, NOW).returning).toBe(true);
    expect(weeklyAdherence(state, NOW).due).toBe(1);
    expect(weeklyAdherence(state, NOW).denominator).toBeNull();
  });

  it('splits 23 due items into 10, oldest due first, without invented mastery', () => {
    addDue();
    const batch = reviewBatch(state, NOW);
    expect(batch.total).toBe(23);
    expect(batch.items).toHaveLength(10);
    expect(batch.remaining).toBe(13);
    expect(batch.items[0].id).toBe('review22');
    expect(batch.items[0]).not.toHaveProperty('mastery');
    startBatch();
    expect(reviewBatch(state, NOW).batchSize).toBe(10);
  });
  it('uses repeated reliable wrong evidence to break equal-due ties', () => {
    addDue(2);
    state.reviews.forEach((r) => (r.due = NOW - DAY));
    expect(reviewBatch(state, NOW).items.map((r) => r.id)).toEqual(['review0', 'review1']);
  });
  it('offers a light first class after two missed calendar days', () => {
    addDue(23, { returning: true });
    const batch = reviewBatch(state, NOW);
    expect(batch.returning).toBe(true);
    expect(batch.items).toHaveLength(3);
  });
  it.each(['review.skip', 'review.reschedule'])(
    '%s stores coded reason and reduces work without scores or FSRS mutations',
    (type) => {
      addDue();
      startBatch();
      const attempts = structuredClone(state.attempts),
        reviews = structuredClone(state.reviews),
        goals = structuredClone(state.conversations);
      const outcome = defer(type);
      expect(outcome.result).toMatchObject({ nextLimit: 5, ratingChanged: false });
      expect(state.attempts).toEqual(attempts);
      expect(state.reviews).toEqual(reviews);
      expect(state.conversations).toEqual(goals);
      expect(reviewBatch(state, NOW).limit).toBe(5);
      expect(reviewBatch(state, NOW).items.some((r) => r.id === 'review22')).toBe(false);
      expect(state.events.at(-1)).toMatchObject({
        owner: 'u1',
        at: NOW,
        source: 'plan',
        conversationId: 'goal',
        questionKey: 'q22@1',
        reason: 'time_short'
      });
      expect(state.events.at(-1).data.reason).toBe('time_short');
      expect(defer(type).reused).toBe(true);
    }
  );
  it('rejects changed payloads on repeat ids', () => {
    addDue();
    defer();
    expect(() => defer('review.skip', 'review22', 'tired')).toThrow(/同一操作/);
  });
  it('rejects PII text and arbitrary extra fields instead of logging them', () => {
    addDue();
    expect(() => defer('review.skip', 'review22', '电话13800138000')).toThrow(/请选择原因/);
    expect(() => op('learning.leave', { ...data(), reason: 'unspecified', body: 'private' })).toThrow(/正文/);
    expect(Object.keys(REVIEW_REASONS)).toContain('unspecified');
  });
  it('rejects early, foreign, completed, stopped or invalid rescheduling', () => {
    addDue();
    expect(() => op('review.skip', { ...data('q22@1'), owner: 'u2', reviewId: 'review22', reason: 'tired' })).toThrow(
      /账户/
    );
    expect(() => defer('review.reschedule', 'review22', 'later', NOW - 40 * DAY)).toThrow();
    op('task.stop', { conversationId: 'goal' });
    expect(() => defer()).toThrow(/暂停/);
  });
  it('projects only confirmed actions; question, answer and hint facts are reused', () => {
    addDue(1);
    op('question.focus', { conversationId: 'goal', questionKey: 'q0@1', kind: 'review' }, 'open');
    op('hint.add', { conversationId: 'goal', level: 1, content: '请先想想' }, 'hint');
    const before = JSON.stringify(state);
    const behaviors = learningBehaviors(state, NOW);
    expect(behaviors.some((e) => e.id === 'open' && e.action === 'question.presented')).toBe(true);
    expect(behaviors.some((e) => e.action === 'review.opened')).toBe(true);
    expect(behaviors.some((e) => e.id === 'hint' && e.action === 'help.viewed')).toBe(true);
    expect(behaviors.filter((e) => e.action === 'answer.submitted')).toHaveLength(2);
    expect(
      behaviors.every(
        (e) =>
          e.owner === 'u1' &&
          Object.hasOwn(e, 'reason') &&
          Object.hasOwn(e, 'questionKey') &&
          !Object.hasOwn(e, 'content')
      )
    ).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
  });
  it('counts review completion once and writes a read-only view to the owning Goal object', () => {
    addDue(1);
    op('question.focus', { conversationId: 'goal', questionKey: 'q0@1', kind: 'review' }, 'open');
    op('attempt.submit', { conversationId: 'goal', answer: '4', explicit: true }, 'completed');
    const before = JSON.stringify(state),
      goal = entryObjects(state, 'Goal', NOW)[0];
    expect(goal.reviewProgress).toMatchObject({ numerator: 1, denominator: 1, rate: 1 });
    expect(goal.reviewProgress.log.filter((e) => e.action === 'goal.progress')).toHaveLength(1);
    expect(weeklyAdherence(state, NOW).completed).toBe(1);
    expect(reviewBatch(state, NOW).total).toBe(0);
    expect(JSON.stringify(state)).toBe(before);
    expect(state.events.filter((e) => e.type === 'goal.revise')).toHaveLength(0);
  });
  it('pending review answers are completion behavior, not reliable grade or mastery', () => {
    addDue(1);
    op('question.focus', { conversationId: 'goal', questionKey: 'q0@1', kind: 'review' });
    op('attempt.submit', { conversationId: 'goal', answer: '不确定', explicit: true }, 'pending');
    expect(learningBehaviors(state, NOW).filter((e) => e.action === 'review.completed')).toHaveLength(1);
    expect(state.reviews[0].rating).toBe('good');
  });
  it('weekly summaries count skip, reschedule, leave and local hours, keeping unknown denominator null', () => {
    addDue();
    defer();
    defer('review.reschedule', 'review21');
    op('learning.leave', { ...data('recent@1'), source: 'conversation', reason: null }, 'left');
    const before = JSON.stringify(state),
      week = weeklyAdherence(state, NOW);
    expect(week).toMatchObject({
      from: '2026-10-19',
      to: '2026-10-25',
      completed: 0,
      skipped: 1,
      rescheduled: 1,
      abandoned: 1,
      denominator: null,
      rate: null,
      timezone: 'Asia/Shanghai'
    });
    expect(week.hours['18']).toBe(26);
    expect(JSON.stringify(state)).toBe(before);
  });
  it('empty and imported histories keep unknown denominators null', () => {
    expect(weeklyAdherence(state, NOW).denominator).toBeNull();
    op('conversation.start', { goal: '英语' }, 'goal');
    expect(entryObjects(state, 'Goal', NOW)[0].reviewProgress.denominator).toBeNull();
  });
  it('never includes another account or conversation in projections', () => {
    addDue();
    expect(() => weeklyAdherence(state, NOW, { owner: 'u2' })).toThrow(/账户/);
    expect(() => reviewBatch(state, NOW, { owner: 'u2' })).toThrow(/账户/);
    op('conversation.start', { goal: '另一个目标' }, 'other');
    expect(weeklyAdherence(state, NOW, { conversationId: 'other' }).due).toBe(0);
    expect(reviewBatch(state, NOW, { conversationId: 'other' }).items).toHaveLength(0);
  });
  it('restores and normalizes behaviors using the existing sync/replay contract', () => {
    addDue(2);
    startBatch();
    defer('review.skip', 'review1');
    let replay = emptyLearningState('u1', 'Asia/Shanghai');
    for (const e of state.events) replay = applyLearningOperation(replay, normalizePrivateSyncOperation(e)).state;
    expect(replay).toEqual(state);
    expect(
      prepareLearningRestore(emptyLearningState('u1'), JSON.stringify(state), { now: NOW }).state.events.at(-1).data
        .reason
    ).toBe('time_short');
    expect(() => prepareLearningRestore(emptyLearningState('u2'), JSON.stringify(state), { now: NOW })).toThrow(
      /同一账户/
    );
  });
  it('explicit guest migration rebinds behavior ownership; ordinary restore cannot', () => {
    state = emptyLearningState('guest', 'Asia/Shanghai');
    addDue(2);
    defer('review.skip', 'review1');
    const restored = prepareGuestMigration(emptyLearningState('u1', 'Asia/Shanghai'), state, { now: NOW });
    expect(restored.state.events.find((e) => e.type === 'review.skip').data.owner).toBe('u1');
  });
  it('privacy deletion removes associated reasons, batch ids and Goal progress sources', () => {
    addDue(1);
    op(
      'material.add',
      { material: { id: 'm', fingerprint: 'fp', segments: [{ id: 's', content: 'private' }] } },
      'material'
    );
    // Synthetic source association, as if this question came from the private document.
    state.questions[0].source = { kind: 'material', materialId: 'm' };
    defer('review.skip', 'review0', 'too_hard');
    op('material.delete', { materialId: 'm', materialIds: ['m'], questionKeys: ['q0@1'] }, 'delete');
    expect(state.events.find((e) => e.id === 'review0:review.skip').type).toBe('privacy.redacted');
    expect(learningBehaviors(state, NOW).some((e) => e.reason === 'too_hard')).toBe(false);
    expect(entryObjects(state, 'Goal', NOW)[0].reviewProgress.numerator).toBe(0);
  });
  it('repository keeps writes isolated and duplicate commits leave revision unchanged', () => {
    addDue(2);
    const cache = new Map();
    cache.set('conversation_learning_v1', state);
    const repo = createLearningRepository(
      {
        get: (k, d) => cache.get(k) ?? d,
        save: (k, v) => {
          cache.set(k, v);
          return true;
        },
        remove: (k) => cache.delete(k)
      },
      () => 'u1'
    );
    const operation = {
      id: 'saved',
      type: 'review.skip',
      at: NOW,
      data: { ...data('q1@1'), reviewId: 'review1', reason: 'tired' }
    };
    repo.commit(operation);
    const before = repo.read().revision;
    expect(repo.commit(operation).reused).toBe(true);
    expect(repo.read().revision).toBe(before);
    expect(repo.read().events.at(-1).data.reason).toBe('tired');
  });
  it('requires 14 days of repeated noncompletion before producing a pending Idea; never revises Goal', () => {
    addDue(3, { returning: true });
    // Time travel uses original recorded due facts and separate deferrals across three weeks.
    state.reviews.forEach((r) => (r.due = NOW - 20 * DAY));
    defer('review.skip', 'review0', 'tired', NOW - 16 * DAY);
    defer('review.skip', 'review1', 'tired', NOW - 8 * DAY);
    defer('review.skip', 'review2', 'tired', NOW - 2 * DAY);
    expect(reviewAdjustmentSuggestion(state, 'goal', NOW)).not.toBeNull();
    const before = state.conversations[0].goal;
    op('review.idea.suggest', data(), 'idea');
    expect(entryObjects(state, 'Idea', NOW)[0]).toMatchObject({
      id: 'idea',
      status: 'pending',
      conversationId: 'goal'
    });
    op('idea.update', { conversationId: 'goal', ideaId: 'idea', action: 'keep', explicit: true }, 'idea-keep');
    expect(entryObjects(state, 'Idea', NOW)[0].status).toBe('kept');
    expect(state.conversations[0].goal).toBe(before);
  });
  it('does not infer long-term failure from a single missed review', () => {
    addDue();
    defer();
    expect(reviewAdjustmentSuggestion(state, 'goal', NOW)).toBeNull();
    expect(() => op('review.idea.suggest', data(), 'idea')).toThrow(/长期/);
  });
});
