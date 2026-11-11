/**
 * 统一认证中间件
 * 消除所有云函数中重复的 auth 逻辑
 */

import { verifyJWT, extractBearerToken, JwtPayload } from './auth.js';
import { unauthorized, ApiResponse } from './api-response.js';

export interface AuthResult {
  userId: string;
  payload: JwtPayload;
}

/**
 * 统一认证检查
 * @param ctx - 云函数上下文
 * @returns 认证成功返回 { userId, payload }，失败返回错误响应
 */
export function requireAuth(ctx: any): AuthResult | ApiResponse {
  const rawToken = ctx.headers?.['authorization'] || ctx.headers?.Authorization;
  const token = extractBearerToken(rawToken);

  if (!token) {
    return unauthorized('请先登录');
  }

  const payload = verifyJWT(token);
  if (!payload || !payload.userId) {
    return unauthorized('登录已过期，请重新登录');
  }

  ctx.authenticatedUserId = payload.userId;
  return {
    userId: payload.userId,
    payload
  };
}

/**
 * 检查是否为错误响应
 */
export function isAuthError(result: AuthResult | ApiResponse): result is ApiResponse {
  return 'code' in result && result.code !== 0;
}
