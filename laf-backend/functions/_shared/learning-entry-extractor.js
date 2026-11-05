import { entryCandidateOperation, entryObjects } from './learning-entries.js';
import { dayKey, applyLearningOperation } from './learning-domain.js';

// Intentionally narrow, deterministic rules. Never reads attachments or calls a model.
export function extractConversationEntries(state, conversationId, messageId, now = Date.now()) {
  const c = state.conversations.find((c) => c.id === conversationId);
  const m = c?.messages.find((m) => m.id === messageId);
  if (
    !m ||
    m.role !== 'user' ||
    m.questionKey ||
    m.attemptId ||
    (c.goalLifecycle && !/^(?:重开目标|目标重开|目标归档)[。.]?$/u.test(m.content)) ||
    /我的答案|答案是|题干|资料说|他说|她说|假如|假设|不要|不想|开玩笑|跳过|[“”「」"]/u.test(m.content)
  )
    return [];
  const text = m.content;
  const sourceRefs = [{ conversationId, messageId, start: 0, end: text.length }];
  const calls = [];
  const add = (kind, fields) => calls.push(['entry.create', { kind, fields, sourceRefs }]);
  const update = (kind, entry, patch) => {
    if (entry) calls.push(['entry.update', { kind, id: entry.id, basis: entry.basis, patch, sourceRefs }]);
  };
  if (/^(?:我的目标是|我要准备)/u.test(text) && /考研英语[一二]/u.test(text)) {
    const deadline = text.match(/\d{4}年\d{1,2}月\d{1,2}日/u);
    const minutes = text.match(/每天(\d{1,3})分钟/u);
    add('Goal', {
      goal: text.split(/[，,]/u)[0].replace(/^我的目标是/u, ''),
      category: 'kaoyan',
      exam: text.includes('英语二') ? 'english2' : 'english1',
      subjects: [text.includes('写作') ? '英语写作' : '英语'],
      minutes: minutes ? Number(minutes[1]) : null,
      deadline: deadline
        ? deadline[0].replace(
            /(\d{4})年(\d{1,2})月(\d{1,2})日/u,
            (_, y, m, d) => `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
          )
        : null,
      foundation: null
    });
  }
  const hour = text.match(/(?:明天(?:晚上|晚间)?|改到|改为)(\d{1,2})(?:点|:00)/u);
  if (hour && /提醒我|改到|改为/u.test(text)) {
    let h = Number(hour[1]);
    if (text.includes('晚上') && h < 12) h += 12;
    const old = entryObjects(state, 'Reminder', now).filter(
      (e) => e.conversationId === conversationId && e.status === 'active' && e.schedule?.mode === 'once'
    );
    const changed = /改到|改为/u.test(text);
    if (h < 24 && ((!changed && /英语|写作|学习|复习|练/u.test(text)) || (changed && old.length === 1))) {
      const date = changed
        ? old[0].schedule.date
        : new Date(Date.parse(`${dayKey(m.at, state.timezone)}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
      const schedule = { mode: 'once', date, time: `${String(h).padStart(2, '0')}:00`, timezone: state.timezone };
      if (changed) update('Reminder', old[0], { schedule });
      else add('Reminder', { kind: 'study', schedule });
    }
  }
  if (/^(?:先|重新)记一个想法[:：]/u.test(text))
    add('Idea', { text: text.replace(/^(?:先|重新)记一个想法[:：]/u, '').trim() });
  if (/以后.*(?:例子|规则).*记住.*(?:偏好|教法)/u.test(text))
    add('Memory', { field: 'preference', value: text.replace(/[,，]?请记住.*$/u, '').replace(/[。.]$/u, '') });
  if (/撤回.*(?:记忆|偏好)/u.test(text)) {
    const memories = entryObjects(state, 'Memory', now).filter(
      (e) => e.conversationId === conversationId && e.field === 'preference' && e.status === 'active'
    );
    if (memories.length === 1) update('Memory', memories[0], { action: 'retract' });
  }
  const action = /^(?:重开目标|目标重开)[。.]?$/u.test(text)
    ? 'reopen'
    : /^目标归档[。.]?$/u.test(text)
      ? 'archive'
      : /^目标先暂停[。.]?$/u.test(text)
        ? 'pause'
        : /^(?:我完成目标了|目标完成了)[。.]?$/u.test(text)
          ? 'complete'
          : /^目标继续[。.]?$/u.test(text)
            ? 'resume'
            : null;
  if (action)
    update(
      'Goal',
      entryObjects(state, 'Goal', now).find((e) => e.id === conversationId),
      { action }
    );
  const operations = [];
  for (const [name, args] of calls.slice(0, 3)) {
    try {
      const op = entryCandidateOperation(state, name, args, conversationId, now);
      if (!op.duplicate) operations.push({ id: op.id, type: op.type, at: op.at, data: op.data });
    } catch (e) {
      if (!['INVALID_INPUT', 'FORBIDDEN', 'STOPPED', 'INTAKE_INVALID'].includes(e.code)) throw e;
    }
  }
  return operations;
}

// Reuse only the last, still unhandled local lifecycle intent after a failed send.
// Preparing a retry does not save the candidate or call a model.
export function pendingGoalEntryRetryId(state, conversationId, input, now = Date.now()) {
  const message = state.conversations.find((c) => c.id === conversationId)?.messages.at(-1);
  const event = state.events.at(-1);
  if (
    message?.role !== 'user' ||
    message.content !== input ||
    !message.id.endsWith(':message') ||
    event?.id !== message.id ||
    event.type !== 'message.add' ||
    event.data.conversationId !== conversationId
  )
    return null;
  const candidates = extractConversationEntries(state, conversationId, message.id, now);
  return candidates.length === 1 &&
    ['goal.pause', 'goal.resume', 'goal.close', 'goal.reopen'].includes(candidates[0].data.proposal?.type)
    ? message.id.slice(0, -':message'.length)
    : null;
}

// Caller owns scheduling/consent. This function only stages an isolated batch.
// Cursor follows message.add event order, including late-synced old timestamps.
export function stageConversationEntryScan(
  state,
  extraction = {},
  now = Date.now(),
  extract = extractConversationEntries
) {
  if (!extraction.enabled || !extraction.consentVersion || !Number.isFinite(extraction.enabledAt))
    return { operations: [], extraction, disabled: true };
  const messages = state.events.filter((e) => e.type === 'message.add' && e.data.role === 'user');
  const start = extraction.cursor
    ? messages.findIndex((e) => e.id === extraction.cursor) + 1
    : messages.findIndex((e) => e.at >= extraction.enabledAt);
  if (start < 0)
    return { operations: [], extraction: { ...extraction, cursor: messages.at(-1)?.id || null }, scanned: 0 };
  if (extraction.cursor && !messages.some((e) => e.id === extraction.cursor))
    throw Object.assign(new Error('回扫游标已失效'), { code: 'CONTEXT_CHANGED' });
  const operations = [];
  let chars = 0,
    count = 0,
    cursor = extraction.cursor,
    stagedState = state;
  for (const e of messages.slice(start)) {
    if (count >= 50 || chars + e.data.content.length > 20000 || operations.length >= 3) break;
    chars += e.data.content.length;
    count++;
    const c = state.conversations.find((c) => c.id === e.data.conversationId);
    if (c && !c.stopped && !c.goalLifecycle) {
      const candidates = extract(stagedState, c.id, e.id, now);
      if (operations.length + candidates.length > 3) break;
      for (const candidate of candidates) {
        stagedState = applyLearningOperation(stagedState, candidate).state;
        operations.push(candidate);
      }
    }
    cursor = e.id;
  }
  return { operations, extraction: { ...extraction, cursor, attempts: 0, retryAt: null }, scanned: count };
}
