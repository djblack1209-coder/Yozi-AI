import { AVATAR_MEDIA, AVATAR_STATIC, createAvatarBehavior } from './avatar-state.js';
import { createAvatarPlayer } from './avatar-player.js';
import { bindBusinessMotion } from './business-motion.js';
import { kittenPoseAt, paintKittenRig } from './kitten-rig.js';
import laptopUrl from '@/assets/brand/kitten-laptop.webp';
import cushionUrl from '@/assets/brand/kitten-cushion.webp';

const players = new Map();
let serial = 0;
// MP4 carries color on the left and a grayscale alpha mask on the right.
// One ordinary video decoder preserves the portrait alpha in WebKit.
export function paintAvatarFrame(context, image, width, height, packedAlpha = false) {
  context.clearRect(0, 0, width, height);
  if (!packedAlpha) {
    context.drawImage(image, 0, 0, width, height);
    return;
  }
  const half = (image.videoWidth || image.width) / 2;
  const sourceHeight = image.videoHeight || image.height;
  context.drawImage(image, half, 0, half, sourceHeight, 0, 0, width, height);
  const mask = context.getImageData(0, 0, width, height).data;
  context.drawImage(image, 0, 0, half, sourceHeight, 0, 0, width, height);
  const frame = context.getImageData(0, 0, width, height);
  for (let i = 0; i < frame.data.length; i += 4) frame.data[i + 3] = mask[i];
  context.putImageData(frame, 0, 0);
}
// Compress the two connected pupils inside the neutral Pudding portrait.
// Pixels outside the eyes, including the fur and alpha, stay untouched.
export function paintAvatarBlink(context, width, height, closure) {
  if (closure <= 0) return;
  const frame = context.getImageData(0, 0, width, height);
  const original = new Uint8ClampedArray(frame.data);
  const dark = (x, y) => {
    const i = (y * width + x) * 4;
    return original[i + 3] > 220 && Math.max(original[i], original[i + 1], original[i + 2]) < 100;
  };
  for (const [cx, cy] of [
    [0.355, 0.545],
    [0.65, 0.545]
  ]) {
    let seed = null;
    let distance = Infinity;
    for (let y = Math.floor((cy - 0.065) * height); y < (cy + 0.065) * height; y++) {
      for (let x = Math.floor((cx - 0.06) * width); x < (cx + 0.06) * width; x++) {
        const d = (x / width - cx) ** 2 + (y / height - cy) ** 2;
        if (dark(x, y) && d < distance) {
          seed = [x, y];
          distance = d;
        }
      }
    }
    if (!seed) continue;
    const seen = new Set();
    const queue = [seed];
    let left = width,
      right = 0,
      top = height,
      bottom = 0;
    for (let q = 0; q < queue.length; q++) {
      const [x, y] = queue[q];
      const key = y * width + x;
      if (seen.has(key) || x < 0 || x >= width || y < 0 || y >= height || !dark(x, y)) continue;
      seen.add(key);
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ])
        queue.push([x + dx, y + dy]);
    }
    // Fail closed if a changed asset/decoder joins the eye to another feature.
    if (right - left < 2 || bottom - top < 2 || right - left > width * 0.17 || bottom - top > height * 0.18) continue;
    left = Math.max(0, left - 1);
    right = Math.min(width - 1, right + 1);
    top = Math.max(0, top - 1);
    bottom = Math.min(height - 1, bottom + 1);
    const scale = 1 - Math.min(1, closure) * 0.88;
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        // A soft smile at closure: the lid's corners stay slightly higher
        // than its middle, rather than squeezing the eye to a straight bar.
        const across = (2 * (x - left)) / (right - left) - 1;
        const center = (top + bottom) / 2 + closure * (bottom - top) * 0.14 * (1 - across * across);
        const sourceY = Math.round((top + bottom) / 2 + (y - center) / scale);
        const dest = (y * width + x) * 4;
        // Sample the neighbouring eyelid, preserving the original alpha.
        const source = (sourceY >= top && sourceY <= bottom ? sourceY * width + x : y * width + left) * 4;
        for (let c = 0; c < 3; c++) frame.data[dest + c] = original[source + c];
      }
    }
  }
  context.putImageData(frame, 0, 0);
}

const soften = (t) => t * t * t * (t * (t * 6 - 15) + 10);
// Different quiet intervals, with a slow, relaxed blink and an occasional pair.
// Keep this deterministic and shared: neither a re-render nor a state change
// restarts the expression. Eyelids ease into rest instead of hitting a stop.
export function avatarBlinkAt(elapsed) {
  const t = elapsed % 31000;
  for (const [start, close, hold, open] of [
    [1800, 240, 60, 400],
    [6700, 110, 35, 210],
    [13200, 300, 80, 480],
    [14300, 100, 25, 190],
    [22100, 190, 50, 330],
    [28400, 140, 40, 240]
  ]) {
    const phase = t - start;
    if (phase < 0 || phase >= close + hold + open) continue;
    if (phase < close) return soften(phase / close);
    if (phase < close + hold) return 1;
    return 1 - soften((phase - close - hold) / open);
  }
  return 0;
}

// Pudding keeps a slow breath and drift, with a recurring tilt readable at 56px.
// Thinking and replying drift faster; the tilt phrase is shared so a state change never restarts it.
const AVATAR_DRIFT = { idle: [1.4, 5200], working: [3.5, 1700], making: [2.2, 1100] };
export function avatarPoseAt(elapsed, state = 'idle') {
  if (!AVATAR_DRIFT[state]) return 'none';
  const t = elapsed % 31000;
  let lean = 0;
  for (const [start, angle, turn, hold, settle] of [
    [800, -7, 700, 1300, 1000],
    [7600, 5, 600, 900, 1100],
    [14200, -8, 800, 1500, 1200],
    [21800, 6, 650, 1000, 1100],
    [26600, -5, 600, 800, 1000]
  ]) {
    const phase = t - start;
    if (phase < 0 || phase >= turn + hold + settle) continue;
    lean =
      angle *
      (phase < turn ? soften(phase / turn) : phase < turn + hold ? 1 : 1 - soften((phase - turn - hold) / settle));
  }
  const [amplitude, period] = AVATAR_DRIFT[state];
  const drift = amplitude * Math.sin((elapsed / period) * Math.PI * 2);
  // About a pixel of breathing at 56px; the 75% transform origin keeps the feet anchored.
  const breath = (1 - Math.cos((elapsed / 3400) * Math.PI * 2)) / 2;
  return `rotate(${(lean + drift).toFixed(4)}deg) scaleY(${(1 + breath * 0.03).toFixed(5)})`;
}
function imageReady(src) {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    const timeout = setTimeout(() => {
      image.onload = image.onerror = null;
      reject(new Error('image'));
    }, 7000);
    image.onload = () => {
      clearTimeout(timeout);
      resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('image'));
    };
    image.src = src;
  });
}
// Keep media diagnostics in release builds; never log URLs, business data or raw errors.
async function posterFor(state) {
  try {
    return await imageReady(AVATAR_MEDIA[state].poster);
  } catch (error) {
    globalThis.console.warn(`[Yozi avatar] ${state}: poster-${error.message}; using static brand`);
    try {
      return await imageReady(AVATAR_STATIC);
    } catch (fallbackError) {
      globalThis.console.warn(`[Yozi avatar] ${state}: static-${fallbackError.message}; keeping current frame`);
      throw fallbackError;
    }
  }
}
function videoReady(src) {
  // Use the bundled URL directly: WebKit custom protocols need native media
  // loading, not fetch/blob conversion. Keep the decoder attached to the DOM.
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    video.tabIndex = -1;
    video.style.cssText = 'position:fixed;width:1px;height:1px;left:0;bottom:0;pointer-events:none;opacity:0.001';
    document.body.appendChild(video);
    video.avatarDispose = () => video.remove();
    video.playsInline = true;
    video.preload = 'auto';
    let settled = false;
    const clear = () => {
      clearTimeout(timeout);
      video.removeEventListener('loadeddata', ready);
      video.removeEventListener('canplay', ready);
      video.removeEventListener('error', failed);
    };
    const failed = (error) => {
      if (settled) return;
      settled = true;
      const reason = error?.name || `media-${video.error?.code || 'timeout'}`;
      clear();
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.avatarDispose();
      reject(new Error(reason));
    };
    const ready = () => {
      if (settled) return;
      settled = true;
      clear();
      resolve(video);
    };
    video.addEventListener('loadeddata', ready);
    video.addEventListener('canplay', ready);
    video.addEventListener('error', failed);
    const timeout = setTimeout(() => failed(), 7000);
    video.src = src;
    video.load();
    // A pause while hidden aborts play() but not loading; let data or the timeout decide.
    video.play()?.catch((error) => error?.name !== 'AbortError' && failed(error));
  });
}
export function acquireAvatar(identity = 'yozi') {
  if (players.has(identity)) {
    const entry = players.get(identity);
    entry.references++;
    return entry;
  }
  let frameId = null;
  const views = new Set();
  let reduced = true;
  let focused = document.hasFocus();
  let lastGates = '';
  let gestureTime = 0;
  let lastTick = null;
  const behavior = createAvatarBehavior({ onChange: (state, options) => player.request(state, options) });
  const props = {};
  function loadProp(name) {
    if (props[name]) return;
    const image = new window.Image();
    props[name] = image;
    image.onload = () => paint();
    image.onerror = () => {
      image.onload = image.onerror = null;
    };
    image.src = name === 'laptop' ? laptopUrl : cushionUrl;
  }
  const fallback = new window.Image();
  fallback.src = AVATAR_MEDIA.idle.poster;
  const portrait = new window.Image();
  portrait.onload = () => paint();
  portrait.src = AVATAR_STATIC;
  let blinkContext;
  fallback.onerror = () => {
    fallback.onerror = null;
    fallback.src = AVATAR_STATIC;
  };
  const load = async (state, options) => {
    if ([...views].some((view) => view.perceptible?.()))
      return {
        id: ++serial,
        poster: fallback,
        video: null,
        canAnimate: false,
        animationDuration: state === 'celebrate' ? 2400 : state === 'resume' ? 2200 : 1200
      };
    const poster = await posterFor(state);
    let video = null;
    let fallbackReason = '';
    if (options.video && AVATAR_MEDIA[state].video) {
      try {
        video = await videoReady(AVATAR_MEDIA[state].video);
      } catch (error) {
        fallbackReason = error.message;
        globalThis.console.warn(`[Yozi avatar] ${state}: ${fallbackReason}; using poster`);
      }
    }
    const layer = {
      id: ++serial,
      poster,
      video,
      fallbackReason,
      packedAlpha: AVATAR_MEDIA[state].packedAlpha,
      canAnimate: Boolean(AVATAR_MEDIA[state].video && (!options.video || video)),
      dispose() {
        if (video) {
          video.removeEventListener('error', failed);
          video.pause();
          video.removeAttribute('src');
          video.load();
          video.avatarDispose?.();
        }
      }
    };
    const failed = (error) => {
      layer.fallbackReason = error?.name || `media-${video?.error?.code || 'playback'}`;
      globalThis.console.warn(`[Yozi avatar] ${state}: ${layer.fallbackReason}; using poster`);
      player.failed(layer);
    };
    if (video) video.avatarFailed = failed;
    if (video) {
      video.loop = AVATAR_MEDIA[state].loop;
      video.addEventListener('ended', () => player.ended({ ...layer, state }), { once: true });
      video.addEventListener('error', failed, { once: true });
    }
    return layer;
  };
  const player = createAvatarPlayer({
    now: behavior.time,
    initial: { id: ++serial, poster: fallback, video: null, canAnimate: true },
    load,
    frame: (fn) => requestAnimationFrame(fn)
  });
  function paintOnce() {
    const state = player.snapshot();
    for (const view of views) {
      if (view.visible?.() === false) continue;
      if (view.perceptible?.()) {
        view.pose?.('none');
      }
      for (const [key, layer] of [
        ['current', state.current],
        ['next', state.next]
      ]) {
        const canvas = view[key]();
        if (!canvas || !layer) continue;
        const context = canvas.getContext('2d');
        // A lost/unavailable canvas keeps the existing poster fallback visible.
        if (!context) continue;
        if (view.perceptible?.()) {
          if (layer.state === 'making') loadProp('laptop');
          if (layer.state === 'sleeping') loadProp('cushion');
          if (!portrait.naturalWidth) continue;
          const pose = kittenPoseAt(gestureTime, layer.state, {
            reduced: state.reduced || !state.activated,
            age: Math.max(0, behavior.time() - (layer.poseStartedAt ?? layer.enteredAt)),
            exit:
              key === 'current' && state.fading ? Math.min(1, (behavior.time() - state.next.poseStartedAt) / 500) : 0
          });
          let frame = portrait;
          const closure = layer.state === 'idle' ? avatarBlinkAt(gestureTime) : pose.blink;
          if (!state.reduced && state.activated && closure > 0) {
            if (blinkContext === undefined) {
              const canvas = document.createElement('canvas');
              canvas.width = canvas.height = 256;
              blinkContext = canvas.getContext('2d', { willReadFrequently: true });
            }
            if (blinkContext) {
              const { width, height } = blinkContext.canvas;
              paintAvatarFrame(blinkContext, portrait, width, height);
              paintAvatarBlink(blinkContext, width, height, closure);
              frame = blinkContext.canvas;
            }
          }
          paintKittenRig(context, canvas.width, canvas.height, pose, { ...props, portrait: frame });
          if (key === 'current')
            view.painted?.(state.reduced ? 'fallback' : state.visible && state.focused ? 'playing' : 'paused');
          continue;
        }
        const image = !state.reduced && layer.video?.readyState >= 2 ? layer.video : layer.poster;
        if (!image || !(image.videoWidth || image.naturalWidth)) continue;
        paintAvatarFrame(context, image, canvas.width, canvas.height, image === layer.video && layer.packedAlpha);
        // Report the displayed current layer, not merely a loaded decoder or poster.
        if (key === 'current') {
          const media =
            state.reduced || layer.fallbackReason || !layer.canAnimate
              ? 'fallback'
              : image === layer.video
                ? state.visible && state.focused && !layer.video.paused
                  ? 'playing'
                  : 'paused'
                : 'loading';
          view.painted?.(media);
        }
      }
    }
  }
  function paint() {
    gates();
    paintOnce();
    const state = player.snapshot();
    // The pose and blink are procedural, so a poster-only fallback keeps moving too.
    const moving =
      state.visible &&
      state.focused &&
      !state.reduced &&
      state.activated &&
      Boolean(state.current.video || state.next?.video || [...views].some((view) => view.perceptible?.()));
    if (!moving) lastTick = null;
    if (!moving && frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
    if (moving && frameId === null) frameId = requestAnimationFrame(tick);
  }
  function tick(time) {
    if (lastTick !== null && time - lastTick < 1000 / 30) {
      frameId = requestAnimationFrame(tick);
      return;
    }
    // Use wall time even on a busy renderer; gates reset lastTick while paused.
    gestureTime = behavior.time();
    lastTick = time;
    frameId = null;
    paint();
  }
  function gates() {
    const values = {
      visible: !document.hidden && [...views].some((view) => view.visible?.() !== false),
      focused,
      reduced
    };
    const signature = JSON.stringify(values);
    if (signature === lastGates) return;
    lastGates = signature;
    behavior.gate(values);
    if (!values.visible || !values.focused || values.reduced) lastTick = null;
    if (values.reduced) gestureTime = 0;
    player.gate(values);
  }
  const changes = player.subscribe(paint);
  document.addEventListener('visibilitychange', gates);
  const focus = () => {
    focused = true;
    paint();
  };
  const blur = () => {
    focused = false;
    paint();
  };
  window.addEventListener('focus', focus);
  window.addEventListener('blur', blur);
  const activity = () => behavior.activity();
  document.addEventListener('input', activity, { passive: true });
  document.addEventListener('pointerdown', activity, { passive: true });
  document.addEventListener('keydown', activity, { passive: true });
  const releaseMotion = bindBusinessMotion((value) => {
    reduced = value;
    gates();
  });
  fallback.onload = () => paint();
  gates();
  const entry = {
    player,
    paint,
    references: 1,
    business(value) {
      behavior.update(value);
    },
    activate() {
      player.activate();
    },
    addView(view) {
      views.add(view);
      paint();
      return () => {
        views.delete(view);
        paint();
      };
    },
    release() {
      if (--entry.references) return;
      changes();
      player.destroy();
      behavior.destroy();
      for (const image of Object.values(props)) {
        image.onload = image.onerror = null;
        image.src = '';
      }
      portrait.onload = null;
      portrait.src = '';
      if (frameId !== null) cancelAnimationFrame(frameId);
      document.removeEventListener('visibilitychange', gates);
      window.removeEventListener('focus', focus);
      window.removeEventListener('blur', blur);
      document.removeEventListener('input', activity);
      document.removeEventListener('pointerdown', activity);
      document.removeEventListener('keydown', activity);
      releaseMotion();
      players.delete(identity);
    }
  };
  players.set(identity, entry);
  return entry;
}
