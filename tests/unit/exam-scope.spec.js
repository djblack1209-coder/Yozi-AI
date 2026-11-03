import { describe, expect, it } from 'vitest';
import {
  explicitShenlunScope,
  normalizeExamScope,
  examScopeLabel,
  EXAM_SCOPE_V2_CONTRACT
} from '../../laf-backend/functions/_shared/learning-exam-scope.js';
import {
  normalizeIntakeContext,
  normalizeIntakeReply,
  normalizeStudyProfile
} from '../../laf-backend/functions/_shared/learning-intake.js';
import { shenlunScopeBinding } from '../../laf-backend/functions/_shared/learning-shenlun-method.js';
import {
  normalizeCoachRequest,
  coachSystemPrompt,
  coachInputFor
} from '../../laf-backend/functions/_shared/learning-writing-coach.js';
import { applyLearningOperation, emptyLearningState } from '@/services/learning/learning-domain.js';

const scope = (patch = {}) => ({
  contract: 'learning-exam-scope-v1',
  year: 2027,
  examLevel: 'provincial',
  region: 'CN-JS',
  positionCategory: 'B',
  ...patch
});
const context = (answers) => ({
  contract: 'model-intake-v2',
  scopeContract: 'learning-exam-scope-v1',
  turns: answers.map((answer) => ({ question: '你在准备什么？', answer }))
});
const profile = {
  goal: '准备申论',
  category: 'civil',
  exam: 'general',
  subjects: ['申论'],
  minutes: null,
  deadline: null,
  foundation: null
};
const proposal = (ctx, extra = {}) =>
  normalizeIntakeReply(
    {
      message: '请确认学习目标',
      intake: { options: [], input: false, profile: { ...profile, ...extra } },
      question: null,
      tools: []
    },
    false,
    ctx
  );
const at = Date.parse('2026-11-03T10:00:00Z');
const request = (examScope = scope(), phase = 'daily') => ({
  contract: 'kaoyan-writing-coach-v1',
  exam: 'shenlun',
  methodContract: 'shenlun-writing-method-v2',
  day: '2026-11-03',
  phase,
  target: phase,
  sources: [
    { id: 'scope-material', name: '原创资料', content: '服务站只登记待核事项，尚未确认的事项不得写成已经办结。' }
  ],
  examScope
});

describe('explicit exam scope and bounded syllabus sources', () => {
  const gdScope = (positionCategory = 'gd-shenlun-2', patch = {}) =>
    scope({ contract: EXAM_SCOPE_V2_CONTRACT, region: 'CN-GD', positionCategory, ...patch });
  const extractV2 = (answers) => explicitShenlunScope(answers, EXAM_SCOPE_V2_CONTRACT);
  it('uses student-facing character-count instructions only for the new source contract', () => {
    const essay = (saved) => ({
      ...request(saved, 'essay'),
      task: '一段改进建议，160至220字',
      input: '建议根据材料提出办法。'
    });
    expect(coachSystemPrompt(essay(gdScope()))).toContain('这是本次正文的字符统计');
    expect(coachSystemPrompt(essay(gdScope()))).not.toContain('这是开发侧计数');
    expect(coachSystemPrompt(essay(scope()))).toContain('这是开发侧计数');
  });
  it.each([
    ['申论一', 'gd-shenlun-1', ['阅读理解', '综合分析', '提出和解决问题', '文字表达']],
    ['申论二', 'gd-shenlun-2', ['阅读理解', '贯彻执行', '解决问题', '文字表达']],
    ['行政执法专业和申论', 'gd-law-enforcement', ['阅读理解', '依法办事', '公共服务', '文字表达']],
    ['公安专业和申论', 'gd-police', ['阅读理解', '行政管理', '依法处置', '文字表达']]
  ])(
    'binds the explicit Guangdong paper %s to its own 2027 body section without claiming alignment',
    (paper, category, capabilities) => {
      const saved = extractV2([`准备2027年广东省考${paper}。`]);
      expect(saved).toEqual(gdScope(category));
      const binding = shenlunScopeBinding(saved);
      expect(binding).toMatchObject({
        contract: 'shenlun-syllabus-scope-v2',
        sourceStatus: 'body_available',
        alignmentStatus: 'pending_verification',
        source: {
          id: 'gd-civil-2027-shenlun-v1',
          capabilities,
          bodySha256: '431002a7e26db33535244a637b541f4534562de19aa9a56ac195f800958570b9'
        }
      });
      expect(binding.source.section).toContain(paper.startsWith('申论') ? `《${paper}》` : '2.申论部分');
      expect(coachSystemPrompt(request(saved))).toContain(JSON.stringify(binding));
    }
  );
  it('corrects an explicitly named paper but never infers the two general papers from residence, job name or an ambiguous answer', () => {
    expect(extractV2(['准备2027年广东省考申论一。', '改为申论二，其他不变。'])).toEqual(gdScope());
    for (const paper of ['一般职位申论', '公安职位申论', '申论一或申论二', 'A类申论'])
      expect(extractV2([`准备2027年广东省考${paper}。`])).toEqual(gdScope(null));
    expect(extractV2(['我是广东人，准备2027年国考行政执法类申论。'])).toEqual(
      scope({
        contract: EXAM_SCOPE_V2_CONTRACT,
        examLevel: 'national',
        region: 'CN',
        positionCategory: 'law-enforcement'
      })
    );
    expect(extractV2(['准备2027年广东省考申论二。', '改为2027年江苏省考B类申论。'])).toEqual(
      scope({ contract: EXAM_SCOPE_V2_CONTRACT })
    );
    expect(extractV2(['2027-12-20之前学申论。'])).toBeNull();
    expect(extractV2(['准备2027年广东省考申论一。', '职位类别尚未确定。'])).toEqual(gdScope(null));
  });
  it('pins source catalogues and rejects Guangdong classes in v1, another province, another exam or an English profile', () => {
    expect(explicitShenlunScope(['准备2027年广东省考申论二。'])).toEqual(
      scope({ region: 'CN-GD', positionCategory: null })
    );
    expect(shenlunScopeBinding(scope({ region: 'CN-GD', positionCategory: null }))).toMatchObject({
      contract: 'shenlun-syllabus-scope-v1',
      sourceStatus: 'missing',
      source: null
    });
    for (const patch of [
      { contract: 'learning-exam-scope-v1' },
      { region: 'CN-JS' },
      { examLevel: 'national', region: 'CN' }
    ])
      expect(() => normalizeExamScope(gdScope('gd-shenlun-2', patch))).toThrow();
    expect(() => normalizeExamScope(gdScope('A'))).toThrow();
    expect(shenlunScopeBinding(gdScope('gd-shenlun-2', { year: 2028 })).sourceStatus).toBe('missing');
    expect(() =>
      normalizeStudyProfile({ ...profile, category: 'kaoyan', subjects: ['英语二'], examScope: gdScope() })
    ).toThrow();
    expect(() => normalizeIntakeContext({ ...context([]), scopeContract: 'learning-exam-scope-v3' })).toThrow();
  });
  it('derives the new profile from answers, requires confirmation, and saves the version in the existing request', () => {
    const ctx = {
      ...context(['准备2027年广东省考申论一。', '改为申论二，其他不变。']),
      scopeContract: EXAM_SCOPE_V2_CONTRACT
    };
    const reply = proposal(ctx, { examScope: scope() });
    expect(reply.intake.profile.examScope).toEqual(gdScope());
    let state = emptyLearningState('gd-synthetic', 'America/Los_Angeles');
    state.intake = { ...ctx, requestId: 'gd-intake', modelId: 'synthetic', status: 'ready', reply };
    expect(state.conversations).toHaveLength(0);
    state = applyLearningOperation(state, {
      id: 'gd-confirm',
      type: 'intake.accept',
      at,
      data: { explicit: true, coachMethod: 'shenlun-writing-method-v2' }
    }).state;
    const coach = state.conversations[0].coach;
    expect(coach.profile.examScope).toEqual(gdScope());
    const input = coachInputFor(coach, null, 'diagnostic', 'diagnostic');
    expect(normalizeCoachRequest({ ...request(coach.profile.examScope, 'diagnostic'), ...input }).examScope).toEqual(
      gdScope()
    );
  });
  it('keeps the explicit year and region while a later answer corrects the category', () => {
    const turns = context(['准备2027年江苏省考C类申论。', '改为江苏省2027年度省考B类申论，其他不变。']).turns;
    const before = JSON.stringify(turns);
    expect(explicitShenlunScope(turns)).toEqual(scope());
    expect(examScopeLabel(scope())).toBe('2027年 · 江苏公务员 · B类');
    expect(JSON.stringify(turns)).toBe(before);
  });
  it('does not treat a deadline or residence as the exam scope or guess an ambiguous category', () => {
    expect(explicitShenlunScope(['2027-12-20之前学申论。'])).toBeNull();
    expect(explicitShenlunScope(['我是江苏人，准备2027年国考行政执法类申论。'])).toEqual(
      scope({ examLevel: 'national', region: 'CN', positionCategory: 'law-enforcement' })
    );
    expect(explicitShenlunScope(['准备2027年江苏省考A类或B类申论。'])).toEqual(scope({ positionCategory: null }));
    expect(explicitShenlunScope(['准备2027年浙江省考C类申论。'])).toEqual(
      scope({ region: 'CN-ZJ', positionCategory: 'C' })
    );
    expect(explicitShenlunScope(['准备申论。'])).toBeNull();
  });
  it('derives scope from v2 answers and ignores model-invented scope, leaving v1 receipts unchanged', () => {
    const answers = context(['准备2027年江苏省考B类申论。']);
    const value = proposal(answers, { examScope: scope({ region: 'CN-ZJ' }) });
    expect(value.intake.profile.examScope).toEqual(scope());
    expect(proposal(context(['准备申论。']), { examScope: scope() }).intake.profile.examScope).toBeUndefined();
    expect(proposal({ turns: answers.turns }).intake.profile.examScope).toBeUndefined();
    expect(proposal({ contract: 'model-intake-v2', turns: answers.turns }).intake.profile.examScope).toBeUndefined();
  });
  it('does not convert a matching source, a different region/year, or an announcement to completed alignment', () => {
    const matched = shenlunScopeBinding(scope());
    expect(matched).toMatchObject({
      sourceStatus: 'body_available',
      alignmentStatus: 'pending_verification',
      source: { section: '二（二）申论 / B类', capabilities: ['阅读理解', '依法办事', '公共服务', '文字表达'] }
    });
    for (const patch of [{ region: 'CN-ZJ' }, { year: 2028 }, { positionCategory: null }])
      expect(shenlunScopeBinding(scope(patch))).toMatchObject({
        source: null,
        sourceStatus: 'missing',
        alignmentStatus: 'pending_verification'
      });
    expect(
      shenlunScopeBinding(scope({ examLevel: 'national', region: 'CN', positionCategory: 'law-enforcement' }))
    ).toMatchObject({
      sourceStatus: 'announcement_only',
      alignmentStatus: 'pending_verification',
      source: { capabilities: [] }
    });
    expect(() => normalizeExamScope({ ...scope(), sourceStatus: 'verified' })).toThrow();
    expect(() => normalizeExamScope(scope({ examLevel: 'national' }))).toThrow();
    expect(() => normalizeStudyProfile({ ...profile, examScope: false })).toThrow();
    expect(() => normalizeCoachRequest({ ...request(), exam: 'english2', methodContract: undefined })).toThrow();
    const unsupported = coachSystemPrompt(request(scope({ region: 'CN-ZJ' })));
    expect(unsupported).not.toContain('江苏省2027年度');
    expect(unsupported).toContain('"sourceStatus":"missing"');
  });
  it('persists only on confirmation and refuses requests or late results for a different saved scope', () => {
    let state = emptyLearningState('scope-synthetic', 'America/Los_Angeles');
    const ctx = context(['准备2027年江苏省考B类申论。']);
    state.intake = { ...ctx, requestId: 'scope-intake', modelId: 'synthetic', status: 'ready', reply: proposal(ctx) };
    expect(state.conversations).toEqual([]);
    const before = JSON.stringify(state);
    state = applyLearningOperation(state, {
      id: 'scope-confirm',
      type: 'intake.accept',
      at,
      data: { explicit: true, coachMethod: 'shenlun-writing-method-v2' }
    }).state;
    const conversationId = state.conversations[0].id;
    const coach = state.conversations[0].coach;
    expect(coach.profile.examScope).toEqual(scope());
    expect(state.conversations[0].studyProfile.examScope).toEqual(scope());
    const oldClientNext = applyLearningOperation(state, {
      id: 'old-client-new-intake',
      type: 'intake.request',
      at: at + 1,
      data: { explicit: true, requestId: 'old-client-request', modelId: 'synthetic', contract: 'model-intake-v2' }
    }).state;
    expect(oldClientNext.intake.scopeContract).toBeUndefined();
    expect(JSON.parse(before).conversations).toEqual([]);
    const bound = coachInputFor(coach, null, 'diagnostic', 'diagnostic');
    const r = { ...request(scope(), 'diagnostic'), ...bound, sources: [] };
    const attempt = (s, req) =>
      applyLearningOperation(s, {
        id: 'scope-request',
        type: 'coach.request',
        at: at + 1,
        data: {
          conversationId,
          requestId: 'scope-model-request',
          modelId: 'synthetic',
          binding: 'scope-binding',
          explicit: true,
          request: req
        }
      });
    expect(() =>
      attempt(state, { ...r, sources: request().sources, examScope: scope({ positionCategory: 'C' }) })
    ).toThrow('考试年度、地区或职位类别已变化');
    // A selected original material is still required; scope metadata never substitutes for it.
    expect(() => attempt(state, r)).toThrow('请先添加申论材料');
    const material = {
      id: 'scope-material',
      name: '原创资料',
      segments: [{ page: null, content: request().sources[0].content }]
    };
    state.materials.push(material);
    coach.materialIds.push(material.id);
    const pending = attempt(state, { ...r, sources: request().sources }).state;
    pending.conversations[0].coach.profile.examScope = scope({ positionCategory: 'C' });
    const original = JSON.stringify(pending);
    expect(() =>
      applyLearningOperation(pending, {
        id: 'late-scope-result',
        type: 'coach.result',
        at: at + 2,
        data: {
          conversationId,
          requestId: 'scope-model-request',
          modelId: 'synthetic',
          binding: 'scope-binding',
          explicit: true,
          output: {}
        }
      })
    ).toThrow('考试年度、地区或职位类别已变化');
    expect(JSON.stringify(pending)).toBe(original);
  });
});
