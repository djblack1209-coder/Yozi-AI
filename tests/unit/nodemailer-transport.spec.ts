// @vitest-environment node
import net from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import nodemailer from '../../laf-backend/standalone/node_modules/nodemailer/dist/esm/nodemailer.js';

const fixture = vi.hoisted(() => ({
  options: null as any,
  message: null as any,
  envelope: null as any,
  row: null as any,
  removed: [] as string[],
  error: null as any,
  sends: 0
}));

vi.mock('@lafjs/cloud', () => {
  const collection: any = {
    where: () => collection,
    orderBy: () => collection,
    getOne: async () => ({ data: null }),
    count: async () => ({ total: 0 }),
    add: async (row: any) => {
      fixture.row = row;
      return { id: 'offline-code' };
    },
    doc: (id: string) => ({ remove: async () => fixture.removed.push(id) })
  };
  return {
    default: { database: () => ({ collection: () => collection, command: { gt: (v: number) => ({ $gt: v }) } }) }
  };
});
vi.mock('../../laf-backend/functions/_shared/api-response', async (original) => ({
  ...(await original<any>()),
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));
vi.mock('nodemailer', () => ({
  default: {
    createTransport(options: any) {
      fixture.options = options;
      // Exercise the installed mailer; every send uses a transport without sockets.
      const offline = nodemailer.createTransport(
        fixture.error
          ? { name: 'offline-failure', version: '1', send: (_mail: any, done: any) => done(fixture.error) }
          : { ...options, jsonTransport: true }
      );
      return {
        async sendMail(message: any) {
          fixture.sends++;
          try {
            const info = await offline.sendMail(message);
            fixture.message = JSON.parse(String(info.message));
            fixture.envelope = info.envelope;
            return info;
          } finally {
            offline.close();
          }
        }
      };
    }
  }
}));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('SMTP_HOST', 'smtp.offline.invalid');
  vi.stubEnv('SMTP_USER', 'fixture@yozi.invalid');
  vi.stubEnv('SMTP_PASS', 'TEST_ONLY_offline_transport');
  vi.stubEnv('SMTP_FROM', 'Yozi AI <fixture@yozi.invalid>');
  vi.stubEnv('SMTP_PORT', '465');
  vi.stubEnv('SMTP_RETRY_TIMES', '1');
  vi.stubEnv('MAIL_POOL_URL', '');
  Object.assign(fixture, {
    options: null,
    message: null,
    envelope: null,
    row: null,
    removed: [],
    error: null,
    sends: 0
  });
  vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(() => {
    throw new Error('Network access forbidden in mailer compatibility tests');
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function requestCode() {
  const handler = (await import('../../laf-backend/functions/send-email-code')).default;
  return handler({ body: { email: 'student@yozi-fixture.com' }, socket: { remoteAddress: '192.0.2.42' } });
}

describe('installed Nodemailer compatibility without sending mail', () => {
  it('preserves sender, code content, envelope and SMTP deadlines', async () => {
    expect((await requestCode()).success).toBe(true);
    expect(fixture.options).toEqual({
      host: 'smtp.offline.invalid',
      port: 465,
      secure: true,
      auth: { user: 'fixture@yozi.invalid', pass: 'TEST_ONLY_offline_transport' },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 8000
    });
    expect(fixture.message.from).toEqual({ name: 'Yozi AI', address: 'fixture@yozi.invalid' });
    expect(fixture.message.to).toEqual([{ address: 'student@yozi-fixture.com', name: '' }]);
    expect(fixture.message.subject).toContain(fixture.row.code);
    expect(fixture.message.text).toContain(fixture.row.code);
    expect(fixture.message.html).toContain(fixture.row.code);
    expect(fixture.message.html).toContain('10 分钟内有效');
    expect(fixture.envelope).toEqual({ from: 'fixture@yozi.invalid', to: ['student@yozi-fixture.com'] });
    expect(fixture.sends).toBe(1);
    expect(fixture.removed).toEqual([]);
    const smtp = nodemailer.createTransport(fixture.options);
    try {
      expect(smtp.transporter.options.connectionTimeout).toBe(5000);
      expect(smtp.transporter.options.greetingTimeout).toBe(5000);
      expect(smtp.transporter.options.socketTimeout).toBe(8000);
    } finally {
      smtp.close();
    }
  });

  it('keeps an uncertain timeout receipt and the code without resending', async () => {
    fixture.error = Object.assign(new Error('synthetic setup timeout'), { code: 'ETIMEDOUT', timeoutType: 'CONNECT' });
    expect(await requestCode()).toMatchObject({ code: 0, success: true, pendingDelivery: true, retryAfter: 60 });
    expect(fixture.sends).toBe(1);
    expect(fixture.removed).toEqual([]);
  });

  it('rolls back a definitive authentication failure without reporting delivery', async () => {
    fixture.error = Object.assign(new Error('synthetic auth failure'), { code: 'EAUTH', responseCode: 535 });
    expect(await requestCode()).toMatchObject({ code: 502, success: false });
    expect(fixture.sends).toBe(1);
    expect(fixture.removed).toEqual(['offline-code']);
  });

  it.each(['sent', 'uncertain', 'failed'])(
    'uses a configured pool without bypassing its %s outcome',
    async (status) => {
      vi.stubEnv('MAIL_POOL_URL', 'http://127.0.0.1:3002');
      vi.stubEnv('MAIL_POOL_SECRET', 'TEST_ONLY_product_pool_secret');
      const send = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue({ ok: true, json: async () => ({ status }) } as Response);
      const result = await requestCode();
      expect(result.success).toBe(status !== 'failed');
      if (status === 'uncertain') expect(result.pendingDelivery).toBe(true);
      expect(fixture.sends).toBe(0);
      expect(send).toHaveBeenCalledTimes(1);
      const [url, options] = send.mock.calls[0];
      expect(url).toBe('http://127.0.0.1:3002/mail-pool');
      expect(options.headers['x-mail-product']).toBe('yozi');
      const payload = JSON.parse(options.body as string);
      expect(payload.text).toContain(fixture.row.code);
      expect(payload.subject).toContain(fixture.row.code);
      expect(payload.attachments[0].content).toMatch(/^[A-Za-z0-9+/]+=*$/);
      expect(payload.attachments[0].cid).toBeTruthy();
      expect(fixture.removed).toEqual(status === 'failed' ? ['offline-code'] : []);
    }
  );
});
