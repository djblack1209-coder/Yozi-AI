import crypto from 'node:crypto';
import { intakeChoicesFor, SINGLE_QUESTION_CONTRACT } from '../../laf-backend/functions/_shared/learning-intake.js';
import {
  mixedDiagnosticRequest,
  mixedDiagnosticReply,
  mixedDiagnosticVerification
} from '../fixtures/writing-mixed.js';
import { EventEmitter } from 'node:events';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  rows: new Map(),
  users: new Map(),
  allowed: true,
  probeMode: 'ok',
  queries: [] as any[],
  response: undefined as any,
  failStateDelete: false
}));
vi.mock('@lafjs/cloud', () => ({
  default: {
    get res() {
      return mock.response;
    },
    database: () => ({
      collection: (name: string) => ({
        add: async (row: any) => {
          const id = `${name}:${row._id}`;
          if (mock.rows.has(id)) throw { code: 11000 };
          mock.rows.set(id, structuredClone(row));
        },
        where: (query: any) => {
          mock.queries.push({ name, query });
          const matches = () =>
            [...new Map([...(name === 'users' ? mock.users.entries() : []), ...mock.rows.entries()]).entries()].filter(
              ([id, row]: any) =>
                id.startsWith(`${name}:`) && Object.entries(query).every(([k, value]) => row[k] === value)
            );
          return {
            get: async () => ({ data: matches().map(([, row]) => structuredClone(row)) }),
            update: async (next: any) => {
              const rows = matches();
              rows.forEach(([id, row]: any) => mock.rows.set(id, { ...row, ...structuredClone(next) }));
              return { updated: rows.length };
            },
            remove: async () => {
              if (name === 'learning_states' && mock.failStateDelete) throw new Error('isolated deletion failure');
              const rows = matches();
              rows.forEach(([id]) => mock.rows.delete(id));
              return { deleted: rows.length };
            }
          };
        }
      })
    })
  }
}));
vi.mock('../../laf-backend/functions/_shared/api-response', () => ({
  unauthorized: (message: string) => ({ code: 401, success: false, message }),
  checkRateLimitDistributed: vi.fn(async () => ({ allowed: mock.allowed }))
}));
vi.mock('../../laf-backend/functions/_shared/ai-providers/learning-provider', async (original) => ({
  ...(await original<any>()),
  callStreamingLearningProvider: vi.fn(),
  callCapabilityProvider: vi.fn(async (config: any) => {
    const probe = config.capabilityProbe;
    return {
      content: JSON.stringify(
        probe.stage === 'tool'
          ? { nonce: probe.nonce }
          : { nonce: mock.probeMode === 'wrong_nonce' ? 'wrong' : probe.nonce, accepted: true }
      ),
      ...(probe.stage === 'tool' && mock.probeMode !== 'missing_tool'
        ? {
            capabilityToolCall: {
              id: 'synthetic_capability_call',
              type: 'function',
              function: { name: 'yozi_capability_echo', arguments: JSON.stringify({ nonce: probe.nonce }) }
            }
          }
        : {}),
      actualModel: config.model,
      usage: { prompt_tokens: 1, completion_tokens: 1 },
      durationMs: 1
    };
  }),
  callLearningProvider: vi.fn(async () => ({
    content: '{"message":"隔离测试回复","tools":[]}',
    actualModel: 'explicit-test-id',
    usage: { prompt_tokens: 15, completion_tokens: 12 },
    durationMs: 1
  }))
}));
import modelsHandler from '../../laf-backend/functions/learning-models';
// Existing endpoint cases start with a preverified synthetic connection. Keep setup
// probe receipts out of the per-case inference ledger; dedicated probe cases below
// call modelsHandler directly and assert every real handler receipt.
async function models(ctx: any) {
  const result = await modelsHandler(ctx);
  if (ctx.body?.action === 'save' && result.success) {
    for (const [key, account] of mock.rows)
      if (key.startsWith('learning_accounts:'))
        account.calls = account.calls.filter((call: any) => !call.id.startsWith('save_'));
  }
  return result;
}
import { newAccount, reserveCall, decryptModelKey } from '../../laf-backend/functions/_shared/learning-account';
import { MODEL_API_KEY_MAX_LENGTH } from '../../laf-backend/functions/_shared/ai-providers/model-endpoints.js';
import ai, {
  costFromUsage,
  runLearningModelTask,
  LEARNING_SYSTEM_PROMPT,
  CONTENT_BLOCKS_PROMPT,
  PRESENTATION_SYSTEM_PROMPT,
  PRESENTATION_BLOCKS_PROMPT
} from '../../laf-backend/functions/proxy-ai';
import { PRESENTATION_CONTRACT } from '../../laf-backend/functions/_shared/learning-content-blocks.js';
import stream from '../../laf-backend/functions/proxy-ai-stream';
import sync from '../../laf-backend/functions/learning-sync';
import subscription from '../../laf-backend/functions/learning-subscriptions';
import { parsePastedMaterial } from '../../src/services/learning/material-intake.js';
import { PAGE_PNG, PAGE_SOURCE, PAGE_READING } from '../fixtures/learning-vision.js';
import {
  callLearningProvider,
  callCapabilityProvider,
  callStreamingLearningProvider,
  buildLearningRequest,
  ProviderError
} from '../../laf-backend/functions/_shared/ai-providers/learning-provider';
const context = (body: any = {}, userId = 'u1') => {
  const header = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url');
  const payload = Buffer.from(JSON.stringify({ userId, exp: Math.floor(Date.now() / 1000) + 60 })).toString(
    'base64url'
  );
  const signature = crypto
    .createHmac('sha256', 'test-only-jwt-secret')
    .update(`${header}.${payload}`)
    .digest('base64url');
  return { headers: { authorization: `Bearer ${header}.${payload}.${signature}` }, body };
};
beforeEach(() => {
  mock.response = undefined;
  mock.rows.clear();
  mock.users.clear();
  for (const id of ['u1', 'u2', 'u3']) mock.users.set(`users:${id}`, { _id: id, status: 'active' });
  mock.queries.length = 0;
  mock.allowed = true;
  mock.probeMode = 'ok';
  mock.failStateDelete = false;
  vi.clearAllMocks();
  vi.mocked(callLearningProvider)
    .mockReset()
    .mockResolvedValue({
      content: '{"message":"隔离测试回复","tools":[]}',
      actualModel: 'explicit-test-id',
      usage: { prompt_tokens: 15, completion_tokens: 12 },
      durationMs: 1
    });
  vi.stubEnv('JWT_SECRET', 'test-only-jwt-secret');
  vi.stubEnv('LEARNING_VAULT_KEY', 'a'.repeat(64));
  vi.stubEnv('LEARNING_ALLOWED_ORIGINS', 'https://provider.example');
  vi.stubEnv('LEARNING_PLATFORM_MODELS', '[]');
  vi.stubEnv('LEARNING_PLATFORM_CALLS_ENABLED', 'false');
  vi.stubEnv('LEARNING_PAYMENT_SANDBOX_ENABLED', 'false');
});
it.each([
  ['sync', sync],
  ['models', models],
  ['ai', ai]
] as const)('账号删除后有效签名也不能通过 %s 重建空档案或调用模型', async (_name, handler) => {
  mock.users.delete('users:u1');
  const before = [...mock.rows.keys()];
  const result = await handler(context({ action: 'pull' }));
  expect(result).toMatchObject({ code: 401, success: false, errorCode: 'ACCOUNT_UNAVAILABLE' });
  expect([...mock.rows.keys()]).toEqual(before);
  expect(callLearningProvider).not.toHaveBeenCalled();
});
it('登录身份与学习上下文不一致时，拒绝向模型发送旧用户内容或预留费用', async () => {
  const result = await ai(
    context({
      requestId: 'changed-owner',
      modelId: 'explicit-test-id',
      shareConsent: true,
      messages: [{ role: 'user', content: 'private context' }],
      learningContext: { owner: 'u2' }
    })
  );
  expect(result.code).toBe(403);
  expect(callLearningProvider).not.toHaveBeenCalled();
  expect(mock.rows.size).toBe(0);
});
afterEach(() => vi.unstubAllEnvs());

it('S22 freezes unmarked prompts and advertises the opt-in presentation contract', async () => {
  const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
  expect(digest(LEARNING_SYSTEM_PROMPT)).toBe('028dfc1d9ee0a85fcf2817af5668fab1b4e1e49ea20b52638f84ef8128c61f6a');
  expect(digest(CONTENT_BLOCKS_PROMPT)).toBe('0f6067cfd69c567a3a8502e251e408083719624ef29cfc80fdf47f497d10720c');
  expect(PRESENTATION_SYSTEM_PROMPT).toContain('"version":3');
  expect(PRESENTATION_SYSTEM_PROMPT).not.toContain('最多6卡');
  expect(PRESENTATION_BLOCKS_PROMPT).toContain('checklist');
  expect(PRESENTATION_BLOCKS_PROMPT).not.toContain('最多6卡');
  const catalog = await models(context({ action: 'list' }));
  expect(catalog.data.presentationContracts).toEqual([PRESENTATION_CONTRACT]);
  expect(callLearningProvider).not.toHaveBeenCalled();
});

it('S23 advertises an explicit question entry and rejects mismatched entry contracts before calling the provider', async () => {
  const catalog = await models(context({ action: 'list' }));
  expect(catalog.data.questionEntryContracts).toEqual([SINGLE_QUESTION_CONTRACT]);
  for (const patch of [
    { questionEntryContract: 'unknown', generalQAOnly: true },
    { questionEntryContract: SINGLE_QUESTION_CONTRACT, generalQAOnly: false }
  ])
    expect(
      (
        await ai(
          context({
            ...streamBody('entry-unsupported'),
            presentationContract: PRESENTATION_CONTRACT,
            learningContext: { owner: 'u1', ...patch }
          })
        )
      ).code
    ).toBe(400);
  expect(
    (
      await ai(
        context({
          ...streamBody('entry-no-presentation'),
          learningContext: { owner: 'u1', questionEntryContract: SINGLE_QUESTION_CONTRACT, generalQAOnly: true }
        })
      )
    ).code
  ).toBe(400);
  expect(callLearningProvider).not.toHaveBeenCalled();
});

it('S23 answers an explicit single question through the versioned whitelist once and recovers without calling again', async () => {
  await streamProfile(false);
  const contentBlocks = {
    version: 3,
    items: [{ kind: 'knowledge', title: '事实与推测', body: '说明事实依据，并将推测标为推测。' }]
  };
  vi.mocked(callLearningProvider).mockResolvedValueOnce({
    ...streamCompleted,
    content: JSON.stringify({ message: '先看依据。', question: null, tools: [], contentBlocks })
  });
  const body = {
    ...streamBody('single-question-answer'),
    presentationContract: PRESENTATION_CONTRACT,
    learningContext: { owner: 'u1', generalQAOnly: true, questionEntryContract: SINGLE_QUESTION_CONTRACT }
  };
  expect(await ai(context(body))).toMatchObject({ success: true, data: { contentBlocks, tools: [] } });
  expect(await models(context({ action: 'result', requestId: body.requestId }))).toMatchObject({
    success: true,
    data: { contentBlocks }
  });
  expect(callLearningProvider).toHaveBeenCalledTimes(1);
  const system = String(vi.mocked(callLearningProvider).mock.calls[0][1][0].content);
  expect(system).toContain('单题答疑不需要考试档案');
  expect(system).not.toContain('空白时先澄清');
});

it.each(['tool', 'malformed', 'unfinished'])(
  'S23 retains a billed %s failure without learning output or a recovery inference',
  async (kind) => {
    await streamProfile(false);
    const reply = {
      message: '说明',
      question: null,
      tools:
        kind === 'tool'
          ? [{ name: 'plan', arguments: { reason: '不应执行', tasks: [{ title: '不应建计划', condition: 'manual' }] } }]
          : [],
      contentBlocks: { version: 3, items: [{ kind: 'knowledge', title: '知识', body: '待核对。' }] }
    };
    const content = JSON.stringify(reply);
    vi.mocked(callLearningProvider).mockResolvedValueOnce({
      ...streamCompleted,
      content: kind === 'malformed' ? content.slice(0, -1) : content,
      finishReason: kind === 'unfinished' ? 'length' : 'stop'
    });
    const requestId = 'single-question-failure';
    expect(
      await ai(
        context({
          ...streamBody(requestId),
          presentationContract: PRESENTATION_CONTRACT,
          learningContext: { owner: 'u1', generalQAOnly: true, questionEntryContract: SINGLE_QUESTION_CONTRACT }
        })
      )
    ).toMatchObject({ success: false, error: 'INVALID_STRUCTURE' });
    expect(await models(context({ action: 'result', requestId }))).toMatchObject({
      success: false,
      status: 'failed',
      error: 'INVALID_STRUCTURE',
      validationPath: { tool: 'tools', malformed: 'raw', unfinished: 'finish_reason' }[kind]
    });
    const row = [...mock.rows.values()].find((row: any) => row.user_id === 'u1' && Array.isArray(row.calls));
    expect(row.calls.find((call: any) => call.id === requestId)).toMatchObject({
      status: 'failed',
      result: null,
      usage: { prompt_tokens: 4, completion_tokens: 8 },
      costStatus: 'pending'
    });
    expect(callLearningProvider).toHaveBeenCalledTimes(1);
  }
);

it('S22 accepts versioned descriptors once and refuses to change the contract under the same request id', async () => {
  await streamProfile(false);
  const contentBlocks = {
    version: 3,
    items: [{ kind: 'checklist', title: '自查', items: [{ id: 'one', label: '核对目的' }] }]
  };
  vi.mocked(callLearningProvider).mockResolvedValueOnce({
    ...streamCompleted,
    content: JSON.stringify({ message: '核对本次表达。', tools: [], contentBlocks })
  });
  const body = { ...streamBody('presentation-versioned'), presentationContract: PRESENTATION_CONTRACT };
  const first = await ai(context(body));
  expect(first.success).toBe(true);
  expect(first.data.contentBlocks).toEqual(contentBlocks);
  expect((await ai(context(body))).data.contentBlocks).toEqual(contentBlocks);
  expect((await ai(context({ ...body, presentationContract: undefined }))).success).toBe(false);
  expect(callLearningProvider).toHaveBeenCalledTimes(1);
  expect(vi.mocked(callLearningProvider).mock.calls[0][1][0].content).toContain(PRESENTATION_CONTRACT);
});

it.each([undefined, 2])(
  'S22 refuses a missing or old presentation envelope under the new contract (%s)',
  async (version) => {
    await streamProfile(false);
    const reply = {
      message: '示例',
      tools: [],
      ...(version ? { contentBlocks: { version, items: [{ kind: 'knowledge', title: '知识', body: '说明' }] } } : {})
    };
    vi.mocked(callLearningProvider).mockResolvedValueOnce({ ...streamCompleted, content: JSON.stringify(reply) });
    const result = await ai(
      context({ ...streamBody('presentation-mismatch'), presentationContract: PRESENTATION_CONTRACT })
    );
    expect(result.success).toBe(false);
    expect(callLearningProvider).toHaveBeenCalledTimes(1);
    const account = [...mock.rows.values()].find((row: any) => row.user_id === 'u1' && Array.isArray(row.calls));
    expect(account.calls.find((call: any) => call.id === 'presentation-mismatch').status).toBe('failed');
  }
);

it('S22 rejects unrequested version3 output, unknown contracts and mixed grading or coaching requests', async () => {
  expect((await ai(context({ ...streamBody('unknown-presentation'), presentationContract: 'unknown' }))).code).toBe(
    400
  );
  expect(
    (
      await ai(
        context({
          ...streamBody('mixed-presentation'),
          presentationContract: PRESENTATION_CONTRACT,
          feedbackAttemptId: 'not-an-attempt'
        })
      )
    ).code
  ).toBe(422);
  expect(
    (
      await ai(
        context({
          ...streamBody('coach-presentation'),
          presentationContract: PRESENTATION_CONTRACT,
          learningContext: { owner: 'u1', coach: mixedDiagnosticRequest() }
        })
      )
    ).code
  ).toBe(422);
  expect(callLearningProvider).not.toHaveBeenCalled();
  await streamProfile(false);
  vi.mocked(callLearningProvider).mockResolvedValueOnce({
    ...streamCompleted,
    content: JSON.stringify({
      message: '说明',
      tools: [],
      contentBlocks: { version: 3, items: [{ kind: 'knowledge', title: '知识', body: '内容' }] }
    })
  });
  expect((await ai(context(streamBody('unrequested-version')))).success).toBe(false);
  expect(callLearningProvider).toHaveBeenCalledTimes(1);
});

it('平台免费试用仍按服务端每日上限拦截，跨用户共享全局额度，幂等读取不重复调用', async () => {
  const receiptClock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-25T12:00:00Z'));
  try {
    vi.stubEnv('LEARNING_PLATFORM_CALLS_ENABLED', 'true');
    vi.stubEnv('LEARNING_FRIEND_TRIAL_ENABLED', 'true');
    vi.stubEnv('LEARNING_TRIAL_USER_LIMIT', '3');
    vi.stubEnv('LEARNING_TRIAL_EMAILS', 'u1@example.com,u2@example.com,u3@example.com');
    for (const id of ['u1', 'u2', 'u3']) mock.rows.set(`users:${id}`, { _id: id, email: `${id}@example.com` });
    vi.stubEnv('LEARNING_USER_DAILY_CALL_LIMIT', '2');
    vi.stubEnv('LEARNING_GLOBAL_DAILY_CALL_LIMIT', '3');
    vi.stubEnv('LEARNING_GLOBAL_DAILY_BUDGET', '0');
    vi.stubEnv('LEARNING_ALLOWED_ORIGINS', 'https://open.bigmodel.cn');
    vi.stubEnv('SYNTHETIC_PLATFORM_KEY', 'test-only-key');
    vi.stubEnv(
      'LEARNING_PLATFORM_MODELS',
      JSON.stringify([
        {
          id: 'trial-glm',
          provider: 'zhipu',
          model: 'glm-4.7-flash',
          endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
          keyEnv: 'SYNTHETIC_PLATFORM_KEY',
          maxOutput: 1000,
          capabilities: { structured: true }
        }
      ])
    );
    for (let i = 0; i < 3; i++)
      vi.mocked(callLearningProvider).mockResolvedValueOnce({
        content: '{"message":"合成回复","tools":[]}',
        actualModel: 'glm-4.7-flash',
        usage: { prompt_tokens: 15, completion_tokens: 12 },
        durationMs: 1
      });
    const body = (requestId: string) => ({
      requestId,
      modelId: 'trial-glm',
      shareConsent: true,
      messages: [{ role: 'user', content: '合成数据' }]
    });
    const first = await ai(context(body('day-1')));
    expect(first.success).toBe(true);
    expect((await ai(context(body('day-1')))).success).toBe(true);
    expect((await ai(context(body('day-2')))).success).toBe(true);
    expect((await ai(context(body('day-user-excess')))).error).toBe('USER_DAILY_LIMIT');
    expect((await ai(context(body('day-other'), 'u2'))).success).toBe(true);
    expect((await ai(context(body('day-global-excess'), 'u3'))).error).toBe('GLOBAL_DAILY_LIMIT');
    expect(callLearningProvider).toHaveBeenCalledTimes(3);
  } finally {
    receiptClock.mockRestore();
  }
});

it('保存已知基础地址时补齐真实请求路径，继续检查白名单且不发起模型请求', async () => {
  const profile = {
    id: 'normalized',
    model: 'glm-4.7-flash',
    provider: '智谱',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/',
    apiKey: 'synthetic-profile-key'
  };
  expect((await models(context({ action: 'save', profile, shareConsent: true }))).success).toBe(false);
  expect(mock.rows.size).toBe(0);
  vi.stubEnv('LEARNING_ALLOWED_ORIGINS', 'https://open.bigmodel.cn');
  expect((await models(context({ action: 'save', profile, shareConsent: true }))).success).toBe(true);
  const account = [...mock.rows.values()].find((row: any) => Array.isArray(row.profiles));
  expect(account.profiles[0]).toMatchObject({
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    pricing: 'official_free_model'
  });
  expect(account.profiles[0]).not.toHaveProperty('apiKey');
  expect(callLearningProvider).not.toHaveBeenCalled();
});

it('现有长凭据按原文加密保存，超过共享有界上限仍拒绝且不改变旧连接', async () => {
  const profile = {
    id: 'long-opaque',
    provider: 'synthetic',
    model: 'explicit-test-id',
    endpoint: 'https://provider.example/v1/chat/completions'
  };
  for (const length of [1207, MODEL_API_KEY_MAX_LENGTH]) {
    const key = 'synthetic-only-'.padEnd(length, 'x');
    expect(
      (await models(context({ action: 'save', profile: { ...profile, apiKey: key }, shareConsent: true }))).success
    ).toBe(true);
    const saved = [...mock.rows.entries()].find(([id]) => id.startsWith('learning_model_keys:'))?.[1];
    expect(decryptModelKey(saved.vault, 'u1', profile.id, 'a'.repeat(64))).toBe(key);
  }
  const before = JSON.stringify([...mock.rows]);
  expect(
    (
      await models(
        context({
          action: 'save',
          profile: { ...profile, apiKey: 'x'.repeat(MODEL_API_KEY_MAX_LENGTH + 1) },
          shareConsent: true
        })
      )
    ).code
  ).toBe(400);
  expect(JSON.stringify([...mock.rows])).toBe(before);
  expect(callLearningProvider).not.toHaveBeenCalled();
});

it('国内无密钥添加只保存本账号元数据，不能覆盖已有连接或绕过外国端点规则', async () => {
  vi.stubEnv('LEARNING_ALLOWED_ORIGINS', '');
  vi.stubEnv('LEARNING_VAULT_KEY', '');
  const profile = {
    id: 'domestic-draft',
    provider: '智谱',
    model: 'glm-4.7-flash',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4'
  };
  const result = await models(context({ action: 'save', profile, shareConsent: true }));
  expect(result).toMatchObject({ success: true, data: { id: profile.id, keySaved: false } });
  expect([...mock.rows.keys()].some((id) => id.startsWith('learning_model_keys:'))).toBe(false);
  const listed = await models(context({ action: 'list' }));
  expect(listed.data.models[0]).toMatchObject({ id: profile.id, configured: false, connectionStatus: 'untested' });
  expect((await models(context({ action: 'list' }, 'u2'))).data.models).toEqual([]);
  const before = JSON.stringify([...mock.rows]);
  expect(
    (await models(context({ action: 'save', profile: { ...profile, model: 'replacement' }, shareConsent: true })))
      .success
  ).toBe(false);
  expect(JSON.stringify([...mock.rows])).toBe(before);
  expect(
    (
      await models(
        context({
          action: 'save',
          profile: { ...profile, id: 'foreign', provider: 'Z.ai', endpoint: 'https://api.z.ai/api/paas/v4' },
          shareConsent: true
        })
      )
    ).success
  ).toBe(false);
  vi.stubEnv('LEARNING_VAULT_KEY', 'a'.repeat(64));
  expect(
    (await models(context({ action: 'save', profile: { ...profile, apiKey: 'synthetic-only' }, shareConsent: true })))
      .success
  ).toBe(false);
  vi.stubEnv('LEARNING_ALLOWED_ORIGINS', 'https://open.bigmodel.cn');
  expect(
    (await models(context({ action: 'save', profile: { ...profile, apiKey: 'synthetic-only' }, shareConsent: true })))
      .success
  ).toBe(true);
  const configured = JSON.stringify([...mock.rows]);
  expect((await models(context({ action: 'save', profile, shareConsent: true }))).success).toBe(true);
  expect([...mock.rows.values()].filter((row: any) => row.vault)).toHaveLength(1);
  expect(JSON.stringify([...mock.rows.values()].filter((row: any) => row.vault))).toBe(
    JSON.stringify(
      JSON.parse(configured)
        .map((row: any) => row[1])
        .filter((row: any) => row.vault)
    )
  );
  expect(callLearningProvider).not.toHaveBeenCalled();
  expect(callStreamingLearningProvider).not.toHaveBeenCalled();
});

it.each([
  ['learning-visual-v2', { template: 'constant_net_force', massKg: 2, netForceN: 4, direction: 'right' }],
  [
    'learning-visual-v3',
    {
      template: 'accelerated_motion',
      massKg: 2,
      initialVelocityMps: 1,
      netForceN: 4,
      direction: 'right',
      physicalSeconds: 2
    }
  ],
  [
    'learning-visual-v4',
    {
      template: 'velocity_time_graph',
      points: [
        { time: 0, velocity: 2 },
        { time: 2, velocity: -2 }
      ]
    }
  ],
  [
    'learning-visual-v5',
    {
      template: 'work_kinetic_energy',
      massKg: 2,
      initialVelocityMps: 1,
      netForceN: 4,
      direction: 'right',
      physicalSeconds: 2
    }
  ]
])('受保护接口向%s发送相符能力，接纳只读演示但不写学习事实，并幂等复用', async (visualization, argumentsValue) => {
  await models(
    context({
      action: 'save',
      shareConsent: true,
      profile: {
        id: 'diagram-model',
        model: 'explicit-test-id',
        apiKey: 'test-only-diagram-key',
        endpoint: 'https://provider.example/chat'
      }
    })
  );
  vi.mocked(callLearningProvider).mockResolvedValueOnce({
    content: JSON.stringify({
      message: '先预测，再观察。',
      tools: [{ id: 'diagram-candidate', name: 'visualize', arguments: argumentsValue }]
    }),
    actualModel: 'explicit-test-id',
    usage: { prompt_tokens: 15, completion_tokens: 12 },
    durationMs: 1
  });
  const body = {
    requestId: 'declared-diagram',
    modelId: 'diagram-model',
    shareConsent: true,
    messages: [{ role: 'user', content: '合成物理任务' }],
    learningContext: { owner: 'u1', capabilities: { visualization }, strategy: { method: 'diagram' } }
  };
  const result = await ai(context(body));
  expect(result.success).toBe(true);
  expect(result.data.tools[0]).toMatchObject({ name: 'visualize', arguments: argumentsValue });
  const messages: any = vi.mocked(callLearningProvider).mock.calls[0][1];
  expect(messages[0].content).not.toContain('当前客户端未声明动态演示能力，不得请求 visualize');
  expect(messages[0].content).not.toContain('test-only-diagram-key');
  const replay = await ai(context(body));
  const { resultCache: _firstCacheMetadata, ...firstOutput } = result.data;
  expect(replay.reused).toBe(true);
  expect(replay.data).toEqual(firstOutput);
  expect(callLearningProvider).toHaveBeenCalledTimes(1);
  expect([...mock.rows.keys()].some((key) => key.startsWith('learning_states:'))).toBe(false);
});
it('旧v4或未知客户端不能采用新能量演示，未知版本给模型明确禁止且不产生学习事实', async () => {
  await models(
    context({
      action: 'save',
      shareConsent: true,
      profile: {
        id: 'diagram-model',
        model: 'explicit-test-id',
        apiKey: 'test-only-diagram-key',
        endpoint: 'https://provider.example/chat'
      }
    })
  );
  for (const visualization of ['learning-visual-v4', 'unknown-version']) {
    vi.mocked(callLearningProvider).mockResolvedValueOnce({
      content: JSON.stringify({
        message: '不可信新演示',
        tools: [
          {
            id: 'energy-candidate',
            name: 'visualize',
            arguments: {
              template: 'work_kinetic_energy',
              massKg: 2,
              initialVelocityMps: 1,
              netForceN: 4,
              direction: 'right',
              physicalSeconds: 2
            }
          }
        ]
      }),
      actualModel: 'explicit-test-id',
      usage: { prompt_tokens: 15, completion_tokens: 12 },
      durationMs: 1
    });
    const result = await ai(
      context({
        requestId: 'incompatible-' + visualization,
        modelId: 'diagram-model',
        shareConsent: true,
        messages: [{ role: 'user', content: '合成物理任务' }],
        learningContext: { owner: 'u1', capabilities: { visualization } }
      })
    );
    expect(result.success).toBe(false);
  }
  const messages: any = vi.mocked(callLearningProvider).mock.calls.at(-1)?.[1];
  expect(messages[0].content).toContain('当前客户端未声明动态演示能力，不得请求 visualize');
  expect([...mock.rows.keys()].some((key) => key.startsWith('learning_states:'))).toBe(false);
});
const visualBody = (id = 'visual-request') => ({
  requestId: id,
  modelId: 'byo-vision',
  shareConsent: true,
  imageShareConsent: true,
  messages: [{ role: 'user', content: '请辅助解读原页图，不判分' }],
  images: [{ dataUrl: PAGE_PNG, source: PAGE_SOURCE }],
  learningContext: {
    owner: 'u1',
    question: { questionKey: 'private-image@1', source: { ...PAGE_SOURCE, kind: 'private_material' } }
  }
});
async function saveVisualModel(vision = true) {
  return models(
    context({
      action: 'save',
      shareConsent: true,
      profile: {
        id: 'byo-vision',
        model: 'explicit-test-id',
        endpoint: 'https://provider.example/chat',
        apiKey: 'test-only-vision-key',
        vision
      }
    })
  );
}
it('视觉型号显式声明，一张页图绑定当前用户题目；重试/恢复只复用账单且成本待核验', async () => {
  expect((await saveVisualModel()).success).toBe(true);
  vi.mocked(callLearningProvider).mockResolvedValueOnce({
    content: JSON.stringify({ visualReading: PAGE_READING, tools: [], question: null }),
    actualModel: 'explicit-test-id',
    usage: { prompt_tokens: 340, completion_tokens: 150 },
    durationMs: 1
  });
  const result = await ai(context(visualBody()));
  expect(result.success).toBe(true);
  expect(result.data.visualReading).toMatchObject({ status: 'ai_assisted', source: PAGE_SOURCE });
  expect(result.data.usageStatus).toBe('pending');
  const sent = vi.mocked(callLearningProvider).mock.calls[0][1];
  expect(sent.at(-1)?.content).toEqual([
    { type: 'text', text: '请辅助解读原页图，不判分' },
    { type: 'image_url', image_url: { url: PAGE_PNG } }
  ]);
  expect((await ai(context(visualBody()))).reused).toBe(true);
  expect(callLearningProvider).toHaveBeenCalledTimes(1);
  const recovered = await models(context({ action: 'result', requestId: 'visual-request' }));
  expect(recovered.data.visualReading).toEqual(result.data.visualReading);
  const usage = (await models(context({ action: 'usage' }))).data;
  expect(usage.calls).toHaveLength(1);
  expect(usage.calls[0]).toMatchObject({ inputMode: 'image', priceVersion: 'vision-pricing-unverified' });
  expect(usage.calls[0]).toMatchObject({ actualCost: null, costStatus: 'pending' });
  expect(usage.entitlement.spent).toBe(0);
  expect(JSON.stringify(usage)).not.toContain('base64');
  expect([...mock.rows.keys()].some((key) => key.startsWith('learning_states:'))).toBe(false);
});
it('无图片授权、远程图片、版本错配与文本型号均在调用/预留前拒绝', async () => {
  await saveVisualModel();
  const variants = [
    { ...visualBody('no-image-consent'), imageShareConsent: false },
    {
      ...visualBody('remote-image'),
      images: [{ dataUrl: 'http://169.254.169.254/latest/meta-data', source: PAGE_SOURCE }]
    },
    {
      ...visualBody('version-mismatch'),
      images: [{ dataUrl: PAGE_PNG, source: { ...PAGE_SOURCE, extractionEventId: 'different' } }]
    }
  ];
  for (const body of variants) expect((await ai(context(body))).success).toBe(false);
  await saveVisualModel(false);
  expect((await ai(context(visualBody('text-model')))).error).toBe('VISION_UNSUPPORTED');
  expect(callLearningProvider).not.toHaveBeenCalled();
  expect((await models(context({ action: 'usage' }))).data.calls).toHaveLength(0);
});
it('图片工具注入与非法识别输出失败，已发生用量保留待结算，不会免费估零', async () => {
  await saveVisualModel();
  vi.mocked(callLearningProvider).mockResolvedValueOnce({
    content: JSON.stringify({
      visualReading: PAGE_READING,
      tools: [{ name: 'assess', arguments: { outcome: 'wrong' } }]
    }),
    actualModel: 'explicit-test-id',
    usage: { prompt_tokens: 340, completion_tokens: 100 },
    durationMs: 1
  });
  expect((await ai(context(visualBody('injected-image')))).error).toBe('VISUAL_OUTPUT_INVALID');
  const usage = (await models(context({ action: 'usage' }))).data;
  expect(usage.calls[0]).toMatchObject({
    status: 'failed',
    actualCost: null,
    costStatus: 'pending',
    usage: { prompt_tokens: 340 }
  });
  expect(usage.entitlement.spent).toBe(0);
  expect((await ai(context(visualBody('injected-image')))).success).toBe(false);
  expect(callLearningProvider).toHaveBeenCalledTimes(1);
});
it('图片不静默转流式或平台消费，不能把未核验图像成本按文本预留', async () => {
  await saveVisualModel();
  expect((await stream(context(visualBody('image-stream')))).success).toBe(false);
  vi.stubEnv('LEARNING_PLATFORM_CALLS_ENABLED', 'true');
  vi.stubEnv('TEST_VISUAL_KEY', 'fixture-only-platform-key');
  vi.stubEnv(
    'LEARNING_PLATFORM_MODELS',
    JSON.stringify([
      {
        id: 'platform-vision',
        model: 'explicit-test-id',
        provider: 'fixture',
        endpoint: 'https://provider.example/chat',
        keyEnv: 'TEST_VISUAL_KEY',
        maxOutput: 1000,
        capabilities: { vision: true, stream: true },
        visionAdapter: 'openai-image-url-v1'
      }
    ])
  );
  expect((await ai(context({ ...visualBody('platform-image'), modelId: 'platform-vision' }))).error).toBe(
    'VISION_PATH_UNSUPPORTED'
  );
  expect(callLearningProvider).not.toHaveBeenCalled();
  expect((await models(context({ action: 'usage' }))).data.calls).toHaveLength(0);
});
it('完整评分上下文超限时先拒绝，不调用模型或预留；不静默截断评分条件', async () => {
  const result = await ai(
    context({
      requestId: 'rubric-over-limit',
      modelId: 'missing-model',
      shareConsent: true,
      messages: [{ role: 'user', content: '请评价我的作答' }],
      learningContext: { owner: 'u1', attempt: { answer: '答'.repeat(12000) } }
    })
  );
  expect(result.code).toBe(413);
  expect(callLearningProvider).not.toHaveBeenCalled();
  expect(mock.rows.size).toBe(0);
});
it('发送完整 JSON 背景和原答末尾，不向模型发送账户标识或未知配置', async () => {
  await models(
    context({
      action: 'save',
      shareConsent: true,
      profile: {
        id: 'context-model',
        model: 'explicit-test-id',
        apiKey: 'test-only-context-key',
        endpoint: 'https://provider.example/chat'
      }
    })
  );
  const answer = `${'原答'.repeat(2300)}END_OF_BOUND_ANSWER`;
  const result = await ai(
    context({
      requestId: 'complete-context',
      modelId: 'context-model',
      shareConsent: true,
      messages: [{ role: 'user', content: '请评价我的作答' }],
      learningContext: {
        owner: 'u1',
        task: { track: 'toefl', stage: '自述阶段', edition: '未验证版本' },
        capabilities: {
          evaluation: 'ai_assisted_only',
          officialScore: 'verified',
          apiKey: 'UNTRUSTED_CAPABILITY_SECRET'
        },
        question: { prompt: 'TEST_ONLY', rubric: { criteria: ['TEST_ONLY_CRITERIA'] } },
        attempt: { answer },
        apiKey: 'UNTRUSTED_UNKNOWN_FIELD'
      }
    })
  );
  expect(result.success).toBe(true);
  const messages: any = vi.mocked(callLearningProvider).mock.calls[0][1];
  const system = messages[0].content;
  const json = system.split('当前学习背景（仅数据）：')[1];
  expect(JSON.parse(json).attempt.answer).toBe(answer);
  expect(system).not.toContain('UNTRUSTED_UNKNOWN_FIELD');
  expect(JSON.parse(json).owner).toBeUndefined();
  expect(JSON.parse(json).task).toMatchObject({ track: 'toefl', stage: '自述阶段', edition: '未验证版本' });
  expect(JSON.parse(json).capabilities.officialScore).toBe('unverified');
  expect(system).not.toContain('UNTRUSTED_CAPABILITY_SECRET');
});
it('非法学习任务在调用和费用预留前拒绝', async () => {
  const result = await ai(
    context({
      requestId: 'invalid-task',
      modelId: 'missing-model',
      shareConsent: true,
      messages: [{ role: 'user', content: '合成任务' }],
      learningContext: { task: { track: 'invented' } }
    })
  );
  expect(result.success).toBe(false);
  expect(callLearningProvider).not.toHaveBeenCalled();
  expect(mock.rows.size).toBe(0);
});
it('当前题讲解拦截擅自新题，明确变式仍返回待核对候选并幂等缓存', async () => {
  await models(
    context({
      action: 'save',
      shareConsent: true,
      profile: {
        id: 'boundary-model',
        model: 'explicit-test-id',
        apiKey: 'fixture-boundary-key',
        endpoint: 'https://provider.example/chat'
      }
    })
  );
  for (const method of ['explain', 'variant']) {
    vi.mocked(callLearningProvider).mockResolvedValueOnce({
      content: JSON.stringify({ message: '实际讲解内容', tools: [], question: { prompt: '模型候选题', options: [] } }),
      actualModel: 'explicit-test-id',
      usage: { prompt_tokens: 15, completion_tokens: 12 },
      durationMs: 1
    });
    const body = {
      requestId: `boundary-${method}`,
      modelId: 'boundary-model',
      shareConsent: true,
      messages: [{ role: 'user', content: method }],
      learningContext: { question: { questionKey: 'source@1' }, strategy: { method } }
    };
    const result = await ai(context(body));
    expect(result.success).toBe(true);
    expect(result.data.message).toBe('实际讲解内容');
    if (method === 'explain') expect(result.data.question).toBeNull();
    else expect(result.data.question).toMatchObject({ prompt: '模型候选题', validation: null });
    expect((await ai(context(body))).data.question).toEqual(result.data.question);
  }
  expect(callLearningProvider).toHaveBeenCalledTimes(2);
});
it('连接测试调用真实预算链，幂等复用且不进入学习事实；列表状态来自调用记录', async () => {
  await models(
    context({
      action: 'save',
      shareConsent: true,
      profile: {
        id: 'test-connection',
        model: 'explicit-test-id',
        apiKey: 'test-only-connection-key',
        endpoint: 'https://provider.example/chat'
      }
    })
  );
  vi.mocked(callCapabilityProvider).mockClear();
  const body = { action: 'test', modelId: 'test-connection', requestId: 'connection-retry', shareConsent: true };
  expect((await models(context({ ...body, shareConsent: false }))).code).toBe(400);
  expect((await models(context(body))).success).toBe(true);
  expect((await models(context(body))).reused).toBe(true);
  expect(callLearningProvider).not.toHaveBeenCalled();
  expect(callCapabilityProvider).toHaveBeenCalledTimes(2);
  const list = await models(context({ action: 'list' }));
  expect(list.data.models[0]).toMatchObject({ connectionStatus: 'connected', configured: true });
  expect(JSON.stringify(list)).not.toContain('test-only-connection-key');
  const usage = await models(context({ action: 'usage' }));
  expect(usage.data.calls).toHaveLength(2);
  expect(usage.data.entitlement.spent).toBe(0);
  expect([...mock.rows.keys()].some((id) => id.startsWith('learning_states:'))).toBe(false);
});
describe('真实 JWT 校验下的新接口隔离合同', () => {
  it('上游意外回显密钥时，消息和用量记录都脱敏', async () => {
    const key = 'test-only-echo-key';
    await models(
      context({
        action: 'save',
        shareConsent: true,
        profile: {
          id: 'byo',
          model: 'explicit-test-id',
          endpoint: 'https://provider.example/chat',
          apiKey: key
        }
      })
    );
    vi.mocked(callLearningProvider).mockResolvedValueOnce({
      content: JSON.stringify({ message: `回显 ${key}`, tools: [] }),
      actualModel: 'explicit-test-id',
      usage: { prompt_tokens: 1, completion_tokens: 2, debug: key },
      durationMs: 1
    });
    const result = await ai(
      context({
        modelId: 'byo',
        requestId: 'redaction',
        shareConsent: true,
        messages: [{ role: 'user', content: 'TEST_ONLY' }]
      })
    );
    expect(result.success).toBe(true);
    expect(JSON.stringify(result)).not.toContain(key);
    expect(JSON.stringify([...mock.rows.values()])).not.toContain(key);
  });
  it('未知计费项与负价格保持待结算，不把无效价格当零成本', () => {
    const model: any = { inputPerMillion: 2, outputPerMillion: 4, priceVersion: 'TEST_ONLY_v1' };
    const usage = { prompt_tokens: 100, completion_tokens: 50 };
    expect(costFromUsage(usage, model)).toBe(0.0004);
    expect(costFromUsage(usage, { ...model, inputPerMillion: -1 })).toBeNull();
    expect(costFromUsage({ ...usage, billable_extra: { ocr: 1 } }, model)).toBeNull();
    expect(costFromUsage({ ...usage, search_cost: 1 }, model)).toBeNull();
    expect(costFromUsage({ ...usage, prompt_tokens: 100.5 }, model)).toBeNull();
    expect(costFromUsage({ ...usage, completion_tokens_details: { reasoning_tokens: 10 } }, model)).toBeNull();
  });
  it.each([
    [{ prompt_tokens: 35, completion_tokens: 58, total_tokens: 93 }, 0],
    [{ prompt_tokens: 35, completion_tokens: 58, prompt_tokens_details: { cached_tokens: 10 } }, 0],
    [{ prompt_tokens: 35, completion_tokens: 58, completion_tokens_details: { reasoning_tokens: 20 } }, 0],
    [
      {
        prompt_tokens: 2901,
        completion_tokens: 57,
        total_tokens: 2958,
        prompt_tokens_details: { cached_tokens: 256 },
        completion_tokens_details: { reasoning_tokens: 42, text_tokens: 15 }
      },
      0
    ],
    [{ prompt_tokens: 35, completion_tokens: 58, completion_tokens_details: { text_tokens: 58 } }, 0],
    [
      {
        prompt_tokens: 35,
        completion_tokens: 58,
        completion_tokens_details: { reasoning_tokens: 20, text_tokens: 39 }
      },
      null
    ],
    [
      { prompt_tokens: 35, completion_tokens: 58, total_tokens: 1, completion_tokens_details: { text_tokens: 58 } },
      null
    ],
    [
      {
        prompt_tokens: 35,
        completion_tokens: 58,
        prompt_tokens_details: { cached_tokens: 36 },
        completion_tokens_details: { text_tokens: 58 }
      },
      null
    ],
    [
      {
        prompt_tokens: 35,
        completion_tokens: 58,
        completion_tokens_details: { text_tokens: 58, unknown_cost: 0 }
      },
      null
    ],
    [{ prompt_tokens: 35, completion_tokens: 58, completion_tokens_details: { text_tokens: -1 } }, null],
    [{ prompt_tokens: 35, completion_tokens: 58, completion_tokens_details: { text_tokens: 58.5 } }, null],
    [null, null],
    [{ prompt_tokens: 35 }, null],
    [{ prompt_tokens: 35, completion_tokens: 58, unknown_cost: 0 }, null],
    [{ prompt_tokens: 35, completion_tokens: 58, billable_extra: { search: 1 } }, null],
    [{ prompt_tokens: 35, completion_tokens: 58, prompt_tokens_details: { audio_tokens: 1 } }, null]
  ])('Agnes 精确免费表经真实处理函数结算并保留原 usage：%j', async (usage, expected) => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-26T12:00:00Z'));
    try {
      vi.stubEnv('LEARNING_ALLOWED_ORIGINS', 'https://apihub.agnes-ai.com');
      expect(
        (
          await models(
            context({
              action: 'save',
              shareConsent: true,
              profile: {
                id: 'agnes-free',
                provider: 'Agnes AI',
                model: 'agnes-2.5-flash',
                endpoint: 'https://apihub.agnes-ai.com/v1/chat/completions',
                apiKey: 'synthetic-agnes-key'
              }
            })
          )
        ).success
      ).toBe(true);
      vi.mocked(callLearningProvider).mockResolvedValueOnce({
        content: '{"message":"合成回复","tools":[]}',
        actualModel: 'agnes-2.5-flash',
        usage,
        durationMs: 1
      });
      expect(
        await ai(
          context({
            modelId: 'agnes-free',
            requestId: 'agnes-cost-fixture',
            shareConsent: true,
            messages: [{ role: 'user', content: 'Synthetic cost check' }]
          })
        )
      ).toMatchObject({ success: true, data: { usageStatus: expected === 0 ? 'settled' : 'pending' } });
      const account: any = [...mock.rows.values()].find((row: any) => row.user_id === 'u1' && row.calls);
      expect(account.calls[0]).toMatchObject({
        actualCost: expected,
        priceVersion: 'agnes-2.5-flash-free-2026-10-26',
        costStatus: expected === 0 ? 'settled' : 'pending',
        usage
      });
      expect(callLearningProvider).toHaveBeenCalledTimes(1);
    } finally {
      clock.mockRestore();
    }
  });
  it('所有新入口拒绝缺失或篡改的 JWT，不触发外部模型', async () => {
    for (const endpoint of [models, ai, stream, sync, subscription]) {
      expect((await endpoint({ headers: {}, body: {} })).code).toBe(401);
      expect((await endpoint({ ...context(), headers: { authorization: 'Bearer forged' } })).code).toBe(401);
    }
    expect(callLearningProvider).not.toHaveBeenCalled();
    expect(mock.rows.size).toBe(0);
  });
  it('真实收费关闭、限流失败拒绝、流式非法输入在调用前拒绝', async () => {
    expect((await subscription(context({ action: 'order', environment: 'production', paid: true }))).success).toBe(
      false
    );
    expect((await stream(context())).code).toBe(400);
    mock.allowed = false;
    expect((await ai(context())).code).toBe(429);
    expect(callLearningProvider).not.toHaveBeenCalled();
  });
  it('调用前取消经过身份隔离并阻止后来到达的请求，不产生上游调用', async () => {
    const profile = {
      id: 'byo',
      model: 'explicit-test-id',
      endpoint: 'https://provider.example/chat',
      apiKey: 'test-only'
    };
    await models(context({ action: 'save', profile, shareConsent: true }));
    const cancelled = await models(context({ action: 'cancel', requestId: 'early' }));
    expect(cancelled.data).toMatchObject({ cancellationRecorded: true, executionStopped: true });
    const body = {
      modelId: 'byo',
      requestId: 'early',
      messages: [{ role: 'user', content: 'TEST_ONLY' }],
      shareConsent: true
    };
    expect((await ai(context(body))).code).toBe(499);
    expect(callLearningProvider).not.toHaveBeenCalled();
    await models(context({ action: 'cancel', requestId: 'early' }, 'u2'));
    const accounts: any[] = [...mock.rows.entries()]
      .filter(([id]) => id.startsWith('learning_accounts:'))
      .map(([, row]) => row);
    expect(accounts).toHaveLength(2);
    expect(accounts.every((row) => row.calls.length === 1)).toBe(true);
  });
  it('在途取消后即使上游成功也不返回可执行教学，保留上游用量并取消权益扣除', async () => {
    await models(
      context({
        action: 'save',
        shareConsent: true,
        profile: {
          id: 'byo',
          model: 'explicit-test-id',
          endpoint: 'https://provider.example/chat',
          apiKey: 'test-only'
        }
      })
    );
    let release: any;
    let started: any;
    const ready = new Promise((resolve) => {
      started = resolve;
    });
    vi.mocked(callLearningProvider).mockImplementationOnce(async () => {
      started();
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    const request = ai(
      context({
        modelId: 'byo',
        requestId: 'inflight',
        shareConsent: true,
        messages: [{ role: 'user', content: 'TEST_ONLY' }]
      })
    );
    await ready;
    const cancelled = await models(context({ action: 'cancel', requestId: 'inflight' }));
    expect(cancelled.data.executionStopped).toBe(false);
    release({
      content: '{"message":"不应执行的教学","tools":[]}',
      actualModel: 'explicit-test-id',
      usage: { prompt_tokens: 7, completion_tokens: 8 },
      durationMs: 1
    });
    expect((await request).code).toBe(499);
    const account: any = [...mock.rows.entries()].find(([id]) => id.startsWith('learning_accounts:'))?.[1];
    expect(account.calls[0]).toMatchObject({
      status: 'cancelled',
      result: null,
      entitlementCharged: 0,
      usage: { prompt_tokens: 7, completion_tokens: 8 }
    });
  });
  it('服务端保存的密钥隔离、列表/账户脱敏，自带 API 不扣平台额度，重复请求不二次调用', async () => {
    const profile = {
      id: 'byo',
      model: 'explicit-test-id',
      endpoint: 'https://provider.example/v1/chat/completions',
      apiKey: 'test-only-upstream-key',
      structured: true
    };
    expect((await models(context({ action: 'save', profile, shareConsent: true }))).success).toBe(true);
    const account: any = [...mock.rows.entries()].find(([id]) => id.startsWith('learning_accounts:'))?.[1];
    expect(JSON.stringify(account)).not.toContain('test-only-upstream-key');
    expect(account.profiles[0].vault).toBeUndefined();
    expect(account.profiles[0].keyRef).toBeTruthy();
    const listed = await models(context({ action: 'list' }));
    expect(JSON.stringify(listed)).not.toMatch(/ciphertext|keyRef|test-only-upstream-key/);
    expect((await models(context({ action: 'list' }, 'u2'))).data.models).toHaveLength(0);
    const body = {
      requestId: 'r1',
      modelId: 'byo',
      messages: [{ role: 'user', content: '学习测试' }],
      shareConsent: true
    };
    expect((await ai(context(body))).success).toBe(true);
    expect((await ai(context(body))).reused).toBe(true);
    expect(callLearningProvider).toHaveBeenCalledTimes(1);
    const usage = await models(context({ action: 'usage' }));
    expect(usage.data.entitlement.spent).toBe(0);
    expect((await models(context({ action: 'delete', profileId: 'byo' }))).success).toBe(true);
    expect([...mock.rows.keys()].filter((id) => id.startsWith('learning_model_keys:'))).toHaveLength(0);
  });
  it.each([
    ...['plan.set', 'timezone.set'].flatMap((type) =>
      [
        ['array', ['UTC']],
        ['number', 24],
        ['null', null],
        ['empty', ''],
        ['overlong', 'U'.repeat(81)],
        ['unknown', 'Invalid/Zone']
      ].map(([label, timezone]) => ({ type, label, fields: { timezone } }))
    ),
    { type: 'timezone.set', label: 'missing', fields: {} }
  ])('全新时区操作 $type/$label 返回 422/INVALID_INPUT，不改变云端原记录', async ({ type, label, fields }) => {
    const saved = await sync(
      context({
        action: 'push',
        operations: [
          {
            id: `valid-sync-zone-${type}-${label}`,
            type: 'plan.set',
            at: 1790848800000,
            data: { tasks: [], timezone: 'UTC' }
          }
        ]
      })
    );
    expect(saved.code).toBe(0);
    const before = structuredClone([...mock.rows.entries()]);
    const result = await sync(
      context({
        action: 'push',
        operations: [
          {
            id: `fresh-invalid-sync-zone-${type}-${label}`,
            type,
            at: 1790848800000,
            data: type === 'plan.set' ? { tasks: [], ...fields } : fields
          }
        ]
      })
    );
    expect(result).toMatchObject({ code: 422, success: false, error: 'INVALID_INPUT' });
    expect([...mock.rows.entries()]).toEqual(before);
  });
  it.each(['UTC', 'US/Pacific', '+23:00'])('同步保留合法时区 %s，未指定计划时区时沿用账户', async (timezone) => {
    const result = await sync(
      context({
        action: 'push',
        operations: [
          { id: `sync-account-zone-${timezone}`, type: 'timezone.set', at: 1790848800000, data: { timezone } },
          { id: `sync-explicit-zone-${timezone}`, type: 'plan.set', at: 1790848800000, data: { tasks: [], timezone } },
          { id: `sync-inherited-zone-${timezone}`, type: 'plan.set', at: 1790848800000, data: { tasks: [] } }
        ]
      })
    );
    expect(result).toMatchObject({ code: 0, success: true });
    expect(result.data.state.timezone).toBe(timezone);
    expect(result.data.state.plans).toHaveLength(2);
    for (const plan of result.data.state.plans) expect(plan.timezone).toBe(timezone);
  });
  it('同步忽略客户端用户身份且保持私有范围', async () => {
    const result = await sync(
      context({
        action: 'push',
        userId: 'u2',
        operations: [{ id: 'c1', type: 'conversation.start', at: Date.now(), data: { goal: '独立目标' } }]
      })
    );
    expect(result.success).toBe(true);
    expect(result.data.state.owner).toBe('u1');
    expect((await sync(context({ action: 'pull' }, 'u2'))).data.state.conversations).toHaveLength(0);
  });
});

function streamResponse(backpressure = false) {
  const response: any = new EventEmitter();
  response.headersSent = false;
  response.writableEnded = false;
  response.destroyed = false;
  response.parts = [];
  response.setHeader = vi.fn();
  response.write = (text: string) => {
    response.headersSent = true;
    response.parts.push(text);
    return !backpressure;
  };
  response.end = () => {
    response.writableEnded = true;
    response.emit('close');
  };
  response.destroy = () => {
    response.destroyed = true;
    response.emit('close');
  };
  return response;
}
async function streamProfile(enabled = true, owner = 'u1', fixtureKey = 'fixture-only-stream-key', overrides = {}) {
  await models(
    context(
      {
        action: 'save',
        shareConsent: true,
        profile: {
          id: 'fixture-stream',
          model: 'explicit-test-id',
          apiKey: fixtureKey,
          endpoint: 'https://provider.example/chat',
          stream: enabled,
          ...overrides
        }
      },
      owner
    )
  );
}
const streamBody = (id = 'stream-fixture') => ({
  requestId: id,
  requestBinding: 'binding_fixture_only',
  modelId: 'fixture-stream',
  shareConsent: true,
  messages: [{ role: 'user', content: '理解函数' }],
  learningContext: { owner: 'u1' }
});
const streamCompleted = {
  content: '{"message":"分步讲解","tools":[]}',
  actualModel: 'explicit-test-id',
  usage: { prompt_tokens: 4, completion_tokens: 8 },
  usageComplete: true,
  durationMs: 2,
  finishReason: 'stop'
};
it('原请求查询将中断的过期预留收敛到终态，保留未知费用和幂等，不触发供应商', async () => {
  const now = Date.now();
  let account = newAccount('u1');
  for (const [id, at] of [
    ['stale-intake', now - 120001],
    ['active-intake', now]
  ] as const) {
    account = reserveCall(
      account,
      { id, fingerprint: id, model: 'fixture', source: 'byok', maxCost: 0, units: 0 },
      at
    ).account;
  }
  mock.rows.set(`learning_accounts:${account._id}`, account);
  const cost = structuredClone(account.cost);
  expect(await models(context({ action: 'result', requestId: 'stale-intake' }, 'u2'))).toMatchObject({ code: 404 });
  expect(account.calls[0].status).toBe('reserved');
  expect(await models(context({ action: 'result', requestId: 'stale-intake' }))).toMatchObject({
    success: false,
    code: 503,
    status: 'failed'
  });
  const saved = () => mock.rows.get(`learning_accounts:${account._id}`);
  expect(saved().calls[0]).toMatchObject({
    id: 'stale-intake',
    status: 'failed',
    errorCode: 'EXECUTION_INTERRUPTED',
    costStatus: 'pending',
    actualCost: null,
    result: null
  });
  expect(saved().cost).toEqual(cost);
  const revision = saved().revision;
  expect(await models(context({ action: 'result', requestId: 'stale-intake' }))).toMatchObject({ status: 'failed' });
  expect(await models(context({ action: 'result', requestId: 'active-intake' }))).toMatchObject({
    success: false,
    code: 409,
    status: 'reserved'
  });
  expect(saved().revision).toBe(revision);
  expect(saved().calls).toHaveLength(2);
  expect(
    reserveCall(saved(), {
      id: 'stale-intake',
      fingerprint: 'stale-intake',
      model: 'fixture',
      source: 'byok',
      maxCost: 0,
      units: 0
    }).reused
  ).toBe(true);
  expect(callLearningProvider).not.toHaveBeenCalled();
  expect(callStreamingLearningProvider).not.toHaveBeenCalled();
});
it('原缓存过期后恢复/同ID重试都明确不可用，保留账单且不再发起模型调用', async () => {
  await streamProfile();
  const body = streamBody('cache-expiry');
  expect((await ai(context(body))).success).toBe(true);
  const row: any = [...mock.rows.values()].find((a: any) => a.user_id === 'u1' && a.calls);
  row.calls[0].resultExpiresAt = Date.now() - 1;
  const before = structuredClone(row.cost);
  const read = await models(context({ action: 'result', requestId: body.requestId }));
  expect(read).toMatchObject({ code: 410, cacheStatus: 'expired', error: 'MODEL_RESULT_UNAVAILABLE' });
  expect((await ai(context(body))).code).toBe(410);
  expect(callLearningProvider).toHaveBeenCalledTimes(1);
  const actual = [...mock.rows.values()].find((a: any) => a.user_id === 'u1' && a.calls);
  expect(actual.cost).toEqual(before);
  expect(actual.calls).toHaveLength(1);
  expect(actual.calls[0].result).toBeNull();
  expect((await models(context({ action: 'result', requestId: body.requestId }, 'u2'))).code).toBe(404);
  expect((await models(context({ action: 'usage' }))).data.resultCache).toMatchObject({
    entries: 0,
    bytes: 0,
    expiryEnforcement: 'on_access'
  });
});
it('缓存容量与异常用量经过真实端点合同，不把恢复请求变为成功空结果或新消费', async () => {
  vi.stubEnv('LEARNING_MODEL_RESULT_CACHE', '{"maxEntries":1}');
  await streamProfile();
  expect((await ai(context(streamBody('cache-old')))).success).toBe(true);
  vi.mocked(callLearningProvider).mockResolvedValueOnce({
    ...streamCompleted,
    usage: { prompt_tokens: 4, completion_tokens: 8, billable_extra: 'PRIVATE_USAGE'.repeat(10000) }
  });
  expect((await ai(context(streamBody('cache-new')))).success).toBe(true);
  expect((await models(context({ action: 'result', requestId: 'cache-old' }))).code).toBe(410);
  expect(await ai(context(streamBody('cache-old')))).toMatchObject({ code: 410, cacheStatus: 'capacity' });
  const current = await models(context({ action: 'usage' }));
  expect(current.data.calls).toHaveLength(2);
  expect(current.data.resultCache.entries).toBe(1);
  expect(current.data.calls[1]).toMatchObject({
    actualCost: null,
    usageEvidence: { status: 'truncated', truncated: true }
  });
  expect(JSON.stringify(current)).not.toContain('PRIVATE_USAGE');
  expect(callLearningProvider).toHaveBeenCalledTimes(2);
  expect(current.data.entitlement.spent).toBe(0);
});
it('无效缓存配置在上游调用或费用预留前拒绝', async () => {
  await streamProfile();
  vi.stubEnv('LEARNING_MODEL_RESULT_CACHE', '{"maxEntries":0}');
  expect((await ai(context(streamBody('no-charge')))).error).toBe('POLICY_INVALID');
  expect(callLearningProvider).not.toHaveBeenCalled();
  expect([...mock.rows.values()].find((a: any) => a.calls).calls).toHaveLength(0);
});
describe('模型结果缓存的隐私删除', () => {
  it('删除云副本清除本账户结果、保留费用和密钥，跨账户不受影响，旧请求不能再生成', async () => {
    for (const owner of ['u1', 'u2']) {
      await streamProfile(true, owner);
      const body = { ...streamBody('private-result'), learningContext: { owner } };
      expect((await ai(context(body, owner))).success).toBe(true);
      await sync(context({ action: 'pull' }, owner));
    }
    const before = (await models(context({ action: 'usage' }))).data;
    const deleted = await sync(context({ action: 'delete' }));
    expect(deleted.data).toMatchObject({ deleted: true, modelResultCacheDeleted: true, erasedResults: 1 });
    const after = (await models(context({ action: 'usage' }))).data;
    expect(after.cost).toEqual(before.cost);
    expect(after.entitlement).toEqual(before.entitlement);
    expect(after.calls[0]).toMatchObject({ status: 'completed', actualCost: null });
    expect((await models(context({ action: 'result', requestId: 'private-result' }))).code).toBe(410);
    expect((await ai(context(streamBody('private-result')))).code).toBe(410);
    expect(callLearningProvider).toHaveBeenCalledTimes(2);
    expect((await models(context({ action: 'result', requestId: 'private-result' }, 'u2'))).success).toBe(true);
    expect((await models(context({ action: 'list' }))).data.models).toHaveLength(1);
    expect([...mock.rows.keys()].filter((id) => id.startsWith('learning_model_keys:'))).toHaveLength(2);
    expect(
      [...mock.rows.entries()].filter(([id]) => id.startsWith('learning_states:')).map(([, row]) => row.user_id)
    ).toEqual(['u2']);
    expect((await sync(context({ action: 'delete' }))).data.erasedResults).toBe(0);
  });
  it('删除先原子标记在途取消，晚到的已计费用量只能结算、不能回填正文', async () => {
    await streamProfile();
    let release: any, started: any;
    const ready = new Promise((resolve) => (started = resolve));
    vi.mocked(callLearningProvider).mockImplementationOnce(async (_model, _messages, _origins, signal) => {
      started(signal);
      return new Promise((resolve) => (release = resolve));
    });
    const pending = ai(context(streamBody('delete-inflight')));
    const signal: any = await ready;
    expect((await sync(context({ action: 'delete' }))).data.cancellationRecorded).toBe(1);
    expect(signal.aborted).toBe(true);
    release(streamCompleted);
    expect((await pending).code).toBe(499);
    const call = (await models(context({ action: 'usage' }))).data.calls[0];
    expect(call).toMatchObject({
      status: 'cancelled',
      entitlementCharged: 0,
      actualCost: null,
      usage: streamCompleted.usage
    });
    expect((await models(context({ action: 'result', requestId: 'delete-inflight' }))).code).toBe(410);
    const row: any = [...mock.rows.entries()].find(([id]) => id.startsWith('learning_accounts:'))?.[1];
    expect(row.calls[0].result).toBeNull();
  });
  it('资料墓碑先校验再清除结果；无效批次不清除，重复补传不删除后续新结果', async () => {
    await streamProfile();
    await ai(context(streamBody('before-material-delete')));
    const material = parsePastedMaterial('私人提取文字', 'private-m1');
    expect(
      (
        await sync(
          context({
            action: 'push',
            operations: [{ id: 'material-added', type: 'material.add', at: Date.now(), data: { material } }]
          })
        )
      ).success
    ).toBe(true);
    const deletion = {
      id: 'material-erased',
      type: 'material.delete',
      at: Date.now(),
      data: { materialId: 'private-m1', questionKeys: [] }
    };
    expect(
      (
        await sync(
          context({
            action: 'push',
            operations: [{ ...deletion, data: { materialId: 'private-m1', questionKeys: null } }]
          })
        )
      ).success
    ).toBe(false);
    expect((await models(context({ action: 'result', requestId: 'before-material-delete' }))).success).toBe(true);
    const deleted = await sync(context({ action: 'push', operations: [deletion] }));
    expect(deleted.success).toBe(true);
    expect(deleted.data.state.materials).toHaveLength(0);
    expect((await models(context({ action: 'result', requestId: 'before-material-delete' }))).code).toBe(410);
    await ai(context(streamBody('after-material-delete')));
    expect((await sync(context({ action: 'push', operations: [deletion] }))).data.revision).toBe(deleted.data.revision);
    expect((await models(context({ action: 'result', requestId: 'after-material-delete' }))).success).toBe(true);
  });
  it('云状态删除失败不冒充成功；结果先清除，重试完成余下步骤', async () => {
    await streamProfile();
    await ai(context(streamBody('retry-erase')));
    await sync(context({ action: 'pull' }));
    mock.failStateDelete = true;
    expect((await sync(context({ action: 'delete' }))).success).toBe(false);
    expect([...mock.rows.keys()].some((id) => id.startsWith('learning_states:'))).toBe(true);
    expect((await models(context({ action: 'result', requestId: 'retry-erase' }))).code).toBe(410);
    mock.failStateDelete = false;
    expect((await sync(context({ action: 'delete' }))).data.deleted).toBe(true);
    expect([...mock.rows.keys()].some((id) => id.startsWith('learning_states:'))).toBe(false);
    expect(callLearningProvider).toHaveBeenCalledTimes(1);
  });
});
it('DNS 网络保护拒绝后保留未调用及零成本事实，同ID不重发或产生教学结果', async () => {
  await streamProfile();
  const failure = new ProviderError('SSRF_BLOCKED', '模型域名解析到禁止的网络地址');
  failure.executionStage = 'not_called';
  vi.mocked(callLearningProvider).mockRejectedValueOnce(failure);
  const body = streamBody('dns-not-called');
  expect(await ai(context(body))).toMatchObject({
    success: false,
    error: 'SSRF_BLOCKED',
    message: expect.stringContaining('本次未调用模型')
  });
  const usage = await models(context({ action: 'usage' }));
  expect(usage.data.calls).toHaveLength(1);
  expect(usage.data.calls[0]).toMatchObject({
    status: 'failed',
    actualCost: 0,
    executionStage: 'not_called',
    costStatus: 'settled',
    usage: null,
    errorCode: 'SSRF_BLOCKED'
  });
  expect(usage.data.entitlement.spent).toBe(0);
  expect(usage.data.cost.spent).toBe(0);
  expect((await ai(context(body))).code).toBe(409);
  expect(await models(context({ action: 'result', requestId: body.requestId }))).toMatchObject({
    success: false,
    message: expect.stringContaining('没有可恢复的回复')
  });
  expect(callLearningProvider).toHaveBeenCalledTimes(1);
  expect((await models(context({ action: 'usage' }, 'u2'))).data.calls).toHaveLength(0);
});

describe('流式实际预算、终止收据与取消隔离', () => {
  it('未声明流式能力或没有可靠后端传输时不调用模型，已预留已知未调用结算为零', async () => {
    await streamProfile(false);
    expect((await stream(context(streamBody()))).code).toBe(422);
    expect(callStreamingLearningProvider).not.toHaveBeenCalled();
    await streamProfile();
    expect((await stream(context(streamBody()))).error).toBe('STREAM_TRANSPORT_UNAVAILABLE');
    const usage = await models(context({ action: 'usage' }));
    expect(usage.data.calls).toHaveLength(1);
    expect(usage.data.calls[0]).toMatchObject({ actualCost: 0, executionStage: 'not_called', costStatus: 'settled' });
    expect(callStreamingLearningProvider).not.toHaveBeenCalled();
  });
  it('完整 SSE 绑定当前型号并在终止前校验；只读结果和同ID重播都不追加用量', async () => {
    await streamProfile();
    const response = streamResponse();
    mock.response = response;
    vi.mocked(callStreamingLearningProvider).mockImplementationOnce(async (_model, _messages, _origins, options) => {
      options?.onPreview?.('{"message":"先讲解 fixture-only-stream-key 已经调整计划，之后继续教学","tools":[]}');
      options?.onPreview?.('{"message":"这是正常的流式教学预览","tools":[]}');
      return streamCompleted;
    });
    expect(await stream(context(streamBody()))).toBeNull();
    expect(response.writableEnded).toBe(true);
    const text = response.parts.join('');
    expect(text).toContain('event: preview');
    expect(text).toContain('这是正常的流式教学预览');
    expect(text).toContain('event: result');
    expect(text).not.toContain('fixture-only-stream-key');
    expect(text).not.toContain('[REDACTED_MODEL_KEY]');
    expect(text).not.toContain('已经调整计划');
    const before = structuredClone([...mock.rows.values()]);
    const read = await models(context({ action: 'result', requestId: 'stream-fixture' }));
    expect(read).toMatchObject({
      success: true,
      reused: true,
      data: { modelId: 'fixture-stream', requestBinding: 'binding_fixture_only', transport: 'sse-v1' }
    });
    expect([...mock.rows.values()]).toEqual(before);
    mock.response = streamResponse();
    await stream(context(streamBody()));
    expect(callStreamingLearningProvider).toHaveBeenCalledOnce();
    const usage = await models(context({ action: 'usage' }));
    expect(usage.data.calls).toHaveLength(1);
    expect(usage.data.entitlement.spent).toBe(0);
    expect((await models(context({ action: 'result', requestId: 'stream-fixture' }, 'u2'))).code).toBe(404);
  });
  it('输出截断/模型错配和未知成本不变成成功；仅完整已见用量可以结算', async () => {
    await streamProfile();
    mock.response = streamResponse();
    const failed = new ProviderError('INCOMPLETE_OUTPUT', 'fixture');
    failed.observed = {
      actualModel: 'explicit-test-id',
      usage: { prompt_tokens: 4, completion_tokens: 8 },
      usageComplete: false
    };
    vi.mocked(callStreamingLearningProvider).mockRejectedValueOnce(failed);
    await stream(context(streamBody()));
    expect(mock.response.parts.join('')).toContain('event: error');
    expect(mock.response.parts.join('')).not.toContain('event: result');
    const usage = await models(context({ action: 'usage' }));
    expect(usage.data.calls[0]).toMatchObject({
      status: 'failed',
      actualCost: null,
      costStatus: 'pending',
      executionStage: 'started',
      usageComplete: false
    });
    expect((await models(context({ action: 'result', requestId: 'stream-fixture' }))).success).toBe(false);
  });
  it('客户端背压终止供应商输出，不落成功结果或零成本假账', async () => {
    await streamProfile();
    mock.response = streamResponse(true);
    vi.mocked(callStreamingLearningProvider).mockImplementationOnce(async (_m, _msgs, _o, options) => {
      options?.onPreview?.('{"message":"这是足够长的教学预览内容，供背压校验使用","tools":[]}');
      return streamCompleted;
    });
    await stream(context(streamBody()));
    const usage = await models(context({ action: 'usage' }));
    expect(usage.data.calls[0]).toMatchObject({ status: 'failed', errorCode: 'CLIENT_BACKPRESSURE', actualCost: null });
    expect(mock.response.writableEnded).toBe(true);
  });
  it('服务端取消中断正在执行的同账户任务，异账户同ID不能取消它', async () => {
    await streamProfile();
    mock.response = streamResponse();
    let started: any;
    const ready = new Promise<void>((resolve) => (started = resolve));
    vi.mocked(callStreamingLearningProvider).mockImplementationOnce(
      async (_m, _msgs, _o, options) =>
        new Promise((_resolve, reject) => {
          started();
          options!.signal!.addEventListener('abort', () => reject(options!.signal!.reason), { once: true });
        })
    );
    const pending = stream(context(streamBody()));
    await ready;
    expect((await models(context({ action: 'cancel', requestId: 'stream-fixture' }, 'u2'))).success).toBe(true);
    expect((await models(context({ action: 'result', requestId: 'stream-fixture' }))).code).toBe(409);
    await models(context({ action: 'cancel', requestId: 'stream-fixture' }));
    await pending;
    const usage = await models(context({ action: 'usage' }));
    expect(usage.data.calls[0]).toMatchObject({ status: 'cancelled', actualCost: null, costStatus: 'pending' });
    expect((await models(context({ action: 'result', requestId: 'stream-fixture' }))).code).toBe(499);
    expect(callStreamingLearningProvider).toHaveBeenCalledOnce();
  });
  it('取消先到、模型配置已更换或关联令牌不同，不复用错误结果或新增调用', async () => {
    await streamProfile();
    mock.response = streamResponse();
    await models(context({ action: 'cancel', requestId: 'cancel-first' }));
    expect((await stream(context(streamBody('cancel-first')))).success).toBe(false);
    expect(callStreamingLearningProvider).not.toHaveBeenCalled();
    vi.mocked(callStreamingLearningProvider).mockResolvedValueOnce(streamCompleted);
    await stream(context(streamBody()));
    mock.response = streamResponse();
    const changed = await stream(context({ ...streamBody(), requestBinding: 'other_binding_fixture' }));
    expect(changed.error).toBe('IDEMPOTENCY_CONFLICT');
    vi.stubEnv(
      'LEARNING_PLATFORM_MODELS',
      JSON.stringify([
        {
          id: 'fixture-stream',
          model: 'other-real-model',
          endpoint: 'https://provider.example/chat',
          keyEnv: 'FIXTURE_MODEL_KEY',
          provider: 'isolated',
          maxOutput: 100,
          capabilities: { stream: true, structured: true, tools: false, vision: false },
          inputPerMillion: 1,
          outputPerMillion: 1,
          priceVersion: 'test-only'
        }
      ])
    );
    vi.stubEnv('LEARNING_PLATFORM_CALLS_ENABLED', 'true');
    vi.stubEnv('FIXTURE_MODEL_KEY', 'fixture-only-platform-key');
    expect((await stream(context(streamBody()))).success).toBe(false);
    expect(callStreamingLearningProvider).toHaveBeenCalledOnce();
  });
});

describe('明确写作反馈在预留前约束输出，收到后仍校验原答', () => {
  const account = () => [...mock.rows.values()].find((row: any) => row.user_id === 'u1' && Array.isArray(row.calls));
  const body = () => ({
    requestId: 'bound-writing-request',
    requestBinding: 'binding_writing_fixture',
    modelId: 'groq-writing-fixture',
    shareConsent: true,
    feedbackAttemptId: 'saved-writing-attempt',
    feedbackOutputContract: 'writing-feedback-output-v1',
    messages: [{ role: 'user', content: '请评阅已保存原答。' }],
    learningContext: {
      owner: 'u1',
      question: {
        questionKey: 'writing-fixture@1',
        prompt: '合成写作题',
        uncertainties: [],
        rubric: {
          id: 'saved-writing-rubric',
          version: 1,
          source: { kind: 'project_original' },
          criteria: [{ id: 'reader', name: '读者', description: '明确读者', maxScore: 2 }]
        }
      },
      attempt: { id: 'saved-writing-attempt', answer: '  Reading club meets Friday.\nReading club meets Friday.  ' }
    }
  });
  const output = () => ({
    message: '仍需核对。',
    tools: [
      {
        name: 'assess',
        arguments: {
          attemptId: 'saved-writing-attempt',
          rubricId: 'saved-writing-rubric',
          outcome: 'partial',
          feedback: '辅助反馈。',
          dimensions: [
            {
              criterionId: 'reader',
              score: 1,
              feedback: '明确了社团。',
              evidence: [{ quote: 'Reading club', start: 2, end: 14 }]
            }
          ]
        }
      }
    ]
  });
  async function prepare() {
    vi.stubEnv('LEARNING_ALLOWED_ORIGINS', 'https://api.groq.com');
    expect(
      (
        await models(
          context({
            action: 'save',
            shareConsent: true,
            profile: {
              id: 'groq-writing-fixture',
              provider: 'Groq',
              model: 'openai/gpt-oss-20b',
              endpoint: 'https://api.groq.com/openai/v1/chat/completions',
              apiKey: 'fixture-only-groq-key',
              structured: true,
              stream: true
            }
          })
        )
      ).success
    ).toBe(true);
    // Exercise an existing 1000-token profile. New connections now default to
    // 2000, but request-specific preparation must not rewrite saved profiles.
    account().profiles[0].maxOutput = 1000;
    vi.mocked(callLearningProvider).mockImplementation(async () => ({
      content: JSON.stringify(output()),
      actualModel: 'openai/gpt-oss-20b',
      usage: { prompt_tokens: 28, completion_tokens: 40 },
      durationMs: 1
    }));
  }
  it('实际接口向已核对型号发送绑定编号的严格格式，并按相同推理及输出配置预留、幂等复用', async () => {
    await prepare();
    vi.mocked(callLearningProvider).mockImplementationOnce(async (config, messages) => {
      // 观察真实调用边界，不能在供应商已调用后才修补预算。
      expect(account().calls[0]).toMatchObject({
        status: 'reserved',
        maxOutput: config.maxOutput,
        reasoningEffort: 'low',
        inputByteBound: Buffer.byteLength(JSON.stringify(buildLearningRequest(config, messages)))
      });
      return {
        content: JSON.stringify(output()),
        actualModel: config.model,
        usage: { prompt_tokens: 28, completion_tokens: 40 },
        durationMs: 1
      };
    });
    const result = await ai(context(body()));
    expect(result.success).toBe(true);
    const [config, messages] = vi.mocked(callLearningProvider).mock.calls[0];
    const request: any = buildLearningRequest(config, messages);
    expect(request).toMatchObject({
      max_tokens: 2000,
      reasoning_effort: 'low',
      response_format: { type: 'json_schema', json_schema: { strict: true } }
    });
    const schema = request.response_format.json_schema.schema;
    expect(schema.additionalProperties).toBe(false);
    const args = schema.properties.tools.items.properties.arguments;
    expect(args.required).toContain('rubricId');
    expect(args.properties.rubricId.enum).toEqual(['saved-writing-rubric']);
    expect(args.properties.attemptId.enum).toEqual(['saved-writing-attempt']);
    const score = args.properties.dimensions.items.anyOf[0].properties.score;
    // 数值格式不替代宿主半分和上限校验；供应商不再收到混合数值枚举。
    expect(score.type).toEqual(['number', 'null']);
    expect(score).not.toHaveProperty('enum');
    const savedAccount: any = account();
    expect(savedAccount.calls[0]).toMatchObject({
      outputContract: 'writing-feedback-output-v1',
      inferencePolicy: 'groq-writing-strict-v1',
      maxOutput: 2000,
      reasoningEffort: 'low',
      executionStage: 'received',
      status: 'completed'
    });
    expect(savedAccount.calls[0].schemaDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(savedAccount.calls[0].inputByteBound).toBe(Buffer.byteLength(JSON.stringify(request)));
    expect(savedAccount.profiles[0].maxOutput).toBe(1000);
    expect((await ai(context(body()))).reused).toBe(true);
    expect(callLearningProvider).toHaveBeenCalledOnce();
  });
  it('没有明确反馈标记的历史/普通讲解不启用新参数或格式，即使上下文含量表和原答', async () => {
    await prepare();
    const legacy: any = body();
    delete legacy.feedbackAttemptId;
    delete legacy.feedbackOutputContract;
    expect((await ai(context(legacy))).success).toBe(true);
    const [config, messages] = vi.mocked(callLearningProvider).mock.calls[0];
    expect(buildLearningRequest(config, messages)).toMatchObject({
      max_tokens: 1000,
      response_format: { type: 'json_object' }
    });
    // The existing Groq per-model policy applies to ordinary chat as well.
    expect(buildLearningRequest(config, messages)).toHaveProperty('reasoning_effort', 'high');
    expect(config.writingOutput).toBeUndefined();
    expect(account().calls[0]).not.toHaveProperty('outputContract');
  });
  for (const invalid of [
    'missing-rubric',
    'scalar-evidence',
    'bad-range',
    'wrong-attempt',
    'extra-tool',
    'fractional-score',
    'excess-score'
  ]) {
    it(`不缓存 ${invalid}，保留真实收到阶段与待结算费用`, async () => {
      await prepare();
      const bad: any = output();
      const args = bad.tools[0].arguments;
      if (invalid === 'missing-rubric') delete args.rubricId;
      if (invalid === 'scalar-evidence') args.dimensions[0].evidence = 'Reading club';
      if (invalid === 'bad-range') args.dimensions[0].evidence[0].start = 0;
      if (invalid === 'wrong-attempt') args.attemptId = 'other';
      if (invalid === 'extra-tool') bad.tools.push({ name: 'progress', arguments: {} });
      if (invalid === 'fractional-score') args.dimensions[0].score = 0.25;
      if (invalid === 'excess-score') args.dimensions[0].score = 2.5;
      vi.mocked(callLearningProvider).mockResolvedValueOnce({
        content: JSON.stringify(bad),
        actualModel: 'openai/gpt-oss-20b',
        usage: { prompt_tokens: 28, completion_tokens: 40 },
        durationMs: 1
      });
      expect((await ai(context(body()))).success).toBe(false);
      const call: any = account().calls[0];
      expect(call).toMatchObject({
        status: 'failed',
        executionStage: 'received',
        actualCost: null,
        costStatus: 'pending'
      });
      expect(call.result).toBeNull();
      expect(call.usage.completion_tokens).toBe(40);
    });
  }
  it('格式版本、原答编号、量表或严格流式不合法时，未预留且未调用供应商', async () => {
    await prepare();
    for (const patch of [
      { feedbackOutputContract: undefined },
      { feedbackOutputContract: 'invented' },
      { feedbackAttemptId: 'other' },
      { learningContext: { ...body().learningContext, question: null } }
    ])
      expect((await ai(context({ ...body(), ...patch }))).success).toBe(false);
    expect((await runLearningModelTask(context(body()), { stream: true })).success).toBe(false);
    expect(account().calls).toEqual([]);
    expect(callLearningProvider).not.toHaveBeenCalled();
    expect(callStreamingLearningProvider).not.toHaveBeenCalled();
  });
});

it.each(['literal', 'unicode', 'escaped_leaf', 'escaped_property'])(
  'coach key echo stays blocked before results or tools: %s',
  async (kind) => {
    const sentinel = kind.startsWith('escaped_') ? 'fixture-only-quote"key' : 'fixture-only-stream-key';
    await streamProfile(false, 'u1', sentinel);
    const request = {
      contract: 'kaoyan-writing-coach-v1',
      phase: 'summary',
      target: 'summary',
      exam: 'english2',
      day: '2026-10-24',
      input: 'Synthetic answer.',
      sources: []
    };
    const { coachFixture } = await import('../fixtures/writing-coach.js');
    let content = JSON.stringify({
      message: kind === 'escaped_property' ? '合成讲解' : sentinel,
      ...(kind === 'escaped_property' ? { [sentinel]: 'Synthetic metadata.' } : {}),
      tools: [],
      question: null,
      coach: coachFixture(request)
    });
    const encoded = [...sentinel].map((c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`).join('');
    if (kind === 'unicode') content = content.replace(sentinel, encoded);
    const { modelValueHasKeyEcho } = await import('../../laf-backend/functions/_shared/ai-providers/learning-provider');
    if (kind.startsWith('escaped_')) expect(modelValueHasKeyEcho(content, sentinel)).toBe(false);
    const logs = ['error', 'warn', 'info', 'log'].map((method) =>
      vi.spyOn(console, method as 'error').mockImplementation(() => {})
    );
    try {
      vi.mocked(callLearningProvider).mockResolvedValueOnce({ ...streamCompleted, content });
      const result = await ai(
        context({ ...streamBody(`coach-secret-${kind}`), learningContext: { owner: 'u1', coach: request } })
      );
      expect(result).toMatchObject({ success: false, error: 'COACH_INVALID', validationPath: 'raw' });
      expect(result).not.toHaveProperty('data');
      const usage = await models(context({ action: 'usage' }));
      expect(usage.data.calls[0]).toMatchObject({ status: 'failed', costStatus: 'pending', actualCost: null });
      const account = [...mock.rows.values()].find((row: any) => row.user_id === 'u1' && Array.isArray(row.calls));
      expect(account.calls[0].result).toBeNull();
      const exported = JSON.stringify([result, usage.data.calls, account.calls]);
      expect(exported).not.toContain(sentinel);
      expect(exported).not.toContain(encoded);
      expect(callLearningProvider).toHaveBeenCalledOnce();
      logs.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    } finally {
      logs.forEach((spy) => spy.mockRestore());
    }
  }
);

it('coach safe original input retains strict JSON and unchanged teaching text', async () => {
  await streamProfile(false);
  const request = {
    contract: 'kaoyan-writing-coach-v1',
    phase: 'summary',
    target: 'summary',
    exam: 'english2',
    day: '2026-10-24',
    input: 'Synthetic answer.',
    sources: []
  };
  const { coachFixture } = await import('../fixtures/writing-coach.js');
  const message = '合成内容包含内部 ``` 和普通中文。';
  const coach = coachFixture(request);
  vi.mocked(callLearningProvider).mockResolvedValueOnce({
    ...streamCompleted,
    content: '```json\n' + JSON.stringify({ message, tools: [], question: null, coach }) + '\n```'
  });
  const result = await ai(
    context({ ...streamBody('coach-safe-original'), learningContext: { owner: 'u1', coach: request } })
  );
  expect(result).toMatchObject({
    success: true,
    data: {
      message,
      coach: { kind: 'summary', learned: coach.learned, tomorrow: coach.tomorrow },
      tools: [],
      question: null
    }
  });
  expect(callLearningProvider).toHaveBeenCalledOnce();
});

it('failed coach query preserves the validation path and pending cost after one repair without a third provider call', async () => {
  await streamProfile();
  const request = {
    contract: 'kaoyan-writing-coach-v1',
    phase: 'diagnostic',
    target: 'diagnostic',
    exam: 'english2',
    day: '2026-10-23',
    input: '开始摸底',
    sources: []
  };
  const { coachFixture } = await import('../fixtures/writing-coach.js');
  const invalid = coachFixture(request);
  invalid.cards[2].prompt = '';
  vi.mocked(callLearningProvider).mockResolvedValue({
    ...streamCompleted,
    content: JSON.stringify({ message: '合成摸底', tools: [], question: null, coach: invalid })
  });
  const body = { ...streamBody('coach-path-recovery'), learningContext: { owner: 'u1', coach: request } };
  expect(await ai(context(body))).toMatchObject({
    success: false,
    error: 'COACH_INVALID',
    validationPath: 'cards[2].prompt'
  });
  expect(vi.mocked(callLearningProvider).mock.calls[0][0].maxOutput).toBe(8192);
  const read = await models(context({ action: 'result', requestId: body.requestId }));
  expect(read).toMatchObject({
    success: false,
    status: 'failed',
    error: 'COACH_INVALID',
    validationPath: 'cards[2].prompt'
  });
  const usage = await models(context({ action: 'usage' }));
  expect(usage.data.calls[0]).toMatchObject({
    status: 'failed',
    errorCode: 'COACH_INVALID',
    validationPath: 'cards[2].prompt',
    actualCost: null,
    costStatus: 'pending'
  });
  expect(usage.data.calls[0]).not.toHaveProperty('result');
  const ledger = [...mock.rows.values()].find((row: any) => row.user_id === 'u1' && Array.isArray(row.calls));
  expect(ledger.calls[0].result).toBeNull();
  expect(await models(context({ action: 'result', requestId: body.requestId }, 'u2'))).toMatchObject({ code: 404 });
  expect(callLearningProvider).toHaveBeenCalledTimes(2);
});

it('BYOK saves multiple connections and account preferences, preserves keys on edit and clears a deleted selection', async () => {
  await streamProfile(false);
  await models(
    context({
      action: 'save',
      shareConsent: true,
      profile: {
        id: 'second',
        provider: 'Custom',
        model: 'other-model',
        endpoint: 'https://provider.example/chat',
        apiKey: 'fixture-second-key'
      }
    })
  );
  expect(
    (await models(context({ action: 'preferences', preferences: { selectedModelId: 'second', sharingAllowed: true } })))
      .success
  ).toBe(true);
  let listed = await models(context({ action: 'list' }));
  expect(listed.data.models).toHaveLength(2);
  expect(listed.data.preferences).toEqual({ selectedModelId: 'second', sharingAllowed: true });
  expect(listed.data.needsConnection).toBe(false);
  expect((await models(context({ action: 'list' }, 'u2'))).data).toMatchObject({
    models: [],
    needsConnection: true,
    preferences: { selectedModelId: null, sharingAllowed: false }
  });
  const edited = await models(
    context({
      action: 'save',
      shareConsent: true,
      profile: { id: 'second', provider: 'Custom', model: 'new-model', endpoint: 'https://provider.example/chat' }
    })
  );
  expect(edited.success).toBe(true);
  expect([...mock.rows.values()].filter((row: any) => row.vault)).toHaveLength(2);
  listed = await models(context({ action: 'list' }));
  expect(listed.data.models.find((row: any) => row.id === 'second').model).toBe('new-model');
  expect(JSON.stringify(listed)).not.toContain('fixture-second-key');
  await models(context({ action: 'delete', profileId: 'second' }));
  expect((await models(context({ action: 'list' }))).data.preferences.selectedModelId).toBeNull();
  expect(
    (await models(context({ action: 'preferences', preferences: { selectedModelId: 'fixture-stream' } }, 'u2'))).success
  ).toBe(false);
});

it('BYOK needs a connection before inference and does not fall back to a platform model', async () => {
  const result = await ai(context({ ...streamBody('no-connection'), modelId: '' }));
  expect(result).toMatchObject({ success: false, error: 'NEEDS_CONNECTION' });
  expect(callLearningProvider).not.toHaveBeenCalled();
});

it('one repair uses an independent receipt, returns the parent binding and can be recovered without re-inference', async () => {
  await streamProfile(false);
  const request = {
    contract: 'kaoyan-writing-coach-v1',
    phase: 'diagnostic',
    target: 'diagnostic',
    exam: 'english2',
    day: '2026-10-26',
    input: '开始摸底',
    sources: []
  };
  const { coachFixture } = await import('../fixtures/writing-coach.js');
  const valid = coachFixture(request);
  const invalid = structuredClone(valid);
  invalid.cards[0].prompt = '';
  vi.mocked(callLearningProvider)
    .mockResolvedValueOnce({
      ...streamCompleted,
      content: JSON.stringify({ message: '摸底', tools: [], question: null, coach: invalid })
    })
    .mockResolvedValueOnce({
      ...streamCompleted,
      content: JSON.stringify({ message: '摸底', tools: [], question: null, coach: valid })
    });
  const body = { ...streamBody('repair-success'), learningContext: { owner: 'u1', coach: request } };
  const result = await ai(context(body));
  expect(result).toMatchObject({
    success: true,
    data: {
      requestId: body.requestId,
      repairRequestId: `${body.requestId}:repair1`,
      requestBinding: body.requestBinding
    }
  });
  const ledger = [...mock.rows.values()].find((row: any) => row.user_id === 'u1' && row.calls);
  expect(ledger.calls.map((call: any) => [call.id, call.status])).toEqual([
    [body.requestId, 'failed'],
    [`${body.requestId}:repair1`, 'completed']
  ]);
  expect(ledger.calls[1]).toMatchObject({ repairOf: body.requestId, units: 0, entitlementCharged: 0 });
  expect(ledger.calls[0].usage).toBeTruthy();
  expect(ledger.calls[1].usage).toBeTruthy();
  expect((await models(context({ action: 'result', requestId: body.requestId }))).data.requestId).toBe(body.requestId);
  expect((await ai(context(body))).success).toBe(true);
  expect(callLearningProvider).toHaveBeenCalledTimes(2);
  expect(vi.mocked(callLearningProvider).mock.calls[0][0].provider).toBe(
    vi.mocked(callLearningProvider).mock.calls[1][0].provider
  );
});

it.each([
  ['KEY_REJECTED', 'KEY_INVALID'],
  ['MODEL_NOT_FOUND', 'MODEL_UNAVAILABLE'],
  ['RATE_LIMITED', 'RATE_LIMITED'],
  ['UPSTREAM_QUOTA', 'QUOTA_EXHAUSTED'],
  ['TIMEOUT', 'TIMEOUT'],
  ['TLS_FAILED', 'NETWORK_OR_TLS'],
  ['SSRF_BLOCKED', 'ADDRESS_INVALID']
])('connection failure %s persists category %s without retry', async (error, category) => {
  await streamProfile(false);
  vi.mocked(callLearningProvider).mockRejectedValueOnce(new ProviderError(error, 'synthetic failure'));
  const result = await ai(context(streamBody(`failure-${error}`)));
  expect(result).toMatchObject({ success: false, connectionError: category });
  const listed = await models(context({ action: 'list' }));
  expect(listed.data.models[0]).toMatchObject({ connectionStatus: 'failed', lastError: category });
  expect(callLearningProvider).toHaveBeenCalledOnce();
});

it('saves a credential-only connection for discovery but blocks selection and inference until a model is saved', async () => {
  const profile = {
    id: 'awaiting-model',
    provider: 'Custom',
    endpoint: 'https://provider.example/chat/completions',
    model: '',
    requiresModelSelection: true,
    apiKey: 'fixture-only-key'
  };
  expect((await models(context({ action: 'save', profile, shareConsent: true }))).success).toBe(true);
  const listed = await models(context({ action: 'list' }));
  expect(listed.data).toMatchObject({
    needsConnection: true,
    models: [{ id: profile.id, model: '', requiresModelSelection: true, configured: true }]
  });
  expect((await models(context({ action: 'preferences', preferences: { selectedModelId: profile.id } }))).success).toBe(
    false
  );
  expect(await ai(context({ ...streamBody('draft-must-not-call'), modelId: profile.id }))).toMatchObject({
    success: false,
    error: 'MODEL_SELECTION_REQUIRED'
  });
  expect(callLearningProvider).not.toHaveBeenCalled();
  expect(
    (
      await models(
        context({
          action: 'save',
          profile: { ...profile, apiKey: '', model: 'chosen-id', requiresModelSelection: false },
          shareConsent: true
        })
      )
    ).success
  ).toBe(true);
  expect((await models(context({ action: 'preferences', preferences: { selectedModelId: profile.id } }))).success).toBe(
    true
  );
});

describe('保存连接的最小工具往返门禁', () => {
  const profile = {
    id: 'probe_profile',
    model: 'probe_model',
    apiKey: 'synthetic_probe_key',
    endpoint: 'https://provider.example/chat'
  };
  it('保存时完成工具及JSON往返，两个回执均记账且不含学生数据', async () => {
    const result = await modelsHandler(context({ action: 'save', profile, shareConsent: true }));
    expect(result).toMatchObject({
      success: true,
      data: { connectionStatus: 'connected', capabilities: { tools: true, structured: true } }
    });
    const probes = vi.mocked(callCapabilityProvider).mock.calls;
    expect(probes).toHaveLength(2);
    expect(probes[0][0].capabilityProbe.stage).toBe('tool');
    expect(probes[1][0].capabilityProbe.stage).toBe('json');
    expect(probes[1][1].some((message: any) => message.role === 'tool')).toBe(true);
    const usage = await modelsHandler(context({ action: 'usage' }));
    expect(usage.data.calls).toHaveLength(2);
    const list = await modelsHandler(context({ action: 'list' }));
    expect(list.data.models[0].capabilityCheck).toMatchObject({ tools: true, structured: true, version: 1 });
    expect(list.data.models[0].connectionStatus).toBe('connected');
  });
  it.each(['missing_tool', 'wrong_nonce'])('不支持工具或未消费工具结果时拒绝教学：%s', async (mode) => {
    mock.probeMode = mode;
    const result = await modelsHandler(context({ action: 'save', profile, shareConsent: true }));
    expect(result.success).toBe(false);
    const inference = await ai(
      context({
        modelId: profile.id,
        requestId: 'blocked_probe',
        shareConsent: true,
        messages: [{ role: 'user', content: 'student private draft' }]
      })
    );
    expect(inference).toMatchObject({ success: false, error: 'TEACHING_CAPABILITY_REQUIRED' });
    expect(callLearningProvider).not.toHaveBeenCalled();
  });
});

it('局部批改只发送当前题干原答，不把整篇目标、建档与旧对话变成验答要求', async () => {
  await streamProfile(false);
  const request = {
    contract: 'kaoyan-writing-coach-v1',
    phase: 'feedback',
    target: 'card-c4',
    exam: 'english2',
    day: '2026-10-27',
    input: 'The event will be held on Friday afternoon.',
    task: '将活动将在周五下午举行译成英文',
    sources: [],
    foundation: 'PROFILE_WHOLE_EMAIL',
    knowledgeContract: 'writing-knowledge-binding-v1',
    dimensionContract: 'writing-dimensions-v1',
    feedbackVersion: 2
  };
  vi.mocked(callLearningProvider).mockImplementation(async (config: any) => ({
    ...streamCompleted,
    finishReason: 'tool_calls',
    coachFunctionResult: true,
    content: JSON.stringify({
      quoteVersion: config.writingOutput.schema.properties.quoteVersion.enum[0],
      message: '本题翻译准确',
      lines: [{ quoteId: 'q1', advice: '准确翻译本题时间' }],
      errors: [],
      strengths: [],
      uncertainties: [],
      phrases: [],
      dimensions: [{ name: '任务完成', score: 2, comment: '本题翻译已完成，不要求邮件', evidenceIds: ['q1'] }]
    })
  }));
  const body = {
    ...streamBody('scoped-card-feedback'),
    messages: [
      { role: 'assistant', content: 'OLD_CONVERSATION_EMAIL' },
      { role: 'user', content: request.input }
    ],
    learningContext: {
      owner: 'u1',
      goal: 'GLOBAL_WHOLE_EMAIL',
      question: { prompt: 'OTHER_QUESTION' },
      attempt: { answer: 'OLD_ANSWER' },
      studyProfile: { goal: 'OLD_PROFILE' },
      coach: request
    }
  };
  const result = await ai(context(body));
  expect(result.success).toBe(true);
  const messages = vi.mocked(callLearningProvider).mock.calls[0][1];
  expect(messages).toHaveLength(2);
  expect(messages[1]).toEqual({ role: 'user', content: request.input });
  expect(messages[0].content).not.toContain(request.input);
  const config = vi.mocked(callLearningProvider).mock.calls[0][0];
  const wire = buildLearningRequest(config, messages);
  expect(result.data.modelOrigin).toMatchObject({
    contract: 'learning-model-origin-v1',
    callId: body.requestId,
    modelId: body.modelId,
    requestBinding: body.requestBinding,
    source: 'byok',
    provider: config.provider,
    actualModel: config.model,
    configurationVersion: expect.stringMatching(/^[a-f0-9]{64}$/),
    upstreamVersion: null,
    inferencePolicy: config.writingOutput.inferencePolicy,
    schemaDigest: config.writingOutput.schemaDigest,
    sentParameters: { max_tokens: config.maxOutput }
  });
  const originText = JSON.stringify(result.data.modelOrigin);
  for (const forbidden of [request.input, config.apiKey, 'apiKey', 'endpoint', 'messages'])
    expect(originText).not.toContain(forbidden);
  expect((await ai(context(body))).data.modelOrigin).toEqual(result.data.modelOrigin);
  expect(wire.tools[0].function.parameters.description).toContain(request.input);
  expect(messages[0].content).not.toContain(JSON.stringify(config.writingOutput.schema));
  const serialized = JSON.stringify(messages);
  expect(serialized).toContain('活动将在周五下午举行');
  for (const marker of [
    'GLOBAL_WHOLE_EMAIL',
    'PROFILE_WHOLE_EMAIL',
    'OLD_CONVERSATION_EMAIL',
    'OTHER_QUESTION',
    'OLD_ANSWER',
    'OLD_PROFILE'
  ])
    expect(serialized).not.toContain(marker);
});

it('正式写作保留8192输出空间，非法档位保留失败收据且等待明确重试', async () => {
  await streamProfile(false);
  vi.stubEnv('YOZI_BUILD_CHANNEL', 'production');
  vi.resetModules();
  const { DEV_TEST } = await import('../../laf-backend/functions/_shared/build-channel');
  expect(DEV_TEST).toBe(false);
  const { default: productionAI } = await import('../../laf-backend/functions/proxy-ai');
  const request = {
    contract: 'kaoyan-writing-coach-v1',
    phase: 'essay',
    target: 'essay',
    exam: 'english2',
    day: '2026-10-26',
    input: 'I invite you to our reading event.',
    sources: [],
    dimensionContract: 'writing-dimensions-v1'
  };
  const { coachFixture } = await import('../fixtures/writing-coach.js');
  const invalid = coachFixture(request);
  invalid.dimensions[0].score = 9;
  Object.assign(invalid, { strengths: [], strengthEvidence: [] });
  const { kind: _kind, target: _target, ...wireInvalid } = invalid;
  wireInvalid.lines = wireInvalid.lines.map(({ original, ...line }: any) => ({
    advice: line.advice,
    quoteId: 'q1'
  }));
  wireInvalid.dimensions = wireInvalid.dimensions.map(({ evidence, ...dimension }: any) => ({
    ...dimension,
    evidenceIds: ['q1']
  }));
  for (const key of ['weaknesses', 'strengths', 'strengthEvidence', 'weaknessEvidence']) delete wireInvalid[key];
  wireInvalid.dimensionReviews = Object.fromEntries(
    ['grammar', 'collocation', 'expression', 'task'].map((key, index) => {
      const { name: _name, ...review } = wireInvalid.dimensions[index];
      return [key, review];
    })
  );
  delete wireInvalid.dimensions;
  wireInvalid.errors = [];
  wireInvalid.strengths = [];
  wireInvalid.uncertainties = [];
  wireInvalid.phrases = [];
  vi.mocked(callLearningProvider).mockImplementation(async (config: any) => ({
    ...streamCompleted,
    finishReason: 'tool_calls',
    coachFunctionResult: true,
    content: JSON.stringify({
      message: 'AI 评估',
      ...wireInvalid,
      quoteVersion: config.writingOutput.schema.properties.quoteVersion.enum[0]
    })
  }));
  const result = await productionAI(
    context({ ...streamBody('invalid-dimension-no-retry'), learningContext: { owner: 'u1', coach: request } })
  );
  expect(result).toMatchObject({
    success: false,
    error: 'COACH_INVALID',
    validationPath: 'root.dimensionReviews.grammar.score'
  });
  expect(callLearningProvider).toHaveBeenCalledOnce();
  expect(vi.mocked(callLearningProvider).mock.calls[0][0].maxOutput).toBe(8192);
  const ledger = [...mock.rows.values()].find((row: any) => row.user_id === 'u1' && Array.isArray(row.calls));
  expect(ledger.calls).toHaveLength(1);
  expect(ledger.calls[0]).toMatchObject({ status: 'failed', result: null });
});

it('Agnes 3.0 exact reviewed route costs zero only with supported, consistent usage', () => {
  const model = { model: 'agnes-3.0-flash', endpoint: 'https://apihub.agnes-ai.com/v1/chat/completions' } as any;
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-27T12:00:00Z'));
  try {
    const usage = { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 };
    expect(costFromUsage(usage, model)).toBe(0);
    expect(costFromUsage({ ...usage, prompt_tokens_details: { cached_tokens: 40 } }, model)).toBe(0);
    expect(
      costFromUsage({ ...usage, completion_tokens_details: { text_tokens: 30, reasoning_tokens: 20 } }, model)
    ).toBe(0);
    for (const bad of [
      null,
      { ...usage, total_tokens: 1 },
      { ...usage, prompt_tokens_details: { cached_tokens: 101 } },
      { ...usage, unknown_cost: 0 }
    ])
      expect(costFromUsage(bad, model)).toBeNull();
    expect(costFromUsage(usage, { ...model, model: 'agnes-3.0-pro' })).toBeNull();
    expect(costFromUsage(usage, { ...model, endpoint: 'https://example.test/v1/chat/completions' })).toBeNull();
    clock.mockReturnValue(Date.parse('2026-11-05T00:00:00Z'));
    expect(costFromUsage(usage, model)).toBeNull();
  } finally {
    clock.mockRestore();
  }
});

it.each(['calibrated', 'bad-then-good', 'bad-twice', 'verifier-fails', 'second-rate-limited', 'deepseek-json'])(
  'new cloze items pass a blind fill before they ship: %s',
  async (mode) => {
    await streamProfile(false);
    if (mode === 'deepseek-json') {
      vi.stubEnv('LEARNING_ALLOWED_ORIGINS', 'https://provider.example,https://api.deepseek.com');
      const saved = await models(
        context({
          action: 'save',
          shareConsent: true,
          profile: {
            id: 'fixture-stream',
            provider: 'DeepSeek',
            model: 'deepseek-v4-pro',
            endpoint: 'https://api.deepseek.com/chat/completions',
            apiKey: 'fixture-only-stream-key',
            stream: false
          }
        })
      );
      expect(saved.success).toBe(true);
    }
    const request = {
      contract: 'kaoyan-writing-coach-v1',
      phase: 'daily',
      target: 'daily',
      exam: 'english2',
      day: '2026-10-31',
      essayType: 'small',
      minutes: 25,
      sources: [],
      input: '安排今天的训练',
      exerciseContract: 'writing-exercises-v1',
      predictionContract: 'writing-prediction-check-v1'
    };
    const english = [
      'We raise money ___ children.',
      'Please donate books ___ the sale.',
      'The sale will be held ___ Monday.',
      'We hope you can join us.',
      'All the money will help the children.',
      null,
      null,
      'The charity sale, which is organized by our class, will be held in the school hall.'
    ];
    const chinese = { c6: '请带一些旧书来义卖。', c7: '活动将在周五下午举行。' } as any;
    const wire = {
      message: '开始练习',
      exercises: Object.fromEntries(
        english.map((text, i) => [
          `c${i + 1}`,
          {
            ...(text ? { english: text } : { chinese: chinese[`c${i + 1}`] }),
            sourceId: null,
            sourceQuote: null,
            sourcePage: null
          }
        ])
      ),
      writing: {
        prompt: 'Write your classmates an email about a charity sale. About 100 words.',
        patterns: [
          ['I am writing to invite you to {event}.'],
          ['The event will take place at {place} on {time}.'],
          ['We look forward to your participation.']
        ],
        sourceId: null,
        sourceQuote: null,
        sourcePage: null
      }
    };
    let generations = 0,
      calibrations = 0;
    vi.mocked(callLearningProvider).mockImplementation(async (config: any) => {
      const jsonReply = config.writingOutput?.inferencePolicy === 'native-coach-json-v1';
      const done = {
        ...streamCompleted,
        actualModel: config.model,
        finishReason: jsonReply ? 'stop' : 'tool_calls',
        coachFunctionResult: !jsonReply
      };
      if (config.writingOutput?.contract === 'writing-exercise-calibration-v3') {
        calibrations++;
        if (mode === 'second-rate-limited' && calibrations === 2)
          throw new ProviderError('RATE_LIMITED', 'synthetic calibration limit');
        if (mode === 'verifier-fails') return { ...done, content: '{"blanks":' };
        // 每套题独立盲填两次；返修前那套两次都判第二题无词可填。
        const bad = mode === 'bad-twice' || (mode === 'bad-then-good' && generations === 1);
        // 只看题干盲填：第二题没有单个单词能填对时整套拒收。
        return {
          ...done,
          content: JSON.stringify({
            blanks: [['for'], bad ? [] : ['for', 'to'], ['on']].map((accepted, i) => ({
              id: `b${i + 1}`,
              candidates: ['for', 'to', 'on', 'at'].map((word) => ({ word, fits: accepted.includes(word) })),
              infinitiveTo: false,
              rule: '固定搭配'
            }))
          })
        };
      }
      generations++;
      return { ...done, content: JSON.stringify(wire) };
    });
    const body = { ...streamBody('cloze-calibration-' + mode), learningContext: { owner: 'u1', coach: request } };
    const result = await ai(context(body));
    if (result.success) {
      expect(result.data.modelOrigin).toMatchObject({
        contract: 'learning-model-origin-v1',
        modelId: body.modelId,
        requestBinding: body.requestBinding,
        source: 'byok',
        upstreamVersion: null
      });
      expect(JSON.stringify(result.data.modelOrigin)).not.toContain('fixture-only-stream-key');
    }
    const calls = vi.mocked(callLearningProvider).mock.calls;
    const blanks = JSON.parse(
      calls.find(([config]: any) => config.writingOutput?.contract === 'writing-exercise-calibration-v3')![1][1].content
    ).blanks;
    expect(blanks.map((blank: any) => blank.task)).toEqual(english.slice(0, 3));
    if (mode === 'verifier-fails' || mode === 'second-rate-limited') {
      expect([generations, calibrations]).toEqual([1, 2]);
      expect(result).toMatchObject({ success: false, error: 'COACH_INVALID' });
      expect(result).not.toHaveProperty('data.coach');
      const ledger = [...mock.rows.values()].find((row: any) => row.user_id === 'u1' && row.calls);
      expect(ledger.calls).toHaveLength(1);
      expect(ledger.calls[0]).toMatchObject({
        status: 'failed',
        result: null,
        actualCost: null,
        costStatus: 'pending'
      });
      expect(ledger.calls[0].usage.calibration).toMatchObject(
        mode === 'verifier-fails'
          ? { prompt_tokens: 8, completion_tokens: 16 }
          : { prompt_tokens: 4, completion_tokens: 8 }
      );
      return;
    }
    if (mode === 'calibrated' || mode === 'deepseek-json') {
      expect([generations, calibrations]).toEqual([1, 2]);
      expect(result.success).toBe(true);
      expect(result.data.coach.cards).toHaveLength(8);
      expect(result.data.exerciseCalibration).toMatchObject(
        mode === 'calibrated' || mode === 'deepseek-json'
          ? {
              status: 'completed',
              checked: 3,
              passes: 2,
              blanks: [
                { cardId: 'c1', acceptedCount: 1 },
                { cardId: 'c2', acceptedCount: 2 },
                { cardId: 'c3', acceptedCount: 1 }
              ]
            }
          : {
              status: 'failed',
              checked: 3,
              failure: 'CALIBRATION_INVALID',
              attempts: 2,
              usage: { prompt_tokens: 8, completion_tokens: 16 }
            }
      );
      expect(JSON.stringify(result.data.exerciseCalibration)).not.toMatch(/"for"|"on"/);
      return;
    }
    expect([generations, calibrations]).toEqual([2, 4]);
    const repairMessages = calls.filter(
      ([config]: any) => config.writingOutput?.contract !== 'writing-exercise-calibration-v3'
    )[1][1];
    expect(repairMessages[0].content).toContain('"path":"exercises.c2"');
    expect(repairMessages[0].content).toContain('搭配填空没有单个英文单词能填对');
    const ledger = [...mock.rows.values()].find((row: any) => row.user_id === 'u1' && row.calls);
    expect(ledger.calls[1].id).toBe(body.requestId + ':repair1');
    if (mode === 'bad-then-good')
      expect(result).toMatchObject({
        success: true,
        data: { repairRequestId: body.requestId + ':repair1', exerciseCalibration: { status: 'completed' } }
      });
    else {
      expect(result).toMatchObject({ success: false, repairExhausted: true, status: 'failed' });
      expect(result).not.toHaveProperty('data.coach');
    }
  }
);

it.each(['success', 'missing-tool', 'invalid-again', 'rate-limited', 'secret-echo'])(
  'mixed diagnostic bounded repair: %s preserves strict gate, budget and parent binding',
  async (mode) => {
    await streamProfile(false);
    let count = 0,
      verifications = 0;
    vi.mocked(callLearningProvider).mockImplementation(async (config: any) => {
      if (config.writingOutput?.contract === 'writing-error-verification-v2') {
        verifications++;
        return {
          ...streamCompleted,
          finishReason: 'tool_calls',
          coachFunctionResult: true,
          // 唯一初评错误在填空；所有句法题仍独立盲析，避免初评漏判。
          content: JSON.stringify(mixedDiagnosticVerification())
        };
      }
      count++;
      if (count === 1 && mode === 'missing-tool')
        throw Object.assign(new ProviderError('COACH_INVALID', '模型未按本次教学格式返回，原答已保留'), {
          path: 'tools',
          observed: { actualModel: config.model, usage: streamCompleted.usage }
        });
      if (count === 2 && mode === 'rate-limited') throw new ProviderError('RATE_LIMITED', 'synthetic limit');
      const wire = mixedDiagnosticReply(config);
      if (count === 1 || mode === 'invalid-again') {
        wire.dimensionReviews.grammar = { score: 1, comment: '重复归因', evidenceIds: ['q2'] } as any;
      }
      if (mode === 'secret-echo') wire.message = 'fixture-only-stream-key';
      return {
        ...streamCompleted,
        finishReason: 'tool_calls',
        coachFunctionResult: true,
        content: JSON.stringify(wire)
      };
    });
    const body = {
      ...streamBody('mixed-repair-' + mode),
      learningContext: { owner: 'u1', coach: mixedDiagnosticRequest() }
    };
    const result = await ai(context(body));
    const ledger = [...mock.rows.values()].find((row: any) => row.user_id === 'u1' && row.calls);
    if (mode === 'secret-echo') {
      expect(result.success).toBe(false);
      expect(callLearningProvider).toHaveBeenCalledOnce();
      expect(JSON.stringify(ledger)).not.toContain('fixture-only-stream-key');
      return;
    }
    expect(count).toBe(2);
    expect(verifications).toBe(mode === 'success' || mode === 'missing-tool' ? 1 : 0);
    expect(callLearningProvider).toHaveBeenCalledTimes(2 + verifications);
    const repairMessages = vi.mocked(callLearningProvider).mock.calls[1][1];
    expect(repairMessages[0].content).toContain(
      mode === 'missing-tool' ? '模型未按本次教学格式返回，原答已保留' : '模型响应未通过完整字段合同'
    );
    if (mode !== 'missing-tool')
      expect(repairMessages[0].content).toContain('"expected":{"type":"object","keys":["comment"]}');
    if (mode !== 'missing-tool') expect(repairMessages[0].content).toContain('"dimension":"语法","quoteIds":["q2"]');
    expect(ledger.calls).toHaveLength(2);
    expect(ledger.calls[0]).toMatchObject({ status: 'failed', result: null, usage: expect.any(Object) });
    expect(ledger.calls[1].repairOf).toBe(body.requestId);
    expect(ledger.calls[1].id).toBe(body.requestId + ':repair1');
    if (mode === 'success' || mode === 'missing-tool') {
      expect(result).toMatchObject({
        success: true,
        data: { requestId: body.requestId, repairRequestId: body.requestId + ':repair1' }
      });
      expect(ledger.calls[1]).toMatchObject({ status: 'completed', usage: expect.any(Object) });
      expect(result.data.coachVerification).toMatchObject({ status: 'completed', checked: 3, removed: 0 });
      expect(result.data.coach.dimensions.find((d: any) => d.name === '搭配').score).toBe(1);
      expect((await ai(context(body))).success).toBe(true);
      expect(callLearningProvider).toHaveBeenCalledTimes(3);
    } else {
      expect(result).toMatchObject({ success: false, repairExhausted: true, status: 'failed' });
      expect(result).not.toHaveProperty('data.coach');
      expect(ledger.calls[1]).toMatchObject({ status: 'failed', result: null });
    }
  }
);

it.each(['timeout', 'bad-json'])('批改复核失败不保存初评或自动追加调用，原答和未知费用保留：%s', async (mode) => {
  await streamProfile(false);
  let checks = 0;
  vi.mocked(callLearningProvider).mockImplementation(async (config: any) => {
    if (config.writingOutput?.contract === 'writing-error-verification-v2') {
      checks++;
      if (mode === 'timeout') throw new ProviderError('TIMEOUT', 'synthetic verification timeout');
      return { ...streamCompleted, content: '{"blanks":' };
    }
    const wire = mixedDiagnosticReply(config);
    wire.errors.push({
      label: '无据的提纲缺项',
      quoteId: 'q5',
      dimension: '任务完成',
      errorText: null,
      replacement: null,
      rule: '错误地要求学生写出完整邮件称呼'
    });
    return { ...streamCompleted, finishReason: 'tool_calls', coachFunctionResult: true, content: JSON.stringify(wire) };
  });
  const body = {
    ...streamBody('verification-failed-' + mode),
    learningContext: { owner: 'u1', coach: mixedDiagnosticRequest() }
  };
  const result = await ai(context(body));
  expect(result).toMatchObject({ success: false, error: 'COACH_INVALID' });
  expect(result).not.toHaveProperty('data.coach');
  expect(result).not.toHaveProperty('repairRequestId');
  expect(checks).toBe(mode === 'timeout' ? 1 : 2);
  const ledger = [...mock.rows.values()].find((row: any) => row.user_id === 'u1' && row.calls);
  expect(ledger.calls).toHaveLength(1);
  expect(ledger.calls[0]).toMatchObject({
    status: 'failed',
    result: null,
    actualCost: null,
    costStatus: 'pending',
    usage: { prompt_tokens: 4, completion_tokens: 8 }
  });
  if (mode === 'bad-json')
    expect(ledger.calls[0].usage.verification).toMatchObject({ prompt_tokens: 8, completion_tokens: 16 });
  const calls = vi.mocked(callLearningProvider).mock.calls.length;
  await ai(context(body));
  expect(callLearningProvider).toHaveBeenCalledTimes(calls);
});

it.each(['completed', 'timeout', 'bad-json', 'unfinished', 'groq-verified'])(
  '已验证原生批改仍须复核且正常结束，失败不采用初评：%s',
  async (mode) => {
    const groq = mode === 'groq-verified';
    vi.stubEnv('LEARNING_ALLOWED_ORIGINS', 'https://provider.example,https://api.deepseek.com,https://api.groq.com');
    await streamProfile(false, 'u1', 'fixture-only-stream-key', {
      model: groq ? 'openai/gpt-oss-120b' : 'deepseek-v4-pro',
      endpoint: groq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.deepseek.com/chat/completions'
    });
    let checks = 0;
    vi.mocked(callLearningProvider).mockImplementation(async (config: any) => {
      if (config.writingOutput?.contract === 'writing-error-verification-v2') {
        checks++;
        if (mode === 'timeout') throw new ProviderError('TIMEOUT', 'synthetic timeout');
        return {
          ...streamCompleted,
          actualModel: config.model,
          content: mode === 'bad-json' ? '{"blanks":' : JSON.stringify(mixedDiagnosticVerification())
        };
      }
      expect(config.writingOutput.inferencePolicy).toBe(groq ? 'native-coach-tools-v1' : 'native-coach-json-v1');
      if (groq) {
        expect(config.plainCoachRequest).toBeUndefined();
        expect(config.writingOutput.omitResponseFormatForRequest).toBeUndefined();
      }
      return {
        ...streamCompleted,
        actualModel: config.model,
        finishReason: mode === 'unfinished' ? 'length' : groq ? 'tool_calls' : 'stop',
        ...(groq ? { coachFunctionResult: true } : {}),
        content: JSON.stringify(mixedDiagnosticReply(config))
      };
    });
    const body = {
      ...streamBody('deepseek-json-feedback-' + mode),
      learningContext: { owner: 'u1', coach: mixedDiagnosticRequest() }
    };
    const result = await ai(context(body));
    const ledger = [...mock.rows.values()].find((row: any) => row.user_id === 'u1' && row.calls);
    expect(checks).toBe(mode === 'unfinished' ? 0 : mode === 'bad-json' ? 2 : 1);
    expect(ledger.calls).toHaveLength(mode === 'unfinished' ? 2 : 1);
    if (mode === 'completed' || groq) {
      expect(result).toMatchObject({ success: true, data: { coachVerification: { status: 'completed', checked: 3 } } });
      expect(result.data.coach.dimensions.find((d: any) => d.name === '搭配').score).toBe(1);
    } else {
      expect(result.success).toBe(false);
      expect(result).not.toHaveProperty('data.coach');
      expect(ledger.calls[0]).toMatchObject({
        status: 'failed',
        result: null,
        actualCost: null,
        costStatus: 'pending'
      });
    }
  }
);

it.each([70000, 109000, 113000])('混合摸底初评可借用总额度，但复核不能越过120秒：%s', async (elapsed) => {
  vi.stubEnv('LEARNING_ALLOWED_ORIGINS', 'https://provider.example,https://api.deepseek.com');
  await streamProfile(false, 'u1', 'fixture-only-stream-key', {
    model: 'deepseek-v4-pro',
    endpoint: 'https://api.deepseek.com/chat/completions'
  });
  const started = Date.now();
  let offset = 0;
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => started + offset);
  try {
    vi.mocked(callLearningProvider).mockImplementation(async (config: any) => {
      if (config.writingOutput?.contract === 'writing-error-verification-v2') {
        expect(config.timeoutMs).toBe(120000 - elapsed);
        return {
          ...streamCompleted,
          actualModel: config.model,
          content: JSON.stringify(mixedDiagnosticVerification())
        };
      }
      expect(config.timeoutMs).toBe(110000);
      offset = elapsed;
      return {
        ...streamCompleted,
        actualModel: config.model,
        finishReason: 'stop',
        content: JSON.stringify(mixedDiagnosticReply(config))
      };
    });
    const body = {
      ...streamBody('mixed-shared-deadline-' + elapsed),
      learningContext: { owner: 'u1', coach: mixedDiagnosticRequest() }
    };
    const result = await ai(context(body));
    expect(callLearningProvider).toHaveBeenCalledTimes(elapsed <= 112000 ? 2 : 1);
    if (elapsed <= 112000) expect(result).toMatchObject({ success: true });
    else {
      expect(result.success).toBe(false);
      expect(result).not.toHaveProperty('data.coach');
      const ledger = [...mock.rows.values()].find((row: any) => row.user_id === 'u1' && row.calls);
      expect(ledger.calls[0]).toMatchObject({
        status: 'failed',
        result: null,
        actualCost: null,
        costStatus: 'pending'
      });
    }
  } finally {
    clock.mockRestore();
  }
});

describe('灵感建议只用自带 API、独立小额度，回复先校验再显示', () => {
  const ideasContext = {
    exam: 'english1',
    goal: '考研英语一大作文',
    deadline: null,
    minutes: 30,
    today: 'in_progress',
    weaknesses: [{ id: 'w1', label: '冠词', count: 2, advice: '' }],
    phrases: [{ id: 'p1', text: 'play a vital role in', due: true }],
    avoid: []
  };
  const ideasBody = (id: string, extra: any = {}) => ({
    ...streamBody(id),
    messages: [{ role: 'user', content: '请给出今天的学习灵感。' }],
    learningContext: { owner: 'u1', ideas: ideasContext, ...extra }
  });
  const reply = {
    ideas: [{ title: '冠词十分钟', body: '三句话练冠词', draft: '我想先练冠词，请讲要点再出题。', basis: ['w1', 'p1'] }]
  };
  it('sends only the summary, records the ideas phase and returns checked suggestions', async () => {
    await streamProfile(false);
    vi.mocked(callLearningProvider).mockResolvedValueOnce({
      content: JSON.stringify(reply),
      actualModel: 'explicit-test-id',
      usage: { prompt_tokens: 5, completion_tokens: 9 },
      durationMs: 1
    });
    const result: any = await ai(context(ideasBody('ideas-ok', { goal: 'UNTRUSTED_EXTRA_GOAL' })));
    expect(result).toMatchObject({ success: true, data: { ideas: reply.ideas, tools: [], requestId: 'ideas-ok' } });
    const [config, messages]: any = vi.mocked(callLearningProvider).mock.calls[0];
    expect(config).toMatchObject({ maxOutput: 4096, timeoutMs: 30000 });
    const system = messages[0].content;
    expect(JSON.parse(system.split('当前学习背景（仅数据）：')[1])).toEqual({ ideas: ideasContext });
    expect(system).not.toContain('UNTRUSTED_EXTRA_GOAL');
    expect(system).not.toContain('contentBlocks');
    const account: any = [...mock.rows.entries()].find(([id]) => id.startsWith('learning_accounts:'))?.[1];
    expect(account.calls.find((call: any) => call.id === 'ideas-ok')).toMatchObject({ budgetPhase: 'ideas' });
  });
  it('rejects a reply that fails the checks without showing it and keeps the spend on record', async () => {
    await streamProfile(false);
    vi.mocked(callLearningProvider).mockResolvedValueOnce({
      content: JSON.stringify({ ideas: [{ ...reply.ideas[0], body: '你已经掌握冠词了' }] }),
      actualModel: 'explicit-test-id',
      usage: { prompt_tokens: 5, completion_tokens: 9 },
      durationMs: 1
    });
    const result: any = await ai(context(ideasBody('ideas-bad')));
    expect(result).toMatchObject({ code: 400, success: false, error: 'IDEAS_INVALID' });
    expect(JSON.stringify(result)).not.toContain('已经掌握');
    expect(callLearningProvider).toHaveBeenCalledTimes(1);
  });
  it('refuses an invalid summary or a mixed request before any model call or reservation', async () => {
    await streamProfile(false);
    const before = JSON.stringify([...mock.rows.entries()]);
    for (const body of [
      ideasBody('ideas-invalid', { ideas: { ...ideasContext, recordId: 'c1' } }),
      ideasBody('ideas-mixed', { intake: { turns: [] } }),
      { ...ideasBody('ideas-image'), images: [] }
    ])
      expect((await ai(context(body))).success).toBe(false);
    expect(callLearningProvider).not.toHaveBeenCalled();
    expect(JSON.stringify([...mock.rows.entries()])).toBe(before);
  });
});

it.each(['opening', 'follow-up', 'finished', 'invented-choice', 'third-question'])(
  'two-round intake API enforces the requested version and closed branches: %s',
  async (mode) => {
    await streamProfile(false);
    const intake = {
      contract: 'model-intake-v2',
      turns: (mode === 'opening'
        ? []
        : mode === 'finished' || mode === 'third-question'
          ? ['考研', '其他科目']
          : ['考研']
      ).map((answer) => ({ question: '合成提问', answer }))
    };
    const finished = mode === 'finished' || mode === 'third-question';
    const output = {
      message: mode === 'opening' ? '你在准备什么？' : finished ? '方向尚未确定，可稍后重新选择。' : '想先准备哪一科？',
      intake: { options: finished ? [] : intakeChoicesFor(intake), input: mode === 'opening', profile: null },
      question: null,
      tools: []
    };
    if (mode === 'invented-choice')
      output.intake.options = [
        { value: 'execute-task', label: '自动建立计划' },
        { value: 'skip', label: '尚未确定' }
      ];
    if (mode === 'third-question')
      output.intake.options = [
        { value: 'again', label: '再问一次' },
        { value: 'skip', label: '尚未确定' }
      ];
    vi.mocked(callLearningProvider).mockImplementation(async () => ({
      ...streamCompleted,
      content: JSON.stringify(output)
    }));
    const body = { ...streamBody('two-round-' + mode), learningContext: { owner: 'u1', intake } };
    const result = await ai(context(body));
    expect(result.success).toBe(!['invented-choice', 'third-question'].includes(mode));
    expect(callLearningProvider).toHaveBeenCalledTimes(1);
    if (result.success) expect(result.data.intake).toEqual(output.intake);
    else expect(result.error).toBe('INTAKE_INVALID');
    if (mode === 'opening') {
      const listed = await models(context({ action: 'list' }));
      expect(listed.data.intakeContract).toBe('model-intake-v1');
      expect(listed.data.intakeContracts).toEqual(['model-intake-v1', 'model-intake-v2']);
      expect(listed.data.coachMethods).toEqual(['shenlun-writing-method-v2', 'shenlun-writing-method-v1']);
    }
  }
);

it.each(['supported', 'supported-v2', 'unknown-method'])(
  'versioned subject coaching preserves actual model provenance without English contracts: %s',
  async (mode) => {
    await streamProfile(false);
    const request = {
      contract: 'kaoyan-writing-coach-v1',
      methodContract:
        mode === 'supported-v2'
          ? 'shenlun-writing-method-v2'
          : mode === 'supported'
            ? 'shenlun-writing-method-v1'
            : 'unknown-method',
      exam: 'shenlun',
      phase: 'feedback',
      target: 'card-c1',
      day: '2026-11-02',
      input: '部分居民在工作日白天办理不便。',
      task: '依据资料概括现有办事困难。',
      sources: [
        {
          id: 'synthetic-material:1',
          name: '合成材料',
          page: 1,
          content: '社区窗口只在工作日白天开放，部分上班居民办理不便，拟增加周六预约时段。'
        }
      ]
    };
    vi.mocked(callLearningProvider).mockImplementation(async (config: any) => ({
      ...streamCompleted,
      actualModel: config.model,
      content: JSON.stringify({
        message: '来核对材料依据。',
        question: null,
        tools: [],
        coach: {
          kind: 'feedback',
          target: request.target,
          lines: [
            { original: request.input, advice: '原答概括了材料中的办理不便。', rewrite: '保留原答，不补造实施成效。' }
          ],
          weaknesses: [],
          weaknessEvidence: [],
          strengths: [],
          phrases: [],
          dimensions: ['材料依据', '要点覆盖', '逻辑结构', '文字表达'].map((name) => ({
            name,
            comment: '仅为本次AI观察，不给官方分数。'
          }))
        }
      })
    }));
    const body = { ...streamBody('subject-method-' + mode), learningContext: { owner: 'u1', coach: request } };
    const result = await ai(context(body));
    if (mode === 'unknown-method') {
      expect(result.success).toBe(false);
      expect(callLearningProvider).not.toHaveBeenCalled();
      return;
    }
    expect(result.success).toBe(true);
    expect(callLearningProvider).toHaveBeenCalledTimes(1);
    const config = vi.mocked(callLearningProvider).mock.calls[0][0];
    expect(config.writingOutput).toBeUndefined();
    expect(result.data.modelOrigin).toMatchObject({
      contract: 'learning-model-origin-prompt-v1',
      source: 'byok',
      actualModel: config.model,
      inferencePolicy: 'subject-coach-prompt-v1',
      outputContract: request.methodContract,
      schemaDigest: null,
      callId: body.requestId,
      modelId: body.modelId,
      requestBinding: body.requestBinding,
      configurationVersion: expect.stringMatching(/^[a-f0-9]{64}$/),
      upstreamVersion: null
    });
    expect(result.data.coach.dimensions.every((item: any) => item.score === undefined)).toBe(true);
    for (const hidden of [request.input, request.sources[0].content, 'fixture-only-stream-key', 'endpoint'])
      expect(JSON.stringify(result.data.modelOrigin)).not.toContain(hidden);
    expect((await ai(context(body))).data.modelOrigin).toEqual(result.data.modelOrigin);
    expect(callLearningProvider).toHaveBeenCalledTimes(1);
  }
);

it.each(['clean', 'secret-in-context'])(
  'short subject source context preserves the post-parse secret guard: %s',
  async (mode) => {
    const sentinel = 'fixture-only-stream-key';
    await streamProfile(false, 'u1', sentinel);
    const quote = '社区窗口只在工作日白天开放';
    const source =
      quote +
      '，部分居民办理不便，拟增加周六预约时段。' +
      (mode === 'secret-in-context' ? `合成凭据：${sentinel}` : '尚无实施效果数据。');
    const request = {
      contract: 'kaoyan-writing-coach-v1',
      methodContract: 'shenlun-writing-method-v1',
      exam: 'shenlun',
      phase: 'diagnostic',
      target: 'diagnostic',
      day: '2026-11-02',
      input: '开始资料摸底',
      task: '依据资料进行五项摸底',
      sources: [{ id: 'synthetic-context', name: '合成材料', page: 1, content: source }]
    };
    vi.mocked(callLearningProvider).mockImplementation(async (config: any) => ({
      ...streamCompleted,
      actualModel: config.model,
      content: JSON.stringify({
        message: '先读材料。',
        question: null,
        tools: [],
        coach: {
          kind: 'diagnostic',
          cards: Array.from({ length: 5 }, (_, index) => ({
            id: `d${index + 1}`,
            kind: 'diagnostic',
            title: `合成题${index + 1}`,
            prompt: '依据材料说明窗口目前的开放时间。',
            example: '',
            sourceId: 'synthetic-context',
            sourceQuote: quote,
            sourcePage: 1
          }))
        }
      })
    }));
    const body = { ...streamBody('short-subject-context-' + mode), learningContext: { owner: 'u1', coach: request } };
    const result = await ai(context(body));
    expect(callLearningProvider).toHaveBeenCalledTimes(1);
    if (mode === 'clean') {
      expect(result.success).toBe(true);
      expect(result.data.coach.cards.every((card: any) => card.source.quote === source && !card.source.verified)).toBe(
        true
      );
    } else {
      expect(result).toMatchObject({ success: false, error: 'COACH_INVALID', validationPath: 'raw' });
      expect(result).not.toHaveProperty('data');
      const usage = await models(context({ action: 'usage' }));
      expect(usage.data.calls[0]).toMatchObject({ status: 'failed', actualCost: null, costStatus: 'pending' });
      expect(JSON.stringify([result, usage.data.calls])).not.toContain(sentinel);
    }
  }
);
