import { compactLearningProgress } from '../../laf-backend/functions/_shared/learning-runtime-policy.js';
import { prepareLearningRestore } from '@/services/learning/learning-backup.js';
import { describe, it, expect, vi } from 'vitest';
import {
  applyLearningOperation,
  emptyLearningState,
  inspectMaterialDeletion
} from '@/services/learning/learning-domain.js';
import {
  WRITING_METHOD,
  WRITING_COACH_CONTRACT,
  COACH_FEEDBACK_VERSION,
  normalizeCoachRequest,
  normalizeCoachOutput,
  parseCoachModelOutput,
  coachSystemPrompt,
  coachInputFor,
  coachEssayType,
  writingCoachDashboard
} from '../../laf-backend/functions/_shared/learning-writing-coach.js';
import { parsePastedMaterial } from '@/services/learning/material-intake.js';
import { museLearningInsights } from '@/services/learning/muse-learning-insights.js';

// 明确的合成模型输出，仅验证编排和事实边界，不充当真实教学验收。
import { coachFixture } from '../fixtures/writing-coach.js';

it('严格拒绝非对象教学信封并保留固定结构错误，不修复或采用内容', () => {
  const request = {
    contract: WRITING_COACH_CONTRACT,
    phase: 'diagnostic',
    exam: 'english2',
    day: '2026-10-25',
    sources: []
  };
  for (const raw of ['null', '[]', '42'])
    expect(() => parseCoachModelOutput(raw, request)).toThrowError(
      expect.objectContaining({ code: 'COACH_INVALID', path: 'root' })
    );
  expect(() => parseCoachModelOutput('{', request)).toThrowError(
    expect.objectContaining({ code: 'COACH_INVALID', path: 'raw' })
  );
  const envelope = { message: '合成结构核对', question: null, tools: [], coach: coachFixture(request) };
  expect(parseCoachModelOutput(JSON.stringify(envelope), request).coach.cards).toHaveLength(5);
});

it('批内小结严格解析整段JSON，旧请求解析方式保持', () => {
  const request = normalizeCoachRequest({
    contract: WRITING_COACH_CONTRACT,
    phase: 'summary',
    target: 'summary',
    exam: 'english2',
    day: '2026-10-25',
    input: 'Synthetic saved original.',
    sources: []
  });
  const raw = JSON.stringify({
    message: '已保存的小结',
    question: null,
    tools: [],
    coach: { kind: 'summary', learned: ['已提交原答'], tomorrow: ['复习已保存句式'] }
  });
  expect(parseCoachModelOutput(raw, request, false, undefined, true).coach.kind).toBe('summary');
  for (const claim of ['掌握邀请信开头搭配', '学会礼貌表达', '通过练习，掌握条件从句', '巩固两个易错点']) {
    const ungrounded = JSON.parse(raw);
    ungrounded.coach.learned = [claim];
    expect(() => parseCoachModelOutput(JSON.stringify(ungrounded), request, false, undefined, true)).toThrowError(
      expect.objectContaining({ code: 'COACH_INVALID', path: 'learned[0]' })
    );
    expect(parseCoachModelOutput(JSON.stringify(ungrounded), request).coach.learned).toEqual([claim]);
  }
  const fenced = '\x60\x60\x60json\n' + raw + '\n\x60\x60\x60';
  expect(() => parseCoachModelOutput(fenced, request, false, undefined, true)).toThrowError(
    expect.objectContaining({ code: 'COACH_INVALID', path: 'raw' })
  );
  expect(parseCoachModelOutput(fenced, request).coach.kind).toBe('summary');
});

function session(profile = { exam: 'english1', deadline: '2026-12-22', minutes: 25 }) {
  let state = emptyLearningState('synthetic-user', 'Asia/Shanghai'),
    serial = 0,
    now = Date.parse('2026-10-18T03:00:00Z');
  const apply = (type, data = {}) => {
    const result = applyLearningOperation(state, {
      id: `test-${++serial}`,
      type,
      data: type.startsWith('coach.') ? { ...data, conversationId: 'c', explicit: true } : data,
      at: now
    });
    state = result.state;
    return result.result;
  };
  state = applyLearningOperation(state, {
    id: 'c',
    type: 'conversation.start',
    at: now,
    data: { goal: '考研英语一写作' }
  }).state;
  apply('coach.begin');
  apply('coach.profile', { profile });
  const coach = () => state.conversations[0].coach;
  const generate = (phase, target = phase, patch = {}, transform = (output) => output) => {
    const c = coach(),
      currentDay = new Date(now).toISOString().slice(0, 10),
      day = c.days.find((d) => d.day === currentDay);
    const request = normalizeCoachRequest({
      contract: WRITING_COACH_CONTRACT,
      phase,
      target,
      exam: 'english1',
      day: currentDay,
      essayType: coachEssayType(c, '2026-10-18'),
      ...coachInputFor(c, day, phase, target),
      ...patch
    });
    const requestId = `r${++serial}`;
    apply('coach.request', { requestId, request, modelId: 'synthetic', binding: 'synthetic-binding' });
    apply('coach.result', { requestId, output: transform(coachFixture(request)) });
  };
  return {
    apply,
    generate,
    coach,
    get: () => state,
    nextDay: () => {
      now += 86400000;
    }
  };
}
it('开发主动复习保存真实原答和自评，不改变到期与FSRS；正式渠道拒绝该分支', () => {
  const s = session();
  const due = Date.parse('2026-10-19T03:00:00Z');
  s.coach().library.push({ id: 'saved-phrase', text: 'We invite you to join us.', due, reviews: [], schedule: null });
  const data = {
    itemId: 'saved-phrase',
    answer: 'We invite you to join our reading event.',
    rating: 3,
    practice: true
  };
  try {
    vi.stubGlobal('__YOZI_DEV_TEST__', false);
    expect(() => s.apply('coach.review', data)).toThrow('当前渠道不支持主动复习');
    vi.stubGlobal('__YOZI_DEV_TEST__', true);
    s.apply('coach.review', data);
    expect(s.coach().library[0]).toMatchObject({
      due,
      schedule: null,
      reviews: [],
      practices: [{ answer: data.answer, rating: 3, at: Date.parse('2026-10-18T03:00:00Z'), source: 'self_report' }]
    });
    expect(s.get().events.at(-1).data).not.toHaveProperty('schedule');
  } finally {
    vi.unstubAllGlobals();
  }
});
describe('考研写作方法与完整已保存事实路径', () => {
  it('新版分类反馈保存建议但只聚合有证据的错误，旧记录保持原格式', () => {
    const s = session();
    s.generate('diagnostic');
    for (let i = 1; i <= 5; i++)
      s.apply('coach.answer', { target: 'diagnostic', cardId: `d${i}`, answer: 'Synthetic original.' });
    s.generate('feedback', 'diagnostic');
    s.generate('daily');
    const legacy = JSON.stringify(s.coach().diagnostic.feedback);
    const beforeAttempts = JSON.stringify(s.get().attempts);
    for (const [index, answer, classification] of [
      [0, 'We could meet next Friday.', 'suggestion'],
      [1, 'She go to class.', 'error']
    ]) {
      const target = `card-c${index}`;
      s.apply('coach.answer', { target: 'daily', cardId: `c${index}`, answer });
      const request = normalizeCoachRequest({
        contract: WRITING_COACH_CONTRACT,
        feedbackVersion: COACH_FEEDBACK_VERSION,
        phase: 'feedback',
        target,
        exam: 'english1',
        day: '2026-10-18',
        ...coachInputFor(s.coach(), s.coach().days[0], 'feedback', target)
      });
      const output = {
        ...coachFixture(request),
        weaknesses: ['局部证据对照'],
        weaknessEvidence: [{ label: '局部证据对照', quote: answer, classification }]
      };
      const parsed = parseCoachModelOutput(
        JSON.stringify({ message: '本地业务对照', question: null, tools: [], coach: output }),
        request
      ).coach;
      expect(parsed.weaknesses).toEqual(classification === 'error' ? ['局部证据对照'] : []);
      expect(parsed.lines).toEqual(output.lines);
      expect(() =>
        parseCoachModelOutput(
          '```json\n' + JSON.stringify({ message: '本地业务对照', question: null, tools: [], coach: output }) + '\n```',
          request
        )
      ).toThrowError(expect.objectContaining({ code: 'COACH_INVALID', path: 'raw' }));
      expect(() =>
        normalizeCoachOutput(
          { ...output, weaknessEvidence: [{ label: '局部证据对照', quote: 'outside this answer', classification }] },
          request
        )
      ).toThrowError(expect.objectContaining({ code: 'COACH_INVALID', path: 'weaknessEvidence' }));
      expect(() =>
        normalizeCoachOutput({ ...output, weaknessEvidence: [{ label: '局部证据对照', quote: answer }] }, request)
      ).toThrow('分类');
      const requestId = `classified-${index}`;
      s.apply('coach.request', { requestId, request, modelId: 'synthetic', binding: 'synthetic-binding' });
      s.apply('coach.result', { requestId, output: parsed });
    }
    const reopened = JSON.parse(JSON.stringify(s.get()));
    const feedback = reopened.conversations[0].coach.days[0].feedback;
    expect(feedback['card-c0']).toMatchObject({
      feedbackVersion: 2,
      weaknesses: [],
      weaknessEvidence: [{ classification: 'suggestion' }]
    });
    expect(feedback['card-c1']).toMatchObject({
      feedbackVersion: 2,
      weaknesses: ['局部证据对照'],
      weaknessEvidence: [{ classification: 'error' }]
    });
    const insight = museLearningInsights(reopened, Date.parse('2026-10-18T03:00:00Z')).weaknesses.find(
      (x) => x.label === '局部证据对照'
    );
    expect(insight.evidence).toHaveLength(1);
    expect(insight.evidence[0].feedback.target).toBe('card-c1');
    expect(JSON.stringify(reopened.conversations[0].coach.diagnostic.feedback)).toBe(legacy);
    expect(JSON.stringify(reopened.attempts)).toBe(beforeAttempts);
  });
  it('开发选择题反馈声明原样选项，补齐非选择题原句，正式上下文不变且不改原答', () => {
    const card = {
      id: 'c1',
      prompt: 'The lecture is held ___ June 10th.',
      options: ['on', 'in'],
      example: 'The lecture is held on June 10th.'
    };
    const day = { pack: { cards: [card] }, answers: [{ cardId: 'c1', answer: 'on' }], feedback: {} };
    const before = JSON.stringify(day);
    try {
      vi.stubGlobal('__YOZI_DEV_TEST__', false);
      expect(coachInputFor({}, day, 'feedback', 'card-c1')).toMatchObject({ input: 'on', task: card.prompt });
      vi.stubGlobal('__YOZI_DEV_TEST__', true);
      expect(coachInputFor({}, day, 'feedback', 'card-c1')).toMatchObject({
        input: 'on',
        task: expect.stringContaining('原答是所选项标签')
      });
      expect(coachInputFor({}, day, 'feedback', 'card-c1').task).toContain('["on","in"]');
      const prompt = coachSystemPrompt({
        contract: WRITING_COACH_CONTRACT,
        phase: 'feedback',
        target: 'card-c1',
        exam: 'english2',
        day: '2026-10-25',
        ...coachInputFor({}, day, 'feedback', 'card-c1')
      });
      expect(prompt).toContain('标签本身不是完整句子是正常答题形式');
      expect(prompt).not.toContain('只评阅这些片段');
      const sentence = 'We propose holding the lecture at 3 p.m. in our main auditorium.';
      expect(
        coachSystemPrompt({
          contract: WRITING_COACH_CONTRACT,
          phase: 'feedback',
          target: 'paragraph-0',
          exam: 'english2',
          day: '2026-10-25',
          input: sentence,
          task: '展开本段要点'
        })
      ).toContain(JSON.stringify([sentence]));
      card.options = undefined;
      expect(coachInputFor({}, day, 'feedback', 'card-c1').task).toContain(card.example);
      card.options = ['on', 'in'];
      expect(JSON.stringify(day)).toBe(before);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('开发重新点评保留旧评估和原答，兼容旧题干绑定；正式渠道拒绝', () => {
    try {
      vi.stubGlobal('__YOZI_DEV_TEST__', false);
      const s = session();
      s.generate('diagnostic');
      for (let i = 1; i <= 5; i++)
        s.apply('coach.answer', { target: 'diagnostic', cardId: `d${i}`, answer: 'Synthetic original.' });
      s.generate('feedback', 'diagnostic');
      s.generate('daily');
      s.apply('coach.answer', { target: 'daily', cardId: 'c0', answer: 'on' });
      const day = s.coach().days[0];
      const request = normalizeCoachRequest({
        contract: WRITING_COACH_CONTRACT,
        phase: 'feedback',
        target: 'card-c0',
        exam: 'english1',
        day: '2026-10-18',
        ...coachInputFor(s.coach(), day, 'feedback', 'card-c0')
      });
      // 旧快照保留当时的纯文本任务，新代码不得因增加题型绑定而拒绝回看。
      request.task = day.pack.cards.find((card) => card.id === 'c0').prompt;
      vi.stubGlobal('__YOZI_DEV_TEST__', true);
      s.apply('coach.request', {
        requestId: 'legacy-card',
        request,
        modelId: 'synthetic',
        binding: 'synthetic-binding'
      });
      s.apply('coach.result', { requestId: 'legacy-card', output: coachFixture(request) });
      const previous = structuredClone(s.coach().days[0].feedback['card-c0']);
      const original = structuredClone(s.coach().days[0].answers[0]);
      s.apply('coach.reassess', { target: 'card-c0', feedbackId: previous.id });
      expect(s.coach().days[0].feedback['card-c0']).toBeUndefined();
      expect(s.coach().days[0].feedbackHistory['card-c0']).toEqual([expect.objectContaining(previous)]);
      expect(s.coach().days[0].answers[0]).toEqual({ ...original, assessmentStatus: 'pending' });
      expect(() => s.apply('coach.reassess', { target: 'card-c0', feedbackId: previous.id })).toThrow();
      s.apply('coach.request', {
        requestId: 'legacy-failure',
        request,
        modelId: 'synthetic',
        binding: 'synthetic-binding'
      });
      s.apply('coach.closeRequest', { requestId: 'legacy-failure', outcome: 'failed', closeAssessment: true });
      const updated = normalizeCoachRequest({
        ...request,
        ...coachInputFor(s.coach(), s.coach().days[0], 'feedback', 'card-c0')
      });
      s.apply('coach.request', {
        requestId: 'updated-retry',
        retryOf: 'legacy-failure',
        request: updated,
        modelId: 'synthetic',
        binding: 'synthetic-binding'
      });
      s.apply('coach.result', { requestId: 'updated-retry', output: coachFixture(updated) });
      expect(s.coach().days[0].feedback['card-c0'].id).not.toBe(previous.id);
      expect(s.coach().days[0].feedbackHistory['card-c0']).toHaveLength(1);
      expect(s.coach().days[0].answers[0]).toEqual(original);
      for (let i = 1; i < 8; i++) {
        s.apply('coach.answer', { target: 'daily', cardId: `c${i}`, answer: 'Synthetic original.' });
        s.generate('feedback', `card-c${i}`);
      }
      s.apply('coach.analysis', {
        fields: { genre: '邀请信', recipient: '教授', purpose: '邀请', points: '安排与确认', words: '约100词' }
      });
      s.generate('feedback', 'analysis');
      s.apply('coach.paragraph', {
        index: 0,
        text: 'Your expertise would helps our students.',
        authorship: 'user_typed'
      });
      const writingDay = s.coach().days[0];
      vi.stubGlobal('__YOZI_DEV_TEST__', false);
      const legacyParagraph = normalizeCoachRequest({
        ...request,
        target: 'paragraph-0',
        ...coachInputFor(s.coach(), writingDay, 'feedback', 'paragraph-0')
      });
      vi.stubGlobal('__YOZI_DEV_TEST__', true);
      s.apply('coach.request', {
        requestId: 'legacy-paragraph',
        request: legacyParagraph,
        modelId: 'synthetic',
        binding: 'synthetic-binding'
      });
      s.apply('coach.result', { requestId: 'legacy-paragraph', output: coachFixture(legacyParagraph) });
      const paragraph = structuredClone(s.coach().days[0].drafts[0]);
      const paragraphFeedback = structuredClone(s.coach().days[0].feedback['paragraph-0']);
      s.apply('coach.reassess', { target: 'paragraph-0', feedbackId: paragraphFeedback.id });
      const currentParagraph = coachInputFor(s.coach(), s.coach().days[0], 'feedback', 'paragraph-0');
      expect(currentParagraph.task).toContain(writingDay.pack.writing.prompt);
      s.apply('coach.request', {
        requestId: 'previous-paragraph-scope',
        request: {
          ...legacyParagraph,
          ...currentParagraph,
          task: currentParagraph.task.slice(writingDay.pack.writing.prompt.length + 1)
        },
        modelId: 'synthetic',
        binding: 'synthetic-binding'
      });
      s.apply('coach.closeRequest', {
        requestId: 'previous-paragraph-scope',
        outcome: 'failed',
        closeAssessment: true
      });
      s.generate('feedback', 'paragraph-0');
      expect(s.coach().days[0].drafts[0]).toEqual(paragraph);
      expect(s.coach().days[0].feedbackHistory['paragraph-0']).toEqual([expect.objectContaining(paragraphFeedback)]);
      vi.stubGlobal('__YOZI_DEV_TEST__', false);
      expect(() =>
        s.apply('coach.reassess', { target: 'card-c0', feedbackId: s.coach().days[0].feedback['card-c0'].id })
      ).toThrow('当前渠道');
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it.each([
    { exam: 'english1', minutes: 25 },
    { exam: 'english1', deadline: null, minutes: 25 }
  ])('未提供考试日期也能保存建档，看板倒计时为空：%j', (profile) => {
    const s = session(profile);
    expect(s.coach().profile).toMatchObject({ exam: 'english1', deadline: null, minutes: 25 });
    expect(writingCoachDashboard(s.coach(), '2026-10-18').daysToExam).toBeNull();
  });

  it('传入的日期仍须合法，每天学习时间仍必填', () => {
    expect(() => session({ exam: 'english1', deadline: '2026-02-30', minutes: 25 })).toThrow('日期不合法');
    expect(() => session({ exam: 'english1', deadline: '', minutes: 25 })).toThrow('日期不合法');
    expect(() => session({ exam: 'english1' })).toThrow('每天时间需在10至90分钟');
  });

  it('未知建档通过通用起步任务走通，运行时默认不回写档案', () => {
    const s = session({ exam: null, deadline: null, deadlineBucket: 'next', minutes: null, skipped: true });
    const profile = structuredClone(s.coach().profile);
    const request = normalizeCoachRequest({
      contract: WRITING_COACH_CONTRACT,
      exam: 'general',
      phase: 'diagnostic',
      day: '2026-10-18',
      minutes: s.coach().profile.minutes,
      ...coachInputFor(s.coach(), null, 'diagnostic', 'diagnostic')
    });
    expect(request.minutes).toBe(25);
    s.apply('coach.request', {
      requestId: 'unknown-profile-start',
      request,
      modelId: 'synthetic',
      binding: 'synthetic-binding'
    });
    s.apply('coach.result', { requestId: 'unknown-profile-start', output: coachFixture(request) });
    expect(s.coach().diagnostic.cards).toHaveLength(5);
    expect(s.coach().profile).toEqual(profile);
    expect(profile).toMatchObject({ exam: null, minutes: null, deadline: null, deadlineBucket: 'next', skipped: true });
    expect(coachEssayType(s.coach(), '2026-10-26')).toBe('small');
    expect(() => normalizeCoachRequest({ ...request, essayType: 'large' })).toThrow('通用应用文');
  });

  it('在途只查询原请求，明确关闭终态后才允许另一次主动请求；第七天反馈只记录一次', () => {
    const s = session(),
      request = normalizeCoachRequest({
        contract: WRITING_COACH_CONTRACT,
        phase: 'diagnostic',
        exam: 'english1',
        day: '2026-10-18',
        ...coachInputFor(s.coach(), null, 'diagnostic', 'diagnostic')
      });
    const data = { request, modelId: 'synthetic', binding: 'synthetic-binding' };
    s.apply('coach.request', { ...data, requestId: 'pending' });
    expect(() => s.apply('coach.request', { ...data, requestId: 'duplicate' })).toThrow('已有请求');
    s.apply('coach.closeRequest', { requestId: 'pending', outcome: 'failed' });
    expect(s.coach().requests[0].status).toBe('closed');
    s.generate('diagnostic');
    expect(() => s.apply('coach.survey', { answer: 'skip' })).toThrow();
    for (let i = 0; i < 6; i++) s.nextDay();
    s.apply('coach.survey', { answer: 'skip' });
    expect(() => s.apply('coach.survey', { answer: 'yes' })).toThrow();
  });
  it('终态评估请求可在次日明确重评，原答与旧事件保留，不能跳过终态或更换原答', () => {
    const s = session();
    s.generate('diagnostic');
    for (let i = 1; i <= 5; i++)
      s.apply('coach.answer', { target: 'diagnostic', cardId: `d${i}`, answer: 'Buoyancy acts upward.' });
    const answers = structuredClone(s.coach().diagnostic.answers);
    const request = normalizeCoachRequest({
      contract: WRITING_COACH_CONTRACT,
      phase: 'feedback',
      target: 'diagnostic',
      exam: 'english1',
      day: '2026-10-18',
      ...coachInputFor(s.coach(), null, 'feedback', 'diagnostic')
    });
    const data = { request, modelId: 'synthetic', binding: 'synthetic-binding' };
    s.apply('coach.request', { ...data, requestId: 'assessment' });
    expect(() => s.apply('coach.request', { ...data, requestId: 'early', retryOf: 'assessment' })).toThrow('终态');
    s.apply('coach.closeRequest', { requestId: 'assessment', outcome: 'failed' });
    expect(s.coach().requests.at(-1).status).toBe('pending'); // 兼容已有历史事件。
    s.apply('coach.closeRequest', { requestId: 'assessment', outcome: 'failed', closeAssessment: true });
    expect(s.coach().diagnostic.answers).toEqual(answers);
    s.nextDay();
    expect(() => s.apply('coach.request', { ...data, requestId: 'unbound' })).toThrow('日期');
    expect(() =>
      s.apply('coach.request', {
        ...data,
        request: { ...request, input: 'Changed answer.' },
        requestId: 'changed',
        retryOf: 'assessment'
      })
    ).toThrow('同一份原答');
    s.apply('coach.request', {
      ...data,
      requestId: 'retry',
      retryOf: 'assessment',
      modelId: 'another-synthetic-model'
    });
    expect(s.coach().diagnostic.answers).toEqual(answers);
    expect(s.coach().requests.at(-1)).toMatchObject({ retryOf: 'assessment', status: 'pending' });
    s.apply('coach.result', { requestId: 'retry', output: coachFixture(request) });
    expect(s.coach().requests.find((r) => r.id === 'assessment').status).toBe('closed');
    expect(s.coach().diagnostic.answers.map((a) => a.answer)).toEqual(answers.map((a) => a.answer));
    expect(s.coach().diagnostic.answers.every((a) => a.assessmentStatus === 'assessed')).toBe(true);
  });
  it('限定五项摸底和顺序、考试字数，拒绝伪造来源及不合法的动态目标', () => {
    expect(WRITING_METHOD.onboarding).toHaveLength(5);
    expect(WRITING_METHOD.diagnostic).toHaveLength(5);
    expect(WRITING_METHOD.words.english2.large).toBe('约150词');
    const base = { contract: WRITING_COACH_CONTRACT, phase: 'diagnostic', exam: 'english1', day: '2026-10-18' };
    expect(() => normalizeCoachRequest({ ...base, target: '__proto__' })).toThrow();
    expect(() => normalizeCoachRequest({ ...base, sources: {} })).toThrow();
    expect(() => normalizeCoachRequest({ ...base, day: '2026-02-30' })).toThrow();
    const request = normalizeCoachRequest(base),
      output = coachFixture(request);
    output.cards[0].sourceId = 'not-shared';
    expect(() => normalizeCoachOutput(output, request)).toThrow('未分享');
  });
  it('完整走通摸底、每日任务、逐段改写、句式采用、小结和次日复习；不升级可靠掌握', () => {
    const s = session();
    s.generate('diagnostic');
    expect(() => s.generate('daily')).toThrow();
    for (let i = 1; i <= 5; i++)
      s.apply('coach.answer', { target: 'diagnostic', cardId: `d${i}`, answer: 'Synthetic answer.' });
    s.generate('feedback', 'diagnostic');
    s.generate('daily');
    expect(s.coach().days[0].pack.cards.map((c) => c.kind)).toEqual([
      'collocation',
      'collocation',
      'collocation',
      'translate_zh',
      'translate_zh',
      'translate_en',
      'translate_en',
      'long_sentence'
    ]);
    for (let i = 0; i < 8; i++) {
      s.apply('coach.answer', { cardId: `c${i}`, answer: 'Synthetic answer.' });
      s.generate('feedback', `card-c${i}`);
    }
    s.apply('coach.analysis', {
      fields: { genre: 'letter', recipient: 'friend', purpose: 'invite', points: 'event', words: '100' }
    });
    s.generate('feedback', 'analysis');
    for (let i = 0; i < 2; i++) {
      expect(() => s.apply('coach.paragraph', { index: i, rewrite: true, text: 'premature' })).toThrow();
      s.apply('coach.paragraph', { index: i, text: 'I am writing to invite you.' });
      s.generate('feedback', `paragraph-${i}`);
      s.apply('coach.paragraph', { index: i, rewrite: true, text: 'I am writing to invite you to a reading event.' });
    }
    const feedback = s.coach().days[0].feedback['paragraph-0'];
    s.apply('coach.adopt', { feedbackId: feedback.id, phrase: feedback.phrases[0] });
    s.apply('coach.adopt', { feedbackId: feedback.id, phrase: feedback.phrases[0] });
    expect(s.coach().library).toHaveLength(1);
    s.generate('essay');
    s.generate('summary');
    s.apply('coach.finish');
    expect(writingCoachDashboard(s.coach(), '2026-10-18')).toMatchObject({
      weekDays: 1,
      essays: 1,
      learning: 1,
      familiar: 0,
      masteryBasis: 'self_report'
    });
    s.nextDay();
    expect(() =>
      s.apply('coach.review', {
        itemId: s.coach().library[0].id,
        answer: 'Recalled phrase.',
        rating: 3,
        schedule: { due: '2026-10-21T03:00:00Z' }
      })
    ).not.toThrow();
    expect(s.coach().library[0].reviews[0].source).toBe('self_report');
    expect(writingCoachDashboard(s.coach(), '2026-10-19').weekDays).toBe(1);
    expect(coachEssayType(s.coach(), '2026-10-25')).toBe('large');
    // 同步/备份重放同一批真实事件，事实看板保持一致。
    let restored = emptyLearningState('synthetic-user', 'Asia/Shanghai');
    for (const event of s.get().events) restored = applyLearningOperation(restored, event).state;
    expect(restored.conversations[0].coach).toEqual(s.coach());
  });
  it('未提交原答、切换日、重复反馈和未绑定资料都不能推进；删除资料同步脱敏派生带练', () => {
    const s = session();
    s.generate('diagnostic');
    expect(() => s.generate('feedback', 'diagnostic')).toThrow();
    expect(() =>
      s.apply('coach.answer', { day: '2026-10-17', target: 'diagnostic', cardId: 'd1', answer: 'old' })
    ).toThrow();
    const m = parsePastedMaterial('private synthetic material', 'm');
    s.apply('material.add', { material: m });
    s.apply('coach.material', { materialId: 'm' });
    const preview = inspectMaterialDeletion(s.get(), 'm');
    expect(preview.conversationIds).toEqual(['c']);
    s.apply('material.delete', {
      materialId: 'm',
      materialIds: preview.materialIds,
      questionKeys: preview.questionKeys
    });
    expect(JSON.stringify(s.get())).not.toContain('private synthetic material');
    expect(s.get().conversations[0].coach).toBeUndefined();
  });

  it('旧档案没有准备方向字段时，建档、请求与结果都不受影响', () => {
    const s = session();
    // session() 写入的正是旧形状：只有 exam/deadline/minutes，没有 subjects/track。
    expect(s.coach().profile.subjects).toEqual([]);
    expect(s.coach().profile.track).toBe('kaoyan-english-writing');
    s.generate('diagnostic');
    expect(s.coach().requests).toHaveLength(1);
    expect(s.coach().requests[0].status).toBe('completed');
  });
});

it('新量表契约贯穿原稿、按维反馈与次日改写，全文不进入FSRS', () => {
  const s = session();
  s.generate('diagnostic');
  for (let index = 1; index <= 5; index++)
    s.apply('coach.answer', { target: 'diagnostic', cardId: `d${index}`, answer: 'Synthetic diagnostic original.' });
  s.generate('feedback', 'diagnostic');
  s.generate('daily');
  for (let index = 0; index < 8; index++) {
    s.apply('coach.answer', { cardId: `c${index}`, answer: 'Synthetic practice original.' });
    s.generate('feedback', `card-c${index}`);
  }
  s.apply('coach.analysis', {
    fields: { genre: 'letter', recipient: 'friend', purpose: 'invite', points: 'event', words: '100' }
  });
  s.generate('feedback', 'analysis');
  for (let index = 0; index < 2; index++) {
    s.apply('coach.paragraph', { index, text: 'Original student paragraph.' });
    s.generate('feedback', `paragraph-${index}`);
    s.apply('coach.paragraph', { index, rewrite: true, text: 'Revised student paragraph.', authorship: 'user_typed' });
  }
  s.apply('coach.essaySubmit');
  s.generate('essay', 'essay', { dimensionContract: 'writing-dimensions-v1' });
  const original = structuredClone(s.coach().days[0].writingSubmissions);
  expect(s.coach().days[0].rewritePending).toBe(true);
  expect(s.coach().rewriteTasks).toHaveLength(1);
  const task = s.coach().rewriteTasks[0];
  expect(() => s.apply('coach.rewriteAnswer', { rewriteId: task.id, answer: 'Too early.' })).toThrow();
  expect(s.get().reviews).toEqual([]);
  expect(s.coach().library).toEqual([]);
  s.nextDay();
  s.apply('coach.rewriteAnswer', { rewriteId: task.id, answer: 'A complete next-day student rewrite.' });
  s.generate('essay', 'rewrite', { dimensionContract: 'writing-dimensions-v1' }, (output) => ({
    ...output,
    dimensions: output.dimensions.map((dimension) => ({ ...dimension, score: 2 }))
  }));
  expect(s.coach().days[0].writingSubmissions).toEqual(original);
  expect(s.coach().rewriteTasks[0].feedback.dimensions.every((dimension) => dimension.score === 2)).toBe(true);
  expect(s.coach().days[0].rewritePending).toBe(false);
  const snapshot = compactLearningProgress(s.get(), 'c');
  expect(snapshot.draftId).toBe(s.coach().rewriteTasks[0].answer.id);
  expect(snapshot.dimensionScores.every((dimension) => dimension.score === 2)).toBe(true);
  expect(s.get().reviews).toEqual([]);
  expect(s.coach().learningRecords.at(-1)).toMatchObject({
    source: 'host_validated',
    target: 'rewrite',
    evaluation: 'AI评估'
  });
  const restored = prepareLearningRestore(
    emptyLearningState('synthetic-user', 'Asia/Shanghai'),
    JSON.stringify(s.get())
  ).state;
  expect(restored.conversations[0].coach.rewriteTasks).toEqual(s.coach().rewriteTasks);
});

it.each(['dimension', 'score', 'evidence', 'duplicate'])('新批改合同拒绝越界结果并保留原稿：%s', (violation) => {
  const request = normalizeCoachRequest({
    contract: WRITING_COACH_CONTRACT,
    phase: 'essay',
    target: 'essay',
    exam: 'english1',
    day: '2026-10-26',
    input: 'The student original sentence.',
    dimensionContract: 'writing-dimensions-v1'
  });
  const output = coachFixture(request);
  if (violation === 'dimension') output.dimensions[0].name = 'invented_dimension';
  if (violation === 'score') output.dimensions[0].score = 99;
  if (violation === 'evidence') output.dimensions[0].evidence = ['This was never written by the student.'];
  if (violation === 'duplicate') output.dimensions[1].name = output.dimensions[0].name;
  expect(() => normalizeCoachOutput(output, request)).toThrow(expect.objectContaining({ code: 'COACH_INVALID' }));
});
