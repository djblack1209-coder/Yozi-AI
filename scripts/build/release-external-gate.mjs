#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');
const DEFAULT_OUTPUT = path.join(PROJECT_ROOT, 'data/release-external-audit.json');
const DEFAULT_MP_DIR = path.join(PROJECT_ROOT, 'dist/build/mp-weixin');
const DEFAULT_WECHAT_EVIDENCE = path.join(PROJECT_ROOT, 'data/release-evidence/wechat-device-smoke.md');
const DEFAULT_BACKUP_EVIDENCE = path.join(PROJECT_ROOT, 'data/release-evidence/backup-restore-drill.md');
const DEFAULT_MONITORING_EVIDENCE = path.join(PROJECT_ROOT, 'data/release-evidence/monitoring-health-alert.md');
const DEFAULT_LINK_REGISTRY = path.join(PROJECT_ROOT, 'data/link-registry.json');
const DEFAULT_SOURCE_MANIFEST = path.join(PROJECT_ROOT, 'data/source-manifest.json');
const DEFAULT_SAFETY_TESTS_DIR = path.join(PROJECT_ROOT, 'tests/unit');
const DEFAULT_ENV_FILES = [
  path.join(PROJECT_ROOT, '.env'),
  path.join(PROJECT_ROOT, '.env.production'),
  path.join(PROJECT_ROOT, 'laf-backend/.env')
];

const PHASE4_SAFETY_EVIDENCE = [
  {
    id: 'account_deletion_auth_guard',
    file: 'account-deletion-api-auth-guard.spec.js',
    label: 'Account deletion API auth guard',
    requiredSnippets: [
      'blocks account deletion actions when no auth credential is present',
      'request).not.toHaveBeenCalled()',
      'code: 401',
      'accepts restored user id credentials as a login signal before backend verification'
    ]
  },
  {
    id: 'account_purge_header_guard',
    file: 'audit-account-purge-field-mapping.spec.js',
    label: 'Account purge administrator header guard',
    requiredSnippets: [
      '仅 body.adminToken 时应拒绝',
      "'x-admin-token': 'admin_secret'",
      'expect(result.code).toBe(403)',
      '定时触发上下文不应被误判为 HTTP 请求'
    ]
  },
  {
    id: 'settings_legal_scope_guard',
    file: 'settings-legal-scope-guard.spec.js',
    label: 'Settings legal/privacy scope guard',
    requiredSnippets: [
      "goTo('/pages/settings/privacy')",
      "goTo('/pages/settings/terms')",
      '在 App 设置中申请注销',
      '7天冷静期'
    ]
  },
  {
    id: 'storage_sensitive_cleanup_guard',
    file: 'storage-service.spec.js',
    label: 'Sensitive storage cleanup guard',
    requiredSnippets: [
      'clear 默认保留全局键，仅清理业务缓存，并迁移明文敏感键',
      'expect(global.__mockStorage.EXAM_TOKEN).toBeUndefined()',
      'expect(global.__mockStorage._enc_EXAM_TOKEN).toBeTruthy()',
      'clear 可显式关闭保留策略并执行全清'
    ]
  }
];

function parseArgs(argv) {
  const options = {
    output: DEFAULT_OUTPUT,
    mpDir: DEFAULT_MP_DIR,
    wechatEvidence: DEFAULT_WECHAT_EVIDENCE,
    backupEvidence: DEFAULT_BACKUP_EVIDENCE,
    monitoringEvidence: DEFAULT_MONITORING_EVIDENCE,
    linkRegistry: DEFAULT_LINK_REGISTRY,
    sourceManifest: DEFAULT_SOURCE_MANIFEST,
    safetyTestsDir: DEFAULT_SAFETY_TESTS_DIR,
    envFiles: [...DEFAULT_ENV_FILES],
    useEnvFiles: true,
    failOnBlockers: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [key, inlineValue] = arg.split('=');
    const nextValue = inlineValue ?? argv[index + 1];

    if (key === '--output') {
      options.output = path.resolve(nextValue);
      if (inlineValue === undefined) index += 1;
    } else if (key === '--mp-dir') {
      options.mpDir = path.resolve(nextValue);
      if (inlineValue === undefined) index += 1;
    } else if (key === '--wechat-evidence') {
      options.wechatEvidence = path.resolve(nextValue);
      if (inlineValue === undefined) index += 1;
    } else if (key === '--backup-evidence') {
      options.backupEvidence = path.resolve(nextValue);
      if (inlineValue === undefined) index += 1;
    } else if (key === '--monitoring-evidence') {
      options.monitoringEvidence = path.resolve(nextValue);
      if (inlineValue === undefined) index += 1;
    } else if (key === '--link-registry') {
      options.linkRegistry = path.resolve(nextValue);
      if (inlineValue === undefined) index += 1;
    } else if (key === '--source-manifest') {
      options.sourceManifest = path.resolve(nextValue);
      if (inlineValue === undefined) index += 1;
    } else if (key === '--safety-tests-dir') {
      options.safetyTestsDir = path.resolve(nextValue);
      if (inlineValue === undefined) index += 1;
    } else if (key === '--env-file') {
      options.envFiles.push(path.resolve(nextValue));
      options.useEnvFiles = true;
      if (inlineValue === undefined) index += 1;
    } else if (arg === '--no-env-files') {
      options.envFiles = [];
      options.useEnvFiles = false;
    } else if (arg === '--fail-on-blockers') {
      options.failOnBlockers = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  return options;
}

function stripInlineComment(value) {
  let quote = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const previous = value[index - 1];
    if ((char === '"' || char === "'") && previous !== '\\') {
      quote = quote === char ? '' : quote || char;
    }
    if (char === '#' && !quote && /\s/.test(previous || ' ')) {
      return value.slice(0, index).trim();
    }
  }
  return value.trim();
}

function normalizeEnvValue(rawValue) {
  let value = stripInlineComment(String(rawValue || '').trim());
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
    value = value.slice(1, -1);
  }
  if (quote === '"') {
    value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\"/g, '"');
  }
  return value;
}

function parseEnvFile(filePath) {
  if (!existsFile(filePath)) return {};

  const result = {};
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    result[match[1]] = normalizeEnvValue(match[2]);
  }
  return result;
}

function loadEnvFiles(filePaths) {
  return filePaths.reduce((merged, filePath) => ({ ...merged, ...parseEnvFile(filePath) }), {});
}

function mergeReleaseEnv(options, env) {
  if (!options.useEnvFiles) return { ...env };
  return {
    ...loadEnvFiles(options.envFiles),
    ...env
  };
}

function valueFor(env, key) {
  return String(env[key] || '').trim();
}

function isPlaceholder(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return true;
  return (
    /^your[_-]/i.test(normalized) ||
    /^CHANGE_ME/i.test(normalized) ||
    /your-.+-here/i.test(normalized) ||
    /example\.com/i.test(normalized) ||
    normalized === 'your-domain.com'
  );
}

function requireEnv(env, key, blockers, options = {}) {
  const value = valueFor(env, key);
  if (isPlaceholder(value)) {
    blockers.push({
      code: `missing_env:${key}`,
      message: `${key} is missing or still uses a placeholder`
    });
    return false;
  }

  if (options.minLength && value.length < options.minLength) {
    blockers.push({
      code: `weak_env:${key}`,
      message: `${key} must be at least ${options.minLength} characters`
    });
    return false;
  }

  return true;
}

function existsFile(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function existsDir(dirPath) {
  return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
}

function requireFile(filePath, blockers, code, message) {
  if (!existsFile(filePath)) {
    blockers.push({
      code,
      message,
      path: path.relative(PROJECT_ROOT, filePath)
    });
    return false;
  }
  return true;
}

function evidenceLineValue(content, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^-\\s*${escapedLabel}:\\s*(.+)$`, 'im').exec(content);
  return String(match?.[1] || '').trim();
}

function isIncompleteEvidenceValue(value) {
  if (!value) return true;
  return /\b(TODO|TBD|PENDING|pending|not verified|未验证|待补|待定)\b/i.test(value);
}

function requirePassedEvidence(filePath, blockers, code, message, requiredLabels = []) {
  if (!requireFile(filePath, blockers, `missing_${code}`, message)) return false;

  const content = fs.readFileSync(filePath, 'utf8');
  const hasPassedStatus = /^Status:\s*passed\s*$/im.test(content);
  const hasTemplateMarker = /\b(TODO|TBD|PENDING|Status:\s*pending)\b/i.test(content);

  if (!hasPassedStatus || hasTemplateMarker) {
    blockers.push({
      code: `${code}_not_passed`,
      message: `${message}; evidence file must contain "Status: passed" and no pending placeholders`,
      path: path.relative(PROJECT_ROOT, filePath)
    });
    return false;
  }

  const missingLabels = requiredLabels.filter((label) => isIncompleteEvidenceValue(evidenceLineValue(content, label)));
  if (missingLabels.length) {
    blockers.push({
      code: `${code}_incomplete`,
      message: `${message}; missing required evidence fields: ${missingLabels.join(', ')}`,
      path: path.relative(PROJECT_ROOT, filePath)
    });
    return false;
  }

  return true;
}

function buildSection(blockers, details = {}) {
  return {
    status: blockers.length ? 'blocked' : 'passed',
    blockerCount: blockers.length,
    blockers,
    ...details
  };
}

function checkProductionConfig(env) {
  const blockers = [];

  requireEnv(env, 'VITE_WX_APP_ID', blockers);
  requireEnv(env, 'VITE_API_BASE_URL', blockers);
  requireEnv(env, 'JWT_SECRET', blockers, { minLength: 48 });
  if (requireEnv(env, 'LEARNING_VAULT_KEY', blockers)) {
    // 与 learning-account 的 AES-256-GCM 保险库格式保持一致，报告只写字段名。
    if (!/^[a-f0-9]{64}$/i.test(valueFor(env, 'LEARNING_VAULT_KEY'))) {
      blockers.push({
        code: 'invalid_model_vault_key',
        message: 'LEARNING_VAULT_KEY must contain exactly 64 hexadecimal characters'
      });
    }
  }
  requireEnv(env, 'PASSWORD_SALT', blockers, { minLength: 24 });
  requireEnv(env, 'REQUEST_SIGN_SALT', blockers, { minLength: 24 });
  requireEnv(env, 'ADMIN_SECRET', blockers, { minLength: 8 });
  requireEnv(env, 'SMTP_HOST', blockers);
  requireEnv(env, 'SMTP_PORT', blockers);
  requireEnv(env, 'SMTP_USER', blockers);
  requireEnv(env, 'SMTP_PASS', blockers);

  const hasAiProvider = [
    'ZHIPU_API_KEY',
    'SILICONFLOW_API_KEY_1',
    'SILICONFLOW_DS_KEY_1',
    'OPENAI_API_KEY',
    'LLM_API_KEY'
  ].some((key) => !isPlaceholder(valueFor(env, key)));

  if (!hasAiProvider) {
    blockers.push({
      code: 'missing_ai_provider',
      message: 'At least one backend AI provider key must be configured for production AI features'
    });
  }

  return buildSection(blockers);
}

function checkAuthSmoke(env) {
  const blockers = [];
  const hasBaseUrl = ['SMOKE_BASE_URL', 'LAF_API_URL', 'VITE_API_BASE_URL'].some(
    (key) => !isPlaceholder(valueFor(env, key))
  );
  const hasDirectToken = ['SMOKE_TOKEN', 'SMOKE_JWT'].some((key) => !isPlaceholder(valueFor(env, key)));
  const hasEmailPassword =
    !isPlaceholder(valueFor(env, 'SMOKE_EMAIL')) && !isPlaceholder(valueFor(env, 'SMOKE_PASSWORD'));

  if (!hasBaseUrl) {
    blockers.push({
      code: 'missing_smoke_base_url',
      message: 'Set SMOKE_BASE_URL, LAF_API_URL, or VITE_API_BASE_URL before release smoke'
    });
  }

  if (!hasDirectToken && !hasEmailPassword) {
    blockers.push({
      code: 'missing_auth_smoke_credentials',
      message: 'Set SMOKE_EMAIL + SMOKE_PASSWORD, or SMOKE_TOKEN/SMOKE_JWT'
    });
  }

  return buildSection(blockers);
}

function validateLinkRegistry(payload) {
  const links = Array.isArray(payload?.links) ? payload.links : [];
  const validLinks = links.filter((link) => {
    const url = String(link?.url || '').trim();
    if (!url) return false;
    if (/example|1example|pan\.baidu\.com\/s\/1example/i.test(url)) return false;
    return /^https:\/\/pan\.baidu\.com\//i.test(url);
  });

  return {
    linkCount: links.length,
    validLinkCount: validLinks.length,
    ok: validLinks.length > 0
  };
}

function registryFromRaw(raw) {
  if (!raw) return null;
  try {
    return {
      status: 'parsed',
      validation: validateLinkRegistry(JSON.parse(raw))
    };
  } catch {
    return { status: 'invalid_json', validation: { linkCount: 0, validLinkCount: 0, ok: false } };
  }
}

function registryFromEnv(env) {
  return registryFromRaw(valueFor(env, 'BAIDU_LINK_REGISTRY_JSON'));
}

function registryFromFile(filePath) {
  if (!existsFile(filePath)) return null;
  try {
    return {
      status: 'parsed',
      validation: validateLinkRegistry(JSON.parse(fs.readFileSync(filePath, 'utf8')))
    };
  } catch {
    return { status: 'invalid_json', validation: { linkCount: 0, validLinkCount: 0, ok: false } };
  }
}

function validateSourceManifest(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const validSourceChannels = new Set([
    'app_dir',
    'sharelink',
    'group_service',
    'group_file_index',
    'netdisk_full_path'
  ]);
  const validSources = items.filter((item) => {
    if (item?.provider !== 'baidu_pan') return false;
    if (!validSourceChannels.has(String(item?.sourceChannel || ''))) return false;
    if (item?.eligible !== true) return false;
    return !isPlaceholder(item?.remotePath || item?.sourceUrl || item?.fileName);
  });

  return {
    sourceCount: items.length,
    validSourceCount: validSources.length,
    ok: validSources.length > 0
  };
}

function sourceManifestFromFile(filePath) {
  if (!existsFile(filePath)) return null;
  try {
    return {
      status: 'parsed',
      validation: validateSourceManifest(JSON.parse(fs.readFileSync(filePath, 'utf8')))
    };
  } catch {
    return { status: 'invalid_json', validation: { sourceCount: 0, validSourceCount: 0, ok: false } };
  }
}

function checkBaiduSync(env, options) {
  if (env.BAIDU_SYNC_REQUIRED !== 'true') return buildSection([], { required: false, reason: 'retired_pipeline' });
  const blockers = [];

  requireEnv(env, 'BAIDU_ACCESS_TOKEN', blockers);

  const registryEnv = registryFromEnv(env);
  const registryFile = registryFromFile(options.linkRegistry);
  const sourceManifest = sourceManifestFromFile(options.sourceManifest);
  const registry = registryEnv || registryFile;
  const hasRegistry = Boolean(registry);
  const hasValidRegistry = registry?.status === 'parsed' && registry.validation.ok;
  const hasValidSourceManifest = sourceManifest?.status === 'parsed' && sourceManifest.validation.ok;
  const registrySource = hasValidSourceManifest
    ? 'source_manifest'
    : hasValidRegistry
      ? registryEnv
        ? 'env'
        : 'file'
      : registryEnv
        ? 'env'
        : registryFile
          ? 'file'
          : hasValidSourceManifest
            ? 'source_manifest'
            : 'missing';

  if (registry?.status === 'invalid_json') {
    blockers.push({
      code: 'invalid_baidu_registry_json',
      message: `${registrySource === 'env' ? 'BAIDU_LINK_REGISTRY_JSON' : 'data/link-registry.json'} is not valid JSON`
    });
  } else if (sourceManifest?.status === 'invalid_json') {
    blockers.push({
      code: 'invalid_source_manifest_json',
      message: 'data/source-manifest.json is not valid JSON'
    });
  } else if (!hasValidRegistry && hasRegistry) {
    blockers.push({
      code: 'empty_baidu_link_registry',
      message:
        'Baidu sync evidence must contain at least one non-example pan.baidu.com share link, or omit the invalid registry and rely on eligible Source Manifest sync evidence'
    });
  } else if (!hasValidRegistry && !hasValidSourceManifest && !hasRegistry) {
    blockers.push({
      code: 'missing_baidu_link_registry',
      message:
        'Provide BAIDU_LINK_REGISTRY_JSON/data/link-registry.json, or sync eligible Baidu app-directory sources into data/source-manifest.json'
    });
  }

  return buildSection(blockers, {
    registrySource,
    registryLinkCount: registry?.validation.linkCount || 0,
    registryValidLinkCount: registry?.validation.validLinkCount || 0,
    sourceManifestSourceCount: sourceManifest?.validation.sourceCount || 0,
    sourceManifestValidSourceCount: sourceManifest?.validation.validSourceCount || 0
  });
}

function checkWechatDevice(options) {
  const blockers = [];

  if (!existsDir(options.mpDir)) {
    blockers.push({
      code: 'missing_mp_weixin_artifact',
      message: 'Build dist/build/mp-weixin before device validation',
      path: path.relative(PROJECT_ROOT, options.mpDir)
    });
  } else {
    requireFile(path.join(options.mpDir, 'app.json'), blockers, 'missing_mp_app_json', 'mp-weixin app.json is missing');
    requireFile(
      path.join(options.mpDir, 'project.config.json'),
      blockers,
      'missing_mp_project_config',
      'mp-weixin project.config.json is missing'
    );
  }

  requirePassedEvidence(
    options.wechatEvidence,
    blockers,
    'wechat_device_evidence',
    'Archive WeChat DevTools/import/real-device smoke evidence before release',
    [
      'Preview QR archive location',
      'Real device model and WeChat version',
      'App launch succeeded',
      'Login succeeded',
      'Practice center opened',
      'Knowledge map opened',
      'Quiz flow completed',
      'Result page opened'
    ]
  );

  return buildSection(blockers);
}

function checkOpsEvidence(options) {
  const blockers = [];

  requirePassedEvidence(
    options.backupEvidence,
    blockers,
    'backup_restore_evidence',
    'Archive backup/restore drill evidence before release',
    [
      'Environment',
      'Data stores',
      'Object storage buckets',
      'Restore target',
      'Verified record count or checksum',
      'Result'
    ]
  );
  requirePassedEvidence(
    options.monitoringEvidence,
    blockers,
    'monitoring_evidence',
    'Archive health alert/monitoring evidence before release',
    [
      'Alert provider',
      'Alert channel',
      'Alert owner',
      'Synthetic check interval',
      'Latest test alert timestamp',
      'Alert delivery verified',
      'Dashboard URL or internal path'
    ]
  );

  return buildSection(blockers);
}

function checkPhase4Safety(options) {
  const blockers = [];
  const evidence = PHASE4_SAFETY_EVIDENCE.map((item) => {
    const filePath = path.join(options.safetyTestsDir, item.file);
    const relativePath = path.relative(PROJECT_ROOT, filePath);

    if (!existsFile(filePath)) {
      blockers.push({
        code: `missing_safety_evidence:${item.id}`,
        message: `${item.label} test evidence is missing`,
        path: relativePath
      });
      return {
        id: item.id,
        status: 'missing',
        path: relativePath
      };
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const missingSnippets = item.requiredSnippets.filter((snippet) => !content.includes(snippet));

    if (missingSnippets.length) {
      blockers.push({
        code: `incomplete_safety_evidence:${item.id}`,
        message: `${item.label} test evidence is missing required assertions: ${missingSnippets.join(', ')}`,
        path: relativePath
      });
    }

    return {
      id: item.id,
      status: missingSnippets.length ? 'incomplete' : 'present',
      path: relativePath
    };
  });

  return buildSection(blockers, {
    requiredEvidenceCount: PHASE4_SAFETY_EVIDENCE.length,
    presentEvidenceCount: evidence.filter((item) => item.status === 'present').length,
    evidence
  });
}

export function buildExternalReleaseReport(options = {}, env = process.env) {
  const sections = {
    productionConfig: checkProductionConfig(env),
    authSmoke: checkAuthSmoke(env),
    baiduSync: checkBaiduSync(env, options),
    wechatDevice: checkWechatDevice(options),
    opsEvidence: checkOpsEvidence(options),
    phase4Safety: checkPhase4Safety(options)
  };
  const blockerCount = Object.values(sections).reduce((sum, section) => sum + section.blockerCount, 0);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    summary: {
      sectionCount: Object.keys(sections).length,
      blockerCount
    },
    sections,
    releaseReadiness: {
      canPublish: blockerCount === 0,
      blockerCount
    }
  };
}

function printHelp() {
  console.log(`Usage:
  node scripts/build/release-external-gate.mjs [options]

Options:
  --output <path>                JSON report path
  --mp-dir <path>                mp-weixin build output directory
  --wechat-evidence <path>       WeChat real-device smoke evidence markdown
  --backup-evidence <path>       Backup/restore drill evidence markdown
  --monitoring-evidence <path>   Monitoring/alert evidence markdown
  --link-registry <path>         Local Baidu share-link registry
  --source-manifest <path>       Local Source Manifest sync evidence
  --safety-tests-dir <path>      Unit test directory for Phase 4 safety evidence
  --env-file <path>              Additional dotenv file; later files override earlier files
  --no-env-files                 Do not read local .env files; use process env only
  --fail-on-blockers             Exit 2 when external blockers remain
`);
}

export function run(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return 0;
  }

  const releaseEnv = mergeReleaseEnv(options, env);
  const report = buildExternalReleaseReport(options, releaseEnv);
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`);

  console.log(
    `[release-external-gate] canPublish=${report.releaseReadiness.canPublish} ` +
      `blockers=${report.summary.blockerCount} report=${path.relative(PROJECT_ROOT, options.output)}`
  );

  return options.failOnBlockers && !report.releaseReadiness.canPublish ? 2 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = run();
  } catch (error) {
    console.error(`[release-external-gate] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
