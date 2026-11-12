// This fixture owns calendar/queue timers. Keep the real, independently tested
// daily memory controller paused so global fake-clock assertions measure this fixture.
vi.mock('@/services/learning/learning-memory-reconciler.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    createLearningMemoryReconciler(options) {
      const controller = original.createLearningMemoryReconciler(options);
      controller.pause();
      return controller;
    }
  };
});
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { computed } from 'vue';
import { createLearningCalendar } from '@/services/learning/learning-calendar.js';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';

let releases;
beforeEach(() => {
  uni.clearStorageSync();
  setActivePinia(createPinia());
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-07T06:59:59.500Z'));
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  releases = [];
});
afterEach(() => {
  releases.forEach((release) => release());
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function storeFor(kind = 'writing') {
  const store = useConversationLearningStore();
  releases.push(() => store.$dispose());
  store.commit('timezone.set', { timezone: 'America/Los_Angeles' });
  store.start(kind === 'science' ? '学习物理' : kind === 'vocabulary' ? '英文说明写作' : '中文叙事写作');
  let target;
  if (kind === 'writing') {
    store.submit('合成原答。', true, 'calendar-original');
    target = store.scheduleWritingRetest();
  } else if (kind === 'science') {
    store.startScience(store.writingContext(), {
      template: 'distance_displacement',
      outward: 6,
      backward: 4,
      direction: 'right'
    });
    store.submit(store.activeQuestion.validation.answer, true);
    target = store.scheduleScienceRetest();
  } else {
    const original = store.openVocabulary(store.writingContext(), 'recycle');
    const key = `${original.id}@${original.version}`;
    store.submitVocabulary(store.writingContext(), key, original.validation.answer);
    target = store.startVocabularyTask(store.writingContext(), key, 'retest');
  }
  store.focus(target.questionKey);
  return store;
}
function calendarFor(notify = vi.fn()) {
  const calendar = createLearningCalendar(notify);
  releases.push(() => calendar.dispose());
  return { calendar, notify };
}
describe('跨日读取不沿用昨日门禁', () => {
  it('原时区到期后不刷新记录也能重新检查写作门禁；读取不写事实', () => {
    const store = storeFor();
    const saved = store.exportData();
    expect(store.writingCanSubmit()).toBe(false);
    vi.setSystemTime(new Date('2026-10-07T07:00:00.000Z'));
    expect(store.writingCanSubmit()).toBe(true);
    expect(store.exportData()).toBe(saved);
  });
  it.each(['writing', 'science', 'vocabulary'])(
    '%s 可见视图跨日主动更新今日计划和门禁，没有新作答或自动恢复',
    (kind) => {
      const store = storeFor(kind),
        reader = store.observeCalendar();
      reader.show();
      const gate = computed(() => store[`${kind}CanSubmit`]());
      const saved = store.exportData();
      expect(store.summary.day).toBe('2026-10-06');
      const yesterdayPlan = store.summary.tasks.planId;
      expect(gate.value).toBe(false);
      vi.advanceTimersByTime(500);
      expect(gate.value).toBe(true);
      expect(store.summary.day).toBe('2026-10-07');
      expect(store.summary.tasks.denominator).toBe(1);
      expect(store.summary.tasks.planId).not.toBe(yesterdayPlan);
      expect(store.state.plans.find((plan) => plan.id === store.summary.tasks.planId).tasks[0].completedBy).toBeFalsy();
      expect(store.exportData()).toBe(saved);
      reader.dispose();
    }
  );
  it.each([
    ['2026-03-08T09:00:00Z', '2026-03-09T06:59:59.500Z', '2026-03-09'],
    ['2026-11-01T09:00:00Z', '2026-11-02T07:59:59.500Z', '2026-11-02']
  ])('原安排时区跨夏令时边界仍按当地日期；当前账户改时区不能提前提交 %s', (plannedAt, beforeDue, dueDay) => {
    vi.setSystemTime(new Date(plannedAt));
    const store = storeFor();
    expect(store.activeQuestion.writingExercise).toMatchObject({ plannedTimezone: 'America/Los_Angeles', dueDay });
    store.commit('timezone.set', { timezone: 'UTC' });
    vi.setSystemTime(new Date(beforeDue));
    const reader = store.observeCalendar();
    reader.show();
    const gate = computed(() => store.writingCanSubmit());
    const saved = store.exportData();
    expect(store.summary.day).toBe(dueDay);
    expect(gate.value).toBe(false);
    expect(() => store.submit('提前合成原答。', true)).toThrow('尚未到复测日期');
    vi.advanceTimersByTime(500);
    expect(gate.value).toBe(true);
    expect(store.exportData()).toBe(saved);
    reader.dispose();
  });
  it('停止和指定教法不随日历/时钟回拨改变；到期仍拒绝自动作答', () => {
    const store = storeFor();
    store.commit('strategy.set', {
      conversationId: store.active.id,
      method: 'steps',
      source: 'self_report',
      reason: '用户指定'
    });
    store.commit('task.stop', { conversationId: store.active.id });
    const saved = store.exportData(),
      reader = store.observeCalendar();
    reader.show();
    vi.advanceTimersByTime(500);
    expect(store.active.stopped).toBe(true);
    expect(() => store.submit('停止后原答。', true)).toThrow('停止');
    vi.setSystemTime(new Date('2026-10-06T06:59:00Z'));
    window.dispatchEvent(new Event('focus'));
    expect(store.summary.day).toBe('2026-10-05');
    expect(store.writingCanSubmit()).toBe(false);
    expect(store.exportData()).toBe(saved);
  });
});
describe('只管理自己的可见时间读取', () => {
  it('两个视图共用一个时钟；隐藏最后一个解绑，释放后迟到show无效，不清理外部计时器', () => {
    const { calendar, notify } = calendarFor();
    const outside = vi.fn();
    const externalTimer = setTimeout(outside, 1000);
    const first = calendar.observe(),
      second = calendar.observe();
    expect(vi.getTimerCount()).toBe(1);
    first.show();
    second.show();
    first.show();
    expect(vi.getTimerCount()).toBe(2);
    first.hide();
    vi.advanceTimersByTime(500);
    expect(notify).toHaveBeenLastCalledWith(Date.parse('2026-10-07T07:00:00Z'));
    second.dispose();
    expect(vi.getTimerCount()).toBe(1);
    const calls = notify.mock.calls.length;
    second.show();
    window.dispatchEvent(new Event('focus'));
    expect(notify).toHaveBeenCalledTimes(calls);
    first.show();
    expect(vi.getTimerCount()).toBe(2);
    calendar.dispose();
    expect(vi.getTimerCount()).toBe(1);
    first.show();
    vi.advanceTimersByTime(500);
    expect(outside).toHaveBeenCalledOnce();
    clearTimeout(externalTimer);
  });
  it('后台停止轮询；可见、焦点和恢复立即读取真实当前时间，隐藏时的focus不重启', () => {
    const hidden = vi.spyOn(document, 'hidden', 'get');
    const { calendar, notify } = calendarFor();
    const reader = calendar.observe();
    reader.show();
    hidden.mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(vi.getTimerCount()).toBe(0);
    const calls = notify.mock.calls.length;
    vi.setSystemTime(new Date('2026-10-08T07:00:00Z'));
    window.dispatchEvent(new Event('focus'));
    expect(notify).toHaveBeenCalledTimes(calls);
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(notify).toHaveBeenLastCalledWith(Date.now());
    for (const type of ['focus', 'pageshow']) {
      vi.setSystemTime(Date.now() + 120000);
      window.dispatchEvent(new Event(type));
      expect(notify).toHaveBeenLastCalledWith(Date.now());
      expect(vi.getTimerCount()).toBe(1);
    }
    reader.hide();
    vi.advanceTimersByTime(120000);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('store scope释放清除自己的时间资源；普通refresh无需启动轮询', () => {
    const store = storeFor();
    expect(vi.getTimerCount()).toBe(0);
    const reader = store.observeCalendar();
    reader.show();
    expect(vi.getTimerCount()).toBe(1);
    store.$dispose();
    expect(vi.getTimerCount()).toBe(0);
    reader.show();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('隐藏期间切换账户，refresh按新账户日期读取；日历不把旧任务带入新账户', () => {
    const store = storeFor();
    const saved = store.exportData(),
      reader = store.observeCalendar();
    reader.show();
    reader.hide();
    uni.setStorageSync('EXAM_USER_ID', 'calendar-other');
    vi.setSystemTime(new Date('2026-10-08T07:00:00Z'));
    store.refresh();
    expect(store.state.owner).toBe('calendar-other');
    expect(store.state.conversations).toEqual([]);
    expect(store.summary.day).toBe('2026-10-08');
    expect(vi.getTimerCount()).toBe(0);
    reader.show();
    expect(store.state.plans).toEqual([]);
    reader.hide();
    uni.removeStorageSync('EXAM_USER_ID');
    store.refresh();
    expect(store.exportData()).toBe(saved);
  });
});
