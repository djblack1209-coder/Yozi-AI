import { describe, expect, it } from 'vitest';
import {
  learningProgressReadModel,
  MIN_PROGRESS_EVENTS,
  PROGRESS_NODE_RULES,
  progressNodeIds
} from '@/services/learning/learning-progress-read-model.js';
import { knowledgeGraphSeed } from '@/services/learning/knowledge-graph-seed.js';
import {
  WRITING_KNOWLEDGE_NODE_IDS,
  writingKnowledgeBinding
} from '../../laf-backend/functions/_shared/learning-writing-knowledge.js';
import { progressBoundaryFixture, progressFixture, progressRound3Fixture } from '../fixtures/learning-progress.js';
const writing = (model) => model.subjects.find((subject) => subject.id === 'kaoyan-english-writing');
const grammar = (model) => writing(model).dimensions.find((dimension) => dimension.id === '语法');

describe('learning progress: canonical, traceable, read-only observations', () => {
  it('empty state has no percentages or fabricated mastery, including all 26 seed nodes', () => {
    const model = learningProgressReadModel();
    expect(MIN_PROGRESS_EVENTS).toBe(5);
    expect(model.evidence).toEqual([]);
    expect(model.nodes).toHaveLength(26);
    expect(model.nodes.every((node) => node.status === 'insufficient' && node.level === null)).toBe(true);
    expect(writing(model).dimensions.every((dimension) => dimension.percentage === null)).toBe(true);
    expect(model.platformReference).toEqual({ status: 'insufficient', percentage: null, evidenceIds: [] });
  });
  it('partial legacy records without event identities cannot break the website summary or invent traceable samples', () => {
    const state = progressFixture(0, 0);
    state.attempts = [{ at: 1 }, { at: 1 }];
    expect(learningProgressReadModel(state).evidence).toEqual([]);
  });
  it('four independent events are insufficient; exactly five unlock the ratio', () => {
    const below = learningProgressReadModel(progressFixture(4, 4));
    expect(grammar(below)).toMatchObject({ status: 'insufficient', denominator: 4, percentage: null });
    expect(below.subjects.find((subject) => subject.id === '数学').accuracy.percentage).toBeNull();
    expect(grammar(learningProgressReadModel(progressFixture(5, 5)))).toMatchObject({
      status: 'available',
      numerator: 4,
      denominator: 5,
      percentage: 80
    });
  });
  it.each([4, 5])('gates subject, node, weakness list and mind map consistently at %i events', (count) => {
    const model = learningProgressReadModel(progressBoundaryFixture(count));
    const sufficient = count === 5;
    expect(grammar(model)).toMatchObject({
      status: sufficient ? 'available' : 'insufficient',
      numerator: 0,
      denominator: count,
      percentage: sufficient ? 0 : null
    });
    expect(model.subjects.find((subject) => subject.id === '数学').accuracy).toMatchObject({
      denominator: count,
      percentage: sufficient ? 100 : null
    });
    for (const projection of [model, ...model.sources.filter((source) => source.source === 'byok')]) {
      const node = projection.nodes.find((item) => item.id === 'agreement');
      expect(node).toMatchObject({
        status: sufficient ? 'observed' : 'insufficient',
        level: sufficient ? 1 : null,
        statusLabel: sufficient ? '可改进' : '数据不足',
        sampleCount: count,
        isWeakness: sufficient,
        levelEventIds: sufficient ? ['receipt-4'] : [],
        weaknessEventIds: sufficient ? Array.from({ length: count }, (_, i) => `receipt-${i}`) : []
      });
    }
    const mindNodes = model.mindMap.branches.flatMap((branch) =>
      model.nodes.filter((node) => branch.nodeIds.includes(node.id))
    );
    expect(
      mindNodes
        .filter((node) => node.isWeakness)
        .map((node) => node.id)
        .sort()
    ).toEqual(model.weaknesses.map((node) => node.id).sort());
    expect(model.weaknesses.some((node) => node.id === 'agreement')).toBe(sufficient);
    if (!sufficient) {
      expect(model.weaknesses).toEqual([]);
      expect(model.nodes.every((node) => node.level === null && !node.isWeakness)).toBe(true);
    }
  });
  it('round 3 uses final errors/evidence, never removed errors, summary labels or historical feedback', () => {
    const state = progressRound3Fixture();
    const day = state.conversations[0].coach.days[0];
    const before = JSON.stringify(state);
    const model = learningProgressReadModel(state);
    expect(grammar(model)).toMatchObject({ numerator: 0, denominator: 5, percentage: 0 });
    expect(writing(model).dimensions.find((dimension) => dimension.id === '搭配')).toMatchObject({
      numerator: 5,
      denominator: 5,
      percentage: 100
    });
    // 冠词只留在兼容标签里，最终 errors 没有它，不能重新登记为节点错误。
    expect(model.weaknesses.map((node) => node.id).sort()).toEqual(['agreement', 'sentence', 'translation']);
    expect(model.nodes.find((node) => node.id === 'tense')).toMatchObject({
      level: null,
      sampleCount: 0,
      isWeakness: false,
      evidenceIds: []
    });
    expect(model.nodes.find((node) => node.id === 'collocation')).toMatchObject({ level: 2, isWeakness: false });
    expect(model.evidence).toHaveLength(5);
    expect(JSON.stringify(state)).toBe(before);
    for (const feedback of Object.values(day.feedback)) {
      feedback.weaknesses = ['时态'];
      feedback.errors[0].rule = '时态'; // rule text is not a node label.
    }
    day.feedbackHistory = {
      'card-card0': [{ errors: [{ dimension: '语法', label: '时态' }], weaknesses: ['时态'] }]
    };
    expect(learningProgressReadModel(state)).toEqual(model);
  });
  it('round 3 null dimensions never enter subject, source or question-type attainment denominators', () => {
    const state = progressRound3Fixture();
    const model = learningProgressReadModel(state);
    for (const subjects of [model.subjects, ...model.sources.map((source) => source.subjects)]) {
      const expression = subjects[0].dimensions.find((dimension) => dimension.id === '表达');
      expect(expression).toMatchObject({ numerator: 3, denominator: 3, percentage: null });
      expect(expression.denominatorEventIds).toEqual(['receipt-2', 'receipt-3', 'receipt-4']);
    }
    // Only one dimension is scored; the other three nulls must not turn a
    // successful assessed task into a failure or add an unassessed task.
    for (const [index, feedback] of Object.values(state.conversations[0].coach.days[0].feedback).entries()) {
      feedback.errors = [];
      feedback.weaknessEvidence = [];
      feedback.dimensions.forEach((dimension) => {
        dimension.score = index < 4 && dimension.name === '搭配' ? 2 : null;
      });
    }
    const partial = learningProgressReadModel(state);
    expect(writing(partial).questionTypes[0].attainment).toMatchObject({
      numerator: 4,
      denominator: 4,
      percentage: null,
      denominatorEventIds: ['receipt-0', 'receipt-1', 'receipt-2', 'receipt-3']
    });
  });
  it('verification metadata is opaque and optional; no internal property is read', () => {
    const state = progressRound3Fixture();
    const expected = learningProgressReadModel(state);
    const opaque = new Proxy(
      {},
      {
        get() {
          throw new Error('verification internals read');
        },
        ownKeys() {
          throw new Error('verification internals enumerated');
        }
      }
    );
    for (const feedback of Object.values(state.conversations[0].coach.days[0].feedback))
      feedback.coachVerification = opaque;
    expect(learningProgressReadModel(state)).toEqual(expected);
    for (const feedback of Object.values(state.conversations[0].coach.days[0].feedback))
      delete feedback.coachVerification;
    expect(learningProgressReadModel(state)).toEqual(expected);
  });
  it.each([1, 2])('round %i receipts remain readable without round 3 fields', (round) => {
    const state = progressBoundaryFixture(5, 0);
    if (round === 1)
      for (const feedback of Object.values(state.conversations[0].coach.days[0].feedback)) {
        delete feedback.errors;
        delete feedback.weaknessEvidence;
      }
    const model = learningProgressReadModel(state);
    expect(model.evidence).toHaveLength(5);
    expect(grammar(model)).toMatchObject({ numerator: 0, denominator: 5, percentage: 0 });
    expect(model.nodes.find((node) => node.id === 'sentence')).toMatchObject({ level: 1, isWeakness: true });
  });
  it('separates rubric attainment from objective correctness and traces both counts to event IDs', () => {
    const state = progressFixture(),
      before = JSON.stringify(state);
    const model = learningProgressReadModel(state);
    const accuracy = model.subjects.find((subject) => subject.id === '数学').accuracy;
    expect(accuracy).toMatchObject({ numerator: 5, denominator: 6, percentage: 83 });
    expect(accuracy.numeratorEventIds).toEqual(state.attempts.slice(0, 5).map((attempt) => attempt.id));
    expect(grammar(model)).toMatchObject({ kind: 'rubric-attainment', numerator: 4, denominator: 6, percentage: 67 });
    expect(grammar(model).denominatorEventIds).toEqual(Array.from({ length: 6 }, (_, i) => `receipt-${i}`));
    expect(writing(model).accuracy.denominator).toBe(0);
    expect(writing(model).attainment).toMatchObject({
      kind: 'rubric-attainment',
      numerator: 4,
      denominator: 6,
      percentage: 67
    });
    expect(writing(model).attainment.numeratorEventIds).toEqual(['receipt-0', 'receipt-1', 'receipt-2', 'receipt-3']);
    expect(writing(model).attainment.denominatorEventIds).toEqual(grammar(model).denominatorEventIds);
    expect(model.subjects.find((subject) => subject.id === '数学').attainment.denominator).toBe(0);
    expect(writing(model).questionTypes[0].attainment.denominator).toBe(6);
    const node = model.nodes.find((item) => item.id === 'sentence');
    expect(node).toMatchObject({
      status: 'observed',
      level: 1,
      statusLabel: '可改进',
      isWeakness: true,
      levelEventIds: ['receipt-5']
    });
    expect(node.sampleCount).toBe(node.sampleEventIds.length);
    for (const id of grammar(model).denominatorEventIds)
      expect(state.events.some((event) => event.id === id)).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
  });
  it.each([4, 5])(
    'subject attainment floor and exact event IDs stay separate in aggregate and source views (%i)',
    (count) => {
      const state = progressFixture(count, count);
      const model = learningProgressReadModel(state);
      for (const projection of [model, ...model.sources.filter((source) => source.source === 'byok')]) {
        const attainment = writing(projection).attainment;
        expect(attainment).toMatchObject({ denominator: count, numerator: 4, percentage: count === 5 ? 80 : null });
        expect(attainment.denominatorEventIds).toEqual(Array.from({ length: count }, (_, i) => `receipt-${i}`));
        for (const id of [...attainment.denominatorEventIds, ...attainment.numeratorEventIds])
          expect(state.events.some((event) => event.id === id && event.type === 'coach.result')).toBe(true);
      }
      const objective = model.subjects.find((subject) => subject.id === '数学').accuracy;
      expect(objective.denominatorEventIds).toEqual(state.attempts.map((attempt) => attempt.id));
      expect(
        objective.denominatorEventIds.some((id) => writing(model).attainment.denominatorEventIds.includes(id))
      ).toBe(false);
    }
  );
  it('duplicate attempts, receipts and reassessment history never increase the denominator', () => {
    const state = progressFixture();
    state.attempts.push(structuredClone(state.attempts[0]), { ...state.attempts[0], id: 'repeated-first' });
    state.events.push(structuredClone(state.events[1]));
    state.conversations[0].coach.days[0].feedbackHistory = {
      'card-card0': [state.conversations[0].coach.days[0].feedback['card-card0']]
    };
    const model = learningProgressReadModel(state);
    expect(grammar(model).denominator).toBe(6);
    expect(model.subjects.find((subject) => subject.id === '数学').accuracy.denominator).toBe(6);
  });
  it.each(['pending', 'closed', 'failed', 'rejected'])(
    'excludes %s coach requests even if a stale feedback object exists',
    (status) => {
      const state = progressFixture(5, 0);
      state.conversations[0].coach.requests[0].status = status;
      expect(grammar(learningProgressReadModel(state))).toMatchObject({
        status: 'insufficient',
        denominator: 4,
        percentage: null
      });
    }
  );
  it.each(['receipt', 'contract', 'version', 'evidence', 'score', 'foreign-owner', 'original'])(
    'excludes unbound %s feedback rather than counting it as wrong',
    (reason) => {
      const state = progressFixture(1, 0),
        coach = state.conversations[0].coach;
      if (reason === 'receipt') state.events = state.events.filter((event) => event.type !== 'coach.result');
      if (reason === 'contract') delete coach.requests[0].request.dimensionContract;
      if (reason === 'version') coach.days[0].feedback['card-card0'].feedbackVersion = 1;
      if (reason === 'evidence')
        coach.days[0].feedback['card-card0'].dimensions.forEach((dimension) => (dimension.evidence = []));
      if (reason === 'score')
        coach.days[0].feedback['card-card0'].dimensions.forEach((dimension) => (dimension.score = null));
      if (reason === 'foreign-owner') state.events[1].data.conversationId = 'other';
      if (reason === 'original') coach.days[0].answers = [];
      expect(grammar(learningProgressReadModel(state)).denominator).toBe(0);
    }
  );
  it('BYOK is separately identified by saved request ID; unknown sources never become platform evidence', () => {
    const state = progressFixture();
    state.conversations[0].coach.requests[0].modelId = 'old-arbitrary-model-id';
    const model = learningProgressReadModel(state);
    expect(model.sources.find((source) => source.source === 'byok').evidenceIds).toHaveLength(5);
    expect(model.sources.find((source) => source.source === 'unknown').evidenceIds).toEqual(['receipt-0']);
    expect(model.sources.find((source) => source.source === 'byok').subjects[0].dimensions[0].denominator).toBe(5);
    expect(model.platformReference.evidenceIds).toEqual([]);
    expect(model.platformReference.percentage).toBeNull();
  });
  it('a five-card mixed diagnostic is one event, not five independent samples', () => {
    const state = progressFixture(1, 0),
      coach = state.conversations[0].coach,
      day = coach.days[0];
    coach.diagnostic = {
      cards: Array.from({ length: 5 }, (_, i) => ({ id: `d${i}`, title: '摸底', prompt: '合成摸底题' })),
      answers: Array.from({ length: 5 }, (_, i) => ({
        id: `da${i}`,
        cardId: `d${i}`,
        answer: 'Synthetic',
        at: day.answers[0].at
      })),
      feedback: { ...day.feedback['card-card0'], target: 'diagnostic' }
    };
    coach.requests[0].request.target = 'diagnostic';
    coach.days = [];
    const model = learningProgressReadModel(state);
    expect(grammar(model).denominator).toBe(1);
    expect(model.evidence[0].learningEventIds).toHaveLength(5);
  });
  it('a diagnostic assessed on a later day remains tied to its actual result and originals', () => {
    const state = progressFixture(1, 0),
      coach = state.conversations[0].coach,
      day = coach.days[0];
    coach.diagnostic = {
      cards: day.pack.cards,
      answers: day.answers,
      feedback: { ...day.feedback['card-card0'], target: 'diagnostic' }
    };
    coach.requests[0].request.target = 'diagnostic';
    coach.requests[0].request.day = '2026-11-01';
    coach.days = [];
    const before = JSON.stringify(state);
    const model = learningProgressReadModel(state);
    expect(model.evidence).toHaveLength(1);
    expect(model.evidence[0]).toMatchObject({
      id: 'receipt-0',
      learningEventIds: ['writing-answer-0'],
      receiptEventIds: ['receipt-0']
    });
    expect(JSON.stringify(state)).toBe(before);
  });
  it('an explicit final empty error list cannot resurrect a removed weakness from the compatibility view', () => {
    const state = progressBoundaryFixture(5, 0);
    for (const feedback of Object.values(state.conversations[0].coach.days[0].feedback)) feedback.errors = [];
    const model = learningProgressReadModel(state);
    expect(model.nodes.find((node) => node.id === 'agreement').sampleCount).toBe(0);
    expect(model.nodes.find((node) => node.id === 'sentence').sampleCount).toBe(5);
  });
  it('legacy evidence labels cannot leak from a different dimension quotation', () => {
    const state = progressBoundaryFixture(5, 0);
    for (const feedback of Object.values(state.conversations[0].coach.days[0].feedback)) {
      delete feedback.errors;
      feedback.weaknessEvidence[0].quote = 'A separate quotation.';
    }
    expect(learningProgressReadModel(state).nodes.find((node) => node.id === 'agreement').sampleCount).toBe(0);
  });
  it('new receipts use the saved graph binding; missing, foreign or unknown versions cannot fall back to remapping', () => {
    const state = progressFixture(1, 0),
      coach = state.conversations[0].coach,
      feedback = coach.days[0].feedback['card-card0'];
    coach.requests[0].request.knowledgeContract = 'writing-knowledge-binding-v1';
    const knowledge = writingKnowledgeBinding(feedback, { kind: 'translate_en' });
    coach.learningRecords = [{ id: 'receipt-0', requestId: 'request-0', knowledge }];
    const before = JSON.stringify(state);
    expect(learningProgressReadModel(state).evidence[0]).toMatchObject({
      binding: { mode: 'saved', graphVersion: knowledgeGraphSeed.version },
      nodeObservations: knowledge.observations
    });
    expect(JSON.stringify(state)).toBe(before);
    for (const change of ['missing', 'foreign', 'graph', 'mapping']) {
      const altered = structuredClone(state),
        record = altered.conversations[0].coach.learningRecords[0];
      if (change === 'missing') delete record.knowledge;
      if (change === 'foreign') record.requestId = 'someone-else';
      if (change === 'graph') record.knowledge.graphVersion = 'unrecognized';
      if (change === 'mapping') record.knowledge.mappingVersion = 'unrecognized';
      expect(learningProgressReadModel(altered).evidence[0].nodeObservations).toEqual([]);
    }
    expect(JSON.stringify(knowledge)).not.toContain('Synthetic answer');
    expect(learningProgressReadModel(state).platformReference.percentage).toBeNull();
  });
  it('help, redo and pending answers do not inflate independent objective samples', () => {
    const state = progressFixture(0, 6);
    state.attempts[0].hints = [{ level: 1 }];
    state.attempts[1].kind = 'redo';
    state.attempts[2].grade = { status: 'pending', outcome: null };
    const metric = learningProgressReadModel(state).subjects.find((subject) => subject.id === '数学').accuracy;
    expect(metric).toMatchObject({ denominator: 3, percentage: null });
  });
  it('five objective successes never invent a writing rubric level', () => {
    const state = progressFixture(0, 5);
    state.questions.forEach((question) => {
      question.subject = '考研英语写作';
      question.knowledgePoint = '主谓一致';
    });
    const node = learningProgressReadModel(state).nodes.find((item) => item.id === 'agreement');
    expect(node).toMatchObject({ level: null, status: 'insufficient' });
    expect(node.accuracy).toMatchObject({ numerator: 5, denominator: 5, percentage: 100 });
  });
  it('uses the latest rubric observation, preserves earlier evidence, and never says mastered', () => {
    const state = progressFixture(6, 0);
    state.conversations[0].coach.days[0].feedback['card-card5'].dimensions[0].score = 2;
    const node = learningProgressReadModel(state).nodes.find((item) => item.id === 'sentence');
    expect(node).toMatchObject({ level: 2, isWeakness: false, statusLabel: '达成本次要求' });
    expect(node.evidenceIds).toHaveLength(6);
    expect(node.weaknessEventIds).toContain('receipt-4');
    expect(JSON.stringify(node)).not.toContain('掌握');
  });
  it('all mapping targets exist; exact labels and task rules do not guess from text or unknown labels', () => {
    expect([...WRITING_KNOWLEDGE_NODE_IDS].sort()).toEqual(knowledgeGraphSeed.topics.map((node) => node.id).sort());
    for (const rule of PROGRESS_NODE_RULES) {
      expect(knowledgeGraphSeed.topics.some((topic) => topic.id === rule.nodeId)).toBe(true);
      for (const label of rule.labels)
        expect(progressNodeIds({ labels: [label], dimension: rule.dimension })).toContain(rule.nodeId);
    }
    expect(progressNodeIds({ dimension: '语法', labels: ['主谓一致'] })).toEqual(['agreement']);
    expect(progressNodeIds({ dimension: '搭配', labels: ['主谓一致'] })).toEqual([]);
    expect(progressNodeIds({ dimension: '表达', labels: ['泛泛不足'] })).toEqual([]);
    expect(progressNodeIds({ labels: ['这段文字提到了主谓一致，但并非错误'] })).toEqual([]);
    expect(progressNodeIds({ kind: 'translation' })).toEqual(['translation']);
  });
  it('removing canonical records removes their metrics; the ledger cannot resurrect them', () => {
    const state = progressFixture();
    state.conversations = [];
    expect(learningProgressReadModel(state).evidence).toEqual([]);
  });
});
