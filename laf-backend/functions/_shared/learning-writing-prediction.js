// Prospective engineering records only. These observations grant neither
// reliable grades nor eligibility for a platform reference experiment.
import { coachSavedRecords } from './learning-coach-records.js';
import { normalizeLearningModelOrigin } from './learning-model-origin.js';
import { writingAnswerHash } from './learning-rubric.js';
import {
  progressNodeIds,
  WRITING_KNOWLEDGE_CONTRACT,
  WRITING_KNOWLEDGE_GRAPH,
  WRITING_KNOWLEDGE_MAPPING,
  WRITING_KNOWLEDGE_NODE_IDS
} from './learning-writing-knowledge.js';

export const WRITING_PREDICTION_CONTRACT = 'writing-prediction-check-v1';
export const WRITING_PREDICTION_POLICY = 'latest-observation-after-five-v1';
const list = (value) => (Array.isArray(value) ? value : []);
const clone = (value) => JSON.parse(JSON.stringify(value));
const canonical = (value) =>
  value && typeof value === 'object'
    ? Array.isArray(value)
      ? value.map(canonical)
      : Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])])
        )
    : value;

// Configuration and explicitly sent parameters matter here; connection display
// names alone cannot combine observations from different model configurations.
export function writingPredictionModelKey(origin) {
  if (!origin) return null;
  const profile = Object.fromEntries(
    Object.entries(origin).filter(([key]) => !['callId', 'requestBinding'].includes(key))
  );
  return JSON.stringify(canonical(profile));
}

function boundOrigin(record, request) {
  return normalizeLearningModelOrigin(record?.model, {
    requestId: request.id,
    modelId: request.modelId,
    binding: request.binding
  });
}

function currentObservations(state, exam) {
  const rows = [],
    events = new Map(list(state.events).map((event) => [event.id, event])),
    originals = new Set();
  for (const conversation of list(state.conversations)) {
    const coach = conversation.coach;
    if (!coach || coach.profile?.exam !== exam || !Array.isArray(coach.days)) continue;
    for (const original of coachSavedRecords(conversation)) {
      // A diagnostic set has one aggregate rubric, not five independent scores.
      if (!original.feedback || original.target === 'diagnostic') continue;
      const request = list(coach.requests).find(
        (item) => item.status === 'completed' && item.resultId === original.feedback.id
      );
      const record = list(coach.learningRecords).find(
        (item) => item.id === request?.resultId && item.requestId === request.id
      );
      const event = events.get(record?.id),
        knowledge = record?.knowledge;
      if (
        !request ||
        request.request?.knowledgeContract !== WRITING_KNOWLEDGE_CONTRACT ||
        event?.type !== 'coach.result' ||
        event.data?.conversationId !== conversation.id ||
        event.data?.requestId !== request.id ||
        knowledge?.contract !== WRITING_KNOWLEDGE_CONTRACT ||
        knowledge.graphVersion !== WRITING_KNOWLEDGE_GRAPH ||
        knowledge.mappingVersion !== WRITING_KNOWLEDGE_MAPPING ||
        knowledge.rubricVersion !== 'writing-dimensions-v1'
      )
        continue;
      const model = boundOrigin(record, request);
      if (!model) continue;
      const identity = JSON.stringify([conversation.id, original.key]);
      if (originals.has(identity)) continue;
      originals.add(identity);
      rows.push({ id: record.id, at: event.at, originalId: original.key, model, observations: knowledge.observations });
    }
  }
  return rows.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

// Called when a generation request is registered, before its questions or any
// answers exist. A future reassessment cannot rewrite this saved judgement.
export function writingPredictionSnapshot(state, coach, { id, modelId, at }) {
  const rows = currentObservations(state, coach.profile.exam).filter(
    (row) => row.model.modelId === modelId && row.at <= at
  );
  return {
    contract: WRITING_PREDICTION_CONTRACT,
    policyVersion: WRITING_PREDICTION_POLICY,
    graphVersion: WRITING_KNOWLEDGE_GRAPH,
    mappingVersion: WRITING_KNOWLEDGE_MAPPING,
    rubricVersion: 'writing-dimensions-v1',
    requestId: id,
    at,
    exam: coach.profile.exam,
    // Five is an unvalidated candidate policy, not a calibrated mastery threshold.
    minimumObservations: 5,
    nodes: WRITING_KNOWLEDGE_NODE_IDS.map((nodeId) => {
      const observed = rows.filter((row) =>
        list(row.observations).some((item) => item.nodeId === nodeId && [0, 1, 2].includes(item.score))
      );
      const latest = observed.at(-1),
        modelKey = writingPredictionModelKey(latest?.model),
        sameModel = observed.filter((row) => writingPredictionModelKey(row.model) === modelKey).slice(-5),
        level =
          sameModel.length === 5
            ? Math.min(
                ...latest.observations
                  .filter((item) => item.nodeId === nodeId && [0, 1, 2].includes(item.score))
                  .map((item) => item.score)
              )
            : null;
      return {
        nodeId,
        status: level === null ? 'insufficient' : 'candidate',
        level,
        evidenceIds: sameModel.map((row) => row.id),
        modelKey
      };
    })
  };
}

// Only for duplicate detection, never a security hash or proof of unseen content.
const promptIdentity = (prompt) =>
  String(prompt || '')
    .normalize('NFKC')
    .replace(/^.*?[：:]/u, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
const promptKey = (prompt) => writingAnswerHash(promptIdentity(prompt));

export function createWritingPredictionChecks(state, conversation, request, output, op) {
  const snapshot = request.predictionSnapshot;
  if (request.request.predictionContract !== WRITING_PREDICTION_CONTRACT || !snapshot) return;
  const seen = new Set(list(state.questions).map((question) => promptKey(question.prompt)));
  for (const session of list(state.conversations)) {
    for (const card of [
      ...list(session.coach?.diagnostic?.cards),
      ...list(session.coach?.days).flatMap((day) => list(day.pack?.cards))
    ])
      seen.add(promptKey(card.prompt));
  }
  for (const [index, card] of output.cards.entries()) {
    const key = promptKey(card.prompt),
      kind =
        { translate_en: 'translation', translate_zh: 'translation', long_sentence: 'sentence_analysis' }[card.kind] ||
        card.kind,
      nodeIds =
        output.kind === 'diagnostic'
          ? [['sentence'], ['collocation'], ['translation'], ['sentence'], ['outline']][index]
          : progressNodeIds({ kind, labels: [card.title] });
    for (const nodeId of nodeIds) {
      (conversation.coach.predictionChecks ||= []).push({
        id: `${op.id}:${card.id}:${nodeId}`,
        contract: WRITING_PREDICTION_CONTRACT,
        generationRequestId: request.id,
        generationResultId: op.id,
        day: request.request.day,
        target: output.kind,
        cardId: card.id,
        nodeId,
        promptKey: key,
        novelty: seen.has(key) ? 'repeated' : 'not_repeated_in_saved_questions',
        // The current model-generated/private-material exercises have not been
        // independently certified as a frozen, unseen reference sample.
        sampleStatus: 'unverified',
        providedExample: Boolean(card.example),
        prior: clone(snapshot.nodes.find((node) => node.nodeId === nodeId))
      });
    }
    seen.add(key);
  }
}

export function recordWritingPredictionAnswer(state, coach, op, card) {
  for (const check of list(coach.predictionChecks).filter(
    (item) =>
      item.cardId === card.id &&
      item.target === op.data.target &&
      (item.target === 'diagnostic' || item.day === op.data.day) &&
      !item.answerId
  )) {
    const generation = list(state.events).findIndex((event) => event.id === check.generationResultId);
    const help = list(state.events)
      .slice(generation + 1)
      .filter(
        (event) =>
          event.data?.conversationId === op.data.conversationId &&
          ['hint.add', 'assessment.assist', 'strategy.set', 'model.request'].includes(event.type)
      );
    Object.assign(check, {
      answerId: op.id,
      answeredAt: op.at,
      inputMode: op.data.predictionContract === WRITING_PREDICTION_CONTRACT ? 'text' : 'unknown',
      assistanceEventIds: help.map((event) => event.id)
    });
  }
}

export function recordWritingPredictionFeedback(coach, request, record) {
  if (!request.request.target.startsWith('card-')) return;
  const cardId = request.request.target.slice(5);
  for (const check of list(coach.predictionChecks).filter(
    (item) =>
      item.target === 'daily' &&
      item.day === request.request.day &&
      item.cardId === cardId &&
      item.answerId &&
      !item.feedbackId
  ))
    check.feedbackId = record.id;
}

// A read-only audit of current originals. Deleted or superseded records are not
// resurrected from event payloads. No percentages until an independently fixed
// reference model/version, sample plan and end-to-end input coverage exist.
export function writingPredictionAudit(state = {}) {
  const events = new Map(list(state.events).map((event, index) => [event.id, { event, index }]));
  const checks = [];
  for (const conversation of list(state.conversations)) {
    const coach = conversation.coach;
    if (!coach) continue;
    for (const saved of list(coach.predictionChecks)) {
      if (saved.contract !== WRITING_PREDICTION_CONTRACT) continue;
      const request = list(coach.requests).find((item) => item.id === saved.generationRequestId),
        snapshot = request?.predictionSnapshot,
        generation = events.get(saved.generationResultId),
        registration = [...events.values()].find(
          ({ event }) =>
            event.type === 'coach.request' &&
            event.data?.requestId === request?.id &&
            event.data?.conversationId === conversation.id
        ),
        target =
          saved.target === 'diagnostic' ? coach.diagnostic : list(coach.days).find((day) => day.day === saved.day),
        card = list(target?.cards || target?.pack?.cards).find((item) => item.id === saved.cardId),
        answer = list(target?.answers).find((item) => item.id === saved.answerId && item.cardId === saved.cardId),
        answered = events.get(answer?.id),
        feedback = saved.target === 'daily' ? target?.feedback?.[`card-${saved.cardId}`] : null,
        record = list(coach.learningRecords).find((item) => item.id === saved.feedbackId),
        feedbackRequest = list(coach.requests).find(
          (item) => item.id === record?.requestId && item.resultId === record.id
        ),
        model = feedbackRequest && boundOrigin(record, feedbackRequest),
        outcome = list(record?.knowledge?.observations).filter(
          (item) => item.nodeId === saved.nodeId && [0, 1, 2].includes(item.score)
        ),
        reasons = [];
      if (!card || promptKey(card.prompt) !== saved.promptKey) continue;
      const chronological =
        registration &&
        generation &&
        answered &&
        registration.index < generation.index &&
        generation.index < answered.index &&
        generation.event.type === 'coach.result' &&
        generation.event.data?.requestId === request.id &&
        generation.event.data?.conversationId === conversation.id &&
        answered.event.type === 'coach.answer' &&
        answered.event.data?.conversationId === conversation.id &&
        answered.event.data?.cardId === saved.cardId &&
        answered.event.data?.target === saved.target;
      const prospective =
        snapshot?.contract === WRITING_PREDICTION_CONTRACT &&
        snapshot.policyVersion === WRITING_PREDICTION_POLICY &&
        snapshot.graphVersion === WRITING_KNOWLEDGE_GRAPH &&
        snapshot.mappingVersion === WRITING_KNOWLEDGE_MAPPING &&
        snapshot.rubricVersion === 'writing-dimensions-v1' &&
        snapshot.requestId === request.id &&
        JSON.stringify(saved.prior) ===
          JSON.stringify(list(snapshot.nodes).find((node) => node.nodeId === saved.nodeId)) &&
        chronological;
      if (!prospective) reasons.push('prospective_binding_unavailable');
      if (!answer) reasons.push('answer_pending');
      if (saved.inputMode !== 'text') reasons.push('input_provenance_unavailable');
      if (saved.novelty !== 'not_repeated_in_saved_questions') reasons.push('repeated_question');
      if (saved.providedExample || list(saved.assistanceEventIds).length) reasons.push('assisted');
      if (saved.prior?.level === null || ![0, 1, 2].includes(saved.prior?.level)) reasons.push('prior_insufficient');
      if (saved.target === 'diagnostic') reasons.push('aggregate_feedback_not_per_item');
      const feedbackEvent = events.get(saved.feedbackId),
        paired =
          prospective &&
          answer &&
          feedback?.id === saved.feedbackId &&
          feedbackEvent?.event.type === 'coach.result' &&
          feedbackEvent.event.data?.requestId === feedbackRequest?.id &&
          feedbackEvent.event.data?.conversationId === conversation.id &&
          answered.index < feedbackEvent.index &&
          record?.knowledge?.contract === WRITING_KNOWLEDGE_CONTRACT &&
          record.knowledge.graphVersion === WRITING_KNOWLEDGE_GRAPH &&
          record.knowledge.mappingVersion === WRITING_KNOWLEDGE_MAPPING &&
          record.knowledge.rubricVersion === 'writing-dimensions-v1' &&
          outcome.length > 0 &&
          outcome.every((item) =>
            list(feedback.dimensions).some(
              (dimension) =>
                dimension.name === item.dimension &&
                dimension.score === item.score &&
                list(dimension.evidence).some(
                  (quote) => typeof quote === 'string' && quote && answer.answer.includes(quote)
                )
            )
          ) &&
          Boolean(model);
      if (!paired) reasons.push('bound_feedback_unavailable');
      const modelKey = writingPredictionModelKey(model);
      if (!modelKey || modelKey !== saved.prior?.modelKey) reasons.push('model_profile_mismatch');
      if (model?.source !== 'platform') reasons.push('not_platform_reference');
      if (!model?.upstreamVersion) reasons.push('upstream_version_unverified');
      reasons.push('sample_plan_unverified');
      checks.push({
        id: saved.id,
        conversationId: conversation.id,
        nodeId: saved.nodeId,
        generationRequestId: saved.generationRequestId,
        generationResultId: saved.generationResultId,
        answerId: answer?.id || null,
        feedbackId: paired ? record.id : null,
        priorLevel: saved.prior?.level ?? null,
        outcomeLevel: paired ? Math.min(...outcome.map((item) => item.score)) : null,
        paired: Boolean(paired),
        reasons,
        modelKey
      });
    }
  }
  return {
    contract: WRITING_PREDICTION_CONTRACT,
    policyVersion: WRITING_PREDICTION_POLICY,
    status: 'insufficient',
    percentage: null,
    eligibleReferenceCount: 0,
    referenceProtocol: null,
    inputCoverage: { text: checks.some((check) => check.paired) ? 'recorded' : 'insufficient', image: 'unverified' },
    checks,
    counts: {
      scheduled: checks.length,
      answered: checks.filter((check) => check.answerId).length,
      paired: checks.filter((check) => check.paired).length
    }
  };
}
