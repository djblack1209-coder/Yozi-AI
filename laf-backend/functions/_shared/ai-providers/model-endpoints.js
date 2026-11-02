// Public connection facts only. Account identifiers and credentials never belong here.
export const MODEL_API_KEY_MAX_LENGTH = 2048;
export const MODEL_ENDPOINTS = [
  ['deepseek', 'DeepSeek', 'https://api.deepseek.com', 'https://api-docs.deepseek.com/guides/json_mode/'],
  [
    'gemini',
    'Google Gemini',
    'https://generativelanguage.googleapis.com/v1beta/openai',
    'https://ai.google.dev/gemini-api/docs/openai'
  ],
  ['groq', 'Groq', 'https://api.groq.com/openai/v1', 'https://console.groq.com/docs/api-reference'],
  ['agnes', 'Agnes AI', 'https://apihub.agnes-ai.com/v1', 'https://wiki.agnes-ai.com/en/docs/quickstart'],
  [
    'openrouter',
    'OpenRouter',
    'https://openrouter.ai/api/v1',
    'https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request'
  ],
  ['aion', 'Aion Labs', 'https://api.aionlabs.ai/v1', 'https://www.aionlabs.ai/docs/'],
  ['llm7', 'LLM7', 'https://api.llm7.io/v1', 'https://docs.llm7.io/'],
  ['zai', 'Z.ai', 'https://api.z.ai/api/paas/v4', 'https://docs.z.ai/api-reference/llm/chat-completion'],
  ['ollama_cloud', 'Ollama Cloud', 'https://ollama.com/v1', 'https://docs.ollama.com/api/openai-compatibility'],
  ['mistral', 'Mistral', 'https://api.mistral.ai/v1', 'https://docs.mistral.ai/api/endpoint/chat'],
  ['nvidia', 'NVIDIA NIM', 'https://integrate.api.nvidia.com/v1', 'https://docs.api.nvidia.com/nim/reference/llm-apis'],
  [
    'ovh',
    'OVHcloud',
    'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',
    'https://www.ovhcloud.com/en/public-cloud/ai-endpoints/catalog/'
  ],
  ['cohere', 'Cohere', 'https://api.cohere.ai/compatibility/v1', 'https://docs.cohere.com/docs/compatibility-api'],
  [
    'huggingface',
    'Hugging Face',
    'https://router.huggingface.co/v1',
    'https://huggingface.co/docs/inference-providers/tasks/chat-completion'
  ],
  [
    'siliconflow',
    'SiliconFlow',
    'https://api.siliconflow.cn/v1',
    'https://docs.siliconflow.cn/docs/api/chat-completions-post'
  ],
  [
    'cloudflare',
    'Cloudflare Workers AI',
    'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1',
    'https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/'
  ],
  ['kilo', 'Kilo Gateway', 'https://api.kilo.ai/api/gateway', 'https://kilo.ai/docs/gateway/models-and-providers'],
  [
    'modelscope',
    'ModelScope',
    'https://api-inference.modelscope.cn/v1',
    'https://modelscope.cn/docs/model-service/API-Inference/intro'
  ],
  ['zhipu', '智谱', 'https://open.bigmodel.cn/api/paas/v4', 'https://docs.bigmodel.cn/cn/api/introduction'],
  ['cerebras', 'Cerebras', 'https://api.cerebras.ai/v1', 'https://inference-docs.cerebras.ai/resources/openai'],
  ['sambanova', 'SambaNova', 'https://api.sambanova.ai/v1', 'https://docs.sambanova.ai/docs/en/integrations/vscode'],
  [
    'dashscope',
    '通义千问（阿里云百炼）',
    'https://dashscope.aliyuncs.com/compatible-mode/v1',
    'https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope'
  ],
  ['moonshot', '月之暗面 Kimi', 'https://api.moonshot.cn/v1', 'https://platform.kimi.com/docs/models'],
  [
    'ark',
    '豆包（火山方舟）',
    'https://ark.cn-beijing.volces.com/api/v3',
    'https://console.volcengine.com/ark/region:cn-beijing/docs/ark/base-url-and-authentication'
  ],
  [
    'qianfan',
    '百度文心（千帆）',
    'https://qianfan.baidubce.com/v2',
    'https://cloud.baidu.com/doc/qianfan-api/s/3m7of64lb'
  ],
  [
    'hunyuan',
    '腾讯混元',
    'https://tokenhub.tencentmaas.com/v1',
    'https://cloud.tencent.com/document/product/1823/135872',
    'https://api.hunyuan.cloud.tencent.com/v1'
  ],
  [
    'minimax',
    'MiniMax',
    'https://api.minimax.cn/v1',
    'https://platform.minimax.cn/docs/guides/text-generation',
    'https://api.minimaxi.com/v1'
  ],
  ['stepfun', '阶跃星辰', 'https://api.stepfun.com/v1', 'https://platform.stepfun.com/docs/zh/guides/models/list'],
  ['spark', '讯飞星火', 'https://spark-api-open.xf-yun.com/x2', 'https://www.xfyun.cn/doc/spark/X1http.html'],
  ['yi', '零一万物', 'https://api.lingyiwanwu.com/v1', 'https://platform.lingyiwanwu.com/docs'],
  ['baichuan', '百川智能', 'https://api.baichuan-ai.com/v1', 'https://platform.baichuan-ai.com/docs-v2/api']
].map(([id, provider, baseURL, docs, legacyBaseURL]) =>
  Object.freeze({
    id,
    provider,
    baseURL,
    endpoint: `${baseURL}/chat/completions`,
    docs,
    ...(legacyBaseURL ? { legacyBaseURL } : {})
  })
);

// Only exact documented base paths are completed. Unknown custom paths stay unchanged;
// HTTPS, the deployment allowlist, DNS/public-address checks and TLS still apply at the caller.
export function completeModelEndpoint(raw) {
  if (typeof raw !== 'string') return raw;
  const value = raw.trim();
  let url;
  try {
    url = new URL(value);
  } catch {
    return value;
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.port && url.port !== '443')
  )
    return value;
  const base = url.href.replace(/\/$/, '');
  const known = MODEL_ENDPOINTS.find(
    (item) => item.id !== 'cloudflare' && (item.baseURL === base || item.legacyBaseURL === base)
  );
  if (known) return `${base}/chat/completions`;
  if (
    url.origin === 'https://api.cloudflare.com' &&
    /^\/client\/v4\/accounts\/[a-fA-F0-9]{32}\/ai\/v1\/?$/.test(url.pathname)
  )
    return `${base}/chat/completions`;
  return value;
}

const endpointFor = (id) => MODEL_ENDPOINTS.find((item) => item.id === id);
const privacyFor = (provider) => `当前学习上下文经本项目后端发送至${provider}；资料不默认整份上传。`;

// Classification is the documented provider/endpoint pair, never the hosted model name or TLD.
const domesticProviders = new Set([
  'deepseek',
  'zhipu',
  'dashscope',
  'moonshot',
  'ark',
  'hunyuan',
  'minimax',
  'baichuan',
  'siliconflow',
  'modelscope',
  'qianfan',
  'stepfun',
  'spark',
  'yi'
]);
export function visibleModelChoices(choices, savedModels) {
  return choices.filter((choice) => {
    const endpoint = completeModelEndpoint(choice.endpoint);
    return (
      isDomesticModel(choice) ||
      savedModels.some(
        (saved) =>
          saved.configured === true &&
          saved.provider === choice.provider &&
          saved.model === choice.model &&
          completeModelEndpoint(saved.endpoint) === endpoint
      )
    );
  });
}
export function isDomesticModel(choice) {
  const source = MODEL_ENDPOINTS.find(
    (item) =>
      item.provider === choice.provider &&
      (item.endpoint === completeModelEndpoint(choice.endpoint) ||
        `${item.legacyBaseURL}/chat/completions` === completeModelEndpoint(choice.endpoint))
  );
  return Boolean(source && domesticProviders.has(source.id));
}

// Templates do not create a connection or prove that a particular account has free quota.
export const MODEL_CONNECTION_PRESETS = [
  ...[
    ['zhipu', 'glm-5.3', 'https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3'],
    ['deepseek', 'deepseek-v4-pro', 'https://api-docs.deepseek.com/quick_start/pricing/']
  ].map(([providerId, model, docs]) => {
    const source = endpointFor(providerId);
    return {
      id: `${providerId}-flagship`,
      provider: source.provider,
      model,
      endpoint: source.endpoint,
      structured: true,
      stream: true,
      pricing: 'provider_account',
      terms: '当前旗舰按账户实际用量计费，须自行确认该型号可用额度；不沿用其他免费型号的价格，不自动充值或回退。',
      privacy: privacyFor(source.provider),
      docs
    };
  }),
  {
    id: 'zhipu-glm-flash',
    provider: '智谱',
    model: 'glm-4.7-flash',
    endpoint: endpointFor('zhipu').endpoint,
    structured: true,
    stream: true,
    pricing: 'official_free_model',
    priceVersion: 'zhipu-glm-4.7-flash-free-2026-10-30',
    verifiedAt: '2026-10-30',
    expiresAt: '2026-11-29',
    terms: '官方免费型号，仍受账户限流；不调用搜索等收费工具，不切换FlashX。',
    privacy: '当前目标、最近消息与题目经本项目后端发送至智谱；资料不默认整份上传。',
    docs: 'https://docs.bigmodel.cn/cn/guide/start/pricing.md'
  },
  {
    id: 'zai-glm-flash',
    provider: 'Z.ai',
    model: 'glm-4.5-flash',
    endpoint: endpointFor('zai').endpoint,
    structured: true,
    pricing: 'official_free_model',
    priceVersion: 'zai-glm-4.5-flash-free-2026-10-20',
    verifiedAt: '2026-10-20',
    expiresAt: '2026-11-19',
    terms: '官方免费型号，仍受账户限流；不调用搜索等收费工具，不切换FlashX。',
    privacy: '当前目标、最近消息与题目经本项目后端发送至Z.ai；资料不默认整份上传。',
    docs: 'https://docs.z.ai/guides/overview/pricing'
  },
  {
    id: 'agnes-flash-free',
    provider: 'Agnes AI',
    model: 'agnes-2.5-flash',
    endpoint: endpointFor('agnes').endpoint,
    structured: false,
    pricing: 'official_free_model',
    priceVersion: 'agnes-2.5-flash-free-2026-10-26',
    verifiedAt: '2026-10-26',
    expiresAt: '2026-10-30',
    terms: '仅此精确 Flash 文本型号按官方当前零价使用；本地价格复核到期即停用，不回退 Pro、付费别名或其他端点。',
    privacy: privacyFor('Agnes AI'),
    docs: 'https://wiki.agnes-ai.com/en/docs/pricing'
  },
  {
    id: 'agnes-3-flash-free',
    provider: 'Agnes AI',
    model: 'agnes-3.0-flash',
    endpoint: endpointFor('agnes').endpoint,
    structured: false,
    pricing: 'official_free_model',
    priceVersion: 'agnes-3.0-flash-free-2026-11-02',
    verifiedAt: '2026-11-02',
    expiresAt: '2026-11-05',
    terms: '仅此精确 Flash 文本型号按官方当前零价使用；复核到期即停用，不回退 Pro、付费别名或其他端点。',
    privacy: privacyFor('Agnes AI'),
    docs: 'https://wiki.agnes-ai.com/en/docs/pricing'
  },
  {
    id: 'gemini-flash-lite',
    provider: 'Google Gemini',
    model: 'gemini-2.5-flash-lite',
    endpoint: endpointFor('gemini').endpoint,
    structured: true,
    pricing: 'account_free_tier_required',
    terms: '仅账户Free tier时免费；未确认账户套餐时费用待结算。达到限额停止，不切换付费型号。',
    privacy: '免费层数据可能用于供应商改进产品；只共享已授权的当前学习上下文。',
    docs: 'https://ai.google.dev/gemini-api/docs/pricing'
  },
  ...[
    ['groq', 'openai/gpt-oss-20b', '仅账户免费层及剩余额度内使用；不能由目录推断账户套餐。'],
    ['openrouter', 'google/gemma-4-31b-it:free', '固定选择:free型号，限额用尽停止，不切换同名付费路由。'],
    ['aion', 'aion-labs/aion-rp-llama-3.1-8b', '仅账户免费日额度；不充值，不启用付费回退。'],
    ['llm7', 'codestral-latest', '第三方聚合服务；先确认免费套餐、密钥有效期与模型资格。'],
    ['ollama_cloud', 'gpt-oss:20b', '使用云端模型ID，不添加本地:cloud后缀；先确认Free套餐与剩余额度。'],
    ['mistral', 'mistral-small-latest', '仅账户免费试用额度；其他型号可能无额度，不启用按量付费。'],
    ['nvidia', 'openai/gpt-oss-20b', '免费试用资格与限额由账户决定；资料使用条款须先确认。'],
    ['huggingface', 'meta-llama/Llama-3.1-8B-Instruct', '仅每月试用额度；具体推理服务商可能收费，额度不足即停止。'],
    ['modelscope', 'Qwen/Qwen3.8-27B', '目录型号与当前Magicube积分须在账户确认，不按旧每日次数推算。'],
    ['cohere', 'command-a-03-2025', '评估密钥与生产密钥价格不同，按实际账户记录费用。'],
    ['cerebras', 'gpt-oss-120b', '免费试用积分与按量付费以账户为准，不自动充值。'],
    ['sambanova', 'Meta-Llama-3.3-70B-Instruct', '试用资格与剩余额度由账户决定。'],
    ['siliconflow', 'Qwen/Qwen3-8B', '模型资格与账户可用性以供应商为准。'],
    ['kilo', 'kilo-auto/free', '仅指定免费路由，不回退至付费路由。'],
    [
      'dashscope',
      'qwen3.8-max',
      '北京地域公开提供100万Token新人额度，有效期以实际账户为准；其他地域及过期后按量计费，不自动充值或回退。'
    ],
    ['moonshot', 'kimi-k3.1-pro', '当前旗舰需已充值解锁，注册赠券不适用；按实际账户计费，不自动开通、充值或回退。'],
    ['ark', 'doubao-seed-2.0-pro', '以账户实际套餐/免费额度为准；额度用尽停止，不自动充值、不切换付费型号'],
    ['qianfan', 'ernie-4.5-turbo', '以账户实际套餐/免费额度为准；额度用尽停止，不自动充值、不切换付费型号'],
    ['hunyuan', 'hy4-preview', '以账户实际套餐/免费额度为准；额度用尽停止，不自动充值、不切换付费型号'],
    ['minimax', 'MiniMax-M3.1-Flash', '以账户实际套餐/免费额度为准；额度用尽停止，不自动充值、不切换付费型号'],
    ['stepfun', 'step-3.7-flash', '以账户实际套餐/免费额度为准；额度用尽停止，不自动充值、不切换付费型号'],
    ['spark', 'spark-x', '以账户实际套餐/免费额度为准；额度用尽停止，不自动充值、不切换付费型号'],
    ['yi', 'yi-lightning', '以账户实际套餐/免费额度为准；额度用尽停止，不自动充值、不切换付费型号'],
    ['baichuan', 'Baichuan4-Turbo', '以账户实际套餐/免费额度为准；额度用尽停止，不自动充值、不切换付费型号']
  ].map(([providerId, model, terms]) => {
    const source = endpointFor(providerId);
    return {
      id: `${providerId}-catalog`,
      provider: source.provider,
      model,
      endpoint: source.endpoint,
      structured: false,
      pricing:
        providerId === 'openrouter'
          ? 'official_free_model'
          : providerId === 'moonshot'
            ? 'provider_account'
            : 'account_free_tier_required',
      ...(providerId === 'openrouter'
        ? { priceVersion: 'openrouter-gemma4-free-2026-10-20', verifiedAt: '2026-10-20', expiresAt: '2026-11-19' }
        : {}),
      terms,
      privacy: privacyFor(source.provider),
      docs: source.docs
    };
  }),
  {
    id: 'deepseek-flash',
    provider: 'DeepSeek',
    model: 'deepseek-flash',
    endpoint: endpointFor('deepseek').endpoint,
    structured: true,
    pricing: 'provider_account',
    terms: '按 DeepSeek 账户实际套餐计费。',
    privacy: privacyFor('DeepSeek'),
    docs: 'https://api-docs.deepseek.com/guides/json_mode/'
  }
];
