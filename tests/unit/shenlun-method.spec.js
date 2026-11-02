import { describe, expect, it } from 'vitest';
import { applyLearningOperation, emptyLearningState } from '@/services/learning/learning-domain.js';
import { parsePastedMaterial } from '@/services/learning/material-intake.js';
import { coachMaterialContext } from '@/services/learning/coach-material-context.js';
import { learningProgressReadModel } from '@/services/learning/learning-progress-read-model.js';
import { coachSavedRecords } from '../../laf-backend/functions/_shared/learning-coach-records.js';
import { resolveSkippedProfile } from '@/services/learning/coach-profile.js';
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
  it('selects only a curated method and its saved version', () => {
    expect(subjectCoachMethod('shenlun', METHOD)?.contract).toBe(METHOD);
    expect(subjectCoachMethod('shenlun', 'unknown-version')).toBeNull();
    expect(subjectCoachMethodByContract('model-invented-method')).toBeNull();
    expect(subjectCoachMethodForIntake(readyIntake(), [])).toBeNull();
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
      methodContract: METHOD,
      minutes: null,
      deadline: null,
      foundation: null
    });
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
  it('reuses the full coach lifecycle, explicit writing submission and immutable event replay', () => {
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
        methodContract: METHOD,
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
    for (let index = 0; index < 2; index++) {
      commit('coach.paragraph', {
        index,
        text: '当前窗口开放时间给部分上班居民带来办理困难。',
        authorship: 'user_typed'
      });
      generate('feedback', `paragraph-${index}`);
      commit('coach.paragraph', {
        index,
        rewrite: true,
        text: '建议增设周六上午的预约办理时段，并于月底收集居民意见。',
        authorship: 'user_typed'
      });
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
    expect(coach().learningRecords.every((record) => record.methodContract === METHOD)).toBe(true);
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
