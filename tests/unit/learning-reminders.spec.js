import { getLoginSessionEpoch } from '@/services/auth-storage.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { setLanguage, t } from '@/i18n/index.js';
const host = vi.hoisted(() => ({ desktop: false, listener: null, native: null }));
vi.mock('@/services/desktop/runtime.js', () => ({ isDesktopRuntime: () => host.desktop }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args) => host.native(...args) }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: async (event, callback) => {
    if (event === 'learning-notification-action') host.listener = callback;
    return () => {
      if (event === 'learning-notification-action') host.listener = null;
    };
  }
}));
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { createLearningNotifications, learningNotificationsFor } from '@/services/learning/learning-notifications.js';
import { EMPTY_WATCH_GLANCE, watchGlance } from '@/services/learning/apple-study-companion.js';
import SplashPage from '@/pages/splash/index.vue';
import { storageService } from '@/services/storageService.js';
import { reminderInstant } from '../../laf-backend/functions/_shared/learning-reminders.js';
import { prepareLearningRestore } from '@/services/learning/learning-backup.js';
import { applyLearningOperation, emptyLearningState } from '@/services/learning/learning-domain.js';
import { learningWriteLease } from '@/services/learning/learning-write-lease.js';
let controller, shown;
beforeEach(() => {
  uni.clearStorageSync();
  setLanguage('zh-CN');
  setActivePinia(createPinia());
  host.desktop = false;
  shown = [];
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-10T10:00:00Z'));
  class Notification {
    static permission = 'granted';
    static requestPermission = async () => 'granted';
    constructor(title, options) {
      this.title = title;
      this.options = options;
      shown.push(this);
    }
    close() {
      this.onclose?.();
    }
  }
  vi.stubGlobal('Notification', Notification);
});
afterEach(() => {
  controller?.dispose();
  controller = null;
  for (const s of getActivePinia()?._s.values() || []) s.$dispose();
  learningWriteLease.release();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  uni.clearStorageSync();
});
function setup() {
  const s = useConversationLearningStore();
  s.start('提醒闭环');
  s.configureJourney(s.journeyContext(), {
    title: '7天运算',
    startDay: '2026-10-10',
    durationDays: 7,
    minutes: 30,
    mode: 'batch',
    moduleIds: ['arithmetic-add']
  });
  s.configureReminder(s.journeyContext(), {
    kind: 'study',
    time: '18:00',
    timezone: 'Asia/Shanghai',
    repeatDays: [0, 1, 2, 3, 4, 5, 6],
    enabled: true
  });
  return s;
}
describe('提醒日期、原任务、权限与回执', () => {
  it('exposes only the current account’s saved counts and next authorized reminder to the watch', () => {
    const now = Date.now();
    const state = emptyLearningState('watch-owner', 'UTC');
    const learning = {
      state,
      summary: { tasks: { numerator: 2, denominator: 3 }, due: [{ questionKey: 'private-question' }] },
      recordReadState: 'ready',
      accountRecordState: 'ready'
    };
    const jobs = [
      { id: 'completed', kind: 'study', dueAt: now - 1000 },
      { id: 'later', kind: 'recap', dueAt: now + 120000 },
      { id: 'next', kind: 'review', dueAt: now + 60000 }
    ];
    const session = { owner: state.owner };
    expect(watchGlance(learning, session, jobs, now)).toEqual({
      contract: 'glance-v1',
      available: true,
      done: 2,
      total: 3,
      due: 1,
      nextAt: now + 60000,
      nextKind: 'review'
    });
    expect(watchGlance(learning, { owner: 'another-account' }, jobs, now)).toBe(EMPTY_WATCH_GLANCE);
    expect(watchGlance({ ...learning, accountRecordState: 'loading' }, session, jobs, now)).toBe(EMPTY_WATCH_GLANCE);
  });
  it('clears the Watch at logout while the previous notification request is pending', async () => {
    await storageService.saveLoginSession({ userId: 'watch-logout', token: 'fixture-only-token', userInfo: {} });
    const learning = setup();
    let received;
    const firstRequest = new Promise((resolve) => {
      received = resolve;
    });
    const applyStudyCompanion = vi
      .fn((_input, reply) => reply({ ok: true, acceptedIds: [] }))
      .mockImplementationOnce((_input, reply) => received(reply));
    const clearStudyGlance = vi.fn((_input, reply) => reply({ ok: true }));
    vi.stubGlobal('plus', { os: { name: 'iOS' } });
    vi.stubGlobal('uni', {
      ...uni,
      requireNativePlugin: () => ({ applyStudyCompanion, clearStudyGlance, studyNotificationPermission: vi.fn() })
    });
    controller = createLearningNotifications(learning);
    const pending = controller.refresh();
    const finish = await firstRequest;
    expect(applyStudyCompanion.mock.calls[0][0].glance.available).toBe(true);
    expect(await storageService.remove('EXAM_TOKEN', true)).toBe(true);
    const clearedWhilePending = clearStudyGlance.mock.calls.length;
    const requestedWhilePending = applyStudyCompanion.mock.calls.length;
    finish({ ok: true, acceptedIds: [] });
    expect(clearedWhilePending).toBe(1);
    expect(requestedWhilePending).toBe(1);
    await expect(pending).resolves.toBeNull();
    await controller.refresh();
    expect(applyStudyCompanion).toHaveBeenCalledWith({ glance: EMPTY_WATCH_GLANCE }, expect.any(Function));
    expect(applyStudyCompanion.mock.calls.slice(1).every(([input]) => !input.glance.available)).toBe(true);
  });
  it('tests the OS channel without changing learning consent or replacing saved jobs', async () => {
    host.desktop = true;
    host.native = vi.fn(async (command) =>
      command === 'learning_notification_permission' ? { permission: 'granted' } : { ok: true }
    );
    const s = useConversationLearningStore(),
      before = JSON.stringify(s.state);
    controller = createLearningNotifications(s);
    await controller.test();
    expect(host.native.mock.calls.map(([command]) => command)).toEqual([
      'learning_notification_permission',
      'test_learning_notification'
    ]);
    expect(JSON.stringify(s.state)).toBe(before);
    expect(storageService.get('learning_notification_consent_v1', null)).toBeNull();
  });
  it('夏令时切换按原时区日历，缺失时刻不猜测或提前触发', () => {
    expect(reminderInstant('2026-03-08', '08:00', 'America/Los_Angeles')).toBe(Date.parse('2026-03-08T15:00:00Z'));
    expect(reminderInstant('2026-11-01', '08:00', 'America/Los_Angeles')).toBe(Date.parse('2026-11-01T16:00:00Z'));
    expect(reminderInstant('2026-03-08', '02:30', 'America/Los_Angeles')).toBeNull();
    expect(reminderInstant('2026-02-30', '08:00', 'Asia/Shanghai')).toBeNull();
  });
  it.each(['zh-CN', 'en'])(
    '允许通知前不投递，未知/失败回执不自动重复，显示后回到原任务且不写作答 %s',
    async (language) => {
      setLanguage(language);
      const s = setup(),
        opened = vi.fn();
      controller = createLearningNotifications(s, opened);
      await controller.initialize();
      await controller.refresh();
      expect(shown).toHaveLength(0);
      await controller.allow();
      expect(shown).toHaveLength(1);
      expect(shown[0].options.body).toBe(t('ui.notificationStudy'));
      expect(s.active.reminderReceipts.at(-1).status).toBe('unknown');
      await controller.refresh();
      expect(shown).toHaveLength(1);
      shown[0].onshow();
      expect(s.active.reminderReceipts.at(-1).status).toBe('accepted');
      shown[0].onclick();
      expect(opened).toHaveBeenCalledTimes(1);
      expect(s.state.attempts).toHaveLength(0);
      expect(s.active.stopped).toBe(false);
    }
  );
  it('暂停、改期和任务停止使旧提醒失效，备份只保留历史终端回执', async () => {
    const s = setup();
    controller = createLearningNotifications(s);
    await controller.initialize();
    await controller.allow();
    const reminder = s.active.reminders[0],
      oldJob = s.reminderQueue()[0];
    s.configureReminder(s.journeyContext(), {
      reminderId: reminder.id,
      kind: reminder.kind,
      time: '19:00',
      timezone: reminder.timezone,
      repeatDays: reminder.repeatDays,
      enabled: false
    });
    expect(s.reminderQueue()).toEqual([]);
    expect(() => s.openReminder(oldJob)).toThrow();
    s.commit('task.stop', { conversationId: s.active.id });
    expect(s.reminderQueue()).toEqual([]);
    const restored = prepareLearningRestore(emptyLearningState(s.state.owner, s.state.timezone), s.exportData());
    expect(restored.state.conversations[0].reminderReceipts[0].historyOnly).toBe(true);
    expect(restored.state.conversations[0].stopped).toBe(true);
  });
  it('原生安排与撤销串行执行，取消需要真实回执，正常退出保留已授权系统安排', async () => {
    host.desktop = true;
    const s = setup(),
      calls = [];
    const native = vi.fn(async (command, args) => {
      calls.push({ command, args });
      if (command === 'begin_learning_notifications') return 'native-session';
      if (command === 'learning_notification_permission') return { permission: 'granted' };
      if (command === 'take_learning_notification_actions') return [];
      return { ok: true, cancelled: true, acceptedIds: args.jobs.map((j) => j.id) };
    });
    controller = createLearningNotifications(s, undefined, native);
    await controller.initialize();
    await controller.allow();
    const scheduled = calls.filter((c) => c.command === 'replace_learning_notifications').at(-1);
    expect(scheduled.args.language).toBe('zh-CN');
    expect(scheduled.args.jobs.length).toBeGreaterThan(0);
    expect(scheduled.args.jobs[0]).not.toHaveProperty('accepted');
    const before = calls.length;
    controller.dispose();
    expect(calls).toHaveLength(before);
    controller = createLearningNotifications(s, undefined, native);
    await controller.initialize();
    const reminder = s.active.reminders[0];
    s.configureReminder(s.journeyContext(), {
      kind: reminder.kind,
      time: reminder.time,
      timezone: reminder.timezone,
      repeatDays: reminder.repeatDays,
      enabled: false
    });
    await controller.refresh();
    expect(calls.filter((c) => c.command === 'replace_learning_notifications').at(-1).args.jobs).toEqual([]);
    const sequences = calls
      .filter((c) => c.command === 'replace_learning_notifications' && c.args.jobs.length)
      .map((c) => c.args.sequence);
    expect(sequences.every((n) => n >= 1)).toBe(true);
  });
  it('全局通知观察者不因相同记录的只读刷新产生循环原生核对', async () => {
    host.desktop = true;
    const s = setup();
    const native = vi.fn(async (command, args) => {
      if (command === 'begin_learning_notifications') return 'native-session';
      if (command === 'take_learning_notification_actions') return [];
      return { ok: true, cancelled: true, acceptedIds: args.jobs.map((j) => j.id) };
    });
    controller = createLearningNotifications(s, undefined, native);
    s.attachNotifications(controller);
    await controller.initialize();
    await controller.refresh();
    await vi.advanceTimersByTimeAsync(300);
    const before = native.mock.calls.filter(([command]) => command === 'replace_learning_notifications').length;
    await vi.advanceTimersByTimeAsync(2000);
    expect(native.mock.calls.filter(([command]) => command === 'replace_learning_notifications').length).toBe(before);
  });
  it('测试通知的送达只采用系统真实布尔回执，接纳或缺失字段都不冒充送达', async () => {
    host.desktop = true;
    const native = vi.fn().mockResolvedValue({ ok: true, permission: 'granted' });
    controller = createLearningNotifications(setup(), undefined, native);
    expect(await controller.testDelivered()).toBe(false);
    native.mockResolvedValue({ ok: true, permission: 'granted', testDelivered: 1 });
    expect(await controller.testDelivered()).toBe(false);
    native.mockResolvedValue({ ok: true, permission: 'granted', testDelivered: true });
    expect(await controller.testDelivered()).toBe(true);
    expect(native).toHaveBeenLastCalledWith('learning_notification_permission', { request: false, consent: false });
  });
  it('冷启动领取系统点击只返回原任务一次，不替用户作答', async () => {
    host.desktop = true;
    const s = setup(),
      job = { ...s.reminderQueue()[0], loginEpoch: getLoginSessionEpoch() },
      opened = vi.fn();
    s.start('另一个学习目标');
    storageService.save('learning_notification_consent_v1', { context: s.notificationContext() }, true);
    let queued = [job];
    const native = vi.fn(async (command, args) => {
      if (command === 'begin_learning_notifications') return 'native-session';
      if (command === 'take_learning_notification_actions') {
        const actions = queued;
        queued = [];
        return actions;
      }
      return { ok: true, cancelled: true, acceptedIds: args.jobs.map((j) => j.id) };
    });
    controller = createLearningNotifications(s, opened, native);
    await controller.initialize();
    await controller.refresh();
    host.listener({ payload: job });
    expect(s.active.id).toBe(job.conversationId);
    expect(s.state.attempts).toHaveLength(0);
    expect(s.active.reminderReceipts.filter((r) => r.status === 'opened')).toHaveLength(1);
    expect(opened).toHaveBeenCalledTimes(1);
  });
  it('启动页完成前保留系统点击，学习入口就绪后只返回原任务一次', async () => {
    host.desktop = true;
    const s = setup(),
      job = { ...s.reminderQueue()[0], loginEpoch: getLoginSessionEpoch() };
    s.start('另一个学习目标');
    storageService.save('learning_notification_consent_v1', { context: s.notificationContext() }, true);
    let queued = [job],
      route = '',
      splash;
    vi.stubGlobal('getCurrentPages', () => (route ? [{ route }] : []));
    storageService.save('onboarding_completed', true);
    vi.spyOn(uni, 'navigateTo').mockImplementation(({ url, success }) => {
      route = url.slice(1);
      splash?.unmount();
      splash = null;
      success?.();
    });
    vi.spyOn(uni, 'redirectTo').mockImplementation(({ url, success }) => {
      route = url.slice(1);
      splash?.unmount();
      splash = null;
      success?.();
    });
    host.native = async (command, args) => {
      if (command === 'begin_learning_notifications') return 'native-session';
      if (command === 'take_learning_notification_actions') {
        const actions = queued;
        queued = [];
        return actions;
      }
      return { ok: true, cancelled: true, acceptedIds: args.jobs.map((j) => j.id) };
    };
    controller = learningNotificationsFor(s);
    try {
      await controller.initialize();
      await controller.refresh();
      expect(uni.navigateTo).not.toHaveBeenCalled();
      expect(s.state.conversations.find((c) => c.id === job.conversationId).reminderReceipts || []).toEqual([]);
      route = 'pages/splash/index';
      splash = mount(SplashPage, {
        global: { stubs: { view: { template: '<div><slot /></div>' }, text: { template: '<span><slot /></span>' } } }
      });
      await vi.advanceTimersByTimeAsync(1900);
      expect(route).toBe('pages/learning/index');
      expect(s.active.id).toBe(job.conversationId);
      host.listener({ payload: job });
      await vi.advanceTimersByTimeAsync(2000);
      expect(route).toBe('pages/learning/index');
      expect(uni.redirectTo).toHaveBeenCalledTimes(1);
      expect(uni.navigateTo).not.toHaveBeenCalled();
      expect(s.active.reminderReceipts.filter((r) => r.status === 'opened')).toHaveLength(1);
      expect(s.state.attempts).toHaveLength(0);
    } finally {
      splash?.unmount();
    }
  });
  it('停止后的迟到系统点击不切换目标、写回执或解除停止', async () => {
    host.desktop = true;
    const s = setup(),
      job = { ...s.reminderQueue()[0], loginEpoch: getLoginSessionEpoch() },
      opened = vi.fn();
    s.commit('task.stop', { conversationId: s.active.id });
    const current = s.start('另一个学习目标').id;
    const native = vi.fn(async (command, args) => {
      if (command === 'begin_learning_notifications') return 'native-session';
      if (command === 'take_learning_notification_actions') return [job];
      return { ok: true, cancelled: true, acceptedIds: args.jobs.map((j) => j.id) };
    });
    controller = createLearningNotifications(s, opened, native);
    await controller.initialize();
    await controller.refresh();
    host.listener({ payload: job });
    expect(s.selectedConversationId).toBe(current);
    expect(s.state.conversations.find((c) => c.id === job.conversationId).stopped).toBe(true);
    expect(s.state.conversations.find((c) => c.id === job.conversationId).reminderReceipts || []).toEqual([]);
    expect(opened).not.toHaveBeenCalled();
    expect(() => s.openReminder(job)).toThrow();
  });
  it.each(['停止', '改期', '账户切换', '恢复'])('启动等待期间%s后不返回旧任务或写打开回执', async (change) => {
    host.desktop = true;
    const s = setup(),
      job = { ...s.reminderQueue()[0], loginEpoch: getLoginSessionEpoch() },
      opened = vi.fn();
    let ready = false,
      queued = [job];
    const native = async (command, args) => {
      if (command === 'begin_learning_notifications') return 'native-session';
      if (command === 'take_learning_notification_actions') {
        const actions = queued;
        queued = [];
        return actions;
      }
      return { ok: true, cancelled: true, acceptedIds: args.jobs.map((j) => j.id) };
    };
    controller = createLearningNotifications(s, opened, native, () => ready);
    await controller.initialize();
    await controller.refresh();
    if (change === '停止') s.commit('task.stop', { conversationId: job.conversationId });
    if (change === '改期')
      s.configureReminder(s.journeyContext(), {
        reminderId: job.reminderId,
        kind: 'study',
        time: '19:00',
        timezone: 'Asia/Shanghai',
        repeatDays: [0, 1, 2, 3, 4, 5, 6],
        enabled: true
      });
    if (change === '恢复') {
      const backup = JSON.stringify(
        applyLearningOperation(JSON.parse(s.exportData()), {
          id: 'restored-new-goal',
          type: 'conversation.start',
          at: Date.now(),
          data: { goal: '备份中的新目标' }
        }).state
      );
      s.restoreData(backup, s.previewRestore(backup));
    }
    if (change === '账户切换') {
      uni.setStorageSync('EXAM_USER_ID', 'other-notification-user');
      s.refresh();
    }
    const current = s.start('另一个学习目标').id;
    ready = true;
    await vi.advanceTimersByTimeAsync(500);
    expect(s.selectedConversationId).toBe(current);
    expect(s.state.conversations.flatMap((c) => c.reminderReceipts || []).filter((r) => r.status === 'opened')).toEqual(
      []
    );
    expect(opened).not.toHaveBeenCalled();
    expect(s.state.attempts).toHaveLength(0);
  });
  it('已交卷的迟到学习提醒和篡改返回字段不切换当前目标', () => {
    const s = setup(),
      job = { ...s.reminderQueue()[0], loginEpoch: getLoginSessionEpoch() },
      group = s.startTraining(s.journeyContext(), 'arithmetic-add', 1);
    s.submitTraining(s.journeyContext(), group.id, ['12']);
    const current = s.start('另一个学习目标').id;
    expect(() => s.openReminder(job)).toThrow();
    expect(s.selectedConversationId).toBe(current);
    expect(() => s.openReminder({ ...job, conversationId: current, reminderId: 'wrong-reminder' })).toThrow();
    expect(s.selectedConversationId).toBe(current);
    expect(s.state.attempts).toHaveLength(1);
  });
});

describe('阶段5通知入口绑定', () => {
  it.each(['web', 'macos'])('writes-5: delayed %s click keeps its delivered epoch', async (channel) => {
    await storageService.saveLoginSession({ userId: 'audit5-notice', token: 'fixture-only-token', userInfo: {} });
    host.desktop = channel === 'macos';
    const s = setup(),
      opened = vi.fn();
    let delivered;
    const native = vi.fn(async (command, args) => {
      if (command === 'begin_learning_notifications') return 'audit5-native';
      if (command === 'learning_notification_permission') return { permission: 'granted' };
      if (command === 'take_learning_notification_actions') return [];
      if (command === 'replace_learning_notifications') {
        if (args.jobs.length) delivered = args.jobs[0];
        return { ok: true, cancelled: true, acceptedIds: args.jobs.map((job) => job.id) };
      }
    });
    controller = createLearningNotifications(s, opened, native);
    await controller.initialize();
    await controller.allow();
    const notice = shown[0];
    const before = s.state.events.length;
    await storageService.saveLoginSession({ userId: 'audit5-notice', token: 'fixture-only-token', userInfo: {} });
    if (channel === 'web') notice.onclick();
    else host.listener({ payload: delivered });
    expect(opened).not.toHaveBeenCalled();
    expect(s.state.events).toHaveLength(before);
    expect(s.state.events.at(-1)?.data?.status).not.toBe('opened');
  });
});
