import { describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MODEL_ENDPOINTS,
  MODEL_CONNECTION_PRESETS,
  RELEASE_PROVIDERS,
  completeModelEndpoint,
  visibleModelChoices
} from '../../laf-backend/functions/_shared/ai-providers/model-endpoints.js';
import {
  validateCloudEndpoint,
  resolveCloudEndpoint
} from '../../laf-backend/functions/_shared/ai-providers/learning-provider';
import { MODEL_BRANDS } from '../../src/config/model-brands.js';
import { readFreeApiCatalog } from '../../scripts/build/free-api-catalog.mjs';

const releaseIds = [
  'deepseek',
  'siliconflow',
  'zhipu',
  'dashscope',
  'moonshot',
  'ark',
  'qianfan',
  'hunyuan',
  'minimax',
  'stepfun',
  'spark',
  'yi',
  'baichuan'
];

const domesticProviders = [
  [
    'dashscope',
    '通义千问（阿里云百炼）',
    'https://dashscope.aliyuncs.com/compatible-mode/v1',
    'qwen3.8-max',
    'https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope',
    'qwen-color.svg',
    false
  ],
  [
    'moonshot',
    '月之暗面 Kimi',
    'https://api.moonshot.cn/v1',
    'kimi-k3.1-pro',
    'https://platform.kimi.com/docs/models',
    'moonshot.svg',
    true
  ],
  [
    'ark',
    '豆包（火山方舟）',
    'https://ark.cn-beijing.volces.com/api/v3',
    'doubao-seed-2.0-pro',
    'https://console.volcengine.com/ark/region:cn-beijing/docs/ark/base-url-and-authentication',
    'doubao-color.svg',
    false
  ],
  [
    'qianfan',
    '百度文心（千帆）',
    'https://qianfan.baidubce.com/v2',
    'ernie-4.5-turbo',
    'https://cloud.baidu.com/doc/qianfan-api/s/3m7of64lb',
    'wenxin-color.svg',
    false
  ],
  [
    'hunyuan',
    '腾讯混元',
    'https://tokenhub.tencentmaas.com/v1',
    'hy4-preview',
    'https://cloud.tencent.com/document/product/1823/135872',
    'hunyuan-color.svg',
    false
  ],
  [
    'minimax',
    'MiniMax',
    'https://api.minimax.cn/v1',
    'MiniMax-M3.1-Flash',
    'https://platform.minimax.cn/docs/guides/text-generation',
    'minimax-color.svg',
    false
  ],
  [
    'stepfun',
    '阶跃星辰',
    'https://api.stepfun.com/v1',
    'step-3.7-flash',
    'https://platform.stepfun.com/docs/zh/guides/models/list',
    'stepfun-color.svg',
    false
  ],
  [
    'spark',
    '讯飞星火',
    'https://spark-api-open.xf-yun.com/x2',
    'spark-x',
    'https://www.xfyun.cn/doc/spark/X1http.html',
    'spark-color.svg',
    false
  ],
  [
    'yi',
    '零一万物',
    'https://api.lingyiwanwu.com/v1',
    'yi-lightning',
    'https://platform.lingyiwanwu.com/docs',
    'yi-color.svg',
    true
  ],
  [
    'baichuan',
    '百川智能',
    'https://api.baichuan-ai.com/v1',
    'Baichuan4-Turbo',
    'https://platform.baichuan-ai.com/docs-v2/api',
    'baichuan-color.svg',
    false
  ]
];

describe('模型基础地址与实际请求地址', () => {
  it.each([
    ['https://open.bigmodel.cn/api/paas/v4', 'https://open.bigmodel.cn/api/paas/v4/chat/completions'],
    ['https://api.z.ai/api/paas/v4/', 'https://api.z.ai/api/paas/v4/chat/completions'],
    [
      ' https://generativelanguage.googleapis.com/v1beta/openai/ ',
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
    ],
    ['https://api.groq.com/openai/v1', 'https://api.groq.com/openai/v1/chat/completions'],
    ['https://api.deepseek.com', 'https://api.deepseek.com/chat/completions'],
    ['https://ollama.com/v1', 'https://ollama.com/v1/chat/completions'],
    ['https://api.cohere.ai/compatibility/v1', 'https://api.cohere.ai/compatibility/v1/chat/completions'],
    [
      'https://api.cloudflare.com/client/v4/accounts/00000000000000000000000000000000/ai/v1',
      'https://api.cloudflare.com/client/v4/accounts/00000000000000000000000000000000/ai/v1/chat/completions'
    ]
  ])('只补齐已知基础路径：%s', (base, endpoint) => {
    expect(completeModelEndpoint(base)).toBe(endpoint);
    expect(completeModelEndpoint(endpoint)).toBe(endpoint);
  });

  it.each([
    'https://api.groq.com',
    'https://api.groq.com/openai/v1/chat/completions/chat/completions',
    'https://api.groq.com.evil.example/openai/v1',
    'https://api.groq.com/openai/v1?token=synthetic',
    'https://api.groq.com/openai/v1#part',
    'https://synthetic@api.groq.com/openai/v1',
    'http://api.groq.com/openai/v1',
    'https://api.groq.com:8443/openai/v1',
    'https://custom.example/v1',
    'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1'
  ])('不猜测或重写未知、不安全和未填账户路径：%s', (raw) => {
    expect(completeModelEndpoint(raw)).toBe(raw);
  });

  it('地址补齐不能授予白名单权限，也不能绕过虚拟DNS检查', async () => {
    const endpoint = completeModelEndpoint('https://open.bigmodel.cn/api/paas/v4');
    expect(() => validateCloudEndpoint(endpoint, ['https://api.z.ai'])).toThrow('未获服务端授权');
    await expect(
      resolveCloudEndpoint(endpoint, ['https://open.bigmodel.cn'], async () => [{ address: '198.18.2.94', family: 4 }])
    ).rejects.toMatchObject({ code: 'SSRF_BLOCKED' });
  });

  it.each(domesticProviders)(
    '国内连接器 %s 保留精确端点、账户额度条件与实际品牌资源',
    (id, provider, baseURL, model, docs, logo, mono) => {
      const endpoint = `${baseURL}/chat/completions`;
      const source = MODEL_ENDPOINTS.find((entry) => entry.id === id);
      expect(source).toEqual({
        id,
        provider,
        baseURL,
        endpoint,
        docs,
        ...(id === 'minimax'
          ? { legacyBaseURL: 'https://api.minimaxi.com/v1' }
          : id === 'hunyuan'
            ? { legacyBaseURL: 'https://api.hunyuan.cloud.tencent.com/v1' }
            : {})
      });
      if (source.legacyBaseURL) {
        const legacy = source.legacyBaseURL;
        expect(completeModelEndpoint(legacy)).toBe(`${legacy}/chat/completions`);
        expect(completeModelEndpoint(`${legacy}/chat/completions`)).toBe(`${legacy}/chat/completions`);
      }
      for (const raw of [baseURL, `${baseURL}/`, ` ${baseURL} `, endpoint])
        expect(completeModelEndpoint(raw)).toBe(endpoint);
      for (const raw of [
        `${baseURL}?key=synthetic`,
        `${baseURL}#hash`,
        baseURL.replace('https:', 'http:'),
        `${baseURL}/unknown`
      ])
        expect(completeModelEndpoint(raw)).toBe(raw);
      expect(MODEL_CONNECTION_PRESETS.find((entry) => entry.id === `${id}-catalog`)).toEqual({
        id: `${id}-catalog`,
        provider,
        model,
        endpoint,
        structured: false,
        pricing: id === 'moonshot' ? 'provider_account' : 'account_free_tier_required',
        terms: expect.stringMatching(/不自动/),
        privacy: `当前学习上下文经本项目后端发送至${provider}；资料不默认整份上传。`,
        docs
      });
      const brand = MODEL_BRANDS[provider];
      expect(brand).toEqual({
        logo: `/static/brand/providers/${logo}`,
        group: 'general',
        ...(mono ? { mono: true } : {})
      });
      const file = join(process.cwd(), 'src', brand.logo);
      expect(existsSync(file)).toBe(true);
      const svg = readFileSync(file, 'utf8');
      expect(svg).toMatch(/<svg\b/);
      expect(svg).toMatch(/<path\b/);
      expect(svg).not.toMatch(/<text\b|placeholder/i);
      if (mono) expect(svg).toContain('currentColor');
    }
  );

  it('公开预设不包含账户、凭据或匿名入口；新增试用模板不承诺零价格或视觉能力', () => {
    expect(MODEL_ENDPOINTS).toHaveLength(31);
    expect(new Set(MODEL_CONNECTION_PRESETS.map((p) => p.id)).size).toBe(MODEL_CONNECTION_PRESETS.length);
    for (const preset of MODEL_CONNECTION_PRESETS) {
      expect(preset.endpoint.endsWith('/chat/completions')).toBe(true);
      expect(Object.keys(preset).some((k) => /key|account|token|secret/i.test(k))).toBe(false);
      if (preset.pricing !== 'official_free_model') expect(preset).not.toHaveProperty('priceVersion');
      if (preset.id.endsWith('-catalog')) expect(preset.structured).toBe(false);
    }
    expect(MODEL_CONNECTION_PRESETS.some((p) => /cloudflare|ovh/.test(p.id))).toBe(false);
    expect(MODEL_CONNECTION_PRESETS.find((p) => p.model === 'agnes-3.0-flash')).toMatchObject({
      endpoint: 'https://apihub.agnes-ai.com/v1/chat/completions',
      pricing: 'official_free_model',
      verifiedAt: '2026-11-02'
    });
  });

  it('records the 13 release providers in a frozen map', () => {
    expect(Object.isFrozen(RELEASE_PROVIDERS)).toBe(true);
    expect(Object.keys(RELEASE_PROVIDERS)).toEqual(releaseIds);
    expect(RELEASE_PROVIDERS.siliconflow).toBe('Beijing-GuiJiLiuDongAIYunFuWu-20251201S0112');
  });

  it('offers only release endpoints to new connections, including when older presets are supplied', () => {
    expect(visibleModelChoices(MODEL_ENDPOINTS, []).map(({ id }) => id)).toEqual(releaseIds);
    const releaseEndpoints = MODEL_ENDPOINTS.filter(({ id }) => releaseIds.includes(id)).map(
      ({ endpoint }) => endpoint
    );
    expect(new Set(visibleModelChoices(MODEL_CONNECTION_PRESETS, []).map(({ endpoint }) => endpoint))).toEqual(
      new Set(releaseEndpoints)
    );
  });

  it('still offers a Z.ai choice when its exact connection has a saved credential', () => {
    const choice = MODEL_CONNECTION_PRESETS.find(({ id }) => id === 'zai-glm-flash');
    expect(visibleModelChoices([choice], [{ ...choice, configured: false }])).toEqual([]);
    expect(visibleModelChoices([choice], [{ ...choice, configured: true }])).toEqual([choice]);
  });
});

it('私有目录提取所有型号但不执行脚本、泄露凭据或将鉴权/匿名记录启用为免费连接', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yozi-model-endpoint-'));
  const file = join(dir, 'catalog.html');
  try {
    writeFileSync(
      file,
      `<script>const rows=[
      {id:'gemini_x_auto',base:'https://generativelanguage.googleapis.com/v1beta/openai',status:'verified',models:['gemini-2.5-flash-lite','gemini-2.5-flash-lite','speech-only'],keys:['synthetic-private-catalog-key'],account:'synthetic-account',note:'synthetic-private-note'},
      {id:'cerebras',base:'https://api.cerebras.ai/v1',status:'authenticated',models:['gpt-oss-120b'],keys:['synthetic-authenticated-key']},
      {id:'ovh',base:'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',status:'verified',models:['chat-model'],keys:[]},
      {id:'zhipu',base:'https://wrong.example/api/paas/v4',status:'verified',models:['glm-4.7-flash'],keys:['synthetic-private-other-key']}
    ]; throw new Error('must not run');</script>`,
      { mode: 0o600 }
    );
    const rows = readFreeApiCatalog(file);
    expect(rows[0]).toMatchObject({
      id: 'gemini_x_auto',
      providerId: 'gemini',
      modelEntries: 3,
      connectionStatus: 'untested',
      presetIds: ['gemini-flash-lite']
    });
    expect(rows[0].models).toEqual(['gemini-2.5-flash-lite', 'speech-only']);
    expect(rows[1]).toMatchObject({ credentialAvailable: true, presetIds: [] });
    expect(rows[2]).toMatchObject({ credentialAvailable: false, presetIds: [] });
    expect(rows[3]).toMatchObject({ baseMatchesOfficial: false, endpoint: null, presetIds: [] });
    expect(JSON.stringify(rows)).not.toMatch(
      /synthetic-private|synthetic-authenticated|synthetic-account|must not run/
    );
    chmodSync(file, 0o644);
    expect(() => readFreeApiCatalog(file)).toThrow('private local file');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
