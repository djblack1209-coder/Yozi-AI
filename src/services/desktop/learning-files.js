import { captureSession, assertSession } from '../auth-storage.js';
import { isDesktopRuntime } from './runtime.js';
import { invoke as invokeNative } from '@tauri-apps/api/core';

async function invoke(command, args) {
  if (!isDesktopRuntime()) throw new Error('此操作需要Yozi AI桌面应用');
  return invokeNative(command, args);
}

function assertCurrent(isCurrent, session) {
  assertSession(session);
  if (!isCurrent()) throw new Error('账户或页面已变化，请重新选择文件');
}

// The system picker owns the path. JavaScript receives only a one-use selection ID.
export async function saveDesktopLearningFile(
  kind,
  content,
  { isCurrent = () => true, session = captureSession() } = {}
) {
  assertCurrent(isCurrent, session);
  const selection = await invoke('choose_learning_save', { kind });
  if (!selection) return { saved: false };
  try {
    assertCurrent(isCurrent, session);
    await invoke('write_learning_selection', { selection: selection.id, kind, content });
    assertCurrent(isCurrent, session);
    return { saved: true, name: selection.name };
  } finally {
    await invoke('discard_learning_selection', { selection: selection.id }).catch(() => undefined);
  }
}

export async function readDesktopLearningBackup({ isCurrent = () => true, session = captureSession() } = {}) {
  assertCurrent(isCurrent, session);
  const content = await invoke('read_learning_backup');
  assertCurrent(isCurrent, session);
  return content;
}

export async function shareDesktopLearningPoster(content, { isCurrent = () => true, session = captureSession() } = {}) {
  assertCurrent(isCurrent, session);
  const shared = await invoke('share_learning_poster', { content });
  assertCurrent(isCurrent, session);
  return shared === true;
}

const MATERIAL_MAX_BYTES = 10 * 1024 * 1024;
function materialMetadata(file) {
  if (
    !file ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(file.id) ||
    typeof file.name !== 'string' ||
    [...file.name].length > 200 ||
    !/\.(pdf|png|jpe?g)$/i.test(file.name) ||
    /[/\\\u0000-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069]/.test(file.name) ||
    !Number.isSafeInteger(file.size) ||
    file.size <= 0 ||
    file.size > MATERIAL_MAX_BYTES
  )
    throw new Error('请选择 10 MB 以内的 PDF 或 PNG/JPEG 图片');
  return { id: file.id, name: file.name, size: file.size };
}

export async function discardDesktopMaterialFile(file) {
  if (typeof file?.id === 'string')
    await invoke('discard_learning_material', { selection: file.id }).catch(() => undefined);
}

// Selection exposes metadata only. The native path remains bound to an expiring, one-use ID.
export async function chooseDesktopMaterialFile({ isCurrent = () => true, session = captureSession() } = {}) {
  assertCurrent(isCurrent, session);
  const selected = await invoke('choose_learning_material');
  if (!selected) {
    assertCurrent(isCurrent, session);
    return null;
  }
  try {
    assertCurrent(isCurrent, session);
    return materialMetadata(selected);
  } catch (error) {
    await discardDesktopMaterialFile(selected);
    throw error;
  }
}

export async function readDesktopMaterialFile(
  file,
  { consent = false, isCurrent = () => true, session = captureSession() } = {}
) {
  assertCurrent(isCurrent, session);
  if (consent !== true) throw new Error('请先确认解析资料；所选正文未读取或发送');
  const selected = materialMetadata(file);
  try {
    const body = await invoke('read_learning_material', { selection: selected.id, consent: true });
    assertCurrent(isCurrent, session);
    if (!(body instanceof ArrayBuffer) || body.byteLength !== selected.size || body.byteLength > MATERIAL_MAX_BYTES)
      throw new Error('文件读取回执无效，请重新选择；所选正文未发送');
    const bytes = new Uint8Array(body);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    assertCurrent(isCurrent, session);
    return { name: selected.name, size: selected.size, contentBase64: btoa(binary) };
  } finally {
    await discardDesktopMaterialFile(selected);
  }
}
