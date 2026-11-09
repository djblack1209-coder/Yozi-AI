import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  avatarBusinessForPose,
  avatarBusinessForLearning,
  createAvatarBehavior,
  AVATAR_DOZE_AFTER,
  AVATAR_SLEEP_AFTER,
  avatarStateFor,
  AVATAR_MEDIA
} from '@/design/avatar-state.js';
import { createAvatarPlayer } from '@/design/avatar-player.js';
import { createOnceIconPlayer, bindIconMotion } from '@/design/icon-motion.js';
import { motionFor } from '@/design/icon-motion-frames.js';
import {
  acquireAvatar,
  paintAvatarFrame,
  paintAvatarBlink,
  avatarBlinkAt,
  avatarPoseAt
} from '@/design/avatar-runtime.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { statSync } from 'node:fs';

describe('transparent avatar frames', () => {
  it('removes the video background while preserving white fur, black detail and edge alpha', () => {
    const packed = createCanvas(6, 1),
      source = packed.getContext('2d');
    source.fillStyle = '#000';
    source.fillRect(0, 0, 6, 1);
    source.fillStyle = '#fff';
    source.fillRect(1, 0, 1, 1);
    source.fillRect(4, 0, 1, 1);
    source.fillStyle = '#808080';
    source.fillRect(5, 0, 1, 1);
    const output = createCanvas(3, 1),
      context = output.getContext('2d');
    paintAvatarFrame(context, packed, 3, 1, true);
    expect([...context.getImageData(0, 0, 3, 1).data]).toEqual([0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 128]);
  });
});

describe('kitten blink at native size', () => {
  it('closes both branded eyes while preserving transparency and pixels outside the eyes', async () => {
    const canvas = createCanvas(112, 112);
    const context = canvas.getContext('2d');
    context.drawImage(await loadImage('src/static/brand/kitten-avatar.png'), 0, 0, 112, 112);
    const before = context.getImageData(0, 0, 112, 112).data.slice();
    paintAvatarBlink(context, 112, 112, 0);
    expect(context.getImageData(0, 0, 112, 112).data).toEqual(before);
    paintAvatarBlink(context, 112, 112, 1);
    const after = context.getImageData(0, 0, 112, 112).data;
    const changed = [0, 0];
    for (let y = 0; y < 112; y++) {
      for (let x = 0; x < 112; x++) {
        const i = (y * 112 + x) * 4;
        expect(after[i + 3]).toBe(before[i + 3]);
        if (before.slice(i, i + 3).some((v, c) => v !== after[i + c])) {
          expect(y).toBeGreaterThan(49);
          expect(y).toBeLessThan(73);
          if (x < 56) changed[0]++;
          else changed[1]++;
        }
      }
    }
    expect(changed[0]).toBeGreaterThan(50);
    expect(changed[1]).toBeGreaterThan(50);
  });
  it('has relaxed closure, longer reopening and quiet intervals independent of the curious lean', () => {
    expect(avatarBlinkAt(0)).toBe(0);
    expect(avatarBlinkAt(1920)).toBeCloseTo(0.5);
    expect(avatarBlinkAt(2070)).toBe(1);
    expect(avatarBlinkAt(2300)).toBeCloseTo(0.5);
    for (const time of [2600, 5200, 10400, 18000]) expect(avatarBlinkAt(time)).toBe(0);
    expect(avatarBlinkAt(13540)).toBe(1);
    expect(avatarBlinkAt(14410)).toBe(1);
    expect(avatarBlinkAt(33070)).toBe(1);
  });
  it('keeps a visible tilt and drift, livelier while busy, and freezes waiting', () => {
    const angle = (time, state) => Number(avatarPoseAt(time, state).match(/rotate\((-?[\d.]+)deg\)/)[1]);
    expect(avatarPoseAt(2600)).toContain('rotate(-7.0000deg)');
    // Between head tilts the kitten still drifts instead of standing still.
    expect(avatarPoseAt(6500)).toContain('rotate(1.4000deg)');
    expect(avatarPoseAt(2600, 'waiting')).toBe('none');
    const turns = (state) => {
      let count = 0;
      for (let time = 100; time < 31000; time += 100)
        if (Math.sign(angle(time, state)) !== Math.sign(angle(time - 100, state))) count++;
      return count;
    };
    expect(turns('working')).toBeGreaterThan(turns('idle'));
    expect(Math.max(...Array.from({ length: 310 }, (_, i) => Math.abs(angle(i * 100))))).toBeGreaterThan(6);
    // The phrase boundary continues without a reset jump.
    expect(Math.abs(angle(30999) - angle(31000))).toBeLessThan(0.01);
  });
});

describe('bundled video transport', () => {
  it('keeps the poster fallback when a canvas context is unavailable, then resumes painting after recovery', async () => {
    const portrait = await loadImage('src/static/brand/kitten-avatar.png');
    Object.defineProperty(portrait, 'src', { set() {} });
    const image = vi.spyOn(window, 'Image').mockImplementation(function () {
      return portrait;
    });
    const runtime = acquireAvatar('lost-canvas-context');
    const canvas = createCanvas(96, 96),
      painted = vi.fn();
    let context = null;
    const view = { width: 96, height: 96, getContext: () => context };
    const releaseView = runtime.addView({ current: () => view, next: () => null, perceptible: () => true, painted });
    try {
      expect(() => runtime.paint()).not.toThrow();
      expect(painted).not.toHaveBeenCalled();
      context = canvas.getContext('2d');
      runtime.paint();
      expect(painted).toHaveBeenCalled();
      expect(context.getImageData(48, 48, 1, 1).data[3]).toBeGreaterThan(0);
    } finally {
      releaseView();
      runtime.release();
      image.mockRestore();
    }
  });
  it('loads a native local video URL without fetch/blob and releases its decoder', async () => {
    const create = document.createElement.bind(document);
    const video = create('video');
    const play = vi.spyOn(video, 'play').mockResolvedValue();
    vi.spyOn(video, 'pause').mockImplementation(() => {});
    vi.spyOn(video, 'load').mockImplementation(() => {
      if (video.getAttribute('src')) queueMicrotask(() => video.dispatchEvent(new Event('loadeddata')));
    });
    const imageReady = vi.spyOn(window.Image.prototype, 'src', 'set').mockImplementation(function () {
      queueMicrotask(() => this.onload?.());
    });
    const createSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag, ...args) => (tag === 'video' ? video : create(tag, ...args)));
    const focus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const media = vi
      .spyOn(window, 'matchMedia')
      .mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const runtime = acquireAvatar('native-url-test');
    const releaseView = runtime.addView({ current: () => null, next: () => null });
    try {
      runtime.activate();
      for (let i = 0; i < 20; i++) await Promise.resolve();
      expect(video.getAttribute('src')).toBe(AVATAR_MEDIA.idle.video);
      expect(video.muted).toBe(true);
      expect(video.playsInline).toBe(true);
      expect(video.isConnected).toBe(true);
      expect(play).toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      releaseView();
      runtime.release();
      expect(video.isConnected).toBe(false);
      expect(video.getAttribute('src')).toBeNull();
      for (const spy of [fetchSpy, media, focus, hidden, createSpy, imageReady]) spy.mockRestore();
      vi.restoreAllMocks();
    }
  });
});

describe('avatar state mapping', () => {
  it('keeps every locally bundled clip and poster within budget', () => {
    for (const item of Object.values(AVATAR_MEDIA)) {
      expect(statSync('public' + item.poster.slice('/public'.length)).size).toBeLessThanOrEqual(40 * 1024);
      if (item.video)
        expect(statSync('public' + item.video.slice('/public'.length)).size).toBeLessThanOrEqual(350 * 1024);
    }
    expect(statSync('src/design/icon-motion-frames.js').size).toBeLessThanOrEqual(12 * 1024);
  });
  it('multiple avatar copies acquire the same controller and media clock', () => {
    const first = acquireAvatar('same-test-mascot'),
      second = acquireAvatar('same-test-mascot');
    expect(first).toBe(second);
    expect(first.player.snapshot().current).toBe(second.player.snapshot().current);
    first.release();
    expect(second.references).toBe(1);
    second.release();
  });
  it.each([
    [{}, 'idle'],
    [{ busy: true }, 'working'],
    [{ busy: true, producing: true }, 'making'],
    [{ producing: true }, 'idle'],
    [{ waiting: true }, 'waiting'],
    [{ stopped: true }, 'stopped'],
    [{ error: true }, 'error'],
    [{ completed: true }, 'celebrate'],
    [{ completed: true, stopped: true }, 'stopped'],
    [{ resuming: true }, 'resume'],
    [{ busy: true, waiting: true }, 'working'],
    [{ completed: true, resuming: true }, 'celebrate']
  ])('%j maps to %s', (input, output) => expect(avatarStateFor(input)).toBe(output));
  it('maps all legacy poses and uses no waiting video', () => {
    for (const [pose, state] of Object.entries({
      idle: 'idle',
      wave: 'resume',
      think: 'working',
      read: 'making',
      celebrate: 'celebrate',
      encourage: 'waiting',
      sleep: 'waiting',
      point: 'waiting',
      curious: 'resume'
    })) {
      expect(avatarStateFor(avatarBusinessForPose(pose))).toBe(state);
    }
    expect(AVATAR_MEDIA.waiting.video).toBeNull();
    expect(AVATAR_MEDIA.celebrate.loop).toBe(false);
  });
  it('uses saved completion and resume facts, not arbitrary message text', () => {
    expect(avatarStateFor(avatarBusinessForLearning({ busy: true, streamPreview: 'saved stream' }))).toBe('making');
    expect(avatarStateFor(avatarBusinessForLearning({ activeQuestion: {} }))).toBe('waiting');
    expect(avatarStateFor(avatarBusinessForLearning({ active: { stopped: true } }))).toBe('stopped');
    expect(avatarStateFor(avatarBusinessForLearning({}, { id: 'done-1', type: 'coach.finish' }))).toBe('celebrate');
    expect(avatarStateFor(avatarBusinessForLearning({}, { id: 'resume-1', type: 'task.resume' }))).toBe('resume');
    expect(avatarStateFor(avatarBusinessForLearning({}))).toBe('idle');
    expect(avatarStateFor(avatarBusinessForLearning({ coachError: 'request failed' }))).toBe('error');
  });
});

describe('shared avatar layer controller', () => {
  let player, load;
  beforeEach(() => {
    vi.useFakeTimers();
    load = vi.fn(async (state, options) => ({
      id: state,
      poster: state,
      canAnimate: false,
      video: options.video ? { play: vi.fn(async () => {}), pause: vi.fn() } : null,
      dispose: vi.fn()
    }));
    player = createAvatarPlayer({
      initial: { id: 'static', poster: 'static', canAnimate: true },
      load,
      frame: (fn) => fn()
    });
  });
  afterEach(() => {
    player.destroy();
    vi.useRealTimers();
  });
  it('autoplay starts the resting avatar without pointer interaction', async () => {
    player.activate();
    await Promise.resolve();
    expect(load).toHaveBeenCalledExactlyOnceWith('idle', { video: true });
    expect(player.snapshot().next.video).not.toBeNull();
    await vi.advanceTimersByTimeAsync(500);
    expect(player.snapshot().current.video.play).toHaveBeenCalled();
  });
  it('activation preserves a queued business state instead of replacing it with the old frame', async () => {
    player.request('waiting');
    player.activate();
    await vi.advanceTimersByTimeAsync(1500);
    expect(load).toHaveBeenCalledExactlyOnceWith('waiting', { video: false });
    expect(player.snapshot().current.state).toBe('waiting');
  });
  it('coalesces changes inside one second to the last target and fades for 500ms', async () => {
    player.request('working');
    await vi.advanceTimersByTimeAsync(200);
    player.request('waiting');
    await vi.advanceTimersByTimeAsync(300);
    player.request('making');
    await vi.advanceTimersByTimeAsync(499);
    expect(load).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0][0]).toBe('making');
    expect(player.snapshot().current.state).toBe('idle');
    expect(player.snapshot().next.state).toBe('making');
    await vi.advanceTimersByTimeAsync(499);
    expect(player.snapshot().current.state).toBe('idle');
    await vi.advanceTimersByTimeAsync(1);
    expect(player.snapshot().current.state).toBe('making');
    expect(player.snapshot().next).toBeNull();
  });
  it('retains a ready current layer until the preload is ready, and on failure', async () => {
    let resolve;
    load.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    player.request('working');
    await vi.advanceTimersByTimeAsync(1000);
    expect(player.snapshot().current.poster).toBe('static');
    expect(player.snapshot().next).toBeNull();
    resolve({ id: 'working', poster: 'ready', canAnimate: false });
    await vi.advanceTimersByTimeAsync(500);
    expect(player.snapshot().current.poster).toBe('ready');
    load.mockRejectedValueOnce(new Error('offline'));
    player.request('making');
    await vi.advanceTimersByTimeAsync(1000);
    expect(player.snapshot().current.poster).toBe('ready');
    expect(player.snapshot().next).toBeNull();
  });
  it('discards a superseded preload and switches to the last target only', async () => {
    let resolve;
    const dispose = vi.fn();
    load.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    player.request('working');
    await vi.advanceTimersByTimeAsync(1000);
    player.request('making');
    player.request('waiting');
    resolve({ id: 'stale', poster: 'stale', dispose });
    await vi.advanceTimersByTimeAsync(500);
    expect(dispose).toHaveBeenCalledOnce();
    expect(player.snapshot().current.state).toBe('waiting');
    expect(load.mock.calls.map(([state]) => state)).toEqual(['working', 'waiting']);
  });
  it('reduced motion and waiting never request videos', async () => {
    player.gate({ reduced: true });
    player.request('making');
    await vi.advanceTimersByTimeAsync(1000);
    expect(load).toHaveBeenLastCalledWith('making', { video: false });
    await vi.advanceTimersByTimeAsync(1);
    player.gate({ reduced: false });
    player.request('waiting');
    await vi.advanceTimersByTimeAsync(1500);
    expect(load).toHaveBeenLastCalledWith('waiting', { video: false });
  });
  it('only resumes playback when visible and focused', async () => {
    player.request('working');
    await vi.advanceTimersByTimeAsync(1500);
    const video = player.snapshot().current.video;
    player.gate({ visible: false });
    expect(video.pause).toHaveBeenCalled();
    video.play.mockClear();
    player.gate({ visible: true, focused: false });
    expect(video.play).not.toHaveBeenCalled();
    player.gate({ focused: true });
    expect(video.play).toHaveBeenCalled();
  });
  it('playback failure falls back to the loaded poster and releases the video', async () => {
    player.request('working');
    await vi.advanceTimersByTimeAsync(1500);
    const layer = player.snapshot().current;
    player.failed({ ...layer, fallbackReason: 'media-3' });
    expect(layer.dispose).toHaveBeenCalledOnce();
    expect(player.snapshot().current.video).toBeNull();
    expect(player.snapshot().current.poster).toBe('working');
    expect(player.snapshot().current.fallbackReason).toBe('media-3');
  });
  it('a play() aborted by a later pause keeps the clip, while a real playback error falls back', async () => {
    player.request('working');
    await vi.advanceTimersByTimeAsync(1500);
    const video = player.snapshot().current.video;
    video.avatarFailed = vi.fn();
    video.play.mockRejectedValueOnce(Object.assign(new Error('paused'), { name: 'AbortError' }));
    player.gate({ visible: false });
    player.gate({ visible: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(video.avatarFailed).not.toHaveBeenCalled();
    video.play.mockRejectedValueOnce(Object.assign(new Error('decode'), { name: 'NotSupportedError' }));
    player.gate({ focused: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(video.avatarFailed).toHaveBeenCalledOnce();
  });
  it('a static one-shot fallback returns to its base state without waiting for a missing ended event', async () => {
    player.gate({ reduced: true });
    player.request('celebrate', { key: 'static-save' });
    await vi.advanceTimersByTimeAsync(2500);
    expect(player.snapshot().current.state).toBe('idle');
    player.request('celebrate', { key: 'static-save' });
    await vi.advanceTimersByTimeAsync(1500);
    expect(player.snapshot().current.state).toBe('idle');
  });
  it('a completed one-shot returns to its base state and never replays after hiding', async () => {
    player.request('celebrate', { key: 'save-1', base: 'idle' });
    await vi.advanceTimersByTimeAsync(1500);
    const layer = player.snapshot().current;
    layer.video.ended = true;
    layer.video.play.mockClear();
    player.ended(layer);
    await vi.advanceTimersByTimeAsync(1500);
    expect(layer.video.play).not.toHaveBeenCalled();
    expect(player.snapshot().current.state).toBe('idle');
    player.request('celebrate', { key: 'save-2' });
    await vi.advanceTimersByTimeAsync(1500);
    player.gate({ visible: false });
    expect(player.snapshot().current.poster).toBe('static');
    player.gate({ visible: true });
    await vi.advanceTimersByTimeAsync(2000);
    expect(player.snapshot().current.state).toBe('idle');
    const count = load.mock.calls.filter(([state]) => state === 'celebrate').length;
    player.request('celebrate', { key: 'save-2' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(load.mock.calls.filter(([state]) => state === 'celebrate')).toHaveLength(count);
  });
});

describe('one-shot local icon motion', () => {
  it('shares the reduced-motion compatibility listener and releases legacy Safari listeners', () => {
    const matchMedia = window.matchMedia;
    const media = { matches: false, addListener: vi.fn(), removeListener: vi.fn() };
    window.matchMedia = vi.fn(() => media);
    const element = document.createElement('span');
    element.animate = vi.fn();
    let avatar, release;
    try {
      avatar = acquireAvatar('legacy-motion-listeners');
      release = bindIconMotion(element, 'folder');
      expect(media.addListener).toHaveBeenCalledTimes(2);
      media.matches = true;
      for (const [listener] of media.addListener.mock.calls) listener();
      expect(avatar.player.snapshot().reduced).toBe(true);
      release();
      avatar.release();
      expect(media.removeListener).toHaveBeenCalledTimes(2);
      for (const [listener] of media.addListener.mock.calls)
        expect(media.removeListener).toHaveBeenCalledWith(listener);
    } finally {
      window.matchMedia = matchMedia;
    }
  });
  it('does not load before interaction, deduplicates rapid hover and later focus for the session', async () => {
    let finish;
    const animation = {
      finished: new Promise((resolve) => {
        finish = resolve;
      }),
      cancel: vi.fn()
    };
    const element = { animate: vi.fn(() => animation) },
      load = vi.fn(async () => ({ motionFor })),
      registry = new Set();
    const one = createOnceIconPlayer({ key: 'download', element, load, registry });
    expect(load).not.toHaveBeenCalled();
    const playing = one.trigger();
    await one.trigger();
    await Promise.resolve();
    expect(element.animate).toHaveBeenCalledOnce();
    finish();
    await playing;
    await one.trigger();
    await createOnceIconPlayer({ key: 'download', element, load, registry }).trigger();
    expect(load).toHaveBeenCalledOnce();
    expect(animation.cancel).toHaveBeenCalledOnce();
  });
  it('reduced motion loads and plays nothing', async () => {
    const load = vi.fn(),
      element = { animate: vi.fn() };
    await createOnceIconPlayer({ key: 'chart', element, load, reduced: () => true, registry: new Set() }).trigger();
    expect(load).not.toHaveBeenCalled();
    expect(element.animate).not.toHaveBeenCalled();
  });
  it('fails silently and keeps the static SVG when animation data fails', async () => {
    const element = { animate: vi.fn() },
      load = vi.fn(async () => {
        throw new Error('offline');
      });
    await expect(
      createOnceIconPlayer({ key: 'users', element, load, registry: new Set() }).trigger()
    ).resolves.toBeUndefined();
    expect(element.animate).not.toHaveBeenCalled();
  });
  it('reserves per-icon weights and collapsed motions have no translation', () => {
    for (const name of [
      'plus',
      'chat',
      'book-open',
      'folder',
      'settings',
      'chart',
      'arrow-right',
      'download',
      'users'
    ]) {
      const spec = motionFor(name, true);
      expect(spec.startFrame).toBeGreaterThanOrEqual(0);
      expect(JSON.stringify(spec.frames)).not.toContain('translate');
      const peak = Number(spec.frames[1].transform.match(/scale\(([^)]+)/)[1]);
      expect(peak).toBeLessThanOrEqual(1.15);
      expect(spec.frames.at(-1)).toEqual(spec.frames[0]);
    }
  });
});

describe('foreground kitten behavior', () => {
  let behavior, changed;
  beforeEach(() => {
    vi.useFakeTimers();
    changed = vi.fn();
    behavior = createAvatarBehavior({ onChange: changed });
    behavior.update({ waiting: true });
  });
  afterEach(() => {
    behavior.destroy();
    vi.useRealTimers();
  });
  const lastState = (fn) => fn.mock.calls.at(-1)[0];
  it('dozes at three foreground minutes and sleeps at ten, without changing the waiting fact', () => {
    vi.advanceTimersByTime(AVATAR_DOZE_AFTER - 1);
    expect(lastState(changed)).toBe('waiting');
    vi.advanceTimersByTime(1);
    expect(lastState(changed)).toBe('dozing');
    vi.advanceTimersByTime(AVATAR_SLEEP_AFTER - AVATAR_DOZE_AFTER);
    expect(lastState(changed)).toBe('sleeping');
    expect(changed.mock.calls.at(-1)[1].base).toBe('sleeping');
  });
  it('excludes both blur and background time, then resumes the same idle interval', () => {
    vi.advanceTimersByTime(120000);
    behavior.gate({ focused: false });
    vi.advanceTimersByTime(1200000);
    expect(behavior.time()).toBe(120000);
    expect(lastState(changed)).toBe('waiting');
    behavior.gate({ focused: true });
    vi.advanceTimersByTime(60000);
    expect(lastState(changed)).toBe('dozing');
    behavior.gate({ visible: false });
    vi.advanceTimersByTime(1200000);
    expect(lastState(changed)).toBe('dozing');
    behavior.gate({ visible: true });
    vi.advanceTimersByTime(420000);
    expect(lastState(changed)).toBe('sleeping');
  });
  it('wakes on real input and returns to the original waiting task, without replaying on a render', () => {
    vi.advanceTimersByTime(AVATAR_DOZE_AFTER);
    behavior.activity();
    expect(lastState(changed)).toBe('resume');
    expect(changed.mock.calls.at(-1)[1].base).toBe('waiting');
    const wakeCalls = changed.mock.calls.length;
    vi.advanceTimersByTime(10);
    behavior.activity();
    expect(changed).toHaveBeenCalledTimes(wakeCalls);
    expect(lastState(changed)).toBe('resume');
    vi.advanceTimersByTime(59990);
    behavior.update({ waiting: true });
    vi.advanceTimersByTime(120010);
    expect(lastState(changed)).toBe('dozing');
  });
  it('keeps real work, a stopped task and errors ahead of idle poses', () => {
    behavior.update({ busy: true, producing: true, eventId: 'assessment' });
    vi.advanceTimersByTime(AVATAR_SLEEP_AFTER);
    expect(lastState(changed)).toBe('making');
    behavior.update({ stopped: true, eventId: 'stop' });
    vi.advanceTimersByTime(AVATAR_SLEEP_AFTER);
    expect(lastState(changed)).toBe('stopped');
    behavior.update({ error: true, stopped: true, eventId: 'failed' });
    expect(lastState(changed)).toBe('error');
  });
  it('celebrates a saved completed round, never an ordinary model result', () => {
    expect(avatarBusinessForLearning({}, { type: 'coach.result', id: 'feedback' }).completed).toBe(false);
    behavior.update(avatarBusinessForLearning({}, { type: 'coach.finish', id: 'round-complete' }));
    expect(lastState(changed)).toBe('celebrate');
    expect(changed.mock.calls.at(-1)[1].key).toBe('round-complete');
    expect(changed.mock.calls.at(-1)[1].base).toBe('idle');
  });
  it('releases the only idle timer when the last shared view is removed', () => {
    const count = changed.mock.calls.length;
    behavior.destroy();
    vi.advanceTimersByTime(AVATAR_SLEEP_AFTER);
    expect(changed).toHaveBeenCalledTimes(count);
  });
});

it('tracks window focus events rather than mistaking removal of the focused button for a background window', () => {
  const focus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const runtime = acquireAvatar('window-focus-lifecycle');
  const release = runtime.addView({ current: () => null, next: () => null, perceptible: () => true });
  try {
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();
    button.remove();
    focus.mockReturnValue(false);
    runtime.paint();
    expect(runtime.player.snapshot().focused).toBe(true);
    window.dispatchEvent(new Event('blur'));
    expect(runtime.player.snapshot().focused).toBe(false);
    window.dispatchEvent(new Event('focus'));
    expect(runtime.player.snapshot().focused).toBe(true);
  } finally {
    release();
    runtime.release();
    focus.mockRestore();
    hidden.mockRestore();
  }
});
