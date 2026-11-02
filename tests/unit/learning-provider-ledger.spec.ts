import { describe, it, expect, vi } from 'vitest';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { Resolver } from 'node:dns/promises';
import { parseCoachModelOutput } from '../../laf-backend/functions/_shared/learning-writing-coach.js';
import {
  newAccount,
  reserveCall,
  settleCall,
  weekKey,
  encryptModelKey,
  decryptModelKey,
  mutateAccount,
  recoverStaleReservations,
  cancelCall,
  eraseModelResultCache,
  boundedResponseDiagnostics
} from '../../laf-backend/functions/_shared/learning-account';
import {
  validateCloudEndpoint,
  isPublicAddress,
  resolveCloudEndpoint,
  parseLearningOutput,
  callLearningProvider
} from '../../laf-backend/functions/_shared/ai-providers/learning-provider';
const funded = () => {
  const a = newAccount('u1');
  a.entitlement.weeklyUnits = 2;
  a.cost.hardLimit = 2;
  return a;
};
const input = (id: string, source = 'platform') => ({
  id,
  fingerprint: id,
  source,
  maxCost: 1,
  units: 1,
  model: 'explicit-model',
  provider: 'test'
});
describe('模型费用和权益分别记账', () => {
  it('隐私删除只清除教学正文并取消在途结果，不撤销已消费权益或供应商成本', () => {
    let account = reserveCall(funded(), input('done')).account;
    account = settleCall(account, 'done', { success: true, actualCost: 0.4, result: { message: '私有材料' } }).account;
    account = reserveCall(account, input('pending')).account;
    const before = structuredClone(account);
    const erased = eraseModelResultCache(account);
    expect(account).toEqual(before);
    expect(erased.erasedResults).toBe(1);
    expect(erased.pendingRequests).toEqual(['pending']);
    expect(erased.account.calls[0]).toMatchObject({ status: 'completed', result: null, entitlementCharged: 1 });
    expect(erased.account.entitlement).toEqual(before.entitlement);
    expect(erased.account.cost).toEqual(before.cost);
    expect(eraseModelResultCache(erased.account).reused).toBe(true);
    const settled = settleCall(erased.account, 'pending', {
      success: true,
      actualCost: 0.2,
      result: { message: '删除后不能回填' }
    }).account;
    expect(settled.calls[1]).toMatchObject({
      status: 'cancelled',
      result: null,
      entitlementCharged: 0,
      actualCost: 0.2
    });
    expect(settled.cost.spent).toBeCloseTo(0.6);
    expect(settled.entitlement.spent).toBe(1);
    expect(settleCall(settled, 'pending', { success: true, actualCost: 0.2 }).reused).toBe(true);
    expect(reserveCall(settled, input('done')).call.result).toBeNull();
  });
  it('自带API并发不能越过服务端调用上限，满额重试复用原请求且不扣平台权益', async () => {
    let account: any = newAccount('u1');
    const db = {
      collection: () => ({
        where: (query: any) => ({
          get: async () => ({ data: [structuredClone(account)] }),
          update: async (next: any) => {
            if (account.revision !== query.revision) return { updated: 0 };
            account = { ...account, ...structuredClone(next) };
            return { updated: 1 };
          }
        }),
        add: async () => {}
      })
    };
    const results = await Promise.allSettled(
      ['a', 'b', 'c', 'd'].map((id) =>
        mutateAccount(db, 'u1', (a) => reserveCall(a, { ...input(id, 'byok'), callLimit: 2 }))
      )
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(account.calls).toHaveLength(2);
    expect(reserveCall(account, { ...input(account.calls[0].id, 'byok'), callLimit: 2 }).reused).toBe(true);
    expect(() => reserveCall(account, { ...input('extra', 'byok'), callLimit: 2 })).toThrow();
    expect(() => reserveCall(newAccount('u1'), { ...input('invalid', 'byok'), callLimit: 0 })).toThrow();
    expect(account.entitlement).toMatchObject({ spent: 0, reserved: 0 });
  });
  it('调用前取消阻止后续预留；在途取消保留真实成本并只释放一次权益', () => {
    const early = cancelCall(funded(), 'early').account;
    expect(() => reserveCall(early, input('early'))).toThrow('调用前取消');
    let a = reserveCall(funded(), input('inflight')).account;
    a = cancelCall(a, 'inflight').account;
    expect(a.cost.reserved).toBe(1);
    a = settleCall(a, 'inflight', { success: true, actualCost: 0.6, result: { message: '不应执行' } }).account;
    expect(a.calls[0]).toMatchObject({ status: 'cancelled', result: null, actualCost: 0.6 });
    expect(a.entitlement).toMatchObject({ spent: 0, reserved: 0 });
    expect(a.cost.spent).toBe(0.6);
    expect(settleCall(a, 'inflight', { success: true, actualCost: 0.6 }).reused).toBe(true);
  });
  it('断线预留超时后权益释放一次，供应商未知成本保留待结算', () => {
    const now = Date.now();
    const a = reserveCall(funded(), input('stale'), now).account;
    const recovered = recoverStaleReservations(a, now + 180000).account;
    expect(recovered.entitlement.reserved).toBe(0);
    expect(recovered.cost.reserved).toBe(1);
    expect(recovered.cost.pending).toBe(1);
    expect(recoverStaleReservations(recovered, now + 240000).reused).toBe(true);
  });
  it('平台预留、取消、退款、结算、重试只处理一次', () => {
    let { account } = reserveCall(funded(), input('r1'));
    expect(account.entitlement.reserved).toBe(1);
    expect(account.cost.reserved).toBe(1);
    expect(reserveCall(account, input('r1')).reused).toBe(true);
    expect(() => reserveCall(account, { ...input('r1'), fingerprint: 'different' })).toThrow('不同输入');
    account = settleCall(account, 'r1', { success: false, cancelled: true, actualCost: 0.4 }).account;
    expect(account.entitlement.spent).toBe(0);
    expect(account.cost.spent).toBe(0.4);
    expect(settleCall(account, 'r1', { success: false, actualCost: 0 }).reused).toBe(true);
    expect(account.cost.reserved).toBe(0);
  });
  it('自带 API 不扣平台权益；未知成本保留预留，不能当零', () => {
    const byo = reserveCall(newAccount('u1'), input('byo', 'byok')).account;
    const completed = settleCall(byo, 'byo', { success: true, actualCost: null }).account;
    expect(completed.entitlement.spent).toBe(0);
    expect(completed.cost.reserved).toBe(0);
    const a = settleCall(reserveCall(funded(), input('r1')).account, 'r1', {
      success: false,
      actualCost: null
    }).account;
    expect(a.cost.reserved).toBe(1);
    expect(a.cost.pending).toBe(1);
    expect(a.entitlement.reserved).toBe(0);
  });
  it('周边界按明确时区，旧周在途结算不扣新周权益', () => {
    const sunday = Date.parse('2026-09-28T02:00:00Z');
    expect(weekKey(sunday, 'America/Los_Angeles')).toBe('2026-09-21');
    expect(weekKey(sunday, 'Asia/Shanghai')).toBe('2026-09-28');
    let a = funded();
    a.cost.hardLimit = 10;
    a = reserveCall(a, input('old'), Date.parse('2026-09-27T10:00:00Z')).account;
    a = reserveCall(a, input('new'), Date.parse('2026-09-28T10:00:00Z')).account;
    a = settleCall(a, 'old', { success: true, actualCost: 0.4 }).account;
    expect(a.entitlement.spent).toBe(0);
    expect(a.entitlement.reserved).toBe(1);
  });
  it('并发 CAS 不超预算，不依赖内存锁或第二个数据库写入', async () => {
    let account: any = funded();
    const db = {
      collection: () => ({
        where: (query: any) => ({
          get: async () => ({ data: [structuredClone(account)] }),
          update: async (next: any) => {
            if (account.revision !== query.revision) return { updated: 0 };
            account = { ...account, ...structuredClone(next) };
            return { updated: 1 };
          }
        }),
        add: async () => {}
      })
    };
    const result = await Promise.allSettled(
      ['a', 'b', 'c', 'd'].map((id) => mutateAccount(db, 'u1', (a) => reserveCall(a, input(id))))
    );
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(account.cost.reserved).toBe(2);
    expect(account.entitlement.reserved).toBe(2);
  });
  it('密钥按用户和配置绑定，加密内容不能被另一用户解密', () => {
    const secret = 'a'.repeat(64);
    const encrypted = encryptModelKey('test-only-key', 'u1', 'p1', secret);
    expect(JSON.stringify(encrypted)).not.toContain('test-only-key');
    expect(decryptModelKey(encrypted, 'u1', 'p1', secret)).toBe('test-only-key');
    expect(() => decryptModelKey(encrypted, 'u2', 'p1', secret)).toThrow();
    expect(() => encryptModelKey('test', 'u1', 'p1', '')).toThrow('尚未配置');
  });
});
describe('端点、结构化输出和工具安全', () => {
  const origins = ['https://model.example'];
  it.each([
    'http://model.example/chat',
    'https://127.0.0.1/chat',
    'https://model.example.evil/chat',
    'https://user:pass@model.example/chat',
    'https://model.example:8443/chat',
    'https://model.example/chat?redirect=http://169.254.169.254'
  ])('拒绝端点绕过 %s', (url) => {
    expect(() => validateCloudEndpoint(url, origins)).toThrow();
  });
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '169.254.169.254',
    '100.64.0.1',
    '172.16.0.1',
    '192.168.0.1',
    '::1',
    '::ffff:127.0.0.1',
    'fd00::1',
    '64:ff9b::7f00:1',
    '2002:0808:0808::1',
    '2001:0000:0000:0000:0000:0000:0000:0001',
    '2001:0db8:0000:0000:0000:0000:0000:0001'
  ])('禁止特殊地址 %s', (ip) => expect(isPublicAddress(ip)).toBe(false));
  it('DNS 混合地址阻塞，避免重绑定；公网地址可固定', async () => {
    await expect(
      resolveCloudEndpoint(
        'https://model.example/chat',
        origins,
        async () =>
          [
            { address: '8.8.8.8', family: 4 },
            { address: '10.0.0.1', family: 4 }
          ] as any
      )
    ).rejects.toThrow('禁止');
    const result = await resolveCloudEndpoint(
      'https://model.example/chat',
      origins,
      async () => [{ address: '8.8.8.8', family: 4 }] as any
    );
    expect(result.address.address).toBe('8.8.8.8');
  });
  it('非法结构和未授权工具拒绝；模型不能声明生成题已核验', () => {
    expect(() => parseLearningOutput('{"message":"hi","tools":[{"name":"shell","arguments":{}}]}')).toThrow('未授权');
    expect(() => parseLearningOutput('{"message":12}')).toThrow('结构');
    const result = parseLearningOutput(
      '{"message":"请作答","question":{"prompt":"2+2?","verified":true,"answer":"4"},"tools":[]}'
    );
    expect(result.question.validation).toBeNull();
    expect(result.question.source.verified).toBe(false);
  });
});

it('malformed coach JSON retains its failure coordinate without retaining the reply', () => {
  const raw = 'private malformed model fixture';
  let failure: any;
  try {
    parseCoachModelOutput(raw, {});
  } catch (error) {
    failure = error;
  }
  expect(failure).toMatchObject({ code: 'COACH_INVALID', path: 'raw' });
  const reserved = reserveCall(funded(), input('invalid-json'));
  const settled = settleCall(reserved.account, 'invalid-json', {
    success: false,
    actualCost: null,
    errorCode: failure.code,
    validationPath: failure.path
  });
  expect(settled.call).toMatchObject({ validationPath: 'raw', costStatus: 'pending', actualCost: null });
  expect(JSON.stringify(settled.account)).not.toContain(raw);
});

it('validation diagnostics retain only schema fields and are erased without changing cost facts', () => {
  const reserved = reserveCall(funded(), input('invalid-path'));
  const settled = settleCall(reserved.account, 'invalid-path', {
    success: false,
    actualCost: null,
    errorCode: 'COACH_INVALID',
    validationPath: 'cards[2].private_fixture_key'
  });
  expect(settled.call).toMatchObject({ validationPath: 'cards[2].unknown', costStatus: 'pending', actualCost: null });
  expect(JSON.stringify(settled.account)).not.toContain('private_fixture_key');
  const erased = eraseModelResultCache(settled.account);
  expect(erased.account.calls[0]).not.toHaveProperty('validationPath');
  expect(erased.account.cost).toEqual(settled.account.cost);
  expect(erased.account.entitlement).toEqual(settled.account.entitlement);
});

it('received nonstream failures keep shape, usage and duration without reply or reasoning text', async () => {
  const priorResolver = process.env.LEARNING_DNS_SERVERS;
  vi.stubEnv('LEARNING_DNS_SERVERS', '8.8.8.8');
  const ipv4 = vi.spyOn(Resolver.prototype, 'resolve4').mockResolvedValue(['8.8.8.8'] as any);
  const ipv6 = vi.spyOn(Resolver.prototype, 'resolve6').mockResolvedValue([]);
  const config: any = {
    id: 'fixture',
    provider: 'fixture',
    model: 'explicit-model',
    endpoint: 'https://model.example/chat',
    source: 'byok',
    apiKey: 'fixture-private-key',
    maxOutput: 2000,
    capabilities: { structured: false, tools: false, vision: false, stream: false }
  };
  const invalidEnvelope = '{"private_fixture_key":';
  const invalidContent = JSON.stringify({
    model: config.model,
    usage: { prompt_tokens: 12, completion_tokens: 9 },
    choices: [
      {
        finish_reason: 'length',
        message: { content: null, reasoning_content: 'private_fixture_reasoning' }
      }
    ]
  });
  let responseText = invalidEnvelope;
  let responseStatus = 200;
  const request = vi.spyOn(https, 'request').mockImplementation(((_url: any, _options: any, receive: any) => {
    const req: any = new EventEmitter();
    req.end = () =>
      queueMicrotask(() => {
        const res: any = new EventEmitter();
        res.statusCode = responseStatus;
        res.headers = { 'content-type': 'application/json; charset=utf-8' };
        receive(res);
        res.emit('data', Buffer.from(responseText));
        res.emit('end');
        req.emit('close');
      });
    return req;
  }) as any);
  try {
    for (const text of [invalidEnvelope, invalidContent]) {
      responseText = text;
      const error = await callLearningProvider(config, [], ['https://model.example'], undefined, undefined, true).catch(
        (e) => e
      );
      expect(error.code).toBe('INVALID_RESPONSE');
      expect(error.observed.durationMs).toBeGreaterThanOrEqual(0);
      expect(error.observed.responseDiagnostics).toMatchObject({
        httpStatus: 200,
        mimeCategory: 'json',
        networkStage: 'received',
        responseBytes: Buffer.byteLength(text)
      });
      if (text === invalidEnvelope) {
        expect(error.observed.responseDiagnostics).toMatchObject({
          envelopeJson: 'invalid',
          expectedType: 'json_object',
          actualType: 'invalid_json'
        });
        expect(error.observed.usage).toBeNull();
      } else {
        expect(error.observed.responseDiagnostics).toMatchObject({
          envelopeJson: 'valid',
          contentType: 'null',
          reasoning_contentType: 'string',
          reasoning_contentChars: 25,
          finishReason: 'length'
        });
        expect(error.observed.usage).toEqual({ prompt_tokens: 12, completion_tokens: 9 });
      }
      expect(JSON.stringify(error.observed)).not.toMatch(/private_fixture|fixture-private-key/);
    }
    // A received native-coach reply without the required tool must retain its
    // usage even when optional diagnostics are off; raw content stays absent.
    responseText = JSON.stringify({
      model: config.model,
      usage: { prompt_tokens: 7, completion_tokens: 5 },
      choices: [{ finish_reason: 'stop', message: { content: 'private_fixture_wrong_shape' } }]
    });
    const nativeConfig = {
      ...config,
      writingOutput: {
        contract: 'kaoyan-writing-coach-v1',
        inferencePolicy: 'native-coach-tools-v1',
        schema: { type: 'object' },
        schemaDigest: 'fixture'
      }
    };
    const toolFailure = await callLearningProvider(nativeConfig, [], ['https://model.example']).catch((e) => e);
    expect(toolFailure).toMatchObject({
      code: 'COACH_INVALID',
      path: 'tools',
      observed: {
        actualModel: config.model,
        usage: { prompt_tokens: 7, completion_tokens: 5 }
      }
    });
    expect(toolFailure.observed).not.toHaveProperty('content');
    expect(JSON.stringify(toolFailure.observed)).not.toMatch(/private_fixture|fixture-private-key/);
    responseText = invalidContent;
    const unchanged = await callLearningProvider(config, [], ['https://model.example']).catch((e) => e);
    expect(unchanged.code).toBe('INVALID_RESPONSE');
    expect(unchanged.observed).toBeUndefined();
    responseStatus = 401;
    responseText = JSON.stringify({ error: { code: config.apiKey } });
    const rejected = await callLearningProvider(
      config,
      [],
      ['https://model.example'],
      undefined,
      undefined,
      true
    ).catch((e) => e);
    expect(rejected).toMatchObject({ code: 'KEY_REJECTED', upstreamStatus: 401 });
    expect(rejected.upstreamCode).toBeUndefined();
    expect(JSON.stringify(rejected)).not.toContain(config.apiKey);
    for (const [endpoint, status, upstreamCode, expectedCode] of [
      ['https://api.groq.com/openai/v1/chat/completions', 413, 'rate_limit_exceeded', 'RATE_LIMITED'],
      ['https://api.groq.com/openai/v1/chat/completions', 413, 'request_too_large', 'UPSTREAM_FAILED'],
      ['https://model.example/chat', 413, 'rate_limit_exceeded', 'UPSTREAM_FAILED'],
      ['https://api.groq.com/openai/v1/chat/completions', 401, 'rate_limit_exceeded', 'KEY_REJECTED']
    ] as const) {
      responseStatus = status;
      responseText = JSON.stringify({ error: { code: upstreamCode, message: 'private_fixture_limit' } });
      const error = await callLearningProvider({ ...config, endpoint }, [], [new URL(endpoint).origin]).catch((e) => e);
      expect(error).toMatchObject({ code: expectedCode, upstreamStatus: status, upstreamCode });
      expect(JSON.stringify(error)).not.toMatch(/private_fixture_limit|fixture-private-key/);
    }
    responseStatus = 200;
    responseText = invalidEnvelope;
    const timers = vi.spyOn(globalThis, 'setTimeout');
    try {
      for (const [contract, requestedTimeout, binding, feedbackVersion, expectedTimeout] of [
        ['writing-error-verification-v2', 45000, null, null, 45000],
        ['writing-exercise-calibration-v3', 45000, null, null, 30000],
        ['ordinary-call', 45000, null, null, 30000],
        ['writing-error-verification-v2', 90000, { kind: 'feedback', target: 'diagnostic' }, 2, 60000],
        ['kaoyan-writing-coach-v1', 90000, { kind: 'feedback', target: 'diagnostic' }, 2, 90000],
        ['kaoyan-writing-coach-v1', 110000, { kind: 'feedback', target: 'diagnostic' }, 2, 110000],
        ['kaoyan-writing-coach-v1', 90000, { kind: 'feedback', target: 'card-c1' }, 2, 30000],
        ['kaoyan-writing-coach-v1', 90000, { kind: 'feedback', target: 'diagnostic' }, 1, 30000]
      ] as const) {
        timers.mockClear();
        await callLearningProvider(
          {
            ...config,
            timeoutMs: requestedTimeout,
            writingOutput: {
              contract,
              ...(binding ? { responseBinding: binding } : {}),
              ...(feedbackVersion ? { feedbackVersion } : {}),
              inferencePolicy: 'native-coach-tools-v1',
              schema: { type: 'object' },
              schemaDigest: 'fixture'
            }
          },
          [],
          ['https://model.example']
        ).catch(() => {});
        expect(timers.mock.calls.map((call) => call[1])).toContain(expectedTimeout);
      }
    } finally {
      timers.mockRestore();
    }
  } finally {
    request.mockRestore();
    ipv4.mockRestore();
    ipv6.mockRestore();
    vi.stubEnv('LEARNING_DNS_SERVERS', priorResolver);
  }
});

it('coach JSON shape diagnostics use a closed whitelist and never retain syntax text', () => {
  const raw = '```json\n{"private_fixture_key":\n```';
  let failure: any;
  try {
    parseCoachModelOutput(raw, {}, true);
  } catch (error) {
    failure = error;
  }
  expect(failure).toMatchObject({
    code: 'COACH_INVALID',
    path: 'raw',
    responseDiagnostics: {
      expectedType: 'json_object',
      actualType: 'invalid_json',
      hasJsonFence: true,
      syntaxEnd: true
    }
  });
  expect(
    boundedResponseDiagnostics({
      ...failure.responseDiagnostics,
      content: raw,
      authorization: 'private_fixture_auth',
      finishReason: 'private_fixture_reason',
      syntaxPosition: Infinity
    })
  ).toBeNull();
  const diagnostic = boundedResponseDiagnostics({
    ...failure.responseDiagnostics,
    version: 'diag-meta-1',
    capturedAt: 1000
  });
  expect(diagnostic).toMatchObject({ expectedType: 'json_object', actualType: 'invalid_json', hasJsonFence: true });
  expect(failure.responseDiagnostics).not.toHaveProperty('syntaxPosition');
  expect(JSON.stringify(diagnostic)).not.toMatch(/private_fixture/);
  const original = reserveCall(funded(), input('shape-erasure')).account;
  original.calls[0].responseDiagnostics = diagnostic;
  const erased = eraseModelResultCache(original);
  expect(erased.account.calls[0]).not.toHaveProperty('responseDiagnostics');
  expect(erased.account.cost).toEqual(original.cost);
});

it.each([true, false])('repair receipts charge student entitlement once only when delivered: %s', (success) => {
  const parent = { ...input('parent-repair'), modelId: 'explicit', configurationVersion: 'same' };
  let account = reserveCall(funded(), parent).account;
  account = settleCall(account, parent.id, { success: false, actualCost: 0.1, errorCode: 'COACH_INVALID' }).account;
  const repair = { ...parent, id: `${parent.id}:repair1`, fingerprint: 'repair-fingerprint', repairOf: parent.id };
  account = reserveCall(account, repair).account;
  expect(account.calls[1]).toMatchObject({ units: 0, deliveryUnits: 1 });
  account = settleCall(account, repair.id, {
    success,
    actualCost: 0.2,
    result: success ? { message: 'valid' } : null,
    errorCode: success ? null : 'COACH_INVALID'
  }).account;
  expect(account.entitlement.spent).toBe(success ? 1 : 0);
  expect(account.entitlement.reserved).toBe(0);
  expect(account.cost.spent).toBeCloseTo(0.3);
  expect(account.calls[1].entitlementCharged).toBe(0);
  expect(account.calls[0].entitlementCharged).toBe(success ? 1 : 0);
  expect(() => reserveCall(account, { ...repair, id: `${repair.id}:repair1`, repairOf: repair.id })).toThrow();
  // 发布构建只修一次：开发付费兜底的第二次返修不放行。
  expect(() => reserveCall(account, { ...repair, id: `${parent.id}:repair2`, fingerprint: 'second' })).toThrow();
});
