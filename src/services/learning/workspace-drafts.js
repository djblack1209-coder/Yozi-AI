// Student drafts stay on this device, outside learning facts, exports and sync.
// Muse 2 chatDraft.ts: replace the touched entry, keep the latest 50, tolerate
// unavailable storage. Only known input fields are persisted, never store state.
const stores = new WeakMap();
const LIMIT = 50;
function copy(value) {
  return JSON.parse(JSON.stringify(value));
}
function inputFields(value) {
  const result = {};
  for (const key of ['draft', 'answer', 'goal', 'text']) if (typeof value?.[key] === 'string') result[key] = value[key];
  if (['study', 'question'].includes(value?.entryMode)) result.entryMode = value.entryMode;
  if (value?.analysis && typeof value.analysis === 'object') {
    const analysis = {};
    for (const key of ['genre', 'recipient', 'purpose', 'points', 'words'])
      if (typeof value.analysis[key] === 'string') analysis[key] = value.analysis[key];
    if (Object.values(analysis).some(Boolean)) result.analysis = analysis;
  }
  if (value?.profile && typeof value.profile === 'object') {
    result.profile = {};
    for (const key of ['subject', 'exam', 'deadline', 'deadlineBucket', 'foundation', 'minutes'])
      if (typeof value.profile[key] === 'string') result.profile[key] = value.profile[key];
    result.profile.subjects = Array.isArray(value.profile.subjects)
      ? value.profile.subjects.filter((subject) => typeof subject === 'string')
      : [];
  }
  if (Number.isInteger(value?.step) && value.step >= 0 && value.step <= 3) result.step = value.step;
  return result;
}
function hasInput(value) {
  return Object.entries(value).some(([key, field]) =>
    key === 'entryMode'
      ? field === 'question'
      : key === 'profile'
        ? Object.values(field).some((item) => (Array.isArray(item) ? item.length : Boolean(item)))
        : Boolean(field)
  );
}
export function workspaceDrafts(store) {
  let cache = stores.get(store);
  if (!cache) {
    cache = { context: undefined, owner: undefined, values: new Map(), dirty: false };
    stores.set(store, cache);
  }
  const owner = () => (typeof store.state?.owner === 'string' ? store.state.owner : '');
  const storageKey = () => `yozi_workspace_drafts_v1:${encodeURIComponent(cache.owner)}`;
  function load(fallback = new Map()) {
    if (!cache.owner) return fallback;
    try {
      const raw = uni.getStorageSync(storageKey());
      if (!raw) return new Map();
      const saved = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (saved.version !== 1 || !Array.isArray(saved.entries)) return new Map();
      return new Map(
        saved.entries
          .filter((entry) => Array.isArray(entry) && typeof entry[0] === 'string')
          .slice(-LIMIT)
          .map(([key, value]) => [key, inputFields(value)])
      );
    } catch {
      return fallback;
    }
  }
  function persist() {
    if (!cache.owner) return;
    try {
      if (cache.values.size) uni.setStorageSync(storageKey(), { version: 1, entries: [...cache.values].slice(-LIMIT) });
      else uni.removeStorageSync(storageKey());
      cache.dirty = false;
    } catch {
      // A quota/permission failure must not discard the current in-memory input.
      cache.dirty = true;
    }
  }
  function scoped(context) {
    if (!context || (store.recordContext && context !== store.recordContext())) return false;
    if (context !== cache.context || owner() !== cache.owner) {
      cache.context = context;
      cache.owner = owner();
      cache.values = load();
      cache.dirty = false;
    }
    return true;
  }
  return {
    read(context, key) {
      return scoped(context) ? copy(cache.values.get(key) || {}) : {};
    },
    remove(context, key) {
      if (!scoped(context)) return;
      if (!cache.dirty) cache.values = load(cache.values);
      cache.values.delete(key);
      persist();
    },
    save(context, key, value) {
      if (!scoped(context) || typeof key !== 'string') return;
      const input = inputFields(value);
      if (!cache.dirty) cache.values = load(cache.values);
      cache.values.delete(key);
      if (hasInput(input)) cache.values.set(key, input);
      cache.values = new Map([...cache.values].slice(-LIMIT));
      persist();
    }
  };
}
