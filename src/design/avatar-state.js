// Existing presentation keys remain compatible: idle=curious, working=thinking,
// making=studying, resume=waking. No learning facts or saved records use these keys.
export const AVATAR_STATES = Object.freeze([
  'idle',
  'dozing',
  'sleeping',
  'resume',
  'making',
  'working',
  'waiting',
  'celebrate',
  'error',
  'stopped'
]);
export const AVATAR_DOZE_AFTER = 3 * 60 * 1000;
export const AVATAR_SLEEP_AFTER = 10 * 60 * 1000;
export const AVATAR_MIN_STAY = 1000;
export const AVATAR_FADE = 500;

// Presentation only: the caller supplies business facts; this never changes them.
export function avatarStateFor(business = {}) {
  if (business.error) return 'error';
  if (business.stopped) return 'stopped';
  if (business.busy && business.producing) return 'making';
  if (business.busy) return 'working';
  if (business.completed) return 'celebrate';
  if (business.resuming) return 'resume';
  if (business.idleMs >= AVATAR_SLEEP_AFTER) return 'sleeping';
  if (business.idleMs >= AVATAR_DOZE_AFTER) return 'dozing';
  if (business.waiting) return 'waiting';
  return 'idle';
}

export function avatarBusinessForPose(pose) {
  return {
    busy: ['think', 'read'].includes(pose),
    producing: pose === 'read',
    waiting: ['sleep', 'encourage', 'point'].includes(pose),
    completed: pose === 'celebrate',
    resuming: ['wave', 'curious'].includes(pose)
  };
}

export function avatarBusinessForLearning(learning, newEvent = null) {
  const request = learning.active?.coach?.requests?.findLast((r) => r.id === learning.retryState?.requestId);
  const phase = request?.request?.phase;
  return {
    busy: Boolean(learning.busy || learning.intakeBusy),
    producing:
      Boolean(learning.streamPreview) ||
      Boolean(learning.busy && ['feedback', 'essay', 'daily', 'summary'].includes(phase)),
    activity: learning.busy ? phase || 'thinking' : null,
    stopped: Boolean(learning.active?.stopped),
    waiting: Boolean(learning.activeQuestion) && !learning.busy,
    error: Boolean(learning.error || learning.coachError),
    completed: ['training.complete', 'coach.finish'].includes(newEvent?.type),
    completionId: newEvent?.id,
    eventId: newEvent?.id,
    context: `${learning.state?.owner || ''}:${learning.active?.id || ''}`,
    resuming: newEvent?.type === 'task.resume'
  };
}

// One foreground clock per shared avatar identity. Input and saved business
// events reset idle time; the timer only changes presentation, never progress.
export function createAvatarBehavior({ onChange, now = Date.now, timer = setTimeout, cancel = clearTimeout }) {
  let elapsed = 0,
    stamp = now(),
    foreground = true,
    idleFrom = 0;
  let value = {},
    signature = '',
    displayed = 'idle',
    timeout = null,
    wakeId = 0,
    wakingUntil = 0,
    destroyed = false;
  const time = () => elapsed + (foreground ? Math.max(0, now() - stamp) : 0);
  const idleMs = () => time() - idleFrom;
  const base = () => avatarStateFor({ ...value, idleMs: idleMs() });
  function clear() {
    if (timeout !== null) cancel(timeout);
    timeout = null;
  }
  function publish(state, key = null) {
    displayed = state;
    if (state === 'resume') wakingUntil = time() + 2200;
    onChange(state, { key, base: base(), activate: Boolean(value.busy || state === 'resume') });
  }
  function arm() {
    clear();
    if (destroyed || !foreground || value.error || value.stopped || value.busy) return;
    const idle = idleMs();
    const threshold =
      idle < AVATAR_DOZE_AFTER ? AVATAR_DOZE_AFTER : idle < AVATAR_SLEEP_AFTER ? AVATAR_SLEEP_AFTER : null;
    if (threshold !== null)
      timeout = timer(() => {
        timeout = null;
        publish(base());
        arm();
      }, threshold - idle);
  }
  function activity() {
    if (destroyed || !foreground) return;
    const waking = ['dozing', 'sleeping'].includes(displayed);
    idleFrom = time();
    // One keystroke produces keydown + input, and shortcut chords produce
    // several keydowns. Those events must not cancel the same wake gesture.
    if (displayed === 'resume' && time() < wakingUntil) {
      arm();
      return;
    }
    publish(waking && !value.error && !value.stopped ? 'resume' : base(), `wake-${++wakeId}`);
    arm();
  }
  return {
    time,
    activity,
    update(next) {
      if (destroyed) return;
      const nextSignature = JSON.stringify(next);
      if (nextSignature === signature) return;
      signature = nextSignature;
      const waking = ['dozing', 'sleeping'].includes(displayed);
      value = { ...next, completed: false, resuming: false };
      idleFrom = time();
      const state = avatarStateFor(next);
      publish(
        waking && !next.error && !next.stopped && !next.completed && !['dozing', 'sleeping'].includes(state)
          ? 'resume'
          : state,
        next.completionId || next.eventId
      );
      arm();
    },
    gate({ visible = true, focused = true }) {
      const active = visible && focused;
      if (active === foreground || destroyed) return;
      elapsed = time();
      stamp = now();
      foreground = active;
      arm();
    },
    destroy() {
      destroyed = true;
      clear();
    }
  };
}

export const AVATAR_MEDIA = Object.freeze(
  Object.fromEntries(
    AVATAR_STATES.map((state) => [
      state,
      Object.freeze({
        poster: `/public/visual/avatar/${['error', 'dozing', 'sleeping', 'stopped'].includes(state) ? 'waiting' : state}.webp`,
        video: ['waiting', 'error', 'dozing', 'sleeping', 'stopped'].includes(state)
          ? null
          : `/public/visual/avatar/${state}.mp4`,
        packedAlpha: !['waiting', 'error', 'dozing', 'sleeping', 'stopped'].includes(state),
        loop: ['idle', 'working', 'making'].includes(state)
      })
    ])
  )
);
export const AVATAR_STATIC = '/static/brand/kitten-avatar.png';
