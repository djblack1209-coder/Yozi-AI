import { historyChecksum } from './learning-history.js';

// Model requests never select pedagogy, create learning facts, or supply FSRS grades.
export const MODEL_TOOL_NAMES = Object.freeze([
  'progress',
  'hint',
  'assess',
  'plan',
  'visualize',
  'entry.query',
  'entry.aggregate'
]);
export const LEARNING_BUDGET_PHASES = Object.freeze(['diagnostic', 'practice', 'writing', 'review', 'ideas']);
export function learningBudgetPhase(context = {}) {
  const request = context.coach;
  if (context.ideas) return 'ideas';
  if (request?.phase === 'diagnostic' || request?.target === 'diagnostic' || context.intake) return 'diagnostic';
  if (['essay', 'summary'].includes(request?.phase) || /^(analysis|paragraph-|rewrite$)/u.test(request?.target || ''))
    return 'writing';
  if (context.strategy?.method === 'review' || context.task?.kind === 'review') return 'review';
  if (request || context.task?.kind === 'practice') return 'practice';
  if (context.task?.kind === 'review') return 'review';
  if (context.question?.rubric || context.attempt?.answer?.length > 500) return 'writing';
  return 'practice';
}
export function phaseCallLimit(limit, phase) {
  // Ideas run unasked, so they get a small fixed slice and can never eat into teaching.
  const shares = { diagnostic: 0.15, practice: 0.3, writing: 0.35, review: 0.15, ideas: 0.05 };
  return Math.max(1, Math.floor(limit * (shares[phase] || shares.practice)));
}
export function learningTimeout(context = {}) {
  // 初评可借用混合摸底的剩余额度，独立复核仍受同一个120秒总截止限制。
  if (coachVerificationBudget(context) > 65000) return 110000;
  return ['writing', 'diagnostic'].includes(learningBudgetPhase(context)) || context.coach ? 60000 : 30000;
}
export function coachVerificationBudget(context = {}) {
  const request = context.coach;
  // 五题混合初评与独立复核共用总额；不通过减弱模型思考或评分来挤进时限。
  return request?.phase === 'feedback' && request.target === 'diagnostic' && request.feedbackVersion === 2
    ? 120000
    : 65000;
}
export function hostReviewRating({ outcome, hinted = false, correctStreak = 0 }) {
  if (outcome !== 'correct') return 1;
  if (hinted) return 2;
  return correctStreak >= 2 ? 4 : 3;
}
export function phraseReviewRating(item, answer, { hinted = false } = {}) {
  const normalize = (value) =>
    String(value || '')
      .normalize('NFKC')
      .trim()
      .replace(/\s+/gu, ' ')
      .toLowerCase();
  const correct = normalize(answer) === normalize(item.text);
  return hostReviewRating({
    outcome: correct ? 'correct' : 'uncertain',
    hinted,
    correctStreak: (item.reviews || []).slice(-2).filter((review) => review.rating >= 3).length
  });
}
export function toolParameterHash(parameters) {
  const canonical = (value) =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, canonical(value[key])])
          )
        : value;
  return `fnv1a32:${historyChecksum(JSON.stringify(canonical(parameters || {})))}`;
}
export function compactLearningProgress(state, conversationId, at = Date.now()) {
  const conversation = state.conversations.find((entry) => entry.id === conversationId);
  const coach = conversation?.coach;
  const day = coach?.days?.at(-1);
  const assessments = state.attempts.flatMap((attempt) => attempt.assistance || []);
  const coachDimensions =
    coach?.learningRecords?.filter((record) => record.dimensions?.length).at(-1)?.dimensions ||
    day?.essay?.dimensions ||
    [];
  const latestDraftId = state.events
    .filter(
      (event) =>
        ['coach.paragraph', 'coach.essaySubmit', 'coach.rewriteAnswer'].includes(event.type) &&
        event.data.conversationId === conversationId
    )
    .at(-1)?.id;
  return {
    contract: 'learning-snapshot-v1',
    revision: state.revision,
    timezone: state.timezone,
    profile: coach?.profile
      ? { exam: coach.profile.exam, minutes: coach.profile.minutes, deadline: coach.profile.deadline }
      : null,
    dimensionScores: [
      ...assessments.slice(-4).flatMap((entry) =>
        (entry.dimensions || entry.rubric?.dimensions || []).map((dimension) => ({
          id: dimension.criterionId || dimension.name,
          score: dimension.score ?? null
        }))
      ),
      ...coachDimensions.map((dimension) => ({ id: dimension.name, score: dimension.score ?? null }))
    ].slice(-12),
    dueCards: [
      ...(coach?.library || []).filter((item) => item.due <= at).map((item) => ({ id: item.id, due: item.due })),
      ...(state.reviews || [])
        .filter((item) => !item.cancelled && item.due <= at)
        .map((item) => ({ id: item.id, due: item.due }))
    ].slice(0, 12),
    draftId: latestDraftId || day?.writingSubmissions?.at(-1)?.submissionId || day?.drafts?.at(-1)?.id || null,
    rewritePending: day?.rewritePending === true,
    teaching: {
      stopped: conversation?.stopped === true,
      method:
        state.events
          .filter(
            (event) =>
              event.type === 'strategy.set' &&
              (!event.data.conversationId || event.data.conversationId === conversationId)
          )
          .at(-1)?.data.method ||
        state.strategy?.method ||
        'steps'
    },
    planVersion: (state.plans || []).at(-1)?.version || state.plan?.version || 0,
    counts: { answers: state.attempts.length, reviews: state.reviews.length }
  };
}

// Wire projection: clients cannot sneak history or arbitrary fields into a snapshot.
export function normalizeLearningSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const boundedId = (id) => (typeof id === 'string' && /^[a-zA-Z0-9_.:@-]{1,160}$/.test(id) ? id : null);
  const count = (number) => (Number.isSafeInteger(number) && number >= 0 ? number : 0);
  return {
    contract: 'learning-snapshot-v1',
    revision: count(value.revision),
    timezone: typeof value.timezone === 'string' ? value.timezone.slice(0, 60) : null,
    profile: value.profile
      ? {
          exam: ['english1', 'english2', 'general', 'cs408'].includes(value.profile.exam) ? value.profile.exam : null,
          minutes: count(value.profile.minutes),
          deadline: /^\d{4}-\d{2}-\d{2}$/.test(value.profile.deadline || '') ? value.profile.deadline : null
        }
      : null,
    dimensionScores: (Array.isArray(value.dimensionScores) ? value.dimensionScores : [])
      .slice(0, 12)
      .map((dimension) => ({
        id: String(dimension.id || '').slice(0, 80),
        score: typeof dimension.score === 'number' && Number.isFinite(dimension.score) ? dimension.score : null
      })),
    dueCards: (Array.isArray(value.dueCards) ? value.dueCards : [])
      .slice(0, 12)
      .map((card) => ({ id: boundedId(card.id), due: count(card.due) }))
      .filter((card) => card.id),
    draftId: boundedId(value.draftId),
    rewritePending: value.rewritePending === true,
    teaching: {
      stopped: value.teaching?.stopped === true,
      method: /^[a-z_]{1,30}$/.test(value.teaching?.method || '') ? value.teaching.method : 'steps'
    },
    planVersion: count(value.planVersion),
    counts: { answers: count(value.counts?.answers), reviews: count(value.counts?.reviews) }
  };
}
