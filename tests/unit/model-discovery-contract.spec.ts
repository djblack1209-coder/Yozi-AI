import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createModelDiscovery,
  DISCOVERY_LIMITS
} from '../../laf-backend/functions/_shared/ai-providers/model-discovery';
import { newAccount } from '../../laf-backend/functions/_shared/learning-account';
const runtime = vi.hoisted(() => ({
  owner: 'fixture-owner',
  account: null as any,
  writes: 0,
  database: vi.fn(),
  limit: vi.fn(async () => ({ allowed: true }))
}));
vi.mock('@lafjs/cloud', () => ({ default: { database: runtime.database } }));
vi.mock('../../laf-backend/functions/_shared/auth-middleware', () => ({
  requireAuth: () => ({ userId: runtime.owner }),
  isAuthError: () => false
}));
vi.mock('../../laf-backend/functions/_shared/api-response', () => ({ checkRateLimitDistributed: runtime.limit }));
vi.mock('../../laf-backend/functions/proxy-ai', () => ({ default: vi.fn(), configuredModels: () => [] }));
vi.mock('../../laf-backend/functions/_shared/learning-subscription', () => ({
  refreshSubscriptionEntitlement: (a: any) => a
}));
import learningModels from '../../laf-backend/functions/learning-models';

const NOW = Date.UTC(2026, 9, 24);
const KEY = 'fixture_metadata_credential';
const body = (extra = {}) => ({ action: 'discover', profileId: 'fixture', refresh: true, ...extra });
const payload = () => ({
  data: [{ id: 'fixture-model', name: 'Fixture', context_window: 10000, max_output_tokens: 1000 }]
});
function response(data: any, status = 200, headers: Record<string, string> = {}, chunks?: Uint8Array[]) {
  const cancel = vi.fn();
  return {
    status,
    headers: { get: (key: string) => ({ 'content-type': 'application/json', ...headers })[key] || null },
    cancel,
    body: {
      async *[Symbol.asyncIterator]() {
        for (const chunk of chunks || [Buffer.from(JSON.stringify(data))]) yield chunk;
      }
    }
  };
}
function fixture(options: { cacheBytes?: number } = {}) {
  const state = {
    clock: NOW,
    version: 1,
    provider: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/chat/completions',
    configured: true,
    data: payload(),
    status: 200,
    headers: {} as Record<string, string>
  };
  const readProfile = vi.fn(async (owner: string, id: string) => ({
    owner,
    id,
    version: state.version,
    provider: state.provider,
    endpoint: state.endpoint,
    configured: state.configured,
    authorization: 'bearer' as const
  }));
  const readCredential = vi.fn(async () => KEY);
  const fetcher = vi.fn(async (_url: any, _options: any) => response(state.data, state.status, state.headers));
  const resolve = vi.fn(async (url: string) => ({ url: new URL(url), address: { address: '8.8.8.8', family: 4 } }));
  const discover = createModelDiscovery({
    readProfile,
    readCredential,
    fetcher,
    resolve,
    now: () => state.clock,
    ...options
  });
  return { state, readProfile, readCredential, fetcher, resolve, discover };
}
beforeEach(() => {
  runtime.writes = 0;
  runtime.database.mockClear();
  runtime.limit.mockClear();
  runtime.account = newAccount(runtime.owner);
  runtime.database.mockImplementation(() => ({
    collection: (name: string) => ({
      where: (query: any) => ({
        get: async () => ({
          data:
            name === 'users' && query._id === runtime.owner
              ? [{ _id: runtime.owner, status: 'active' }]
              : query.user_id === runtime.owner
                ? [structuredClone(runtime.account)]
                : []
        }),
        update: async (next: any) => {
          runtime.writes++;
          runtime.account = { ...runtime.account, ...next };
          return { updated: 1 };
        }
      }),
      add: () => {
        throw new Error('Unexpected fixture insertion');
      }
    })
  }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('默认关闭discover与只读owner投影离线接缝', () => {
  it('真实handler先核验活动账户，关闭态零维护／限流写入；usage不携带诊断', async () => {
    vi.stubEnv('LEARNING_MODEL_DISCOVERY_ENABLED', 'false');
    const result = await learningModels({ body: body() });
    expect(result).toMatchObject({ success: false, errorCode: 'DISCOVERY_DISABLED' });
    expect(runtime.database).toHaveBeenCalledTimes(1);
    expect(runtime.limit).not.toHaveBeenCalled();
    expect(runtime.writes).toBe(0);
    runtime.account.calls = [
      {
        id: 'fixture-old',
        status: 'failed',
        responseDiagnostics: { fixture_private: 'never-project' },
        actualCost: null
      }
    ];
    const usage: any = await learningModels({ body: { action: 'usage' } });
    expect(usage.success).toBe(true);
    expect(usage.data.calls[0]).not.toHaveProperty('responseDiagnostics');
  });

  it('关闭、额外键、未绑定和不匹配边界拒绝，未安装凭据适配器不取秘密', async () => {
    const f = fixture();
    expect((await f.discover(runtime.owner, body())).errorCode).toBe('DISCOVERY_DISABLED');
    expect((await f.discover(runtime.owner, body({ owner: 'other' }), true)).errorCode).toBe('DISCOVERY_INPUT_INVALID');
    expect(f.readProfile).not.toHaveBeenCalled();
    f.state.configured = false;
    expect((await f.discover(runtime.owner, body(), true)).success).toBe(false);
    f.state.configured = true;
    f.state.endpoint = 'https://api.deepseek.com/other';
    expect((await f.discover(runtime.owner, body(), true)).success).toBe(false);
    f.state.provider = 'Groq';
    f.state.endpoint = 'https://api.groq.com/openai/v1/chat/completions';
    for (const id of ['openai/gpt-oss-20b', '..', 'path\\name'])
      expect((await f.discover(runtime.owner, body({ modelId: id }), true)).errorCode).toBe('UNSUPPORTED_DISCOVERY');
    expect(f.fetcher).not.toHaveBeenCalled();
    expect(f.readCredential).not.toHaveBeenCalled();
    const noCredential = createModelDiscovery({ readProfile: f.readProfile });
    expect((await noCredential(runtime.owner, body(), true)).errorCode).toBe('UNSUPPORTED_DISCOVERY_AUTH');
  });

  it('字段缺失、null、单位未知与不完整缺席保留unknown，元数据不制造最高档／费用', async () => {
    const f = fixture();
    f.state.data = {
      data: [
        {
          id: 'fixture-model',
          name: 'Fixture',
          context_window: '128k',
          max_output_tokens: null,
          input_modalities: ['text'],
          effort: { supported_levels: ['low', 'high'] },
          private_field: KEY
        }
      ]
    } as any;
    const detail: any = await f.discover(runtime.owner, body({ modelId: 'fixture-model' }), true);
    expect(detail.data.fields.contextWindowTokens).toMatchObject({ state: 'unknown', reason: 'unit_unresolved' });
    expect(detail.data.fields.maxOutputTokens).toMatchObject({ state: 'unknown', reason: 'vendor_null_ambiguous' });
    expect(detail.data.fields.reasoningLevels).toMatchObject({ state: 'known', value: ['low', 'high'] });
    expect(detail.data.fields.highestReasoningLevel.state).toBe('unknown');
    expect(detail.data.fields.pricing.reason).toBe('not_collected_phase1');
    expect(detail.data.fields.freeQuota.reason).toBe('not_discoverable');
    expect(detail.data).not.toHaveProperty('verifiedInference');
    expect(JSON.stringify(detail)).not.toContain(KEY);
    expect(detail.data.sources[0]).toMatchObject({ sourceUrl: 'deepseek:GET /models', kind: 'official_api_observed' });
    expect(detail.data.sources[0].observedAt).toBe(new Date(NOW).toISOString());
    const incomplete = fixture();
    incomplete.state.data = { data: [], next: 'https://not-followed.invalid/page' } as any;
    const absent: any = await incomplete.discover(runtime.owner, body({ modelId: 'absent' }), true);
    expect(absent.data.complete).toBe(false);
    expect(absent.data.availability).toMatchObject({ state: 'unknown', reason: 'incomplete_listing' });
    expect(incomplete.fetcher).toHaveBeenCalledTimes(1);
    const leaked = fixture();
    leaked.state.data = { data: [{ id: KEY }] } as any;
    expect((await leaked.discover(runtime.owner, body(), true)).success).toBe(false);
  });

  it('同键合并、缓存只读、版本和owner隔离；全程没有数据库写能力', async () => {
    const f = fixture();
    let release: any;
    f.fetcher.mockImplementationOnce(
      async () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const a = f.discover(runtime.owner, body(), true),
      b = f.discover(runtime.owner, body(), true);
    await vi.waitFor(() => expect(f.fetcher).toHaveBeenCalledTimes(1));
    release(response(payload()));
    expect((await a).success).toBe(true);
    expect((await b).success).toBe(true);
    const cached: any = await f.discover(runtime.owner, body({ refresh: false }), true);
    expect(cached.data.models[0]).toMatchObject({
      modelId: 'fixture-model',
      displayName: 'Fixture',
      availability: 'listed',
      contextWindowTokens: 10000
    });
    expect(await f.discover(runtime.owner, body(), true)).toEqual(cached);
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    expect((await f.discover('other-owner', body({ refresh: false }), true)).success).toBe(false);
    f.state.version++;
    expect((await f.discover(runtime.owner, body({ refresh: false }), true)).success).toBe(false);
    expect((await f.discover(runtime.owner, body(), true)).errorCode).toBe('DISCOVERY_COOLDOWN');
    f.state.clock += 60001;
    expect((await f.discover(runtime.owner, body(), true)).success).toBe(true);
    expect(f.fetcher).toHaveBeenCalledTimes(2);
    expect(runtime.writes).toBe(0);
    expect(runtime.database).not.toHaveBeenCalled();
  });

  it('撤销／配置变化后的迟到结果不回填或返回旧快照', async () => {
    const f = fixture();
    let release: any;
    f.fetcher.mockImplementationOnce(
      async () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const pending = f.discover(runtime.owner, body(), true);
    await vi.waitFor(() => expect(f.fetcher).toHaveBeenCalledTimes(1));
    f.state.version++;
    release(response(payload()));
    expect(await pending).toMatchObject({ success: false, errorCode: 'CONTEXT_CHANGED' });
    expect(await f.discover(runtime.owner, body({ refresh: false }), true)).not.toHaveProperty('data');
    expect((await f.discover(runtime.owner, body(), true)).errorCode).toBe('DISCOVERY_COOLDOWN');
  });

  it('拒绝跳转／非JSON／压缩，流式到2MiB中止且不跟随外部URL', async () => {
    for (const [status, headers, expected] of [
      [302, {}, 'METADATA_REDIRECT_REJECTED'],
      [200, { 'content-type': 'text/plain' }, 'METADATA_NOT_JSON'],
      [200, { 'content-encoding': 'gzip' }, 'METADATA_ENCODING_UNSUPPORTED']
    ] as const) {
      const f = fixture();
      const r = response(payload(), status, headers);
      f.fetcher.mockResolvedValueOnce(r);
      expect((await f.discover(runtime.owner, body(), true)).errorCode).toBe(expected);
      expect(r.cancel).toHaveBeenCalledOnce();
      expect(f.fetcher.mock.calls[0][1].redirect).toBe('error');
    }
    const f = fixture();
    let reads = 0;
    const r = response({});
    r.body = {
      async *[Symbol.asyncIterator]() {
        reads++;
        yield Buffer.alloc(DISCOVERY_LIMITS.responseBytes);
        reads++;
        yield Buffer.from('extra');
      }
    };
    f.fetcher.mockResolvedValueOnce(r);
    expect((await f.discover(runtime.owner, body(), true)).errorCode).toBe('METADATA_LIMIT');
    expect(reads).toBe(1);
    expect(r.cancel).toHaveBeenCalledOnce();
    expect(f.fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('401/403不重试，404/410不换资源，429冷却，网络失败旧快照为stale', async () => {
    for (const [status, errorCode] of [
      [401, 'DISCOVERY_AUTH_REJECTED'],
      [403, 'DISCOVERY_AUTH_REJECTED'],
      [404, 'UNSUPPORTED_DISCOVERY'],
      [410, 'UNSUPPORTED_DISCOVERY'],
      [429, 'DISCOVERY_UPSTREAM_RATE_LIMITED']
    ] as const) {
      const f = fixture();
      f.state.status = status;
      const first = await f.discover(runtime.owner, body(), true);
      expect(first).toMatchObject({ success: false, errorCode });
      expect(await f.discover(runtime.owner, body(), true)).toEqual(first);
      expect(f.fetcher).toHaveBeenCalledTimes(1);
    }
    const f = fixture();
    await f.discover(runtime.owner, body(), true);
    f.state.clock += 60001;
    f.fetcher.mockRejectedValueOnce(new Error('fixture-private-error'));
    const failed: any = await f.discover(runtime.owner, body(), true);
    expect(failed.data.cacheState).toBe('stale');
    expect(JSON.stringify(failed)).not.toContain('fixture-private-error');
    expect(Date.parse(failed.data.sources[0].expiresAt)).toBeLessThanOrEqual(f.state.clock);
  });

  it('10秒涵盖等候与取消，命中TTL仍区分新鲜度，内存满时LRU释放新鲜旧项', async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.fetcher.mockImplementationOnce(async () => new Promise(() => {}));
    const pending = f.discover(runtime.owner, body(), true);
    await vi.advanceTimersByTimeAsync(DISCOVERY_LIMITS.timeoutMs);
    expect((await pending).errorCode).toBe('METADATA_TIMEOUT');
    vi.useRealTimers();
    const ttl = fixture();
    await ttl.discover(runtime.owner, body(), true);
    ttl.state.clock += DISCOVERY_LIMITS.ttlMs;
    expect(((await ttl.discover(runtime.owner, body({ refresh: false }), true)) as any).data.cacheState).toBe('stale');
    expect(ttl.fetcher).toHaveBeenCalledTimes(1);
    const lru = fixture({ cacheBytes: 1000 });
    for (const profileId of ['one', 'two', 'three']) {
      expect((await lru.discover(runtime.owner, body({ profileId }), true)).success).toBe(true);
      lru.state.clock += 60001;
    }
    expect((await lru.discover(runtime.owner, body({ profileId: 'one', refresh: false }), true)).success).toBe(false);
  });

  it('合并请求取消一位保留另一位；全部取消后不回填迟到结果', async () => {
    const f = fixture();
    let release: any;
    f.fetcher.mockImplementationOnce(
      async () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const first = new AbortController();
    const a = f.discover(runtime.owner, body(), true, first.signal);
    const b = f.discover(runtime.owner, body(), true);
    await vi.waitFor(() => expect(f.fetcher).toHaveBeenCalledTimes(1));
    first.abort();
    expect((await a).errorCode).toBe('CONTEXT_CHANGED');
    expect(f.fetcher.mock.calls[0][1].signal.aborted).toBe(false);
    release(response(payload()));
    expect((await b).success).toBe(true);

    const stopped = fixture();
    let late: any;
    stopped.fetcher.mockImplementationOnce(
      async () =>
        new Promise((resolve) => {
          late = resolve;
        })
    );
    const only = new AbortController();
    const pending = stopped.discover(runtime.owner, body(), true, only.signal);
    await vi.waitFor(() => expect(stopped.fetcher).toHaveBeenCalledTimes(1));
    only.abort();
    expect((await pending).errorCode).toBe('CONTEXT_CHANGED');
    expect(stopped.fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    const discarded = response(payload());
    late(discarded);
    await Promise.resolve();
    expect(await stopped.discover(runtime.owner, body({ refresh: false }), true)).not.toHaveProperty('data');
    expect((await stopped.discover(runtime.owner, body(), true)).errorCode).toBe('CONTEXT_CHANGED');
  });
});

it('production-capable discovery uses saved OpenAI-compatible endpoints and Gemini header auth without returning keys', async () => {
  for (const [provider, endpoint, listPath] of [
    ['OpenRouter', 'https://openrouter.ai/api/v1/chat/completions', '/api/v1/models'],
    ['Google Gemini', 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', '/v1beta/models'],
    ['Custom', 'https://custom.example/v1/chat/completions', '/v1/models']
  ]) {
    const f = fixture();
    f.state.provider = provider;
    f.state.endpoint = endpoint;
    if (provider === 'Google Gemini')
      (f.state as any).data = {
        models: [{ name: 'models/gemini-fixture', displayName: 'Fixture', inputTokenLimit: 1234 }]
      };
    const result = await f.discover(runtime.owner, body(), true);
    expect(result.success).toBe(true);
    expect(f.fetcher.mock.calls[0][0].pathname).toBe(listPath);
    const headers = f.fetcher.mock.calls[0][1].headers;
    expect(headers[provider === 'Google Gemini' ? 'x-goog-api-key' : 'Authorization']).toBe(
      provider === 'Google Gemini' ? KEY : `Bearer ${KEY}`
    );
    expect(JSON.stringify(result)).not.toContain(KEY);
  }
});

it('deployment allowlist is enforced before credential reads and unsupported listing allows manual entry', async () => {
  const f = fixture();
  const denied = createModelDiscovery({
    readProfile: f.readProfile,
    readCredential: f.readCredential,
    allowedOrigins: () => ['https://other.example']
  });
  expect((await denied(runtime.owner, body(), true)).success).toBe(false);
  expect(f.readCredential).not.toHaveBeenCalled();
  f.state.status = 404;
  expect((await f.discover(runtime.owner, body(), true)).errorCode).toBe('UNSUPPORTED_DISCOVERY');
});
