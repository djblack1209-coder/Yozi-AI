import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { applyLearningOperation, emptyLearningState, dayKey } from '@/services/learning/learning-domain.js';
import { reminderJobs, coachDueItem } from '../../laf-backend/functions/_shared/learning-reminders.js';
import { studyPosterData } from '@/services/learning/study-poster.js';
import { androidPosterShare } from '@/services/learning/app-poster-share.js';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { learningWriteLease } from '@/services/learning/learning-write-lease.js';

const at = Date.parse('2026-10-20T17:00:00Z');
let reminderSerial = 0;
function stateWithCoach() {
  let state = emptyLearningState('private-student', 'America/Los_Angeles');
  for (const [id, type, data] of [
    ['goal', 'conversation.start', { goal: 'private exam goal' }],
    ['begin', 'coach.begin', { conversationId: 'goal', explicit: true }],
    [
      'profile',
      'coach.profile',
      {
        conversationId: 'goal',
        explicit: true,
        profile: {
          exam: 'cs408',
          track: 'kaoyan-cs-material',
          subjects: ['kaoyan_major'],
          minutes: 15,
          deadline: '2026-12-20',
          foundation: 'private foundation'
        }
      }
    ]
  ])
    state = applyLearningOperation(state, { id, type, at, data }).state;
  return state;
}
function setReminder(state, kind = 'study', extra = {}) {
  return applyLearningOperation(state, {
    id: `reminder-${kind}-${++reminderSerial}`,
    type: 'reminder.set',
    at,
    data: {
      conversationId: 'goal',
      kind,
      time: '20:00',
      repeatDays: [0, 1, 2, 3, 4, 5, 6],
      timezone: state.timezone,
      enabled: true,
      ...extra
    }
  }).state;
}
beforeEach(() => {
  uni.clearStorageSync();
  setActivePinia(createPinia());
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const store of getActivePinia()?._s.values() || []) store.$dispose();
  learningWriteLease.release();
  uni.clearStorageSync();
});
it('Android sharing rechecks the preview after reading and requires the system selection receipt', async () => {
  let status = 'selected';
  const shareStudyPoster = vi.fn((bytes, callback) => callback({ status }));
  vi.stubGlobal('uni', { ...uni, requireNativePlugin: () => ({ canShareStudyPoster: () => true, shareStudyPoster }) });
  vi.stubGlobal('plus', {
    os: { name: 'Android' },
    io: {
      resolveLocalFileSystemURL: (_source, resolve) => resolve({ file: (done) => done({}) }),
      FileReader: class {
        readAsDataURL() {
          this.result = 'data:image/png;base64,cG5n';
          this.onload();
        }
      }
    }
  });
  const share = androidPosterShare();
  let current = true;
  const stale = share('_doc/poster.png', () => current);
  current = false;
  await expect(stale).resolves.toBe(false);
  expect(shareStudyPoster).not.toHaveBeenCalled();

  await expect(share('_doc/poster.png', () => true)).resolves.toBe(true);
  expect(shareStudyPoster).toHaveBeenCalledWith('cG5n', expect.any(Function));
  status = 'cancelled';
  await expect(share('_doc/poster.png', () => true)).resolves.toBe(false);
});
describe('新版带练提醒使用保存事实', () => {
  it('没有旧路线也可设定未来四周提醒；漏学不编造作答或欠课', () => {
    const state = setReminder(stateWithCoach()),
      before = JSON.stringify(state);
    const queue = reminderJobs(state, at, { dayKey });
    expect(queue).toHaveLength(28);
    expect(queue[0]).toMatchObject({ day: '2026-10-20', kind: 'study', conversationId: 'goal' });
    expect(reminderJobs(state, at + 4 * 86400000, { dayKey })[0].day).toBe('2026-10-24');
    expect(JSON.stringify(state)).toBe(before);
    expect(state.conversations[0].coach.days).toHaveLength(0);
  });
  it('完成当天取消学习和小结提醒；暂停、截止日、改期均有效', () => {
    const state = setReminder(setReminder(stateWithCoach()), 'recap');
    state.conversations[0].coach.days.push({ day: '2026-10-20', completed: true });
    expect(reminderJobs(state, at, { dayKey }).some((job) => job.day === '2026-10-20')).toBe(false);
    state.conversations[0].coach.profile.deadline = '2026-10-22';
    expect(reminderJobs(state, at, { dayKey })).toHaveLength(4);
    state.conversations[0].stopped = true;
    expect(reminderJobs(state, at, { dayKey })).toEqual([]);
    expect(() => setReminder(state)).toThrow();
  });
  it('到期复习只引用当前目标的知识点；修改到期日后旧提醒不匹配', () => {
    const state = setReminder(stateWithCoach(), 'review');
    expect(reminderJobs(state, at, { dayKey })).toHaveLength(0);
    state.conversations[0].coach.library.push({ id: 'phrase', due: at + 86400000, text: 'private phrase' });
    const queue = reminderJobs(state, at, { dayKey });
    expect(queue[0]).toMatchObject({ kind: 'review', day: '2026-10-21', reviewId: 'phrase' });
    state.conversations[0].coach.library[0].due += 7 * 86400000;
    expect(reminderJobs(state, at, { dayKey }).some((job) => job.id === queue[0].id)).toBe(false);
    const coach = state.conversations[0].coach;
    coach.library.push({ id: 'earlier-due', due: at - 1000 });
    const before = JSON.stringify(coach.library);
    expect(coachDueItem(coach, at)?.id).toBe('earlier-due');
    expect(reminderJobs(state, at, { dayKey })[0].reviewId).toBe(coachDueItem(coach, at).id);
    expect(JSON.stringify(coach.library)).toBe(before);
  });
  it('设置写到明确选择的目标，编辑草稿不会切换当前学习目标', () => {
    const s = useConversationLearningStore();
    const first = s.startCoach('first');
    s.coachSave('profile', { profile: { exam: 'english1', minutes: 15 } });
    const second = s.startCoach('second');
    s.coachSave('profile', { profile: { exam: 'english2', minutes: 15 } });
    s.configureStudyReminder(s.recordContext(), first.id, {
      kind: 'study',
      time: '20:00',
      timezone: s.state.timezone,
      repeatDays: [1, 3],
      enabled: true
    });
    expect(s.active.id).toBe(second.id);
    expect(s.state.conversations.find((item) => item.id === first.id).reminders).toHaveLength(1);
    expect(() => s.configureStudyReminder('stale', first.id, {})).toThrow();
  });
});
describe('学习分享图片只导出已保存的公开投影', () => {
  it('次数、日期和图表取自保存事实；默认不包含私人正文或 AI 评估', () => {
    const state = stateWithCoach(),
      coach = state.conversations[0].coach;
    coach.diagnostic = {
      answers: [{ answer: 'PRIVATE RAW ANSWER' }],
      feedback: {
        lines: [{ original: 'PRIVATE RAW ANSWER' }],
        weaknesses: ['数组下标'],
        strengths: ['PRIVATE STRENGTH']
      }
    };
    coach.library = [{ text: 'PRIVATE PHRASE', due: at - 1, reviews: [] }];
    state.materials.push({ id: 'private-document', name: 'PRIVATE FILE', segments: [{ content: 'PRIVATE TEXT' }] });
    const before = JSON.stringify(state),
      model = studyPosterData(state, at);
    expect(model.stats.map((item) => item.value)).toEqual([1, 0, 1]);
    expect(model.date).toBe('2026-10-20');
    expect(model.days.at(-1).day).toBe('2026-10-20');
    expect(JSON.stringify(model)).not.toMatch(
      /PRIVATE|private-student|private exam|private foundation|private-document/u
    );
    expect(model.observations).toEqual([]);
    expect(studyPosterData(state, at, { observations: true }).observations[0]).toEqual({
      label: '继续练习',
      text: '数组下标'
    });
    expect(JSON.stringify(state)).toBe(before);
  });
  it('历史图片使用所选日期的提交和反馈，七日图结束于所选日', () => {
    const state = stateWithCoach(),
      coach = state.conversations[0].coach;
    coach.startedDay = '2026-10-15';
    coach.diagnostic = { answers: [{ answer: 'yesterday' }], feedback: null };
    coach.days.push({
      day: '2026-10-18',
      answers: [{ answer: 'a' }],
      drafts: [],
      rewrites: [],
      feedback: {},
      essay: null,
      completed: true
    });
    const model = studyPosterData(state, at, { day: '2026-10-18' });
    expect(model.stats.map((item) => item.value)).toEqual([1, 1, 0]);
    expect(model.days.at(-1).day).toBe('2026-10-18');
    expect(() => studyPosterData(state, at, { day: '2026-99-99' })).toThrow();
    expect(() => studyPosterData(state, at, { day: '2026-10-19' })).toThrow();
  });
});
