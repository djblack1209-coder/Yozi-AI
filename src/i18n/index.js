import { ref, readonly, shallowReactive } from 'vue';
import shell, { PAGE_TITLE_KEYS, ARCHIVE_TITLE_KEYS } from './messages/shell.js';
import settings from './messages/settings.js';
import components from './messages/components.js';
import learningShell from './messages/learning-shell.js';

export const LANGUAGE_KEY = 'yozi_language';
export const LANGUAGE_OPTIONS = Object.freeze([
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' }
]);
const language = ref('zh-CN');
export const currentLanguage = readonly(language);
const messages = {
  'zh-CN': { ...shell['zh-CN'], ...settings['zh-CN'], ...components['zh-CN'], ...learningShell['zh-CN'] },
  en: { ...shell.en, ...settings.en, ...components.en, ...learningShell.en }
};
const registered = shallowReactive(new Map());
function labelIndex(entries) {
  const labels = new Map(Object.entries(entries).map(([key, value]) => [value.trim(), key]));
  const patterns = Object.entries(entries)
    .filter(([, value]) => /\{v\d+\}/.test(value))
    .map(([key, value]) => {
      const names = [...value.matchAll(/\{(v\d+)\}/g)].map((match) => match[1]);
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{v\d+\\\}/g, '([\\s\\S]*?)');
      return { key, names, regex: new RegExp(`^${escaped}$`) };
    });
  return { labels, patterns };
}
const shellLabels = labelIndex(learningShell['zh-CN']);
const publicMessageLabels = [labelIndex(messages['zh-CN']), labelIndex(messages.en)];

// Feature dictionaries are imported and registered by their subpackage entry.
// Equal registrations leave the reactive registry untouched.
export function registerMessages(namespace, locales) {
  if (typeof namespace !== 'string' || !/^[a-zA-Z][\w-]*$/.test(namespace) || !locales || typeof locales !== 'object')
    return false;
  const next = { 'zh-CN': Object.create(null), en: Object.create(null) };
  for (const locale of ['zh-CN', 'en']) {
    const entries = locales[locale] || {};
    if (typeof entries !== 'object' || Array.isArray(entries)) return false;
    for (const [key, value] of Object.entries(entries)) {
      if (!key || typeof value !== 'string') return false;
      next[locale][key.startsWith(`${namespace}.`) ? key : `${namespace}.${key}`] = value;
    }
  }
  const previous = registered.get(namespace)?.messages;
  if (
    previous &&
    ['zh-CN', 'en'].every(
      (locale) =>
        Object.keys(previous[locale]).length === Object.keys(next[locale]).length &&
        Object.entries(next[locale]).every(([key, value]) => previous[locale][key] === value)
    )
  )
    return true;
  registered.set(namespace, { messages: next, ...labelIndex(next['zh-CN']), english: labelIndex(next.en) });
  return true;
}

// Only known interface labels are adapted. Questions and user content stay raw.
export function translateRegisteredText(namespace, value) {
  if (typeof value !== 'string' || !value) return value;
  for (const index of [registered.get(namespace), shellLabels]) {
    if (!index) continue;
    const key = index.labels.get(value.trim());
    if (key) return t(key);
    for (const pattern of index.patterns) {
      const match = pattern.regex.exec(value);
      if (match) return t(pattern.key, Object.fromEntries(pattern.names.map((name, i) => [name, match[i + 1]])));
    }
  }
  return value;
}
// Errors may contain provider responses, field names or stack traces. Only
// registered product messages may cross this UI boundary.
export function publicError(error, fallback = t('ui.operationFailed')) {
  const codeKey = Object.assign(Object.create(null), {
    CANCELLED: 'ui.cancelled',
    STORAGE_FAILED: 'ui.storageBusy',
    DIALOG_BUSY: 'ui.dialogBusy',
    DELETE_FAILED: 'ui.deleteUnconfirmed',
    DELETE_INCOMPLETE: 'ui.contentDeleteUnconfirmed',
    AUTH_REQUIRED: 'ui.signInRequired',
    UNAUTHORIZED: 'ui.signInRequired',
    CONTEXT_CHANGED: 'ui.contextChanged',
    USER_PREFERENCE: 'ui.methodLocked',
    FORBIDDEN: 'ui.actionForbidden',
    SSRF_BLOCKED: 'ui.modelAddressBlocked',
    401: 'ui.signInRequired',
    429: 'ui.rateLimited'
  })[error?.code];
  if (codeKey) return t(codeKey);
  const value = typeof error === 'string' ? error : error?.message;
  if (typeof value !== 'string' || !value.trim()) return fallback;
  if (
    /(?:https?|file):\/\/|\b(?:[A-Z][A-Z0-9]*_)+[A-Z0-9]+\b|(?:Type|Reference|Syntax|Range)Error|\b(?:stack|traceback|requestId|errorCode)\b|\n\s*at\s/i.test(
      value
    )
  )
    return fallback;
  const knownKey = Object.assign(Object.create(null), {
    '请先完成当前弹窗，稍后重试。': 'ui.dialogBusy',
    '本机暂不可写，请稍后重试': 'ui.storageBusy',
    '本机暂不可写，请保留原文后重试': 'ui.originalStorageBusy',
    '复习安排更新未确认，请核对当前记录': 'ui.reviewUnconfirmed',
    '服务连接不可用，学习记录已保存': 'ui.serviceUnavailable',
    '云端记录已更新，请重新同步预览；本机与冲突副本保留': 'ui.syncPreviewChanged',
    '已有另一份冲突副本；请先导出并明确移除该副本，再重新同步': 'ui.syncArchiveExists',
    '本机与云端记录存在差异，两份副本已保留；请在下方查看并选择要继续的记录。': 'ui.syncConflictRetained',
    '学习服务尚不支持保留考试范围，请先更新服务；本机记录保留': 'ui.syncScopeUpgradeRequired',
    '这份旧备份缺少当时确认的考试范围，请使用完整记录或重新导出；当前记录保留': 'ui.backupScopeSnapshotRequired',
    '登录后可连接云模型；本地学习无需登录': 'ui.signInRequired',
    '学习天数必须在 1 到 365 之间': 'ui.invalidDuration',
    计划周期须为1至365天: 'ui.invalidPlanDuration',
    '请求已取消，费用状态请查看模型用量': 'ui.modelCancelled',
    另一窗口正在保存学习记录: 'ui.storageBusy',
    '答案、作答或批注区域不能自动用作独立校验资料': 'ui.materialAnswerRegion',
    '每个非空行都须是完整的“字段：值”；请先核对标题、说明或缺失内容，不会忽略原文行': 'ui.materialFormat',
    '当前资料分析仅支持九位以内整数，不猜单位或舍入': 'ui.materialInteger',
    '请选择九位以内整数或最多六位小数的纯数值字段，不猜单位、分组符号或舍入': 'ui.materialNumber',
    增长率需要正基期和非负现期: 'ui.materialGrowth',
    '占比需要正的整体和非负的部分，部分不能大于整体': 'ui.materialShare',
    '精确运算超出范围，请选较小的纯数值字段；不会改用近似判分': 'ui.materialRange'
  })[value.trim()];
  if (knownKey) return t(knownKey);
  for (const index of [
    ...publicMessageLabels,
    ...[...registered.values()].flatMap((entry) => [entry, entry.english])
  ]) {
    const key = index.labels.get(value.trim());
    if (key) return t(key);
    for (const pattern of index.patterns) {
      const match = pattern.regex.exec(value);
      if (match && match.slice(1).every((part) => /^[-+\d\s.,%/]+$/.test(part)))
        return t(pattern.key, Object.fromEntries(pattern.names.map((name, i) => [name, match[i + 1]])));
    }
  }
  return fallback;
}

let listening = false;

export function normalizeLanguage(value) {
  if (typeof value !== 'string') return null;
  const tag = value.trim().replace(/_/g, '-').toLowerCase();
  if (/^en(?:-|$)/.test(tag)) return 'en';
  if (/^zh(?:-|$)/.test(tag)) return 'zh-CN';
  return null;
}

export function resolveLanguage(saved, system) {
  return normalizeLanguage(saved) || normalizeLanguage(system) || 'zh-CN';
}

export function t(key, params = {}) {
  const feature = registered.get(String(key).split('.')[0])?.messages;
  const text =
    feature?.[language.value]?.[key] ??
    messages[language.value][key] ??
    feature?.['zh-CN']?.[key] ??
    messages['zh-CN'][key] ??
    key;
  return String(text).replace(/\{([\w]+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  );
}

export function syncNavigationTitle() {
  if (typeof getCurrentPages !== 'function' || typeof uni === 'undefined') return;
  let pages;
  try {
    pages = getCurrentPages();
  } catch {
    return;
  }
  const page = pages?.[pages.length - 1];
  const route = (page?.route || page?.__route__ || '').replace(/^\//, '');
  const view = (page?.options || page?.$page?.options)?.view || 'all';
  const key =
    route === 'pages/archive/index' && Object.hasOwn(ARCHIVE_TITLE_KEYS, view)
      ? ARCHIVE_TITLE_KEYS[view]
      : PAGE_TITLE_KEYS[route];
  if (key) {
    try {
      uni.setNavigationBarTitle?.({ title: t(key) })?.catch?.(() => undefined);
    } catch {
      /* 页面尚未准备好时由 onShow 重试。 */
    }
  }
}

function applyLanguage(value) {
  language.value = value;
  // uni 内置简体中文标识为 zh-Hans；产品对外标识为 zh-CN。
  if (typeof uni !== 'undefined') uni.setLocale?.(value === 'en' ? 'en' : 'zh-Hans');
  // #ifdef H5
  if (typeof document !== 'undefined') document.documentElement.lang = value;
  // #endif
  syncNavigationTitle();
}

export function setLanguage(value) {
  const normalized = normalizeLanguage(value);
  if (!normalized) return false;
  try {
    uni.setStorageSync(LANGUAGE_KEY, normalized);
  } catch {
    return false;
  }
  applyLanguage(normalized);
  return true;
}

export function initI18n() {
  let saved;
  try {
    saved = uni.getStorageSync(LANGUAGE_KEY);
  } catch {
    return false; // Keep the current language; App retries after storage recovers.
  }
  // 中文为主：不跟随系统语言，只有用户明确选择 English 才切换。
  applyLanguage(resolveLanguage(saved));
  if (!listening && typeof uni !== 'undefined' && typeof uni.onLocaleChange === 'function') {
    uni.onLocaleChange(({ locale }) => {
      const normalized = normalizeLanguage(locale);
      if (normalized && normalized !== language.value) applyLanguage(normalized);
    });
    listening = true;
  }
  return language.value;
}

export function installI18n(app) {
  app.config.globalProperties.$t = t;
  app.mixin({
    onShow() {
      syncNavigationTitle();
    }
  });
}
