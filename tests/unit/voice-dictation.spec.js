import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, reactive } from 'vue';
import { mount } from '@vue/test-utils';
import { useVoiceDictation } from '@/composables/useVoiceDictation.js';

const native = vi.hoisted(() => ({
  capability: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
  snapshot: vi.fn()
}));
vi.mock('@/services/auth-storage.js', () => ({ readSessionSnapshot: native.snapshot }));
vi.mock('@/config/build-channel.js', () => ({ DEV_TEST: true }));
vi.mock('@/services/desktop/voice.js', () => ({
  voiceCapability: native.capability,
  startVoice: native.start,
  stopVoice: native.stop,
  cancelVoice: native.cancel
}));
let wrappers, callbacks;
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  wrappers = [];
  callbacks = [];
  native.capability.mockResolvedValue({ supported: true, available: true });
  native.snapshot.mockReturnValue({ status: 'anonymous' });
  native.start.mockImplementation((_locale, callback) => {
    callbacks.push(callback);
    return Promise.resolve(`sid-${callbacks.length}`);
  });
  native.stop.mockResolvedValue();
  native.cancel.mockResolvedValue();
});
afterEach(() => {
  wrappers.forEach((wrapper) => wrapper.unmount());
  vi.useRealTimers();
});
async function composer(locale = 'zh-CN') {
  const props = reactive({
    modelValue: 'ABCDEF',
    contextKey: 'account-a:conversation-a',
    voiceLocale: locale,
    disabled: false
  });
  props.getVoiceContext = () => props.contextKey;
  const emit = vi.fn((_event, value) => {
    props.modelValue = value;
  });
  let voice;
  wrappers.push(
    mount(
      defineComponent({
        setup() {
          voice = useVoiceDictation(props, emit, () => 3);
          return () => h('div');
        }
      })
    )
  );
  await nextTick();
  await nextTick();
  return { props, emit, voice };
}
const event = (seq, kind, text, sid = 'sid-1') => ({ sid, seq, kind, text });

describe('听写内存预览和草稿隔离（模拟事件，不是语音验收）', () => {
  it('未选择首批固定语言时不探测、不开始听写', async () => {
    const { voice } = await composer('');
    await voice.start();
    expect(native.capability).not.toHaveBeenCalled();
    expect(native.start).not.toHaveBeenCalled();
    expect(voice.active).toBe(false);
  });
  it('身份状态不可读时立即取消，不采用随后到达的文字', async () => {
    const { props, emit, voice } = await composer();
    await voice.start();
    callbacks[0](event(1, 'partial', '已见文字'));
    native.snapshot.mockReturnValue({ status: 'unavailable' });
    callbacks[0](event(2, 'ended', '迟到文字'));
    expect(props.modelValue).toBe('ABCDEF');
    expect(emit).not.toHaveBeenCalled();
    expect(voice.active).toBe(false);
    expect(native.cancel).toHaveBeenCalledWith('sid-1');
  });
  it('临时文字不写草稿，完成只插入一次且不发送', async () => {
    const { props, emit, voice } = await composer();
    await voice.start();
    callbacks[0](event(1, 'partial', 'wor'));
    expect(voice.transcript).toBe('wor');
    expect(props.modelValue).toBe('ABCDEF');
    expect(emit).not.toHaveBeenCalled();
    callbacks[0](event(2, 'final', 'words'));
    callbacks[0](event(3, 'ended', 'words'));
    callbacks[0](event(3, 'ended', 'words'));
    expect(props.modelValue).toBe('ABC words DEF');
    expect(emit).toHaveBeenCalledExactlyOnceWith('update:modelValue', 'ABC words DEF');
    expect(voice.active).toBe(false);
  });
  it('取消和切换上下文都不还写草稿，迟到结果及开始回执被丢弃', async () => {
    let resolveStart;
    native.start.mockImplementationOnce((_locale, callback) => {
      callbacks.push(callback);
      return new Promise((resolve) => {
        resolveStart = resolve;
      });
    });
    const { props, emit, voice } = await composer();
    const pending = voice.start();
    callbacks[0](event(1, 'partial', '尚未提交'));
    voice.cancel();
    props.contextKey = 'account-b:conversation-b';
    props.modelValue = '另一个草稿';
    callbacks[0](event(2, 'ended', '迟到文字'));
    resolveStart('sid-1');
    await pending;
    expect(props.modelValue).toBe('另一个草稿');
    expect(emit).not.toHaveBeenCalled();
    expect(native.cancel).toHaveBeenCalledWith('sid-1');
    expect(voice.active).toBe(false);
  });
  it('旧完成调用失败不终止新会话；新会话失败保留已见文字并追加到外部新草稿', async () => {
    let resolveStart, rejectStop;
    native.start.mockImplementationOnce((_locale, callback) => {
      callbacks.push(callback);
      return new Promise((resolve) => {
        resolveStart = resolve;
      });
    });
    native.stop.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectStop = reject;
        })
    );
    const { props, emit, voice } = await composer();
    const pending = voice.start();
    voice.stop();
    resolveStart('sid-1');
    await pending;
    voice.cancel();
    props.contextKey = 'account-a:conversation-b';
    await nextTick();
    await nextTick();
    await voice.start();
    callbacks[1](event(1, 'partial', '保留文字', 'sid-2'));
    rejectStop(new Error('old stop failed'));
    await nextTick();
    expect(voice.active).toBe(true);
    props.modelValue = '外部更新';
    callbacks[1]({ ...event(2, 'error', '保留文字', 'sid-2'), reason: 'input_changed' });
    expect(props.modelValue).toBe('外部更新保留文字');
    expect(emit).toHaveBeenCalledExactlyOnceWith('update:modelValue', '外部更新保留文字');
    expect(voice.error).toBe('input_changed');
  });
});

it.runIf(process.platform === 'darwin')(
  'native cancellation retains its receiver through cleanup without opening audio',
  () => {
    const scratch = mkdtempSync(join(tmpdir(), 'yozi-voice-lifecycle-'));
    const binary = join(scratch, 'voice-lifecycle');
    const source = resolve('tests/native/voice-lifecycle.m');
    const env = { PATH: process.env.PATH, NSZombieEnabled: 'YES' };
    if (process.env.DEVELOPER_DIR) env.DEVELOPER_DIR = process.env.DEVELOPER_DIR;
    try {
      execFileSync(
        'xcrun',
        [
          '--sdk',
          'macosx',
          'clang',
          '-O2',
          '-fobjc-arc',
          '-fblocks',
          '-framework',
          'Foundation',
          '-framework',
          'Speech',
          '-framework',
          'AVFoundation',
          source,
          '-o',
          binary
        ],
        { env, encoding: 'utf8', timeout: 20000 }
      );
      const output = execFileSync(binary, [], { env, encoding: 'utf8', timeout: 5000 });
      expect(JSON.parse(output)).toEqual({ checks: 6, audioCapture: false, permissionRequests: false });
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  },
  30000
);
