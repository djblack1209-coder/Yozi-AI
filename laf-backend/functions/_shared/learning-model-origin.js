// Informational provenance from a bound API response, not independent grading
// authority or eligibility for a platform reference experiment.
export const LEARNING_MODEL_ORIGIN_CONTRACT = 'learning-model-origin-v1';
export const learningModelSourceKey = (source) =>
  JSON.stringify([source.source, source.modelId, source.provider || '', source.actualModel || '']);
const record = (value) => value && typeof value === 'object' && !Array.isArray(value);
const identifier = (value) =>
  typeof value === 'string' && value.length > 0 && value.length <= 180 && !/[\u0000-\u001f]/u.test(value);
const keys = [
  'contract',
  'callId',
  'modelId',
  'requestBinding',
  'source',
  'provider',
  'actualModel',
  'configurationVersion',
  'upstreamVersion',
  'inferencePolicy',
  'outputContract',
  'schemaDigest',
  'sentParameters',
  'verificationModels'
];
const parameterKeys = [
  'max_tokens',
  'max_completion_tokens',
  'temperature',
  'reasoning_effort',
  'include_reasoning',
  'thinking',
  'reasoning',
  'chat_template_kwargs'
];

// A closed whitelist prevents prompts, URLs, credentials and arbitrary vendor
// objects from entering learning provenance. Omitted parameters remain omitted.
export function learningSentParameters(wire) {
  const result = {};
  for (const key of parameterKeys) {
    const value = wire?.[key];
    if (
      ['max_tokens', 'max_completion_tokens'].includes(key) &&
      Number.isInteger(value) &&
      value > 0 &&
      value <= 131072
    )
      result[key] = value;
    else if (key === 'temperature' && typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 2)
      result[key] = value;
    else if (key === 'reasoning_effort' && ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(value))
      result[key] = value;
    else if (key === 'include_reasoning' && typeof value === 'boolean') result[key] = value;
    else if (
      key === 'thinking' &&
      record(value) &&
      Object.keys(value).length === 1 &&
      ['enabled', 'disabled'].includes(value.type)
    )
      result[key] = { type: value.type };
    else if (
      key === 'reasoning' &&
      record(value) &&
      Object.keys(value).length === 1 &&
      ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(value.effort)
    )
      result[key] = { effort: value.effort };
    else if (
      key === 'chat_template_kwargs' &&
      record(value) &&
      Object.keys(value).length === 1 &&
      typeof value.enable_thinking === 'boolean'
    )
      result[key] = { enable_thinking: value.enable_thinking };
  }
  return result;
}

export function normalizeLearningModelOrigin(value, { requestId, modelId, binding } = {}) {
  if (
    !record(value) ||
    Object.keys(value).some((key) => !keys.includes(key)) ||
    value.contract !== LEARNING_MODEL_ORIGIN_CONTRACT ||
    !identifier(requestId) ||
    !identifier(modelId) ||
    !identifier(binding) ||
    value.modelId !== modelId ||
    value.requestBinding !== binding ||
    !identifier(value.callId) ||
    !(value.callId === requestId || [1, 2].some((n) => value.callId === `${requestId}:repair${n}`)) ||
    !['byok', 'platform'].includes(value.source) ||
    !identifier(value.provider) ||
    !identifier(value.actualModel) ||
    typeof value.configurationVersion !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.configurationVersion) ||
    value.upstreamVersion !== null ||
    !identifier(value.inferencePolicy) ||
    !identifier(value.outputContract) ||
    typeof value.schemaDigest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.schemaDigest) ||
    !record(value.sentParameters) ||
    !Array.isArray(value.verificationModels) ||
    value.verificationModels.length > 16
  )
    return null;
  const sentParameters = learningSentParameters(value.sentParameters);
  if (
    Object.keys(sentParameters).length !== Object.keys(value.sentParameters).length ||
    Object.keys(sentParameters).some(
      (key) => JSON.stringify(sentParameters[key]) !== JSON.stringify(value.sentParameters[key])
    )
  )
    return null;
  const verificationModels = [];
  for (const model of value.verificationModels) {
    if (
      !record(model) ||
      Object.keys(model).some((key) => !['provider', 'model', 'paidFallback'].includes(key)) ||
      !identifier(model.provider) ||
      !identifier(model.model) ||
      typeof model.paidFallback !== 'boolean'
    )
      return null;
    verificationModels.push({ provider: model.provider, model: model.model, paidFallback: model.paidFallback });
  }
  return {
    contract: LEARNING_MODEL_ORIGIN_CONTRACT,
    callId: value.callId,
    modelId,
    requestBinding: binding,
    source: value.source,
    provider: value.provider,
    actualModel: value.actualModel,
    configurationVersion: value.configurationVersion,
    upstreamVersion: null,
    inferencePolicy: value.inferencePolicy,
    outputContract: value.outputContract,
    schemaDigest: value.schemaDigest,
    sentParameters,
    verificationModels
  };
}
