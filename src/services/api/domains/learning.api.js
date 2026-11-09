import config from '../../../config/index.js';
import { captureSession, sessionForRequest } from '../../auth-storage.js';
import { generateLearningTurnStream } from '../../learning/learning-stream.js';
import { reportAuthenticationFailure, isAuthenticationFailure } from '../../auth-failure.js';
import {
  DEEPSEEK_PRO_INTAKE_TIMEOUT_MS,
  DEEPSEEK_PRO_WRITING_TOTAL_MS,
  PRO_DIAGNOSTIC_REPLY,
  PRO_DIAGNOSTIC_REQUEST_MS,
  coachVerificationBudget,
  isDeepSeekProByok,
  isDeepSeekProDiagnostic
} from '../../../../laf-backend/functions/_shared/learning-runtime-policy.js';

export const learningModelDiscoveryEnabled = () => true;
const discoveryDisabled = () => ({ success: false, code: 503, errorCode: 'DISCOVERY_DISABLED' });

// 学习模型请求固定到用户选择的后端，不使用跨服务自动故障切换，不记录消息和密钥。
export function learningRequest(path, body, options = {}) {
  if (path === '/learning-models' && body?.action === 'discover' && !learningModelDiscoveryEnabled())
    return Promise.resolve(discoveryDisabled());
  const readOnly =
    (path === '/learning-models' && ['list', 'usage', 'result', 'discover'].includes(body?.action)) ||
    (path === '/learning-sync' && ['pull', 'page'].includes(body?.action));
  const session = options.session || (readOnly ? captureSession() : null);
  const failure = (error) => ({
    success: false,
    code: error?.code === 'SESSION_UNAVAILABLE' ? 503 : 409,
    errorCode: error?.code || 'CONTEXT_CHANGED',
    message: error?.message || '登录会话已变化，未发送旧内容'
  });
  try {
    options.assertCurrent?.();
    sessionForRequest(session);
  } catch (error) {
    return Promise.resolve(failure(error));
  }
  if (options.signal?.aborted) return Promise.resolve({ success: false, code: 499, message: '请求已取消，未再次发送' });
  return new Promise((resolve) => {
    let abort;
    const finish = (value, statusCode) => {
      if (abort) options.signal?.removeEventListener('abort', abort);
      try {
        options.assertCurrent?.();
        sessionForRequest(session);
        if (options.signal?.aborted) return resolve({ success: false, code: 499, message: '请求已取消，未读取旧响应' });
        const result = isAuthenticationFailure(value, statusCode)
          ? { ...value, success: false, code: 401, errorCode: 'AUTH_REQUIRED', message: '登录已过期，请重新登录' }
          : value;
        resolve(result);
        reportAuthenticationFailure(result, { session, credentialProof: snapshot.session.proof, path, statusCode });
      } catch (error) {
        resolve(failure(error));
      }
    };
    let snapshot;
    try {
      options.assertCurrent?.();
      snapshot = sessionForRequest(session);
      if (options.expectedOwner && snapshot.session.owner !== options.expectedOwner) return resolve(failure());
    } catch (error) {
      return resolve(failure(error));
    }
    if (!snapshot.token) return finish({ success: false, code: 401, message: '登录后可连接云模型；本地学习无需登录' });
    const coach = body.learningContext?.coach;
    const intake = body.learningContext?.intake || body.intake;
    const proTurn = path === '/proxy-ai' && isDeepSeekProByok(options.model);
    let timeout = coach || body.intake || body.feedbackAttemptId ? 70000 : 65000;
    if (path === '/learning-models' && ['save', 'test'].includes(body.action)) timeout = 130000;
    else if (path === '/proxy-ai' && body.replyProtocol === PRO_DIAGNOSTIC_REPLY)
      timeout = PRO_DIAGNOSTIC_REQUEST_MS + 5000;
    else if (proTurn && intake) timeout = DEEPSEEK_PRO_INTAKE_TIMEOUT_MS + 5000;
    else if (proTurn && coach && coach.phase === coach.target && ['essay', 'diagnostic', 'daily'].includes(coach.phase))
      timeout = DEEPSEEK_PRO_WRITING_TOTAL_MS + 5000;
    else if (coachVerificationBudget(body.learningContext) > 65000) timeout = 125000;
    const task = uni.request({
      url: `${config.api.baseUrl}${path}`,
      method: 'POST',
      data: body,
      timeout,
      header: { Authorization: `Bearer ${snapshot.token}`, 'Content-Type': 'application/json' },
      success: (res) =>
        finish(
          res.data && typeof res.data === 'object'
            ? res.data
            : { success: false, code: 502, message: '模型服务响应无效' },
          res.statusCode
        ),
      fail: () =>
        finish({
          success: false,
          code: options.signal?.aborted ? 499 : 503,
          message: options.signal?.aborted
            ? ['/learning-compute', '/learning-grammar'].includes(path)
              ? '检查已取消，原答保持'
              : path === '/learning-sync'
                ? '同步已取消，本机记录保留；已发送批次可能已保存云端'
                : '请求已取消，实际模型用量可能仍待结算'
            : '服务连接不可用，学习记录已保存'
        })
    });
    if (options.signal) {
      abort = () => task.abort();
      if (options.signal.aborted) abort();
      else options.signal.addEventListener('abort', abort, { once: true });
    }
  });
}
export const fetchLearningModels = (options) => learningRequest('/learning-models', { action: 'list' }, options);
export const requestLearningComputation = (body, options) => learningRequest('/learning-compute', body, options);
export const requestLearningGrammar = (body, options) => learningRequest('/learning-grammar', body, options);
export const fetchLearningUsage = (options) => learningRequest('/learning-models', { action: 'usage' }, options);
export function fetchLearningModelDiscovery(input, options) {
  if (!learningModelDiscoveryEnabled()) return Promise.resolve(discoveryDisabled());
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !['profileId', 'modelId', 'refresh'].includes(key)) ||
    typeof input.profileId !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,60}$/.test(input.profileId) ||
    typeof input.refresh !== 'boolean' ||
    (input.modelId !== undefined && (typeof input.modelId !== 'string' || !/^[\x21-\x7e]{1,256}$/.test(input.modelId)))
  )
    return Promise.resolve({ success: false, code: 503, errorCode: 'DISCOVERY_INPUT_INVALID' });
  return learningRequest(
    '/learning-models',
    {
      action: 'discover',
      profileId: input.profileId,
      refresh: input.refresh,
      ...(input.modelId === undefined ? {} : { modelId: input.modelId })
    },
    options
  );
}
export const testLearningModel = (modelId, requestId, options) =>
  learningRequest(
    '/learning-models',
    { action: 'test', modelId, requestId, shareConsent: true, ...(options?.intake ? { intake: options.intake } : {}) },
    options
  );
export const cancelLearningTurn = (requestId, options) =>
  learningRequest('/learning-models', { action: 'cancel', requestId }, options);
export const fetchLearningResult = (requestId, options) =>
  learningRequest('/learning-models', { action: 'result', requestId }, options);
export const saveLearningModel = (profile, shareConsent, options) =>
  learningRequest('/learning-models', { action: 'save', profile, shareConsent }, options);
export const saveLearningModelEffort = (profileId, version, effort, options) =>
  learningRequest('/learning-models', { action: 'reasoning-effort', profileId, version, effort }, options);
export const saveLearningModelPreferences = (preferences, options) =>
  learningRequest('/learning-models', { action: 'preferences', preferences }, options);
export const deleteLearningModel = (profileId, options) =>
  learningRequest('/learning-models', { action: 'delete', profileId }, options);
export function generateLearningTurn(body, options) {
  if (options?.stream) return generateLearningTurnStream(body, options);
  const request = isDeepSeekProDiagnostic(body.learningContext, options?.model)
    ? { ...body, replyProtocol: PRO_DIAGNOSTIC_REPLY }
    : body;
  return learningRequest('/proxy-ai', request, options);
}

// Independent essay copies use the same captured account as learning-sync.
// Existing learning APIs and their write contracts remain unchanged.
export const requestLearningArtifact = (body, options = {}) =>
  learningRequest('/learning-artifacts', body, { ...options, session: options.session || captureSession() });
