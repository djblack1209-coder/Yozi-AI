import { beforeEach, expect, it, vi } from 'vitest';
import { savedLearningFeedback, playLearningFeedback, stopLearningFeedback } from '@/design/learning-feedback.js';
const preferences = vi.hoisted(() => ({ sound: true, haptic: true }));
vi.mock('@/pages/practice-sub/utils/quiz-sound.js', () => ({ isSoundEnabled: () => preferences.sound }));
vi.mock('@/utils/helpers/haptic.js', () => ({ isHapticEnabled: () => preferences.haptic, vibrateLight: vi.fn() }));
import { vibrateLight } from '@/utils/helpers/haptic.js';
const state = (events = []) => ({ owner: 'feedback-test', timezone: 'UTC', events, conversations: [] });
const answer = { id: 'a', type: 'coach.answer', at: Date.UTC(2026, 10, 10), data: {} };
beforeEach(() => {
  preferences.sound = true;
  preferences.haptic = true;
  vi.clearAllMocks();
});
it('earns one bead for the first saved submission of the day and stays quiet on a repeated receipt', () => {
  expect(savedLearningFeedback(state(), state([answer]))).toBe('checkin');
  expect(savedLearningFeedback(state([answer]), state([answer]))).toBeNull();
  expect(savedLearningFeedback(state([answer]), state([answer, { ...answer, id: 'b' }]))).toBeNull();
  expect(
    savedLearningFeedback(state([answer]), state([answer, { ...answer, id: 'c', at: answer.at + 86400000 }]))
  ).toBe('checkin');
});
it('only gives correction or completion feedback after the corresponding saved event', () => {
  const pending = { id: 'pending', type: 'coach.request', data: {} };
  expect(savedLearningFeedback(state(), state([pending]))).toBeNull();
  expect(
    savedLearningFeedback(
      state(),
      state([{ id: 'result', type: 'coach.result', data: { output: { kind: 'feedback' } } }])
    )
  ).toBe('correction');
  expect(savedLearningFeedback(state(), state([{ id: 'done', type: 'training.complete', data: {} }]))).toBe('complete');
  expect(savedLearningFeedback(state(), { ...state([answer]), owner: 'another' })).toBeNull();
});
it('celebrates a goal only when the last planned learning day is saved as complete', () => {
  const before = state();
  before.conversations = [
    {
      id: 'goal',
      at: answer.at,
      coach: {
        startedDay: '2026-11-10',
        profile: { deadline: '2026-11-10' },
        library: [],
        requests: [],
        days: [{ day: '2026-11-10', answers: [], rewrites: [], feedback: {}, pack: { cards: [] }, completed: false }]
      }
    }
  ];
  const after = structuredClone(before);
  after.conversations[0].coach.days[0].completed = true;
  after.events.push({ id: 'finish', type: 'coach.finish', at: answer.at, data: {} });
  expect(savedLearningFeedback(before, after, answer.at)).toBe('goal');
  expect(savedLearningFeedback(after, after, answer.at)).toBeNull();
  const longBefore = structuredClone(before);
  longBefore.conversations[0].coach.startedDay = '2026-01-01';
  longBefore.conversations[0].coach.profile.deadline = '2026-12-31';
  longBefore.conversations[0].coach.days = Array.from({ length: 364 }, (_, index) => ({
    ...structuredClone(before.conversations[0].coach.days[0]),
    day: new Date(Date.UTC(2026, 0, 1) + index * 86400000).toISOString().slice(0, 10),
    completed: index < 363
  }));
  const longAfter = structuredClone(longBefore);
  longAfter.conversations[0].coach.days[363].completed = true;
  longAfter.events = after.events;
  expect(savedLearningFeedback(longBefore, longAfter, answer.at)).toBe('complete');
});
it('animates the newest correction instead of an older saved card', () => {
  preferences.sound = false;
  const old = { animate: vi.fn() },
    latest = { animate: vi.fn() };
  const target = { querySelectorAll: () => [old, latest], animate: vi.fn() };
  playLearningFeedback('correction', target);
  expect(latest.animate).toHaveBeenCalledOnce();
  expect(old.animate).not.toHaveBeenCalled();
  expect(target.animate).not.toHaveBeenCalled();
});
it('starts motion, quiet sound and haptic from one event, and honours mute and reduced motion', () => {
  const play = vi.fn().mockResolvedValue(undefined),
    pause = vi.fn();
  const AudioMock = vi.fn(function (src) {
    this.src = src;
    this.play = play;
    this.pause = pause;
  });
  vi.stubGlobal('Audio', AudioMock);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const target = { animate: vi.fn() };
  expect(playLearningFeedback('correction', target)).toBe(true);
  expect(target.animate).toHaveBeenCalledTimes(1);
  expect(vibrateLight).toHaveBeenCalledWith('light');
  expect(play).toHaveBeenCalledTimes(1);
  expect(AudioMock.mock.instances[0].volume).toBe(0.2);
  preferences.sound = false;
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  playLearningFeedback('warning', target);
  expect(target.animate).toHaveBeenCalledTimes(1);
  expect(play).toHaveBeenCalledTimes(1);
  stopLearningFeedback();
  expect(pause).toHaveBeenCalled();
  vi.unstubAllGlobals();
});
it('uses the native ambient channel and Android system feedback while keeping silent mode quiet', () => {
  const play = vi.fn(),
    nativeAudio = { play };
  const view = {},
    manager = {};
  let ringer = 0;
  const android = {
    importClass: () => ({ CONFIRM: 16, REJECT: 17, CONTEXT_CLICK: 6, VIRTUAL_KEY: 1 }),
    currentWebview: () => view,
    runtimeMainActivity: () => ({}),
    invoke: vi.fn((_target, method) =>
      method === 'getSystemService' ? manager : method === 'getRingerMode' ? ringer : true
    )
  };
  vi.stubGlobal('plus', { android });
  const create = vi.fn(() => nativeAudio);
  vi.stubGlobal('uni', { ...uni, createInnerAudioContext: create });
  playLearningFeedback('complete');
  expect(android.invoke).toHaveBeenCalledWith(view, 'performHapticFeedback', 16);
  expect(create).not.toHaveBeenCalled();
  ringer = 2;
  playLearningFeedback('correction');
  expect(play).toHaveBeenCalledOnce();
  expect(nativeAudio.sessionCategory).toBe('ambient');
  expect(nativeAudio.obeyMuteSwitch).toBe(true);
  preferences.sound = preferences.haptic = false;
  android.invoke.mockClear();
  playLearningFeedback('warning');
  expect(android.invoke).not.toHaveBeenCalled();
  expect(play).toHaveBeenCalledOnce();
  stopLearningFeedback();
  vi.unstubAllGlobals();
});
