import { describe, it, expect } from 'vitest';
import { applyLearningOperation } from '@/services/learning/learning-domain.js';
import { learningProgressReadModel } from '@/services/learning/learning-progress-read-model.js';
import { prepareLearningRestore } from '@/services/learning/learning-backup.js';
import {
  WRITING_COACH_CONTRACT,
  normalizeCoachRequest,
  coachInputFor
} from '../../laf-backend/functions/_shared/learning-writing-coach.js';
import {
  WRITING_PREDICTION_CONTRACT,
  writingPredictionSnapshot,
  writingPredictionAudit,
  writingPredictionModelKey
} from '../../laf-backend/functions/_shared/learning-writing-prediction.js';
import { writingKnowledgeBinding } from '../../laf-backend/functions/_shared/learning-writing-knowledge.js';
import { progressFixture } from '../fixtures/learning-progress.js';
import { coachFixture } from '../fixtures/writing-coach.js';

// Synthetic protocol/flow checks only. No predictive-accuracy evidence.
const MODEL = 'byok_progress_qa',
  DAY = '2026-11-02',
  AT = Date.parse('2026-11-02T03:00:00Z');
const origin = (id, patch = {}) => ({
  contract: 'learning-model-origin-v1',
  callId: id,
  modelId: MODEL,
  requestBinding: 'fixture-binding',
  source: 'byok',
  provider: 'Synthetic provider',
  actualModel: 'fixture-model',
  configurationVersion: 'a'.repeat(64),
  upstreamVersion: null,
  inferencePolicy: 'fixture-policy',
  outputContract: WRITING_COACH_CONTRACT,
  schemaDigest: 'b'.repeat(64),
  sentParameters: { max_tokens: 8192 },
  verificationModels: [],
  ...patch
});
function fixture(count = 5) {
  const state = progressFixture(count, 0),
    coach = state.conversations[0].coach;
  coach.contract = WRITING_COACH_CONTRACT;
  coach.materialIds = [];
  coach.diagnostic = {
    cards: [{ id: 'old-diagnostic', prompt: 'Synthetic old prompt' }],
    answers: [{ id: 'old-diagnostic-answer', cardId: 'old-diagnostic', answer: 'Synthetic diagnostic', at: AT - 10 }],
    feedback: { dimensions: [] }
  };
  coach.learningRecords = coach.requests.map((request, index) => {
    request.binding = 'fixture-binding';
    request.request.knowledgeContract = 'writing-knowledge-binding-v1';
    return {
      id: request.resultId,
      requestId: request.id,
      model: origin(request.id),
      knowledge: writingKnowledgeBinding(coach.days[0].feedback[`card-card${index}`], { kind: 'translate_en' })
    };
  });
  return state;
}
function harness(initial = fixture()) {
  let state = initial,
    serial = 0;
  const apply = (type, data = {}) => {
    state = applyLearningOperation(state, {
      id: `prediction-${++serial}`,
      type,
      at: AT + serial,
      data: { conversationId: 'writing', explicit: true, day: DAY, ...data }
    }).state;
    return state.events.at(-1).id;
  };
  const coach = () => state.conversations[0].coach;
  const generate = ({ gated = true, repeated = false, example = '' } = {}) => {
    const request = normalizeCoachRequest({
      contract: WRITING_COACH_CONTRACT,
      phase: 'daily',
      day: DAY,
      target: 'daily',
      exam: 'english2',
      sources: [],
      ...(gated ? { exerciseContract: 'writing-exercises-v1', predictionContract: WRITING_PREDICTION_CONTRACT } : {}),
      ...coachInputFor(coach(), undefined, 'daily', 'daily')
    });
    apply('coach.request', { requestId: 'generate', request, modelId: MODEL, binding: 'fixture-binding' });
    const output = coachFixture(request);
    output.cards.forEach((card, index) =>
      Object.assign(card, { prompt: `Synthetic unseen prompt ${index}`, example: '' })
    );
    Object.assign(output.cards[0], { prompt: '请补全句子：They work ___ accordance with the policy.', example });
    if (repeated) coach().days[0].pack.cards[0].prompt = output.cards[0].prompt;
    apply('coach.result', { requestId: 'generate', output, modelOrigin: origin('generate') });
  };
  const answer = (patch = {}) =>
    apply('coach.answer', {
      target: 'daily',
      cardId: 'c0',
      answer: 'in',
      predictionContract: WRITING_PREDICTION_CONTRACT,
      ...patch
    });
  const feedback = () => {
    const day = coach().days.at(-1);
    const request = normalizeCoachRequest({
      contract: WRITING_COACH_CONTRACT,
      phase: 'feedback',
      target: 'card-c0',
      exam: 'english2',
      day: DAY,
      sources: [],
      feedbackVersion: 2,
      dimensionContract: 'writing-dimensions-v1',
      knowledgeContract: 'writing-knowledge-binding-v1',
      ...coachInputFor(coach(), day, 'feedback', 'card-c0')
    });
    apply('coach.request', { requestId: 'feedback', request, modelId: MODEL, binding: 'fixture-binding' });
    return apply('coach.result', {
      requestId: 'feedback',
      modelOrigin: origin('feedback'),
      output: {
        kind: 'feedback',
        target: 'card-c0',
        feedbackVersion: 2,
        lines: [{ original: 'in', advice: 'Synthetic feedback', rewrite: 'in' }],
        weaknesses: [],
        weaknessEvidence: [],
        phrases: [],
        errors: [],
        dimensions: [{ name: '搭配', score: 2, evidence: ['in'], comment: 'Synthetic criterion' }]
      }
    });
  };
  return { state: () => state, coach, apply, generate, answer, feedback };
}

describe('prospective writing first-answer engineering chain', () => {
  it('freezes a candidate judgement before any new question or answer, then binds the first saved answer and feedback', () => {
    const h = harness();
    h.generate();
    const request = h.coach().requests.find((item) => item.id === 'generate'),
      frozen = JSON.stringify(request.predictionSnapshot);
    const check = h.coach().predictionChecks[0];
    expect(check).toMatchObject({
      nodeId: 'collocation',
      novelty: 'not_repeated_in_saved_questions',
      prior: {
        level: 2,
        status: 'candidate',
        evidenceIds: ['receipt-0', 'receipt-1', 'receipt-2', 'receipt-3', 'receipt-4']
      }
    });
    expect(writingPredictionAudit(h.state()).counts).toEqual({ scheduled: 8, answered: 0, paired: 0 });
    const answerId = h.answer(),
      feedbackId = h.feedback(),
      audit = writingPredictionAudit(h.state());
    expect(audit.checks[0]).toMatchObject({ answerId, feedbackId, priorLevel: 2, outcomeLevel: 2, paired: true });
    expect(audit.checks[0].reasons).toEqual([
      'not_platform_reference',
      'upstream_version_unverified',
      'sample_plan_unverified'
    ]);
    expect(audit).toMatchObject({
      status: 'insufficient',
      percentage: null,
      eligibleReferenceCount: 0,
      inputCoverage: { text: 'recorded', image: 'unverified' }
    });
    expect(JSON.stringify(request.predictionSnapshot)).toBe(frozen);
    expect(learningProgressReadModel(h.state()).predictionAudit).toEqual(audit);
  });
  it('never backfills the new snapshot/check contract on legacy generation or restored historical records', () => {
    const h = harness();
    h.generate({ gated: false });
    h.answer();
    h.feedback();
    expect(h.coach().predictionChecks).toBeUndefined();
    expect(h.coach().requests.find((item) => item.id === 'generate').predictionSnapshot).toBeUndefined();
    expect(writingPredictionAudit(h.state()).checks).toEqual([]);
  });
  it.each([0, 1, 4, 5, 6])(
    'uses only the last five current independent originals for a provisional policy: %i observations',
    (count) => {
      const state = fixture(count),
        before = JSON.stringify(state);
      const node = writingPredictionSnapshot(state, state.conversations[0].coach, {
        id: 'future',
        modelId: MODEL,
        at: AT
      }).nodes.find((item) => item.nodeId === 'collocation');
      expect(node.level).toBe(count >= 5 ? 2 : null);
      expect(node.evidenceIds).toHaveLength(Math.min(5, count));
      expect(JSON.stringify(state)).toBe(before);
    }
  );
  it.each(['configurationVersion', 'actualModel', 'sentParameters', 'inferencePolicy', 'schemaDigest', 'source'])(
    'does not combine different %s profiles under one connection name',
    (field) => {
      const state = fixture(),
        coach = state.conversations[0].coach;
      const patch = {
        configurationVersion: 'c'.repeat(64),
        actualModel: 'different-model',
        sentParameters: { max_tokens: 4096 },
        inferencePolicy: 'different-policy',
        schemaDigest: 'd'.repeat(64),
        source: 'platform'
      };
      coach.learningRecords.at(-1).model[field] = patch[field];
      const node = writingPredictionSnapshot(state, coach, { id: 'future', modelId: MODEL, at: AT }).nodes.find(
        (item) => item.nodeId === 'collocation'
      );
      expect(node.level).toBeNull();
      expect(node.evidenceIds).toEqual(['receipt-4']);
    }
  );
  it('ignores model call IDs and object property ordering when grouping identical inference profiles', () => {
    expect(writingPredictionModelKey(origin('one'))).toBe(
      writingPredictionModelKey(Object.fromEntries(Object.entries(origin('two')).reverse()))
    );
  });
  it.each(['repeat', 'example', 'hint', 'method', 'unknown-input'])(
    'preserves a bound observation while honestly excluding a %s answer',
    (reason) => {
      const h = harness();
      h.generate({ repeated: reason === 'repeat', example: reason === 'example' ? 'Synthetic provided example' : '' });
      if (reason === 'hint')
        h.state().events.push({ id: 'help', type: 'hint.add', at: AT + 3, data: { conversationId: 'writing' } });
      if (reason === 'method')
        h.apply('strategy.set', {
          method: 'hint',
          source: 'self_report',
          reason: 'Synthetic requested help',
          evidenceIds: [],
          deliveryManaged: true
        });
      h.answer(reason === 'unknown-input' ? { predictionContract: undefined } : {});
      h.feedback();
      const check = writingPredictionAudit(h.state()).checks[0];
      expect(check.paired).toBe(true);
      expect(check.reasons).toContain(
        reason === 'repeat'
          ? 'repeated_question'
          : reason === 'unknown-input'
            ? 'input_provenance_unavailable'
            : 'assisted'
      );
    }
  );
  it.each([
    'deleted-original',
    'superseded-feedback',
    'unknown-map',
    'wrong-score',
    'wrong-request',
    'event-order',
    'changed-prior'
  ])('cannot reconstruct a valid pair from %s history', (reason) => {
    const h = harness();
    h.generate();
    h.answer();
    h.feedback();
    const day = h.coach().days.at(-1),
      check = h.coach().predictionChecks[0];
    if (reason === 'deleted-original') day.answers = [];
    if (reason === 'superseded-feedback')
      day.feedback['card-c0'] = { ...day.feedback['card-c0'], id: 'replacement-feedback' };
    if (reason === 'unknown-map') h.coach().learningRecords.at(-1).knowledge.mappingVersion = 'future-map';
    if (reason === 'wrong-score') h.coach().learningRecords.at(-1).knowledge.observations[0].score = 0;
    if (reason === 'wrong-request') h.state().events.at(-1).data.requestId = 'another-request';
    if (reason === 'event-order') h.state().events.unshift(h.state().events.pop());
    if (reason === 'changed-prior') check.prior.level = 0;
    expect(writingPredictionAudit(h.state()).checks[0].paired).toBe(false);
  });
  it('does not use superseded historical feedback to manufacture five prior originals', () => {
    const state = fixture(4),
      coach = state.conversations[0].coach;
    coach.learningRecords.push({ ...coach.learningRecords[0], id: 'superseded-feedback' });
    const node = writingPredictionSnapshot(state, coach, { id: 'future', modelId: MODEL, at: AT }).nodes.find(
      (item) => item.nodeId === 'collocation'
    );
    expect(node.level).toBeNull();
    expect(node.evidenceIds).toHaveLength(4);
  });
  it('keeps aggregate diagnostic feedback out of per-item predictive outcomes', () => {
    const h = harness();
    h.coach().diagnostic = null;
    const request = normalizeCoachRequest({
      contract: WRITING_COACH_CONTRACT,
      phase: 'diagnostic',
      target: 'diagnostic',
      day: DAY,
      exam: 'english2',
      sources: [],
      exerciseContract: 'writing-exercises-v1',
      predictionContract: WRITING_PREDICTION_CONTRACT,
      ...coachInputFor(h.coach(), null, 'diagnostic', 'diagnostic')
    });
    h.apply('coach.request', { requestId: 'diagnostic', request, modelId: MODEL, binding: 'fixture-binding' });
    h.apply('coach.result', { requestId: 'diagnostic', output: coachFixture(request) });
    h.apply('coach.answer', {
      target: 'diagnostic',
      cardId: 'd1',
      answer: 'Synthetic analysis',
      predictionContract: WRITING_PREDICTION_CONTRACT
    });
    const audit = writingPredictionAudit(h.state());
    expect(audit.counts).toEqual({ scheduled: 5, answered: 1, paired: 0 });
    expect(audit.checks[0].reasons).toContain('aggregate_feedback_not_per_item');
  });
  it('rejects unsupported or misplaced protocol values and preserves the original on duplicate submission', () => {
    const h = harness();
    h.generate();
    h.answer();
    const before = JSON.stringify(h.state());
    expect(() => h.answer()).toThrow('本卡已提交');
    expect(JSON.stringify(h.state())).toBe(before);
    const request = h.coach().requests.find((item) => item.id === 'generate').request;
    expect(() => normalizeCoachRequest({ ...request, exerciseContract: undefined })).toThrow('首答核对合同');
    expect(() => normalizeCoachRequest({ ...request, predictionContract: 'invented' })).toThrow('首答核对合同');
  });
  it('survives the existing export/restore path without rewriting the prospective snapshot or old originals', () => {
    const h = harness();
    h.generate();
    h.answer();
    h.feedback();
    const restored = prepareLearningRestore(fixture(), JSON.stringify(h.state()), { now: AT + 100 }).state;
    expect(writingPredictionAudit(restored)).toEqual(writingPredictionAudit(h.state()));
    expect(restored.conversations[0].coach.requests.find((item) => item.id === 'generate').predictionSnapshot).toEqual(
      h.coach().requests.find((item) => item.id === 'generate').predictionSnapshot
    );
  });
});
