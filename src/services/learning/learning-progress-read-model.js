import {
  PROGRESS_NODE_RULES,
  progressNodeIds,
  writingNodeObservations,
  WRITING_KNOWLEDGE_CONTRACT,
  WRITING_KNOWLEDGE_GRAPH,
  WRITING_KNOWLEDGE_MAPPING
} from '../../../laf-backend/functions/_shared/learning-writing-knowledge.js';
export { PROGRESS_NODE_RULES, progressNodeIds };
import { dayKey, effectiveGrade, questionKey } from './learning-domain.js';
import { knowledgeGraphSeed } from './knowledge-graph-seed.js';
import { normalizeLearningModelOrigin } from '../../../laf-backend/functions/_shared/learning-model-origin.js';

// Display floor only. N3 must calibrate it with unseen, unprompted first answers.
export const MIN_PROGRESS_EVENTS = 5;
export const PROGRESS_CONTRACT = 'learning-progress-read-v1';
export const PROGRESS_RUBRIC_LABELS = Object.freeze(['需重练', '可改进', '达成本次要求']);
export const PROGRESS_DIMENSIONS = Object.freeze(['语法', '搭配', '表达', '任务完成']);

const list = (value) => (Array.isArray(value) ? value : []);
const distinct = (values) => [...new Set(values)];
const order = (a, b) => a.at - b.at || String(a.id || '').localeCompare(String(b.id || ''));
const writingSubject = knowledgeGraphSeed.subject;
const questionTypes = Object.freeze({
  choice: '选择题',
  number: '填空题',
  text: '简答题',
  rubric: '写作',
  boolean: '判断题'
});
const subjectId = (subject) => (['考研英语写作', writingSubject].includes(subject) ? writingSubject : subject);

function modelOrigin(modelId = '', origin) {
  if (origin) return { source: origin.source, modelId, provider: origin.provider, actualModel: origin.actualModel };
  // muse-ai-connectors creates byok_ IDs; the persisted request keeps that ID.
  // A historical arbitrary ID has no saved source/version: do not guess platform.
  return { source: modelId.startsWith('byok_') ? 'byok' : modelId ? 'unknown' : 'local', modelId: modelId || null };
}

function metric(evidence, select, kind = 'accuracy') {
  const rows = evidence.flatMap((event) => {
    const value = select(event);
    return value === null || value === undefined ? [] : [{ id: event.id, value }];
  });
  const denominatorEventIds = distinct(rows.map((row) => row.id));
  const numeratorEventIds = distinct(rows.filter((row) => row.value === true).map((row) => row.id));
  const denominator = denominatorEventIds.length;
  return {
    kind,
    status: denominator < MIN_PROGRESS_EVENTS ? 'insufficient' : 'available',
    numerator: numeratorEventIds.length,
    denominator,
    numeratorEventIds,
    denominatorEventIds,
    percentage: denominator < MIN_PROGRESS_EVENTS ? null : Math.round((numeratorEventIds.length / denominator) * 100)
  };
}

function aggregates(evidence) {
  const ids = distinct([writingSubject, ...evidence.map((event) => event.subject)]);
  return ids.map((id) => {
    const rows = evidence.filter((event) => event.subject === id);
    return {
      id,
      label: id === writingSubject ? '考研英语写作' : id,
      accuracy: metric(rows, (event) => (event.outcome === null ? null : event.outcome === 'correct')),
      attainment: metric(
        rows,
        (event) => (event.dimensions.length ? event.dimensions.every((dimension) => dimension.score === 2) : null),
        'rubric-attainment'
      ),
      dimensions: (id === writingSubject ? PROGRESS_DIMENSIONS : []).map((name) => ({
        id: name,
        label: name,
        ...metric(
          rows,
          (event) => {
            const dimension = event.dimensions.find((item) => item.name === name);
            return dimension ? dimension.score === 2 : null;
          },
          'rubric-attainment'
        )
      })),
      questionTypes: distinct(rows.map((event) => event.questionType)).map((type) => {
        const typed = rows.filter((event) => event.questionType === type);
        return {
          id: type,
          label: type,
          accuracy: metric(typed, (event) => (event.outcome === null ? null : event.outcome === 'correct')),
          attainment: metric(
            typed,
            (event) => (event.dimensions.length ? event.dimensions.every((d) => d.score === 2) : null),
            'rubric-attainment'
          )
        };
      })
    };
  });
}

function nodeProjection(evidence) {
  return knowledgeGraphSeed.topics.map((node) => {
    const rows = evidence.filter((event) => event.nodeObservations.some((item) => item.nodeId === node.id));
    const observed = rows.filter((event) =>
      event.nodeObservations.some((item) => item.nodeId === node.id && item.score !== null)
    );
    const status = observed.length < MIN_PROGRESS_EVENTS ? 'insufficient' : 'observed';
    const latest = observed.at(-1);
    const level =
      status === 'observed'
        ? Math.min(
            ...latest.nodeObservations
              .filter((item) => item.nodeId === node.id && item.score !== null)
              .map((item) => item.score)
          )
        : null;
    return {
      id: node.id,
      name: node.name,
      chapter: node.chapter,
      status,
      level,
      statusLabel: status === 'insufficient' ? '数据不足' : PROGRESS_RUBRIC_LABELS[level],
      // Even five correct objective answers are not a validated writing rubric level.
      sampleCount: observed.length,
      sampleEventIds: observed.map((event) => event.id),
      evidenceIds: rows.map((event) => event.id),
      levelEventIds: status === 'observed' ? [latest.id] : [],
      isWeakness: level !== null && level < 2,
      weaknessEventIds: (status === 'observed' ? rows : [])
        .filter((event) => event.nodeObservations.some((item) => item.nodeId === node.id && item.weakness))
        .map((event) => event.id),
      accuracy: metric(rows, (event) => (event.outcome === null ? null : event.outcome === 'correct'))
    };
  });
}

// Pure projection: current canonical originals/feedback only; never replay historical
// payloads to resurrect deleted or superseded student records, or issue any writes.
export function learningProgressReadModel(state = {}) {
  const sessions = new Map(list(state.conversations).map((session) => [session.id, session]));
  const questions = new Map(list(state.questions).map((question) => [questionKey(question), question]));
  const events = new Map(list(state.events).map((event) => [event.id, event]));
  const evidence = new Map();
  const timezone = state.timezone || 'Asia/Shanghai';
  const append = (row) => {
    if (!row.id || !Number.isFinite(row.at) || evidence.has(row.id)) return;
    evidence.set(row.id, { ...row, day: dayKey(row.at, timezone) });
  };
  const independentQuestions = new Set();
  for (const attempt of [...list(state.attempts)].sort(order)) {
    const question = questions.get(attempt.questionKey),
      session = sessions.get(attempt.conversationId);
    if (!question || !session || !['first', 'variant', 'review'].includes(attempt.kind) || list(attempt.hints).length)
      continue;
    const identity = JSON.stringify([session.id, attempt.questionKey]);
    if (independentQuestions.has(identity)) continue;
    independentQuestions.add(identity);
    const grade = effectiveGrade(attempt);
    if (grade?.status !== 'reliable' || !['correct', 'wrong', 'partial'].includes(grade.outcome)) continue;
    const correction = list(attempt.corrections).at(-1);
    const requestEvent = list(state.events).find(
      (event) => event.type === 'model.request' && event.data?.feedbackAttemptId === attempt.id
    );
    const subject = subjectId(question.subject || session.studyProfile?.subject || '未归类');
    const ids =
      subject === writingSubject
        ? progressNodeIds({ labels: [question.knowledgePoint], nodeIds: list(question.knowledgeNodeIds) })
        : [];
    append({
      id: attempt.id,
      at: attempt.at,
      conversationId: session.id,
      subject,
      questionType: questionTypes[question.answerType || question.validation?.type] || '练习',
      prompt: question.prompt || '',
      goal: session.goal || '',
      recordId: JSON.stringify([session.id, attempt.questionKey, attempt.id]),
      kind: 'answer',
      learningEventIds: [attempt.id],
      receiptEventIds: correction?.id ? [correction.id] : [],
      outcome: grade.outcome,
      conclusion: { correct: '正确', wrong: '错误', partial: '部分正确' }[grade.outcome],
      model: modelOrigin(requestEvent?.data?.modelId || ''),
      dimensions: [],
      nodeObservations: ids.map((nodeId) => ({ nodeId, score: null, weakness: grade.outcome !== 'correct' }))
    });
  }
  for (const session of sessions.values()) {
    const coach = session.coach;
    if (!coach || (coach.profile?.track && coach.profile.track !== writingSubject)) continue;
    const collect = (feedback, target, day, answers, cards, recordKey) => {
      if (!feedback || !answers.length) return;
      const request = [...list(coach.requests)]
        .reverse()
        .find(
          (req) =>
            req.status === 'completed' &&
            req.request?.target === target &&
            (target === 'diagnostic' || req.request.day === day) &&
            ['feedback', 'essay'].includes(req.request.phase) &&
            (!feedback.id || feedback.id === req.resultId)
        );
      const receipt = request && events.get(request.resultId);
      if (
        !request ||
        receipt?.type !== 'coach.result' ||
        receipt.data?.requestId !== request.id ||
        receipt.data?.conversationId !== session.id ||
        feedback.feedbackVersion !== 2 ||
        request.request.dimensionContract !== 'writing-dimensions-v1'
      )
        return;
      const dimensions = list(feedback.dimensions).filter(
        (dimension) =>
          PROGRESS_DIMENSIONS.includes(dimension.name) &&
          [0, 1, 2].includes(dimension.score) &&
          list(dimension.evidence).some((quote) => typeof quote === 'string' && quote.trim())
      );
      if (!dimensions.length) return;
      const record = list(coach.learningRecords).find(
        (record) => record.id === receipt.id && record.requestId === request.id
      );
      const stored = record?.knowledge;
      const origin =
        request.request.knowledgeContract &&
        normalizeLearningModelOrigin(record?.model, {
          requestId: request.id,
          modelId: request.modelId,
          binding: request.binding
        });
      const bound = request.request.knowledgeContract === WRITING_KNOWLEDGE_CONTRACT;
      const validBinding =
        bound &&
        stored?.contract === WRITING_KNOWLEDGE_CONTRACT &&
        stored.graphVersion === WRITING_KNOWLEDGE_GRAPH &&
        stored.mappingVersion === WRITING_KNOWLEDGE_MAPPING &&
        stored.rubricVersion === request.request.dimensionContract &&
        stored.subject === writingSubject;
      const nodeObservations = bound
        ? validBinding
          ? list(stored.observations).filter(
              (item) =>
                knowledgeGraphSeed.topics.some((node) => node.id === item.nodeId) &&
                dimensions.some((dimension) => dimension.name === item.dimension && dimension.score === item.score) &&
                item.weakness === item.score < 2
            )
          : []
        : writingNodeObservations({ ...feedback, dimensions }, cards);
      const key = recordKey || answers.at(-1).id;
      append({
        id: receipt.id,
        at: receipt.at,
        conversationId: session.id,
        subject: writingSubject,
        questionType:
          cards.length === 1 ? cards[0].title || cards[0].kind || '写作' : target === 'diagnostic' ? '摸底' : '写作',
        prompt: cards
          .map((card) => card.prompt)
          .filter(Boolean)
          .join('\n'),
        goal: session.goal || '',
        recordId: key ? JSON.stringify([session.id, null, `coach:${key}`]) : null,
        kind: 'writing-feedback',
        learningEventIds: distinct(answers.map((answer) => answer.id).filter(Boolean)),
        receiptEventIds: [receipt.id],
        outcome: null,
        conclusion: dimensions
          .map((dimension) => `${dimension.name} · ${PROGRESS_RUBRIC_LABELS[dimension.score]}`)
          .join('；'),
        model: modelOrigin(request.modelId, origin),
        ...(origin ? { modelOrigin: origin } : {}),
        binding: {
          mode: bound ? (validBinding ? 'saved' : 'unavailable') : 'read-time',
          graphVersion: bound ? stored?.graphVersion || null : WRITING_KNOWLEDGE_GRAPH,
          mappingVersion: bound ? stored?.mappingVersion || null : WRITING_KNOWLEDGE_MAPPING,
          rubricVersion: request.request.dimensionContract
        },
        dimensions: dimensions.map(({ name, score }) => ({ name, score })),
        nodeObservations
      });
    };
    collect(
      coach.diagnostic?.feedback,
      'diagnostic',
      coach.startedDay,
      list(coach.diagnostic?.answers),
      list(coach.diagnostic?.cards)
    );
    for (const day of list(coach.days)) {
      for (const [target, feedback] of Object.entries(day.feedback || {})) {
        const card = list(day.pack?.cards).find((item) => `card-${item.id}` === target);
        const answers = card
          ? list(day.answers).filter((answer) => answer.cardId === card.id)
          : target.startsWith('paragraph-')
            ? list(day.drafts).filter((_, index) => index === Number(target.slice(10)))
            : target === 'analysis' && day.analysis
              ? [
                  {
                    id: list(state.events).find(
                      (event) =>
                        event.type === 'coach.analysis' &&
                        event.data?.conversationId === session.id &&
                        dayKey(event.at, timezone) === day.day
                    )?.id
                  }
                ]
              : [];
        collect(
          feedback,
          target,
          day.day,
          answers,
          card ? [card] : [day.pack?.writing || {}],
          target === 'analysis' ? `analysis:${day.day}` : null
        );
      }
      collect(day.essay, 'essay', day.day, list(day.rewrites).filter(Boolean), [day.pack?.writing || {}]);
    }
  }
  const rows = [...evidence.values()].sort(order);
  const nodes = nodeProjection(rows);
  return {
    contract: PROGRESS_CONTRACT,
    owner: state.owner || null,
    minimumEvents: MIN_PROGRESS_EVENTS,
    evidence: [...rows].reverse(),
    subjects: aggregates(rows),
    nodes,
    weaknesses: nodes.filter((node) => node.isWeakness),
    sources: distinct(rows.map((event) => JSON.stringify(event.model))).map((key) => {
      const model = JSON.parse(key),
        sourceRows = rows.filter((event) => JSON.stringify(event.model) === key);
      return {
        ...model,
        evidenceIds: sourceRows.map((event) => event.id),
        subjects: aggregates(sourceRows),
        nodes: nodeProjection(sourceRows)
      };
    }),
    // No selected/frozen platform reference model or predictive validation yet.
    // Personal BYOK observations, unknown IDs and local grades never enter it.
    platformReference: { status: 'insufficient', percentage: null, evidenceIds: [] },
    mindMap: {
      id: writingSubject,
      label: '考研英语写作',
      branches: distinct(nodes.map((node) => node.chapter)).map((chapter) => ({
        id: chapter,
        label: chapter,
        nodeIds: nodes.filter((node) => node.chapter === chapter).map((node) => node.id)
      }))
    }
  };
}
