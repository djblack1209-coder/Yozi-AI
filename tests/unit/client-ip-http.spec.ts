// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import http from 'node:http';
import { networkInterfaces } from 'node:os';

let directory: string;
const children = new Set<ChildProcess>();
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await exited;
}
beforeAll(() => {
  const evidenceRoot = process.env.YOZI_CLIENT_IP_EVIDENCE_DIR || 'tmp/client-ip-http';
  mkdirSync(evidenceRoot, { recursive: true });
  directory = mkdtempSync(resolve(evidenceRoot, 'http-'));
  execFileSync(
    process.execPath,
    [
      'laf-backend/standalone/node_modules/typescript/bin/tsc',
      '-p',
      'laf-backend/standalone/tsconfig.build.json',
      '--outDir',
      directory
    ],
    { timeout: 60000, stdio: 'pipe' }
  );
  execFileSync(
    process.execPath,
    ['laf-backend/standalone/package-runtime.mjs', '--output', relative(process.cwd(), directory)],
    { timeout: 10000, stdio: 'pipe' }
  );
  // package-runtime.mjs links the backend dependencies into an isolated --output itself.
  // Expose only the synthetic probe in this disposable runtime.
  for (const name of readdirSync(`${directory}/functions`)) {
    if (name.endsWith('.js')) unlinkSync(`${directory}/functions/${name}`);
  }
  // Probe exists only in this disposable build, never in production sources/routes.
  const clientIpModule = pathToFileURL(resolve(directory, 'functions/_shared/client-ip.js'));
  writeFileSync(
    `${directory}/functions/client-ip-probe.js`,
    `import {getClientIp} from ${JSON.stringify(clientIpModule.href)}; export default async ctx => ({ip:getClientIp(ctx)});\n`
  );
}, 60000);
afterAll(async () => {
  try {
    for (const child of children) await stop(child);
  } finally {
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});
async function start(trust?: string, host = '127.0.0.1') {
  const child = spawn(process.execPath, [`${directory}/standalone/server.js`], {
    env: {
      PATH: process.env.PATH,
      HOST: host,
      PORT: '0',
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27189/exam_learning_isolated',
      DB_NAME: 'exam_learning_isolated',
      STORAGE_DIR: `${directory}/storage`,
      ...(trust === undefined ? {} : { TRUST_PROXY: trust })
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  children.add(child);
  let output = '';
  const ready = new Promise<number>((accept, reject) => {
    const timer = setTimeout(() => reject(new Error('standalone startup timeout')), 10000);
    child.stdout!.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/Listening on http:\/\/.*:(\d+)/);
      if (match) {
        clearTimeout(timer);
        accept(Number(match[1]));
      }
    });
    child.stderr!.on('data', (chunk) => {
      output += chunk;
    });
    child.once('exit', () => {
      clearTimeout(timer);
      reject(new Error(output));
    });
  });
  return { child, ready };
}
function request(port: number, headers: Record<string, string> = {}, localAddress = '127.0.0.1') {
  return new Promise<{ status: number; body: any }>((accept, reject) => {
    const req = http.get(
      { hostname: localAddress, port, path: '/client-ip-probe', headers, localAddress, agent: false },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => accept({ status: res.statusCode!, body: JSON.parse(body) }));
      }
    );
    req.setTimeout(5000, () => req.destroy(new Error('HTTP timeout')));
    req.on('error', reject);
  });
}
describe('actual standalone HTTP transport', () => {
  it('ignores forged headers for direct peers and separates real source addresses', async () => {
    const { child, ready } = await start('false', '::');
    try {
      const port = await ready;
      const headers = {
        'x-forwarded-for': '192.0.2.99',
        'x-real-ip': '192.0.2.98',
        'cf-connecting-ip': '192.0.2.97',
        'true-client-ip': '192.0.2.96',
        'x-client-ip': '192.0.2.95',
        forwarded: 'for=192.0.2.94'
      };
      expect((await request(port, headers)).body.ip).toBe('127.0.0.1');
      expect((await request(port, headers, '::1')).body.ip).toBe('::1');
    } finally {
      await stop(child);
    }
  });
  it('resolves trusted chains; rejects invalid addresses before running a function', async () => {
    const { child, ready } = await start('127.0.0.1/32,10.2.0.3/32');
    try {
      const port = await ready;
      expect((await request(port, { 'x-forwarded-for': '192.0.2.99, 198.51.100.2' })).body.ip).toBe('198.51.100.2');
      expect((await request(port, { 'x-forwarded-for': '192.0.2.99, ::ffff:198.51.100.2, 10.2.0.3' })).body.ip).toBe(
        '198.51.100.2'
      );
      expect((await request(port, { 'x-forwarded-for': 'invalid' })).status).toBe(503);
      expect((await request(port)).body.ip).toBe('127.0.0.1');
    } finally {
      await stop(child);
    }
  });
  it('uses the address whitelist by default, never an unconditional hop count', async () => {
    const address = Object.values(networkInterfaces())
      .flat()
      .find((entry) => entry && !entry.internal && entry.family === 'IPv4')?.address;
    expect(address).toBeTruthy();
    const { child, ready } = await start(undefined, address!);
    try {
      const port = await ready;
      expect((await request(port, { 'x-forwarded-for': '192.0.2.99' }, address!)).body.ip === address).toBe(true);
    } finally {
      await stop(child);
    }
  });
  it.each(['1', 'true', 'invalid', ''])('refuses startup for TRUST_PROXY=%j', async (trust) => {
    const { child, ready } = await start(trust);
    await expect(ready).rejects.toThrow('Invalid TRUST_PROXY');
    expect(child.exitCode).not.toBe(0);
  });
});
