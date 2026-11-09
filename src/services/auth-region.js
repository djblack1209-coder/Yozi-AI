import { learningDateTimeFormat } from '../../laf-backend/functions/_shared/learning-date-time.js';
export const US_LOGIN_ENABLED = import.meta.env.VITE_ENABLE_US_LOGIN === 'true';
const KEY = 'yozi_login_region';
export function inferLoginRegion({ region, locale, timeZone } = {}) {
  if (/^(US|CN)$/i.test(region || '')) return region.toUpperCase();
  if (
    [
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/Phoenix',
      'America/Anchorage',
      'Pacific/Honolulu',
      'America/Detroit',
      'America/Indiana/Indianapolis',
      'America/Boise'
    ].includes(timeZone)
  )
    return 'US';
  const country = String(locale || '')
    .split(/[-_]/)[1]
    ?.toUpperCase();
  if (['US', 'CN'].includes(country)) return country;
  return 'CN';
}
export function readLoginRegion(runtime, { enabled = US_LOGIN_ENABLED } = {}) {
  if (!enabled) return 'CN';
  try {
    const saved = runtime ? runtime.getStorageSync(KEY) : uni.getStorageSync(KEY);
    if (['US', 'CN'].includes(saved)) return saved;
  } catch {
    /* infer without writing */
  }
  let info = {},
    timeZone = '';
  try {
    info = (runtime ? runtime.getSystemInfoSync?.() : uni.getSystemInfoSync()) || {};
  } catch {
    /* fallback */
  }
  try {
    timeZone = learningDateTimeFormat().resolvedOptions().timeZone;
  } catch {
    /* fallback */
  }
  return inferLoginRegion({ region: info.region, locale: info.language || globalThis.navigator?.language, timeZone });
}
export function chooseLoginRegion(region, runtime) {
  if (!['US', 'CN'].includes(region)) return false;
  try {
    if (runtime) runtime.setStorageSync(KEY, region);
    else uni.setStorageSync(KEY, region);
    return true;
  } catch {
    return false;
  }
}
