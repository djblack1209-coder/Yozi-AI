import { phaseCallLimit, LEARNING_BUDGET_PHASES } from './learning-runtime-policy.js';
import { modelConfigurationVersion } from './ai-providers/free-model-presets.js';
import { assertWorkflowReservation } from './learning-workflow.js';
import crypto from 'node:crypto';
import { DEV_TEST } from './build-channel.js';
import {
  modelResultPolicy,
  maintainModelResources,
  boundedModelUsage,
  modelResultState,
  modelResourceBytes,
  MODEL_ACCOUNT_RESERVE_MAX_BYTES,
  type ModelResultPolicy
} from './learning-model-resources.js';

export class AccountError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
  }
}
const requireValue = (condition: any, code: string, message: string) => {
  if (!condition) throw new AccountError(code, message);
};
// Diagnostics keep schema coordinates, never arbitrary model-provided field names or reply text.
const VALIDATION_FIELDS = new Set(
  'context turns item profile goal-category-subjects exam-minutes exam minutes deadline foundation reply first json raw option options profile-evidence root turn-limit cards id kind title prompt example sourceId sourceQuote sourcePage source writing patterns learned tomorrow target lines original advice rewrite dimensions dimension dimensionContract dimensionReviews grammar collocation expression task name comment score evidence quoteVersion quoteId evidenceIds rewriteMode weaknesses phrases strengths strengthEvidence weaknessEvidence classification feedbackVersion finish_reason bandResult bandCandidate contract binding submissionId answerHash taskId taskVersion rubricId rubricVersion requestId status nullReason band bandRange scoreEstimate maxScore taskCoverage observations key evidenceSpans start end note integrityFlags label quote coach message tools question exercise edits before after errors errorText replacement uncertainties activityIds nextActions contentBlocks version'.split(
    ' '
  )
);
export function modelValidationPath(code: unknown, path: unknown) {
  if (
    (code !== 'COACH_INVALID' && code !== 'INTAKE_INVALID' && code !== 'INVALID_STRUCTURE') ||
    typeof path !== 'string' ||
    !path ||
    path.length > 160
  )
    return null;
  return path
    .split('.')
    .map((part) => {
      const field = /^([a-zA-Z][a-zA-Z0-9_-]*)(?:\[\d{1,4}\])*$/.exec(part);
      return field && VALIDATION_FIELDS.has(field[1]) ? part : 'unknown';
    })
    .join('.')
    .slice(0, 160);
}
export const DIAGNOSTIC_VERSION = 'diag-meta-1';
export const DIAGNOSTIC_TTL_MS = 86400000;
export type DiagnosticPolicy = {
  devTest: boolean;
  production: boolean;
  capture: boolean;
  ownerRead: boolean;
  owners: readonly string[];
};
export function responseDiagnosticPolicy(): DiagnosticPolicy {
  return {
    devTest: DEV_TEST,
    production: process.env.NODE_ENV === 'production',
    capture: process.env.LEARNING_DIAGNOSTICS_CAPTURE_ENABLED === 'true',
    ownerRead: process.env.LEARNING_DIAGNOSTICS_OWNER_READ_ENABLED === 'true',
    owners: ['6adb8c775a0254ee25d2e062']
  };
}
export function canReadResponseDiagnostics(owner: string, policy = responseDiagnosticPolicy()) {
  return (
    policy.devTest && !policy.production && policy.ownerRead && policy.owners.length === 1 && policy.owners[0] === owner
  );
}
export function canCaptureResponseDiagnostics(owner: string, policy = responseDiagnosticPolicy()) {
  return policy.capture && canReadResponseDiagnostics(owner, policy);
}
const DIAGNOSTIC_TYPES = [
  'missing',
  'null',
  'array',
  'object',
  'string',
  'number',
  'boolean',
  'json_object',
  'invalid_json'
];
const DIAGNOSTIC_TYPE_FIELDS = [
  'envelopeType',
  'choicesType',
  'choiceType',
  'messageType',
  'contentType',
  'reasoning_contentType',
  'reasoningType',
  'thinkingType',
  'finishReasonType',
  'expectedType',
  'actualType'
];
const DIAGNOSTIC_COUNT_FIELDS = [
  'responseBytes',
  'contentChars',
  'reasoning_contentChars',
  'reasoningChars',
  'thinkingChars',
  'syntaxPosition'
];
const DIAGNOSTIC_ENUMS: Record<string, string[]> = {
  version: [DIAGNOSTIC_VERSION],
  failureStage: ['http_envelope', 'json_parse', 'schema', 'secret_guard', 'unknown'],
  positionUnit: ['utf16_code_unit', 'byte'],
  networkStage: ['headers', 'received'],
  mimeCategory: ['json', 'sse', 'text', 'other', 'missing'],
  envelopeJson: ['valid', 'invalid'],
  finishReason: ['stop', 'length', 'content_filter', 'tool_calls', 'function_call', 'end_turn', 'max_tokens', 'other'],
  startToken: ['object', 'array', 'string', 'other', 'empty']
};
const DIAGNOSTIC_BOOLEANS = ['syntaxEnd', 'hasJsonFence', 'hasThinkingPrefix', 'hasBom'];
const DIAGNOSTIC_FIELDS = [
  'version',
  'capturedAt',
  'failureStage',
  ...DIAGNOSTIC_TYPE_FIELDS,
  'httpStatus',
  ...DIAGNOSTIC_COUNT_FIELDS,
  ...Object.keys(DIAGNOSTIC_ENUMS).filter((k) => !['version', 'failureStage'].includes(k)),
  ...DIAGNOSTIC_BOOLEANS
];
export function checkResponseDiagnostics(value: any) {
  const rejected = (event = 'DIAG_OMITTED_SCHEMA') => ({ diagnostic: null, event });
  try {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    )
      return rejected();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (
      Reflect.ownKeys(value).some(
        (key) =>
          typeof key !== 'string' || !DIAGNOSTIC_FIELDS.includes(key) || !Object.hasOwn(descriptors[key], 'value')
      )
    )
      return rejected();
    if (!['version', 'capturedAt', 'failureStage'].every((key) => Object.hasOwn(descriptors, key))) return rejected();
    const result: Record<string, any> = {};
    for (const field of DIAGNOSTIC_FIELDS) {
      if (!Object.hasOwn(descriptors, field)) continue;
      const item = descriptors[field].value;
      const valid =
        field === 'capturedAt'
          ? Number.isSafeInteger(item) && item >= 0
          : field === 'httpStatus'
            ? Number.isInteger(item) && item >= 100 && item <= 599
            : DIAGNOSTIC_TYPE_FIELDS.includes(field)
              ? DIAGNOSTIC_TYPES.includes(item)
              : DIAGNOSTIC_COUNT_FIELDS.includes(field)
                ? Number.isSafeInteger(item) && item >= 0 && item <= 2 * 1048576
                : DIAGNOSTIC_BOOLEANS.includes(field)
                  ? typeof item === 'boolean'
                  : DIAGNOSTIC_ENUMS[field]?.includes(item);
      if (!valid) return rejected();
      result[field] = item;
    }
    if (
      Object.hasOwn(result, 'syntaxPosition') !== Object.hasOwn(result, 'positionUnit') ||
      (Object.hasOwn(result, 'syntaxPosition') &&
        (result.failureStage !== 'json_parse' ||
          (result.positionUnit === 'utf16_code_unit' &&
            (!Number.isSafeInteger(result.contentChars) || result.syntaxPosition > result.contentChars))))
    )
      return rejected();
    if (Buffer.byteLength(JSON.stringify(result)) > 1024) return rejected('DIAG_OMITTED_SIZE');
    return { diagnostic: result, event: null };
  } catch {
    return rejected();
  }
}
export function boundedResponseDiagnostics(value: any) {
  return checkResponseDiagnostics(value).diagnostic;
}
export function isDiagReadable(value: any, now = Date.now()) {
  const diagnostic = boundedResponseDiagnostics(value);
  return Boolean(
    diagnostic &&
    Number.isSafeInteger(now) &&
    diagnostic.capturedAt <= now &&
    now - diagnostic.capturedAt < DIAGNOSTIC_TTL_MS
  );
}
export function projectResponseDiagnostics(
  account: any,
  requestId: string,
  owner: string,
  now = Date.now(),
  policy = responseDiagnosticPolicy()
) {
  if (!canReadResponseDiagnostics(owner, policy) || account?.user_id !== owner) return {};
  const call = account.calls?.find((item: any) => item.id === requestId);
  const diagnostic =
    call?.status === 'failed' && isDiagReadable(call.responseDiagnostics, now)
      ? boundedResponseDiagnostics(call.responseDiagnostics)
      : null;
  return diagnostic
    ? { responseDiagnostics: diagnostic, diagnosticsState: 'available' }
    : { diagnosticsState: 'unavailable' };
}
export function byokCallLimit(value = process.env.LEARNING_BYOK_CALL_LIMIT || '500') {
  if (DEV_TEST) return 1000000;
  const limit = Number(value);
  requireValue(Number.isInteger(limit) && limit > 0 && limit <= 500, 'POLICY_INVALID', '自带API调用预算不合法');
  return limit;
}
export function weekKey(now: number, timezone: string, startDay = 1) {
  requireValue(Number.isInteger(startDay) && startDay >= 0 && startDay <= 6, 'POLICY_INVALID', '周起始日不合法');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(now));
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const date = new Date(Date.UTC(n('year'), n('month') - 1, n('day')));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() - startDay + 7) % 7));
  return date.toISOString().slice(0, 10);
}
export function newAccount(userId: string) {
  return {
    _id: `learning_${crypto.createHash('sha256').update(userId).digest('hex')}`,
    user_id: userId,
    revision: 0,
    profiles: [],
    modelPreferences: { selectedModelId: null, sharingAllowed: false },
    calls: [],
    entitlement: {
      policyVersion: 'development-unconfirmed-v1',
      timezone: 'Asia/Shanghai',
      startDay: 1,
      weeklyUnits: 0,
      week: '',
      spent: 0,
      reserved: 0
    },
    cost: { spent: 0, reserved: 0, hardLimit: 0, pending: 0 },
    subscriptions: [],
    callbacks: []
  };
}
export function reserveCall(account: any, input: any, now = Date.now(), policy = modelResultPolicy()) {
  account = maintainModelResources(account, now, policy).account;
  requireValue(
    typeof input.id === 'string' && /^[a-zA-Z0-9_:-]{1,160}$/.test(input.id),
    'INPUT_INVALID',
    '请求标识不合法'
  );
  // The same CAS that reserves a child rechecks parent cancellation and every dependency.
  assertWorkflowReservation(account, input, (call: any) => modelResultState(call, now, policy) === 'available');
  const previous = account.calls.find((call: any) => call.id === input.id);
  if (previous) {
    requireValue(
      !(previous.status === 'cancelled' && previous.costStatus === 'not_called'),
      'CANCELLED',
      '此请求已在调用前取消'
    );
    requireValue(previous.fingerprint === input.fingerprint, 'IDEMPOTENCY_CONFLICT', '同一请求标识对应不同输入');
    return { account, call: previous, reused: true };
  }
  requireValue(DEV_TEST || account.calls.length < 500, 'RESOURCE_LIMIT', '用量账达到开发上限，需要归档');
  requireValue(['platform', 'byok'].includes(input.source), 'INPUT_INVALID', '费用来源不合法');
  if (input.source === 'byok') {
    const callLimit = input.callLimit ?? 500;
    requireValue(
      Number.isInteger(callLimit) && callLimit > 0 && (DEV_TEST || callLimit <= 500),
      'POLICY_INVALID',
      '自带API调用预算不合法'
    );
    if (input.budgetPhase !== undefined) {
      requireValue(LEARNING_BUDGET_PHASES.includes(input.budgetPhase), 'INPUT_INVALID', '学习阶段不合法');
      const used = account.calls.filter(
        (call: any) => call.source === 'byok' && (call.budgetPhase || 'practice') === input.budgetPhase
      ).length;
      requireValue(
        DEV_TEST || used < phaseCallLimit(callLimit, input.budgetPhase),
        'PHASE_BUDGET_LIMIT',
        '本阶段调用额度已用完，其他阶段额度保留'
      );
    }
    requireValue(
      DEV_TEST || account.calls.filter((c: any) => c.source === 'byok').length < callLimit,
      'BYOK_LIMIT',
      '自带API请求预算已用完，已有学习记录仍可使用'
    );
  }
  requireValue(
    Number.isFinite(input.maxCost) && input.maxCost >= 0 && Number.isFinite(input.units) && input.units >= 0,
    'POLICY_INVALID',
    '调用预算不合法'
  );
  if (input.repairOf) {
    const parent = account.calls.find((call: any) => call.id === input.repairOf);
    requireValue(
      parent?.status === 'failed' &&
        parent.errorCode === 'COACH_INVALID' &&
        !parent.repairOf &&
        (input.id === `${parent.id}:repair1` ||
          // 开发付费兜底：免费返修仍未通过教学校验时，同一请求可再由 DeepSeek 作答一次；发布构建仍只修一次。
          (DEV_TEST &&
            input.id === `${parent.id}:repair2` &&
            account.calls.some(
              (call: any) =>
                call.id === `${parent.id}:repair1` && call.status === 'failed' && call.errorCode === 'COACH_INVALID'
            ))) &&
        parent.modelId === input.modelId &&
        parent.configurationVersion === input.configurationVersion,
      'REPAIR_INVALID',
      '修复仅能派生自同连接的校验失败请求'
    );
    input = {
      ...input,
      budgetPhase: parent.budgetPhase || input.budgetPhase,
      units: 0,
      deliveryUnits: parent.units || 0
    };
  }
  const result = structuredClone(account);
  if (input.source === 'platform') {
    const week = weekKey(now, result.entitlement.timezone, result.entitlement.startDay);
    if (result.entitlement.week !== week) {
      // 旧周的在途预留不会消失；每条调用绑定自身的 entitlementWeek。
      result.entitlement = { ...result.entitlement, week, spent: 0, reserved: 0 };
    }
    requireValue(
      DEV_TEST ||
        result.entitlement.spent + result.entitlement.reserved + (input.deliveryUnits ?? input.units) <=
          result.entitlement.weeklyUnits,
      'QUOTA_EXHAUSTED',
      '本周平台模型额度不足，可主动选择自带 API 或本地连接'
    );
    requireValue(
      result.cost.spent + result.cost.reserved + input.maxCost <= result.cost.hardLimit,
      'COST_LIMIT',
      '平台模型成本硬预算不足'
    );
    result.entitlement.reserved += input.deliveryUnits ?? input.units;
    result.cost.reserved += input.maxCost;
  }
  const call = {
    ...input,
    status: 'reserved',
    at: now,
    entitlementWeek: result.entitlement.week,
    policyVersion: result.entitlement.policyVersion,
    actualCost: null,
    costStatus: 'pending',
    usage: null
  };
  result.calls.push(call);
  requireValue(
    modelResourceBytes(result) <= MODEL_ACCOUNT_RESERVE_MAX_BYTES,
    'RESOURCE_LIMIT',
    '用量账户达到安全容量上限；未调用模型，已有学习记录仍可使用'
  );
  return { account: result, call, reused: false };
}
// 一条请求的最后一次返修：开发付费兜底可能有第二次（:repair2）。
export function latestRepair(calls: any[], id: string) {
  const repair = (n: number) => calls.find((call: any) => call.id === `${id}:repair${n}` && call.repairOf === id);
  return repair(2) || repair(1);
}
export function cancelCall(account: any, id: string, now = Date.now()) {
  requireValue(typeof id === 'string' && /^[a-zA-Z0-9_:-]{1,160}$/.test(id), 'INPUT_INVALID', '请求标识不合法');
  const previous = account.calls.find((call: any) => call.id === id);
  if (previous && (previous.status !== 'reserved' || previous.cancelRequestedAt))
    return { account, call: previous, reused: true };
  const result = structuredClone(account);
  let call = result.calls.find((call: any) => call.id === id);
  if (!call) {
    requireValue(result.calls.length < 500, 'RESOURCE_LIMIT', '用量账达到开发上限，需要归档');
    // 取消先于预留到达时留下同用户的阻塞标识，不能在后续竞态中仍发起付费调用。
    call = { id, source: 'none', status: 'cancelled', costStatus: 'not_called', actualCost: 0, at: now };
    result.calls.push(call);
  }
  call.cancelRequestedAt = now;
  return { account: result, call, reused: false };
}
export function settleCall(
  account: any,
  id: string,
  settlement: any,
  now = Date.now(),
  policy: ModelResultPolicy = modelResultPolicy(),
  diagnosticPolicy: DiagnosticPolicy = responseDiagnosticPolicy()
) {
  const result = structuredClone(account);
  const call = result.calls.find((item: any) => item.id === id);
  requireValue(call, 'NOT_FOUND', '预留不存在');
  if (call.status !== 'reserved') return { account, call, reused: true };
  const bounded = boundedModelUsage(settlement.usage);
  const actualCost = bounded.evidence.truncated ? null : settlement.actualCost;
  requireValue(
    actualCost === null || (Number.isFinite(actualCost) && actualCost >= 0),
    'COST_INVALID',
    '实际成本不合法'
  );
  const cancelled = Boolean(call.cancelRequestedAt || settlement.cancelled);
  const successful = settlement.success && !cancelled;
  call.status = cancelled ? 'cancelled' : successful ? 'completed' : 'failed';
  call.actualCost = actualCost;
  call.costStatus = actualCost === null ? 'pending' : 'settled';
  call.usage = bounded.usage;
  call.usageEvidence = bounded.evidence;
  call.actualModel = settlement.actualModel || call.model;
  call.durationMs = settlement.durationMs || 0;
  if (settlement.usageComplete !== undefined) call.usageComplete = settlement.usageComplete === true;
  if (settlement.executionStage) call.executionStage = settlement.executionStage;
  call.result = successful ? settlement.result || null : null;
  if (call.result) {
    call.resultCachedAt = now;
    call.resultExpiresAt = now + policy.ttlMs;
    call.resultPolicyVersion = policy.version;
  }
  call.errorCode = cancelled ? 'CANCELLED' : settlement.errorCode || null;
  call.connectionError = successful ? null : settlement.connectionError || call.errorCode;
  const profile = result.profiles.find(
    (p: any) =>
      p.id === call.modelId && modelConfigurationVersion(p) === (call.connectionVersion || call.configurationVersion)
  );
  if (profile)
    profile.connectionState = {
      status: successful ? 'connected' : 'failed',
      errorCode: call.connectionError,
      checkedAt: now
    };
  const validationPath =
    call.status === 'failed' ? modelValidationPath(call.errorCode, settlement.validationPath) : null;
  if (validationPath) call.validationPath = validationPath;
  else delete call.validationPath;
  if (
    call.status === 'failed' &&
    canCaptureResponseDiagnostics(account.user_id, diagnosticPolicy) &&
    settlement.responseDiagnostics !== undefined
  ) {
    const checked = checkResponseDiagnostics(settlement.responseDiagnostics);
    if (checked.event) console.warn(checked.event);
    else if (result.calls.filter((item: any) => boundedResponseDiagnostics(item.responseDiagnostics)).length >= 32)
      console.warn('DIAG_OMITTED_CAPACITY');
    else if (
      checked.diagnostic &&
      checked.diagnostic.capturedAt <= now &&
      modelResourceBytes(result) + Buffer.byteLength(JSON.stringify(checked.diagnostic)) <=
        MODEL_ACCOUNT_RESERVE_MAX_BYTES
    )
      call.responseDiagnostics = checked.diagnostic;
  }
  if (call.source === 'platform') {
    if (actualCost !== null) {
      result.cost.reserved = Math.max(0, result.cost.reserved - call.maxCost);
      result.cost.spent += actualCost;
    } else result.cost.pending += 1; // 保留供应商成本预留，未知成本不会被返还成零。
    if (call.entitlementWeek === result.entitlement.week) {
      result.entitlement.reserved = Math.max(0, result.entitlement.reserved - (call.deliveryUnits ?? call.units));
      if (successful) result.entitlement.spent += call.deliveryUnits ?? call.units;
    }
    if (call.repairOf) {
      const parent = result.calls.find((item: any) => item.id === call.repairOf);
      if (parent && successful) {
        parent.entitlementCharged = call.deliveryUnits || 0;
        parent.deliveredBy = call.id;
      }
    }
    call.entitlementCharged = successful ? call.units : 0; // 开发配置：失败/及时取消用户权益返还一次。
  } else call.entitlementCharged = 0;
  const maintained = maintainModelResources(result, now, policy);
  return {
    account: maintained.account,
    call: maintained.account.calls.find((item: any) => item.id === id),
    reused: false
  };
}
// 清除私人教学正文，保留成本/权益事实；预留中的旧请求不能在删除后回填结果。
export function eraseModelResultCache(account: any, now = Date.now()) {
  const result = structuredClone(account);
  let changed = false,
    erasedResults = 0;
  const pendingRequests: string[] = [];
  for (const call of result.calls) {
    if (Object.hasOwn(call, 'responseDiagnostics')) {
      delete call.responseDiagnostics;
      changed = true;
    }
    if (Object.hasOwn(call, 'validationPath')) {
      delete call.validationPath;
      changed = true;
    }
    if (call.result) {
      erasedResults++;
      call.result = null;
      changed = true;
    }
    if (!call.resultDeletedAt) {
      call.resultDeletedAt = now;
      changed = true;
    }
    if (call.status === 'reserved') {
      pendingRequests.push(call.id);
      if (!call.cancelRequestedAt) {
        call.cancelRequestedAt = now;
        changed = true;
      }
    }
  }
  return { account: changed ? result : account, erasedResults, pendingRequests, reused: !changed };
}
export function recoverStaleReservations(account: any, now = Date.now(), maxAgeMs = 120000) {
  let result = account;
  for (const call of account.calls.filter((c: any) => c.status === 'reserved' && now - c.at > maxAgeMs)) {
    result = settleCall(result, call.id, {
      success: false,
      actualCost: null,
      errorCode: 'EXECUTION_INTERRUPTED',
      durationMs: now - call.at
    }).account;
  }
  return { account: result, reused: result === account };
}
// 单用户单文档 CAS；所有预留、结算和权益同时落在一次 DB 修改中。
export async function mutateAccount(db: any, userId: string, mutate: (account: any) => any) {
  const seed = newAccount(userId);
  const collection = db.collection('learning_accounts');
  for (let retry = 0; retry < 5; retry++) {
    let account = (await collection.where({ _id: seed._id, user_id: userId }).get()).data?.[0];
    if (!account) {
      try {
        await collection.add(seed);
      } catch (error: any) {
        if (error?.code !== 11000) throw error;
      }
      account = (await collection.where({ _id: seed._id, user_id: userId }).get()).data?.[0];
      requireValue(account, 'DATABASE_UNAVAILABLE', '无法创建学习账户');
    }
    const outcome = mutate(account);
    if (outcome.reused && outcome.account === account) return outcome;
    const { _id, ...next } = outcome.account;
    next.revision = account.revision + 1;
    const updated = await collection.where({ _id: seed._id, user_id: userId, revision: account.revision }).update(next);
    if (updated.updated === 1) return { ...outcome, account: { _id: seed._id, ...next } };
  }
  throw new AccountError('CONFLICT', '账户同时更新，请重试');
}
export function encryptModelKey(key: string, userId: string, profileId: string, secret: string) {
  requireValue(/^[a-f0-9]{64}$/i.test(secret), 'VAULT_UNAVAILABLE', '服务端密钥保险库尚未配置');
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(secret, 'hex'), nonce);
  cipher.setAAD(Buffer.from(`${userId}:${profileId}`));
  const ciphertext = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    nonce: nonce.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    version: 1
  };
}
export function decryptModelKey(value: any, userId: string, profileId: string, secret: string) {
  requireValue(/^[a-f0-9]{64}$/i.test(secret), 'VAULT_UNAVAILABLE', '服务端密钥保险库尚未配置');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(secret, 'hex'),
    Buffer.from(value.nonce, 'base64')
  );
  decipher.setAAD(Buffer.from(`${userId}:${profileId}`));
  decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8');
}
