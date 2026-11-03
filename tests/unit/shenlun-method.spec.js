import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyLearningOperation, emptyLearningState } from '@/services/learning/learning-domain.js';
import { parsePastedMaterial } from '@/services/learning/material-intake.js';
import { coachMaterialContext } from '@/services/learning/coach-material-context.js';
import { learningProgressReadModel } from '@/services/learning/learning-progress-read-model.js';
import { coachSavedRecords } from '../../laf-backend/functions/_shared/learning-coach-records.js';
import { COACH_EXAMS, resolveSkippedProfile } from '@/services/learning/coach-profile.js';
import {
  subjectCoachMethod,
  subjectCoachMethodByContract,
  subjectCoachMethodForIntake
} from '../../laf-backend/functions/_shared/learning-coach-methods.js';
import {
  WRITING_COACH_CONTRACT,
  normalizeCoachRequest,
  normalizeCoachOutput,
  parseCoachModelOutput,
  coachSystemPrompt,
  coachInputFor,
  coachEssayType
} from '../../laf-backend/functions/_shared/learning-writing-coach.js';
import {
  SHENLUN_METHOD,
  SHENLUN_METHOD_CONTRACT as METHOD,
  SHENLUN_METHOD_V2_CONTRACT as METHOD_V2,
  COACH_SHENLUN_TRACK as TRACK,
  shenlunIntakeEligible
} from '../../laf-backend/functions/_shared/learning-shenlun-method.js';

// Original synthetic material and transport fixtures, never predictive/official evidence.
const materialText =
  '松禾社区在居民座谈会上发现，服务窗口只在工作日白天开放，部分上班居民不便办理。社区计划增加周六上午的预约办理时段，并在月底收集居民意见，尚未形成实施效果数据。';
const at = Date.parse('2026-11-02T10:00:00Z');
const request = (phase = 'daily', extras = {}) => ({
  contract: WRITING_COACH_CONTRACT,
  methodContract: METHOD,
  exam: 'shenlun',
  phase,
  target: phase,
  day: '2026-11-02',
  sources: [{ id: 'material:1', name: '合成训练材料', page: 1, content: materialText }],
  ...extras
});
const questions = [
  '根据材料说明目前要解决的主要办事困难。',
  '现有窗口在什么时间开放？',
  '把已经存在的情况和拟议措施分开列出。',
  '拟议措施回应了哪一类居民的困难？',
  '用一句话概括服务改进方向。'
];
function generation(r) {
  const source = r.sources[0];
  const reference = { sourceId: source.id, sourceQuote: source.content.slice(0, 80), sourcePage: source.page };
  return {
    kind: r.phase,
    cards: (r.phase === 'diagnostic' ? SHENLUN_METHOD.diagnostic : SHENLUN_METHOD.dailyCards).map((item, i) => ({
      id: `${r.phase === 'diagnostic' ? 'd' : 'c'}${i + 1}`,
      kind: r.phase === 'diagnostic' ? 'diagnostic' : item.kind,
      title: typeof item === 'string' ? item : item.title,
      prompt: questions[i],
      example: '',
      ...reference
    })),
    ...(r.phase === 'daily'
      ? {
          writing: {
            prompt:
              '根据材料，面向社区负责人写一份120—180字的服务调整建议稿，说明困难、建议及意见收集安排，不编造实施成效。',
            patterns: [['说明当前困难与建议目的'], ['说明具体措施和反馈安排']],
            ...reference
          }
        }
      : {})
  };
}
const feedback = (r) => ({
  kind: r.phase,
  target: r.target,
  lines: [
    {
      original: r.input.split('\n')[0],
      advice: '这是一份合成传输观察，仅核对保存边界。',
      rewrite: '保留原答，对照材料区分拟议措施与已发生事实。'
    }
  ],
  weaknesses: [],
  weaknessEvidence: [],
  strengths: [],
  phrases: [],
  dimensions: SHENLUN_METHOD.feedback.map((name) => ({ name, comment: '合成观察，不是官方评分。' }))
});
const parse = (output, r) =>
  parseCoachModelOutput(JSON.stringify({ message: '继续这一小步。', question: null, tools: [], coach: output }), r)
    .coach;

function readyIntake() {
  return {
    requestId: 'intake',
    modelId: 'synthetic',
    contract: 'model-intake-v2',
    status: 'ready',
    turns: [
      { question: '你在准备什么？', answer: '考公' },
      { question: '先学哪一科？', answer: '申论' }
    ],
    reply: {
      intake: {
        profile: {
          goal: '申论材料与写作',
          category: 'civil',
          exam: 'general',
          subjects: ['申论'],
          minutes: null,
          deadline: null,
          foundation: null
        }
      }
    }
  };
}

describe('versioned Shenlun teaching definition on the existing coach', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('selects only a curated method and its saved version', () => {
    expect(subjectCoachMethod('shenlun', METHOD)?.contract).toBe(METHOD);
    expect(subjectCoachMethod('shenlun', 'unknown-version')).toBeNull();
    expect(subjectCoachMethodByContract('model-invented-method')).toBeNull();
    expect(subjectCoachMethodForIntake(readyIntake(), [])).toBeNull();
    expect(subjectCoachMethodForIntake(readyIntake()).contract).toBe(METHOD_V2);
    expect(subjectCoachMethodForIntake(readyIntake(), [METHOD]).contract).toBe(METHOD);
    expect(COACH_EXAMS.filter((exam) => exam === 'shenlun')).toHaveLength(1);
  });
  it('enables a new method only on explicit versioned confirmation, preserving old accept semantics', () => {
    const before = emptyLearningState('synthetic-shenlun');
    before.intake = readyIntake();
    expect(shenlunIntakeEligible(before.intake)).toBe(true);
    const original = JSON.stringify(before);
    const old = applyLearningOperation(before, {
      id: 'old-confirmation',
      type: 'intake.accept',
      at,
      data: { explicit: true }
    }).state;
    expect(old.conversations[0].coach).toBeUndefined();
    const current = applyLearningOperation(before, {
      id: 'new-confirmation',
      type: 'intake.accept',
      at,
      data: { explicit: true, coachMethod: METHOD }
    }).state;
    expect(current.conversations[0].coach.profile).toMatchObject({
      exam: 'shenlun',
      methodContract: METHOD,
      track: TRACK,
      subjects: ['gongkao_shenlun'],
      minutes: null,
      deadline: null,
      foundation: null
    });
    expect(current.conversations[0].studyProfile.exam).toBe('general');
    expect(current.conversations[0].coach.requests).toEqual([]);
    expect(JSON.stringify(before)).toBe(original);
  });
  it.each(['wrong-method', 'old-contract', 'unrelated-answer'])(
    'rejects activation without matching intent: %s',
    (variation) => {
      const state = emptyLearningState('synthetic-shenlun');
      state.intake = readyIntake();
      if (variation === 'old-contract') delete state.intake.contract;
      if (variation === 'unrelated-answer') state.intake.turns[1].answer = '英语';
      const before = JSON.stringify(state);
      expect(() =>
        applyLearningOperation(state, {
          id: 'invalid-confirmation',
          type: 'intake.accept',
          at,
          data: { explicit: true, coachMethod: variation === 'wrong-method' ? 'unknown' : METHOD }
        })
      ).toThrow();
      expect(JSON.stringify(state)).toBe(before);
    }
  );
  it('keeps unknown dates and times on skipped profiles and binds the method version', () => {
    expect(resolveSkippedProfile({ subject: 'gongkao_shenlun' })).toMatchObject({
      exam: 'shenlun',
      track: TRACK,
      methodContract: METHOD_V2,
      minutes: null,
      deadline: null,
      foundation: null
    });
    expect(resolveSkippedProfile({ exam: 'shenlun', methodContract: METHOD }).methodContract).toBe(METHOD);
  });
  it('requires a matching method version and real material before generation', () => {
    expect(() => normalizeCoachRequest(request('daily', { methodContract: undefined }))).toThrow('版本');
    expect(() => normalizeCoachRequest(request('daily', { sources: [] }))).toThrow('材料');
    expect(() => normalizeCoachRequest(request('daily', { sources: Array(4).fill(request().sources[0]) }))).toThrow(
      '三段'
    );
    expect(normalizeCoachRequest(request('daily', { minutes: 5 })).minutes).toBe(5);
    expect(normalizeCoachRequest(request('summary', { sources: [] })).sources).toEqual([]);
  });
  it.each([
    'feedbackVersion',
    'dimensionContract',
    'knowledgeContract',
    'exerciseContract',
    'predictionContract',
    'summaryContract',
    'writingBand'
  ])('does not reuse an English contract: %s', (field) => {
    expect(() => normalizeCoachRequest(request('daily', { [field]: 'synthetic-not-applicable' }))).toThrow(
      '英语教学合同'
    );
  });
  it('uses material tasks and Chinese writing rather than English exercise types', () => {
    const r = request();
    const out = parse(generation(r), r);
    expect(out.cards.map((card) => card.kind)).toEqual(SHENLUN_METHOD.dailyCards.map((card) => card.kind));
    expect(out.writing.patterns).toHaveLength(2);
    const prompt = coachSystemPrompt(r);
    expect(prompt).toContain('考试年度、地区和职位类别未确定');
    expect(prompt).toContain('不将建议写成已实施事实');
    expect(prompt).not.toContain('空格只考');
    const invalid = generation(r);
    invalid.cards[0].kind = 'collocation';
    expect(() => parse(invalid, r)).toThrow('类型');
  });
  it('uses task paragraphs only for the new registered version and preserves the old short task contract', () => {
    const legacy = request(),
      next = request('daily', { methodContract: METHOD_V2 });
    const raw = generation(next);
    raw.writing.prompt = '请依据材料，以服务改进为主题写一篇800至1000字文章，按开篇、三个主体段和结尾组织。';
    raw.writing.patterns = Array.from({ length: 5 }, (_, i) => [`第${i + 1}段本题职责`]);
    expect(parse(raw, next).writing.patterns).toHaveLength(5);
    expect(() => parse(raw, legacy)).toThrow('二至三段');
    expect(coachSystemPrompt(next)).toContain('不能换成另一份短稿');
    expect(coachSystemPrompt(next)).toContain('数组长度由本题实际职责决定');
    expect(coachSystemPrompt(legacy)).toContain('适合二至三段带写的中文短稿');
  });
  it('accepts a single complete task only for the task-driven method and rejects empty structures', () => {
    const r = request('daily', { methodContract: METHOD_V2 }),
      raw = generation(r);
    raw.writing.prompt = '请在一段内概括材料中的当前困难，80至120字，不提出对策。';
    raw.writing.patterns = [['在一段内分项概括题目要求的当前困难']];
    expect(parse(raw, r).writing.patterns).toHaveLength(1);
    expect(() => normalizeCoachOutput(raw, request())).toThrow('二至三段');
    raw.writing.patterns = [];
    expect(() => parse(raw, r)).toThrow('完整写作结构');
  });
  it.each(['paragraph--1', 'paragraph-01', 'paragraph-9007199254740992'])(
    'rejects ambiguous or unsafe paragraph indexes: %s',
    (target) => {
      expect(() => normalizeCoachRequest(request('feedback', { methodContract: METHOD_V2, target }))).toThrow('目标');
    }
  );
  it('retains old English and subject paragraph target limits while allowing complete new task targets', () => {
    expect(
      normalizeCoachRequest(request('feedback', { methodContract: METHOD_V2, target: 'paragraph-10' })).target
    ).toBe('paragraph-10');
    expect(() => normalizeCoachRequest(request('feedback', { target: 'paragraph-3' }))).toThrow('目标');
    expect(() =>
      normalizeCoachRequest(request('feedback', { exam: 'english2', methodContract: undefined, target: 'paragraph-3' }))
    ).toThrow('目标');
  });
  it.each(['wrong-quote', 'wrong-page', 'no-source', 'no-word-count'])(
    'rejects ungrounded live task output: %s',
    (variation) => {
      const r = request();
      const output = generation(r);
      if (variation === 'wrong-quote') output.cards[0].sourceQuote = '资料没有提供任何这样的办理成效';
      if (variation === 'wrong-page') output.cards[0].sourcePage = 99;
      if (variation === 'no-source') output.cards[0].sourceId = null;
      if (variation === 'no-word-count') output.writing.prompt = '写一份建议稿。';
      expect(() => parse(output, r)).toThrow();
    }
  );
  it.each(['diagnostic', 'daily'])(
    'retains complete authorized short context only at the live boundary: %s',
    (phase) => {
      const r = request(phase);
      const raw = generation(r);
      raw.cards[0].sourceQuote = '社区计划增加周六上午的预约办理时段';
      const historical = normalizeCoachOutput(raw, r);
      expect(historical.cards[0].source.quote).toBe(raw.cards[0].sourceQuote);
      const live = parse(raw, r);
      expect(live.cards[0].source.quote).toBe(materialText);
      expect(live.cards[0].source.verified).toBe(false);
      expect(raw.cards[0].sourceQuote).toBe('社区计划增加周六上午的预约办理时段');
      if (live.writing) expect(live.writing.source.quote).toBe(materialText);
    }
  );
  it('keeps long-source references bounded and never replaces a rejected quote with source text', () => {
    const r = request('daily');
    r.sources[0].content = materialText + '\n' + '这是另一段背景信息，不是本次问题的事实依据。'.repeat(12);
    const raw = generation(r);
    raw.cards[0].sourceQuote = materialText;
    expect(parse(raw, r).cards[0].source.quote).toBe(materialText);
    raw.cards[0].sourceQuote = '材料中不存在的实施效果已经得到证实';
    expect(() => parse(raw, r)).toThrow('准确引文');
  });
  it('records supported observations without scores, fabricated original quotes or ungrounded weakness labels', () => {
    const r = request('essay', { input: '建议增设周六上午的预约办理时段。', task: '写建议稿' });
    const output = feedback(r);
    output.weaknesses = ['没有证据的旧标签'];
    const parsed = parse(output, r);
    expect(parsed.weaknesses).toEqual([]);
    expect(parsed.dimensions.every((item) => item.score === undefined)).toBe(true);
    expect(parsed.phrases).toEqual([]);
    output.dimensions[0].score = 2;
    expect(() => parse(output, r)).toThrow('不给分数');
    delete output.dimensions[0].score;
    output.lines[0].original = '不存在于学生原稿的句子';
    expect(() => parse(output, r)).toThrow('当前原答');
  });
  it.each(['error', 'suggestion', 'uncertain'])(
    'projects only classified errors for new subject feedback: %s',
    (classification) => {
      const r = request('feedback', {
        methodContract: METHOD_V2,
        target: 'card-c1',
        input: '原答已按三类列出事实、讨论安排和建议。'
      });
      const raw = feedback(r),
        label = classification === 'error' ? '合成确定错误' : '条目呈现可以更醒目';
      raw.weaknesses = [label];
      raw.weaknessEvidence = [{ label, quote: r.input, classification }];
      const normalized = parse(raw, r);
      expect(normalized.weaknesses).toEqual(classification === 'error' ? [label] : []);
      expect(normalized.weaknessEvidence).toEqual(raw.weaknessEvidence);
      expect(normalized).not.toHaveProperty('feedbackVersion');
      expect(normalized.dimensions.every((dimension) => dimension.score === undefined)).toBe(true);
    }
  );
  it('keeps historical unclassified observations unchanged but rejects new unclassified labels', () => {
    const r = request('feedback', {
      methodContract: METHOD_V2,
      target: 'card-c1',
      input: '原答已经说明材料中的情况。'
    });
    const raw = feedback(r);
    raw.weaknesses = ['历史未分类观察'];
    raw.weaknessEvidence = [{ label: raw.weaknesses[0], quote: r.input }];
    expect(normalizeCoachOutput(raw, r).weaknesses).toEqual(raw.weaknesses);
    expect(() => parse(raw, r)).toThrow('区分错误');
    expect(normalizeCoachOutput(raw, { ...r, methodContract: METHOD }).weaknesses).toEqual(raw.weaknesses);
  });
  it('rejects invented observation classes rather than converting them into errors', () => {
    const r = request('feedback', { methodContract: METHOD_V2, target: 'card-c1', input: '这是待核对的原答。' });
    const raw = feedback(r);
    raw.weaknesses = ['合成观察'];
    raw.weaknessEvidence = [{ label: raw.weaknesses[0], quote: r.input, classification: 'mastered' }];
    expect(() => parse(raw, r)).toThrow('分类');
  });
  it('keeps five-field analysis evidence verbatim in the live prompt example without relaxing feedback limits', () => {
    const r = request('feedback', {
      target: 'analysis',
      task: '面向居民写200至300字情况说明',
      input: [
        'genre: 简短情况说明',
        'recipient: 松禾社区居民',
        'purpose: 说明拟议预约安排',
        'points: 问题、计划、反馈与未知效果',
        'words: 200至300字'
      ].join('\n')
    });
    const prompt = coachSystemPrompt(r);
    const example = JSON.parse(prompt.split('只返回一个JSON对象：')[1].split('。示例中的说明文字')[0]);
    expect(parse(example.coach, r).lines[0].original).toBe('简短情况说明');
    const translated = feedback(r);
    translated.lines[0].original = '体裁：简短情况说明';
    expect(() => parse(translated, r)).toThrow('当前原答');
    const tooMany = feedback(r);
    tooMany.lines = Array.from({ length: 4 }, () => ({ ...tooMany.lines[0] }));
    expect(() => parse(tooMany, r)).toThrow('反馈过于密集');
  });
  it('binds a middle-paragraph evaluation to its actual position without claiming a whole essay', () => {
    const r = request('feedback', {
      target: 'paragraph-1',
      task: '面向居民写200至300字情况说明\n第二段：说明拟议安排和待核对信息。',
      input: '针对上述不便，社区计划增加周六上午预约时段，尚无实施效果数据。'
    });
    const prompt = coachSystemPrompt(r);
    const scope = JSON.parse(prompt.split('当前评阅范围：')[1].split('。\n')[0]);
    expect(scope).toEqual({ kind: 'paragraph', number: 2, fullEssay: false });
    const example = JSON.parse(prompt.split('只返回一个JSON对象：')[1].split('。示例中的说明文字')[0]);
    expect(parse(example.coach, r).lines[0].original).toBe(r.input);
  });
  it.each([
    { contract: METHOD, paragraphs: 2 },
    { contract: METHOD_V2, paragraphs: 1 },
    { contract: METHOD_V2, paragraphs: 5 },
    { contract: METHOD_V2, paragraphs: 12 }
  ])('reuses full submission and event replay: $contract / $paragraphs paragraphs', ({ contract, paragraphs }) => {
    if (paragraphs > 10) vi.stubGlobal('__YOZI_DEV_TEST__', true);
    let state = emptyLearningState('synthetic-shenlun', 'Asia/Shanghai'),
      serial = 0;
    const commit = (type, data = {}, id = `op-${++serial}`) => {
      state = applyLearningOperation(state, {
        id,
        type,
        at,
        data: type.startsWith('coach.') ? { conversationId: 'study', explicit: true, ...data } : data
      }).state;
    };
    commit('conversation.start', { goal: '申论材料与中文写作' }, 'study');
    commit('coach.begin');
    commit('coach.profile', {
      profile: {
        exam: 'shenlun',
        methodContract: contract,
        track: TRACK,
        subjects: ['gongkao_shenlun'],
        minutes: null,
        deadline: null
      }
    });
    commit('material.add', { material: parsePastedMaterial(materialText, 'synthetic-material') });
    commit('coach.material', { materialId: 'synthetic-material' });
    const coach = () => state.conversations[0].coach;
    const generate = (phase, target = phase) => {
      const day = coach().days[0],
        bound = coachInputFor(coach(), day, phase, target);
      const r = request(phase, {
        methodContract: contract,
        ...bound,
        target,
        sources: coachMaterialContext(state, state.conversations[0], bound),
        essayType: coachEssayType(coach(), '2026-11-02')
      });
      const requestId = `request-${++serial}`;
      commit('coach.request', { requestId, request: r, modelId: 'synthetic', binding: 'synthetic-binding' });
      const output = ['diagnostic', 'daily'].includes(phase)
        ? generation(r)
        : phase === 'summary'
          ? { kind: 'summary', learned: ['练习了材料归纳与短稿表达'], tomorrow: ['回看本次反馈'] }
          : feedback(r);
      if (phase === 'daily')
        output.writing.patterns = Array.from({ length: paragraphs }, (_, i) => [`第${i + 1}段职责`]);
      commit('coach.result', { requestId, output: parse(output, r) });
    };
    generate('diagnostic');
    for (let i = 1; i <= 5; i++)
      commit('coach.answer', {
        target: 'diagnostic',
        cardId: `d${i}`,
        answer: '材料反映上班居民在工作日白天办理不便。'
      });
    generate('feedback', 'diagnostic');
    generate('daily');
    for (let i = 1; i <= 4; i++) {
      commit('coach.answer', { cardId: `c${i}`, answer: '建议增设周六预约时段，并收集居民意见。' });
      generate('feedback', `card-c${i}`);
    }
    commit('coach.analysis', {
      fields: {
        genre: '建议稿',
        recipient: '社区负责人',
        purpose: '改善办理便利性',
        points: '困难、措施、意见收集',
        words: '120—180字'
      }
    });
    generate('feedback', 'analysis');
    expect(() => coachInputFor(coach(), coach().days[0], 'feedback', `paragraph-${paragraphs}`)).toThrow();
    for (let index = 0; index < paragraphs; index++) {
      commit('coach.paragraph', {
        index,
        text: `第${index + 1}段：当前窗口开放时间给部分上班居民带来办理困难。`,
        authorship: 'user_typed'
      });
      generate('feedback', `paragraph-${index}`);
      expect(coach().days[0].feedback[`paragraph-${index}`].lines[0].original).toContain(`第${index + 1}段`);
      expect(coach().days[0].drafts[index].assessmentStatus).toBe('assessed');
      commit('coach.paragraph', {
        index,
        rewrite: true,
        text: '建议增设周六上午的预约办理时段，并于月底收集居民意见。',
        authorship: 'user_typed'
      });
    }
    if (paragraphs > 10) {
      const day = coach().days[0],
        originalFeedback = day.feedback['paragraph-10'];
      commit('coach.reassess', { target: 'paragraph-10', feedbackId: originalFeedback.id });
      expect(coach().days[0].drafts[10].assessmentStatus).toBe('pending');
      expect(coach().days[0].drafts[0].assessmentStatus).toBe('assessed');
      generate('feedback', 'paragraph-10');
      expect(coach().days[0].feedbackHistory['paragraph-10'][0].id).toBe(originalFeedback.id);
      expect(coach().days[0].drafts[10].assessmentStatus).toBe('assessed');
    }
    commit('coach.essaySubmit');
    generate('essay');
    generate('summary');
    commit('coach.finish');
    expect(coach().days[0].completed).toBe(true);
    expect(coach().days[0].writingSubmissions[0].authorship).toBe('user_typed');
    expect(
      coachSavedRecords(state.conversations[0]).find((record) => record.phase === 'essay').writingProcessSource
    ).toBe('guided');
    const forged = JSON.parse(JSON.stringify(state.conversations[0]));
    forged.coach.days[0].writingSubmissions[0].answerHash = 'wrong-content-hash';
    expect(coachSavedRecords(forged).find((record) => record.phase === 'essay').writingProcessSource).toBe('unknown');
    expect(coach().learningRecords.every((record) => record.methodContract === contract)).toBe(true);
    expect(coach().predictionChecks || []).toEqual([]);
    expect(coach().library).toEqual([]);
    expect(learningProgressReadModel(state).evidence).toEqual([]);
    expect(learningProgressReadModel(state).platformReference.percentage).toBeNull();
    let replay = emptyLearningState(state.owner, state.timezone);
    for (const event of state.events) replay = applyLearningOperation(replay, event).state;
    expect(replay).toEqual(state);
    expect(
      normalizeCoachOutput(
        coach().days[0].pack,
        coach().requests.find((item) => item.request.phase === 'daily').request
      ).cards
    ).toHaveLength(4);
  });
});
