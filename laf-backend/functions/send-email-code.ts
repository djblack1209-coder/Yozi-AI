import { renderTransactionalEmail } from './_shared/transactional-email.js';
import { sendThroughMailPool } from './_shared/pooled-email.js';
/**
 * 发送邮箱验证码云函数
 *
 * 请求参数：
 * - email: string (必填) - 邮箱地址
 *
 * 返回格式：
 * { code: 0, message: '验证码已发送' }
 */

import { getClientIp, clientIpUnavailable } from './_shared/client-ip.js';
import cloud from '@lafjs/cloud';
import crypto from 'crypto';
import { assertTrialEmail, TrialError } from './_shared/learning-trial.js';
import { DEV_TEST } from './_shared/build-channel.js';
import { createLogger } from './_shared/api-response.js';

const logger = createLogger('[SendEmailCode]');

// 邮件服务配置（使用环境变量）
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.qq.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || 'Yozi AI <noreply@exam-master.com>';
const SMTP_RETRY_TIMES = Math.min(2, Math.max(1, Number(process.env.SMTP_RETRY_TIMES || 2)));
const SMTP_RETRY_DELAY_MS = Math.max(200, Number(process.env.SMTP_RETRY_DELAY_MS || 800));

const RESERVED_EMAIL_DOMAINS = new Set(['example.com', 'example.net', 'example.org']);
const RESERVED_EMAIL_SUFFIXES = ['.example', '.invalid', '.localhost', '.test'];

// 获取数据库实例
const db = cloud.database();

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function maskEmail(email) {
  if (typeof email !== 'string' || !email.includes('@')) return '***';
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return '***';
  if (localPart.length <= 2) return `${localPart[0] || '*'}***@${domain}`;
  return `${localPart[0]}***${localPart[localPart.length - 1]}@${domain}`;
}

function isReservedEmailDomain(email) {
  if (typeof email !== 'string' || !email.includes('@')) return true;
  const domain = email.split('@')[1].toLowerCase();

  if (!domain) {
    return true;
  }

  if (RESERVED_EMAIL_DOMAINS.has(domain)) {
    return true;
  }

  return RESERVED_EMAIL_SUFFIXES.some((suffix) => domain.endsWith(suffix));
}

export default async function (ctx) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

  try {
    const { email: rawEmail } = ctx.body || {};
    const email = normalizeEmail(rawEmail);
    assertTrialEmail(email);

    // 参数校验
    if (!email) {
      return {
        code: 400,
        success: false,
        message: '邮箱地址不能为空',
        requestId
      };
    }

    // M-10 FIX: 使用与 login.ts 一致的严格邮箱正则
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      return {
        code: 400,
        success: false,
        message: '邮箱格式不正确',
        requestId
      };
    }

    if (DEV_TEST) return { code: 0, success: true, message: '测试验证码：000000', retryAfter: 0, requestId };

    if (isReservedEmailDomain(email)) {
      return {
        code: 400,
        success: false,
        message: '请使用真实可收件邮箱，示例域名不可用',
        requestId
      };
    }

    // 检查发送频率（1分钟内只能发送一次）
    const codesCollection = db.collection('email_codes');
    const now = Date.now();

    const recentCode = await codesCollection
      .where({
        email,
        created_at: db.command.gt(now - 60 * 1000)
      })
      .orderBy('created_at', 'desc')
      .getOne();

    if (recentCode.data) {
      const retryAfter = Math.max(1, Math.ceil((60 * 1000 - (now - Number(recentCode.data.created_at || now))) / 1000));
      if (!recentCode.data.used) {
        return {
          code: 0,
          success: true,
          alreadySent: true,
          retryAfter,
          message: '验证码已发送，请稍候查收',
          requestId
        };
      }

      return {
        code: 429,
        success: false,
        message: '发送太频繁，请1分钟后再试',
        retryAfter,
        requestId
      };
    }

    // 安全修复：同一邮箱每日最多发送 10 次验证码，防止邮件轰炸
    const dailyCount = await codesCollection
      .where({
        email,
        created_at: db.command.gt(now - 24 * 60 * 60 * 1000)
      })
      .count();

    if (dailyCount.total >= 10) {
      return {
        code: 429,
        success: false,
        message: '今日验证码发送次数已达上限，请明天再试',
        requestId
      };
    }

    // 安全修复：基于 IP 的全局限流（每个 IP 每小时最多 20 次）
    const clientIP = getClientIp(ctx);
    if (!clientIP) return clientIpUnavailable();

    const ipHourlyCount = await codesCollection
      .where({
        client_ip: clientIP,
        created_at: db.command.gt(now - 60 * 60 * 1000)
      })
      .count();

    if (ipHourlyCount.total >= 20) {
      return {
        code: 429,
        success: false,
        message: '请求过于频繁，请稍后再试',
        requestId
      };
    }

    // 生成6位验证码
    const code = crypto.randomInt(100000, 999999).toString();

    // 先保存验证码，确保后续校验可追踪
    const codeDoc = await codesCollection.add({
      email,
      code,
      client_ip: clientIP,
      used: false,
      created_at: Date.now()
    });

    // 发送邮件
    const emailSent = await sendEmail(email, code, requestId);

    if (emailSent.status === 'uncertain') {
      logger.warn(`[${requestId}] 邮件投递状态不确定，保留验证码记录，等待用户先查收邮箱`);
      return {
        code: 0,
        success: true,
        pendingDelivery: true,
        retryAfter: 60,
        message: '验证码请求已提交，请先检查邮箱，若未收到请在倒计时结束后重试',
        requestId
      };
    }

    if (emailSent.status !== 'sent') {
      // 邮件发送失败
      logger.warn(`[${requestId}] 邮件发送失败，准备回滚验证码记录`);

      // 回滚未送达验证码，避免用户因 1 分钟限流无法立即重试
      try {
        if (codeDoc?.id && typeof codesCollection.doc === 'function') {
          await codesCollection.doc(codeDoc.id).remove();
        } else {
          logger.warn(`[${requestId}] 当前数据库适配器不支持按 doc 回滚验证码记录`);
        }
      } catch (rollbackError) {
        logger.error(`[${requestId}] 验证码回滚失败:`, rollbackError);
      }

      // 不返回验证码，避免泄露
      if (process.env.NODE_ENV !== 'production') {
        return {
          code: 0,
          success: true,
          message: '开发模式：验证码已生成，但邮件发送失败',
          requestId
        };
      }

      return {
        code: 502,
        success: false,
        message: '邮件服务暂时不可用，请稍后再试',
        requestId
      };
    }

    logger.info(`[${requestId}] 验证码已发送到: ${maskEmail(email)}`);

    return {
      code: 0,
      success: true,
      message: '验证码已发送，请查收邮件',
      requestId
    };
  } catch (error) {
    logger.error(`[${requestId}] 发送验证码异常:`, error);
    if (error instanceof TrialError)
      return { code: 403, success: false, errorCode: 'TRIAL_CLOSED', message: error.message, requestId };

    return {
      code: 500,
      success: false,
      message: '服务异常，请稍后重试',
      requestId
    };
  }
}

/**
 * 发送邮件
 */
async function sendEmail(to, code, requestId) {
  if (process.env.MAIL_POOL_URL)
    return sendThroughMailPool(to, renderTransactionalEmail('verification', { code }), requestId);
  // 如果没有配置SMTP，跳过发送
  if (!SMTP_USER || !SMTP_PASS) {
    logger.warn('SMTP未配置，跳过邮件发送');
    return { status: 'failed', reason: 'smtp_not_configured' };
  }

  // 使用 nodemailer 发送邮件（动态导入，Laf 运行时提供）
  const nodemailer = await import('nodemailer');
  const transporter = (nodemailer.default || nodemailer).createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 8000
  });

  const mailOptions = {
    from: SMTP_FROM,
    to,
    ...renderTransactionalEmail('verification', { code })
  };

  for (let attempt = 1; attempt <= SMTP_RETRY_TIMES; attempt++) {
    try {
      await transporter.sendMail(mailOptions);
      return { status: 'sent' };
    } catch (error) {
      const canRetry = shouldRetryEmailError(error);
      const errorCode = String(error?.code || 'unknown');
      const responseCode = Number(error?.responseCode || 0);
      logger.error(`[${requestId}] 发送邮件失败(第 ${attempt}/${SMTP_RETRY_TIMES} 次):`, {
        errorCode,
        responseCode,
        message: error?.message
      });

      if (!canRetry || attempt >= SMTP_RETRY_TIMES) {
        return canRetry
          ? { status: 'uncertain', reason: errorCode || 'transient_failure' }
          : { status: 'failed', reason: errorCode || 'smtp_failure' };
      }

      await sleep(SMTP_RETRY_DELAY_MS * attempt);
    }
  }

  return { status: 'uncertain', reason: 'retry_exhausted' };
}

function shouldRetryEmailError(error) {
  const code = String(error?.code || '').toUpperCase();
  const responseCode = Number(error?.responseCode || 0);

  if (code === 'EAUTH') {
    return false;
  }

  if (responseCode >= 500 && responseCode < 600) {
    return true;
  }

  if (responseCode >= 400 && responseCode < 500) {
    return false;
  }

  return ['ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'ECONNRESET', 'EAI_AGAIN', 'ENOTFOUND'].includes(code);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
