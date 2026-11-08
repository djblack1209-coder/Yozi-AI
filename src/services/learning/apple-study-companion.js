import { APP_CONNECTOR_PLUGIN } from './app-connector.js';
import { museGoals } from './muse-workspace-data.js';

export const EMPTY_WATCH_GLANCE = Object.freeze({ contract: 'glance-v1', available: false });

export function appleStudyBridge() {
  if (typeof plus === 'undefined' || plus.os?.name !== 'iOS') return null;
  try {
    const bridge = uni.requireNativePlugin?.(APP_CONNECTOR_PLUGIN);
    if (typeof bridge?.applyStudyCompanion !== 'function' || typeof bridge.studyNotificationPermission !== 'function')
      return null;
    return (method, input = {}) => new Promise((resolve) => bridge[method](input, resolve));
  } catch {
    return null;
  }
}

export function watchGlance(learning, session, jobs, now) {
  if (
    !session ||
    session.owner === 'guest' ||
    session.owner !== learning.state.owner ||
    learning.recordReadState !== 'ready' ||
    learning.accountRecordState !== 'ready'
  )
    return EMPTY_WATCH_GLANCE;
  const tasks = museGoals(learning.state, now)
    .filter((goal) => !goal.stopped && goal.current)
    .flatMap((goal) => goal.tasks.filter((task) => task.id !== 'diagnostic'));
  const summary = learning.summary;
  const next = jobs.reduce(
    (first, job) => (job.dueAt > now && (!first || job.dueAt < first.dueAt) ? job : first),
    null
  );
  return {
    contract: 'glance-v1',
    available: true,
    done: tasks.filter((task) => task.done).length + summary.tasks.numerator,
    total: tasks.length + summary.tasks.denominator,
    due:
      summary.due.length +
      learning.state.conversations.reduce(
        (total, conversation) => total + (conversation.coach?.library || []).filter((item) => item.due <= now).length,
        0
      ),
    ...(next ? { nextAt: next.dueAt, nextKind: next.kind } : {})
  };
}
