import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { readFreeApiCatalog, readFreeApiCredential } from './free-api-catalog.mjs';
import { DEV_TEST } from '../../tmp/yozi-candidate-build/backend/functions/_shared/build-channel.js';
import { freeModelPricing } from '../../tmp/yozi-candidate-build/backend/functions/_shared/ai-providers/free-model-presets.js';
import { FREE_SEED_ORIGINS } from './seed-dev-test-models.mjs';

const database = new URL(process.env.MONGODB_URI || '');
if (
  !DEV_TEST ||
  !['localhost', '127.0.0.1'].includes(database.hostname) ||
  database.pathname !== '/yozi_dev_test' ||
  process.env.PORT !== '4382'
)
  throw new Error('This launcher only runs the existing isolated dev/test backend.');
const enablePlatform = process.argv.includes('--enable-free-platform');
process.env.LEARNING_PLATFORM_CALLS_ENABLED = 'false';
process.env.LEARNING_PLATFORM_MODELS = '[]';
if (enablePlatform) {
  const catalog = resolve(homedir(), 'Desktop/Free-llm-API.html');
  const model = {
    id: 'qa-free-platform',
    provider: 'OpenRouter',
    model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    keyEnv: 'YOZI_QA_FREE_MODEL_KEY',
    maxOutput: 2000,
    capabilities: { structured: false, tools: false, vision: false, stream: false }
  };
  const row = readFreeApiCatalog(catalog).find((entry) => entry.id === 'openrouter');
  if (
    !row?.baseMatchesOfficial ||
    row.status !== 'verified' ||
    !row.models.includes(model.model) ||
    !freeModelPricing(model)
  )
    throw new Error('The reviewed exact free model is unavailable; no paid fallback is enabled.');
  if (JSON.parse(process.env.LEARNING_PLATFORM_MODELS || '[]').some((entry) => entry.id !== model.id))
    throw new Error('Existing platform configuration must be preserved; this isolated launcher cannot replace it.');
  process.env.YOZI_QA_FREE_MODEL_KEY = readFreeApiCredential(catalog, row.id, row.baseURL);
  process.env.LEARNING_PLATFORM_MODELS = JSON.stringify([model]);
  process.env.LEARNING_PLATFORM_CALLS_ENABLED = 'true';
}
process.env.LEARNING_FRIEND_TRIAL_ENABLED = 'true';
process.env.LEARNING_USER_DAILY_CALL_LIMIT = '500';
process.env.LEARNING_GLOBAL_DAILY_CALL_LIMIT = '2000';
process.env.LEARNING_GLOBAL_DAILY_BUDGET = '0';
process.env.ALLOWED_ORIGINS = [
  ...new Set([
    ...(process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean),
    'http://127.0.0.1:5173',
    'http://127.0.0.1:42153',
    'tauri://localhost'
  ])
].join(',');
process.env.LEARNING_ALLOWED_ORIGINS = [
  ...new Set([
    ...(process.env.LEARNING_ALLOWED_ORIGINS || '').split(',').filter(Boolean),
    // BYOK free fallback needs the same reviewed providers even while platform models stay disabled.
    ...FREE_SEED_ORIGINS
  ])
].join(',');
// Development paid fallback: DeepSeek answers only when the free channel is rate-limited, out of quota or empty.
// The key stays in the user's 0600 file and is read per call by the backend; it never enters this environment.
const paidFallbackFile = resolve(homedir(), '.config/deepseek-lazy-yozi.env');
if (!process.env.YOZI_DEV_PAID_FALLBACK_FILE && existsSync(paidFallbackFile))
  process.env.YOZI_DEV_PAID_FALLBACK_FILE = paidFallbackFile;
// The existing authorized reference can also be explicitly selected as BYOK in this isolated QA account.
if (process.env.YOZI_DEV_PAID_FALLBACK_FILE)
  process.env.LEARNING_ALLOWED_ORIGINS = [
    ...new Set([...(process.env.LEARNING_ALLOWED_ORIGINS || '').split(',').filter(Boolean), 'https://api.deepseek.com'])
  ].join(',');
console.info(
  enablePlatform ? '[qa] Explicit free platform mode enabled.' : '[qa] BYOK default; platform calls disabled.'
);
console.info(`[qa] Dev paid fallback ${process.env.YOZI_DEV_PAID_FALLBACK_FILE ? 'armed (DeepSeek)' : 'off'}.`);
console.info('[qa] Runtime ownership', JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
await import('../../tmp/yozi-candidate-build/backend/standalone/server.js');
