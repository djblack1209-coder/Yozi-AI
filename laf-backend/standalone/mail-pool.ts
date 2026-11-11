import crypto from 'node:crypto';
import type { Db } from 'mongodb';
import type { RequestHandler } from 'express';

type Provider = {
  id: string;
  host: string;
  port: number;
  user: string;
  pass: string;
  dailyLimit: number;
  monthlyLimit?: number;
};
type Client = { id: string; secret: string; from: string };
type Mail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments: { filename: string; content: string; cid?: string; contentType?: string }[];
};
type Outcome = { status: 'sent' | 'failed' | 'uncertain'; reason?: string; provider?: string };

function secretMatches(value: string, expected: string) {
  const a = Buffer.from(value || ''),
    b = Buffer.from(expected || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function readMailPoolConfig(env: NodeJS.ProcessEnv) {
  const providers: Provider[] = JSON.parse(env.MAIL_POOL_PROVIDERS || '[]');
  const clients: Client[] = JSON.parse(env.MAIL_POOL_CLIENTS || '[]');
  if (
    !Array.isArray(providers) ||
    !Array.isArray(clients) ||
    new Set(providers.map((p) => p.id)).size !== providers.length ||
    new Set(clients.map((c) => c.id)).size !== clients.length ||
    providers.some(
      (p) =>
        !p.id ||
        !p.host ||
        !p.user ||
        !p.pass ||
        !Number.isInteger(p.port) ||
        p.port < 1 ||
        p.port > 65535 ||
        !Number.isInteger(p.dailyLimit) ||
        p.dailyLimit < 1 ||
        (p.monthlyLimit != null && (!Number.isInteger(p.monthlyLimit) || p.monthlyLimit < 1))
    ) ||
    clients.some((c) => !c.id || typeof c.secret !== 'string' || !c.secret || !c.from || /[\r\n]/.test(c.from))
  ) {
    throw new Error('Invalid private mail pool configuration');
  }
  return { providers, clients };
}

function readMail(body: any): Mail | null {
  if (
    !body ||
    typeof body.to !== 'string' ||
    !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(body.to) ||
    typeof body.subject !== 'string' ||
    !body.subject ||
    /[\r\n]/.test(body.subject) ||
    typeof body.text !== 'string' ||
    typeof body.html !== 'string' ||
    (body.attachments != null && !Array.isArray(body.attachments))
  )
    return null;
  const attachments = body.attachments || [];
  if (
    attachments.some(
      (a) =>
        !a ||
        typeof a.filename !== 'string' ||
        typeof a.content !== 'string' ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(a.content) ||
        (a.cid != null && typeof a.cid !== 'string') ||
        (a.contentType != null && typeof a.contentType !== 'string')
    )
  )
    return null;
  // Only inline bytes cross the boundary; caller-supplied file paths and URLs never reach Nodemailer.
  return {
    to: body.to,
    subject: body.subject,
    text: body.text,
    html: body.html,
    attachments: attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
      ...(a.cid ? { cid: a.cid } : {}),
      ...(a.contentType ? { contentType: a.contentType } : {})
    }))
  };
}

async function sendSmtp(provider: Provider, from: string, mail: Mail, id: string) {
  const nodemailer = await import('nodemailer');
  const transport = (nodemailer.default || nodemailer).createTransport({
    host: provider.host,
    port: provider.port,
    secure: provider.port === 465,
    requireTLS: provider.port !== 465,
    auth: { user: provider.user, pass: provider.pass },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 8000
  });
  try {
    return await transport.sendMail({
      from,
      ...mail,
      messageId: `<${id}@245334.xyz>`,
      attachments: mail.attachments.map((a) => ({ ...a, content: Buffer.from(a.content, 'base64') }))
    });
  } finally {
    transport.close();
  }
}

function failure(error: any) {
  const response = String(error?.response || '');
  if (/quota|daily limit|monthly limit|credit.*(?:exceed|insufficient)|insufficient.*credit/i.test(response))
    return { reason: 'quota', definitive: true, monthly: /month|credit|balance/i.test(response) };
  if (error?.command === 'CONN' || ['EAUTH', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'].includes(error?.code))
    return { reason: 'unavailable', definitive: true };
  if (Number(error?.responseCode) >= 400) return { reason: 'rejected', definitive: true };
  return { reason: 'delivery_unknown', definitive: false };
}

export function createMailPool({
  getDb,
  env = process.env,
  send = sendSmtp,
  now = Date.now
}: {
  getDb: () => Promise<Db>;
  env?: NodeJS.ProcessEnv;
  send?: typeof sendSmtp;
  now?: () => number;
}) {
  const { providers, clients } = readMailPoolConfig(env);
  let ready: Promise<void>;
  const prepare = async () => {
    ready ||= getDb()
      .then(async (db) => {
        for (const p of providers)
          await db.collection('mail_pool_usage').updateOne(
            { _id: p.id as any },
            {
              $set: { dailyLimit: p.dailyLimit, monthlyLimit: p.monthlyLimit ?? null },
              $setOnInsert: { day: '', month: '', dailyUsed: 0, monthlyUsed: 0, lastUsedAt: 0 }
            },
            { upsert: true }
          );
      })
      .catch((error) => {
        ready = undefined;
        throw error;
      });
    await ready;
  };

  async function deliver(client: Client, key: string, mail: Mail): Promise<Outcome> {
    await prepare();
    const db = await getDb(),
      usage = db.collection('mail_pool_usage'),
      receipts = db.collection('mail_pool_receipts');
    const id = crypto
      .createHash('sha256')
      .update(client.id + '\0' + key)
      .digest('hex');
    const fingerprint = crypto.createHmac('sha256', client.secret).update(JSON.stringify(mail)).digest('hex');
    try {
      await receipts.insertOne({ _id: id as any, product: client.id, fingerprint, status: 'pending', at: now() });
    } catch (error: any) {
      if (error.code !== 11000) throw error;
      const previous = await receipts.findOne({ _id: id as any });
      if (previous?.fingerprint !== fingerprint) return { status: 'failed', reason: 'idempotency_conflict' };
      return {
        status: previous.status === 'pending' ? 'uncertain' : previous.status,
        reason: previous.reason,
        provider: previous.provider
      } as Outcome;
    }
    const finish = async (result: Outcome) => {
      await receipts.updateOne({ _id: id as any }, { $set: { ...result, finishedAt: now() } });
      return result;
    };
    const at = now(),
      day = new Date(at).toISOString().slice(0, 10),
      month = day.slice(0, 7),
      tried: string[] = [];
    const daily = { $cond: [{ $eq: ['$day', day] }, '$dailyUsed', 0] };
    const monthly = { $cond: [{ $eq: ['$month', month] }, '$monthlyUsed', 0] };
    for (let i = 0; i < providers.length; i++) {
      const row = await usage.findOneAndUpdate(
        {
          _id: { $in: providers.filter((p) => !tried.includes(p.id)).map((p) => p.id) } as any,
          blockedDay: { $ne: day },
          blockedMonth: { $ne: month },
          $expr: {
            $and: [
              { $lt: [daily, '$dailyLimit'] },
              { $or: [{ $eq: ['$monthlyLimit', null] }, { $lt: [monthly, '$monthlyLimit'] }] }
            ]
          }
        },
        [
          {
            $set: {
              day,
              month,
              dailyUsed: { $add: [daily, 1] },
              monthlyUsed: { $add: [monthly, 1] },
              lastUsedAt: at,
              selections: { $add: [{ $ifNull: ['$selections', 0] }, 1] }
            }
          }
        ],
        { sort: { lastUsedAt: 1, selections: 1, _id: 1 }, returnDocument: 'after', includeResultMetadata: false }
      );
      if (!row) return finish({ status: 'failed', reason: 'quota_exhausted' });
      const provider = providers.find((p) => p.id === String(row._id))!;
      tried.push(provider.id);
      await receipts.updateOne({ _id: id as any }, { $set: { provider: provider.id } });
      try {
        const result = await send(provider, client.from, mail, id);
        if (!result.accepted?.length) throw Object.assign(new Error('Recipient rejected'), { responseCode: 550 });
        await usage.updateOne({ _id: row._id }, { $set: { lastDeliveredAt: now() } });
        return finish({ status: 'sent', provider: provider.id });
      } catch (error) {
        const result = failure(error);
        await receipts.updateOne(
          { _id: id as any },
          { $push: { attempts: { provider: provider.id, reason: result.reason, at: now() } } as any }
        );
        if (!result.definitive) return finish({ status: 'uncertain', reason: result.reason, provider: provider.id });
        await usage.updateOne({ _id: row._id }, [
          {
            $set: {
              dailyUsed: {
                $cond: [{ $eq: ['$day', day] }, { $max: [0, { $subtract: ['$dailyUsed', 1] }] }, '$dailyUsed']
              },
              monthlyUsed: {
                $cond: [{ $eq: ['$month', month] }, { $max: [0, { $subtract: ['$monthlyUsed', 1] }] }, '$monthlyUsed']
              },
              ...(result.reason === 'quota'
                ? result.monthly && provider.monthlyLimit
                  ? { blockedMonth: month }
                  : { blockedDay: day }
                : {})
            }
          }
        ]);
        if (result.reason === 'rejected')
          return finish({ status: 'failed', reason: 'delivery_rejected', provider: provider.id });
      }
    }
    return finish({ status: 'failed', reason: 'providers_unavailable' });
  }

  const handler: RequestHandler = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const client = clients.find((c) => c.id === req.header('x-mail-product'));
    if (!client || !secretMatches(req.header('x-mail-secret') || '', client.secret))
      return void res.status(403).json({ code: 403 });
    const key = req.body?.idempotencyKey,
      mail = readMail(req.body);
    if (typeof key !== 'string' || !key || !mail) return void res.status(400).json({ code: 400 });
    try {
      res.json(await deliver(client, key, mail));
    } catch {
      res.status(503).json({ status: 'uncertain', reason: 'pool_unavailable' });
    }
  };

  async function status() {
    await prepare();
    const db = await getDb(),
      day = new Date(now()).toISOString().slice(0, 10),
      month = day.slice(0, 7);
    const rows = await db
      .collection('mail_pool_usage')
      .find({ _id: { $in: providers.map((p) => p.id) } as any })
      .toArray();
    return {
      timezone: 'UTC',
      providers: rows.map((r) => {
        const dailyUsed = r.day === day ? r.dailyUsed : 0,
          monthlyUsed = r.month === month ? r.monthlyUsed : 0;
        const monthlyRemaining =
          r.monthlyLimit == null ? null : r.blockedMonth === month ? 0 : Math.max(0, r.monthlyLimit - monthlyUsed);
        const dailyRemaining =
          r.blockedDay === day || r.blockedMonth === month
            ? 0
            : Math.min(Math.max(0, r.dailyLimit - dailyUsed), monthlyRemaining ?? Infinity);
        return {
          id: String(r._id),
          dailyLimit: r.dailyLimit,
          monthlyLimit: r.monthlyLimit,
          dailyUsed,
          monthlyUsed,
          dailyRemaining,
          monthlyRemaining,
          blocked: dailyRemaining === 0,
          lastDeliveredAt: r.lastDeliveredAt || null
        };
      }),
      outcomes: await db
        .collection('mail_pool_receipts')
        .aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])
        .toArray(),
      recent: await db
        .collection('mail_pool_receipts')
        .find({}, { projection: { product: 1, status: 1, reason: 1, provider: 1, at: 1 } })
        .sort({ at: -1 })
        .limit(20)
        .toArray()
    };
  }
  return { handler, status };
}
