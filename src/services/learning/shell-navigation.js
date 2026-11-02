import { storageService } from '@/services/storageService.js';

// Frontend bootstrap only. Muse 2 navigation.ts/useNavigation.ts: validate the
// complete snapshot before replacing it; an invalid refresh keeps current work.
export const NAVIGATION_KEY = 'yozi_shell_navigation_v1';
export const SIDEBAR_KEY = 'yozi_shell_sidebar_v1';
export const LOCATION_KEY = 'learning_shell_location_v1';
// Muse rail order: Chat, Search, Ideas, Goals, Library; Feed stays a hidden slot.
export const SHELL_ROUTES = Object.freeze({
  learning: '/pages/learning/index',
  search: null,
  ideas: '/pages/archive/index?view=ideas',
  plan: '/pages/archive/index?view=plan',
  materials: '/pages/archive/index?view=materials',
  feed: null
});
export const SHELL_MODULES = Object.freeze({
  learning: { label: 'muse.chat', icon: 'chat' },
  search: { label: 'learning.ki6', shortLabel: 'muse.nav.search', icon: 'search' },
  ideas: { label: 'muse.ideas', shortLabel: 'muse.nav.ideas', icon: 'bulb' },
  plan: { label: 'muse.goals', shortLabel: 'muse.nav.plan', icon: 'checkbox-on' },
  materials: { label: 'muse.library', shortLabel: 'muse.nav.materials', icon: 'shapes' },
  feed: {}
});
export const DEFAULT_NAVIGATION = Object.freeze({
  schema: 'yozi.shell.navigation.v1',
  modules: Object.freeze(Object.keys(SHELL_ROUTES).map((id) => Object.freeze({ id, visible: id !== 'feed' })))
});
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
export function parseShellNavigation(value) {
  if (
    !object(value) ||
    value.schema !== DEFAULT_NAVIGATION.schema ||
    !Array.isArray(value.modules) ||
    !value.modules.length
  )
    return null;
  const seen = new Set(),
    modules = [];
  for (const item of value.modules) {
    if (
      !object(item) ||
      typeof item.id !== 'string' ||
      !Object.hasOwn(SHELL_ROUTES, item.id) ||
      seen.has(item.id) ||
      typeof item.visible !== 'boolean' ||
      (item.id === 'feed' && item.visible)
    )
      return null;
    seen.add(item.id);
    modules.push({ id: item.id, visible: item.visible });
  }
  return modules.some((item) => item.visible) ? { schema: value.schema, modules } : null;
}
function read(key) {
  try {
    const value = uni.getStorageSync(key);
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return null;
  }
}
export function shellNavigation() {
  let snapshot = parseShellNavigation(read(NAVIGATION_KEY)) || parseShellNavigation(DEFAULT_NAVIGATION);
  return {
    snapshot: () => parseShellNavigation(snapshot),
    apply(value) {
      const next = parseShellNavigation(value);
      if (!next) return false;
      snapshot = next;
      try {
        uni.setStorageSync(NAVIGATION_KEY, next);
      } catch {
        /* Keep the verified live snapshot. */
      }
      return true;
    }
  };
}
// Original Muse desktop capture: approximately 240px, including its search/options row.
// Existing saved widths and the 180–420 usability clamps remain unchanged.
export const SIDEBAR_DEFAULT = Object.freeze({ version: 1, collapsed: false, width: 240 });
export const clampSidebarWidth = (width) => Math.max(180, Math.min(420, width));
export function validSidebar(value) {
  return (
    object(value) &&
    value.version === 1 &&
    typeof value.collapsed === 'boolean' &&
    Number.isFinite(value.width) &&
    value.width >= 180 &&
    value.width <= 420
  );
}
export function readSidebar() {
  const saved = read(SIDEBAR_KEY);
  return { ...(validSidebar(saved) ? saved : SIDEBAR_DEFAULT) };
}
export function saveSidebar(value) {
  if (!validSidebar(value)) return false;
  try {
    uni.setStorageSync(SIDEBAR_KEY, { version: 1, collapsed: value.collapsed, width: value.width });
    return true;
  } catch {
    return false;
  }
}
export function restoredConversation(location, state, fallback) {
  return location?.version === 1 &&
    (location.conversationId === null || state.conversations.some((item) => item.id === location.conversationId))
    ? location.conversationId
    : fallback;
}
export const visibleReply = (reply) =>
  Boolean(reply && !(reply.cancelled && !reply.content?.trim() && !reply.contentBlocks));

export const cancelledNotice = (error) => (error === '请求已取消，费用状态请查看模型用量' ? error : '');

// WeChat-style rows: only a signed-in learner's saved account photo sits beside their messages.
export const studentAvatar = (owner) =>
  owner && owner !== 'guest' ? storageService.get('userInfo')?.avatarUrl || '' : '';
