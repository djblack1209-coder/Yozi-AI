import { captureSession, checkSession } from '../auth-storage.js';
import { t, currentLanguage } from '@/i18n/index.js';
import { invoke } from '@tauri-apps/api/core';
import { isDesktopSettingsWindow } from '@/services/desktop/windows.js';
import { isDesktopRuntime } from '@/services/desktop/runtime.js';
import { storageService } from '@/services/storageService.js';
import { assert } from './learning-domain.js';
import { safeNavigateTo } from '@/utils/safe-navigate.js';
import { getCurrentRoute } from '@/utils/home-navigation.js';
import { appleStudyBridge, EMPTY_WATCH_GLANCE, watchGlance } from './apple-study-companion.js';

const CONSENT_KEY = 'learning_notification_consent_v1';
const controllers = new WeakMap();
export function learningNotificationsFor(learning) {
  let controller = controllers.get(learning);
  if (!controller || controller.isDisposed()) {
    controller = createLearningNotifications(
      learning,
      () => {
        if (getCurrentRoute() !== 'pages/learning/index') safeNavigateTo('/pages/learning/index');
      },
      invoke,
      () => {
        const route = getCurrentRoute();
        return !!route && route !== 'pages/splash/index';
      }
    );
    controllers.set(learning, controller);
    learning.attachNotifications?.(controller);
  }
  return controller;
}
export function notificationChannel(phone = appleStudyBridge()) {
  if (isDesktopRuntime()) return 'macos';
  if (phone) return 'ios';
  // #ifdef H5
  if (typeof window !== 'undefined' && typeof window.Notification === 'function') return 'web';
  // #endif
  return 'unsupported';
}

// 只在用户明确授权后使用。平台接纳不等于真实显示；web不提供退出应用后的调度。
export function createLearningNotifications(learning, onOpen, native = invoke, canOpen = () => true) {
  const phone = appleStudyBridge();
  const channel = notificationChannel(phone);
  const settingsWindow = isDesktopSettingsWindow();
  let token = null,
    sequence = 0,
    disposed = false,
    active = false,
    timer = null,
    openTimer = null;
  let running = Promise.resolve();
  let trustedIdentity = learning.notificationContext();
  const notices = new Set();
  const delivered = new Map();
  const opened = new Set();
  const waiting = new Map();
  let initialization = null;
  let stopListening = () => undefined;
  const context = () => learning.recordContext();
  const stopIdentity = storageService.onIdentityChange(() => {
    const status = checkSession(notificationSession);
    if (status !== 'changed') return;
    clearTimer();
    if (openTimer !== null) clearTimeout(openTimer);
    openTimer = null;
    notices.forEach((notice) => notice.close());
    notices.clear();
    waiting.clear();
    delivered.clear();
    notificationSession = captureSession();
    if (phone) clearPhone();
    if (active) tick();
    if (channel === 'macos' && token)
      native('replace_learning_notifications', { token, sequence: ++sequence, consent: false, jobs: [] }).catch(
        () => undefined
      );
  });
  let notificationSession = captureSession();
  const consent = () => storageService.get(CONSENT_KEY, null)?.context === learning.notificationContext();
  const current = (job) =>
    learning.state.conversations.some(
      (c) =>
        !c.stopped &&
        c.id === job.conversationId &&
        c.reminders?.some((r) => r.id === job.reminderId && r.generation === job.generation && r.enabled)
    );
  function open(job, expected, session) {
    if (disposed || typeof job?.id !== 'string' || opened.has(job.id)) return;
    if (checkSession(session) !== 'current' || !expected || context() !== expected) {
      waiting.delete(job.id);
      return;
    }
    // 冷启动的系统点击先保留；初始页面和启动页的默认导航完成后再返回任务。
    if (!canOpen()) {
      if (!waiting.has(job.id) && waiting.size < 20) waiting.set(job.id, { job, expected, session });
      scheduleOpen();
      return;
    }
    waiting.delete(job.id);
    try {
      learning.openReminder(job);
      learning.reminderReceipt(job, 'opened', channel, expected);
      opened.add(job.id);
      onOpen?.(job);
    } catch {
      /* 过期或其他账户提醒不导航、不恢复任务。 */
    }
  }
  function openNative(job) {
    const session = captureSession();
    if (!job || !Object.hasOwn(job, 'loginEpoch') || !session || job.loginEpoch !== session.epoch) return;
    const binding = delivered.get(job.id);
    if (binding) open(job, binding.expected, binding.session);
    // A cold-start click is accepted only with its original epoch and persisted consent.
    else if (consent()) open(job, context(), session);
  }
  function scheduleOpen() {
    if (active && openTimer === null && waiting.size) openTimer = setTimeout(drainOpen, 100);
  }
  function drainOpen() {
    openTimer = null;
    if (disposed || !active) return;
    for (const { job, expected, session } of waiting.values()) open(job, expected, session);
    scheduleOpen();
  }
  async function permission(request = false) {
    if (channel === 'macos') {
      const reply = await native('learning_notification_permission', { request, consent: request });
      return reply.permission;
    }
    if (phone) return (await phone('studyNotificationPermission', { request })).permission;
    if (channel === 'web') return request ? window.Notification.requestPermission() : window.Notification.permission;
    return 'unsupported';
  }
  async function allow() {
    const session = captureSession();
    const identity = learning.prepareNotificationConsent();
    const expected = context();
    learning.refresh();
    const result = await permission(true);
    assert(!disposed && context() === expected, 'CONTEXT_CHANGED', '账户或记录已变化，旧通知许可未保存');
    assert(result === 'granted', 'NOTIFICATION_PERMISSION', '通知未获授权，请在系统设置中允许后重试');
    assert(learning.notificationContext() === identity, 'CONTEXT_CHANGED', '学习记录已恢复，旧通知许可未保存');
    learning.ensureSessionCurrent?.();
    assert(
      storageService.save(CONSENT_KEY, { context: identity }, true, session),
      'STORAGE_FAILED',
      '通知许可未保存，请重试'
    );
    trustedIdentity = identity;
    return refresh();
  }
  function clearTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }
  function clearPhone() {
    // Clear the Watch summary even if the notification scheduler has stalled.
    phone('clearStudyGlance').catch(() => undefined);
    running = running
      .catch(() => undefined)
      .then(() => phone('applyStudyCompanion', { glance: EMPTY_WATCH_GLANCE }))
      .catch(() => undefined);
  }
  function refresh() {
    const pending = running.catch(() => undefined).then(performRefresh);
    running = pending;
    return pending;
  }
  async function performRefresh() {
    if (disposed) return null;
    const expected = context();
    const session = captureSession();
    if (checkSession(session) !== 'current') return null;
    {
      learning.refresh();
      if (channel === 'macos') {
        if (settingsWindow) {
          const receipt = await native('request_settings_notification_refresh');
          assert(receipt?.status !== 'failed', 'NOTIFICATION_FAILED', '系统提醒未确认，请返回主窗口核对');
          learning.refresh();
          return receipt;
        }
        if (!token) token = await native('begin_learning_notifications');
        const requested = consent() ? learning.reminderQueue().filter((j) => j.dueAt > Date.now() + 1000) : [];
        const jobs = requested.slice(0, 64);
        if (disposed || context() !== expected) return null;
        for (const job of jobs) delivered.set(job.id, { expected, session });
        const reply = await native('replace_learning_notifications', {
          token,
          sequence: ++sequence,
          consent: consent(),
          language: currentLanguage.value,
          jobs: jobs.map(({ accepted: _accepted, ...job }) => ({ ...job, loginEpoch: session.epoch }))
        });
        if (disposed || context() !== expected) return null;
        assert(
          reply?.ok && reply.cancelled === true && Array.isArray(reply.acceptedIds),
          'NOTIFICATION_FAILED',
          '系统提醒尚未完整确认，请重试'
        );
        assert(
          jobs.every((j) => reply.acceptedIds.includes(j.id)),
          'NOTIFICATION_FAILED',
          '部分提醒尚未安排，请重试'
        );
        const actions = await native('take_learning_notification_actions');
        if (!disposed && context() === expected) actions.forEach(openNative);
        return {
          channel,
          status: requested.length > 64 ? 'partial-scheduled' : jobs.length ? 'scheduled' : 'saved',
          count: jobs.length,
          total: requested.length
        };
      }
      if (phone) {
        const now = Date.now();
        const requested = consent() ? learning.reminderQueue(now).filter((job) => job.dueAt > now + 1000) : [];
        const jobs = requested.slice(0, 64);
        const receipt = await phone('applyStudyCompanion', {
          glance: watchGlance(learning, session, jobs, now),
          language: currentLanguage.value,
          jobs: jobs.map(({ id, dueAt, kind }) => ({ id, dueAt, kind }))
        });
        if (disposed || context() !== expected) return null;
        assert(
          receipt?.ok && jobs.every((job) => receipt.acceptedIds?.includes(job.id)),
          'NOTIFICATION_FAILED',
          '系统提醒尚未完整确认，请重试'
        );
        return {
          channel,
          status: requested.length > 64 ? 'partial-scheduled' : jobs.length ? 'scheduled' : 'saved',
          count: jobs.length,
          total: requested.length
        };
      }
      if (channel === 'web' && active && consent() && (await permission()) === 'granted') {
        const at = Date.now();
        const jobs = learning
          .reminderQueue(at)
          .filter((j) => !j.accepted && j.dueAt <= at && at - j.dueAt < 15 * 60000);
        for (const job of jobs) {
          if (disposed || context() !== expected || !current(job)) break;
          // 先记录未知状态，保存失败不投递；不确定回执不能自动重复发送。
          learning.reminderReceipt(job, 'unknown', 'web', expected);
          let notification;
          try {
            notification = new window.Notification('Yozi AI', {
              body:
                job.kind === 'review'
                  ? t('ui.notificationReview')
                  : job.kind === 'recap'
                    ? t('ui.notificationRecap')
                    : t('ui.notificationStudy'),
              tag: job.id
            });
            notices.add(notification);
            notification.onshow = () => {
              if (!disposed && context() === expected && current(job)) {
                try {
                  learning.reminderReceipt(job, 'accepted', 'web', expected);
                } catch {
                  /* 未确认不重复投递。 */
                }
              } else notification.close();
            };
            notification.onclick = () => {
              window.focus();
              open(job, expected, session);
              notification.close();
            };
            notification.onerror = () => {
              if (!disposed && context() === expected) {
                try {
                  learning.reminderReceipt(job, 'failed', 'web', expected);
                } catch {
                  /* 保留未确认状态。 */
                }
              }
            };
            notification.onclose = () => notices.delete(notification);
          } catch {
            learning.reminderReceipt(job, 'failed', 'web', expected);
          }
        }
      }
      return {
        channel,
        status: channel === 'unsupported' ? 'unsupported' : consent() ? 'active' : 'permission-required',
        count: 0
      };
    }
  }
  function tick() {
    clearTimer();
    if (disposed || !active) return;
    refresh()
      .catch(() => undefined)
      .finally(() => {
        if (!disposed && active) timer = setTimeout(tick, 15000);
      });
  }
  function show() {
    if (settingsWindow) return;
    active = true;
    scheduleOpen();
    tick();
  }
  function hide() {
    // A web page can still show its authorized notification in a background
    // tab. Closing the page stops this timer; native scheduling is independent.
    if (channel === 'web' && !disposed) return;
    active = false;
    clearTimer();
    if (openTimer !== null) clearTimeout(openTimer);
    openTimer = null;
  }
  function initialize() {
    if (initialization) return initialization;
    initialization = (async () => {
      if (channel === 'macos' && !settingsWindow) {
        const { listen } = await import('@tauri-apps/api/event');
        if (disposed) return;
        const actionListener = await listen('learning-notification-action', (event) => openNative(event.payload));
        const refreshListener = await listen('desktop-notifications-refresh', async (event) => {
          let receipt;
          try {
            receipt = await refresh();
          } catch {
            receipt = null;
          }
          await native('complete_settings_notification_refresh', {
            id: event.payload,
            receipt: receipt || { channel: 'macos', status: 'failed', count: 0, total: 0 }
          }).catch(() => undefined);
        });
        stopListening = () => {
          actionListener();
          refreshListener();
        };
        if (disposed) stopListening();
      }
      show();
    })().catch((error) => {
      stopListening();
      stopListening = () => undefined;
      initialization = null;
      throw error;
    });
    return initialization;
  }
  function dispose() {
    disposed = true;
    stopIdentity();
    delivered.clear();
    hide();
    stopListening();
    notices.forEach((n) => n.close());
    notices.clear();
    waiting.clear();
    if (phone && learning.notificationContext() !== trustedIdentity) clearPhone();
    if (channel === 'macos' && token && learning.notificationContext() !== trustedIdentity) {
      native('replace_learning_notifications', { token, sequence: ++sequence, jobs: [], consent: false }).catch(
        () => undefined
      );
    }
  }
  async function test() {
    if (channel !== 'macos') throw new Error('当前终端请保持页面打开，按保存的时间提醒');
    const result = await permission(true);
    assert(result === 'granted', 'NOTIFICATION_PERMISSION', '通知未获授权，请在系统设置中允许后重试');
    return native('test_learning_notification', { consent: true });
  }
  async function openSettings() {
    if (channel === 'macos') return native('open_learning_notification_settings');
    if (phone) {
      const receipt = await phone('openStudyNotificationSettings');
      assert(receipt?.ok, 'NOTIFICATION_FAILED', '请在系统设置中允许 Yozi AI 通知');
      return receipt;
    }
    throw new Error('请在浏览器网站设置中允许通知');
  }
  async function testDelivered() {
    if (channel !== 'macos') return false;
    const reply = await native('learning_notification_permission', { request: false, consent: false });
    return reply.testDelivered === true;
  }
  return {
    channel,
    allow,
    permission,
    test,
    testDelivered,
    openSettings,
    refresh,
    show,
    hide,
    initialize,
    dispose,
    isDisposed: () => disposed
  };
}
