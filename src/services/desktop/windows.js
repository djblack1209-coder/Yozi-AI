import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isDesktopRuntime } from './runtime.js';

export function isDesktopSettingsWindow() {
  if (!isDesktopRuntime()) return false;
  try {
    return getCurrentWindow().label === 'settings';
  } catch {
    return false;
  }
}
let settingsOpening = null;
let settingsReturnFocus = null;
export function rememberSettingsFocus() {
  if (!settingsReturnFocus && typeof document !== 'undefined') settingsReturnFocus = document.activeElement;
}
export function restoreDesktopSettingsFocus() {
  const target = settingsReturnFocus;
  settingsReturnFocus = null;
  if (target?.isConnected) target.focus?.({ preventScroll: true });
}
export function openDesktopSettings(panel) {
  if (!['settings', 'connectors', 'profile', 'legal'].includes(panel)) return Promise.reject(new Error('设置分组不合法'));
  // Sequence different panels; merge duplicate rapid clicks while native creation is pending.
  if (settingsOpening?.panel === panel) return settingsOpening.promise;
  rememberSettingsFocus();
  const previous = settingsOpening?.promise;
  const operation = { panel };
  operation.promise = Promise.resolve(previous)
    .catch(() => undefined)
    .then(() => invoke('open_desktop_settings', { panel }))
    .catch((error) => {
      restoreDesktopSettingsFocus();
      throw error;
    })
    .finally(() => {
      if (settingsOpening === operation) settingsOpening = null;
    });
  settingsOpening = operation;
  return operation.promise;
}
export function closeDesktopSettings() {
  return invoke('close_desktop_settings');
}
export function openDesktopWorkspace(route) {
  return invoke('open_desktop_workspace', { route });
}
// The main window holds the learning write lease. Settings saves the connection,
// then hands off only its model identity; API keys never enter window events.
export function startDesktopModelIntake(modelId, owner) {
  return invoke('open_desktop_workspace', { route: '/pages/learning/index', modelId, owner });
}
export function selectDesktopModel(modelId, owner) {
  return invoke('open_desktop_workspace', { route: '/pages/learning/index', modelId, owner, selectionOnly: true });
}
export async function receiveDesktopModelIntake(intent, { owner, currentRoute, navigate, learning }) {
  if (!intent || intent.owner !== owner()) return null;
  // Reopening the current page runs its onHide hook and cancels model reads.
  // When coming from another page, finish that transition before starting a call.
  if (currentRoute() !== 'pages/learning/index') await navigate();
  if (intent.owner !== owner()) return null;
  learning.refresh();
  if (intent.selectionOnly === true) {
    const catalog = await learning.loadModels();
    if (intent.owner !== owner()) return null;
    if (!catalog.success) return catalog;
    const result = await learning.selectModel(intent.modelId);
    if (intent.owner !== owner()) return null;
    return result?.success === false ? result : { success: true };
  }
  const result = await learning.beginModelIntake(intent.modelId);
  if (intent.owner !== owner()) return null;
  if (result.success) {
    const catalog = await learning.loadModels();
    if (intent.owner !== owner()) return null;
    if (!catalog.success) return catalog;
  }
  if (result.success) {
    learning.modelId = intent.modelId;
    learning.selectedMode = 'cloud';
    learning.streamEnabled = learning.streamSupported === true;
    if (!learning.active?.coach?.profile && !learning.active?.studyProfile) learning.selectedConversationId = null;
  }
  return result;
}
export function completeDesktopModelIntake(id, success) {
  return invoke('complete_desktop_model_intake', { id, success });
}
export function syncDesktopAppearance(dark) {
  if (isDesktopRuntime()) void invoke('set_desktop_appearance', { dark }).catch(() => undefined);
}
export async function bindDesktopWorkspace({ onRoute, onPreferences, onModelIntake }) {
  if (!isDesktopRuntime()) return () => undefined;
  document.documentElement.classList.add('desktop-overlay');
  document.documentElement.classList.toggle('desktop-settings', isDesktopSettingsWindow());
  const { listen } = await import('@tauri-apps/api/event');
  const releases = [];
  if (isDesktopSettingsWindow())
    releases.push(await listen('desktop-settings-panel', (event) => uni.$emit('profilePanel', event.payload)));
  else {
    releases.push(await listen('desktop-workspace-route', (event) => onRoute(event.payload)));
    releases.push(await listen('desktop-model-intake', (event) => onModelIntake?.(event.payload)));
    releases.push(await listen('desktop-settings-closed', restoreDesktopSettingsFocus));
  }
  releases.push(await listen('desktop-preferences-changed', onPreferences));
  window.addEventListener('focus', onPreferences);
  return () => {
    releases.forEach((release) => release());
    window.removeEventListener('focus', onPreferences);
  };
}
