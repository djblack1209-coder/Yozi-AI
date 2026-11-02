// Only bounded codes cross the provider boundary; never display vendor response text.
export function classifyModelFailure(input = {}) {
  const code = typeof input === 'string' ? input : input.errorCode || input.error || input.code;
  const status = typeof input === 'object' ? input.upstreamStatus : null;
  if (
    ['KEY_REJECTED', 'KEY_UNAVAILABLE', 'MODEL_NOT_CONFIGURED', 'DISCOVERY_AUTH_REJECTED'].includes(code) ||
    [401, 403].includes(status)
  )
    return 'KEY_INVALID';
  if (['MODEL_NOT_FOUND', 'MODEL_RETIRED'].includes(code) || [404, 410].includes(status)) return 'MODEL_UNAVAILABLE';
  if (['UPSTREAM_QUOTA', 'QUOTA_EXHAUSTED', 'BYOK_LIMIT', 'COST_LIMIT'].includes(code) || status === 402)
    return 'QUOTA_EXHAUSTED';
  if (['RATE_LIMITED', 'USER_DAILY_LIMIT', 'GLOBAL_DAILY_LIMIT'].includes(code) || status === 429 || code === 429)
    return 'RATE_LIMITED';
  if (['TIMEOUT', 'METADATA_TIMEOUT'].includes(code)) return 'TIMEOUT';
  if (['INVALID_ENDPOINT', 'ENDPOINT_NOT_ALLOWED', 'ENDPOINT_FORBIDDEN', 'SSRF_BLOCKED'].includes(code))
    return 'ADDRESS_INVALID';
  if (['TLS_FAILED', 'NETWORK_FAILED', 'UPSTREAM_FAILED', 'METADATA_UNAVAILABLE'].includes(code))
    return 'NETWORK_OR_TLS';
  return typeof code === 'string' && /^[A-Z0-9_]{1,60}$/.test(code) ? code : 'MODEL_FAILED';
}

export function modelErrorPresentation(input = {}) {
  const code = classifyModelFailure(input);
  const connector = { type: 'open_connectors', route: '/pages/profile/index?panel=connectors', panel: 'connectors' };
  const messages = {
    NEEDS_CONNECTION: ['请先连接自己的 API', connector],
    MODEL_SELECTION_REQUIRED: ['请先选择并保存型号', { type: 'manual_model' }],
    INTAKE_INVALID: ['建档回复未完成，请先查询原请求', { type: 'query_result' }],
    CONSENT_REQUIRED: ['请先同意共享本次原答和必要资料片段', null],
    AUTH_REQUIRED: ['请先登录，再连接自己的 API', connector],
    KEY_INVALID: ['密钥无效，请更新连接', connector],
    MODEL_UNAVAILABLE: ['型号不存在或已下线，请手动选择其他型号', connector],
    RATE_LIMITED: ['请求太频繁，请稍后重试', { type: 'query_result' }],
    QUOTA_EXHAUSTED: ['可用额度已用尽，请检查用量或手动切换连接', connector],
    TIMEOUT: ['响应超时，原答已保留，请先查询原请求', { type: 'query_result' }],
    NETWORK_OR_TLS: ['网络或安全连接失败，请先查询原请求', { type: 'query_result' }],
    ADDRESS_INVALID: ['API 地址不合法或未获允许，请检查连接', connector],
    COACH_INVALID: ['回复校验未通过，原答已保留，可重新评估', { type: 'retry' }],
    COST_PENDING: ['用量待确认，请先查询原请求', { type: 'query_result' }],
    UNSUPPORTED_DISCOVERY: ['供应商不支持读取型号，请手填型号', { type: 'manual_model' }]
  };
  const pending = typeof input === 'object' && ['reserved', 'pending'].includes(input.status);
  let [message, action] = pending
    ? ['原请求仍在处理，请查询结果', { type: 'query_result' }]
    : messages[code] || ['请求未完成，原答已保留，请先查询原请求', { type: 'query_result' }];
  if (
    typeof input === 'object' &&
    input.retryAllowed === true &&
    ['failed', 'cancelled'].includes(input.status) &&
    action?.type === 'query_result' &&
    code !== 'COST_PENDING'
  ) {
    message = `原请求已${input.status === 'cancelled' ? '取消' : '失败'}，原答已保留，可重新评估`;
    action = { type: 'retry' };
  }
  return { code, message, action };
}
