import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
import { isDesktopRuntime } from '../../src/services/desktop/runtime.js';
import {
  saveDesktopLearningFile,
  shareDesktopLearningPoster,
  readDesktopLearningBackup,
  chooseDesktopMaterialFile,
  readDesktopMaterialFile
} from '../../src/services/desktop/learning-files.js';

beforeEach(() => {
  invoke.mockReset();
  vi.stubGlobal('__YOZI_DESKTOP__', true);
  vi.stubGlobal('window', { __TAURI_INTERNALS__: { invoke: () => undefined } });
});

describe('desktop material consent and lifecycle', () => {
  it('native commands are registered only for the packaged main window', () => {
    const read = (relative) => readFileSync(new NodeURL(`../../${relative}`, import.meta.url), 'utf8');
    const capability = JSON.parse(read('src-tauri/capabilities/learning-desktop.json'));
    const manifest = read('src-tauri/build.rs');
    const handler = read('src-tauri/src/main.rs').split('.invoke_handler(tauri::generate_handler![')[1].split('])')[0];
    const commands = [...read('src/services/desktop/learning-files.js').matchAll(/invoke\('([a-z_]+)'/g)].map(
      (m) => m[1]
    );
    expect(commands).toContain('read_learning_material');
    for (const command of commands) {
      expect(manifest).toContain(`"${command}"`);
      expect(handler).toContain(command);
      expect(capability.permissions).toContain(`allow-${command.replaceAll('_', '-')}`);
    }
    expect(capability.local).toBe(true);
    expect(capability.windows).toEqual(['main']);
    expect(capability.remote).toBeUndefined();
    expect(capability.permissions.some((permission) => /^(fs|shell|http):/.test(permission))).toBe(false);
  });
  const file = { id: '01234567-0123-4567-89ab-0123456789ab', name: 'original.png', size: 4 };
  it('selects metadata without reading a body or returning a native path', async () => {
    invoke.mockResolvedValueOnce({ ...file, path: '/private/not-exposed.png' });
    expect(await chooseDesktopMaterialFile()).toEqual(file);
    expect(invoke.mock.calls.map(([name]) => name)).toEqual(['choose_learning_material']);
  });
  it('cancellation reads nothing', async () => {
    invoke.mockResolvedValueOnce(null);
    expect(await chooseDesktopMaterialFile()).toBeNull();
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  it('keeps cancellation and a late share receipt distinct from a completed current handoff', async () => {
    const content = 'validated PNG fixture';
    invoke.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await expect(shareDesktopLearningPoster(content)).resolves.toBe(false);
    await expect(shareDesktopLearningPoster(content)).resolves.toBe(true);
    let current = true;
    invoke.mockImplementationOnce(async () => {
      current = false;
      return true;
    });
    await expect(shareDesktopLearningPoster(content, { isCurrent: () => current })).rejects.toThrow('账户');
    expect(invoke.mock.calls).toEqual(Array.from({ length: 3 }, () => ['share_learning_poster', { content }]));
  });
  it('releases a late selection after an account or page change', async () => {
    let current = true;
    invoke.mockImplementationOnce(async () => {
      current = false;
      return file;
    });
    await expect(chooseDesktopMaterialFile({ isCurrent: () => current })).rejects.toThrow('账户');
    expect(invoke.mock.calls.map(([name]) => name)).toEqual(['choose_learning_material', 'discard_learning_material']);
  });
  it.each([
    { ...file, name: '../original.png' },
    { ...file, size: 10485761 },
    { ...file, name: 'backup.json' }
  ])('rejects invalid metadata before reading: %j', async (value) => {
    invoke.mockResolvedValueOnce(value);
    await expect(chooseDesktopMaterialFile()).rejects.toThrow('10 MB');
    expect(invoke.mock.calls.map(([name]) => name)).toEqual(['choose_learning_material', 'discard_learning_material']);
  });
  it.each([undefined, false, 'true'])('requires explicit consent, not truthiness: %s', async (consent) => {
    await expect(readDesktopMaterialFile(file, { consent })).rejects.toThrow('确认解析');
    expect(invoke).not.toHaveBeenCalled();
  });
  it('reads only the selected ID and preserves binary bytes after consent', async () => {
    invoke.mockResolvedValueOnce(new Uint8Array([0, 127, 128, 255]).buffer);
    expect(await readDesktopMaterialFile(file, { consent: true })).toEqual({
      name: 'original.png',
      size: 4,
      contentBase64: 'AH+A/w=='
    });
    expect(invoke).toHaveBeenNthCalledWith(1, 'read_learning_material', { selection: file.id, consent: true });
    expect(invoke).toHaveBeenLastCalledWith('discard_learning_material', { selection: file.id });
  });
  it('discards a stale read before returning any body for transmission', async () => {
    let current = true;
    invoke.mockImplementationOnce(async () => {
      current = false;
      return new Uint8Array([0, 127, 128, 255]).buffer;
    });
    await expect(readDesktopMaterialFile(file, { consent: true, isCurrent: () => current })).rejects.toThrow('账户');
    expect(invoke).toHaveBeenLastCalledWith('discard_learning_material', { selection: file.id });
  });
  it.each([new Uint8Array([1, 2]).buffer, 'not-binary', [0, 127, 128, 255]])(
    'fails closed on inconsistent or non-binary receipts',
    async (body) => {
      invoke.mockResolvedValueOnce(body);
      await expect(readDesktopMaterialFile(file, { consent: true })).rejects.toThrow('回执无效');
      expect(invoke).toHaveBeenLastCalledWith('discard_learning_material', { selection: file.id });
    }
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('desktop learning files', () => {
  it('requires both a desktop build and a native runtime', async () => {
    vi.stubGlobal('window', {});
    expect(isDesktopRuntime()).toBe(false);
    await expect(readDesktopLearningBackup()).rejects.toThrow('桌面应用');
    expect(invoke).not.toHaveBeenCalled();
  });
  it('does not write when selection is cancelled', async () => {
    invoke.mockResolvedValueOnce(null);
    expect(await saveDesktopLearningFile('records', '{}')).toEqual({ saved: false });
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  it('discards an opaque selection if the account changes while the picker is open', async () => {
    let current = true;
    invoke.mockImplementation(async (command) => {
      if (command === 'choose_learning_save') {
        current = false;
        return { id: 'opaque', name: 'selected.json' };
      }
    });
    await expect(saveDesktopLearningFile('records', '{}', { isCurrent: () => current })).rejects.toThrow('账户');
    expect(invoke.mock.calls.map(([name]) => name)).toEqual(['choose_learning_save', 'discard_learning_selection']);
  });
  it('uses only the selected token and reports saved after a native write receipt', async () => {
    invoke.mockResolvedValueOnce({ id: 'opaque', name: 'selected.json' }).mockResolvedValue(undefined);
    expect(await saveDesktopLearningFile('records', 'content')).toEqual({ saved: true, name: 'selected.json' });
    expect(invoke).toHaveBeenNthCalledWith(2, 'write_learning_selection', {
      selection: 'opaque',
      kind: 'records',
      content: 'content'
    });
    expect(invoke).toHaveBeenNthCalledWith(3, 'discard_learning_selection', { selection: 'opaque' });
  });
  it('preserves a failed write and cleans the selection without claiming success', async () => {
    invoke
      .mockResolvedValueOnce({ id: 'opaque' })
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValueOnce();
    await expect(saveDesktopLearningFile('records', '{}')).rejects.toThrow('disk full');
    expect(invoke).toHaveBeenLastCalledWith('discard_learning_selection', { selection: 'opaque' });
  });
  it('rejects a stale backup read before any restore data reaches the page', async () => {
    let current = true;
    invoke.mockImplementation(async () => {
      current = false;
      return 'old-owner';
    });
    await expect(readDesktopLearningBackup({ isCurrent: () => current })).rejects.toThrow('账户');
  });
});
