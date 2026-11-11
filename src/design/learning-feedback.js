import { dayKey } from '@/services/learning/learning-domain.js';
import { museGoals } from '@/services/learning/muse-workspace-data.js';
import { isSoundEnabled } from '@/pages/practice-sub/utils/quiz-sound.js';
import { isHapticEnabled, vibrateLight } from '@/utils/helpers/haptic.js';
import reward from '@/static/audio/learning/reward.mp3';
import complete from '@/static/audio/learning/complete.mp3';
import receive from '@/static/audio/learning/receive.mp3';
import achievement from '@/static/audio/learning/achievement.mp3';
import error from '@/static/audio/learning/error.mp3';
import warning from '@/static/audio/learning/warning.mp3';

// One recipe starts the visible response, sound and touch together after the saved event.
export const LEARNING_FEEDBACK = Object.freeze({
  checkin: {
    sound: reward,
    haptic: 'light',
    duration: 480,
    frames: [{ transform: 'scale(.985)' }, { transform: 'scale(1.012)', offset: 0.45 }, { transform: 'scale(1)' }]
  },
  complete: {
    sound: complete,
    haptic: 'medium',
    duration: 560,
    frames: [
      { transform: 'translateY(3px)', opacity: 0.8 },
      { transform: 'translateY(-2px)', opacity: 1, offset: 0.55 },
      { transform: 'translateY(0)' }
    ]
  },
  correction: {
    sound: receive,
    haptic: 'light',
    duration: 340,
    frames: [
      { opacity: 0.6, transform: 'translateY(5px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ]
  },
  goal: {
    sound: achievement,
    haptic: 'medium',
    duration: 700,
    frames: [{ transform: 'scale(.98)' }, { transform: 'scale(1.018)', offset: 0.45 }, { transform: 'scale(1)' }]
  },
  error: {
    sound: error,
    haptic: 'medium',
    duration: 280,
    frames: [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-3px)', offset: 0.3 },
      { transform: 'translateX(3px)', offset: 0.65 },
      { transform: 'translateX(0)' }
    ]
  },
  warning: { sound: warning, haptic: 'light', duration: 320, frames: [{ opacity: 0.65 }, { opacity: 1 }] }
});
const submissions = new Set([
  'coach.answer',
  'coach.review',
  'coach.paragraph',
  'coach.essaySubmit',
  'coach.rewriteAnswer',
  'attempt.submit'
]);

export function savedLearningFeedback(before, after, now = Date.now()) {
  if (before.owner !== after.owner) return null;
  const existing = new Set(before.events.map((event) => event.id));
  const added = after.events.filter((event) => !existing.has(event.id));
  if (added.some((event) => ['coach.finish', 'training.complete'].includes(event.type))) {
    const old = new Map(
      museGoals(before, now).map((goal) => [goal.id, goal.totalDays > 0 && goal.completedDays >= goal.totalDays])
    );
    if (
      museGoals(after, now).some(
        (goal) => goal.totalDays > 0 && goal.completedDays >= goal.totalDays && !old.get(goal.id)
      )
    )
      return 'goal';
    return 'complete';
  }
  if (added.some((event) => event.type === 'coach.result' && ['feedback', 'essay'].includes(event.data.output?.kind)))
    return 'correction';
  const answer = added.find((event) => submissions.has(event.type));
  if (
    answer &&
    !before.events.some(
      (event) => submissions.has(event.type) && dayKey(event.at, before.timezone) === dayKey(answer.at, after.timezone)
    )
  )
    return 'checkin';
  return null;
}

let audio = null;
function feedbackHaptic(kind, strength) {
  const android = globalThis.plus?.android;
  if (!android) return vibrateLight(strength);
  if (!isHapticEnabled()) return false;
  try {
    const patterns = android.importClass('android.view.HapticFeedbackConstants');
    const preset =
      kind === 'error'
        ? patterns.REJECT
        : ['complete', 'goal', 'checkin'].includes(kind)
          ? patterns.CONFIRM
          : patterns.CONTEXT_CLICK;
    // View feedback honours Android's system haptics setting without VIBRATE permission.
    return android.invoke(android.currentWebview(), 'performHapticFeedback', preset ?? patterns.VIRTUAL_KEY);
  } catch {
    return false;
  }
}
function systemSoundEnabled() {
  const android = globalThis.plus?.android;
  if (!android) return true;
  try {
    // Media playback ignores the ringer switch, so check it before a short UI cue.
    const manager = android.invoke(android.runtimeMainActivity(), 'getSystemService', 'audio');
    return android.invoke(manager, 'getRingerMode') === 2;
  } catch {
    return false;
  }
}
export function stopLearningFeedback() {
  audio?.pause?.();
  audio?.stop?.();
  audio?.destroy?.();
  audio = null;
}
export function playLearningFeedback(kind, target) {
  const recipe = LEARNING_FEEDBACK[kind];
  if (!recipe) return false;
  const element = target?.$el || target;
  const selector = ['error', 'warning'].includes(kind)
    ? '[role="alert"]'
    : kind === 'correction'
      ? '[data-test="coach-feedback"]'
      : '#coach-current-turn';
  const result =
    Array.from(element?.querySelectorAll?.(selector) || []).at(-1) ||
    element?.querySelector?.('.space-content') ||
    element;
  if (!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
    result?.animate?.(recipe.frames, { duration: recipe.duration, easing: 'cubic-bezier(.16,1,.3,1)' });
  feedbackHaptic(kind, recipe.haptic);
  if (!isSoundEnabled() || !systemSoundEnabled()) return true;
  stopLearningFeedback();
  try {
    if (globalThis.plus && typeof uni.createInnerAudioContext === 'function') {
      audio = uni.createInnerAudioContext();
      audio.obeyMuteSwitch = true;
      audio.sessionCategory = 'ambient';
      audio.volume = 0.2;
      audio.src = recipe.sound;
      audio.play();
    } else if (typeof globalThis.Audio === 'function') {
      audio = new globalThis.Audio(recipe.sound);
      audio.volume = 0.2;
      void audio.play().catch(() => undefined);
    } else if (typeof uni.createInnerAudioContext === 'function') {
      audio = uni.createInnerAudioContext();
      audio.obeyMuteSwitch = true;
      audio.sessionCategory = 'ambient';
      audio.volume = 0.2;
      audio.src = recipe.sound;
      audio.play();
    }
  } catch {
    /* Feedback cannot interrupt a saved learning action. */
  }
  return true;
}
