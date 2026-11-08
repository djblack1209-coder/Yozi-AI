import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ rows: new Map(), allowed: true, response: undefined as any }));
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
          const matches = () =>
            [...mock.rows.entries()].filter(
              ([id, row]: any) =>
                id.startsWith(`${name}:`) && Object.entries(query).every(([key, value]) => row[key] === value)
            );
          return {
            get: async () => ({ data: matches().map(([, row]) => structuredClone(row)) }),
            update: async (next: any) => {
              const rows = matches();
              rows.forEach(([id, row]: any) => mock.rows.set(id, { ...row, ...structuredClone(next) }));
              return { updated: rows.length };
            },
            remove: async () => ({ deleted: 0 })
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
  callLearningProvider: vi.fn(),
  callCapabilityProvider: vi.fn(),
  callStreamingLearningProvider: vi.fn()
}));
import {
  cancelCall,
  mutateAccount,
  newAccount,
  recoverStaleReservations,
  reserveCall,
  settleCall,
  weekKey
} from '../../laf-backend/functions/_shared/learning-account';
import { trialCreditFor, trialCreditPolicy } from '../../laf-backend/functions/_shared/learning-trial';
import { callLearningProvider } from '../../laf-backend/functions/_shared/ai-providers/learning-provider';
import ai from '../../laf-backend/functions/proxy-ai';

const JWT_SECRET = 'test-only-jwt-secret';
const context = (body: any, userId: string) => {
  const header = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url');
  const payload = Buffer.from(JSON.stringify({ userId, exp: Math.floor(Date.now() / 1000) + 60 })).toString(
    'base64url'
  );
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return { headers: { authorization: `Bearer ${header}.${payload}.${signature}` }, body };
};
const credit = (granted: number) => ({ granted, costLimit: 1 });
const platformCall = (id: string, trialCredit: any = credit(3)) => ({
  id,
  fingerprint: id,
  source: 'platform',
  maxCost: 0.01,
  units: 1,
  model: 'deepseek-flash',
  provider: 'deepseek',
  ...(trialCredit ? { trialCredit } : {})
});
const settled = (actualCost: number | null, executionStage = 'received') => ({
  success: true,
  actualCost,
  executionStage,
  result: { message: 'ok' }
});
const memoryDb = () => {
  const rows = new Map<string, any>();
  return {
    rows,
    collection: () => ({
      add: async (row: any) => {
        if (rows.has(row._id)) throw { code: 11000 };
        rows.set(row._id, structuredClone(row));
      },
      where: (query: any) => {
        const matches = () =>
          [...rows.values()].filter((row) => Object.entries(query).every(([key, value]) => row[key] === value));
        return {
          get: async () => ({ data: matches().map((row) => structuredClone(row)) }),
          // Conditional on the revision in `query`: this is the CAS the grant relies on.
          update: async (next: any) => {
            const hits = matches();
            hits.forEach((row) => rows.set(row._id, { ...row, ...structuredClone(next) }));
            return { updated: hits.length };
          }
        };
      }
    })
  };
};
afterEach(() => vi.unstubAllEnvs());

describe('现有设置能否表达「共 N 次」', () => {
  it('周额度每周重置，只能表达每周 N 次，不能表达试用期共 N 次', () => {
    const monday = Date.parse('2026-11-02T04:00:00Z');
    const nextMonday = monday + 7 * 86400000;
    let account: any = newAccount('u1');
    account.entitlement.weeklyUnits = 1;
    account.cost.hardLimit = 1;
    const call = (id: string) => platformCall(id, null);
    account = reserveCall(account, call('w1'), monday).account;
    account = settleCall(account, 'w1', settled(0.001), monday).account;
    expect(() => reserveCall(account, call('w2'), monday)).toThrow(/本周/);
    expect(weekKey(nextMonday, 'Asia/Shanghai')).not.toBe(weekKey(monday, 'Asia/Shanghai'));
    expect(reserveCall(account, call('w2'), nextMonday).reused).toBe(false);
  });
});

describe('试用额度开关与配置', () => {
  const good = {
    LEARNING_TRIAL_CREDITS_ENABLED: 'true',
    LEARNING_TRIAL_CREDIT_USER_LIMIT: '2',
    LEARNING_TRIAL_CREDIT_COST_LIMIT: '0.5',
    LEARNING_TRIAL_CREDIT_GRANTS: 'A@example.com:3, b@example.com:5'
  } as any;
  it.each([[undefined], ['false'], ['TRUE'], ['1'], ['']])('开关为 %s 时关闭且不读配置', (value) => {
    const env = { ...good, LEARNING_TRIAL_CREDITS_ENABLED: value, LEARNING_TRIAL_CREDIT_GRANTS: 'not a grant' };
    expect(trialCreditPolicy(env)).toBeNull();
  });
  it('恰为 true 时解析名单，邮箱大小写不敏感', () => {
    expect(trialCreditPolicy(good)!.grants.get('a@example.com')).toBe(3);
  });
  it.each([
    ['缺名单', { LEARNING_TRIAL_CREDIT_GRANTS: '' }],
    ['人数超上限', { LEARNING_TRIAL_CREDIT_USER_LIMIT: '1' }],
    ['上限超范围', { LEARNING_TRIAL_CREDIT_USER_LIMIT: '1001' }],
    ['缺成本上限', { LEARNING_TRIAL_CREDIT_COST_LIMIT: '' }],
    ['成本上限非法', { LEARNING_TRIAL_CREDIT_COST_LIMIT: 'Infinity' }],
    ['额度非整数', { LEARNING_TRIAL_CREDIT_GRANTS: 'a@example.com:1.5' }],
    ['额度为零', { LEARNING_TRIAL_CREDIT_GRANTS: 'a@example.com:0' }],
    ['额度超上限', { LEARNING_TRIAL_CREDIT_GRANTS: 'a@example.com:1001' }],
    ['邮箱不合法', { LEARNING_TRIAL_CREDIT_GRANTS: 'nobody:3' }],
    ['重复邮箱', { LEARNING_TRIAL_CREDIT_GRANTS: 'a@example.com:3,A@example.com:5' }]
  ])('%s 时拒绝开放，不放行', (_name, override) => {
    expect(() => trialCreditPolicy({ ...good, ...override })).toThrow(
      expect.objectContaining({ code: 'TRIAL_CLOSED' })
    );
  });
  it('名单外账号额度为零，开关关闭时不查询用户', async () => {
    const where = vi.fn(() => ({ get: async () => ({ data: [{ email: 'outside@example.com' }] }) }));
    const db = { collection: () => ({ where }) };
    expect(await trialCreditFor(db, 'u1', good)).toEqual({ granted: 0, costLimit: 0.5 });
    where.mockClear();
    expect(await trialCreditFor(db, 'u1', {} as any)).toBeNull();
    expect(where).not.toHaveBeenCalled();
  });
});

describe('额度记账', () => {
  const spend = (account: any, id: string) => {
    const next = reserveCall(account, platformCall(id)).account;
    return settleCall(next, id, settled(0.001)).account;
  };
  it('共 3 次：前三次可用，第四次拒绝并说明可用自带 API', () => {
    let account: any = newAccount('u1');
    for (const id of ['a', 'b', 'c']) account = spend(account, id);
    expect(account.trialCredits).toEqual({ granted: 3, reserved: 0, spent: 3 });
    expect(() => reserveCall(account, platformCall('d'))).toThrow(
      expect.objectContaining({ code: 'QUOTA_EXHAUSTED', message: expect.stringContaining('自己的 API') })
    );
    expect(account.calls.map((call: any) => call.trialCredit)).toEqual([true, true, true]);
  });
  it('没有额度的账号立即拒绝，账本不留行', () => {
    const account = newAccount('u2');
    expect(() => reserveCall(account, platformCall('b1', credit(0)))).toThrow(
      expect.objectContaining({ code: 'QUOTA_EXHAUSTED' })
    );
    expect(account.calls).toHaveLength(0);
    expect(account).not.toHaveProperty('trialCredits');
  });
  it('已发出但失败的调用也消耗额度', () => {
    let account: any = reserveCall(newAccount('u1'), platformCall('f')).account;
    account = settleCall(account, 'f', { success: false, actualCost: 0.001, executionStage: 'received' }).account;
    expect(account.trialCredits).toEqual({ granted: 3, reserved: 0, spent: 1 });
    expect(account.calls[0]).toMatchObject({ status: 'failed', costStatus: 'settled' });
  });
  it('成本未知的调用保持 pending 并继续占用额度，不记为零也不退回', () => {
    let account: any = reserveCall(newAccount('u1'), platformCall('p', credit(1))).account;
    account = settleCall(account, 'p', { success: true, actualCost: null, result: { message: 'ok' } }).account;
    expect(account.calls[0]).toMatchObject({ actualCost: null, costStatus: 'pending' });
    expect(account.trialCredits).toEqual({ granted: 1, reserved: 1, spent: 0 });
    expect(() => reserveCall(account, platformCall('q', credit(1)))).toThrow(
      expect.objectContaining({ code: 'QUOTA_EXHAUSTED' })
    );
  });
  it('中断回收的调用同样保持占用', () => {
    const now = Date.now();
    const account: any = reserveCall(newAccount('u1'), platformCall('s'), now - 200000).account;
    const recovered = recoverStaleReservations(account, now).account;
    expect(recovered.calls[0].costStatus).toBe('pending');
    expect(recovered.trialCredits.reserved).toBe(1);
  });
  it('取消后从未发出的调用归还额度', () => {
    let account: any = reserveCall(newAccount('u1'), platformCall('n')).account;
    account = cancelCall(account, 'n').account;
    account = settleCall(account, 'n', {
      success: false,
      actualCost: 0,
      executionStage: 'not_called',
      errorCode: 'CANCELLED',
      cancelled: true
    }).account;
    expect(account.trialCredits).toEqual({ granted: 3, reserved: 0, spent: 0 });
    expect(account.calls[0].status).toBe('cancelled');
  });
  it('同一请求重放不再扣额度', () => {
    const account: any = reserveCall(newAccount('u1'), platformCall('r')).account;
    expect(reserveCall(account, platformCall('r')).reused).toBe(true);
    expect(account.trialCredits.reserved).toBe(1);
  });
  it('成本硬上限仍然生效', () => {
    expect(() =>
      reserveCall(newAccount('u1'), { ...platformCall('c', { granted: 3, costLimit: 0.001 }), maxCost: 0.01 })
    ).toThrow(expect.objectContaining({ code: 'COST_LIMIT' }));
  });
  it('自带 API 调用不消耗也不写入额度字段', () => {
    let account: any = newAccount('u1');
    account = reserveCall(account, { ...platformCall('own', null), source: 'byok', maxCost: 0, units: 0 }).account;
    account = settleCall(account, 'own', settled(null)).account;
    expect(account).not.toHaveProperty('trialCredits');
    expect(account.calls[0]).not.toHaveProperty('trialCredit');
  });
  it('只剩 1 次时两个并发请求恰好一个成功', async () => {
    const db = memoryDb();
    await mutateAccount(db, 'u1', (account: any) => reserveCall(account, platformCall('first', credit(2))));
    const outcomes = await Promise.allSettled(
      ['x', 'y'].map((id) =>
        mutateAccount(db, 'u1', (account: any) => reserveCall(account, platformCall(id, credit(2))))
      )
    );
    expect(outcomes.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find((item) => item.status === 'rejected')).toMatchObject({
      reason: expect.objectContaining({ code: 'QUOTA_EXHAUSTED' })
    });
    const account = [...db.rows.values()][0];
    expect(account.trialCredits).toEqual({ granted: 2, reserved: 2, spent: 0 });
    expect(account.calls).toHaveLength(2);
  });
});

describe('接口：开关关闭时没有平台调用', () => {
  const platformModel = {
    id: 'platform-flash',
    model: 'deepseek-flash',
    provider: 'deepseek',
    endpoint: 'https://api.deepseek.com/chat/completions',
    keyEnv: 'SYNTHETIC_PLATFORM_KEY',
    maxOutput: 1000,
    capabilities: { structured: true },
    priceVersion: 'r10-fixture',
    inputPerMillion: 1,
    outputPerMillion: 2
  };
  const body = (requestId: string) => ({
    requestId,
    modelId: 'platform-flash',
    shareConsent: true,
    messages: [{ role: 'user', content: '合成数据' }]
  });
  beforeEach(() => {
    mock.rows.clear();
    mock.allowed = true;
    vi.mocked(callLearningProvider).mockReset();
    mock.rows.set('users:u1', { _id: 'u1', email: 'a@example.com', status: 'active' });
    mock.rows.set('users:u2', { _id: 'u2', email: 'b@example.com', status: 'active' });
    vi.stubEnv('JWT_SECRET', JWT_SECRET);
    vi.stubEnv('LEARNING_VAULT_KEY', 'a'.repeat(64));
    vi.stubEnv('LEARNING_ALLOWED_ORIGINS', 'https://api.deepseek.com');
    vi.stubEnv('LEARNING_PLATFORM_MODELS', JSON.stringify([platformModel]));
    vi.stubEnv('SYNTHETIC_PLATFORM_KEY', 'fixture-only-key');
    vi.stubEnv('LEARNING_PLATFORM_CALLS_ENABLED', 'false');
    vi.stubEnv('LEARNING_PAYMENT_SANDBOX_ENABLED', 'false');
  });
  it.each([
    ['生产设置，开关缺失', {}],
    ['生产设置，开关为 false', { LEARNING_TRIAL_CREDITS_ENABLED: 'false' }],
    [
      '开发设置，开关缺失',
      {
        LEARNING_FRIEND_TRIAL_ENABLED: 'true',
        LEARNING_TRIAL_USER_LIMIT: '1',
        LEARNING_TRIAL_EMAILS: 'a@example.com',
        LEARNING_USER_DAILY_CALL_LIMIT: '500',
        LEARNING_GLOBAL_DAILY_BUDGET: '0'
      }
    ],
    [
      '开发设置，开关为 false',
      {
        LEARNING_TRIAL_CREDITS_ENABLED: 'false',
        LEARNING_FRIEND_TRIAL_ENABLED: 'true',
        LEARNING_TRIAL_USER_LIMIT: '1',
        LEARNING_TRIAL_EMAILS: 'a@example.com'
      }
    ]
  ])('%s：调用前拒绝，模型端零请求，账户不写额度', async (_name, env) => {
    Object.entries(env).forEach(([key, value]) => vi.stubEnv(key, String(value)));
    const result = await ai(context(body('off-1'), 'u1'));
    expect(result).toMatchObject({ success: false, error: 'NEEDS_CONNECTION' });
    expect(callLearningProvider).not.toHaveBeenCalled();
    expect([...mock.rows.keys()].some((key) => key.startsWith('learning_accounts:'))).toBe(false);
  });
  it('平台开启但额度开关关闭时，沿用周权益，账户不出现额度字段', async () => {
    vi.stubEnv('LEARNING_PLATFORM_CALLS_ENABLED', 'true');
    vi.stubEnv('LEARNING_USER_DAILY_CALL_LIMIT', '10');
    vi.stubEnv('LEARNING_GLOBAL_DAILY_CALL_LIMIT', '10');
    vi.stubEnv('LEARNING_GLOBAL_DAILY_BUDGET', '1');
    const result = await ai(context(body('weekly-1'), 'u1'));
    expect(result).toMatchObject({ success: false, error: 'QUOTA_EXHAUSTED' });
    expect(callLearningProvider).not.toHaveBeenCalled();
    for (const [key, row] of mock.rows)
      if (key.startsWith('learning_accounts:')) expect(row).not.toHaveProperty('trialCredits');
  });
  it('开关开启：有额度的账号用满为止，无额度账号立即拒绝，配置错误不开放', async () => {
    vi.stubEnv('LEARNING_PLATFORM_CALLS_ENABLED', 'true');
    vi.stubEnv('LEARNING_USER_DAILY_CALL_LIMIT', '10');
    vi.stubEnv('LEARNING_GLOBAL_DAILY_CALL_LIMIT', '10');
    vi.stubEnv('LEARNING_GLOBAL_DAILY_BUDGET', '1');
    vi.stubEnv('LEARNING_TRIAL_CREDITS_ENABLED', 'true');
    vi.stubEnv('LEARNING_TRIAL_CREDIT_USER_LIMIT', '1');
    vi.stubEnv('LEARNING_TRIAL_CREDIT_COST_LIMIT', '0.5');
    vi.stubEnv('LEARNING_TRIAL_CREDIT_GRANTS', 'a@example.com:2');
    vi.mocked(callLearningProvider).mockResolvedValue({
      content: '{"message":"合成回复","tools":[]}',
      actualModel: 'deepseek-flash',
      usage: { prompt_tokens: 15, completion_tokens: 12 },
      durationMs: 1
    } as any);
    expect((await ai(context(body('on-1'), 'u1'))).success).toBe(true);
    expect((await ai(context(body('on-2'), 'u1'))).success).toBe(true);
    expect(await ai(context(body('on-3'), 'u1'))).toMatchObject({ code: 402, error: 'QUOTA_EXHAUSTED' });
    expect(await ai(context(body('on-b'), 'u2'))).toMatchObject({ code: 402, error: 'QUOTA_EXHAUSTED' });
    expect(callLearningProvider).toHaveBeenCalledTimes(2);
    vi.stubEnv('LEARNING_TRIAL_CREDIT_GRANTS', 'broken');
    expect(await ai(context(body('on-bad'), 'u1'))).toMatchObject({ error: 'TRIAL_CLOSED' });
    expect(callLearningProvider).toHaveBeenCalledTimes(2);
  });
});
