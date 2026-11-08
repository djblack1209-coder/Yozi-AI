import { DEV_TEST } from './build-channel.js';
export class TrialError extends Error {
  code = 'TRIAL_CLOSED';
}
const EMAIL_PATTERN = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
export function friendTrialPolicy(env = process.env) {
  if (DEV_TEST) return null;
  if (env.LEARNING_FRIEND_TRIAL_ENABLED !== 'true') return null;
  const cap = Number(env.LEARNING_TRIAL_USER_LIMIT || 0);
  const emails = [
    ...new Set(
      String(env.LEARNING_TRIAL_EMAILS || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    )
  ];
  if (
    !Number.isInteger(cap) ||
    cap < 1 ||
    cap > 1000 ||
    !emails.length ||
    emails.length > cap ||
    emails.some((s) => s.length > 254 || !EMAIL_PATTERN.test(s))
  )
    throw new TrialError('朋友试用尚未开放，请联系邀请人');
  // 白名单本身占用名额；更换名单会立即撤销旧名单的模型访问，不会累计放大人数上限。
  return { cap, emails };
}
export function assertTrialEmail(email: unknown, env = process.env) {
  const policy = friendTrialPolicy(env);
  if (policy && (typeof email !== 'string' || !policy.emails.includes(email.trim().toLowerCase())))
    throw new TrialError('暂未获得朋友试用资格，请联系邀请人');
}
export async function assertTrialUser(db: any, userId: string) {
  if (!friendTrialPolicy()) return;
  const user = (await db.collection('users').where({ _id: userId }).get()).data?.[0];
  assertTrialEmail(user?.email);
}
// 试用额度：总开关仅在恰为 'true' 时开启；关闭时不读配置、不查用户、不写字段。
// 格式 LEARNING_TRIAL_CREDIT_GRANTS=a@x.com:3,b@x.com:5；配置错误一律拒绝，不放行。
export function trialCreditPolicy(env = process.env) {
  if (env.LEARNING_TRIAL_CREDITS_ENABLED !== 'true') return null;
  const cap = Number(env.LEARNING_TRIAL_CREDIT_USER_LIMIT || 0);
  const costLimit = Number(env.LEARNING_TRIAL_CREDIT_COST_LIMIT || 0);
  const entries: [string, number][] = String(env.LEARNING_TRIAL_CREDIT_GRANTS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((s) => [s.slice(0, s.lastIndexOf(':')), Number(s.slice(s.lastIndexOf(':') + 1))]);
  const grants = new Map(entries);
  if (
    !Number.isInteger(cap) ||
    cap < 1 ||
    cap > 1000 ||
    !entries.length ||
    entries.length > cap ||
    grants.size !== entries.length ||
    !Number.isFinite(costLimit) ||
    costLimit <= 0 ||
    entries.some(
      ([email, n]) => email.length > 254 || !EMAIL_PATTERN.test(email) || !Number.isInteger(n) || n < 1 || n > 1000
    )
  )
    throw new TrialError('试用额度尚未开放，可在 AI 连接器接入自己的 API');
  return { costLimit, grants };
}
export async function trialCreditFor(db: any, userId: string, env = process.env) {
  const policy = trialCreditPolicy(env);
  if (!policy) return null;
  const user = (await db.collection('users').where({ _id: userId }).get()).data?.[0];
  const email = typeof user?.email === 'string' ? user.email.trim().toLowerCase() : '';
  return { granted: policy.grants.get(email) ?? 0, costLimit: policy.costLimit };
}
