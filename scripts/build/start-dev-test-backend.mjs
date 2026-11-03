import { DEV_TEST } from '../../tmp/yozi-candidate-build/backend/functions/_shared/build-channel.js';

const database = new URL(process.env.MONGODB_URI || '');
if (
  !DEV_TEST ||
  !['localhost', '127.0.0.1'].includes(database.hostname) ||
  database.pathname !== '/yozi_dev_test' ||
  process.env.PORT !== '4382'
)
  throw new Error('This launcher only runs the existing isolated dev/test backend.');
// Owner policy: paid DeepSeek BYOK is primary for remaining development.
if (process.argv.includes('--enable-free-platform'))
  throw new Error('Free-platform development mode was retired by the owner; use configured paid DeepSeek BYOK.');
process.env.LEARNING_PLATFORM_CALLS_ENABLED = 'false';
process.env.LEARNING_PLATFORM_MODELS = '[]';
// Do not silently route a paid-channel error through the old free-to-paid wrapper.
delete process.env.YOZI_DEV_PAID_FALLBACK_FILE;
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
  ...new Set([...(process.env.LEARNING_ALLOWED_ORIGINS || '').split(',').filter(Boolean), 'https://api.deepseek.com'])
].join(',');
console.info('[qa] BYOK default; platform calls disabled.');
console.info('[qa] Paid DeepSeek primary; legacy development fallback off.');
console.info('[qa] Runtime ownership', JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
await import('../../tmp/yozi-candidate-build/backend/standalone/server.js');
