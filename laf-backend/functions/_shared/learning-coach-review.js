// Queue saved, classified errors without rewriting originals or claiming mastery.
// Only current feedback with a matching request/result event can create a row.
const list = (value) => (Array.isArray(value) ? value : []);
const errorEvidence = (feedback) =>
  list(feedback?.weaknessEvidence).filter(
    (item) => item.classification === 'error' && typeof item.quote === 'string' && item.quote.trim()
  );
export const COACH_RECALL_CONTRACT = 'coach-recall-v1';
const dayMs = 86400000;
const recallIntervals = [3, 7, 14];

export function coachErrorReviews(state, at = Date.now(), conversationId) {
  const rows = [];
  for (const conversation of state.conversations) {
    const coach = conversation.coach;
    if (!coach || (conversationId && conversation.id !== conversationId)) continue;
    const collect = (feedback, target, day, answers, cards, covering = []) => {
      if (feedback?.feedbackVersion !== 2 || !errorEvidence(feedback).length) return;
      const request = [...list(coach.requests)]
        .reverse()
        .find(
          (item) =>
            item.status === 'completed' &&
            item.request.target === target &&
            (target === 'diagnostic' || item.request.day === day) &&
            (!feedback.id || feedback.id === item.resultId)
        );
      const receipt = request && state.events.find((event) => event.id === request.resultId);
      if (
        receipt?.type !== 'coach.result' ||
        receipt.at > at ||
        receipt.data?.conversationId !== conversation.id ||
        receipt.data.requestId !== request.id
      )
        return;
      for (const answer of answers) {
        const content = answer.answer ?? answer.text;
        const card = cards.find((item) => item.id === answer.cardId);
        const submitted = state.events.find((event) => event.id === answer.id);
        const eventType =
          target === 'essay'
            ? 'coach.essaySubmit'
            : target === 'analysis'
              ? 'coach.analysis'
              : target.startsWith('paragraph-')
                ? 'coach.paragraph'
                : 'coach.answer';
        if (
          !content ||
          !card ||
          submitted?.type !== eventType ||
          submitted.data?.conversationId !== conversation.id ||
          submitted.at > at
        )
          continue;
        const observations = errorEvidence(feedback).filter((item) => {
          const exact = answers.filter(
            (candidate) => (candidate.answer ?? candidate.text)?.trim() === item.quote.trim()
          );
          const matches = exact.length
            ? exact
            : answers.filter((candidate) => (candidate.answer ?? candidate.text)?.includes(item.quote));
          // Prefer the complete cloze answer over incidental letters in an analysis.
          return matches.length === 1 && matches[0].id === answer.id;
        });
        if (!observations.length) continue;
        const dimensions = list(feedback.dimensions)
          .filter(
            (dimension) =>
              [0, 1].includes(dimension.score) &&
              list(dimension.evidence).some((quote) =>
                observations.some((item) => quote.includes(item.quote) || item.quote.includes(quote))
              )
          )
          .map((dimension) => dimension.name);
        const assessmentFor = (item) => {
          const assessment = item.feedback;
          const assessed = coach.requests.find(
            (req) =>
              req.resultId === assessment?.id &&
              ((item.id && req.request.errorReviewId === item.id) ||
                (item.coveringRequestId && req.id === item.coveringRequestId))
          );
          const event = assessed && state.events.find((entry) => entry.id === assessed.resultId);
          if (
            assessed?.status !== 'completed' ||
            event?.type !== 'coach.result' ||
            event.data?.conversationId !== conversation.id ||
            event.data.requestId !== assessed.id ||
            event.at > at ||
            assessment.feedbackVersion !== 2
          )
            return null;
          const wrong = errorEvidence(assessment).length > 0;
          const passed =
            !wrong &&
            dimensions.every((name) => assessment.dimensions?.some((item) => item.name === name && item.score === 2)) &&
            list(assessment.dimensions).some((dimension) => dimension.score === 2) &&
            list(assessment.dimensions).every((dimension) => dimension.score === null || dimension.score === 2) &&
            !list(assessment.weaknessEvidence).some((item) => item.classification === 'uncertain');
          return { item, event, wrong, passed };
        };
        const original = {
          kind: 'coach_error',
          conversationId: conversation.id,
          questionKey: null,
          itemId: answer.id,
          cancelled: false,
          sourceFeedbackId: receipt.id,
          sourceRequestId: request.id,
          sourceAnswerId: answer.id,
          sourceDay: day,
          sourceTarget: target,
          prompt: card.prompt,
          original: content,
          labels: [...new Set(observations.map((item) => item.label))],
          dimensions,
          observations
        };
        let id = `coach-error:${receipt.id}:${answer.id}`;
        let due = receipt.at;
        let streak = 0;
        while (true) {
          const attempts = list(coach.errorReviews).filter((item) => item.reviewId === id && item.at <= at);
          const assessed = attempts.map(assessmentFor).filter(Boolean);
          const completed =
            assessed.find((item) => item.passed) ||
            (due === receipt.at ? covering.map(assessmentFor).find((item) => item?.passed) : null);
          const rated = assessed.filter(
            ({ item, passed, wrong }) => item.recallContract === COACH_RECALL_CONTRACT && (passed || wrong)
          );
          if (rated.some(({ wrong }) => wrong)) streak = 0;
          const latest = rated.at(-1);
          const rating = latest?.passed ? (latest.item.referenceShown ? 'hard' : 'good') : 'again';
          const recall = latest
            ? {
                rating,
                at: latest.event.at,
                due: latest.event.at + dayMs * (rating === 'good' ? recallIntervals[streak] : 1)
              }
            : null;
          const deferred = state.events.findLast(
            (event) =>
              ['review.skip', 'review.reschedule'].includes(event.type) &&
              event.data.conversationId === conversation.id &&
              event.data.reviewId === id &&
              event.at <= at
          );
          rows.push({
            ...original,
            id,
            due,
            availableAt: Math.max(due, deferred?.result.availableAt || due, completed ? due : recall?.due || due),
            completedBy: completed?.event.id || null,
            completedAt: completed?.event.at ?? null,
            wrongCount: 1 + attempts.filter((item) => errorEvidence(item.feedback).length).length,
            latestAttempt: attempts.at(-1) || null,
            ...(recall ? { recall } : {})
          });
          if (!recall || !completed || completed.item !== latest.item) break;
          id = `coach-recall:${latest.item.id}`;
          due = recall.due;
          streak = rating === 'good' ? Math.min(streak + 1, recallIntervals.length - 1) : 0;
        }
      }
    };
    collect(
      coach.diagnostic?.feedback,
      'diagnostic',
      coach.startedDay,
      list(coach.diagnostic?.answers),
      list(coach.diagnostic?.cards)
    );
    for (const day of list(coach.days)) {
      for (const answer of list(day.answers))
        collect(day.feedback[`card-${answer.cardId}`], `card-${answer.cardId}`, day.day, [answer], day.pack.cards);
      const fullRequest =
        day.essay &&
        list(day.rewrites).length > 0 &&
        day.rewrites.every((item) => item?.authorship === 'user_typed') &&
        coach.requests.find(
          (req) =>
            req.resultId === day.essay.id &&
            req.request.target === 'essay' &&
            req.request.input ===
              list(day.rewrites)
                .map((item) => item?.text || '')
                .join('\n\n')
        );
      const covering = fullRequest ? [{ feedback: day.essay, coveringRequestId: fullRequest.id }] : [];
      for (const [index, draft] of list(day.drafts).entries())
        if (draft) {
          const target = `paragraph-${index}`;
          collect(
            day.feedback[target],
            target,
            day.day,
            [{ ...draft, cardId: target }],
            [{ id: target, prompt: day.pack.writing.prompt }],
            covering
          );
        }
      const analysisRequest = coach.requests.find((req) => req.resultId === day.feedback.analysis?.id);
      if (analysisRequest) {
        const original = state.events.findLast(
          (event) =>
            event.type === 'coach.analysis' &&
            event.data.conversationId === conversation.id &&
            event.at <= analysisRequest.at &&
            JSON.stringify(event.data.fields) === JSON.stringify(day.analysis)
        );
        if (original)
          collect(
            day.feedback.analysis,
            'analysis',
            day.day,
            [{ id: original.id, cardId: 'analysis', answer: analysisRequest.request.input }],
            [{ id: 'analysis', prompt: day.pack.writing.prompt }]
          );
      }
      const submission = day.writingSubmissions?.find(
        (item) => item.authorship === 'user_typed' && item.text === fullRequest?.request.input
      );
      if (submission) {
        const rewrites = list(coach.rewriteTasks)
          .filter((task) => task.sourceSubmissionId === submission.submissionId && task.feedback)
          .map((task) => ({
            feedback: task.feedback,
            coveringRequestId: coach.requests.find(
              (req) => req.request.rewriteId === task.id && req.resultId === task.feedback.id
            )?.id
          }));
        collect(
          day.essay,
          'essay',
          day.day,
          [{ id: submission.submissionId, cardId: 'essay', answer: submission.text }],
          [{ id: 'essay', prompt: day.pack.writing.prompt }],
          rewrites
        );
      }
    }
  }
  return rows.sort((a, b) => a.due - b.due || a.id.localeCompare(b.id));
}
