import { coachErrorReviews } from './learning-coach-review.js';
import { libraryItemPaused } from './learning-writing-corpus.js';
// Read-only views over the existing private event stream. No network, grades or BKT estimates.
export const REVIEW_REASONS = Object.freeze({
  time_short: '今天时间不够',
  tired: '今天需要休息',
  too_hard: '想先练简单一点',
  later: '换个时间复习',
  unspecified: '暂不说明'
});
export const ADHERENCE_EVENTS = [
  'review.open',
  'review.batch.start',
  'review.skip',
  'review.reschedule',
  'learning.leave',
  'review.idea.suggest'
];
const DAY = 86400000;
const grade = (a) => a.corrections?.at(-1)?.grade || a.grade;
const keyOf = (q) => `${q.id}@${q.version}`;
const date = (at, zone) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(at);
  return ['year', 'month', 'day'].map((k) => parts.find((p) => p.type === k).value).join('-');
};
function scope(state, owner, conversationId) {
  if (owner !== state.owner) throw Object.assign(new Error('账户已变化'), { code: 'OWNER_MISMATCH' });
  if (conversationId && !state.conversations.some((c) => c.id === conversationId))
    throw Object.assign(new Error('目标不存在'), { code: 'NOT_FOUND' });
}
export function reviewFacts(state, at = Date.now(), { owner = state.owner, conversationId } = {}) {
  scope(state, owner, conversationId);
  const rows = [];
  rows.push(...coachErrorReviews(state, at, conversationId));
  // Coach phrase reviews already have their own FSRS facts. Reuse their saved cycles.
  for (const c of state.conversations.filter((c) => !conversationId || c.id === conversationId)) {
    for (const item of c.coach?.library || []) {
      let due = item.at + DAY;
      for (const completed of [...(item.reviews || []), null]) {
        if (completed && completed.at > at) break;
        if (!completed) due = item.due;
        const id = coachReviewId(item.id, due);
        const deferred = state.events
          .filter(
            (e) =>
              ['review.skip', 'review.reschedule'].includes(e.type) &&
              e.data.conversationId === c.id &&
              e.data.reviewId === id &&
              e.at <= at
          )
          .at(-1);
        rows.push({
          id,
          questionKey: null,
          itemId: item.id,
          kind: 'coach',
          due,
          cancelled: !completed && libraryItemPaused(item, at),
          conversationId: c.id,
          completedBy: completed?.id || null,
          completedAt: completed?.at || null,
          availableAt: Math.max(due, deferred?.result.availableAt || due),
          wrongCount: 0
        });
        if (completed) {
          const next = state.events.find((e) => e.id === completed.id && e.type === 'coach.review')?.data.schedule?.due;
          if (!Number.isFinite(Date.parse(next))) break;
          due = Date.parse(next);
        }
      }
    }
  }
  for (const r of state.reviews) {
    const origin = state.attempts.find((a) => a.id === r.attemptId);
    if (
      !origin ||
      grade(origin)?.status !== 'reliable' ||
      !state.questions.some((q) => keyOf(q) === r.questionKey) ||
      (conversationId && origin.conversationId !== conversationId)
    )
      continue;
    const completed = state.attempts.find(
      (a) =>
        a.kind === 'review' &&
        a.conversationId === origin.conversationId &&
        a.questionKey === r.questionKey &&
        a.at >= r.due &&
        a.at <= at &&
        a.id !== origin.id
    );
    const deferred = state.events
      .filter((e) => ['review.skip', 'review.reschedule'].includes(e.type) && e.data.reviewId === r.id && e.at <= at)
      .at(-1);
    rows.push({
      ...r,
      conversationId: origin.conversationId,
      completedBy: completed?.id || null,
      completedAt: completed?.at || null,
      availableAt: Math.max(r.due, deferred?.result.availableAt || r.due),
      wrongCount: state.attempts.filter(
        (a) => a.questionKey === r.questionKey && grade(a)?.status === 'reliable' && grade(a).outcome === 'wrong'
      ).length
    });
  }
  return rows;
}
export function reviewLimit(state, conversationId, at) {
  const today = date(at, state.timezone);
  const lastAttempt = [
    ...state.attempts.filter((a) => a.conversationId === conversationId),
    ...state.events.filter(
      (e) =>
        e.data.conversationId === conversationId && ['coach.answer', 'coach.paragraph', 'coach.review'].includes(e.type)
    )
  ]
    .filter((a) => a.at <= at)
    .sort((a, b) => a.at - b.at)
    .at(-1);
  const lastAt = lastAttempt?.at ?? state.conversations.find((c) => c.id === conversationId)?.at;
  const gap = lastAt ? (Date.parse(today) - Date.parse(date(lastAt, state.timezone))) / DAY : 0;
  const returning = gap >= 2;
  const deferred = state.events
    .filter(
      (e) =>
        ['review.skip', 'review.reschedule'].includes(e.type) &&
        e.data.conversationId === conversationId &&
        date(e.at, state.timezone) === today
    )
    .at(-1);
  const limit = Math.min(returning ? 3 : 10, deferred?.result.nextLimit || 10);
  return { limit, returning };
}
export function reviewGoalProgress(state, conversationId, at = Date.now()) {
  const rows = reviewFacts(state, at, { conversationId });
  const due = rows.filter((r) => r.due <= at && (!r.cancelled || r.completedBy));
  const numerator = due.filter((r) => r.completedBy).length;
  const log = [
    ...due
      .filter((r) => r.completedBy)
      .map((r) => ({
        id: `${r.id}:goal`,
        owner: state.owner,
        at: r.completedAt,
        source: r.kind?.startsWith('coach') ? 'coach' : 'learning',
        conversationId,
        questionKey: r.questionKey,
        reason: null,
        action: 'goal.progress',
        evidenceId: r.completedBy
      })),
    ...state.events
      .filter(
        (e) =>
          ['review.skip', 'review.reschedule'].includes(e.type) &&
          e.data.conversationId === conversationId &&
          e.at <= at
      )
      .map((e) => ({
        id: e.id,
        owner: state.owner,
        at: e.at,
        source: e.data.source,
        conversationId,
        questionKey: e.data.questionKey,
        reason: e.data.reason,
        action: e.type === 'review.skip' ? 'review.skipped' : 'review.rescheduled'
      }))
  ].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  return { numerator, denominator: due.length || null, rate: due.length ? numerator / due.length : null, log };
}
export function reviewAdjustmentSuggestion(state, conversationId, at = Date.now()) {
  const deferrals = state.events.filter(
    (e) =>
      e.data.conversationId === conversationId &&
      ['review.skip', 'review.reschedule'].includes(e.type) &&
      e.at <= at &&
      at - e.at <= 28 * DAY
  );
  const days = new Set(deferrals.map((e) => date(e.at, state.timezone)));
  if (
    days.size < 3 ||
    at - Math.min(...deferrals.map((e) => e.at)) < 14 * DAY ||
    reviewFacts(state, at, { conversationId }).some((r) => r.completedAt && at - r.completedAt < 14 * DAY)
  )
    return null;
  return {
    text: '最近两周复习比较吃力，可以试着把每日复习量调小。是否保留这个想法？',
    evidenceIds: deferrals.map((e) => e.id)
  };
}
export function applyAdherenceOperation(state, op, { assert }) {
  const d = op.data,
    c = state.conversations.find((c) => c.id === d.conversationId);
  const common = ['owner', 'source', 'conversationId', 'questionKey', 'reason'];
  const extra =
    op.type === 'review.batch.start'
      ? ['reviewIds']
      : ['review.skip', 'review.reschedule', 'review.open'].includes(op.type)
        ? ['reviewId', 'availableAt']
        : [];
  assert(
    Object.keys(d).every((k) => [...common, ...extra].includes(k)),
    'FORBIDDEN',
    '行为记录不能包含正文或额外字段'
  );
  assert(d.owner === state.owner, 'OWNER_MISMATCH', '账户已变化');
  assert(
    c &&
      ['plan', 'review', 'conversation'].includes(d.source) &&
      Object.hasOwn(d, 'questionKey') &&
      Object.hasOwn(d, 'reason'),
    'INVALID_INPUT',
    '行为来源不合法'
  );
  assert(d.questionKey === null || state.questions.some((q) => keyOf(q) === d.questionKey), 'NOT_FOUND', '题目不存在');
  assert(d.reason === null || Object.hasOwn(REVIEW_REASONS, d.reason), 'INVALID_INPUT', '请选择原因类别');
  if (op.type === 'learning.leave') {
    assert(d.questionKey === null || c.activeQuestionKey === d.questionKey, 'CONTEXT_CHANGED', '当前题目已变化');
    return { recorded: true };
  }
  assert(!c.stopped && !c.goalLifecycle, 'STOPPED', '目标已暂停或结束');
  if (op.type === 'review.idea.suggest') {
    const suggestion = reviewAdjustmentSuggestion(state, c.id, op.at);
    assert(suggestion, 'PRECONDITION', '尚无长期复习受阻依据');
    return { ideaId: op.id, ...suggestion, status: 'pending' };
  }
  const policy = reviewLimit(state, c.id, op.at);
  if (op.type === 'review.batch.start') {
    const candidates = reviewFacts(state, op.at, { conversationId: c.id })
      .filter((r) => !r.cancelled && !r.completedBy && r.availableAt <= op.at)
      .sort((a, b) => a.due - b.due || b.wrongCount - a.wrongCount || a.id.localeCompare(b.id))
      .slice(0, policy.limit);
    const previous = state.events
      .filter(
        (e) =>
          e.type === 'review.batch.start' &&
          e.data.conversationId === c.id &&
          date(e.at, state.timezone) === date(op.at, state.timezone)
      )
      .at(-1);
    assert(
      !previous ||
        !reviewFacts(state, op.at, { conversationId: c.id }).some(
          (r) => previous.data.reviewIds.includes(r.id) && !r.cancelled && !r.completedBy && r.availableAt <= op.at
        ),
      'PRECONDITION',
      '请先完成当前小批次'
    );
    assert(
      Array.isArray(d.reviewIds) &&
        d.reviewIds.length > 0 &&
        JSON.stringify(d.reviewIds) === JSON.stringify(candidates.map((r) => r.id)),
      'CONTEXT_CHANGED',
      '复习批次已变化，请刷新'
    );
    return { reviewIds: d.reviewIds, limit: policy.limit, returning: policy.returning };
  }
  const review = reviewFacts(state, op.at, { conversationId: c.id }).find(
    (r) => r.id === d.reviewId && r.questionKey === d.questionKey && !r.completedBy && !r.cancelled
  );
  assert(review && review.availableAt <= op.at, 'NOT_DUE', '当前没有可改期的到期复习');
  if (op.type === 'review.open') return { reviewId: review.id, itemId: review.itemId || null, recorded: true };
  assert(d.reason && Object.hasOwn(REVIEW_REASONS, d.reason), 'INVALID_INPUT', '请选择原因');
  const availableAt = op.type === 'review.skip' ? op.at + DAY : d.availableAt;
  assert(
    Number.isFinite(availableAt) && availableAt > op.at && availableAt - op.at <= 30 * DAY,
    'INVALID_INPUT',
    '改期需在未来30天内'
  );
  return {
    reviewId: review.id,
    availableAt,
    nextLimit: Math.max(1, Math.floor(policy.limit / 2)),
    ratingChanged: false
  };
}

export { scope as assertAdherenceScope, date as adherenceDay };
export const coachReviewId = (itemId, due) => `coach:${itemId}:${due}`;
