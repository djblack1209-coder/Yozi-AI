import {
  reviewFacts,
  reviewLimit,
  assertAdherenceScope as scope,
  adherenceDay as date
} from '../../../laf-backend/functions/_shared/learning-adherence.js';
const DAY = 86400000;
export function reviewBatch(state, at = Date.now(), options = {}) {
  const rows = reviewFacts(state, at, options);
  const sessions = new Map(state.conversations.map((c) => [c.id, c]));
  const due = rows
    .filter(
      (r) =>
        !r.cancelled &&
        !r.completedBy &&
        r.availableAt <= at &&
        !sessions.get(r.conversationId)?.stopped &&
        !sessions.get(r.conversationId)?.goalLifecycle
    )
    .sort((a, b) => a.due - b.due || b.wrongCount - a.wrongCount || a.id.localeCompare(b.id));
  const conversationId = options.conversationId || due[0]?.conversationId || null;
  const ownDue = due.filter((r) => r.conversationId === conversationId);
  const { limit, returning } = reviewLimit(state, conversationId, at);
  const today = date(at, state.timezone);
  const started = state.events
    .filter(
      (e) =>
        e.type === 'review.batch.start' &&
        e.data.conversationId === conversationId &&
        date(e.at, state.timezone) === today
    )
    .at(-1);
  const ids = started?.data.reviewIds;
  const pending = ids ? ownDue.filter((r) => ids.includes(r.id)) : [];
  const acted = ids
    ? ids.filter((id) =>
        state.events.some(
          (e) => ['review.skip', 'review.reschedule'].includes(e.type) && e.data.reviewId === id && e.at >= started.at
        )
      )
    : [];
  const items = started ? pending.filter((r) => !acted.includes(r.id)).slice(0, limit) : ownDue.slice(0, limit);
  return {
    owner: state.owner,
    conversationId,
    limit,
    returning,
    total: ownDue.length,
    remaining: Math.max(0, ownDue.length - items.length),
    items,
    batchId: started?.id || null,
    batchDone: !!started && items.length === 0,
    batchSize: ids?.length || items.length
  };
}
// Project existing focus/submission/help/reminder/coach facts; do not write duplicate telemetry.
export function learningBehaviors(state, at = Date.now(), options = {}) {
  const { owner = state.owner, conversationId } = options;
  scope(state, owner, conversationId);
  const output = [];
  const focused = new Map();
  const push = (id, action, time, cid, questionKey = null, source = 'learning', reason = null, extra = {}) => {
    if (time <= at && (!conversationId || cid === conversationId))
      output.push({ id, owner, at: time, source, conversationId: cid || null, questionKey, reason, action, ...extra });
  };
  for (const e of state.events) {
    if (e.type === 'privacy.redacted' || e.at > at) continue;
    const d = e.data || {},
      cid = d.conversationId;
    const attempt = state.attempts.find((a) => a.id === e.id);
    const questionKey = d.questionKey || attempt?.questionKey || e.result?.questionKey || focused.get(cid) || null;
    if (e.type === 'question.focus') {
      focused.set(cid, questionKey);
      push(e.id, 'question.presented', e.at, cid, questionKey);
      if (d.kind === 'review') push(`${e.id}:review`, 'review.opened', e.at, cid, questionKey);
    } else if (attempt && ['attempt.submit', 'attempt.submit-original-v1'].includes(e.type))
      push(e.id, 'answer.submitted', e.at, cid, questionKey);
    else if (
      [
        'hint.add',
        'help.record',
        'writing.help',
        'science.help',
        'sentence.help',
        'oatutor.reference.read',
        'oatutor.scaffold.submit',
        'oatutor.final.read',
        'teaching.deliver'
      ].includes(e.type)
    )
      push(e.id, 'help.viewed', e.at, cid, questionKey);
    else if (e.type === 'task.stop' || e.type === 'learning.leave')
      push(e.id, 'learning.left', e.at, cid, questionKey, d.source || 'conversation', d.reason || null);
    else if (['review.skip', 'review.reschedule'].includes(e.type))
      push(
        e.id,
        e.type === 'review.skip' ? 'review.skipped' : 'review.rescheduled',
        e.at,
        cid,
        questionKey,
        d.source,
        d.reason,
        { reviewId: d.reviewId }
      );
    else if (e.type === 'reminder.receipt' && d.status === 'opened')
      push(e.id, 'reminder.opened', e.at, cid, null, 'notification');
    else if (['coach.answer', 'coach.paragraph'].includes(e.type))
      push(e.id, 'answer.submitted', e.at, cid, null, 'coach');
    else if (e.type === 'review.open') push(e.id, 'review.opened', e.at, cid, questionKey, d.source);
  }
  for (const r of reviewFacts(state, at, options)) {
    push(
      `${r.id}:due`,
      'review.due',
      r.due,
      r.conversationId,
      r.questionKey,
      r.kind?.startsWith('coach') ? 'coach' : 'fsrs',
      null,
      { reviewId: r.id }
    );
    if (r.completedBy)
      push(
        `${r.id}:complete`,
        'review.completed',
        r.completedAt,
        r.conversationId,
        r.questionKey,
        r.kind?.startsWith('coach') ? 'coach' : 'learning',
        null,
        {
          reviewId: r.id,
          attemptId: r.completedBy
        }
      );
  }
  // Goal progress changes use the same completion evidence, rather than an extra writable fact.
  for (const b of [...output].filter((b) => b.action === 'review.completed'))
    push(`${b.id}:goal`, 'goal.progress', b.at, b.conversationId, b.questionKey, b.source, null, { evidenceId: b.id });
  return output.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}
export function weeklyAdherence(state, at = Date.now(), options = {}) {
  const endDay = date(at, state.timezone),
    end = Date.parse(endDay),
    weekday = new Date(end).getUTCDay();
  const from = new Date(end - ((weekday + 6) % 7) * DAY).toISOString().slice(0, 10);
  const to = new Date(Date.parse(from) + 6 * DAY).toISOString().slice(0, 10);
  const events = learningBehaviors(state, at, options).filter((b) => {
    const day = date(b.at, state.timezone);
    return day >= from && day <= to;
  });
  const count = (action) => events.filter((e) => e.action === action).length;
  const hours = {};
  for (const e of events.filter((e) =>
    ['answer.submitted', 'review.skipped', 'review.rescheduled', 'learning.left'].includes(e.action)
  )) {
    const hour = new Intl.DateTimeFormat('en-GB', {
      timeZone: state.timezone,
      hour: '2-digit',
      hourCycle: 'h23'
    }).format(e.at);
    hours[hour] = (hours[hour] || 0) + 1;
  }
  const completed = count('review.completed');
  // Historic imports have no reliable exposure window. Do not invent an adherence denominator.
  return {
    owner: state.owner,
    from,
    to,
    timezone: state.timezone,
    completed,
    skipped: count('review.skipped'),
    rescheduled: count('review.rescheduled'),
    abandoned: count('learning.left'),
    due: count('review.due'),
    denominator: null,
    rate: null,
    hours
  };
}

// A hidden page is an observed departure, never evidence of failure or a zero grade.
export function learningLeaveOperation(state, conversationId) {
  const session = state.conversations.find((c) => c.id === conversationId);
  if (!session?.activeQuestionKey || session.stopped) return null;
  const index = state.events.findLastIndex(
    (e) =>
      e.type === 'question.focus' &&
      e.data.conversationId === conversationId &&
      e.data.questionKey === session.activeQuestionKey
  );
  if (
    index < 0 ||
    state.events
      .slice(index + 1)
      .some(
        (e) =>
          ['attempt.submit', 'attempt.submit-original-v1'].includes(e.type) &&
          e.data.conversationId === conversationId &&
          e.result?.questionKey === session.activeQuestionKey
      )
  )
    return null;
  const id = `${state.events[index].id}:leave`;
  if (id.length > 160 || state.events.some((e) => e.id === id)) return null;
  return {
    id,
    type: 'learning.leave',
    data: {
      owner: state.owner,
      source: 'conversation',
      conversationId,
      questionKey: session.activeQuestionKey,
      reason: null
    }
  };
}
