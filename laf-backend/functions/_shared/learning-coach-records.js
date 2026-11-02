// A read-only view of saved originals. Never infer a grade or reconstruct deleted facts from events.
import { writingAnswerHash, writingBandRubric, WRITING_BAND_RESULT_CONTRACT } from './learning-rubric.js';

function currentWritingSubmission(coach, day) {
  if (
    !['english1', 'english2'].includes(coach.profile?.exam) ||
    !['small', 'large'].includes(day.pack.writing?.essayType) ||
    !day.writingTask
  )
    return null;
  const answer = day.rewrites.map((paragraph) => paragraph?.text || '').join('\n\n');
  const hash = writingAnswerHash(answer);
  return day.writingSubmissions?.find(
    (item) =>
      item.authorship === 'user_typed' &&
      item.text === answer &&
      item.answerHash === hash &&
      item.taskId === day.writingTask.taskId &&
      item.taskVersion === day.writingTask.taskVersion
  );
}
function currentWritingObservation(coach, day, submission) {
  const hash = submission.answerHash;
  const rubric = writingBandRubric(coach.profile.exam, day.pack.writing.essayType);
  return (
    [...(day.writingBandResults || [])]
      .reverse()
      .find(
        (result) =>
          result.contract === WRITING_BAND_RESULT_CONTRACT &&
          result.binding?.submissionId === submission.submissionId &&
          result.binding.answerHash === hash &&
          result.binding.taskId === submission.taskId &&
          result.binding.taskVersion === submission.taskVersion &&
          result.binding.rubricId === rubric.id &&
          result.binding.rubricVersion === rubric.version
      ) || null
  );
}
export function coachSavedRecords(conversation) {
  const coach = conversation?.coach;
  if (!coach) return [];
  const rows = [];
  for (const [index, answer] of (coach.diagnostic?.answers || []).entries()) {
    const card = coach.diagnostic.cards.find((item) => item.id === answer.cardId);
    rows.push({
      key: answer.id,
      day: answer.day || coach.startedDay,
      title: card?.title || '摸底',
      prompt: card?.prompt || '',
      answer: answer.answer,
      at: answer.at,
      target: 'diagnostic',
      source: card?.source,
      feedback: index === coach.diagnostic.answers.length - 1 ? coach.diagnostic.feedback : null
    });
  }
  for (const day of coach.days) {
    const submission = currentWritingSubmission(coach, day);
    const writingObservation =
      submission && day.writingBandResults?.length ? currentWritingObservation(coach, day, submission) : null;
    for (const answer of day.answers) {
      const card = day.pack.cards.find((item) => item.id === answer.cardId);
      rows.push({
        key: answer.id,
        day: day.day,
        title: card?.title || '训练',
        prompt: card?.prompt || '',
        answer: answer.answer,
        at: answer.at,
        target: `card-${answer.cardId}`,
        source: card?.source,
        feedback: day.feedback[`card-${answer.cardId}`]
      });
    }
    if (day.analysis)
      rows.push({
        key: `analysis:${day.day}`,
        day: day.day,
        title: '审题',
        target: 'analysis',
        prompt: day.pack.writing.prompt,
        answer: Object.entries(day.analysis)
          .map(
            ([key, value]) =>
              `${{ genre: '体裁', recipient: '对象', purpose: '目的', points: '要点', words: '字数' }[key] || key}：${value}`
          )
          .join('\n'),
        at: Math.max(...day.answers.map((a) => a.at), Date.parse(`${day.day}T00:00:00Z`)) + 1,
        feedback: day.feedback.analysis
      });
    for (const [index, answer] of day.drafts.entries()) {
      if (answer)
        rows.push({
          key: answer.id,
          day: day.day,
          title: `第 ${index + 1} 段`,
          prompt: day.pack.writing.prompt,
          answer: answer.text,
          at: answer.at,
          target: `paragraph-${index}`,
          feedback: day.feedback[`paragraph-${index}`]
        });
    }
    for (const [index, answer] of day.rewrites.entries()) {
      if (answer)
        rows.push({
          key: answer.id,
          day: day.day,
          title: `第 ${index + 1} 段 · 改写`,
          ...(index === day.pack.writing.patterns.length - 1
            ? {
                target: 'essay',
                phase: 'essay',
                writingProcessSource:
                  typeof submission?.submissionId === 'string' &&
                  submission.submissionId.trim() &&
                  submission.taskId &&
                  submission.taskVersion === 1
                    ? 'guided'
                    : 'unknown'
              }
            : {}),
          prompt: '',
          answer: answer.text,
          at: answer.at,
          feedback: index === day.pack.writing.patterns.length - 1 ? day.essay : null,
          ...(index === day.pack.writing.patterns.length - 1 && writingObservation ? { writingObservation } : {})
        });
    }
  }
  for (const item of coach.library)
    for (const review of item.reviews || [])
      rows.push({
        key: review.id,
        day: review.day,
        title: '复习自评',
        prompt: item.text,
        answer: review.answer,
        at: review.at
      });
  for (const attempt of coach.errorReviews || [])
    rows.push({
      key: attempt.id,
      day: attempt.day,
      title: '错因重练',
      target: 'error-review',
      prompt: attempt.prompt,
      answer: attempt.answer,
      at: attempt.at,
      feedback: attempt.feedback,
      sourceFeedbackId: attempt.sourceFeedbackId,
      sourceAnswerId: attempt.sourceAnswerId
    });
  for (const row of rows)
    if (row.target && !row.feedback && !(row.target === 'diagnostic' && coach.diagnostic.feedback)) {
      row.request = [...(coach.requests || [])]
        .reverse()
        .find(
          (request) =>
            ['pending', 'closed'].includes(request.status) &&
            request.request.target === row.target &&
            (row.target !== 'error-review' || request.request.errorReviewId === row.key) &&
            request.request.phase === (row.phase || 'feedback') &&
            (row.target === 'diagnostic' || request.request.day === row.day)
        );
      row.assessmentStatus = 'pending';
    }
  return rows.sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
}
