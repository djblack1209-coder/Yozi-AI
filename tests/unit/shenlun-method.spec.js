import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyLearningOperation, emptyLearningState, dayKey } from '@/services/learning/learning-domain.js';
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
  COACH_SUMMARY_CONTRACT,
  normalizeCoachRequest,
  normalizeCoachOutput,
  parseCoachModelOutput,
  coachSystemPrompt,
  coachInputFor,
  coachLearningDay,
  coachOperationDay,
  coachInferenceContext,
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

it.each(['daily', 'feedback', 'essay'])(
  'S34 original-task priority constrains new v2 %s without rewriting saved input',
  (phase) => {
    const r = request(phase, {
      methodContract: METHOD_V2,
      target: phase === 'feedback' ? 'paragraph-0' : phase,
      input: '应先核实活动与通行安排，再按已核与待核分别说明并持续反馈。',
      task: '面向居民沟通，直接答复是否前往。',
      sources: [
        {
          id: 'original-task',
          name: '原创资料',
          content: '本周活动安排待核。题目：写一段信息风险与沟通提纲，区分已核待核，提出核实与持续反馈办法。'
        }
      ]
    });
    const before = JSON.stringify(r),
      prompt = coachSystemPrompt(r);
    expect(prompt).toContain('材料中的原题是要求依据');
    expect(prompt).toContain('不能把新增内容升级为必答项');
    expect(prompt).toContain('原题未限定身份或收件对象时，如实标明未限定');
    expect(prompt).toContain('未照模型补设的要求作答不得判error');
    expect(prompt).toContain('没有事实或授权依据的出行指令与承诺');
    expect(prompt).toContain('只有原题实质要求确实缺失或原文有据冲突才判error');
    expect(JSON.stringify(r)).toBe(before);
  }
);

it('S34 original-task priority preserves v1 and does not alter diagnostic or summary guidance', () => {
  for (const phase of ['daily', 'feedback', 'essay', 'diagnostic', 'summary'])
    expect(
      coachSystemPrompt(
        request(phase, { input: '原答保留。', ...(phase === 'feedback' ? { target: 'paragraph-0' } : {}) })
      )
    ).not.toContain('原题优先：');
  for (const phase of ['diagnostic', 'summary'])
    expect(coachSystemPrompt(request(phase, { methodContract: METHOD_V2, input: '原答保留。' }))).not.toContain(
      '原题优先：'
    );
});

describe('S34 source task inference context', () => {
  const task = '写信息风险与沟通提纲，220至300字，只写一段，区分已核待核并提出核实与持续反馈办法。';
  const scoped = (phase, target = phase, content = '活动安排待核。题目：' + task) =>
    request(phase, {
      methodContract: METHOD_V2,
      target,
      input: '应先核实安排，再按已核与待核分别说明并持续反馈。',
      task: '以协调人员身份直接答复居民是否前往。',
      examScope: {
        contract: 'learning-exam-scope-v2',
        year: 2027,
        examLevel: 'provincial',
        region: 'CN-GD',
        positionCategory: 'gd-police'
      },
      sources: [{ id: 'native-task-source', name: '原创资料', page: null, content }]
    });
  it.each([
    ['daily', 'daily'],
    ['feedback', 'analysis'],
    ['feedback', 'paragraph-0'],
    ['essay', 'essay']
  ])('uses the unique supplied task for %s/%s while preserving the saved request', (phase, target) => {
    const r = scoped(phase, target),
      before = JSON.stringify(r),
      inference = coachInferenceContext(r);
    expect(inference.task).toBe(task);
    expect(inference.task).not.toContain('直接答复居民是否前往');
    expect(inference.input).toBe(r.input);
    expect(inference.sources).toEqual(r.sources);
    expect(coachSystemPrompt(inference)).toContain('原题优先：');
    expect(JSON.stringify(r)).toBe(before);
  });
  it.each([
    ['feedback', 'diagnostic'],
    ['feedback', 'card-c2'],
    ['summary', 'summary']
  ])('retains the actual local task for %s/%s', (phase, target) => {
    const r = scoped(phase, target);
    r.task = '只用一句话归纳，不超过60字。';
    expect(coachInferenceContext(r).task).toBe(r.task);
  });
  it('keeps v1, an older source scope, missing scope and English inference unchanged', () => {
    const r = scoped('essay');
    for (const patch of [
      { methodContract: METHOD, examScope: undefined },
      {
        examScope: {
          contract: 'learning-exam-scope-v1',
          year: 2027,
          examLevel: 'provincial',
          region: 'CN-GD',
          positionCategory: null
        }
      },
      { examScope: undefined },
      { exam: 'english2', methodContract: undefined, examScope: undefined }
    ])
      expect(coachInferenceContext({ ...r, ...patch }).task).toBe(r.task);
  });
  it.each([
    '活动安排待核，写一段提纲。',
    '题目：写第一份提纲。题目：写第二份提纲。',
    '题目一：写第一份提纲。题目二：写第二份提纲。',
    '题目：写一段提纲。\n材料：另有尚未归属的资料。'
  ])('does not guess a missing or ambiguous source task: %s', (content) => {
    const r = scoped('essay', 'essay', content);
    expect(coachInferenceContext(r).task).toBe(r.task);
  });
});

describe('S34 overnight writing continuation', () => {
  function savedWriting() {
    let state = emptyLearningState('overnight-synthetic', 'Asia/Shanghai'),
      now = at,
      serial = 0;
    const coach = () => state.conversations[0]?.coach;
    const calendar = () => dayKey(now, state.timezone);
    const commit = (type, data = {}, id = `overnight-${++serial}`) => {
      const operation = {
        id,
        type,
        at: now,
        data: type.startsWith('coach.')
          ? {
              conversationId: 'study',
              explicit: true,
              day: coachOperationDay(coach(), calendar(), type, data),
              ...data
            }
          : data
      };
      const result = applyLearningOperation(state, operation);
      state = result.state;
      return operation;
    };
    commit('conversation.start', { goal: '申论原创材料与写作' }, 'study');
    commit('coach.begin');
    commit('coach.profile', {
      profile: {
        exam: 'shenlun',
        methodContract: METHOD_V2,
        track: TRACK,
        subjects: ['gongkao_shenlun'],
        minutes: null,
        deadline: null
      }
    });
    commit('material.add', { material: parsePastedMaterial(materialText, 'overnight-material') });
    commit('coach.material', { materialId: 'overnight-material' });
    const generate = (phase, target = phase) => {
      const requestedDay = coachOperationDay(coach(), calendar(), 'coach.request', { request: { phase, target } });
      const day = coach().days.find((item) => item.day === requestedDay);
      const bound = coachInputFor(coach(), day, phase, target);
      const r = request(phase, {
        methodContract: METHOD_V2,
        ...bound,
        target,
        day: requestedDay,
        sources: coachMaterialContext(state, state.conversations[0], bound),
        essayType: coachEssayType(coach(), requestedDay)
      });
      const requestId = `overnight-request-${++serial}`;
      commit('coach.request', { requestId, request: r, modelId: 'synthetic', binding: 'synthetic-binding' });
      const output = ['diagnostic', 'daily'].includes(phase)
        ? generation(r)
        : phase === 'summary'
          ? { kind: 'summary', learned: ['保留原题与原答'], tomorrow: ['回看本次反馈'] }
          : feedback(r);
      if (phase === 'daily') output.writing.patterns = [['说明事实、建议与核实边界']];
      commit('coach.result', { requestId, output: parse(output, r) });
    };
    generate('diagnostic');
    for (let i = 1; i <= 5; i++)
      commit('coach.answer', { target: 'diagnostic', cardId: `d${i}`, answer: '材料尚未提供实施效果。' });
    generate('feedback', 'diagnostic');
    generate('daily');
    for (let i = 1; i <= 4; i++) {
      commit('coach.answer', { target: 'daily', cardId: `c${i}`, answer: '建议核实需求并收集反馈。' });
      generate('feedback', `card-c${i}`);
    }
    commit('coach.analysis', {
      fields: {
        genre: '建议稿',
        recipient: '社区负责人',
        purpose: '说明建议与核实边界',
        points: '事实、建议和核实',
        words: '120至180字'
      }
    });
    generate('feedback', 'analysis');
    commit('coach.paragraph', {
      index: 0,
      text: '建议核实需求后研究周六预约安排，不能把未核效果写成已经实现。',
      authorship: 'user_typed'
    });
    generate('feedback', 'paragraph-0');
    return {
      get state() {
        return state;
      },
      coach,
      commit,
      generate,
      setNow(value) {
        now = value;
      },
      calendar
    };
  }

  it('finishes the saved original across midnight with current timestamps, one submission and exact replay', () => {
    vi.stubGlobal('__YOZI_DEV_TEST__', true);
    const h = savedWriting(),
      oldDay = h.coach().days[0].day;
    const original = structuredClone(h.coach().days[0].drafts[0]),
      prefix = structuredClone(h.state.events);
    const priorFeedback = structuredClone(h.coach().days[0].feedback['paragraph-0']);
    h.setNow(at + 86400000);
    expect(coachLearningDay(h.coach(), h.calendar())).toBe(oldDay);
    h.commit('coach.reassess', { target: 'paragraph-0', feedbackId: priorFeedback.id });
    h.generate('feedback', 'paragraph-0');
    h.commit('coach.paragraph', { index: 0, rewrite: true, text: original.text, authorship: 'user_typed' });
    const beforeDuplicate = structuredClone(h.state);
    expect(() =>
      h.commit('coach.paragraph', { index: 0, rewrite: true, text: '覆盖原稿', authorship: 'user_typed' })
    ).toThrow();
    expect(h.state).toEqual(beforeDuplicate);
    h.commit('coach.essaySubmit');
    h.generate('essay');
    h.generate('summary');
    h.commit('coach.finish');
    const day = h.coach().days[0];
    expect(day).toMatchObject({ day: oldDay, completed: true, completedAt: at + 86400000 });
    expect(day.drafts[0]).toEqual(original);
    expect(day.writingSubmissions).toHaveLength(1);
    expect(day.writingSubmissions[0]).toMatchObject({
      text: original.text,
      submittedAt: at + 86400000,
      authorship: 'user_typed'
    });
    expect(day.feedbackHistory['paragraph-0'][0]).toEqual({ ...priorFeedback, supersededAt: at + 86400000 });
    expect(
      h
        .coach()
        .requests.filter((r) => r.at >= at + 86400000)
        .every((r) => r.request.day === oldDay)
    ).toBe(true);
    expect(h.state.events.slice(0, prefix.length)).toEqual(prefix);
    expect(h.state.events.slice(prefix.length).every((e) => e.at === at + 86400000)).toBe(true);
    expect(coachLearningDay(h.coach(), h.calendar())).toBe(h.calendar());
    let replay = emptyLearningState(h.state.owner, h.state.timezone);
    for (const event of h.state.events) replay = applyLearningOperation(replay, event).state;
    expect(replay).toEqual(h.state);
  });

  it('keeps review, diagnostic, profile and new daily generation on the calendar date', () => {
    const h = savedWriting();
    h.setNow(at + 86400000);
    const before = JSON.stringify(h.coach());
    for (const [type, data] of [
      ['coach.review', {}],
      ['coach.profile', {}],
      ['coach.answer', { target: 'diagnostic' }],
      ['coach.request', { request: { phase: 'daily', target: 'daily' } }],
      ['coach.request', { request: { phase: 'feedback', target: 'diagnostic' } }],
      ['coach.request', { request: { phase: 'feedback', target: 'error-review' } }]
    ])
      expect(coachOperationDay(h.coach(), h.calendar(), type, data)).toBe(h.calendar());
    expect(JSON.stringify(h.coach())).toBe(before);
  });

  it.each(['completed', 'current-day-exists', 'newer-completed-day', 'unused-plan', 'unversioned-task'])(
    'does not reopen a non-eligible old task: %s',
    (kind) => {
      const h = savedWriting(),
        day = h.coach().days[0],
        oldDay = day.day;
      h.setNow(at + 2 * 86400000);
      if (kind === 'completed') day.completed = true;
      if (kind === 'current-day-exists') h.coach().days.push({ ...structuredClone(day), day: h.calendar() });
      if (kind === 'newer-completed-day')
        h.coach().days.push({ ...structuredClone(day), day: dayKey(at + 86400000, h.state.timezone), completed: true });
      if (kind === 'unused-plan') Object.assign(day, { answers: [], analysis: null, drafts: [], rewrites: [] });
      if (kind === 'unversioned-task') delete day.writingTask;
      const before = structuredClone(h.state);
      expect(coachLearningDay(h.coach(), h.calendar())).toBe(h.calendar());
      expect(() => h.commit('coach.paragraph', { day: oldDay, index: 0, rewrite: true, text: '改写旧稿' })).toThrow();
      expect(h.state).toEqual(before);
    }
  );

  it.each(['2026-10-01', '2026-12-01'])('rejects arbitrary historical or future dates: %s', (day) => {
    const h = savedWriting();
    h.setNow(at + 86400000);
    const before = structuredClone(h.state);
    expect(() => h.commit('coach.paragraph', { day, index: 0, rewrite: true, text: '伪造日期' })).toThrow();
    expect(h.state).toEqual(before);
  });
});

it('S29 keeps valid public-service feedback and original input while old source-uncertain history stays readable', () => {
  const r = request('feedback', {
    methodContract: METHOD_V2,
    target: 'diagnostic',
    input: '不能把七个工作日写成交付资料期限，不能索取材料外证明或提前决定公开。',
    task: '说明补正告知期限与交付资料的区别，不索材料未要求的证明。'
  });
  const before = JSON.stringify(r);
  const raw = feedback(r);
  const result = parse(raw, r);
  expect(result.sourceStatus).toBeUndefined();
  expect(result.lines).toEqual(raw.lines);
  expect(result.dimensions).toEqual(raw.dimensions);
  expect(JSON.stringify(r)).toBe(before);
  const old = { ...raw, sourceStatus: 'pending_verification', dimensions: [] };
  expect(normalizeCoachOutput(old, r)).toMatchObject({ sourceStatus: 'pending_verification', dimensions: [] });
});

it('S32 example consistency applies to new v2 daily guidance without changing saved examples or requests', () => {
  const r = request('daily', { methodContract: METHOD_V2 }),
    before = JSON.stringify(r);
  expect(coachSystemPrompt(r)).toContain('另情境示例自洽：');
  expect(coachSystemPrompt(r)).toContain('不能又列为同一事项的待核内容');
  expect(coachSystemPrompt(r)).toContain('跨卡的主体、数量、时间与已知状态也须一致');
  expect(coachSystemPrompt(r)).toContain('writing.patterns先核对本题材料');
  expect(coachSystemPrompt(r)).toContain('不得改写为“是否”的待核事项');
  expect(coachSystemPrompt(r)).toContain('未来是否获准才是后续决定，不能混为现状未知');
  const historical = generation(r);
  historical.cards[1].example = '每周盘点；待核：盘点频次。';
  historical.writing.patterns = [['把人员是否增编、方案是否批复列为待核']];
  expect(normalizeCoachOutput(historical, r).cards[1].example).toBe(historical.cards[1].example);
  expect(normalizeCoachOutput(historical, r).writing.patterns).toEqual(historical.writing.patterns);
  expect(JSON.stringify(r)).toBe(before);
});

it('S32 example consistency leaves v1 and non-generation feedback prompts unchanged', () => {
  expect(coachSystemPrompt(request('daily'))).not.toContain('另情境示例自洽：');
  for (const phase of ['diagnostic', 'feedback', 'essay', 'summary'])
    expect(
      coachSystemPrompt(
        request(phase, {
          methodContract: METHOD_V2,
          input: '原答保留。',
          ...(phase === 'feedback' ? { target: 'card-c1' } : {})
        })
      )
    ).not.toContain('另情境示例自洽：');
});

it.each(['diagnostic', 'card-c3', 'paragraph-0'])(
  'S30 separates student-facing feedback prose from routing identifiers without changing original input: %s',
  (target) => {
    const input = '原答保留card-c3这个字面片段，不据此改写学生原文。';
    const r = request('feedback', { methodContract: METHOD_V2, target, input });
    const original = JSON.stringify(r);
    const prompt = coachSystemPrompt(r);
    expect(prompt).toContain('学生可见文案：');
    expect(prompt).toContain('实际提交进度由页面显示');
    expect(prompt).toContain('学生原答、original和引用仍逐字保留');
    expect(coachInferenceContext(r).input).toBe(input);
    expect(JSON.stringify(r)).toBe(original);
    const historical = feedback(r);
    expect(normalizeCoachOutput(historical, r).lines[0].original).toBe(input);
    expect(normalizeCoachOutput(historical, r).target).toBe(target);
  }
);

it('S30 keeps v1 and non-feedback teaching prompts outside the new prose rule', () => {
  expect(coachSystemPrompt(request('feedback', { target: 'card-c1', input: '原答保持。' }))).not.toContain(
    '学生可见文案：'
  );
  expect(coachSystemPrompt(request('daily', { methodContract: METHOD_V2 }))).not.toContain('学生可见文案：');
  expect(coachSystemPrompt(request('summary', { methodContract: METHOD_V2, input: '原答保持。' }))).not.toContain(
    '学生可见文案：'
  );
});

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
  it.each([false, true])('binds the actual task roles without generic English roles, dev=%s', (dev) => {
    vi.stubGlobal('__YOZI_DEV_TEST__', dev);
    const coach = { profile: { exam: 'shenlun', methodContract: METHOD_V2 } };
    const day = {
      pack: {
        cards: [],
        writing: {
          prompt: '写倡议书，三段依次说明缘由、具体行动、参与方式。',
          patterns: [['说明缘由'], ['额外参考：必须发放积分奖品，并补记全部旧记录'], ['说明登记方式与自愿边界']]
        }
      },
      drafts: [{ text: '原稿缘由' }, { text: '原稿行动' }, { text: '原稿参与方式' }],
      feedback: {}
    };
    const before = JSON.stringify(day);
    for (let index = 0; index < 3; index++) {
      const bound = coachInputFor(coach, day, 'feedback', `paragraph-${index}`);
      expect(bound.input).toBe(day.drafts[index].text);
      expect(bound.task).toBe(day.pack.writing.prompt);
      expect(bound.task).not.toMatch(/交代目的或描述|展开要点与理由|回应目的与建议/u);
      const inference = coachInferenceContext(
        request('feedback', {
          methodContract: METHOD_V2,
          ...bound,
          target: `paragraph-${index}`
        })
      );
      expect(inference.task).toBe(day.pack.writing.prompt);
      expect(JSON.stringify(inference)).not.toMatch(/积分奖品|补记全部旧记录/u);
    }
    expect(JSON.stringify(day)).toBe(before);
    const english = coachInputFor({ profile: { exam: 'english2' } }, day, 'feedback', 'paragraph-2');
    expect(english.task).toBe(
      dev
        ? `${day.pack.writing.prompt}\n第3段：回应目的与建议。本次仅评阅本段职责；其他段落和全文要求留到成文阶段。句式参考：\n说明登记方式与自愿边界`
        : `${day.pack.writing.prompt}\n说明登记方式与自愿边界`
    );
  });
  it.each([
    [
      '本次抽样覆盖全街道90%的居民，\n\n证明甲乙服务点已全面消除咨询困难，满意度达到98%。\n\n建议继续推广已经取得的整改成效。',
      58
    ],
    ['甲\n乙 丁', 3],
    ['𠀀🐱\n甲', 3]
  ])('supplies the whole submitted text count for v2 essay assessment: %s', (input, count) => {
    const r = request('essay', { methodContract: METHOD_V2, input, task: '写200至300字调查简报。' });
    const before = JSON.stringify(r);
    expect(coachSystemPrompt(r)).toContain(`当前全文非空白字符数为${count}`);
    expect(JSON.stringify(r)).toBe(before);
    expect(coachSystemPrompt({ ...r, methodContract: METHOD })).not.toContain('宿主核对：当前全文非空白字符数');
    for (const [phase, target] of [
      ['daily', 'daily'],
      ['feedback', 'analysis'],
      ['feedback', 'paragraph-0'],
      ['summary', 'summary']
    ]) {
      expect(coachSystemPrompt({ ...r, phase, target })).not.toContain('宿主核对：当前全文非空白字符数');
    }
  });
  it.each([
    ['甲\n乙 丁', 3],
    ['𠀀🐱\n甲', 3],
    [' 甲，乙。\u3000', 4]
  ])('S27 gives the current v2 paragraph count without treating it as the full essay: %s', (input, count) => {
    for (const index of [0, 10]) {
      const r = request('feedback', {
        methodContract: METHOD_V2,
        target: `paragraph-${index}`,
        input,
        task: '写800至1000字五段议论文。'
      });
      const before = JSON.stringify(r);
      const prompt = coachSystemPrompt(r);
      expect(prompt).toContain(`当前第${index + 1}段原文非空白字符数为${count}`);
      expect(prompt).toContain('多段文章不能把本段字数与全文要求比较');
      expect(prompt).toContain('不把改写建议的长度当作原答长度');
      expect(prompt).not.toContain('当前全文非空白字符数');
      expect(JSON.parse(prompt.split('当前评阅范围：')[1].split('。')[0])).toEqual({
        kind: 'paragraph',
        number: index + 1,
        fullEssay: false
      });
      expect(JSON.stringify(r)).toBe(before);
    }
    const r = request('feedback', { methodContract: METHOD_V2, target: 'paragraph-0', input });
    for (const [phase, target] of [
      ['feedback', 'analysis'],
      ['feedback', 'card-c1'],
      ['essay', 'essay'],
      ['daily', 'daily'],
      ['summary', 'summary']
    ]) {
      expect(coachSystemPrompt({ ...r, phase, target })).not.toContain('段落字数核对');
    }
    expect(coachSystemPrompt({ ...r, methodContract: METHOD })).not.toContain('段落字数核对');
    expect(coachSystemPrompt({ ...r, exam: 'english2', methodContract: undefined })).not.toContain('段落字数核对');
  });
  it('counts only submitted rewrites for the v2 writing summary, excluding training self-checks', () => {
    const paragraphs = ['第一段原稿', '第二段原稿', '第三段原稿'];
    const coach = { profile: { exam: 'shenlun', methodContract: METHOD_V2 } };
    const day = {
      completed: false,
      pack: { cards: [{ title: '完成任务与自查' }], writing: { patterns: paragraphs.map((p) => [p]) } },
      answers: [{ answer: paragraphs.join('\n') + '\n自查说明不属于已交卷正文。' }],
      rewrites: paragraphs.map((text) => ({ text })),
      essay: { id: 'saved-essay' }
    };
    const before = JSON.stringify(day);
    const bound = coachInputFor(coach, day, 'summary', 'summary');
    expect(bound.input).toBe(paragraphs.join('\n\n'));
    const r = request('summary', { ...bound, methodContract: METHOD_V2 });
    const prompt = coachSystemPrompt(r);
    expect(prompt).toContain('已明确交卷的正文，非空白字符数为15');
    expect(prompt).not.toContain('自查说明不属于已交卷正文。');
    expect(JSON.stringify(day)).toBe(before);
    expect(coachSystemPrompt({ ...r, methodContract: METHOD })).not.toContain('小结事实核对');
    expect(() => coachSystemPrompt({ ...r, summaryContract: COACH_SUMMARY_CONTRACT })).toThrow(
      '本教学定义不使用英语教学合同'
    );
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
  it.each(['error', 'suggestion', 'uncertain'])(
    'preserves explicit v2 classification when a provider combines labels and quotes: %s',
    (classification) => {
      const r = request('feedback', { methodContract: METHOD_V2, target: 'card-c1', input: '本次只走访两个服务点。' });
      const raw = feedback(r),
        label = '走访范围观察';
      raw.weaknesses = [{ label, quote: r.input }];
      raw.weaknessEvidence = [{ label, quote: r.input, classification }];
      const parsed = parse(raw, r);
      expect(parsed.weaknessEvidence).toEqual(raw.weaknessEvidence);
      expect(parsed.weaknesses).toEqual(classification === 'error' ? [label] : []);
      expect(parsed).not.toHaveProperty('feedbackVersion');
    }
  );
  it('does not infer classification or ignore contradictory combined evidence', () => {
    const r = request('feedback', { methodContract: METHOD_V2, target: 'card-c1', input: '本次只走访两个服务点。' });
    const raw = feedback(r),
      label = '走访范围观察';
    raw.weaknesses = [{ label, quote: r.input }];
    raw.weaknessEvidence = [{ label, quote: r.input }];
    expect(() => parse(raw, r)).toThrow('区分错误');
    raw.weaknessEvidence = [{ label, quote: r.input.slice(0, -1), classification: 'error' }];
    expect(() => parse(raw, r)).toThrow('分类证据不一致');
    raw.weaknessEvidence = [{ label, quote: r.input, classification: 'mastered' }];
    expect(() => parse(raw, r)).toThrow('分类');
    delete raw.weaknessEvidence;
    expect(() => parse(raw, r)).toThrow('区分错误');
    expect(parse(raw, { ...r, methodContract: METHOD }).weaknesses).toEqual([label]);
  });
  it('uses task self-check for new daily cards while retaining the v1 suggestion card', () => {
    const r = request('daily', { methodContract: METHOD_V2 });
    expect(subjectCoachMethodByContract(METHOD_V2).dailyCards[3].title).toBe('完成任务与自查');
    expect(subjectCoachMethodByContract(METHOD).dailyCards[3].title).toBe('提出可执行建议');
    const prompt = coachSystemPrompt(r);
    expect(prompt).toContain('不要求另提治理对策');
    expect(prompt).toContain('weaknesses和strengths只放简短标签');
    expect(prompt).toContain('每条quote必须逐字包含在同一条lines.original中');
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
    { contract: METHOD_V2, paragraphs: 12 },
    { contract: METHOD_V2, paragraphs: 3, legacyTask: 'plain' },
    { contract: METHOD_V2, paragraphs: 3, legacyTask: 'generic-dev' }
  ])('replays $contract/$paragraphs/$legacyTask', ({ contract, paragraphs, legacyTask }) => {
    if (paragraphs > 10 || legacyTask === 'generic-dev') vi.stubGlobal('__YOZI_DEV_TEST__', true);
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
      const paragraph = /^paragraph-(\d+)$/u.exec(target);
      if (legacyTask && phase === 'feedback' && paragraph) {
        const index = Number(paragraph[1]),
          writing = day.pack.writing;
        r.task =
          legacyTask === 'plain'
            ? writing.prompt + '\n' + writing.patterns[index].join('\n')
            : `${writing.prompt}\n第${index + 1}段：${index === 0 ? '交代目的或描述' : index === writing.patterns.length - 1 ? '回应目的与建议' : '展开要点与理由'}。本次仅评阅本段职责；其他段落和全文要求留到成文阶段。句式参考：\n${writing.patterns[index].join('\n')}`;
        expect(() =>
          commit('coach.request', {
            requestId: `forged-${serial}`,
            request: { ...r, task: r.task + '\n改成其他段落职责' },
            modelId: 'synthetic',
            binding: 'synthetic-binding'
          })
        ).toThrow('教学任务已变化');
      }
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
