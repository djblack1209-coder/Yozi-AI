import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { summarizeLearning } from '../../laf-backend/functions/_shared/learning-domain.js';
if (process.env.LEARNING_TEST_MONGO_URI !== 'mongodb://127.0.0.1:27189/exam_learning_isolated')
  throw new Error('Only the explicitly enabled fixed local test Mongo URI is accepted');
const port = Number(process.env.YOZI_HTTP_PORT || 4382);
// Golden comparison of two backend builds: same requests, normalized responses and ledger.
const goldenOut = process.env.YOZI_GOLDEN_OUT;
const { MongoClient } = createRequire(new URL('../../laf-backend/standalone/package.json', import.meta.url))('mongodb');
const withDatabase = async (work) => {
  const client = await MongoClient.connect(process.env.LEARNING_TEST_MONGO_URI);
  try {
    return await work(client.db('exam_learning_isolated'));
  } finally {
    await client.close();
  }
};
// Every model and sync route now requires an existing active account.
const seedUsers = (...ids) =>
  withDatabase((database) =>
    Promise.all(
      ids.map((id) =>
        database.collection('users').updateOne({ _id: id }, { $set: { status: 'active' } }, { upsert: true })
      )
    )
  );
const serverEntry = process.env.YOZI_HTTP_SERVER || 'laf-backend/standalone/dist/standalone/server.js';
const golden = { responses: {}, ledger: {} };
const volatile =
  /(^|_)(at|expiresAt|checkedAt|durationMs|capturedAt|resultCachedAt|resultExpiresAt|keyRef|fingerprint|configurationVersion|connectionVersion|requestId|timestamp)$|At$/i;
const normalize = (value) =>
  Array.isArray(value)
    ? value.map(normalize)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .filter(([key]) => !volatile.test(key))
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, normalize(item)])
        )
      : typeof value === 'string'
        ? value
            .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>')
            .replace(/\b[0-9a-f]{24,}\b/g, '<hex>')
        : value;
const boundedFetch = (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(5000) });
const secret = 'TEST_ONLY_http_runtime_validation_no_production_key';
const base = `http://127.0.0.1:${port}`;
const jwt = (userId) => {
  const header = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url');
  const payload = Buffer.from(JSON.stringify({ userId, exp: Math.floor(Date.now() / 1000) + 60 })).toString(
    'base64url'
  );
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
};
const results = [];
const server = spawn(process.execPath, [serverEntry], {
  env: {
    PATH: process.env.PATH,
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: String(port),
    MONGODB_URI: 'mongodb://127.0.0.1:27189/exam_learning_isolated',
    DB_NAME: 'exam_learning_isolated',
    STORAGE_DIR: 'tmp/maintenance/http-storage',
    JWT_SECRET: secret,
    ALLOWED_ORIGINS: 'http://127.0.0.1:4210',
    LEARNING_PLATFORM_CALLS_ENABLED: 'false',
    LEARNING_PAYMENT_SANDBOX_ENABLED: 'false',
    LEARNING_VAULT_KEY: 'c'.repeat(64),
    LEARNING_ALLOWED_ORIGINS: 'https://api.deepseek.com',
    GOLDEN_PLATFORM_KEY: 'TEST_ONLY_platform_key_never_sent',
    LEARNING_PLATFORM_MODELS: JSON.stringify([
      {
        id: 'golden-platform',
        provider: 'deepseek',
        model: 'deepseek-flash',
        endpoint: 'https://api.deepseek.com/chat/completions',
        keyEnv: 'GOLDEN_PLATFORM_KEY',
        maxOutput: 1000,
        capabilities: { structured: true },
        priceVersion: 'golden',
        inputPerMillion: 1,
        outputPerMillion: 2
      }
    ])
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let logs = '';
server.stdout.on('data', (b) => (logs += b));
server.stderr.on('data', (b) => (logs += b));
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, passed: true });
  } catch (e) {
    results.push({ name, passed: false, error: e.message });
  }
}
const post = async (route, body, uid = 'maintenance-http-u1') =>
  (
    await boundedFetch(base + route, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${jwt(uid)}` },
      body: JSON.stringify(body)
    })
  ).json();
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      clearInterval(timer);
      reject(new Error('Server startup timeout'));
    }, 10000);
    const timer = setInterval(() => {
      if (logs.includes('[server] Listening')) {
        clearTimeout(timeout);
        clearInterval(timer);
        resolve();
      } else if (server.exitCode !== null) {
        clearTimeout(timeout);
        clearInterval(timer);
        reject(new Error('Server exited before ready'));
      }
    }, 100);
  });
  await seedUsers('maintenance-http-u1', 'golden-http-user');
  await check('health真实进程', async () => assert.equal((await boundedFetch(base + '/health')).status, 200));
  await check('缺JWT不得访问模型', async () =>
    assert.equal(
      (
        await (
          await boundedFetch(base + '/learning-models', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{"action":"list"}'
          })
        ).json()
      ).code,
      401
    )
  );
  await check('指定允许的CORS来源', async () =>
    assert.equal(
      (await boundedFetch(base + '/health', { headers: { origin: 'http://127.0.0.1:4210' } })).headers.get(
        'access-control-allow-origin'
      ),
      'http://127.0.0.1:4210'
    )
  );
  await check('不允许的来源没有授权头', async () =>
    assert.equal(
      (await boundedFetch(base + '/health', { headers: { origin: 'https://untrusted.example' } })).headers.get(
        'access-control-allow-origin'
      ),
      null
    )
  );
  await check('真实模型列表为空且平台关闭', async () => {
    const r = await post('/learning-models', { action: 'list' });
    assert.equal(r.code, 0);
    assert.equal(r.data.platformEnabled, false);
    assert.equal(r.data.models.length, 0);
  });
  const at = Date.now();
  const operations = [
    { id: 'http-continuity-c', type: 'conversation.start', at, data: { goal: '合成计算题验收' } },
    {
      id: 'http-continuity-plan',
      type: 'plan.set',
      at,
      data: {
        tasks: Array.from({ length: 10 }, (_, i) => ({
          id: `http-task-${i}`,
          title: `明确任务 ${i + 1}`,
          questionKey: `http-q-${i}@1`,
          condition: 'submitted'
        }))
      }
    }
  ];
  for (let i = 0; i < 6; i++)
    operations.push(
      {
        id: `http-q-add-${i}`,
        type: 'question.add',
        at,
        data: {
          question: {
            id: `http-q-${i}`,
            version: 1,
            scope: 'generated',
            prompt: `计算 ${12 + i} + 8。`,
            source: { kind: 'executable' },
            validation: {
              type: 'number',
              answer: String(20 + i),
              authority: 'executable',
              evidenceId: 'synthetic-independent-add'
            }
          }
        }
      },
      {
        id: `http-q-focus-${i}`,
        type: 'question.focus',
        at,
        data: { conversationId: 'http-continuity-c', questionKey: `http-q-${i}@1` }
      },
      {
        id: `http-answer-${i}`,
        type: 'attempt.submit',
        at,
        data: { conversationId: 'http-continuity-c', answer: String(i < 2 ? 19 + i : 20 + i) }
      }
    );
  let synced;
  const uid = `isolated-http-continuity-${crypto.randomUUID()}`;
  await seedUsers(uid, `${uid}-other`);
  await check('真实JWT和Mongo：10任务6完成、6可靠首答2错', async () => {
    const result = await post('/learning-sync', { action: 'push', operations, timezone: 'Asia/Shanghai' }, uid);
    assert.equal(result.success, true);
    synced = result.data.state;
    const summary = summarizeLearning(synced);
    assert.equal(summary.tasks.rate, 0.6);
    assert.equal(summary.first.denominator, 6);
    assert.equal(summary.first.numerator, 2);
  });
  await check('真实重复补传不增加事件、首答和完成率', async () => {
    const result = await post('/learning-sync', { action: 'push', operations, timezone: 'Asia/Shanghai' }, uid);
    assert.equal(result.success, true);
    assert.equal(result.data.state.events.length, operations.length);
    assert.equal(summarizeLearning(result.data.state).first.denominator, 6);
  });
  await check('真实跨账户隔离与越权题目拒绝', async () => {
    const result = await post('/learning-sync', { action: 'pull' }, uid + '-other');
    assert.equal(result.data.state.attempts.length, 0);
    const rejected = await post('/learning-sync', { action: 'push', operations: [operations[3]] }, uid + '-other');
    assert.equal(rejected.success, false);
  });
  await check('真实同标识冲突不覆盖原始答案', async () => {
    const rejected = await post(
      '/learning-sync',
      { action: 'push', operations: [{ ...operations[0], data: { goal: '冲突目标' } }] },
      uid
    );
    assert.equal(rejected.success, false);
    const current = await post('/learning-sync', { action: 'pull' }, uid);
    assert.equal(current.data.state.conversations[0].goal, '合成计算题验收');
    assert.equal(current.data.state.events.length, operations.length);
  });
  // Platform and BYOK requests the runtime check lacked. The BYOK key is invalid on purpose:
  // the provider refuses it, so the ledger row is real and costs nothing.
  const goldenUser = 'golden-http-user';
  const modelCall = (requestId, modelId) => ({
    requestId,
    modelId,
    shareConsent: true,
    messages: [{ role: 'user', content: '合成数据' }]
  });
  const record = async (name, route, body, assertion) =>
    check(`golden ${name}`, async () => {
      const response = await post(route, body, goldenUser);
      golden.responses[name] = normalize(response);
      assertion(response);
    });
  await record('平台模型关闭', '/proxy-ai', modelCall('golden-platform-1', 'golden-platform'), (r) =>
    assert.equal(r.error, 'NEEDS_CONNECTION')
  );
  await record('平台流式关闭', '/proxy-ai-stream', modelCall('golden-platform-2', 'golden-platform'), (r) =>
    assert.equal(r.success, false)
  );
  await record('未知模型', '/proxy-ai', modelCall('golden-missing', 'no-such-model'), (r) =>
    assert.equal(r.error, 'NEEDS_CONNECTION')
  );
  await record(
    '自带连接保存',
    '/learning-models',
    {
      action: 'save',
      shareConsent: true,
      profile: {
        id: 'golden-byok',
        provider: 'DeepSeek',
        model: 'deepseek-chat',
        endpoint: 'https://api.deepseek.com/chat/completions',
        apiKey: 'sk-TEST-ONLY-invalid-key'
      }
    },
    () => {}
  );
  await record('自带连接未通过能力检查', '/proxy-ai', modelCall('golden-byok-1', 'golden-byok'), (r) =>
    assert.equal(r.success, false)
  );
  await record('自带连接重放', '/proxy-ai', modelCall('golden-byok-1', 'golden-byok'), (r) =>
    assert.equal(r.success, false)
  );
  await record('用量', '/learning-models', { action: 'usage' }, (r) => assert.equal(r.code, 0));
  await record('连接列表', '/learning-models', { action: 'list' }, (r) => assert.equal(r.code, 0));
  if (goldenOut)
    await withDatabase(async (database) => {
      for (const name of ['learning_accounts', 'learning_billing_receipts'])
        golden.ledger[name] = normalize(await database.collection(name).find({ user_id: goldenUser }).toArray());
    });
  await check('stream非法输入在调用前拒绝', async () => assert.equal((await post('/proxy-ai-stream', {})).code, 400));
  await check('非法JSON如实400', async () =>
    assert.equal(
      (
        await boundedFetch(base + '/learning-sync', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{'
        })
      ).status,
      400
    )
  );
  await check('文件数量限制413', async () => {
    const f = new FormData();
    f.append('first', new Blob(['one']), 'one.txt');
    f.append('second', new Blob(['two']), 'two.txt');
    assert.equal((await boundedFetch(base + '/upload-avatar', { method: 'POST', body: f })).status, 413);
  });
  await check('超大JSON限制413', async () =>
    assert.equal(
      (
        await boundedFetch(base + '/learning-sync', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ x: 'x'.repeat(6 * 1024 * 1024) })
        })
      ).status,
      413
    )
  );
} catch (e) {
  results.push({ name: 'startup', passed: false, error: e.message });
} finally {
  if (server.exitCode === null && server.signalCode === null) {
    const exit = once(server, 'exit');
    server.kill('SIGTERM');
    const timeout = setTimeout(() => server.kill('SIGKILL'), 5000);
    try {
      await exit;
    } finally {
      clearTimeout(timeout);
    }
  }
  writeFileSync('tmp/maintenance/http-runtime-server.log', logs);
}
writeFileSync(
  'tmp/maintenance/http-runtime-report.json',
  JSON.stringify({ target: base, modelCalls: 0, payments: 0, results }, null, 2) + '\n'
);
if (goldenOut) writeFileSync(goldenOut, JSON.stringify(golden, null, 2) + '\n');
console.log(JSON.stringify({ total: results.length, passed: results.filter((x) => x.passed).length }));
if (results.some((x) => !x.passed)) process.exitCode = 1;
