// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoClient } from '../../laf-backend/standalone/node_modules/mongodb/lib/index.js';
import { createMailPool, readMailPoolConfig } from '../../laf-backend/standalone/mail-pool';
import { createOperations } from '../../laf-backend/standalone/operations';

const clients = [
  { id: 'yozi', secret: 'TEST_ONLY_yozi_pool_secret_123456', from: 'Yozi AI <yozi@example.test>' },
  { id: 'lazy', secret: 'TEST_ONLY_lazy_pool_secret_123456', from: 'Lazy AI <lazy@example.test>' }
];
const provider = (id: string, dailyLimit = 100, monthlyLimit?: number) => ({
  id,
  dailyLimit,
  monthlyLimit,
  host: 'smtp.example.test',
  port: 465,
  user: 'test',
  pass: 'TEST_ONLY'
});
const mail = {
  to: 'student@example.test',
  subject: '验证 123456',
  text: '123456',
  html: '<b>123456</b>',
  attachments: [{ filename: 'mark.png', content: 'YWJj', cid: 'mark' }]
};
const config = (providers: any[]) => ({
  MAIL_POOL_PROVIDERS: JSON.stringify(providers),
  MAIL_POOL_CLIENTS: JSON.stringify(clients)
});
async function invoke(handler: any, body: any, headers: Record<string, string> = {}) {
  const result: any = { code: 200, headers: {} };
  const res: any = {
    setHeader(k: string, v: string) {
      result.headers[k] = v;
    },
    status(code: number) {
      result.code = code;
      return res;
    },
    json(value: any) {
      result.body = value;
      return res;
    }
  };
  await handler({ body, headers, header: (name: string) => headers[name] }, res);
  return result;
}
const sendHeaders = (product = 'yozi') => ({
  'x-mail-product': product,
  'x-mail-secret': clients.find((c) => c.id === product)!.secret
});

it('rejects malformed private configuration and unauthenticated mail without touching Mongo', async () => {
  expect(() => readMailPoolConfig(config([provider('same'), provider('same')]))).toThrow();
  const getDb = vi.fn();
  const pool = createMailPool({ getDb, env: config([provider('one')]) });
  expect((await invoke(pool.handler, { ...mail, idempotencyKey: 'denied' })).code).toBe(403);
  expect(
    (
      await invoke(
        pool.handler,
        { ...mail, idempotencyKey: 'wrong' },
        { ...sendHeaders('lazy'), 'x-mail-secret': clients[0].secret }
      )
    ).code
  ).toBe(403);
  expect(getDb).not.toHaveBeenCalled();
});

const uri = process.env.OPERATIONS_TEST_MONGO_URI;
if (uri && !/^mongodb:\/\/127\.0\.0\.1:\d+\/?$/.test(uri))
  throw new Error('Use a local Mongo server; this test creates and drops its own database');
describe.skipIf(!uri)('mail pool and operations against isolated Mongo', () => {
  let mongo: MongoClient, db: any;
  const at = Date.parse('2026-11-11T10:00:00Z');
  beforeAll(async () => {
    mongo = await new MongoClient(uri!).connect();
    db = mongo.db(`yozi_operations_test_${process.pid}`);
  });
  beforeEach(async () => {
    await db.dropDatabase();
    vi.stubEnv('ADMIN_SECRET', 'TEST_ONLY_operations_secret');
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(async () => {
    await db?.dropDatabase();
    await mongo?.close();
  });
  const pool = (
    providers = [provider('one'), provider('two')],
    send: any = vi.fn(async () => ({ accepted: [mail.to] })),
    now = () => at
  ) => createMailPool({ getDb: async () => db, env: config(providers), send, now });
  const deliver = (service: any, key: string, product = 'yozi', extra = {}) =>
    invoke(service.handler, { ...mail, idempotencyKey: key, ...extra }, sendHeaders(product));

  it('reserves daily quotas atomically under concurrent requests and rotates tied timestamps', async () => {
    const send = vi.fn(async () => ({ accepted: [mail.to] }));
    const service = pool([provider('one', 2), provider('two', 2)], send);
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => deliver(service, `parallel-${i}`)));
    expect(results.filter((r) => r.body.status === 'sent')).toHaveLength(4);
    expect(send).toHaveBeenCalledTimes(4);
    expect((await service.status()).providers.map((p) => p.dailyUsed)).toEqual([2, 2]);
    expect((await service.status()).providers.every((p) => p.dailyRemaining === 0)).toBe(true);
  });

  it('fails over a provider quota rejection once, releases the reservation and preserves the product sender', async () => {
    const send = vi.fn(async (p: any) => {
      if (p.id === 'one') throw { response: '550 Monthly email quota exceeded', responseCode: 550 };
      return { accepted: [mail.to] };
    });
    const service = pool([provider('one', 100, 3000), provider('two')], send);
    expect((await deliver(service, 'failover', 'lazy', { from: 'attacker@example.test' })).body).toMatchObject({
      status: 'sent',
      provider: 'two'
    });
    expect(send.mock.calls.map((c) => c[0].id)).toEqual(['one', 'two']);
    expect((send.mock.calls as any)[1][1]).toBe(clients[1].from);
    const blocked = (await service.status()).providers.find((p) => p.id === 'one');
    expect(blocked).toMatchObject({
      dailyUsed: 0,
      monthlyUsed: 0,
      dailyRemaining: 0,
      monthlyRemaining: 0,
      blocked: true
    });
    expect((await deliver(service, 'failover')).body.status).toBe('sent'); // Separate product idempotency scope.
  });

  it('honors a monthly cap across daily resets and resets only at the real UTC month boundary', async () => {
    let clock = at;
    const service = pool([provider('one', 100, 1)], undefined, () => clock);
    expect((await deliver(service, 'month-one')).body.status).toBe('sent');
    clock += 86400000;
    expect((await service.status()).providers[0]).toMatchObject({ dailyUsed: 0, monthlyUsed: 1, dailyRemaining: 0 });
    expect((await deliver(service, 'month-two')).body.reason).toBe('quota_exhausted');
    clock = Date.parse('2026-12-01T00:00:00Z');
    expect((await deliver(service, 'new-month')).body.status).toBe('sent');
  });

  it('resets a daily credit rejection the next UTC day when the provider has no monthly cap', async () => {
    let clock = at;
    const send = vi
      .fn()
      .mockRejectedValueOnce({ response: '550 Insufficient credits', responseCode: 550 })
      .mockResolvedValue({ accepted: [mail.to] });
    const service = pool([provider('daily-only')], send, () => clock);
    expect((await deliver(service, 'credits')).body.status).toBe('failed');
    expect((await service.status()).providers[0].dailyRemaining).toBe(0);
    clock += 86400000;
    expect((await deliver(service, 'next-day')).body.status).toBe('sent');
  });

  it('never resends after an unknown SMTP outcome, and binds an idempotency key to the payload', async () => {
    const send = vi.fn(async () => {
      throw { code: 'ETIMEDOUT', command: 'DATA' };
    });
    const service = pool(undefined, send);
    expect((await deliver(service, 'unknown')).body.status).toBe('uncertain');
    expect((await deliver(service, 'unknown')).body.status).toBe('uncertain');
    expect(send).toHaveBeenCalledTimes(1);
    expect((await deliver(service, 'unknown', 'yozi', { subject: 'changed' })).body.reason).toBe(
      'idempotency_conflict'
    );
    const receipt = JSON.stringify(await db.collection('mail_pool_receipts').findOne({}));
    for (const privateValue of [mail.to, mail.text, mail.html, clients[0].secret])
      expect(receipt).not.toContain(privateValue);
  });

  it('rejects path attachments at the boundary and fails over definitive connection failures', async () => {
    const send = vi.fn(async (p: any) => {
      if (p.id === 'one') throw { code: 'ECONNREFUSED', command: 'CONN' };
      return { accepted: [mail.to] };
    });
    const service = pool(undefined, send);
    expect(
      (await deliver(service, 'path', 'yozi', { attachments: [{ filename: 'secret', path: '/etc/passwd' }] })).code
    ).toBe(400);
    expect((await deliver(service, 'connection')).body).toMatchObject({ status: 'sent', provider: 'two' });
  });

  it('denies operator access and projects only account metrics, with literal search and real activity counts', async () => {
    await db.collection('users').insertMany(
      Array.from({ length: 52 }, (_, i) => ({
        _id: `u${String(i).padStart(2, '0')}` as any,
        email: `user${i}@example.test`,
        nickname: i === 0 ? '<script>[student]</script>' : 'student',
        password: 'DO_NOT_EXPOSE_password',
        modelKey: 'DO_NOT_EXPOSE_key',
        created_at: new Date()
      }))
    );
    await db.collection('learning_accounts').insertOne({
      user_id: 'u00',
      calls: [{ at: Date.now(), status: 'completed', result: { message: 'DO_NOT_EXPOSE_learning' } }],
      cost: { spent: 0.25, pending: 1 }
    });
    await db.collection('learning_states').insertOne({ user_id: 'u00', revision: 21, state: 'DO_NOT_EXPOSE_history' });
    const ops = createOperations(async () => db, pool());
    await db.collection('users').updateOne({ _id: 'u00' as any }, { $set: { account_status: 'pending_deletion' } });
    ops.recordActivity('u01');
    ops.recordActivity('u00');
    await ops.flush();
    expect((await invoke(ops.handler, {})).code).toBe(403);
    const headers = { 'x-admin-secret': process.env.ADMIN_SECRET! };
    const result = await invoke(ops.handler, { view: 'overview' }, headers);
    expect(result.headers['Cache-Control']).toBe('no-store');
    expect(result.body.data).toMatchObject({
      totalUsers: 52,
      activeUsers7Days: 2,
      subscriptionServiceEnabled: false,
      hasMore: true
    });
    expect(result.body.data.users).toHaveLength(50);
    expect(JSON.stringify(result.body)).not.toContain('DO_NOT_EXPOSE');
    const searched = await invoke(ops.handler, { view: 'users', search: '[student]' }, headers);
    expect(searched.body.data.users).toHaveLength(1);
    expect(searched.body.data.users[0]).toMatchObject({
      calls: 1,
      syncRevision: 21,
      settledCost: 0.25,
      pendingCost: 1,
      status: 'pending_deletion'
    });
    expect((await invoke(ops.handler, { view: 'users', offset: 50 }, headers)).body.data.users).toHaveLength(2);
    expect((await invoke(ops.handler, { view: 'users', offset: -1 }, headers)).code).toBe(400);
  });

  it('reports newly collected visits, errors and maintenance without inventing historical zeros', async () => {
    const ops = createOperations(async () => db, pool());
    ops.recordVisit('/zh/');
    ops.recordVisit('/account/');
    ops.recordRequest('POST /learning-coach', 503, 123);
    ops.recordMaintenance();
    await ops.flush();
    const result = await invoke(ops.handler, {}, { 'x-admin-secret': process.env.ADMIN_SECRET! });
    expect(result.body.data.days.at(-1)).toMatchObject({ visits: 2, requests: 1, failures: 1 });
    expect(result.body.data.days[0]).toMatchObject({ visits: null, requests: null, failures: null });
    expect(result.body.data.maintenance[0].event).toBe('backend_started');
  });
});
