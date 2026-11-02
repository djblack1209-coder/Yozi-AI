import { describe, expect, it, vi } from 'vitest';
import {
  FREE_MODEL_PRESETS,
  freeModelPricing,
  modelConnectionState,
  modelConfigurationVersion
} from '../../laf-backend/functions/_shared/ai-providers/free-model-presets';
import {
  buildLearningRequest,
  parseLearningOutput
} from '../../laf-backend/functions/_shared/ai-providers/learning-provider';
import { readFreeApiCredential } from '../../scripts/build/free-api-catalog.mjs';
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';

describe('免费型号是可核验接入事实，不是任意零价格声明', () => {
  it('Agnes 仅精确 Flash 端点在本地复核期限内有零价，付费别名和未知来源仍拒绝', () => {
    const model = { model: 'agnes-2.5-flash', endpoint: 'https://apihub.agnes-ai.com/v1/chat/completions' };
    expect(freeModelPricing(model, Date.parse('2026-10-26'))).toEqual({
      inputPerMillion: 0,
      outputPerMillion: 0,
      priceVersion: 'agnes-2.5-flash-free-2026-10-26'
    });
    expect(freeModelPricing(model, Date.parse('2026-10-30'))).toBeNull();
    expect(freeModelPricing({ ...model, model: 'agnes-2.5-pro' }, Date.parse('2026-10-26'))).toBeNull();
    expect(freeModelPricing({ ...model, endpoint: 'https://other.example/chat' }, Date.parse('2026-10-26'))).toBeNull();
  });
  it('开发点评严格结构复用原协议和绑定，120B/high/8192不变，保留非流式边界', async () => {
    // The synthetic receipt belongs to this reviewed price window, not today's expired route.
    const receiptClock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-25T12:00:00Z'));
    for (const [key, value] of Object.entries({
      YOZI_BUILD_CHANNEL: 'test',
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      DB_NAME: 'yozi_dev_test',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/yozi_dev_test'
    }))
      vi.stubEnv(key, value);
    vi.resetModules();
    try {
      const provider = await import('../../laf-backend/functions/_shared/ai-providers/learning-provider');
      const rubric = await import('../../laf-backend/functions/_shared/learning-rubric.js');
      const coach = await import('../../laf-backend/functions/_shared/learning-writing-coach.js');
      const input = 'I am writing to invite you to give a lecture.';
      const identity = rubric.writingBandRubric('english2', 'small');
      const request = coach.normalizeCoachRequest({
        contract: coach.WRITING_COACH_CONTRACT,
        phase: 'essay',
        target: 'essay',
        exam: 'english2',
        day: '2026-10-25',
        input,
        task: 'Write an invitation letter.',
        writingBand: {
          contract: rubric.WRITING_BAND_RESULT_CONTRACT,
          promptVersion: rubric.WRITING_BAND_PROMPT_VERSION,
          requestId: 'synthetic-request',
          submissionId: 'synthetic-submission',
          answerHash: rubric.writingAnswerHash(input),
          taskId: 'synthetic-task',
          taskVersion: 1,
          rubricId: identity.id,
          rubricVersion: identity.version
        }
      });
      const config = {
        id: 'synthetic-native',
        provider: 'Groq',
        source: 'byok' as const,
        model: 'openai/gpt-oss-120b',
        endpoint: 'https://api.groq.com/openai/v1/chat/completions',
        maxOutput: 8192,
        capabilities: { structured: true, tools: false, vision: false, stream: false }
      };
      const prepared = provider.prepareCoachFeedbackModel(config, request);
      const payload = provider.buildLearningRequest(prepared, [{ role: 'user', content: input }]);
      expect(payload).toMatchObject({
        max_completion_tokens: 8192,
        reasoning_effort: 'high',
        include_reasoning: false,
        stream: false,
        response_format: { type: 'json_schema', json_schema: { strict: true } }
      });
      expect(payload).not.toHaveProperty('max_tokens');
      const schema = prepared.writingOutput!.schema;
      const inspect = (value: any) => {
        if (!value || typeof value !== 'object') return;
        if (value.type === 'object') {
          expect(value.additionalProperties).toBe(false);
          expect(value.required).toEqual(Object.keys(value.properties));
        }
        if (Array.isArray(value.enum)) expect(value.enum.every((item: unknown) => typeof item !== 'number')).toBe(true);
        for (const item of Object.values(value)) if (typeof item === 'object') inspect(item);
      };
      inspect(schema);
      expect(schema.properties.coach.properties.strengths.items.type).toBe('string');
      expect(schema.properties.coach.properties.phrases).toMatchObject({
        maxItems: 6,
        items: { minLength: 1, maxLength: 240 }
      });
      expect(schema.properties.coach.properties.bandResult.properties.binding.properties.answerHash.enum).toEqual([
        rubric.writingAnswerHash(input)
      ]);
      expect(schema.properties.coach.properties.bandResult.properties.scoreEstimate.type).toBe('null');
      const classifiedRequest = coach.normalizeCoachRequest({ ...request, feedbackVersion: 2 });
      const classified = provider.prepareCoachFeedbackModel(config, classifiedRequest);
      const freeConfig = {
        ...config,
        id: 'native-free',
        provider: 'OpenRouter',
        model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        capabilities: { ...config.capabilities, structured: false }
      };
      expect(provider.prepareCoachFeedbackModel(freeConfig, classifiedRequest)).toBe(freeConfig);
      const local = provider.prepareCoachFeedbackModel(freeConfig, classifiedRequest, false, false, true);
      expect(local.writingOutput!.schema).toEqual(classified.writingOutput!.schema);
      const platformFree = { ...freeConfig, source: 'platform' as const };
      const { costFromUsage } = await import('../../laf-backend/functions/proxy-ai');
      const receipt = {
        prompt_tokens: 20,
        completion_tokens: 30,
        total_tokens: 50,
        cost: 0,
        is_byok: false,
        cost_details: {
          upstream_inference_cost: 0,
          upstream_inference_prompt_cost: 0,
          upstream_inference_completions_cost: 0
        },
        prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0, audio_tokens: 0, video_tokens: 0 },
        completion_tokens_details: { reasoning_tokens: 20, image_tokens: 0, audio_tokens: 0 }
      };
      expect(costFromUsage(receipt, platformFree)).toBe(0);
      expect(costFromUsage({ ...receipt, cost: 0.01 }, platformFree)).toBeNull();
      expect(costFromUsage({ ...receipt, new_fee: 0 }, platformFree)).toBeNull();
      expect(costFromUsage({ ...receipt, prompt_tokens_details: { video_tokens: 1 } }, platformFree)).toBeNull();
      expect(provider.prepareCoachFeedbackModel(platformFree, classifiedRequest)).toBe(platformFree);
      expect(
        provider.prepareCoachFeedbackModel(platformFree, classifiedRequest, false, false, true).writingOutput!.schema
      ).toEqual(local.writingOutput!.schema);
      expect(provider.buildLearningRequest(local, [])).toMatchObject({
        max_tokens: 8192,
        temperature: 0,
        reasoning: { effort: 'high' }
      });
      expect(provider.buildLearningRequest(local, [])).not.toHaveProperty('reasoning_effort');
      const functionModel = { ...local, plainCoachRequest: 'synthetic-native-format' };
      const functionWire = provider.buildLearningRequest(functionModel, []);
      expect(functionWire).toMatchObject({
        tools: [
          { type: 'function', function: { name: 'yozi_coach_response', parameters: local.writingOutput!.schema } }
        ],
        tool_choice: { type: 'function', function: { name: 'yozi_coach_response' } }
      });
      expect(functionWire).not.toHaveProperty('response_format');
      const functionReply = {
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              content: null,
              tool_calls: [
                { type: 'function', function: { name: 'yozi_coach_response', arguments: '{"message":"原始JSON"}' } }
              ]
            }
          }
        ]
      };
      expect(provider.readCoachFunctionResponse(functionModel, functionReply)).toBe('{"message":"原始JSON"}');
      functionReply.choices[0].message.tool_calls[0].function.name = 'unrequested_action';
      expect(() => provider.readCoachFunctionResponse(functionModel, functionReply)).toThrowError(
        expect.objectContaining({ code: 'COACH_INVALID', path: 'tools' })
      );
      const jsonModel = {
        ...classified,
        writingOutput: { ...classified.writingOutput!, format: 'json_object' as const }
      };
      const jsonBody = provider.buildLearningRequest(jsonModel, []);
      expect(jsonBody.response_format).toEqual({ type: 'json_object' });
      expect(jsonBody).toMatchObject({
        reasoning_effort: 'high',
        max_completion_tokens: 8192,
        include_reasoning: false,
        stream: false
      });
      const prompt = coach.coachSystemPrompt(classifiedRequest, classified.writingOutput!.schema);
      expect(prompt.split(JSON.stringify(classified.writingOutput!.schema))).toHaveLength(2);
      expect(prompt).not.toContain('示例中的教学文字只是字段说明');
      expect(() =>
        provider.validateCoachSchema(classified.writingOutput!.schema, { message: 'only message' })
      ).toThrowError(expect.objectContaining({ path: 'root.question', schemaKeyword: 'required' }));
      expect(() => provider.prepareCoachFeedbackModel(config, request, true)).toThrow('不支持流式');
      const summaryInput = { ...request, phase: 'summary', target: 'summary' };
      delete summaryInput.writingBand;
      const summaryRequest = coach.normalizeCoachRequest(summaryInput);
      expect(provider.prepareCoachFeedbackModel(config, summaryRequest)).toBe(config);
      const summary = provider.prepareCoachFeedbackModel(config, summaryRequest, false, true);
      expect(summary.writingOutput!.schema.properties.coach.required).toEqual(['kind', 'learned', 'tomorrow']);
      expect(() =>
        provider.validateCoachSchema(summary.writingOutput!.schema, {
          message: '已保存的小结',
          question: null,
          tools: [],
          coach: { kind: 'summary', learned: ['已提交写作原答'], tomorrow: ['复习已保存句式'] }
        })
      ).not.toThrow();
      expect(coach.coachSystemPrompt(summaryRequest, summary.writingOutput!.schema)).toContain('不写次数或数量统计');
      expect(() =>
        provider.validateCoachSchema(summary.writingOutput!.schema, {
          message: '已保存的小结',
          question: null,
          tools: [],
          coach: { kind: 'summary', learned: ['有效条目', ''], tomorrow: ['复习句式'] }
        })
      ).toThrowError(expect.objectContaining({ path: 'root.coach.learned[1]', schemaKeyword: 'stringLength' }));
    } finally {
      receiptClock.mockRestore();
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
  it('Groq已核20B仅在精确原生路由开启high，不从型号推定账户免费', () => {
    const model = {
      id: 'synthetic-groq-high',
      provider: 'Groq',
      model: 'openai/gpt-oss-20b',
      endpoint: 'https://api.groq.com/openai/v1/chat/completions',
      maxOutput: 2000,
      capabilities: { structured: true, tools: false, vision: false, stream: false }
    };
    expect(buildLearningRequest(model, [])).toMatchObject({
      reasoning_effort: 'high',
      max_tokens: 2000,
      response_format: { type: 'json_object' }
    });
    expect(buildLearningRequest(model, [])).not.toHaveProperty('include_reasoning');
    expect(buildLearningRequest({ ...model, endpoint: 'https://other.example/chat' }, [])).not.toHaveProperty(
      'reasoning_effort'
    );
    expect(freeModelPricing(model, Date.parse('2026-10-24'))).toBeNull();
    const legacy = crypto
      .createHash('sha256')
      .update(
        JSON.stringify([model.id, model.model, model.provider, model.endpoint, '', model.maxOutput, model.capabilities])
      )
      .digest('hex');
    expect(modelConfigurationVersion(model)).not.toBe(legacy);
  });
  it('OpenRouter Ultra精确免费路由使用原生最高high，复核过期和其他路由保持未知', () => {
    const model = {
      id: 'synthetic-ultra',
      provider: 'OpenRouter',
      model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      maxOutput: 2000,
      capabilities: { structured: false, tools: false, vision: false, stream: false }
    };
    expect(buildLearningRequest(model, [])).toMatchObject({ reasoning: { effort: 'high' }, max_tokens: 2000 });
    expect(freeModelPricing(model, Date.parse('2026-10-24'))).toEqual({
      inputPerMillion: 0,
      outputPerMillion: 0,
      priceVersion: 'openrouter-nemotron-3-ultra-free-2026-10-30'
    });
    expect(freeModelPricing(model, Date.parse('2026-11-01'))).toMatchObject({
      inputPerMillion: 0,
      outputPerMillion: 0
    });
    expect(freeModelPricing(model, Date.parse('2026-11-02'))).toBeNull();
    const other = { ...model, endpoint: 'https://other.example/chat' };
    expect(buildLearningRequest(other, [])).not.toHaveProperty('reasoning');
    expect(freeModelPricing(other, Date.parse('2026-10-24'))).toBeNull();
    expect(
      freeModelPricing({ ...model, model: model.model.replace(':free', '') }, Date.parse('2026-10-24'))
    ).toBeNull();
    const legacy = crypto
      .createHash('sha256')
      .update(
        JSON.stringify([model.id, model.model, model.provider, model.endpoint, '', model.maxOutput, model.capabilities])
      )
      .digest('hex');
    expect(modelConfigurationVersion(model)).not.toBe(legacy);
  });
  it('普通和历史配置哈希保持旧定义，新输出策略只改变对应配置的出处', () => {
    const model = {
      id: 'fixture',
      model: 'plain-fixture',
      provider: 'Fixture',
      endpoint: 'https://provider.example/chat/completions',
      keyRef: 'synthetic-key-reference',
      maxOutput: 1000,
      capabilities: { structured: true, tools: false, vision: false, stream: true }
    };
    const legacy = crypto
      .createHash('sha256')
      .update(
        JSON.stringify([
          model.id,
          model.model,
          model.provider,
          model.endpoint,
          model.keyRef,
          model.maxOutput,
          model.capabilities
        ])
      )
      .digest('hex');
    expect(modelConfigurationVersion(model)).toBe(legacy);
    const prepared = {
      ...model,
      maxOutput: 2000,
      writingOutput: {
        contract: 'writing-feedback-output-v1',
        inferencePolicy: 'groq-writing-strict-v1',
        reasoningEffort: 'low',
        schemaDigest: 'a'.repeat(64)
      }
    };
    expect(modelConfigurationVersion(prepared)).not.toBe(legacy);
    expect(
      modelConfigurationVersion({
        ...prepared,
        writingOutput: {
          ...prepared.writingOutput,
          schemaDigest: 'b'.repeat(64)
        }
      })
    ).not.toBe(modelConfigurationVersion(prepared));
    expect(
      modelConnectionState(model, [
        {
          modelId: model.id,
          model: model.model,
          status: 'completed',
          at: Date.now(),
          configurationVersion: modelConfigurationVersion(prepared)
        }
      ]).connectionStatus
    ).toBe('untested');
    const agnes = { ...model, model: 'agnes-2.5-flash', endpoint: 'https://apihub.agnes-ai.com/v1/chat/completions' };
    const agnesLegacy = crypto
      .createHash('sha256')
      .update(
        JSON.stringify([
          agnes.id,
          agnes.model,
          agnes.provider,
          agnes.endpoint,
          agnes.keyRef,
          agnes.maxOutput,
          agnes.capabilities
        ])
      )
      .digest('hex');
    expect(modelConfigurationVersion(agnes)).not.toBe(agnesLegacy);
  });
  it('只有精确端点/型号且复核未过期时确认零价格，Gemini账户层和FlashX不冒充免费', () => {
    const p = FREE_MODEL_PRESETS.find((preset) => preset.id === 'zhipu-glm-flash')!;
    expect(freeModelPricing(p, Date.parse('2026-10-30'))).toMatchObject({
      inputPerMillion: 0,
      priceVersion: 'zhipu-glm-4.7-flash-free-2026-10-30'
    });
    expect(freeModelPricing({ ...p, model: 'glm-4.7-flashx' })).toBeNull();
    expect(freeModelPricing({ ...p, endpoint: 'https://another.example/chat' })).toBeNull();
    expect(freeModelPricing(p, Date.parse('2026-11-29'))).toBeNull();
    expect(freeModelPricing(FREE_MODEL_PRESETS.find((preset) => preset.id === 'gemini-flash-lite')!)).toBeNull();
    for (const preset of FREE_MODEL_PRESETS.filter((item) => item.id.endsWith('-flagship')))
      expect(freeModelPricing(preset)).toBeNull();
  });
  it('思考参数只适配指定供应商型号，其他模型不静默变更', () => {
    const config: any = {
      ...FREE_MODEL_PRESETS.find((preset) => preset.id === 'zhipu-glm-flash'),
      maxOutput: 1000,
      capabilities: { structured: true }
    };
    expect(buildLearningRequest(config, [])).toMatchObject({
      thinking: { type: 'enabled' },
      max_tokens: 1000,
      stream: false
    });
    expect(buildLearningRequest({ ...config, endpoint: 'https://other.example/chat' }, [])).not.toHaveProperty(
      'thinking'
    );
    expect(
      buildLearningRequest({ ...config, ...FREE_MODEL_PRESETS.find((p) => p.id === 'gemini-flash-lite') }, [])
    ).toHaveProperty('reasoning_effort', 'none');
    expect(
      buildLearningRequest(
        { ...config, model: 'agnes-2.5-flash', endpoint: 'https://apihub.agnes-ai.com/v1/chat/completions' },
        []
      )
    ).toMatchObject({ chat_template_kwargs: { enable_thinking: true }, max_tokens: 1000 });
    expect(
      buildLearningRequest({ ...config, model: 'agnes-2.5-flash', endpoint: 'https://other.example/chat' }, [])
    ).not.toHaveProperty('chat_template_kwargs');
    expect(
      buildLearningRequest(
        { ...config, model: 'glm-4.5-flash', endpoint: 'https://api.z.ai/api/paas/v4/chat/completions' },
        []
      )
    ).toMatchObject({ thinking: { type: 'disabled' } });
    const nvidia = {
      ...config,
      endpoint: 'https://integrate.api.nvidia.com/v1/chat/completions',
      model: 'openai/gpt-oss-20b'
    };
    expect(buildLearningRequest(nvidia, [])).toHaveProperty('reasoning_effort', 'low');
    expect(buildLearningRequest({ ...nvidia, endpoint: 'https://other.example/chat' }, [])).not.toHaveProperty(
      'reasoning_effort'
    );
    expect(buildLearningRequest({ ...nvidia, model: 'other-model' }, [])).not.toHaveProperty('reasoning_effort');
    // DeepSeek 只在开发付费兜底配置上关思考；用户自己接的同端点连接不变。
    const deepseek = { ...config, model: 'deepseek-flash', endpoint: 'https://api.deepseek.com/chat/completions' };
    expect(buildLearningRequest({ ...deepseek, devPaidFallback: true }, [])).toMatchObject({
      thinking: { type: 'disabled' }
    });
    expect(buildLearningRequest(deepseek, [])).not.toHaveProperty('thinking');
  });
  it('连接状态取同一配置的最近真实调用，失败及过期不会显示仍然连接', () => {
    const model = { id: 'selected', model: 'glm-4.7-flash' };
    const now = 100000000;
    expect(modelConnectionState(model, [], now).connectionStatus).toBe('untested');
    const calls = [
      {
        modelId: 'selected',
        model: model.model,
        status: 'completed',
        at: now,
        configurationVersion: modelConfigurationVersion(model)
      }
    ];
    expect(modelConnectionState(model, calls, now).connectionStatus).toBe('connected');
    expect(
      modelConnectionState(model, [...calls, { ...calls[0], status: 'failed', errorCode: 'RATE_LIMITED' }], now)
        .connectionStatus
    ).toBe('failed');
    expect(modelConnectionState(model, calls, now + 86400001).connectionStatus).toBe('stale');
    expect(modelConnectionState({ ...model, id: 'other-profile' }, calls, now).connectionStatus).toBe('untested');
  });
  it('换密钥、端点或能力后不冒用旧连接结果；流式与普通调用分别报告', () => {
    const model = {
      id: 'fixture',
      model: 'explicit',
      endpoint: 'https://fixture.example/chat',
      keyRef: 'fixture-ref-one',
      capabilities: { stream: true }
    };
    const now = Date.now(),
      call = {
        modelId: 'fixture',
        model: model.model,
        at: now,
        status: 'completed',
        configurationVersion: modelConfigurationVersion(model)
      };
    expect(modelConnectionState(model, [call], now)).toMatchObject({
      connectionStatus: 'connected',
      streamStatus: 'untested'
    });
    expect(modelConnectionState(model, [{ ...call, transport: 'sse-v1' }], now).streamStatus).toBe('connected');
    for (const changed of [
      { ...model, keyRef: 'fixture-ref-two' },
      { ...model, endpoint: 'https://other.example/chat' },
      { ...model, capabilities: { stream: true, structured: true } }
    ])
      expect(modelConnectionState(changed, [call], now)).toMatchObject({
        connectionStatus: 'untested',
        streamStatus: 'untested'
      });
    expect(modelConnectionState(model, [{ ...call, configurationVersion: undefined }], now).connectionStatus).toBe(
      'untested'
    );
  });
  it('单一JSON围栏适配仍校验工具权限，正文和代码不会当工具执行', () => {
    expect(parseLearningOutput('```json\n{"message":"练习","tools":[]}\n```').structured).toBe(true);
    expect(() =>
      parseLearningOutput('```json\n{"message":"run","tools":[{"name":"shell","arguments":{}}]}\n```')
    ).toThrow('未授权');
    expect(parseLearningOutput('正文```js\nprocess.exit()\n```').tools).toEqual([]);
  });
  it('私有HTML只读取批准的数据字面量，拒绝端点替换、公开权限和可执行密钥表达式', () => {
    const dir = mkdtempSync(join(tmpdir(), 'exam-free-catalog-'));
    const file = join(dir, 'private.html');
    const catalog = (key = '"test-only-private-key"', base = 'https://approved.example/v1') =>
      `<script>const rows=[{id:'approved',status:'verified',base:'${base}',keys:[${key}]}];throw new Error('must not execute');</script>`;
    try {
      writeFileSync(file, catalog(), { mode: 0o600 });
      expect(readFreeApiCredential(file, 'approved', 'https://approved.example/v1')).toBe('test-only-private-key');
      chmodSync(file, 0o644);
      expect(() => readFreeApiCredential(file, 'approved', 'https://approved.example/v1')).toThrow();
      chmodSync(file, 0o600);
      writeFileSync(file, catalog('(()=>"test-only-key")()'));
      expect(() => readFreeApiCredential(file, 'approved', 'https://approved.example/v1')).toThrow('usable');
      writeFileSync(file, catalog('"test-only-private-key"', 'https://attacker.example'));
      expect(() => readFreeApiCredential(file, 'approved', 'https://approved.example/v1')).toThrow('approved');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

it('普通文本连接不能冒充图片成功；图片状态按同配置/实际模式、过期与失败报告', () => {
  const model = {
    id: 'vision',
    model: 'explicit',
    capabilities: { vision: true },
    visionAdapter: 'openai-image-url-v1'
  };
  const at = 100000000,
    configurationVersion = modelConfigurationVersion(model);
  const call = { modelId: 'vision', model: 'explicit', status: 'completed', at, configurationVersion };
  expect(modelConnectionState(model, [call], at).visionStatus).toBe('untested');
  expect(modelConnectionState(model, [{ ...call, inputMode: 'image' }], at).visionStatus).toBe('connected');
  expect(modelConnectionState(model, [{ ...call, inputMode: 'image' }], at + 86400001).visionStatus).toBe('stale');
  expect(modelConnectionState(model, [{ ...call, inputMode: 'image', status: 'failed' }], at).visionStatus).toBe(
    'failed'
  );
  expect(modelConnectionState({ ...model, model: 'changed' }, [{ ...call, inputMode: 'image' }], at).visionStatus).toBe(
    'untested'
  );
  expect(
    modelConnectionState({ ...model, visionAdapter: undefined }, [{ ...call, inputMode: 'image' }], at).visionStatus
  ).toBe('undeclared');
});

it('Dots 免费路由只在核价期限和精确端点生效，不强制采用失败试验的推理参数', () => {
  const model = {
    model: 'dots-studio/dots-3-note-preview:free',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    maxOutput: 8192,
    timeoutMs: 60000,
    source: 'byok',
    capabilities: { tools: true, structured: true },
    capabilityCheck: { version: 1, tools: true, structured: true, checkedAt: 1 }
  } as any;
  expect(freeModelPricing(model, Date.parse('2026-10-30'))).toMatchObject({ inputPerMillion: 0, outputPerMillion: 0 });
  expect(freeModelPricing(model, Date.parse('2026-11-02'))).toBeNull();
  expect(freeModelPricing({ ...model, model: 'dots-studio/dots-3-note-preview' }, Date.parse('2026-10-30'))).toBeNull();
  expect(freeModelPricing({ ...model, endpoint: 'https://other.example/chat' }, Date.parse('2026-10-30'))).toBeNull();
  expect(buildLearningRequest(model, [])).toMatchObject({ max_tokens: 8192 });
  expect(buildLearningRequest(model, [])).not.toHaveProperty('reasoning');
  expect(model.timeoutMs).toBe(60000);
});

it('Agnes 当前零价复核仍限定精确 Flash 路由且到期停用', () => {
  const model = { model: 'agnes-3.0-flash', endpoint: 'https://apihub.agnes-ai.com/v1/chat/completions' };
  expect(freeModelPricing(model, Date.parse('2026-11-02'))).toEqual({
    inputPerMillion: 0,
    outputPerMillion: 0,
    priceVersion: 'agnes-3.0-flash-free-2026-11-02'
  });
  expect(freeModelPricing(model, Date.parse('2026-11-05'))).toBeNull();
  expect(freeModelPricing({ ...model, model: 'agnes-3.0-pro' }, Date.parse('2026-11-02'))).toBeNull();
  expect(
    freeModelPricing({ ...model, endpoint: 'https://other.example/v1/chat/completions' }, Date.parse('2026-11-02'))
  ).toBeNull();
});
