import { WRITING_PERSONAL_CORPUS_CONTRACT } from './_shared/learning-writing-corpus.js';
import { ProviderError } from './_shared/ai-providers/learning-provider.js';
import cloud from '@lafjs/cloud';
import {
  normalizeIntakeContext,
  MODEL_INTAKE_CONTRACT,
  MODEL_INTAKE_CONTRACTS,
  SINGLE_QUESTION_CONTRACT
} from './_shared/learning-intake.js';
import { EXAM_SCOPE_CONTRACTS } from './_shared/learning-exam-scope.js';
import { SUBJECT_COACH_METHODS } from './_shared/learning-coach-methods.js';
import { PRESENTATION_CONTRACT } from './_shared/learning-content-blocks.js';
import crypto from 'node:crypto';
import { requireAuth, isAuthError } from './_shared/auth-middleware.js';
import { requireActiveUser } from './_shared/active-user.js';
import { checkRateLimitDistributed } from './_shared/api-response.js';
import { DEV_TEST } from './_shared/build-channel.js';
import { createModelDiscovery } from './_shared/ai-providers/model-discovery.js';
import proxyAI, { configuredModels, runLearningModelTask } from './proxy-ai.js';
import { readModelCredential } from './_shared/model-connections.js';
import { modelErrorPresentation } from './_shared/model-errors.js';
import { FREE_MODEL_PRESETS, modelConnectionState } from './_shared/ai-providers/free-model-presets.js';
import {
  completeModelEndpoint,
  isDomesticModel,
  MODEL_API_KEY_MAX_LENGTH
} from './_shared/ai-providers/model-endpoints.js';
import {
  mutateAccount,
  encryptModelKey,
  recoverStaleReservations,
  modelValidationPath,
  projectResponseDiagnostics,
  cancelCall,
  byokCallLimit,
  latestRepair
} from './_shared/learning-account.js';
import { validateCloudEndpoint } from './_shared/ai-providers/learning-provider.js';
import { refreshSubscriptionEntitlement } from './_shared/learning-subscription.js';
import { cancelActiveLearningCall } from './_shared/learning-model-runtime.js';
import {
  maintainModelResources,
  modelResultPolicy,
  modelResultUnavailable
} from './_shared/learning-model-resources.js';

const discoverModels = createModelDiscovery({
  readProfile: async (owner, profileId) => {
    const id = `learning_${crypto.createHash('sha256').update(owner).digest('hex')}`;
    const account = (
      await cloud
        .database()
        .collection('learning_accounts')
        .where({ _id: id, user_id: owner })
        .field({
          user_id: 1,
          revision: 1,
          'profiles.id': 1,
          'profiles.provider': 1,
          'profiles.endpoint': 1,
          'profiles.keyRef': 1
        })
        .get()
    ).data?.[0];
    const profile = account?.profiles?.find((item: any) => item.id === profileId);
    return profile
      ? {
          owner: account.user_id,
          id: profile.id,
          version: account.revision,
          provider: profile.provider,
          endpoint: profile.endpoint,
          configured: Boolean(profile.keyRef),
          keyRef: profile.keyRef,
          authorization: 'bearer'
        }
      : null;
  },
  allowedOrigins: () => (process.env.LEARNING_ALLOWED_ORIGINS || '').split(',').filter(Boolean),
  readCredential: (profile) => readModelCredential(cloud.database(), profile.owner, profile)
});
export default async function (ctx: any) {
  const auth = requireAuth(ctx);
  if (isAuthError(auth)) return auth;
  const inactive = await requireActiveUser(cloud.database(), auth.userId);
  if (inactive) return inactive;
  const body = ctx.body || {};
  // Discovery has its own per-account rate limit, in addition to profile refresh cooldowns.
  if (body.action === 'discover') {
    if (process.env.LEARNING_MODEL_DISCOVERY_ENABLED === 'false')
      return { success: false, code: 503, errorCode: 'DISCOVERY_DISABLED' };
    const limit = await checkRateLimitDistributed(`learning-discovery:${auth.userId}`, 30, 60000);
    if (!limit.allowed) return { success: false, code: 429, errorCode: 'RATE_LIMITED' };
    const result = await discoverModels(
      auth.userId,
      body,
      true,
      ctx.signal instanceof AbortSignal ? ctx.signal : undefined
    );
    return result.success
      ? result
      : {
          ...result,
          manualEntryAllowed: true,
          ...modelErrorPresentation(result),
          code: result.code,
          errorCode: result.errorCode
        };
  }
  const limit = await checkRateLimitDistributed(`learning-models:${auth.userId}`, DEV_TEST ? 1000000 : 30, 60000);
  if (!limit.allowed) return { code: 429, success: false, message: '请求过于频繁' };
  const db = cloud.database();
  const probeConnection = async (profile: any, requestId: string) => {
    const nonce = crypto
      .createHash('sha256')
      .update(`${auth.userId}:${requestId}:${profile.model}:${profile.endpoint}:${profile.keyRef}`)
      .digest('hex')
      .slice(0, 32);
    const bodyFor = (suffix: string) => ({
      ...ctx,
      body: {
        modelId: profile.id,
        requestId: `${requestId}:${suffix}`,
        shareConsent: true,
        messages: [{ role: 'user', content: '连接能力检查，不含学生内容。' }],
        learningContext: { owner: auth.userId, purpose: 'connection_test' }
      }
    });
    const first = await runLearningModelTask(bodyFor('tool'), { capabilityProbe: { stage: 'tool', nonce } });
    const second =
      first.success && first.data?.capabilityToolCall
        ? await runLearningModelTask(bodyFor('json'), {
            capabilityProbe: { stage: 'json', nonce, toolCall: first.data.capabilityToolCall }
          })
        : first;
    const accepted = Boolean(first.success && first.data?.capabilityToolCall && second.success);
    const checkedAt = Date.now();
    await mutateAccount(db, auth.userId, (account) => {
      const saved = account.profiles.find((item: any) => item.id === profile.id);
      if (
        !saved ||
        saved.model !== profile.model ||
        saved.endpoint !== profile.endpoint ||
        saved.keyRef !== profile.keyRef
      )
        throw new ProviderError('CONTEXT_CHANGED', '连接已变化，未采用旧测试结果');
      saved.capabilities = {
        ...saved.capabilities,
        tools: Boolean(first.success && first.data?.capabilityToolCall),
        structured: accepted
      };
      saved.capabilityCheck = {
        version: 1,
        tools: Boolean(first.success && first.data?.capabilityToolCall),
        structured: accepted,
        checkedAt
      };
      return { account };
    });
    return accepted
      ? {
          code: 0,
          success: true,
          reused: Boolean(first.reused && second.reused),
          data: { id: profile.id, connectionStatus: 'connected', capabilities: { tools: true, structured: true } },
          message: '连接能力检查通过'
        }
      : {
          ...second,
          success: false,
          error: second.error || 'TEACHING_CAPABILITY_REQUIRED',
          message: second.message || '连接已保存，但此型号未通过工具与结构化输出往返测试，不能进入教学'
        };
  };
  try {
    if (body.action === 'preferences') {
      const patch = body.preferences;
      if (
        !patch ||
        typeof patch !== 'object' ||
        Array.isArray(patch) ||
        Object.keys(patch).some((key) => !['selectedModelId', 'sharingAllowed'].includes(key)) ||
        (patch.selectedModelId !== undefined &&
          patch.selectedModelId !== null &&
          (typeof patch.selectedModelId !== 'string' || !/^[a-zA-Z0-9_-]{1,60}$/.test(patch.selectedModelId))) ||
        (patch.sharingAllowed !== undefined && typeof patch.sharingAllowed !== 'boolean')
      )
        return { success: false, code: 400, error: 'INPUT_INVALID' };
      const { account } = await mutateAccount(db, auth.userId, (account) => {
        if (
          patch.selectedModelId &&
          !account.profiles.some((p: any) => p.id === patch.selectedModelId && p.keyRef && !p.requiresModelSelection)
        )
          throw Object.assign(new Error('NEEDS_CONNECTION'), { code: 'NEEDS_CONNECTION' });
        account.modelPreferences = { ...account.modelPreferences, ...patch };
        return { account };
      });
      return { success: true, code: 0, data: account.modelPreferences };
    }
    if (body.action === 'test') {
      if (typeof body.modelId !== 'string' || body.shareConsent !== true)
        return { code: 400, success: false, message: '连接测试会真实调用指定模型，需明确确认' };
      const intake = body.intake ? normalizeIntakeContext(body.intake) : null;
      const account = (await mutateAccount(db, auth.userId, (value) => ({ account: value }))).account;
      const profile = account.profiles.find((item: any) => item.id === body.modelId);
      if (!profile?.keyRef || profile.requiresModelSelection)
        return { code: 422, success: false, message: '请先保存密钥并选择型号' };
      const probe = await probeConnection(profile, body.requestId);
      if (!probe.success || !intake) return probe;
      return proxyAI({
        ...ctx,
        body: {
          modelId: body.modelId,
          requestId: body.requestId,
          shareConsent: true,
          messages: intake?.turns.length
            ? intake.turns.flatMap((turn) => [
                { role: 'assistant', content: turn.question },
                { role: 'user', content: turn.answer }
              ])
            : [
                {
                  role: 'user',
                  content: intake
                    ? '连接成功后，请发出学习建档的第一问。'
                    : '这是连接测试，不是学习作答。仅返回JSON：message为“连接成功”，question为null，tools为空数组。'
                }
              ],
          learningContext: {
            owner: auth.userId,
            purpose: 'connection_test',
            ...(body.intake ? { intake: body.intake } : {})
          }
        }
      });
    }
    if (body.action === 'result') {
      if (typeof body.requestId !== 'string' || !/^[a-zA-Z0-9_:-]{1,160}$/.test(body.requestId))
        return { code: 400, success: false, message: '请求标识不合法' };
      const id = `learning_${crypto.createHash('sha256').update(auth.userId).digest('hex')}`;
      const account = (await db.collection('learning_accounts').where({ _id: id, user_id: auth.userId }).get())
        .data?.[0];
      const policy = modelResultPolicy();
      const maintained = account
        ? await mutateAccount(db, auth.userId, (a) =>
            maintainModelResources(recoverStaleReservations(a).account, Date.now(), policy)
          )
        : null;
      let call = maintained?.account.calls.find((c: any) => c.id === body.requestId);
      const repair = maintained ? latestRepair(maintained.account.calls, body.requestId) : undefined;
      if (call?.status === 'failed' && repair) call = repair;
      if (!call) return { code: 404, success: false, message: '本账户没有此模型请求' };
      if (call.resultDeletedAt) return modelResultUnavailable(call, Date.now(), policy);
      if (call.status === 'completed')
        return (
          modelResultUnavailable(call, Date.now(), policy) || {
            code: 0,
            success: true,
            data: repair ? { ...call.result, requestId: body.requestId, repairRequestId: repair.id } : call.result,
            reused: true
          }
        );
      const validationPath = modelValidationPath(call.errorCode, call.validationPath);
      return {
        code: call.status === 'reserved' ? 409 : call.status === 'cancelled' ? 499 : 503,
        success: false,
        status: call.status,
        ...projectResponseDiagnostics(maintained?.account, body.requestId, auth.userId),
        ...(typeof call.errorCode === 'string' ? { error: call.errorCode } : {}),
        ...(validationPath ? { validationPath } : {}),
        message:
          call.status === 'reserved'
            ? '模型任务仍在执行，尚无可用结果；读取不会重试模型'
            : call.errorCode === 'SSRF_BLOCKED' && call.executionStage === 'not_called'
              ? '本次未调用模型，没有可恢复的回复。请检查网络后重新发送，原答已保留。'
              : '模型任务未完成或已取消，没有可应用的结果；请查看实际用量'
      };
    }
    if (body.action === 'cancel') {
      const { call } = await mutateAccount(db, auth.userId, (account) => cancelCall(account, body.requestId));
      cancelActiveLearningCall(auth.userId, body.requestId);
      return {
        code: 0,
        success: true,
        data: {
          requestId: call.id,
          cancellationRecorded: Boolean(call.cancelRequestedAt),
          status: call.status,
          executionStopped: call.costStatus === 'not_called'
        }
      };
    }
    if (body.action === 'list' || body.action === 'usage') {
      const policy = modelResultPolicy();
      const { account, cache } = await mutateAccount(db, auth.userId, (account) =>
        maintainModelResources(
          refreshSubscriptionEntitlement(recoverStaleReservations(account).account, Date.now()),
          Date.now(),
          policy
        )
      );
      if (body.action === 'usage')
        return {
          code: 0,
          success: true,
          data: {
            entitlement: account.entitlement,
            subscription: (() => {
              const order = account.subscriptions.find((item: any) => item.id === account.entitlement.subscriptionId);
              return order
                ? {
                    plan: ['pro', 'max'].includes(order.plan) ? order.plan : null,
                    status: order.status,
                    environment: order.environment,
                    periodStart: order.periodStart,
                    periodEnd: order.periodEnd,
                    autoCharge: false
                  }
                : null;
            })(),
            cost: account.cost,
            resultCache: cache,
            byokBudget: {
              limit: byokCallLimit(),
              used: account.calls.filter((call: any) => call.source === 'byok').length,
              pendingCosts: account.calls.filter((call: any) => call.source === 'byok' && call.costStatus === 'pending')
                .length
            },
            calls: account.calls.map(({ result, fingerprint, responseDiagnostics, ...call }: any) => call),
            commercialEnabled: false,
            policyStatus: 'development_unconfirmed'
          }
        };
      const redact = (configured: any) => {
        const { apiKey, vault, keyRef, keyEnv, ...model } = configured;
        return {
          ...model,
          configured: Boolean(apiKey || keyRef),
          ...modelConnectionState(configured, account.calls),
          dataFlow: 'client_to_backend_to_named_provider'
        };
      };
      return {
        code: 0,
        success: true,
        data: {
          models: [
            ...(process.env.LEARNING_PLATFORM_CALLS_ENABLED === 'true' ? configuredModels() : []),
            ...account.profiles
          ].map(redact),
          preferences: account.modelPreferences || { selectedModelId: null, sharingAllowed: false },
          needsConnection: !account.profiles.some(
            (profile: any) =>
              profile.keyRef &&
              !profile.requiresModelSelection &&
              profile.capabilityCheck?.tools &&
              profile.capabilityCheck?.structured
          ),
          intakeContract: MODEL_INTAKE_CONTRACT,
          intakeContracts: MODEL_INTAKE_CONTRACTS,
          intakeScopeContracts: [...EXAM_SCOPE_CONTRACTS],
          coachMethods: SUBJECT_COACH_METHODS,
          writingCorpusContracts: [WRITING_PERSONAL_CORPUS_CONTRACT],
          presentationContracts: [PRESENTATION_CONTRACT],
          questionEntryContracts: [SINGLE_QUESTION_CONTRACT],
          platformEnabled: process.env.LEARNING_PLATFORM_CALLS_ENABLED === 'true',
          coreLearningFree: true,
          keyStorage: 'server_aes_gcm',
          whoCanDecrypt: 'deployment_operator_with_vault_key',
          commercialEnabled: false,
          resultCache: cache,
          presets: FREE_MODEL_PRESETS
        }
      };
    }
    if (body.action === 'save') {
      const p = body.profile;
      if (
        !p ||
        !/^[a-zA-Z0-9_-]{1,60}$/.test(p.id) ||
        typeof p.model !== 'string' ||
        (!p.model && p.requiresModelSelection !== true) ||
        p.model.length > 256 ||
        (p.apiKey != null && typeof p.apiKey !== 'string') ||
        p.apiKey?.length > MODEL_API_KEY_MAX_LENGTH ||
        body.shareConsent !== true
      ) {
        return { code: 400, success: false, message: '模型配置不合法或未确认服务端保存密钥' };
      }
      const endpoint = completeModelEndpoint(p.endpoint);
      const hasKey = typeof p.apiKey === 'string' && Boolean(p.apiKey.trim());
      const existingAccount = (
        await db
          .collection('learning_accounts')
          .where({
            _id: `learning_${crypto.createHash('sha256').update(auth.userId).digest('hex')}`,
            user_id: auth.userId
          })
          .get()
      ).data?.[0];
      const existing = existingAccount?.profiles?.find((item: any) => item.id === p.id);
      if (!hasKey && !existing?.keyRef && !isDomesticModel({ provider: p.provider, endpoint }))
        return { code: 400, success: false, message: '该提供商需要密钥才能添加连接' };
      // Keyless rows are closed-catalog metadata only; adding credentials still needs the deployment allowlist.
      if (hasKey || existing?.keyRef)
        validateCloudEndpoint(endpoint, (process.env.LEARNING_ALLOWED_ORIGINS || '').split(',').filter(Boolean));
      const preset = FREE_MODEL_PRESETS.find((item) => item.model === p.model && item.endpoint === endpoint);
      const keyRef = hasKey ? `model_key_${crypto.randomUUID()}` : existing?.keyRef;
      const profile = {
        id: p.id,
        provider: String(p.provider || 'custom').slice(0, 80),
        model: p.model,
        requiresModelSelection: p.requiresModelSelection === true,
        endpoint,
        source: 'byok',
        maxOutput: DEV_TEST ? 8192 : 2000,
        // 默认能力保守，协议兼容不等于视觉或原生工具可用。
        capabilities: {
          structured: p.structured === true,
          tools: false,
          vision: p.vision === true,
          stream: p.stream === true
        },
        ...(p.vision === true ? { visionAdapter: 'openai-image-url-v1' as const } : {}),
        keyRef: keyRef || null,
        ...(preset ? { pricing: preset.pricing, terms: preset.terms, privacy: preset.privacy } : {})
      };
      if (hasKey && keyRef) {
        const vault = encryptModelKey(p.apiKey, auth.userId, p.id, process.env.LEARNING_VAULT_KEY || '');
        await db.collection('learning_model_keys').add({ _id: keyRef, user_id: auth.userId, profile_id: p.id, vault });
      }
      const replacedRefs = new Set<string>();
      try {
        await mutateAccount(db, auth.userId, (account) => {
          // An empty-key add must never replace an existing connection or remove its vault key.
          if (!hasKey && existing && !existing.keyRef)
            throw Object.assign(new Error('MODEL_ALREADY_SAVED'), { code: 'MODEL_ALREADY_SAVED' });
          if (!hasKey && account.profiles.find((item: any) => item.id === p.id)?.keyRef !== existing?.keyRef)
            throw Object.assign(new Error('CONTEXT_CHANGED'), { code: 'CONTEXT_CHANGED' });
          if (!DEV_TEST && account.profiles.length >= 5 && !account.profiles.some((item: any) => item.id === p.id))
            throw new Error('PROFILE_LIMIT');
          account.profiles
            .filter((item: any) => item.id === p.id)
            .forEach((item: any) => replacedRefs.add(item.keyRef));
          account.profiles = [...account.profiles.filter((item: any) => item.id !== p.id), profile];
          return { account };
        });
      } catch (error) {
        if (hasKey && keyRef)
          await db.collection('learning_model_keys').where({ _id: keyRef, user_id: auth.userId }).remove();
        throw error;
      }
      for (const ref of replacedRefs)
        if (ref && ref !== keyRef)
          await db.collection('learning_model_keys').where({ _id: ref, user_id: auth.userId }).remove();
      if (keyRef && !profile.requiresModelSelection) return probeConnection(profile, `save_${crypto.randomUUID()}`);
      return {
        code: 0,
        success: true,
        data: { id: profile.id, keySaved: Boolean(keyRef), connectionStatus: 'untested' }
      };
    }
    if (body.action === 'delete' && typeof body.profileId === 'string') {
      const removedRefs = new Set<string>();
      await mutateAccount(db, auth.userId, (account) => {
        account.profiles.filter((p: any) => p.id === body.profileId).forEach((p: any) => removedRefs.add(p.keyRef));
        account.profiles = account.profiles.filter((p: any) => p.id !== body.profileId);
        if (account.modelPreferences?.selectedModelId === body.profileId)
          account.modelPreferences.selectedModelId = null;
        return { account };
      });
      for (const ref of removedRefs)
        if (ref) await db.collection('learning_model_keys').where({ _id: ref, user_id: auth.userId }).remove();
      return { code: 0, success: true, data: { removed: true, backups: '需按部署备份保留政策到期清除' } };
    }
    return { code: 400, success: false, message: '不支持的模型操作' };
  } catch (error: any) {
    return {
      code: 503,
      success: false,
      error: error.code || 'CONFIG_FAILED',
      message: '模型配置未保存，请检查服务端保险库和端点白名单'
    };
  }
}
