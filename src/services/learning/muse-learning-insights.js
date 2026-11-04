import { coachAssessmentCounts } from '../../../laf-backend/functions/_shared/learning-writing-coach.js';
import { dayKey } from './learning-domain.js';
import { libraryItemPaused } from '../../../laf-backend/functions/_shared/learning-writing-corpus.js';

export function coachFeedbackPreview(feedback) {
  const placeholders = ['只解释一个关键原因', '一个关键原因', '依据资料的正确思路', '针对这句原答的建议改写'];
  const line = feedback?.lines?.[0];
  return [line?.advice, line?.rewrite].find((value) => value && !placeholders.includes(value)) || '';
}

// All panels project the same saved facts as Chat. AI observations stay AI
// observations; viewing a panel never creates mastery or completes a task.
export function museLearningInsights(state, now) {
  const today = dayKey(now, state.timezone);
  const weaknesses = new Map(),
    strengths = new Map(),
    phrases = [],
    feedbacks = [];
  let submitted = 0,
    assessed = 0,
    rewrites = 0,
    essays = 0,
    completedDays = 0;
  for (const conversation of state.conversations) {
    const coach = conversation.coach;
    if (!coach) continue;
    assessed += coachAssessmentCounts(coach).assessed;
    submitted += coach.diagnostic?.answers.length || 0;
    submitted += coach.errorReviews?.length || 0;
    const collect = (feedback, day) => {
      if (!feedback) return;
      const evidence = { feedback, conversationId: conversation.id, goal: conversation.goal, day };
      feedbacks.push(evidence);
      for (const [field, map] of [
        ['weaknesses', weaknesses],
        ['strengths', strengths]
      ])
        for (const label of new Set(feedback[field] || [])) {
          const key = label.normalize('NFKC').trim().toLocaleLowerCase();
          if (!map.has(key)) map.set(key, { id: `${field}:${key}`, label, evidence: [] });
          map.get(key).evidence.push(evidence);
        }
    };
    collect(coach.diagnostic?.feedback, coach.startedDay);
    for (const day of coach.days) {
      submitted += day.answers.length + day.drafts.length;
      rewrites += day.rewrites.length;
      essays += day.essay ? 1 : 0;
      completedDays += day.completed ? 1 : 0;
      for (const feedback of Object.values(day.feedback)) collect(feedback, day.day);
      if (day.essay && !Object.values(day.feedback).some((value) => value.id === day.essay.id))
        collect(day.essay, day.day);
    }
    for (const phrase of coach.library)
      phrases.push({
        ...phrase,
        paused: libraryItemPaused(phrase, now),
        conversationId: conversation.id,
        goal: conversation.goal
      });
  }
  const days = Array.from({ length: 7 }, (_, index) => {
    const at = new Date(`${today}T12:00:00Z`);
    at.setUTCDate(at.getUTCDate() - 6 + index);
    const day = at.toISOString().slice(0, 10);
    return {
      day,
      count: state.events.filter(
        (event) =>
          ['coach.answer', 'coach.paragraph', 'coach.review'].includes(event.type) &&
          state.conversations.some((conversation) => conversation.id === event.data?.conversationId) &&
          dayKey(event.at, state.timezone) === day
      ).length
    };
  });
  return {
    submitted,
    assessed,
    pending: submitted - assessed,
    rewrites,
    essays,
    completedDays,
    days,
    weaknesses: [...weaknesses.values()].sort((a, b) => b.evidence.length - a.evidence.length),
    strengths: [...strengths.values()].sort((a, b) => b.evidence.length - a.evidence.length),
    feedbackCount: feedbacks.length,
    phrases,
    due: phrases.filter((phrase) => !phrase.paused && phrase.due <= now).length,
    familiar: phrases.filter(
      (phrase) => phrase.reviews.length >= 2 && phrase.reviews.slice(-2).every((r) => r.rating >= 3)
    ).length
  };
}
