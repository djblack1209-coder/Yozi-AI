import { journeyDate } from './learning-journey.js';
import { reviewFacts, coachReviewId } from './learning-adherence.js';
import { libraryItemPaused } from './learning-writing-corpus.js';

export const REMINDER_CONTRACT = 'learning-reminder-v1';

export const REMINDER_KINDS = Object.freeze([
  { id: 'study', label: '学习提醒' },
  { id: 'review', label: '到期复测' },
  { id: 'recap', label: '日终复盘' }
]);
export function coachDueItem(coach, at, events = [], conversationId = null) {
  const due = [...(coach?.library || [])]
    .filter(
      (item) =>
        item.due <= at &&
        !libraryItemPaused(item, at) &&
        !events.some(
          (e) =>
            ['review.skip', 'review.reschedule'].includes(e.type) &&
            e.data.conversationId === conversationId &&
            e.data.reviewId === coachReviewId(item.id, item.due) &&
            e.at <= at &&
            e.result.availableAt > at
        )
    )
    .sort((a, b) => a.due - b.due);
  const opened = events
    .filter((e) => e.type === 'review.open' && e.data.conversationId === conversationId && e.at <= at)
    .at(-1);
  return due.find((item) => item.id === opened?.result.itemId) || due[0] || null;
}

export function applyReminderOperation(state, operation, { assert, dayKey, normalizeSchedule }) {
  const { data, id, at } = operation;
  const session = state.conversations.find((c) => c.id === data.conversationId);
  assert(session?.journey || session?.coach?.profile || session?.studyProfile, 'NOT_FOUND', '请先保存学习目标');
  if (['reminder.complete', 'reminder.cancel'].includes(operation.type)) {
    assert(data.explicit === true, 'EXPLICIT_REQUIRED', '请确认提醒变更');
    assert(
      Object.keys(data).every((k) =>
        ['conversationId', 'reminderId', 'sourceRefs', 'proposalId', 'explicit'].includes(k)
      ),
      'INVALID_INPUT',
      '提醒包含未知字段'
    );
    const reminder = session.reminders?.find((r) => r.id === data.reminderId);
    assert(reminder, 'NOT_FOUND', '原提醒不存在');
    reminder.enabled = false;
    reminder.status = operation.type === 'reminder.complete' ? 'completed' : 'cancelled';
    reminder.generation = id;
    reminder.version += 1;
    reminder.at = at;
    return reminder;
  }
  if (operation.type === 'reminder.set' && data.contract === 'learning-reminder-v2') {
    assert(
      Object.keys(data).every((k) =>
        [
          'conversationId',
          'reminderId',
          'kind',
          'schedule',
          'enabled',
          'contract',
          'sourceRefs',
          'proposalId',
          'explicit'
        ].includes(k)
      ),
      'INVALID_INPUT',
      '提醒包含未知字段'
    );
    assert(
      REMINDER_KINDS.some((k) => k.id === data.kind) && typeof data.enabled === 'boolean',
      'INVALID_INPUT',
      '提醒类型不合法'
    );
    assert(!data.enabled || (!session.stopped && !session.goalLifecycle), 'STOPPED', '目标已停止');
    const schedule = normalizeSchedule(data.schedule);
    const reminders = session.reminders || [];
    const previous = data.reminderId && reminders.find((r) => r.id === data.reminderId);
    assert(!data.reminderId || previous, 'NOT_FOUND', '原提醒不存在');
    assert(previous || reminders.length < 20, 'RESOURCE_LIMIT', '每个目标最多20条提醒');
    const reminder = {
      contract: 'learning-reminder-v2',
      id: previous?.id || id,
      generation: id,
      version: (previous?.version || 0) + 1,
      kind: data.kind,
      schedule,
      time: schedule.time,
      timezone: schedule.timezone,
      repeatDays: schedule.repeatDays || [],
      enabled: data.enabled,
      status: 'active',
      at
    };
    session.reminders = [...reminders.filter((r) => r.id !== reminder.id), reminder];
    return reminder;
  }
  if (operation.type === 'reminder.set') {
    assert(
      Object.keys(data).every((key) =>
        ['conversationId', 'reminderId', 'kind', 'time', 'repeatDays', 'timezone', 'enabled'].includes(key)
      ),
      'INVALID_INPUT',
      '提醒包含未知字段'
    );
    assert(
      REMINDER_KINDS.some((k) => k.id === data.kind) && typeof data.enabled === 'boolean',
      'INVALID_INPUT',
      '提醒类型或开关不合法'
    );
    assert(!data.enabled || !session.stopped, 'STOPPED', '目标已暂停，请先继续学习');
    assert(
      typeof data.time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(data.time),
      'INVALID_INPUT',
      '提醒时间须为00:00至23:59'
    );
    assert(
      Array.isArray(data.repeatDays) &&
        data.repeatDays.length >= 1 &&
        data.repeatDays.length <= 7 &&
        new Set(data.repeatDays).size === data.repeatDays.length &&
        data.repeatDays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6),
      'INVALID_INPUT',
      '请选择有效的重复日'
    );
    assert(typeof data.timezone === 'string' && data.timezone.length <= 80, 'INVALID_INPUT', '提醒时区不合法');
    dayKey(at, data.timezone);
    const reminders = session.reminders || [];
    const previous = data.reminderId
      ? reminders.find((r) => r.id === data.reminderId)
      : reminders.find((r) => r.kind === data.kind && r.contract === REMINDER_CONTRACT);
    assert(!data.reminderId || previous, 'NOT_FOUND', '原提醒不存在');
    assert(
      previous || reminders.filter((r) => r.contract === REMINDER_CONTRACT).length < 3,
      'RESOURCE_LIMIT',
      '每个目标最多三类提醒'
    );
    const reminder = {
      contract: REMINDER_CONTRACT,
      id: previous?.id || id,
      generation: id,
      version: (previous?.version || 0) + 1,
      kind: data.kind,
      time: data.time,
      repeatDays: [...data.repeatDays].sort(),
      timezone: data.timezone,
      enabled: data.enabled,
      at
    };
    session.reminders = [...reminders.filter((r) => r.id !== reminder.id), reminder];
    return reminder;
  }
  if (operation.type === 'reminder.receipt') {
    assert(
      Object.keys(data).every((key) =>
        ['conversationId', 'reminderId', 'generation', 'day', 'status', 'channel', 'historyOnly'].includes(key)
      ),
      'INVALID_INPUT',
      '通知回执包含未知字段'
    );
    const reminder = session.reminders?.find((r) => r.id === data.reminderId && r.generation === data.generation);
    assert(reminder, 'CONTEXT_CHANGED', '提醒已修改，旧回执未接纳');
    assert(
      journeyDate(data.day) !== null &&
        ['accepted', 'failed', 'unknown', 'opened'].includes(data.status) &&
        ['web', 'macos'].includes(data.channel),
      'INVALID_INPUT',
      '通知回执不合法'
    );
    // 平台接纳与点击均是终端回执，不授予判分、完成或通知实际送达的权威。
    session.reminderReceipts = [
      ...(session.reminderReceipts || []).slice(-199),
      {
        id,
        reminderId: reminder.id,
        generation: reminder.generation,
        day: data.day,
        status: data.status,
        channel: data.channel,
        historyOnly: !!data.historyOnly,
        at
      }
    ];
    return { recorded: true, status: data.status };
  }
  assert(false, 'UNKNOWN_TOOL', '提醒操作不支持');
}

// 按原时区的日历时间计算；夏令时不存在的时刻不猜成另一个时间。
export function reminderInstant(day, time, timezone) {
  if (journeyDate(day) === null || !/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(time || '')) return null;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });
  const target = Date.parse(`${day}T${time}:00Z`);
  let instant = target;
  for (let i = 0; i < 4; i++) {
    const values = Object.fromEntries(formatter.formatToParts(new Date(instant)).map((p) => [p.type, p.value]));
    const observed = Date.parse(
      `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}Z`
    );
    if (observed === target) return instant;
    instant += target - observed;
  }
  return null;
}

export function reminderJobs(state, at, { dayKey }) {
  const jobs = [];
  for (const session of state.conversations) {
    if (
      (!session.journey && !session.coach?.profile && !session.studyProfile) ||
      session.stopped ||
      session.goalLifecycle
    )
      continue;
    const program = session.journey;
    const profile = session.studyProfile;
    const coach = session.coach?.profile ? session.coach : null;
    const keys = new Set(state.attempts.filter((a) => a.conversationId === session.id).map((a) => a.questionKey));
    for (const reminder of session.reminders || []) {
      if (!reminder.enabled) continue;
      if (reminder.schedule?.mode === 'once') {
        const day = reminder.schedule.date;
        const dueAt = reminderInstant(day, reminder.time, reminder.timezone);
        const accepted = session.reminderReceipts?.some(
          (r) => !r.historyOnly && r.reminderId === reminder.id && r.generation === reminder.generation && r.day === day
        );
        if (dueAt !== null && reminder.status === 'active')
          jobs.push({
            id: `${reminder.id}:${reminder.version}:${day}`,
            conversationId: session.id,
            reminderId: reminder.id,
            generation: reminder.generation,
            kind: reminder.kind,
            dueAt,
            day,
            questionKey: null,
            accepted: !!accepted
          });
        continue;
      }
      const today = dayKey(at, reminder.timezone);
      for (let offset = 0; offset < (coach || profile ? 28 : 7); offset++) {
        const day = new Date((journeyDate(today) + offset) * 86400000).toISOString().slice(0, 10);
        if (!reminder.repeatDays.includes(new Date(`${day}T12:00:00Z`).getUTCDay())) continue;
        const dueAt = reminderInstant(day, reminder.time, reminder.timezone);
        if (
          dueAt === null ||
          day < (coach ? coach.startedDay : program?.startDay || dayKey(session.at, reminder.timezone)) ||
          (coach
            ? coach.profile.deadline && day > coach.profile.deadline
            : program
              ? journeyDate(day) >= journeyDate(program.startDay) + program.durationDays
              : profile?.deadline && day > profile.deadline)
        )
          continue;
        const groups = (session.trainingGroups || []).filter((g) => g.day === day);
        const coachDay = coach?.days.find((item) => item.day === day);
        const allSubmitted = coach
          ? !!coachDay?.completed
          : program
            ? program.moduleIds.every((id) => groups.some((g) => g.moduleId === id && g.submittedBy))
            : false;
        const complete = coach
          ? !!coachDay?.completed
          : (session.recaps || []).some((r) => r.kind === 'day' && r.day === day && r.complete);
        let questionKey = null;
        let reviewId = null;
        if (reminder.kind === 'study' && allSubmitted) continue;
        if (reminder.kind === 'recap' && complete) continue;
        if (reminder.kind === 'review') {
          if (coach) {
            reviewId = coachDueItem(coach, dueAt, state.events, session.id)?.id || null;
            if (!reviewId) continue;
          } else {
            const review = reviewFacts(state, dueAt, { conversationId: session.id }).find(
              (r) => !r.cancelled && !r.completedBy && keys.has(r.questionKey) && r.availableAt <= dueAt
            );
            const group = groups.find((g) => !g.submittedBy && g.day >= today);
            questionKey = review?.questionKey || group?.questionKeys[0] || null;
            if (!questionKey) continue;
          }
        }
        const accepted = session.reminderReceipts?.some(
          (r) =>
            !r.historyOnly &&
            r.reminderId === reminder.id &&
            r.generation === reminder.generation &&
            r.day === day &&
            ['accepted', 'failed', 'unknown', 'opened'].includes(r.status)
        );
        jobs.push({
          id: `${reminder.id}:${reminder.version}:${day}`,
          conversationId: session.id,
          reminderId: reminder.id,
          generation: reminder.generation,
          kind: reminder.kind,
          dueAt,
          day,
          questionKey,
          ...(reviewId ? { reviewId } : {}),
          accepted: !!accepted
        });
      }
    }
  }
  return jobs.sort((a, b) => a.dueAt - b.dueAt);
}
