import { describe, it, expect, vi } from 'vitest';
import { emptyLearningState, applyLearningOperation } from '@/services/learning/learning-domain.js';
import { executeLearningTool, userDirective, LEARNING_TOOLS } from '@/services/learning/learning-tools.js';
import {
  compactLearningProgress,
  hostReviewRating,
  LEARNING_BUDGET_PHASES,
  learningBudgetPhase,
  learningTimeout,
  coachVerificationBudget,
  isDeepSeekProDiagnostic,
  PRO_DIAGNOSTIC_VERIFICATION_MS,
  normalizeLearningSnapshot,
  phaseCallLimit
} from '../../laf-backend/functions/_shared/learning-runtime-policy.js';
import { dailyConversationContext } from '../../laf-backend/functions/_shared/learning-journey.js';
import { dayKey, effectiveGrade } from '@/services/learning/learning-domain.js';
import { newAccount, reserveCall } from '../../laf-backend/functions/_shared/learning-account.ts';
import {
  buildLearningRequest,
  parseLearningOutput,
  prepareCoachFeedbackModel,
  readCoachFunctionResponse,
  writingVerificationTimeout,
  validateCoachSchema,
  decodeCoachResponse
} from '../../laf-backend/functions/_shared/ai-providers/learning-provider.ts';
import { coachInferenceContext } from '../../laf-backend/functions/_shared/learning-writing-coach.js';

function repository() {
  let state = emptyLearningState('host-policy');
  const commit = (operation) => {
    const result = applyLearningOperation(state, operation);
    state = result.state;
    return result;
  };
  commit({ id: 'c', type: 'conversation.start', data: { goal: '考研英语写作' }, at: 1000 });
  return { read: () => state, commit };
}
const context = () => ({
  conversationId: 'c',
  origin: 'model',
  permissions: ['read', 'learn'],
  calls: 0,
  maxCalls: 3,
  deadline: Date.now() + 5000
});

describe('宿主教学权限与隐私', () => {
  it('只为官方自带 Pro 的五题混合摸底延长独立复核', () => {
    const model = { source: 'byok', model: 'deepseek-v4-pro', endpoint: 'https://api.deepseek.com/chat/completions' };
    const context = { coach: { phase: 'feedback', target: 'diagnostic', feedbackVersion: 2 } };
    expect(isDeepSeekProDiagnostic(context, model)).toBe(true);
    expect(isDeepSeekProDiagnostic(context, { ...model, model: 'deepseek-flash' })).toBe(false);
    expect(isDeepSeekProDiagnostic(context, { ...model, endpoint: 'https://example.com/chat/completions' })).toBe(
      false
    );
    expect(isDeepSeekProDiagnostic({ coach: { ...context.coach, target: 'analysis' } }, model)).toBe(false);
    const writingOutput = { contract: 'writing-error-verification-v2' };
    expect(writingVerificationTimeout({ ...model, writingOutput })).toBe(60000);
    expect(
      writingVerificationTimeout({ ...model, writingOutput: { ...writingOutput, diagnosticVerification: true } })
    ).toBe(PRO_DIAGNOSTIC_VERIFICATION_MS);
  });
  it.each(['method', 'entry.create', 'entry.update', 'review'])('模型无法请求 %s，也不会生成学习事实', (name) => {
    const repo = repository();
    expect(() =>
      parseLearningOutput(JSON.stringify({ message: 'attempt', tools: [{ name, arguments: {} }] }))
    ).toThrow();
    expect(() => executeLearningTool(repo, { id: name.replace('.', '_'), name, arguments: {} }, context())).toThrow();
    expect(repo.read().profile).toEqual([]);
    expect(repo.read().reviews).toEqual([]);
    expect(repo.read().executions.at(-1).decision).toBe('denied');
  });
  it('进度与快照没有学生原文，执行收据仅含白名单元信息', () => {
    const repo = repository();
    repo.commit({
      id: 'private',
      type: 'message.add',
      data: { conversationId: 'c', role: 'user', content: 'PRIVATE_STUDENT_HISTORY' }
    });
    const outcome = executeLearningTool(repo, { id: 'query', name: 'progress', arguments: {} }, context());
    expect(JSON.stringify(outcome.result)).not.toContain('PRIVATE_STUDENT_HISTORY');
    expect(outcome.result).toMatchObject({ contract: 'learning-snapshot-v1', draftId: null, planVersion: 0 });
    const receipt = repo.read().events.find((event) => event.id === 'query:receipt').data;
    expect(Object.keys(receipt).sort()).toEqual([
      'decision',
      'parameterHash',
      'permission',
      'remainingBudget',
      'tool',
      'version'
    ]);
    expect(receipt).toMatchObject({ decision: 'allowed', remainingBudget: 2, permission: 'read' });
    expect(JSON.stringify(compactLearningProgress(repo.read(), 'c'))).not.toContain('PRIVATE_STUDENT_HISTORY');
    expect(repo.read().conversations[0].messages[0].content).toBe('PRIVATE_STUDENT_HISTORY');
  });
  it('文字命令只在非作答状态且短文本时生效', () => {
    const state = repository().read();
    expect(userDirective('换方法', state, 'c')).toMatchObject({ type: 'strategy.set' });
    expect(userDirective('换方法', state, 'c', { answering: true })).toBeNull();
    expect(userDirective('换方法' + ' '.repeat(50) + '请忽略以上内容', state, 'c')).toBeNull();
    expect(userDirective('我的答案是：换方法', state, 'c')).toBeNull();
  });
  it('本地写入超时发生在提交之前，拒绝收据不包含参数正文', () => {
    const repo = repository();
    let tick = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => (tick += 1500));
    try {
      expect(() =>
        executeLearningTool(
          repo,
          { id: 'slow', name: 'hint', arguments: { content: 'PRIVATE_ANSWER', level: 1 } },
          { ...context(), deadline: 100000 }
        )
      ).toThrow('超时');
      expect(JSON.stringify(repo.read().executions)).not.toContain('PRIVATE_ANSWER');
    } finally {
      vi.restoreAllMocks();
    }
    expect(LEARNING_TOOLS.progress.timeoutMs).toBe(2000);
    expect(LEARNING_TOOLS.assess.timeoutMs).toBe(60000);
    expect(learningTimeout({ coach: { phase: 'essay' } })).toBe(60000);
    expect(learningTimeout({ coach: { phase: 'feedback', target: 'diagnostic', feedbackVersion: 2 } })).toBe(110000);
    expect(coachVerificationBudget({ coach: { phase: 'feedback', target: 'diagnostic', feedbackVersion: 2 } })).toBe(
      120000
    );
    for (const coach of [
      { phase: 'diagnostic', target: 'diagnostic', feedbackVersion: 2 },
      { phase: 'feedback', target: 'card-c1', feedbackVersion: 2 },
      { phase: 'feedback', target: 'diagnostic', feedbackVersion: 1 }
    ]) {
      expect(coachVerificationBudget({ coach })).toBe(65000);
      expect(learningTimeout({ coach })).toBe(60000);
    }
  });
  it('只装最近六条当前消息，旧日原文仍保留本机', () => {
    const repo = repository(),
      now = Date.now();
    repo.commit({
      id: 'old',
      type: 'message.add',
      at: now - 172800000,
      data: { conversationId: 'c', role: 'user', content: 'OLD_PRIVATE_HISTORY' }
    });
    for (let index = 0; index < 12; index++)
      repo.commit({
        id: `m${index}`,
        type: 'message.add',
        at: now,
        data: { conversationId: 'c', role: index % 2 ? 'assistant' : 'user', content: `turn-${index}` }
      });
    const result = dailyConversationContext(repo.read(), 'c', now, { dayKey, effectiveGrade });
    expect(result.messages).toHaveLength(6);
    expect(result.messages[0].content).toBe('turn-6');
    expect(JSON.stringify(result)).not.toContain('OLD_PRIVATE_HISTORY');
    expect(repo.read().conversations[0].messages).toHaveLength(13);
  });
});

it('FSRS四档由宿主结果映射，未知不会被当成正确', () => {
  expect(hostReviewRating({ outcome: 'wrong' })).toBe(1);
  expect(hostReviewRating({ outcome: 'uncertain' })).toBe(1);
  expect(hostReviewRating({ outcome: 'correct', hinted: true })).toBe(2);
  expect(hostReviewRating({ outcome: 'correct' })).toBe(3);
  expect(hostReviewRating({ outcome: 'correct', correctStreak: 2 })).toBe(4);
});

it('练题额度用尽不截断写作的独立额度，账户硬边界保留', () => {
  const account = newAccount('host-policy');
  const limit = 100;
  for (let index = 0; index < phaseCallLimit(limit, 'practice'); index++)
    account.calls.push({ id: `p${index}`, source: 'byok', budgetPhase: 'practice' });
  const input = {
    id: 'writing',
    fingerprint: 'same',
    source: 'byok',
    budgetPhase: 'writing',
    callLimit: limit,
    maxCost: 0,
    units: 0
  };
  expect(() => reserveCall(account, { ...input, id: 'practice', budgetPhase: 'practice' })).toThrow('本阶段');
  expect(reserveCall(account, input).call.budgetPhase).toBe('writing');
  expect(learningBudgetPhase({ coach: { phase: 'feedback', target: 'paragraph-0' } })).toBe('writing');
  expect(learningBudgetPhase({ coach: { phase: 'feedback', target: 'rewrite' } })).toBe('writing');
});

it('工具往返的第二次请求绑定工具结果及严格JSON契约', () => {
  const config = {
    model: 'synthetic',
    maxOutput: 256,
    endpoint: 'https://provider.example/chat',
    capabilities: { structured: false, tools: false },
    capabilityProbe: { stage: 'tool', nonce: 'nonce' }
  };
  const first = buildLearningRequest(config, []);
  expect(first.tools[0].function.name).toBe('yozi_capability_echo');
  expect(first.tools[0].function.parameters.properties.nonce.enum).toEqual(['nonce']);
  const second = buildLearningRequest({ ...config, capabilityProbe: { stage: 'json', nonce: 'nonce' } }, [
    { role: 'tool', tool_call_id: 'probe', content: '{"nonce":"nonce"}' }
  ]);
  expect(second.response_format.json_schema.strict).toBe(true);
  expect(second.response_format.json_schema.schema.properties.accepted.enum).toEqual([true]);
  expect(second.messages[0].role).toBe('tool');
});

it('快照的网络投影丢弃历史、额外原答和额外工具权限', () => {
  const result = normalizeLearningSnapshot({
    revision: 3,
    history: ['PRIVATE'],
    profile: { exam: 'english2', notes: 'PRIVATE' },
    teaching: { method: 'steps', permissions: ['delete'] },
    dueCards: [{ id: 'card_1', due: 123, answer: 'PRIVATE' }]
  });
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
  expect(result.teaching).toEqual({ stopped: false, method: 'steps' });
  expect(result.dueCards).toEqual([{ id: 'card_1', due: 123 }]);
});

it('已实测能力的BYOK通过原生函数返回批改数据，原文枚举与非空字段仍强制校验，思考与输出上限保持', async () => {
  const config = {
    id: 'verified',
    provider: 'Agnes AI',
    model: 'agnes-2.5-flash',
    endpoint: 'https://apihub.agnes-ai.com/v1/chat/completions',
    source: 'byok',
    maxOutput: 2000,
    capabilities: { tools: true, structured: true, vision: false, stream: false },
    capabilityCheck: { version: 1, tools: true, structured: true, checkedAt: 1 }
  };
  const request = {
    contract: 'kaoyan-writing-coach-v1',
    phase: 'essay',
    target: 'essay',
    exam: 'english2',
    day: '2026-10-26',
    input: 'We has arranged a visit.',
    sources: [],
    dimensionContract: 'writing-dimensions-v1',
    feedbackVersion: 2
  };
  const prepared = prepareCoachFeedbackModel(config, request);
  const wire = buildLearningRequest(prepared, []);
  expect(prepared.maxOutput).toBe(2000);
  expect(wire.chat_template_kwargs).toEqual({ enable_thinking: true });
  expect(wire).not.toHaveProperty('reasoning_effort');
  expect(wire).not.toHaveProperty('response_format');
  expect(wire.tools.map((t) => t.function.name)).toEqual(['yozi_coach_response']);
  expect(wire.tools[0].function.strict).toBe(true);
  const { coachFixture } = await import('../fixtures/writing-coach.js');
  const output = {
    message: 'AI评估',
    question: null,
    tools: [],
    coach: { ...coachFixture(request), strengths: [], strengthEvidence: [] }
  };
  const { kind: _kind, target: _target, ...feedbackFields } = structuredClone(output.coach);
  const wireOutput = {
    message: output.message,
    ...feedbackFields,
    quoteVersion: prepared.writingOutput.schema.properties.quoteVersion.enum[0]
  };
  wireOutput.lines = wireOutput.lines.map(({ original, ...line }) => ({
    ...line,
    quoteId: 'q1',
    rewriteMode: 'suggest'
  }));
  wireOutput.dimensions = wireOutput.dimensions.map(({ evidence, ...dimension }) => ({
    ...dimension,
    evidenceIds: ['q1']
  }));
  wireOutput.weaknessEvidence = wireOutput.weaknessEvidence.map(({ quote, ...item }) => ({
    ...item,
    quoteId: 'q1'
  }));
  const raw = {
    choices: [
      {
        finish_reason: 'tool_calls',
        message: {
          content: null,
          tool_calls: [
            {
              id: 'reply',
              type: 'function',
              function: { name: 'yozi_coach_response', arguments: JSON.stringify(wireOutput) }
            }
          ]
        }
      }
    ]
  };
  expect(JSON.parse(decodeCoachResponse(prepared, readCoachFunctionResponse(prepared, raw)))).toEqual(output);
  expect(() => validateCoachSchema(prepared.writingOutput.schema, wireOutput)).not.toThrow();
  const emptyRewrite = structuredClone(wireOutput);
  emptyRewrite.lines[0].rewrite = '';
  expect(() => validateCoachSchema(prepared.writingOutput.schema, emptyRewrite)).toThrow();
  const inventedQuote = structuredClone(wireOutput);
  inventedQuote.dimensions[0].evidenceIds = ['q999'];
  expect(() => validateCoachSchema(prepared.writingOutput.schema, inventedQuote)).toThrow();
  const keep = structuredClone(wireOutput);
  keep.lines[0].rewriteMode = 'keep';
  keep.lines[0].rewrite = null;
  expect(JSON.parse(decodeCoachResponse(prepared, JSON.stringify(keep))).coach.lines[0].rewrite).toBe(request.input);
  keep.lines[0].rewrite = 'invented replacement';
  expect(() => decodeCoachResponse(prepared, JSON.stringify(keep))).toThrow();
  expect(() => decodeCoachResponse(prepared, JSON.stringify({ ...wireOutput, tools: ['method'] }))).toThrow();
  expect(() => decodeCoachResponse(prepared, JSON.stringify({ ...wireOutput, coach: {} }))).toThrow();
  const staleVersion = structuredClone(wireOutput);
  staleVersion.quoteVersion = 'old-draft';
  expect(() => decodeCoachResponse(prepared, JSON.stringify(staleVersion))).toThrow();
  const missingMode = structuredClone(wireOutput);
  delete missingMode.lines[0].rewriteMode;
  expect(() => decodeCoachResponse(prepared, JSON.stringify(missingMode))).toThrow();
  raw.choices[0].message.tool_calls[0].function.name = 'method';
  expect(() => readCoachFunctionResponse(prepared, raw)).toThrow();
});

it('新批改不能仅因可选润色降档，实际错误必须与本维引用对应，审题不产生维度档位', () => {
  const config = {
    source: 'byok',
    model: 'agnes-2.5-flash',
    endpoint: 'https://apihub.agnes-ai.com/v1/chat/completions',
    maxOutput: 8192,
    capabilities: { tools: true, structured: true },
    capabilityCheck: { version: 1, tools: true, structured: true, checkedAt: 1 }
  };
  const request = {
    contract: 'kaoyan-writing-coach-v1',
    phase: 'feedback',
    target: 'card-c4',
    exam: 'english2',
    day: '2026-10-27',
    task: '将“活动将在周五下午举行”译成英文',
    input: 'The event will be held on Friday afternoon.\nAnother saved sentence.',
    foundation: 'WHOLE_EMAIL_REQUIREMENTS',
    weaknesses: ['STALE_ERROR'],
    sources: [],
    feedbackVersion: 2,
    dimensionContract: 'writing-dimensions-v1'
  };
  expect(coachInferenceContext(request)).not.toHaveProperty('foundation');
  expect(coachInferenceContext(request).weaknesses).toEqual([]);
  expect(JSON.parse(coachInferenceContext(request).task)).toMatchObject({
    kind: 'translate_en',
    source: '活动将在周五下午举行'
  });
  expect(request.task).toBe('将“活动将在周五下午举行”译成英文');
  const model = prepareCoachFeedbackModel(config, request);
  const response = {
    quoteVersion: model.writingOutput.schema.properties.quoteVersion.enum[0],
    message: 'AI评估',
    lines: [{ quoteId: 'q1', advice: '可选润色不影响本题达标', rewriteMode: 'keep', rewrite: null }],
    weaknesses: [],
    strengths: [],
    strengthEvidence: [],
    phrases: [],
    weaknessEvidence: [{ label: '可选句式变化', quoteId: 'q1', classification: 'suggestion' }],
    dimensions: [{ name: '表达', score: 1, comment: '可改换句式', evidenceIds: ['q1'] }]
  };
  expect(() => decodeCoachResponse(model, JSON.stringify(response))).toThrowError(
    expect.objectContaining({ code: 'COACH_INVALID', path: 'dimensions[0].score' })
  );
  response.dimensions[0].score = 2;
  expect(JSON.parse(decodeCoachResponse(model, JSON.stringify(response))).coach.dimensions[0].score).toBe(2);
  response.dimensions[0].score = 1;
  response.weaknesses = ['实际语法错误'];
  response.weaknessEvidence = [{ label: '实际语法错误', quoteId: 'q1', classification: 'error' }];
  expect(JSON.parse(decodeCoachResponse(model, JSON.stringify(response))).coach.dimensions[0].score).toBe(1);
  response.weaknessEvidence[0].quoteId = 'q2';
  expect(() => decodeCoachResponse(model, JSON.stringify(response))).toThrow();
  const analysis = prepareCoachFeedbackModel(config, { ...request, target: 'analysis', input: 'genre: 邮件' });
  const analysisReply = {
    ...response,
    quoteVersion: analysis.writingOutput.schema.properties.quoteVersion.enum[0],
    weaknesses: [],
    weaknessEvidence: [],
    dimensions: []
  };
  expect(() => decodeCoachResponse(analysis, JSON.stringify(analysisReply))).not.toThrow();
  analysisReply.dimensions = [{ name: '语法', score: 2, comment: '不应根据中文提纲判英文语法', evidenceIds: ['q1'] }];
  expect(() => decodeCoachResponse(analysis, JSON.stringify(analysisReply))).toThrow();
});

it('未通过能力往返的连接不会获得教学数据函数', () => {
  const config = {
    source: 'byok',
    model: 'synthetic',
    endpoint: 'https://provider.example/chat',
    maxOutput: 2000,
    capabilities: { tools: false, structured: false },
    capabilityCheck: { version: 1, tools: false, structured: false }
  };
  const request = { phase: 'essay', exam: 'english2', dimensionContract: 'writing-dimensions-v1' };
  expect(prepareCoachFeedbackModel(config, request)).toBe(config);
});

it('灵感建议只占独立小额度，用尽也不影响练题与写作', () => {
  const account = newAccount('ideas-policy');
  const limit = 100;
  expect(LEARNING_BUDGET_PHASES).toContain('ideas');
  expect(learningBudgetPhase({ ideas: {}, coach: { phase: 'feedback' } })).toBe('ideas');
  expect(phaseCallLimit(limit, 'ideas')).toBe(5);
  for (let index = 0; index < phaseCallLimit(limit, 'ideas'); index++)
    account.calls.push({ id: `i${index}`, source: 'byok', budgetPhase: 'ideas' });
  const input = {
    id: 'more',
    fingerprint: 'same',
    source: 'byok',
    budgetPhase: 'ideas',
    callLimit: limit,
    maxCost: 0,
    units: 0
  };
  expect(() => reserveCall(account, input)).toThrow('本阶段');
  expect(reserveCall(account, { ...input, id: 'practice', budgetPhase: 'practice' }).call.budgetPhase).toBe('practice');
});
