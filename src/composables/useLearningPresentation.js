import { onBeforeUnmount, reactive, watch } from 'vue';
import { storageService } from '@/services/storageService.js';
import { captureSession, checkSession } from '@/services/auth-storage.js';

export const PRESENTATION_MODES = ['auto', 'interactive', 'text', 'guided'];
const KEY = 'learning_presentation_v1';
const names = { 默认: 'auto', 卡片: 'interactive', 文字: 'text', 分步: 'guided' };

export function presentationCommand(value, { answering = false } = {}) {
  if (typeof value !== 'string') return null;
  const input = value.trim();
  // Only a complete, explicitly namespaced command may interrupt answer entry.
  const explicit = /^显示方式[：:]\s*(默认|卡片|文字|分步)[。！!]?$/u.exec(input);
  if (explicit) return names[explicit[1]];
  if (answering) return null;
  if (/^(?:请)?(?:多用交互卡片|改用卡片展示)[。！!]?$/u.test(input)) return 'interactive';
  if (/^(?:请)?(?:用文字讲解|改用文字展示)[。！!]?$/u.test(input)) return 'text';
  if (/^(?:请)?逐步展示卡片[。！!]?$/u.test(input)) return 'guided';
  if (/^(?:请)?恢复默认展示[。！!]?$/u.test(input)) return 'auto';
  return null;
}

export function useLearningPresentation(getContext) {
  const state = reactive({ mode: 'auto', context: '', available: false });
  let binding = null;
  const context = () => {
    try {
      return getContext();
    } catch {
      return '';
    }
  };
  const refresh = () => {
    state.context = context();
    state.mode = 'auto';
    state.available = false;
    binding = null;
    try {
      const session = captureSession();
      if (checkSession(session) !== 'current' || !state.context) return;
      // Guests have separate binding epochs; authenticated preferences restore per account.
      if (session.owner === 'guest' && !session.epoch) return;
      const key = session.owner === 'guest' ? `${KEY}:${session.epoch}` : KEY;
      const value = storageService.get(key, null, { session, migrateLegacy: false });
      binding = { key, session, context: state.context };
      state.mode = value?.version === 1 && PRESENTATION_MODES.includes(value.mode) ? value.mode : 'auto';
      state.available = true;
    } catch {
      // An unreadable identity must not restore another account's view preference.
    }
  };
  const save = (mode) => {
    if (!PRESENTATION_MODES.includes(mode)) return false;
    if (!binding || binding.context !== context()) refresh();
    const current = binding;
    if (!current || checkSession(current.session) !== 'current' || current.context !== context()) return false;
    try {
      if (!storageService.save(current.key, { version: 1, mode }, true, current.session)) return false;
      if (checkSession(current.session) !== 'current' || current.context !== context()) {
        refresh();
        return false;
      }
      state.mode = mode;
      return true;
    } catch {
      return false;
    }
  };
  const command = (value, options) => {
    const mode = presentationCommand(value, options);
    return mode === null ? null : { mode, success: save(mode) };
  };
  watch(context, refresh, { immediate: true, flush: 'sync' });
  const release = storageService.onIdentityChange(refresh);
  onBeforeUnmount(release);
  return Object.assign(state, { save, command });
}
