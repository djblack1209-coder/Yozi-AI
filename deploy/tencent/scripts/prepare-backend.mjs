import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

// Run only inside the existing VPS-Config maintenance lease. This prepares an
// authenticated, loopback-only database and an isolated candidate. It never
// switches PM2, a proxy, a public bank, or the original backend environment.
const config = '/etc/vps-config/exam-master';
const data = '/var/lib/vps-config/exam-master';
const releases = '/opt/vps-config/releases/exam-master';
const legacy = '/opt/apps/exam-master/backend';
const image = 'docker.io/library/mongo@sha256:bac22ea7710d774103dcad3ec8ac13cba1eb378f488e3ce8a6b3a1adf2ba9dcc';
const container = 'wenli-mongo';
const archive = '/opt/apps/exam-master/release-ops/wenli-backend-candidate.tar.gz';
const stageContract = 'wenli-backend-stage-v2';
const rehearsalLearningOrigins = [
  'https://api.deepseek.com',
  'https://api.siliconflow.cn',
  'https://open.bigmodel.cn',
  'https://dashscope.aliyuncs.com',
  'https://api.moonshot.cn',
  'https://ark.cn-beijing.volces.com',
  'https://qianfan.baidubce.com',
  'https://tokenhub.tencentmaas.com',
  'https://api.minimax.cn',
  'https://api.stepfun.com',
  'https://spark-api-open.xf-yun.com',
  'https://api.lingyiwanwu.com',
  'https://api.baichuan-ai.com'
].join(',');
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const json = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const owned = (root, id) => json(path.join(root, '.wenli-owner.json')).transaction === id;
const syncDirectory = (directory) => {
  const fd = fs.openSync(directory, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
};
const write = (file, value) => {
  const fd = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, value);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  syncDirectory(path.dirname(file));
};

export function safeFailure(error) {
  // VPS-Config forwards only these exception labels and source line numbers.
  // Never include native stderr, assertion values, URLs or error messages.
  const kind = error?.name === 'AssertionError' ? 'AssertionError' : 'RuntimeError';
  const frames = String(error?.stack || '')
    .split('\n')
    .slice(1);
  const frame = frames.find(
    (line) => !line.includes('at run (') && /(?:\[eval1\]|prepare-backend\.mjs):\d+:\d+/.test(line)
  );
  const number = /(?:\[eval1\]|prepare-backend\.mjs):(\d+):\d+/.exec(frame || '')?.[1];
  return kind + (number ? `\n  File "<stdin>", line ${number}` : '');
}

export function mongoToolsUri(user, password) {
  const uri = new URL('mongodb://127.0.0.1:27017/');
  uri.username = user;
  uri.password = password;
  uri.searchParams.set('authSource', 'admin');
  return uri.toString();
}

export function assertLease(state, mode) {
  assert.ok(
    [
      'prepare',
      'recover',
      'verify-backup',
      'recover-backup',
      'stage-candidate',
      'recover-candidate',
      'migrate-identities',
      'recover-identities'
    ].includes(mode)
  );
  assert.match(state.id || '', /^[a-f0-9]{32}$/);
  assert.ok(
    ['recover', 'recover-backup', 'recover-candidate', 'recover-identities'].includes(mode)
      ? ['recovering', 'awaiting-local-restore', 'rolled-back'].includes(state.phase)
      : state.phase === 'applying' && state.deadline > Date.now() / 1000
  );
}

export function identityMigrationNames(id, candidateSha) {
  assert.match(id || '', /^[a-f0-9]{32}$/);
  if (candidateSha !== undefined) assert.match(candidateSha, /^[a-f0-9]{64}$/);
  return {
    root: path.join(data, 'identities-' + id),
    report: path.join(
      data,
      candidateSha ? 'identity-indexes-applied-' + candidateSha + '.json' : 'identity-indexes-applied.json'
    )
  };
}

export function assertIdentityDefinitions(definitions, { legacy = false } = {}) {
  const composite = (name, first, second) => ({
    key: { [first]: 1, [second]: 1 },
    options: {
      name,
      unique: true,
      partialFilterExpression: { [first]: { $type: 'string' }, [second]: { $type: 'string' } }
    }
  });
  // Current creation definitions; frozen earlier QQ receipts remain readable
  // through the exact historical definitions below for protected recovery.
  if (
    !legacy &&
    Array.isArray(definitions) &&
    definitions.some((row) => row.options?.name === 'idx_apple_identity_unique')
  ) {
    const regional = [
      composite('idx_wx_mobile_identity_unique', 'wx_mobile_appid', 'app_openid'),
      ...['openid', 'h5_openid', 'unionid'].map((field) => ({
        key: { [field]: 1 },
        options: { name: 'idx_' + field + '_unique', unique: true, sparse: true }
      })),
      composite('idx_wx_web_identity_unique', 'wx_web_appid', 'web_openid'),
      composite('idx_apple_identity_unique', 'apple_client_id', 'apple_sub'),
      composite('idx_google_identity_unique', 'google_client_id', 'google_sub'),
      { key: { phone: 1 }, options: { name: 'idx_phone_unique', unique: true, sparse: true } }
    ];
    assert.deepEqual(definitions, regional);
    return;
  }
  const expected = [
    composite('idx_wx_mobile_identity_unique', 'wx_mobile_appid', 'app_openid'),
    ...['openid', 'h5_openid', 'unionid', 'qq_openid', 'qq_unionid'].map((field) => ({
      key: { [field]: 1 },
      options: { name: 'idx_' + field + '_unique', unique: true, sparse: true }
    })),
    composite('idx_qq_mobile_identity_unique', 'qq_mobile_appid', 'qq_mobile_openid'),
    composite('idx_qq_mini_identity_unique', 'qq_mini_appid', 'qq_mini_openid'),
    ...(!legacy ? [composite('idx_wx_web_identity_unique', 'wx_web_appid', 'web_openid')] : [])
  ];
  assert.ok(Array.isArray(definitions));
  assert.deepEqual(definitions.map((row) => row.options?.name).sort(), expected.map((row) => row.options.name).sort());
  for (const definition of definitions) {
    const original = expected.find((row) => row.options.name === definition.options.name);
    assert.deepEqual(definition, original);
    assert.equal(JSON.stringify(definition.key), JSON.stringify(original.key), 'identity key order changed');
  }
}

function isDefaultCollation(collation) {
  return (
    collation === undefined ||
    (collation !== null &&
      typeof collation === 'object' &&
      !Array.isArray(collation) &&
      Object.keys(collation).length === 1 &&
      collation.locale === 'simple')
  );
}

function withoutDefaultCollation(metadata) {
  assert.ok(isDefaultCollation(metadata.collation), 'non-default collation');
  const { collation: _collation, ...rest } = metadata;
  return rest;
}

function assertDesktopRetentionIndex(index) {
  assert.deepEqual(withoutDefaultCollation(index), {
    v: 2,
    key: { expires_at: 1 },
    name: 'idx_desktop_oauth_expiry',
    expireAfterSeconds: 0
  });
}

export function identityIndexMatches(index, definition) {
  return Boolean(
    index &&
    Object.keys(index).every((name) =>
      ['v', 'key', 'name', 'unique', 'sparse', 'partialFilterExpression', 'collation'].includes(name)
    ) &&
    isDefaultCollation(index.collation) &&
    index.name === definition.options.name &&
    index.unique === true &&
    JSON.stringify(index.key) === JSON.stringify(definition.key) &&
    (index.sparse === true) === (definition.options.sparse === true) &&
    JSON.stringify(index.partialFilterExpression) === JSON.stringify(definition.options.partialFilterExpression)
  );
}

export function assertIdentityRecoveryShape(beforeIndexes, currentIndexes, definitions, options) {
  assertIdentityDefinitions(definitions, options);
  assert.ok(Array.isArray(beforeIndexes) && Array.isArray(currentIndexes));
  const baseline = new Map(beforeIndexes.map((index) => [index.name, index]));
  assert.equal(baseline.size, beforeIndexes.length);
  for (const old of beforeIndexes)
    assert.deepEqual(
      currentIndexes.find((index) => index.name === old.name),
      old
    );
  const created = currentIndexes.filter((index) => !baseline.has(index.name));
  for (const index of created) {
    const definition = definitions.find((row) => row.options.name === index.name);
    assert.ok(definition && identityIndexMatches(index, definition), 'foreign identity/index change');
  }
  return created.map((index) => index.name);
}

export function assertDesktopRetentionDefinitions(definitions) {
  assert.deepEqual(definitions, [
    { key: { expires_at: 1 }, options: { expireAfterSeconds: 0, name: 'idx_desktop_oauth_expiry' } }
  ]);
}

export function assertDesktopRetentionRecoveryShape(before, current, definitions) {
  assertDesktopRetentionDefinitions(definitions);
  for (const state of [before, current]) {
    assert.equal(typeof state.exists, 'boolean');
    assert.equal(state.count, 0, 'desktop authorization records changed');
    assert.ok(Array.isArray(state.indexes));
    if (!state.exists) assert.deepEqual(state.indexes, []);
  }
  if (!current.exists) {
    assert.equal(before.exists, false, 'original desktop collection removed');
    return { createdNames: [], dropCreatedCollection: false };
  }
  const baseline = before.exists ? before.indexes : [{ v: 2, key: { _id: 1 }, name: '_id_' }];
  assert.equal(new Set(current.indexes.map((index) => index.name)).size, current.indexes.length);
  for (const original of baseline)
    assert.deepEqual(
      before.exists
        ? current.indexes.find((index) => index.name === original.name)
        : withoutDefaultCollation(current.indexes.find((index) => index.name === original.name) || {}),
      original
    );
  const created = current.indexes.filter((index) => !baseline.some((original) => original.name === index.name));
  for (const index of created) assertDesktopRetentionIndex(index);
  return { createdNames: created.map((index) => index.name), dropCreatedCollection: !before.exists };
}

export function assertIdentityPredecessor(previous, next) {
  assert.match(previous.transaction || '', /^[a-f0-9]{32}$/);
  assert.match(previous.candidateSha || '', /^[a-f0-9]{64}$/);
  assert.equal(previous.preparedTransaction, next.preparedTransaction);
  assert.deepEqual(previous.afterSnapshot, next.beforeSnapshot);
  assert.ok(previous.contractVersion === undefined || previous.contractVersion === stageContract);
  assertIdentityDefinitions(previous.definitions, { legacy: previous.contractVersion === undefined });
  assertIdentityDefinitions(next.definitions);
  const regional = next.definitions.some((row) => row.options.name === 'idx_apple_identity_unique');
  const retired = new Set([
    'idx_qq_openid_unique',
    'idx_qq_unionid_unique',
    'idx_qq_mobile_identity_unique',
    'idx_qq_mini_identity_unique'
  ]);
  // Retire only QQ creation definitions. Recovery still requires every original
  // actual index to remain unchanged through assertIdentityRecoveryShape.
  for (const definition of previous.definitions) {
    if (regional && retired.has(definition.options.name)) continue;
    assert.deepEqual(
      next.definitions.find((row) => row.options.name === definition.options.name),
      definition
    );
  }
  assert.equal(previous.scope, 'user-identities');
  assert.equal(previous.actualScopedMigrationAndIdempotency, true);
  assert.equal(previous.userDocumentsModified, false);
  assert.equal(previous.publicEntrySwitched, false);
  assert.equal(previous.upstreamProviderCalls, 0);
  assert.equal(previous.upstreamModelCalls, 0);
}

export function candidateStageNames(id, candidateSha) {
  assert.match(id || '', /^[a-f0-9]{32}$/);
  assert.match(candidateSha || '', /^[a-f0-9]{64}$/);
  const release = path.join(releases, candidateSha.slice(0, 16));
  return {
    root: path.join(data, 'stage-' + id),
    release,
    database: 'wenli_candidate_' + id,
    report: path.join(release, '.wenli-stage.json')
  };
}

export function assertStageOwner(record, id, candidateSha) {
  candidateStageNames(id, candidateSha);
  assert.equal(record.transaction, id);
  assert.equal(record.candidateSha, candidateSha);
  assert.match(record.preparedTransaction || '', /^[a-f0-9]{32}$/);
  assert.notEqual(record.preparedTransaction, id);
}

export function candidateEnvironment({ uri, database, storage, jwtSecret, adminSecret, vaultKey }) {
  assert.match(database || '', /^wenli_candidate_[a-f0-9]{32}$/);
  assert.equal(storage, path.join(data, 'stage-' + database.slice('wenli_candidate_'.length), 'storage'));
  const parsed = new URL(uri);
  assert.equal(parsed.hostname, '127.0.0.1');
  assert.equal(parsed.port, '27019');
  assert.equal(parsed.pathname, '/' + database);
  assert.equal(parsed.searchParams.get('authSource'), database);
  assert.equal(decodeURIComponent(parsed.username), 'candidate');
  assert.ok(parsed.password);
  for (const value of [jwtSecret, adminSecret, vaultKey]) assert.match(value || '', /^[a-f0-9]{64}$/);
  return {
    PATH: '/usr/local/bin:/usr/bin:/bin',
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: '3002',
    MONGODB_URI: uri,
    DB_NAME: database,
    STORAGE_DIR: storage,
    JWT_SECRET: jwtSecret,
    ADMIN_SECRET: adminSecret,
    ALLOWED_ORIGINS: 'tauri://localhost',
    LEARNING_VAULT_KEY: vaultKey,
    LEARNING_ALLOWED_ORIGINS: rehearsalLearningOrigins,
    LEARNING_PLATFORM_CALLS_ENABLED: 'false',
    LEARNING_PAYMENT_SANDBOX_ENABLED: 'false',
    DESKTOP_OAUTH_ENABLED: 'false'
  };
}

export function assertStageListener(output, pid) {
  assert.ok(Number.isSafeInteger(pid) && pid > 1);
  const rows = output.trim().split('\n');
  assert.equal(rows.length, 1);
  assert.ok(/\s127\.0\.0\.1:3002\s/.test(rows[0]));
  assert.ok(rows[0].includes('pid=' + pid + ','));
}

export function backupRestoreNames(id) {
  assert.match(id || '', /^[a-f0-9]{32}$/);
  return {
    container: 'wenli-backup-restore-' + id,
    root: path.join(data, 'restore-' + id),
    report: path.join(data, 'backup-restore-check.json')
  };
}

export function assertArchive(rows) {
  assert.ok(rows.length > 20 && rows.length < 500);
  const names = new Set();
  let size = 0;
  for (const row of rows) {
    assert.ok(
      row.type === 'file' &&
        !path.posix.isAbsolute(row.name) &&
        !row.name.split('/').some((s) => ['..', '', '.'].includes(s))
    );
    assert.ok(
      row.name.startsWith('dist/') ||
        ['package.json', 'package-lock.json', '.env.example', 'ecosystem.config.cjs'].includes(row.name)
    );
    assert.ok(!names.has(row.name) && Number.isSafeInteger(row.size) && row.size >= 0 && row.size < 8_000_000);
    names.add(row.name);
    size += row.size;
  }
  assert.ok(size < 32_000_000 && names.has('dist/standalone/server.js'));
}

function run(args, options = {}) {
  const result = spawnSync(args[0], args.slice(1), {
    timeout: 180000,
    maxBuffer: 64_000_000,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...options
  });
  // Native diagnostics may contain credentials. Only stable failures escape.
  assert.ok(!result.error && result.status === 0, `${path.basename(args[0])} failed`);
  return result.stdout;
}

function inspect(name) {
  const result = spawnSync('docker', ['inspect', name], { encoding: 'utf8', timeout: 10000 });
  return result.status === 0 ? JSON.parse(result.stdout)[0] : null;
}

async function recover(state) {
  const record = path.join(data, 'candidate-process.json');
  if (fs.existsSync(record)) {
    assert.ok(owned(data, state.id));
    const child = json(record);
    assert.ok(Number.isSafeInteger(child.pid) && child.pid > 1 && child.entry.startsWith(releases + '/'));
    const command = `/proc/${child.pid}/cmdline`;
    if (fs.existsSync(command)) {
      assert.equal(fs.readFileSync(command, 'utf8').split('\0')[1], child.entry, 'candidate PID reused');
      process.kill(child.pid, 'SIGTERM');
      for (let i = 0; i < 80 && fs.existsSync(command); i++) await new Promise((resolve) => setTimeout(resolve, 100));
      assert.ok(!fs.existsSync(command), 'candidate still running');
    }
  }
  for (const name of [container + '-restore', container]) {
    const current = inspect(name);
    if (current) {
      assert.equal(current.Config.Labels['cn.wenli.transaction'], state.id, 'foreign container');
      run(['docker', 'rm', '-f', current.Id]);
    }
  }
  for (const root of [config, data, releases]) {
    if (fs.existsSync(root)) {
      assert.ok(owned(root, state.id), 'foreign service tree');
      fs.rmSync(root, { recursive: true });
    }
  }
}

async function recoverBackup(state, removeReport = true) {
  const names = backupRestoreNames(state.id);
  const current = inspect(names.container);
  if (current) {
    assert.equal(current.Config.Labels['cn.wenli.transaction'], state.id, 'foreign restore container');
    run(['docker', 'rm', '-f', current.Id]);
  }
  if (fs.existsSync(names.root)) {
    assert.ok(owned(names.root, state.id), 'foreign restore tree');
    fs.rmSync(names.root, { recursive: true });
  }
  if (removeReport && fs.existsSync(names.report)) {
    assert.equal(json(names.report).transaction, state.id, 'foreign restore report');
    fs.unlinkSync(names.report);
  }
}

async function verifyBackup(state, expectedSha, backup) {
  // Restore the customer's retained private backup into a disposable database.
  // The binary arrives only through the frozen maintenance command's stdin.
  assert.match(expectedSha || '', /^[a-f0-9]{64}$/);
  assert.ok(Buffer.isBuffer(backup) && backup.length > 0 && backup.length < 16_000_000);
  assert.equal(sha(backup), expectedSha);
  const prepared = json(path.join(data, 'prepared.json'));
  assert.ok(owned(data, prepared.transaction) && owned(config, prepared.transaction));
  assert.equal(prepared.productionSwitched, false);
  assert.equal(prepared.publicBankImported, false);
  const primary = inspect(container);
  assert.equal(primary?.Config.Labels['cn.wenli.transaction'], prepared.transaction);
  assert.equal(primary?.State.Status, 'running');
  const names = backupRestoreNames(state.id);
  assert.ok(!inspect(names.container) && !fs.existsSync(names.root) && !fs.existsSync(names.report));
  assert.ok(Number(/MemAvailable:\s+(\d+)/.exec(fs.readFileSync('/proc/meminfo', 'utf8'))?.[1]) >= 650000);
  assert.ok(fs.statfsSync('/').bavail * fs.statfsSync('/').bsize > 2_000_000_000);
  assert.equal(prepared.release, path.join(releases, prepared.candidateSha.slice(0, 16)));
  const require = createRequire(path.join(prepared.release, 'package.json'));
  const { MongoClient } = require('mongodb');
  process.loadEnvFile(path.join(config, 'backend.env'));
  const application = new URL(process.env.MONGODB_URI);
  assert.equal(application.hostname, '127.0.0.1');
  assert.equal(application.port, '27019');
  assert.equal(application.searchParams.get('authSource'), 'exam-master');
  application.port = '27020';
  const secrets = path.join(config, 'mongo-secrets');
  const rootUri = new URL('mongodb://127.0.0.1:27020/admin');
  rootUri.username = fs.readFileSync(path.join(secrets, 'mongo-root-user'), 'utf8').trim();
  rootUri.password = fs.readFileSync(path.join(secrets, 'mongo-root-password'), 'utf8').trim();
  const connect = async (uri) => {
    for (let i = 0; i < 40; i++) {
      const client = new MongoClient(uri, { serverSelectionTimeoutMS: 1500 });
      try {
        await client.connect();
        return client;
      } catch {
        await client.close();
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    throw new Error('restore Mongo startup failed');
  };
  let admin;
  let scoped;
  try {
    fs.mkdirSync(names.root, { mode: 0o700 });
    write(path.join(names.root, '.wenli-owner.json'), JSON.stringify({ transaction: state.id }));
    const dbFolder = path.join(names.root, 'mongodb');
    fs.mkdirSync(dbFolder, { mode: 0o700 });
    run([
      'docker',
      'run',
      '-d',
      '--name',
      names.container,
      '--label',
      'cn.wenli.transaction=' + state.id,
      '--restart',
      'no',
      '--memory',
      '512m',
      '--memory-swap',
      '768m',
      '--cpus',
      '1',
      '--pids-limit',
      '256',
      '--read-only',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,size=64m',
      '--tmpfs',
      '/data/configdb:rw,nosuid,size=16m',
      '-p',
      '127.0.0.1:27020:27017',
      '--mount',
      `type=bind,src=${dbFolder},dst=/data/db`,
      '--mount',
      `type=bind,src=${secrets},dst=/run/wenli-secrets,readonly`,
      '-e',
      'MONGO_INITDB_ROOT_USERNAME_FILE=/run/wenli-secrets/mongo-root-user',
      '-e',
      'MONGO_INITDB_ROOT_PASSWORD_FILE=/run/wenli-secrets/mongo-root-password',
      image,
      '--wiredTigerCacheSizeGB',
      '0.25'
    ]);
    admin = await connect(rootUri.toString());
    assert.equal((await admin.db('exam-master').command({ usersInfo: 1 })).users.length, 0);
    run(
      [
        'docker',
        'exec',
        '-i',
        names.container,
        'mongorestore',
        '--config=/run/wenli-secrets/mongo-tools.yaml',
        '--db=exam-master',
        '--restoreDbUsersAndRoles',
        '--archive',
        '--gzip',
        '--stopOnError'
      ],
      { encoding: null, input: backup }
    );
    const restoredUsers = (await admin.db('exam-master').command({ usersInfo: 1 })).users;
    assert.equal(restoredUsers.length, 1);
    assert.equal(restoredUsers[0].user, decodeURIComponent(application.username));
    assert.deepEqual(restoredUsers[0].roles, [{ role: 'readWrite', db: 'exam-master' }]);
    scoped = await connect(application.toString());
    const restored = scoped.db('exam-master');
    assert.equal(await restored.collection('users').countDocuments(), 0);
    const emailIndex = (await restored.collection('users').indexes()).find((row) => row.name === 'email_1');
    assert.ok(emailIndex?.unique && emailIndex?.sparse);
    await assert.rejects(() => scoped.db('admin').collection('system.users').findOne({}), { code: 13 });
    const probe = restored.collection('__wenli_role_restore_probe');
    await probe.insertOne({ _id: state.id, value: 'synthetic-private-restore' });
    assert.equal((await probe.findOne({ _id: state.id })).value, 'synthetic-private-restore');
    assert.equal((await probe.deleteOne({ _id: state.id })).deletedCount, 1);
  } finally {
    await scoped?.close();
    await admin?.close();
    await recoverBackup(state, false);
  }
  assert.ok(!inspect(names.container) && !fs.existsSync(names.root));
  write(
    names.report,
    JSON.stringify({
      transaction: state.id,
      preparedTransaction: prepared.transaction,
      backupSha256: expectedSha,
      actualRetainedBackupRestored: true,
      applicationAuthenticationRestored: true,
      readWriteRoleRestored: true,
      adminAccessRejected: true,
      usersCollectionAndIndexRestored: true,
      disposableContainerAndDataRemoved: true,
      mainDatabaseModified: false,
      productionSwitched: false,
      publicBankImported: false,
      upstreamModelCalls: 0,
      checkedAt: Date.now()
    })
  );
}

function preparedState() {
  const prepared = json(path.join(data, 'prepared.json'));
  assert.match(prepared.transaction || '', /^[a-f0-9]{32}$/);
  assert.match(prepared.candidateSha || '', /^[a-f0-9]{64}$/);
  assert.equal(prepared.release, path.join(releases, prepared.candidateSha.slice(0, 16)));
  assert.equal(prepared.productionSwitched, false);
  assert.equal(prepared.publicBankImported, false);
  for (const root of [config, data, releases, prepared.release]) {
    assert.equal(fs.realpathSync(root), root);
    // The initial preparation owns the parent roots; it predates release markers.
    if (root !== prepared.release) assert.ok(owned(root, prepared.transaction));
  }
  const primary = inspect(container);
  assert.equal(primary?.Config.Labels['cn.wenli.transaction'], prepared.transaction);
  assert.equal(primary?.Config.Image, image);
  assert.equal(primary?.State.Status, 'running');
  assert.deepEqual(primary.NetworkSettings.Ports['27017/tcp'], [{ HostIp: '127.0.0.1', HostPort: '27019' }]);
  return prepared;
}

async function preparedClients(prepared) {
  const require = createRequire(path.join(prepared.release, 'package.json'));
  const { MongoClient } = require('mongodb');
  process.loadEnvFile(path.join(config, 'backend.env'));
  const application = new URL(process.env.MONGODB_URI);
  assert.equal(application.hostname, '127.0.0.1');
  assert.equal(application.port, '27019');
  assert.equal(application.pathname, '/exam-master');
  assert.equal(application.searchParams.get('authSource'), 'exam-master');
  const rootUri = new URL('mongodb://127.0.0.1:27019/admin');
  rootUri.username = fs.readFileSync(path.join(config, 'mongo-secrets/mongo-root-user'), 'utf8').trim();
  rootUri.password = fs.readFileSync(path.join(config, 'mongo-secrets/mongo-root-password'), 'utf8').trim();
  const admin = new MongoClient(rootUri.toString(), { serverSelectionTimeoutMS: 2500 });
  const app = new MongoClient(application.toString(), { serverSelectionTimeoutMS: 2500 });
  try {
    await admin.connect();
    await app.connect();
    await assert.rejects(() => app.db('admin').collection('system.users').findOne({}), { code: 13 });
    return {
      admin,
      app,
      application,
      close: async () => {
        await app.close();
        await admin.close();
      }
    };
  } catch (error) {
    await app.close();
    await admin.close();
    throw error;
  }
}

async function primarySnapshot(prepared, app) {
  const processRows = JSON.parse(run(['pm2', 'jlist'])).filter((row) => row.name === 'exam-master');
  assert.equal(processRows.length, 1);
  const processRow = processRows[0];
  assert.equal(processRow.pm2_env.status, 'online');
  assert.equal(processRow.pm2_env.pm_exec_path, path.join(legacy, 'standalone/server.js'));
  const files = {};
  for (const file of [
    path.join(legacy, 'standalone/server.js'),
    path.join(legacy, '.env'),
    path.join(config, 'backend.env'),
    path.join(data, 'prepared.json'),
    path.join(prepared.release, 'package.json'),
    path.join(prepared.release, 'package-lock.json')
  ]) {
    files[file] = sha(fs.readFileSync(file));
  }
  assert.equal(
    files[path.join(legacy, 'standalone/server.js')],
    '9ed16baa80dd2241505c7347ceb1d51502f80b324bb453e7c801307984fc1c8c'
  );
  const rows = [];
  const db = app.db('exam-master');
  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
    const collection = db.collection(name);
    const documents = await collection.find({}).sort({ _id: 1 }).limit(1001).toArray();
    assert.ok(documents.length <= 1000, 'main prestate exceeds bounded preparation scope');
    rows.push({
      name,
      count: documents.length,
      documentsSha256: sha(JSON.stringify(documents)),
      indexes: await collection.indexes()
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  assert.equal(await db.collection('users').countDocuments(), 0);
  assert.ok(!rows.some((row) => row.name === 'learning_model_keys'));
  const response = await fetch('http://127.0.0.1:3001/health', { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200);
  return {
    preparedTransaction: prepared.transaction,
    legacyPid: processRow.pid,
    files,
    primaryContainerId: inspect(container).Id,
    databaseSha256: sha(JSON.stringify(rows))
  };
}

function ownedStageRoot(root, state, candidateSha) {
  assert.equal(fs.realpathSync(root), root);
  assertStageOwner(json(path.join(root, '.wenli-owner.json')), state.id, candidateSha);
}

async function stopStageProcess(root) {
  const file = path.join(root, 'process.json');
  if (!fs.existsSync(file)) return;
  const record = json(file);
  assert.ok(Number.isSafeInteger(record.pid) && record.pid > 1);
  assert.match(record.startTime || '', /^\d+$/);
  assert.ok(record.entry.startsWith(releases + '/') && record.entry.endsWith('/dist/standalone/server.js'));
  const command = `/proc/${record.pid}/cmdline`;
  if (fs.existsSync(command)) {
    const currentStart = fs.readFileSync(`/proc/${record.pid}/stat`, 'utf8').split(') ').pop().split(' ')[19];
    assert.equal(currentStart, record.startTime, 'candidate PID reused');
    assert.equal(fs.readFileSync(command, 'utf8').split('\0')[1], record.entry, 'candidate command changed');
    process.kill(record.pid, 'SIGTERM');
    for (let i = 0; i < 100 && fs.existsSync(command); i++) await new Promise((resolve) => setTimeout(resolve, 100));
    assert.ok(!fs.existsSync(command), 'candidate still running');
  }
  fs.unlinkSync(file);
}

async function clearStageDatabase(admin, database) {
  assert.match(database, /^wenli_candidate_[a-f0-9]{32}$/);
  const db = admin.db(database);
  const users = (await db.command({ usersInfo: 1 })).users;
  assert.ok(users.length <= 1);
  if (users.length) {
    assert.equal(users[0].user, 'candidate');
    assert.deepEqual(users[0].roles, [{ role: 'readWrite', db: database }]);
    await db.command({ dropUser: 'candidate' });
  }
  await db.dropDatabase();
  assert.equal((await db.command({ usersInfo: 1 })).users.length, 0);
  assert.ok(!(await admin.db('admin').admin().listDatabases()).databases.some((row) => row.name === database));
}

async function recoverCandidate(state, candidateSha) {
  const prepared = preparedState();
  const names = candidateStageNames(state.id, candidateSha);
  const hasRoot = fs.existsSync(names.root);
  const hasRelease = fs.existsSync(names.release);
  for (const root of [names.root, names.release]) if (fs.existsSync(root)) ownedStageRoot(root, state, candidateSha);
  if (!hasRoot && !hasRelease) return;
  if (hasRoot) await stopStageProcess(names.root);
  const clients = await preparedClients(prepared);
  try {
    // A namespace is claimed only after verifying that both data and users are absent.
    const claim = hasRoot && fs.existsSync(path.join(names.root, 'namespace.json'));
    if (claim || (hasRelease && fs.existsSync(names.report))) {
      if (claim) assert.equal(json(path.join(names.root, 'namespace.json')).database, names.database);
      await clearStageDatabase(clients.admin, names.database);
    }
  } finally {
    await clients.close();
  }
  for (const root of [names.root, names.release]) {
    if (fs.existsSync(root)) {
      ownedStageRoot(root, state, candidateSha);
      fs.rmSync(root, { recursive: true });
    }
  }
}

async function validateStageIndexes(names, env, db) {
  await db.collection('users').createIndex({ email: 1 }, { unique: true, sparse: true, name: 'email_1' });
  const code = `import assert from 'node:assert/strict';
    import migration, {getUserIdentityIndexes,getDesktopOAuthIndexes} from ${JSON.stringify(pathToFileURL(path.join(names.release, 'dist/functions/db-create-indexes.js')).href)};
    import {closeDb} from ${JSON.stringify(pathToFileURL(path.join(names.release, 'dist/standalone/cloud-shim.js')).href)};
    import {MongoClient} from 'mongodb';
    let scoped;
    try { const denied=await migration({headers:{},body:{}}); assert.equal(denied.code,403);
      const context={headers:{'x-admin-secret':process.env.ADMIN_SECRET},body:{scope:'user-identities'}};
      const result=await migration(context);
      assert.equal(result.code,0); assert.equal(result.success,true);
      assert.equal(result.data.find(row=>row.collection==='users(unique identities)').status,'ok');
      assert.equal((await migration(context)).code,0);
      scoped=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:2500});await scoped.connect();
      const users=scoped.db(process.env.DB_NAME).collection('users');
      for(const definition of getUserIdentityIndexes())await users.dropIndex(definition.options.name);
      assert.deepEqual((await users.indexes()).map(row=>row.name),['_id_','email_1']);
      assert.equal((await migration(context)).code,0);
      const retention={headers:{'x-admin-secret':process.env.ADMIN_SECRET},body:{scope:'desktop-oauth'}};
      assert.equal((await migration({headers:{},body:{scope:'desktop-oauth'}})).code,403);
      for(let i=0;i<2;i++)assert.equal((await migration(retention)).code,0);
      const sessions=scoped.db(process.env.DB_NAME).collection('desktop_oauth_sessions');
      for(const definition of getDesktopOAuthIndexes())await sessions.dropIndex(definition.options.name);
      assert.deepEqual((await sessions.indexes()).map(row=>row.name),['_id_']);
      assert.equal((await migration(retention)).code,0);
    } finally {await scoped?.close();await closeDb();}`;
  run([process.execPath, '--input-type=module', '-'], { cwd: names.release, env, input: code });
  assert.deepEqual((await db.listCollections({}, { nameOnly: true }).toArray()).map((row) => row.name).sort(), [
    'desktop_oauth_sessions',
    'users'
  ]);
  const users = db.collection('users');
  const indexes = await users.indexes();
  const regional = indexes.some((row) => row.name === 'idx_apple_identity_unique');
  // Older frozen candidates retain their exact historical probe during recovery.
  const specifications = [
    ['idx_wx_mobile_identity_unique', 'wx_mobile_appid', 'app_openid'],
    ['idx_wx_web_identity_unique', 'wx_web_appid', 'web_openid'],
    ...(regional
      ? [
          ['idx_apple_identity_unique', 'apple_client_id', 'apple_sub'],
          ['idx_google_identity_unique', 'google_client_id', 'google_sub']
        ]
      : [
          ['idx_qq_mobile_identity_unique', 'qq_mobile_appid', 'qq_mobile_openid'],
          ['idx_qq_mini_identity_unique', 'qq_mini_appid', 'qq_mini_openid']
        ])
  ];
  assert.equal(indexes.length, regional ? 10 : 11);
  if (regional) {
    const phone = indexes.find((row) => row.name === 'idx_phone_unique');
    assert.deepEqual(phone?.key, { phone: 1 });
    assert.equal(phone?.unique, true);
    assert.equal(phone?.sparse, true);
    await users.insertOne({ _id: crypto.randomUUID(), phone: '+12025550123' });
    await assert.rejects(() => users.insertOne({ _id: crypto.randomUUID(), phone: '+12025550123' }), { code: 11000 });
  }
  assert.ok(indexes.some((row) => row.name === 'email_1' && row.unique && row.sparse));
  assert.ok(!indexes.some((row) => row.name === 'idx_email'));
  for (const [name, appField, identityField] of specifications) {
    const index = indexes.find((row) => row.name === name);
    assert.equal(index?.unique, true);
    assert.deepEqual(index.key, { [appField]: 1, [identityField]: 1 });
    assert.deepEqual(index.partialFilterExpression, {
      [appField]: { $type: 'string' },
      [identityField]: { $type: 'string' }
    });
    const value = { [appField]: 'synthetic-stage-app', [identityField]: 'synthetic-stage-openid' };
    await users.insertOne({ _id: crypto.randomUUID(), ...value });
    await assert.rejects(() => users.insertOne({ _id: crypto.randomUUID(), ...value }), { code: 11000 });
    await users.insertOne({ _id: crypto.randomUUID(), ...value, [appField]: 'synthetic-other-app' });
  }
  await users.insertMany([
    { _id: crypto.randomUUID(), nickname: 'synthetic-no-identity' },
    { _id: crypto.randomUUID(), nickname: 'synthetic-no-identity' }
  ]);
  if (!regional) assert.equal(await users.countDocuments({ qq_unionid: null }), await users.countDocuments());
  assert.equal(await db.collection('questions').countDocuments(), 0);
  const retention = db.collection('desktop_oauth_sessions');
  const retentionBefore = { exists: false, count: 0, indexes: [] };
  const retentionCurrent = {
    exists: true,
    count: await retention.countDocuments(),
    indexes: await retention.indexes()
  };
  const definitions = [
    { key: { expires_at: 1 }, options: { expireAfterSeconds: 0, name: 'idx_desktop_oauth_expiry' } }
  ];
  assert.deepEqual(assertDesktopRetentionRecoveryShape(retentionBefore, retentionCurrent, definitions).createdNames, [
    'idx_desktop_oauth_expiry'
  ]);
  return { identityIndexes: specifications.map(([name]) => name), retentionDefinitions: definitions };
}

export function stageCompiledFiles(release, { legacy = false } = {}) {
  let files;
  if (!legacy) {
    files = ['package.json', 'package-lock.json', '.env.example', 'ecosystem.config.cjs'];
    const visit = (relative) => {
      const root = path.join(release, relative);
      assert.ok(fs.lstatSync(root).isDirectory() && !fs.lstatSync(root).isSymbolicLink());
      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        const child = relative + '/' + entry.name;
        assert.ok(!entry.isSymbolicLink());
        if (entry.isDirectory()) visit(child);
        else {
          assert.ok(entry.isFile());
          files.push(child);
        }
      }
    };
    visit('dist');
    assertArchive(files.map((name) => ({ name, size: fs.lstatSync(path.join(release, name)).size, type: 'file' })));
  } else
    files = [
      'dist/standalone/server.js',
      'dist/standalone/cloud-shim.js',
      'dist/functions/login.js',
      'dist/functions/db-create-indexes.js',
      'package.json',
      'package-lock.json'
    ];
  return Object.fromEntries(
    files.sort().map((file) => {
      assert.ok(fs.lstatSync(path.join(release, file)).isFile());
      return [file, sha(fs.readFileSync(path.join(release, file)))];
    })
  );
}

async function stageCandidate(state, candidateSha) {
  const names = candidateStageNames(state.id, candidateSha);
  const prepared = preparedState();
  assert.equal(sha(fs.readFileSync(archive)), candidateSha);
  assert.ok(!fs.existsSync(names.root) && !fs.existsSync(names.release), 'stage path already exists');
  assert.equal(run(['ss', '-H', '-ltnp', 'sport = :3002']).trim(), '', 'candidate port already used');
  assert.ok(Number(/MemAvailable:\s+(\d+)/.exec(fs.readFileSync('/proc/meminfo', 'utf8'))?.[1]) >= 650000);
  assert.ok(fs.statfsSync('/').bavail * fs.statfsSync('/').bsize > 2_000_000_000);
  const metadata = JSON.parse(
    run([
      'python3',
      '-c',
      'import tarfile,json; t=tarfile.open("' +
        archive +
        '"); print(json.dumps([dict(name=m.name,size=m.size,type="file" if m.isfile() else "other") for m in t.getmembers()]))'
    ])
  );
  assertArchive(metadata);
  const clients = await preparedClients(prepared);
  let child;
  try {
    const before = await primarySnapshot(prepared, clients.app);
    const predecessor = await identityPredecessor(prepared, clients, candidateSha, before);
    const owner = JSON.stringify({ transaction: state.id, candidateSha, preparedTransaction: prepared.transaction });
    for (const root of [names.root, names.release]) {
      fs.mkdirSync(root, { mode: 0o700 });
      write(path.join(root, '.wenli-owner.json'), owner);
    }
    run(['tar', '-xzf', archive, '--no-same-owner', '-C', names.release]);
    const sameDependencies = ['package.json', 'package-lock.json'].every(
      (file) =>
        sha(fs.readFileSync(path.join(names.release, file))) === sha(fs.readFileSync(path.join(prepared.release, file)))
    );
    if (sameDependencies) {
      const dependencies = path.join(prepared.release, 'node_modules');
      assert.equal(fs.realpathSync(dependencies), dependencies);
      assert.ok(fs.statSync(dependencies).isDirectory());
      fs.symlinkSync(dependencies, path.join(names.release, 'node_modules'));
    } else {
      const npm = fs.realpathSync('/usr/bin/npm');
      assert.ok(npm.startsWith('/usr/lib/node_modules/npm/') && fs.statSync(npm).isFile());
      run([process.execPath, npm, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
        cwd: names.release
      });
    }
    assert.equal((await clients.admin.db(names.database).command({ usersInfo: 1 })).users.length, 0);
    assert.ok(
      !(await clients.admin.db('admin').admin().listDatabases()).databases.some((row) => row.name === names.database)
    );
    write(path.join(names.root, 'namespace.json'), JSON.stringify({ database: names.database }));
    const password = crypto.randomBytes(24).toString('base64url');
    await clients.admin
      .db(names.database)
      .command({ createUser: 'candidate', pwd: password, roles: [{ role: 'readWrite', db: names.database }] });
    const uri = new URL(clients.application);
    uri.username = 'candidate';
    uri.password = password;
    uri.pathname = '/' + names.database;
    uri.searchParams.set('authSource', names.database);
    const env = candidateEnvironment({
      uri: uri.toString(),
      database: names.database,
      storage: path.join(names.root, 'storage'),
      jwtSecret: crypto.randomBytes(32).toString('hex'),
      adminSecret: crypto.randomBytes(32).toString('hex'),
      vaultKey: crypto.randomBytes(32).toString('hex')
    });
    const db = clients.admin.db(names.database);
    const { identityIndexes, retentionDefinitions } = await validateStageIndexes(names, env, db);
    const entry = path.join(names.release, 'dist/standalone/server.js');
    const log = fs.openSync(path.join(names.root, 'private.log'), 'wx', 0o600);
    child = spawn(process.execPath, [entry], { cwd: names.release, env, stdio: ['ignore', log, log] });
    child.on('error', () => {
      // Startup rejection is reported through the fixed admission checks.
    });
    fs.closeSync(log);
    assert.ok(Number.isSafeInteger(child.pid) && child.pid > 1);
    const startTime = fs.readFileSync(`/proc/${child.pid}/stat`, 'utf8').split(') ').pop().split(' ')[19];
    write(path.join(names.root, 'process.json'), JSON.stringify({ pid: child.pid, entry, startTime }));
    let listening = false;
    for (let i = 0; i < 50; i++) {
      if (child.exitCode !== null || child.signalCode !== null) break;
      try {
        assertStageListener(run(['ss', '-H', '-ltnp', 'sport = :3002']), child.pid);
        listening = true;
        break;
      } catch {
        /* wait only for this recorded child to bind its loopback port */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(listening, 'candidate did not own its loopback listener');
    await validateCandidate(db, 'http://127.0.0.1:3002');
    for (const [body, expected] of [
      [{ type: 'qq', platform: 'unknown', code: 'syntheticCode123' }, 400],
      [{ type: 'qq', platform: 'app', accessToken: 'synthetic-stage-token' }, 400],
      [{ type: 'wechat', platform: 'app', code: 'syntheticCode123' }, 500],
      [{ type: 'wechat_web', code: 'syntheticCode123' }, 500],
      [{ type: 'desktop_oauth', action: 'begin', provider: 'qq', challenge: 'a'.repeat(64) }, 400]
    ]) {
      const probe = async () =>
        (
          await fetch('http://127.0.0.1:3002/login', {
            method: 'POST',
            headers: { 'content-type': 'application/json', origin: 'tauri://localhost' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(12000)
          })
        ).json();
      let result = await probe();
      if (result.code === 429) {
        // Only synthetic missing-configuration probes are retried, once, after
        // the live limit expires. No rate records or policy are reset.
        assert.ok(Number.isInteger(result.retryAfter) && result.retryAfter >= 1 && result.retryAfter <= 60);
        const lease = json('/var/lib/vps-config/file-maintenance/state.json');
        assert.equal(lease.id, state.id);
        assert.ok(lease.deadline > Date.now() / 1000 + result.retryAfter + 20);
        await new Promise((resolve) => setTimeout(resolve, result.retryAfter * 1000 + 100));
        const currentLease = json('/var/lib/vps-config/file-maintenance/state.json');
        assert.equal(currentLease.id, state.id);
        assertLease(currentLease, 'stage-candidate');
        result = await probe();
      }
      assert.equal(result.code, expected);
    }
    assert.equal(
      (await fetch('http://127.0.0.1:3002/db-create-indexes', { signal: AbortSignal.timeout(5000) })).status,
      404
    );
    const currentLease = json('/var/lib/vps-config/file-maintenance/state.json');
    assert.equal(currentLease.id, state.id);
    assertLease(currentLease, 'stage-candidate');
    await stopStageProcess(names.root);
    await clearStageDatabase(clients.admin, names.database);
    const after = await primarySnapshot(prepared, clients.app);
    assert.deepEqual(after, before, 'primary prestate changed');
    ownedStageRoot(names.root, state, candidateSha);
    fs.rmSync(names.root, { recursive: true });
    write(
      names.report,
      JSON.stringify({
        transaction: state.id,
        contractVersion: stageContract,
        candidateSha,
        preparedTransaction: prepared.transaction,
        before,
        compiledFiles: stageCompiledFiles(names.release),
        identityIndexes,
        predecessor,
        retentionDefinitions,
        scopedDesktopRetentionMigration: true,
        desktopRetentionCreateDropIdempotent: true,
        desktopAuthorizationDefaultDisabled: true,
        dependenciesReused: sameDependencies,
        passwordLogin: true,
        unauthorizedLearningRejected: true,
        exactDesktopOrigin: true,
        unknownAndUnconfiguredOAuthRejected: true,
        adminMigrationNotPublic: true,
        scopedIdentityMigration: true,
        existingEmailIndexPreserved: true,
        identityMigrationIdempotent: true,
        noUnrelatedMigrationCollections: true,
        scopedRoleIdentityIndexCreateAndDropValidated: true,
        accountIsolation: true,
        syncIdempotency: true,
        actualWrongAnswerPreserved: true,
        duplicateIdentitiesRejected: true,
        differentAppsRemainIndependent: true,
        missingIdentitiesAllowed: true,
        temporaryProcessAndDatabaseRemoved: true,
        primaryDatabaseAndLegacyUnchanged: true,
        productionSwitched: false,
        publicBankImported: false,
        upstreamProviderCalls: 0,
        upstreamModelCalls: 0,
        stagedAt: Date.now()
      })
    );
  } finally {
    try {
      // The recorded PID is checked before stopping; the in-memory child covers
      // the narrow failure interval between spawn and persisting that record.
      if (child && child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        await Promise.race([
          new Promise((resolve) =>
            child.exitCode !== null || child.signalCode !== null ? resolve() : child.once('exit', resolve)
          ),
          new Promise((_, reject) => setTimeout(() => reject(new Error('candidate shutdown timeout')), 10000).unref())
        ]);
      }
      if (fs.existsSync(names.root)) {
        ownedStageRoot(names.root, state, candidateSha);
        await stopStageProcess(names.root);
        if (fs.existsSync(path.join(names.root, 'namespace.json')))
          await clearStageDatabase(clients.admin, names.database);
        fs.rmSync(names.root, { recursive: true });
      }
    } finally {
      await clients.close();
    }
  }
}

async function checkPrepared() {
  const prepared = preparedState();
  const clients = await preparedClients(prepared);
  try {
    return await primarySnapshot(prepared, clients.app);
  } finally {
    await clients.close();
  }
}

async function stagedIdentityDefinitions(candidateSha) {
  assert.match(candidateSha || '', /^[a-f0-9]{64}$/);
  const release = path.join(releases, candidateSha.slice(0, 16));
  const report = json(path.join(release, '.wenli-stage.json'));
  ownedStageRoot(release, { id: report.transaction }, candidateSha);
  assert.equal(report.candidateSha, candidateSha);
  assert.equal(report.scopedIdentityMigration, true);
  assert.equal(report.existingEmailIndexPreserved, true);
  assert.equal(report.identityMigrationIdempotent, true);
  assert.equal(report.noUnrelatedMigrationCollections, true);
  assert.equal(report.scopedRoleIdentityIndexCreateAndDropValidated, true);
  assert.ok(report.contractVersion === undefined || report.contractVersion === stageContract);
  const legacy = report.contractVersion === undefined;
  assert.deepEqual(report.compiledFiles, stageCompiledFiles(release, { legacy }));
  const module = await import(pathToFileURL(path.join(release, 'dist/functions/db-create-indexes.js')).href);
  const definitions = module.getUserIdentityIndexes();
  assertIdentityDefinitions(definitions, { legacy });
  let retentionDefinitions;
  if (!legacy) {
    retentionDefinitions = module.getDesktopOAuthIndexes();
    assertDesktopRetentionDefinitions(retentionDefinitions);
    assert.deepEqual(report.retentionDefinitions, retentionDefinitions);
    for (const flag of [
      'scopedDesktopRetentionMigration',
      'desktopRetentionCreateDropIdempotent',
      'desktopAuthorizationDefaultDisabled'
    ])
      assert.equal(report[flag], true);
    await verifyIdentityPredecessor(report.predecessor, {
      candidateSha,
      preparedTransaction: report.preparedTransaction,
      definitions,
      beforeSnapshot: report.before
    });
  }
  return { release, definitions, retentionDefinitions, report, legacy };
}

function identityReceipt(candidateSha) {
  const file = identityMigrationNames('0'.repeat(32), candidateSha).report;
  const legacyFile = identityMigrationNames('0'.repeat(32)).report;
  const legacyMatches = fs.existsSync(legacyFile) && json(legacyFile).candidateSha === candidateSha;
  assert.ok(!(fs.existsSync(file) && legacyMatches), 'duplicate identity receipt');
  const selected = fs.existsSync(file) ? file : legacyMatches ? legacyFile : null;
  return selected ? { file: selected, report: json(selected) } : null;
}

async function verifyIdentityPredecessor(reference, next) {
  if (!reference) return;
  const receipt = identityReceipt(reference.candidateSha);
  assert.ok(receipt);
  assert.equal(reference.file, receipt.file);
  assert.equal(reference.sha256, sha(fs.readFileSync(receipt.file)));
  assert.equal(reference.transaction, receipt.report.transaction);
  assert.notEqual(receipt.report.candidateSha, next.candidateSha);
  assertIdentityPredecessor(receipt.report, next);
  const staged = await stagedIdentityDefinitions(receipt.report.candidateSha);
  assert.deepEqual(receipt.report.definitions, staged.definitions);
  assert.deepEqual(receipt.report.beforeSnapshot, staged.report.before);
}

async function identityPredecessor(prepared, clients, candidateSha, beforeSnapshot) {
  const matches = fs
    .readdirSync(data)
    .filter((name) => /^identity-indexes-applied(?:-[a-f0-9]{64})?\.json$/.test(name))
    .map((name) => {
      const file = path.join(data, name);
      return { file, report: json(file), sha256: sha(fs.readFileSync(file)) };
    })
    .filter(
      (row) =>
        row.report.candidateSha !== candidateSha &&
        JSON.stringify(row.report.afterSnapshot) === JSON.stringify(beforeSnapshot)
    );
  const heads = matches.filter((row) => !matches.some((other) => other.report.predecessor?.sha256 === row.sha256));
  if (!heads.length) {
    const indexes = await identityMetadata(clients);
    assert.deepEqual(indexes.map((index) => index.name).sort(), ['_id_', 'email_1']);
    assert.equal((await desktopRetentionMetadata(clients)).exists, false);
    return null;
  }
  assert.equal(heads.length, 1, 'ambiguous identity predecessor');
  const row = heads[0];
  assert.equal(identityReceipt(row.report.candidateSha)?.file, row.file);
  await verifyIdentityReport(prepared, clients, row.report.candidateSha, row.report);
  return {
    file: row.file,
    sha256: row.sha256,
    candidateSha: row.report.candidateSha,
    transaction: row.report.transaction
  };
}

export async function identityMetadata(clients, { allowDesktop = false } = {}) {
  const db = clients.app.db('exam-master');
  const collections = await db.listCollections().toArray();
  for (const collection of collections) {
    assert.equal(collection.type, 'collection');
    assert.deepEqual(withoutDefaultCollation(collection.options), {});
  }
  const names = collections.map((row) => row.name).sort();
  assert.deepEqual(
    names,
    allowDesktop && names.includes('desktop_oauth_sessions') ? ['desktop_oauth_sessions', 'users'] : ['users']
  );
  assert.equal(await db.collection('users').countDocuments(), 0);
  if (names.includes('desktop_oauth_sessions'))
    assert.equal(await db.collection('desktop_oauth_sessions').countDocuments(), 0);
  return db.collection('users').indexes();
}

export async function desktopRetentionMetadata(clients) {
  const db = clients.app.db('exam-master');
  const rows = await db.listCollections({ name: 'desktop_oauth_sessions' }).toArray();
  if (!rows.length) return { exists: false, count: 0, indexes: [] };
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, 'collection');
  assert.deepEqual(withoutDefaultCollation(rows[0].options), {});
  const collection = db.collection('desktop_oauth_sessions');
  return { exists: true, count: await collection.countDocuments(), indexes: await collection.indexes() };
}

function assertNonIndexPrestate(before, current) {
  const { databaseSha256: _beforeIndexes, ...beforeRest } = before;
  const { databaseSha256: _currentIndexes, ...currentRest } = current;
  assert.deepEqual(currentRest, beforeRest, 'non-index prestate changed');
}

async function verifyIdentityReport(prepared, clients, candidateSha, report) {
  assert.match(report.transaction || '', /^[a-f0-9]{32}$/);
  assert.equal(report.preparedTransaction, prepared.transaction);
  assert.equal(report.candidateSha, candidateSha);
  const staged = await stagedIdentityDefinitions(candidateSha);
  assert.equal(report.contractVersion, staged.report.contractVersion);
  assert.deepEqual(report.definitions, staged.definitions);
  assert.deepEqual(report.beforeSnapshot, staged.report.before);
  assert.equal(report.scope, 'user-identities');
  assert.equal(report.publicEntrySwitched, false);
  assert.equal(report.userDocumentsModified, false);
  assert.equal(report.upstreamProviderCalls, 0);
  assert.equal(report.upstreamModelCalls, 0);
  const current = await identityMetadata(clients, { allowDesktop: !staged.legacy });
  const createdNames = assertIdentityRecoveryShape(report.indexesBefore, current, report.definitions, {
    legacy: staged.legacy
  });
  assert.equal(report.actualScopedMigrationAndIdempotency, true);
  assert.deepEqual(report.createdNames, createdNames);
  for (const definition of report.definitions) {
    assert.ok(
      identityIndexMatches(
        current.find((index) => index.name === definition.options.name),
        definition
      )
    );
  }
  if (!staged.legacy) {
    assert.deepEqual(report.predecessor, staged.report.predecessor);
    assert.deepEqual(report.retentionDefinitions, staged.retentionDefinitions);
    assert.deepEqual(report.scopes, ['user-identities', 'desktop-oauth']);
    assert.equal(report.actualScopedDesktopRetentionAndIdempotency, true);
    const retention = await desktopRetentionMetadata(clients);
    assert.deepEqual(
      report.desktopRetentionCreated,
      assertDesktopRetentionRecoveryShape(report.desktopRetentionBefore, retention, staged.retentionDefinitions)
    );
    assert.deepEqual(retention, report.desktopRetentionAfter);
    assertDesktopRetentionIndex(retention.indexes.find((index) => index.name === 'idx_desktop_oauth_expiry'));
  }
  assert.deepEqual(await primarySnapshot(prepared, clients.app), report.afterSnapshot);
  assertNonIndexPrestate(report.beforeSnapshot, report.afterSnapshot);
  assert.ok(!fs.existsSync(identityMigrationNames(report.transaction).root));
}

async function migrateIdentities(state, candidateSha) {
  const names = identityMigrationNames(state.id, candidateSha);
  const prepared = preparedState();
  const clients = await preparedClients(prepared);
  try {
    const existing = identityReceipt(candidateSha);
    if (existing) {
      // A previously accepted identical migration is read-only and idempotent.
      await verifyIdentityReport(prepared, clients, candidateSha, existing.report);
      return;
    }
    assert.ok(!fs.existsSync(names.root), 'identity transaction already exists');
    const staged = await stagedIdentityDefinitions(candidateSha);
    assert.equal(staged.legacy, false, 'new changes require the website/desktop contract');
    const beforeSnapshot = await primarySnapshot(prepared, clients.app);
    assert.deepEqual(beforeSnapshot, staged.report.before);
    const indexesBefore = await identityMetadata(clients, { allowDesktop: true });
    const desktopRetentionBefore = await desktopRetentionMetadata(clients);
    assertDesktopRetentionRecoveryShape(desktopRetentionBefore, desktopRetentionBefore, staged.retentionDefinitions);
    const priorRetention = desktopRetentionBefore.indexes.find((index) => index.name === 'idx_desktop_oauth_expiry');
    if (priorRetention) assertDesktopRetentionIndex(priorRetention);
    for (const definition of staged.definitions) {
      const prior = indexesBefore.find((index) => index.name === definition.options.name);
      if (prior) assert.ok(identityIndexMatches(prior, definition), 'conflicting prior identity index');
    }
    fs.mkdirSync(names.root, { mode: 0o700 });
    write(
      path.join(names.root, '.wenli-owner.json'),
      JSON.stringify({ transaction: state.id, preparedTransaction: prepared.transaction, candidateSha })
    );
    const before = {
      transaction: state.id,
      preparedTransaction: prepared.transaction,
      candidateSha,
      contractVersion: stageContract,
      scope: 'user-identities',
      scopes: ['user-identities', 'desktop-oauth'],
      predecessor: staged.report.predecessor,
      beforeSnapshot,
      indexesBefore,
      definitions: staged.definitions,
      retentionDefinitions: staged.retentionDefinitions,
      desktopRetentionBefore
    };
    write(path.join(names.root, 'before.json'), JSON.stringify(before));
    const secret = crypto.randomBytes(32).toString('hex');
    const env = {
      PATH: '/usr/local/bin:/usr/bin:/bin',
      NODE_ENV: 'production',
      DB_NAME: 'exam-master',
      MONGODB_URI: clients.application.toString(),
      ADMIN_SECRET: secret,
      JWT_SECRET: crypto.randomBytes(32).toString('hex')
    };
    const code = `import assert from 'node:assert/strict';
      import migration from ${JSON.stringify(pathToFileURL(path.join(staged.release, 'dist/functions/db-create-indexes.js')).href)};
      import {closeDb} from ${JSON.stringify(pathToFileURL(path.join(staged.release, 'dist/standalone/cloud-shim.js')).href)};
      try {const ctx={headers:{'x-admin-secret':process.env.ADMIN_SECRET},body:{scope:'user-identities'}};
        for(let i=0;i<2;i++){const result=await migration(ctx);assert.equal(result.code,0);assert.equal(result.success,true);
          assert.equal(result.data.length,1);assert.equal(result.data[0].status,'ok');assert.equal(result.data[0].indexes,9);}
        const retention={headers:{'x-admin-secret':process.env.ADMIN_SECRET},body:{scope:'desktop-oauth'}};
        for(let i=0;i<2;i++){const result=await migration(retention);assert.equal(result.code,0);assert.equal(result.success,true);}
      } finally {await closeDb();}`;
    run([process.execPath, '--input-type=module', '-'], { env, cwd: staged.release, input: code });
    const current = await identityMetadata(clients, { allowDesktop: true });
    const createdNames = assertIdentityRecoveryShape(indexesBefore, current, staged.definitions);
    const desktopRetentionAfter = await desktopRetentionMetadata(clients);
    const desktopRetentionCreated = assertDesktopRetentionRecoveryShape(
      desktopRetentionBefore,
      desktopRetentionAfter,
      staged.retentionDefinitions
    );
    assertDesktopRetentionIndex(
      desktopRetentionAfter.indexes.find((index) => index.name === 'idx_desktop_oauth_expiry')
    );
    for (const definition of staged.definitions) {
      assert.ok(
        identityIndexMatches(
          current.find((index) => index.name === definition.options.name),
          definition
        )
      );
    }
    const afterSnapshot = await primarySnapshot(prepared, clients.app);
    assertNonIndexPrestate(beforeSnapshot, afterSnapshot);
    const lease = json('/var/lib/vps-config/file-maintenance/state.json');
    assert.equal(lease.id, state.id);
    assertLease(lease, 'migrate-identities');
    const ready = path.join(names.root, 'ready.json');
    write(
      ready,
      JSON.stringify({
        ...before,
        afterSnapshot,
        createdNames,
        desktopRetentionAfter,
        desktopRetentionCreated,
        userDocumentsModified: false,
        publicEntrySwitched: false,
        upstreamProviderCalls: 0,
        upstreamModelCalls: 0,
        actualScopedMigrationAndIdempotency: true,
        actualScopedDesktopRetentionAndIdempotency: true,
        appliedAt: Date.now()
      })
    );
    const fd = fs.openSync(ready, 'r');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    // Hard-link commit is atomic and refuses an existing receipt; no foreign
    // receipt can be overwritten in the interval before removing our journal.
    fs.linkSync(ready, names.report);
    syncDirectory(path.dirname(names.report));
    ownedStageRoot(names.root, state, candidateSha);
    fs.rmSync(names.root, { recursive: true });
    await verifyIdentityReport(prepared, clients, candidateSha, json(names.report));
  } finally {
    await clients.close();
  }
}

async function recoverIdentities(state, candidateSha) {
  const names = identityMigrationNames(state.id, candidateSha);
  const prepared = preparedState();
  let before;
  if (fs.existsSync(names.root)) {
    ownedStageRoot(names.root, state, candidateSha);
    if (fs.existsSync(path.join(names.root, 'before.json'))) before = json(path.join(names.root, 'before.json'));
  }
  let committed;
  const receipt = identityReceipt(candidateSha);
  if (receipt) {
    const report = receipt.report;
    if (report.transaction === state.id) {
      committed = report;
      before ||= report;
    }
  }
  if (before) {
    assertStageOwner(before, state.id, candidateSha);
    assert.equal(before.preparedTransaction, prepared.transaction);
    const clients = await preparedClients(prepared);
    try {
      const staged = await stagedIdentityDefinitions(candidateSha);
      assert.equal(before.contractVersion, staged.report.contractVersion);
      assert.deepEqual(before.definitions, staged.definitions);
      assert.deepEqual(before.beforeSnapshot, staged.report.before);
      const current = await identityMetadata(clients, { allowDesktop: !staged.legacy });
      assertNonIndexPrestate(before.beforeSnapshot, await primarySnapshot(prepared, clients.app));
      const created = assertIdentityRecoveryShape(before.indexesBefore, current, before.definitions, {
        legacy: staged.legacy
      });
      if (!staged.legacy) {
        assert.deepEqual(before.retentionDefinitions, staged.retentionDefinitions);
        assert.deepEqual(before.predecessor, staged.report.predecessor);
        const retention = await desktopRetentionMetadata(clients);
        const recovery = assertDesktopRetentionRecoveryShape(
          before.desktopRetentionBefore,
          retention,
          staged.retentionDefinitions
        );
        const sessions = clients.app.db('exam-master').collection('desktop_oauth_sessions');
        for (const name of recovery.createdNames) await sessions.dropIndex(name);
        if (recovery.dropCreatedCollection) {
          const remaining = await desktopRetentionMetadata(clients);
          assert.deepEqual(remaining.indexes.map(withoutDefaultCollation), [{ v: 2, key: { _id: 1 }, name: '_id_' }]);
          assert.equal(remaining.count, 0);
          await sessions.drop();
        }
        assert.deepEqual(await desktopRetentionMetadata(clients), before.desktopRetentionBefore);
      }
      // Delete only matching additions absent from the frozen before image.
      // Original email/_id indexes and any unexpected changes cannot be removed.
      for (const name of created.reverse()) await clients.app.db('exam-master').collection('users').dropIndex(name);
      assert.deepEqual(await identityMetadata(clients, { allowDesktop: !staged.legacy }), before.indexesBefore);
      assert.deepEqual(await primarySnapshot(prepared, clients.app), before.beforeSnapshot);
    } finally {
      await clients.close();
    }
  }
  if (committed) {
    assert.equal(json(receipt.file).transaction, state.id);
    fs.unlinkSync(receipt.file);
  }
  if (fs.existsSync(names.root)) {
    ownedStageRoot(names.root, state, candidateSha);
    fs.rmSync(names.root, { recursive: true });
  }
}

async function checkIdentities(candidateSha) {
  const receipt = identityReceipt(candidateSha);
  if (!receipt) {
    await checkCandidate(candidateSha);
    return;
  }
  const prepared = preparedState();
  const clients = await preparedClients(prepared);
  try {
    await verifyIdentityReport(prepared, clients, candidateSha, receipt.report);
  } finally {
    await clients.close();
  }
}

async function checkCandidate(candidateSha) {
  assert.match(candidateSha || '', /^[a-f0-9]{64}$/);
  const before = await checkPrepared();
  const release = path.join(releases, candidateSha.slice(0, 16));
  if (sha(fs.readFileSync(archive)) !== candidateSha) {
    // The same probe verifies prestate and actual rollback after file restoration.
    assert.ok(!fs.existsSync(release));
    const state = json('/var/lib/vps-config/file-maintenance/state.json');
    const names = candidateStageNames(state.id, candidateSha);
    assert.ok(!fs.existsSync(names.root));
    const clients = await preparedClients(preparedState());
    try {
      assert.equal((await clients.admin.db(names.database).command({ usersInfo: 1 })).users.length, 0);
      assert.ok(
        !(await clients.admin.db('admin').admin().listDatabases()).databases.some((row) => row.name === names.database)
      );
    } finally {
      await clients.close();
    }
    return;
  }
  const report = json(path.join(release, '.wenli-stage.json'));
  const names = candidateStageNames(report.transaction, candidateSha);
  ownedStageRoot(names.release, { id: report.transaction }, candidateSha);
  assert.equal(report.candidateSha, candidateSha);
  assert.equal(report.preparedTransaction, before.preparedTransaction);
  const identityReport = identityReceipt(candidateSha);
  if (identityReport) {
    const applied = identityReport.report;
    const prepared = preparedState();
    const clients = await preparedClients(prepared);
    try {
      await verifyIdentityReport(prepared, clients, candidateSha, applied);
    } finally {
      await clients.close();
    }
    assert.deepEqual(applied.beforeSnapshot, report.before);
    assert.deepEqual(applied.afterSnapshot, before);
  } else {
    assert.deepEqual(report.before, before);
  }
  assert.ok(report.contractVersion === undefined || report.contractVersion === stageContract);
  assert.deepEqual(
    report.compiledFiles,
    stageCompiledFiles(names.release, { legacy: report.contractVersion === undefined })
  );
  if (report.contractVersion === stageContract) await stagedIdentityDefinitions(candidateSha);
  assert.ok(!fs.existsSync(names.root));
  for (const flag of [
    'passwordLogin',
    'unauthorizedLearningRejected',
    'exactDesktopOrigin',
    'accountIsolation',
    'syncIdempotency',
    'actualWrongAnswerPreserved',
    'duplicateIdentitiesRejected',
    'differentAppsRemainIndependent',
    'missingIdentitiesAllowed',
    'unknownAndUnconfiguredOAuthRejected',
    'adminMigrationNotPublic',
    'temporaryProcessAndDatabaseRemoved',
    'primaryDatabaseAndLegacyUnchanged'
  ])
    assert.equal(report[flag], true);
  assert.equal(report.productionSwitched, false);
  assert.equal(report.publicBankImported, false);
  assert.equal(report.upstreamProviderCalls, 0);
  assert.equal(report.upstreamModelCalls, 0);
  const prepared = preparedState();
  const clients = await preparedClients(prepared);
  try {
    assert.equal((await clients.admin.db(names.database).command({ usersInfo: 1 })).users.length, 0);
    assert.ok(
      !(await clients.admin.db('admin').admin().listDatabases()).databases.some((row) => row.name === names.database)
    );
  } finally {
    await clients.close();
  }
}

async function prepare(state, candidateSha) {
  assert.match(candidateSha || '', /^[a-f0-9]{64}$/);
  assert.equal(sha(fs.readFileSync(archive)), candidateSha);
  assert.equal(
    sha(fs.readFileSync(path.join(legacy, 'standalone/server.js'))),
    '9ed16baa80dd2241505c7347ceb1d51502f80b324bb453e7c801307984fc1c8c'
  );
  assert.ok(!inspect(container) && !inspect(container + '-restore'));
  for (const root of [config, data, releases]) assert.ok(!fs.existsSync(root), 'service tree already exists');
  for (const root of [config, data, releases]) assert.ok(fs.statSync(path.dirname(root)).isDirectory());
  const available = /MemAvailable:\s+(\d+)/.exec(fs.readFileSync('/proc/meminfo', 'utf8'));
  assert.ok(Number(available?.[1]) >= 850000, 'insufficient memory');
  const disk = fs.statfsSync('/');
  assert.ok(disk.bavail * disk.bsize > 4_000_000_000, 'insufficient disk');
  const metadata = JSON.parse(
    run([
      'python3',
      '-c',
      'import tarfile,json; t=tarfile.open("' +
        archive +
        '"); print(json.dumps([dict(name=m.name,size=m.size,type="file" if m.isfile() else "other") for m in t.getmembers()]))'
    ])
  );
  assertArchive(metadata);
  for (const root of [config, data, releases]) {
    fs.mkdirSync(root, { mode: 0o700 });
    write(path.join(root, '.wenli-owner.json'), JSON.stringify({ transaction: state.id, candidateSha }));
  }
  const release = path.join(releases, candidateSha.slice(0, 16));
  fs.mkdirSync(release, { mode: 0o700 });
  run(['tar', '-xzf', archive, '--no-same-owner', '-C', release]);
  // Tencent's /usr/local/bin/npm is a retired Python launcher. Use the existing
  // verified npm CLI with the same Node executable as the backend.
  const npm = fs.realpathSync('/usr/bin/npm');
  assert.ok(npm.startsWith('/usr/lib/node_modules/npm/') && fs.statSync(npm).isFile());
  run([process.execPath, npm, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: release });
  const require = createRequire(path.join(release, 'package.json'));
  const { MongoClient } = require('mongodb');
  process.loadEnvFile(path.join(legacy, '.env'));
  const prior = new URL(process.env.MONGODB_URI);
  assert.equal(prior.hostname, '127.0.0.1');
  assert.ok(prior.username && prior.password);
  const rootUser = 'wenli-operator';
  const rootPassword = crypto.randomBytes(32).toString('base64url');
  const secrets = path.join(config, 'mongo-secrets');
  fs.mkdirSync(secrets, { mode: 0o700 });
  const mongoUid = Number(
    run([
      'docker',
      'run',
      '--rm',
      '--network',
      'none',
      '--read-only',
      '--entrypoint',
      'id',
      image,
      '-u',
      'mongodb'
    ]).trim()
  );
  assert.ok(Number.isSafeInteger(mongoUid) && mongoUid > 0);
  write(path.join(secrets, 'mongo-root-user'), rootUser);
  write(path.join(secrets, 'mongo-root-password'), rootPassword);
  const rootUri = (port) => `mongodb://${rootUser}:${rootPassword}@127.0.0.1:${port}/admin`;
  write(path.join(secrets, 'mongo-tools.yaml'), 'uri: ' + JSON.stringify(mongoToolsUri(rootUser, rootPassword)) + '\n');
  for (const file of [secrets, ...fs.readdirSync(secrets).map((name) => path.join(secrets, name))])
    fs.chownSync(file, mongoUid, mongoUid);
  const startMongo = (name, port, folder) => {
    fs.mkdirSync(folder, { mode: 0o700 });
    return run([
      'docker',
      'run',
      '-d',
      '--name',
      name,
      '--label',
      'cn.wenli.transaction=' + state.id,
      '--restart',
      name === container ? 'unless-stopped' : 'no',
      '--memory',
      name === container ? '768m' : '512m',
      '--memory-swap',
      name === container ? '1024m' : '768m',
      '--cpus',
      '1',
      '--pids-limit',
      '256',
      '--read-only',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,size=64m',
      '--tmpfs',
      '/data/configdb:rw,nosuid,size=16m',
      '-p',
      `127.0.0.1:${port}:27017`,
      '--mount',
      `type=bind,src=${folder},dst=/data/db`,
      '--mount',
      `type=bind,src=${secrets},dst=/run/wenli-secrets,readonly`,
      '-e',
      'MONGO_INITDB_ROOT_USERNAME_FILE=/run/wenli-secrets/mongo-root-user',
      '-e',
      'MONGO_INITDB_ROOT_PASSWORD_FILE=/run/wenli-secrets/mongo-root-password',
      image,
      '--wiredTigerCacheSizeGB',
      '0.25'
    ]).trim();
  };
  startMongo(container, 27019, path.join(data, 'mongodb'));
  const connect = async (uri) => {
    for (let i = 0; i < 50; i++) {
      const client = new MongoClient(uri, { serverSelectionTimeoutMS: 1500 });
      try {
        await client.connect();
        return client;
      } catch {
        await client.close();
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    throw new Error('authenticated Mongo startup failed');
  };
  const admin = await connect(rootUri(27019));
  const testDb = 'wenli_candidate_' + state.id.slice(0, 12);
  const testPassword = crypto.randomBytes(24).toString('base64url');
  let candidate;
  let restore;
  try {
    await admin.db('exam-master').command({
      createUser: decodeURIComponent(prior.username),
      pwd: decodeURIComponent(prior.password),
      roles: [{ role: 'readWrite', db: 'exam-master' }]
    });
    await admin
      .db(testDb)
      .command({ createUser: 'candidate', pwd: testPassword, roles: [{ role: 'readWrite', db: testDb }] });
    prior.port = '27019';
    prior.searchParams.set('authSource', 'exam-master');
    // Carry the existing learning origins through to the production-derived environment.
    const env = fs.readFileSync(path.join(legacy, '.env'), 'utf8');
    const additions = {
      MONGODB_URI: prior.toString(),
      DB_NAME: 'exam-master',
      HOST: '127.0.0.1',
      PORT: '3001',
      STORAGE_DIR: path.join(data, 'storage'),
      LEARNING_VAULT_KEY: crypto.randomBytes(32).toString('hex'),
      LEARNING_PLATFORM_CALLS_ENABLED: 'false',
      LEARNING_PAYMENT_SANDBOX_ENABLED: 'false',
      ALLOWED_ORIGINS: [
        ...new Set((process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean).concat('tauri://localhost'))
      ].join(',')
    };
    const lines = env
      .split('\n')
      .filter((line) => !Object.keys(additions).some((key) => new RegExp('^\\s*' + key + '\\s*=').test(line)));
    write(
      path.join(config, 'backend.env'),
      lines.join('\n') +
        '\n' +
        Object.entries(additions)
          .map(([key, value]) => key + '=' + JSON.stringify(value))
          .join('\n') +
        '\n'
    );
    fs.mkdirSync(additions.STORAGE_DIR, { mode: 0o700 });
    const isolated = new URL(prior);
    isolated.username = 'candidate';
    isolated.password = testPassword;
    isolated.pathname = '/' + testDb;
    isolated.searchParams.set('authSource', testDb);
    const jwtSecret = crypto.randomBytes(32).toString('hex');
    const log = fs.openSync(path.join(data, 'candidate-private.log'), 'wx', 0o600);
    candidate = spawn(process.execPath, [path.join(release, 'dist/standalone/server.js')], {
      cwd: release,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '3002',
        MONGODB_URI: isolated.toString(),
        DB_NAME: testDb,
        STORAGE_DIR: path.join(data, 'candidate-storage'),
        JWT_SECRET: jwtSecret,
        ALLOWED_ORIGINS: 'tauri://localhost',
        LEARNING_VAULT_KEY: additions.LEARNING_VAULT_KEY,
        LEARNING_ALLOWED_ORIGINS: rehearsalLearningOrigins,
        LEARNING_PLATFORM_CALLS_ENABLED: 'false',
        LEARNING_PAYMENT_SANDBOX_ENABLED: 'false'
      },
      stdio: ['ignore', log, log]
    });
    fs.closeSync(log);
    write(
      path.join(data, 'candidate-process.json'),
      JSON.stringify({ pid: candidate.pid, entry: path.join(release, 'dist/standalone/server.js') })
    );
    await validateCandidate(admin.db(testDb), 'http://127.0.0.1:3002');
    const production = admin.db('exam-master');
    await production.createCollection('users');
    await production.collection('users').createIndex({ email: 1 }, { unique: true, sparse: true });
    const probeId = state.id;
    await production.collection('__wenli_restore_probe').insertOne({ _id: probeId, value: ['private', 20261002] });
    await production.collection('__wenli_restore_probe').createIndex({ value: 1 });
    const dump = run(
      [
        'docker',
        'exec',
        container,
        'mongodump',
        '--config=/run/wenli-secrets/mongo-tools.yaml',
        '--db=exam-master',
        '--archive',
        '--gzip'
      ],
      { encoding: null }
    );
    startMongo(container + '-restore', 27020, path.join(data, 'restore-disposable'));
    restore = await connect(rootUri(27020));
    run(
      [
        'docker',
        'exec',
        '-i',
        container + '-restore',
        'mongorestore',
        '--config=/run/wenli-secrets/mongo-tools.yaml',
        '--archive',
        '--gzip'
      ],
      { encoding: null, input: dump }
    );
    assert.deepEqual(await restore.db('exam-master').collection('__wenli_restore_probe').findOne({ _id: probeId }), {
      _id: probeId,
      value: ['private', 20261002]
    });
    assert.equal((await restore.db('exam-master').collection('__wenli_restore_probe').indexes()).length, 2);
    await restore.close();
    restore = null;
    run(['docker', 'rm', '-f', container + '-restore']);
    fs.rmSync(path.join(data, 'restore-disposable'), { recursive: true });
    await production.collection('__wenli_restore_probe').drop();
    const scoped = await connect(prior.toString());
    try {
      assert.equal(await scoped.db('exam-master').collection('users').countDocuments(), 0);
      await assert.rejects(() => scoped.db('admin').collection('system.users').findOne({}), { code: 13 });
    } finally {
      await scoped.close();
    }
    write(
      path.join(data, 'prepared.json'),
      JSON.stringify({
        transaction: state.id,
        candidateSha,
        release,
        MongoImage: image,
        MongoPort: 27019,
        newPrivateDatabase: true,
        restoredDocumentsAndIndexes: true,
        passwordLogin: true,
        accountIsolation: true,
        syncIdempotency: true,
        publicBankImported: false,
        upstreamModelCalls: 0,
        productionSwitched: false,
        preparedAt: Date.now()
      })
    );
  } finally {
    if (candidate) {
      if (candidate.exitCode === null) candidate.kill('SIGTERM');
      await Promise.race([
        new Promise((resolve) =>
          candidate.exitCode !== null || candidate.signalCode !== null ? resolve() : candidate.once('exit', resolve)
        ),
        new Promise((_, reject) => setTimeout(() => reject(new Error('candidate shutdown timeout')), 10000).unref())
      ]);
      fs.unlinkSync(path.join(data, 'candidate-process.json'));
    }
    if (restore) await restore.close();
    await admin.db(testDb).command({ dropUser: 'candidate' });
    await admin.db(testDb).dropDatabase();
    await admin.close();
  }
}

export async function validateCandidate(db, base, users = [crypto.randomUUID(), crypto.randomUUID()]) {
  const fetchJSON = async (route, body, token) => {
    const response = await fetch(base + route, {
      method: 'POST',
      signal: AbortSignal.timeout(12000),
      headers: {
        'content-type': 'application/json',
        origin: 'tauri://localhost',
        ...(token ? { authorization: 'Bearer ' + token } : {})
      },
      body: JSON.stringify(body)
    });
    assert.equal(response.headers.get('access-control-allow-origin'), 'tauri://localhost');
    return response.json();
  };
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(base + '/health', { signal: AbortSignal.timeout(1000) })).ok) break;
    } catch {
      /* initial process startup */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal((await fetchJSON('/learning-models', { action: 'list' })).code, 401);
  const password = 'Validation-' + crypto.randomBytes(16).toString('hex');
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  const tokens = [];
  for (const id of users) {
    const email = id + '@wenli.invalid';
    await db.collection('users').insertOne({
      _id: id,
      email,
      nickname: '隔离部署验收',
      role: 'user',
      password_hash: `scrypt:${salt}:${derived}`
    });
    const result = await fetchJSON('/login', { type: 'email', email, password });
    assert.equal(result.code, 0);
    assert.ok(result.data.token);
    tokens.push(result.data.token);
  }
  const models = await fetchJSON('/learning-models', { action: 'list' }, tokens[0]);
  assert.equal(models.data.platformEnabled, false);
  assert.equal(models.data.intakeContract, 'model-intake-v1');
  const at = Date.now();
  const operations = candidateOperations(at);
  const first = await fetchJSON('/learning-sync', { action: 'push', operations }, tokens[0]);
  assert.equal(first.success, true);
  assert.equal(first.data.state.attempts.length, 1);
  assert.equal(first.data.state.attempts[0].grade.outcome, 'wrong');
  const repeated = await fetchJSON('/learning-sync', { action: 'push', operations }, tokens[0]);
  assert.equal(repeated.data.state.events.length, operations.length);
  const other = await fetchJSON('/learning-sync', { action: 'pull' }, tokens[1]);
  assert.equal(other.data.state.attempts.length, 0);
  assert.equal(
    (await fetchJSON('/learning-sync', { action: 'push', operations: [operations[3]] }, tokens[1])).success,
    false
  );
  return tokens;
}

export async function validatePublicBackend(candidateSha) {
  assert.match(candidateSha || '', /^[a-f0-9]{64}$/);
  const release = path.join(releases, candidateSha.slice(0, 16));
  const staged = json(path.join(release, '.wenli-stage.json'));
  assert.equal(staged.candidateSha, candidateSha);
  assert.deepEqual(staged.compiledFiles, stageCompiledFiles(release));
  const rows = JSON.parse(run(['pm2', 'jlist'])).filter((row) => row.name === 'yozi-learning');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].pm2_env.status, 'online');
  assert.equal(rows[0].pm2_env.pm_exec_path, path.join(release, 'dist/standalone/server.js'));
  assertStageListener(run(['ss', '-H', '-ltnp', 'sport = :3002']), rows[0].pid);
  const prepared = preparedState();
  const clients = await preparedClients(prepared);
  const ids = [crypto.randomUUID(), crypto.randomUUID()];
  const db = clients.app.db('exam-master');
  try {
    await validateCandidate(db, 'https://api.245334.xyz', ids);
  } finally {
    // Only generated deployment identities are disposable. User records and
    // the real request/cost ledger never enter this selector.
    for (const name of ['learning_states', 'learning_accounts', 'learning_model_keys'])
      await db.collection(name).deleteMany({ user_id: { $in: ids } });
    await db.collection('users').deleteMany({ _id: { $in: ids } });
    await clients.close();
  }
}

async function publicBackupSnapshot(db) {
  const result = [];
  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
    const collection = db.collection(name);
    const docs = await collection.find({}).sort({ _id: 1 }).limit(5001).toArray();
    assert.ok(docs.length <= 5000, 'public backup exceeds bounded verification scope');
    result.push({ name, count: docs.length, content: sha(JSON.stringify(docs)),
      indexes: (await collection.indexes()).map(({ ns, ...index }) => index).sort((a, b) => a.name.localeCompare(b.name)) });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

async function publicBackup(mode) {
  const state = json('/var/lib/vps-config/file-maintenance/state.json');
  assert.match(state.id || '', /^[a-f0-9]{32}$/);
  assert.ok(mode === 'backup-public' ? state.phase === 'quiescing' && state.deadline > Date.now() / 1000
    : ['recovering', 'awaiting-local-restore', 'rolled-back'].includes(state.phase));
  const root = path.join(data, 'public-backup');
  assert.equal(fs.realpathSync(root), root);
  const prepared = preparedState();
  const clients = await preparedClients(prepared);
  const primary = clients.admin.db('exam-master');
  const namespace = 'wenli_public_restore_' + state.id;
  const archiveFile = path.join(root, 'database.archive.gz');
  const reportFile = path.join(root, 'database.json');
  try {
    if (mode === 'recover-public-backup') {
      const report = json(reportFile);
      assert.equal(report.transaction, state.id);
      const bytes = fs.readFileSync(archiveFile);
      assert.equal(sha(bytes), report.sha256);
      // This first activation started from an empty prepared account database.
      // A new real account/learning write blocks destructive rollback.
      for (const name of ['users', 'learning_states', 'learning_accounts', 'learning_model_keys'])
        assert.equal(await primary.collection(name).countDocuments(), 0, 'concurrent user data blocks recovery');
      run(['docker', 'exec', '-i', container, 'mongorestore', '--config=/run/wenli-secrets/mongo-tools.yaml',
        '--archive', '--gzip', '--drop', '--nsInclude=exam-master.*', '--stopOnError'], { encoding: null, input: bytes });
      for (const { name } of await primary.listCollections({}, { nameOnly: true }).toArray())
        if (!report.snapshot.some((row) => row.name === name)) await primary.collection(name).drop();
      assert.deepEqual(await publicBackupSnapshot(primary), report.snapshot);
      return;
    }
    assert.ok(!fs.existsSync(archiveFile) && !fs.existsSync(reportFile));
    const snapshot = await publicBackupSnapshot(primary);
    assert.ok(snapshot.every((row) => row.count === 0), 'first activation requires the verified empty prepared database');
    const bytes = run(['docker', 'exec', container, 'mongodump', '--config=/run/wenli-secrets/mongo-tools.yaml',
      '--db=exam-master', '--archive', '--gzip'], { encoding: null });
    assert.ok(bytes.length > 0 && bytes.length < 32_000_000);
    assert.ok(!(await clients.admin.db('admin').admin().listDatabases()).databases.some((row) => row.name === namespace));
    run(['docker', 'exec', '-i', container, 'mongorestore', '--config=/run/wenli-secrets/mongo-tools.yaml',
      '--archive', '--gzip', '--nsFrom=exam-master.*', '--nsTo=' + namespace + '.*', '--stopOnError'], { encoding: null, input: bytes });
    assert.deepEqual(await publicBackupSnapshot(clients.admin.db(namespace)), snapshot);
    assert.deepEqual(await publicBackupSnapshot(primary), snapshot);
    const fd = fs.openSync(archiveFile, 'wx', 0o600);
    try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    write(reportFile, JSON.stringify({ transaction: state.id, sha256: sha(bytes), snapshot, actualRestoreVerified: true }));
    syncDirectory(root);
  } finally {
    if (mode === 'backup-public') await clients.admin.db(namespace).dropDatabase();
    await clients.close();
  }
}

export function candidateOperations(at) {
  return [
    { id: 'deployment-conversation', type: 'conversation.start', at, data: { goal: '合成计算验收' } },
    {
      id: 'deployment-question',
      type: 'question.add',
      at,
      data: {
        question: {
          id: 'deployment-q',
          version: 1,
          scope: 'generated',
          prompt: '计算 12 + 8。',
          source: { kind: 'executable' },
          validation: { type: 'number', answer: '20', authority: 'executable', evidenceId: 'synthetic-deployment-add' }
        }
      }
    },
    {
      id: 'deployment-focus',
      type: 'question.focus',
      at,
      data: { conversationId: 'deployment-conversation', questionKey: 'deployment-q@1' }
    },
    {
      id: 'deployment-answer',
      type: 'attempt.submit',
      at,
      data: { conversationId: 'deployment-conversation', answer: '19' }
    }
  ];
}

export async function main(mode, candidateSha, backup) {
  if (['backup-public', 'recover-public-backup'].includes(mode)) {
    await publicBackup(mode);
    return;
  }
  if (mode === 'check-public') {
    await validatePublicBackend(candidateSha);
    return;
  }
  if (mode === 'check-prepared') {
    await checkPrepared();
    return;
  }
  if (mode === 'check-candidate') {
    await checkCandidate(candidateSha);
    return;
  }
  if (mode === 'check-identities') {
    await checkIdentities(candidateSha);
    return;
  }
  const state = json('/var/lib/vps-config/file-maintenance/state.json');
  assertLease(state, mode);
  if (mode === 'prepare') await prepare(state, candidateSha);
  else if (mode === 'recover') await recover(state);
  else if (mode === 'verify-backup') await verifyBackup(state, candidateSha, backup);
  else if (mode === 'recover-backup') await recoverBackup(state);
  else if (mode === 'stage-candidate') await stageCandidate(state, candidateSha);
  else if (mode === 'recover-candidate') await recoverCandidate(state, candidateSha);
  else if (mode === 'migrate-identities') await migrateIdentities(state, candidateSha);
  else await recoverIdentities(state, candidateSha);
}

if (
  process.argv[1] === '-' ||
  (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
) {
  main(process.argv[2], process.argv[3]).catch((error) => {
    console.error(safeFailure(error));
    process.exitCode = 1;
  });
}
