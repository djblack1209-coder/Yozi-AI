import { dateTimeParts, dayKey, learningDateTimeFormat } from './learning-date-time.js';
import { coachAssessmentCounts } from './learning-writing-coach.js';
import { reviewGoalProgress } from './learning-adherence.js';
import { normalizeStudyProfile } from './learning-intake.js';
import { reminderInstant, reminderJobs } from './learning-reminders.js';

export const ENTRY_RULE_VERSION = 'conversation-entry-v1';
const memoryFields = ['goal', 'foundation', 'difficulty', 'minutes', 'preference', 'deadline'];
export const ENTRY_REGISTRY = Object.freeze({
  Goal: {
    fields: ['goal', 'category', 'exam', 'subjects', 'minutes', 'deadline', 'foundation'],
    states: ['active', 'paused', 'completed', 'archived'],
    version: ENTRY_RULE_VERSION
  },
  Reminder: {
    fields: ['kind', 'schedule', 'enabled'],
    states: ['active', 'completed', 'cancelled'],
    version: ENTRY_RULE_VERSION
  },
  Idea: {
    fields: ['text'],
    states: ['pending', 'kept', 'dismissed', 'expired', 'promoted'],
    version: ENTRY_RULE_VERSION
  },
  Memory: { fields: ['field', 'value'], states: ['active', 'retracted', 'superseded'], version: ENTRY_RULE_VERSION }
});
export const ENTRY_EVENTS = [
  'goal.revise',
  'goal.close',
  'goal.reopen',
  'goal.pause',
  'goal.resume',
  'reminder.complete',
  'reminder.cancel',
  'idea.keep',
  'idea.update',
  'profile.retract'
];
export const ENTRY_TOOL_NAMES = ['entry.query', 'entry.aggregate', 'entry.create', 'entry.update'];
const fail = (code, message) => {
  throw Object.assign(new Error(message), { code });
};
const check = (ok, message = '对话对象参数不合法', code = 'INVALID_INPUT') => {
  if (!ok) fail(code, message);
};
const str = (s, max = 160) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
function keys(v, allowed) {
  check(object(v) && Object.keys(v).every((k) => allowed.includes(k)), '对象包含未授权字段', 'FORBIDDEN');
}
export function entryFingerprint(v) {
  return JSON.stringify(v, (_, x) =>
    object(x)
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, x[k]])
        )
      : x
  );
}
function hash(value, seed) {
  let n = seed;
  for (let i = 0; i < value.length; i++) n = Math.imul(n ^ value.charCodeAt(i), 16777619);
  return (n >>> 0).toString(36);
}
export function entryStableId(value) {
  return `entry_${hash(value, 2166136261)}_${hash(value, 5381)}`;
}
const canonical = (v) => (typeof v === 'string' ? v.normalize('NFKC').replace(/[\s，。！？、,:：;；]/gu, '') : v);
function semantic(v) {
  return v === undefined ? null : entryFingerprint(JSON.parse(JSON.stringify(v), (_, x) => canonical(x)));
}
export const goalEntryStatus = (c) => c.goalLifecycle?.status || (c.stopped ? 'paused' : 'active');
export function ideaEntryStatus(state, id, now = Date.now()) {
  const updates = state.events.filter(
    (e) =>
      ['idea.keep', 'idea.update', 'proposal.resolve'].includes(e.type) &&
      (e.data.proposalId === id || e.data.ideaId === id)
  );
  const last = updates.at(-1);
  if (last) return { keep: 'kept', dismiss: 'dismissed', promote: 'promoted' }[last.data.action] || 'kept';
  if (state.events.some((e) => e.id === `${id}:dismiss`)) return 'dismissed';
  const p = state.conversations.flatMap((c) => c.messages).find((m) => m.id === id)?.proposal;
  return p?.expiresAt <= now ? 'expired' : 'pending';
}
export function activeEntryMemories(state, conversationId) {
  return state.profile.filter(
    (e) => (!conversationId || e.conversationId === conversationId) && !e.retractedBy && !e.supersededBy
  );
}
export function entryObjects(state, kind, now = Date.now()) {
  check(ENTRY_REGISTRY[kind]);
  const source = (id) => state.events.find((e) => e.id === id)?.data.sourceRefs || [];
  if (kind === 'Goal')
    return state.conversations.map((c) => ({
      kind,
      id: c.id,
      basis: goalBasis(state, c),
      conversationId: c.id,
      text: c.goal,
      reviewProgress: reviewGoalProgress(state, c.id, now),
      confirmed: !!(c.studyProfile || c.coach?.profile || c.journey || c.goalChangedBy),
      status: goalEntryStatus(c),
      at: c.at,
      sourceRefs: source(c.goalLifecycle?.changedBy || c.goalChangedBy)
    }));
  if (kind === 'Reminder')
    return state.conversations.flatMap((c) =>
      (c.reminders || []).map((r) => ({
        ...r,
        kind,
        reminderKind: r.kind,
        basis: r.generation,
        conversationId: c.id,
        status: r.status || 'active',
        text: `${r.schedule?.date || '每周'} ${r.time} ${r.timezone}`,
        sourceRefs: source(r.generation)
      }))
    );
  if (kind === 'Idea')
    return [
      ...state.events
        .filter((e) => e.type === 'review.idea.suggest')
        .map((e) => ({
          kind,
          id: e.id,
          basis: state.events.filter((u) => u.type === 'idea.update' && u.data.ideaId === e.id).at(-1)?.id || e.id,
          conversationId: e.data.conversationId,
          text: e.result.text,
          status: ideaEntryStatus(state, e.id, now),
          at: e.at,
          sourceRefs: [],
          evidenceIds: e.result.evidenceIds
        })),
      ...state.conversations.flatMap((c) =>
        c.messages
          .filter((m) => m.proposal?.type === 'idea.keep')
          .map((m) => {
            const latest = state.events.filter((e) => e.data.ideaId === m.id && e.type === 'idea.update').at(-1);
            return {
              kind,
              id: m.id,
              basis:
                latest?.id ||
                state.events.find((e) => e.data.proposalId === m.id && e.type === 'idea.keep')?.id ||
                m.id,
              conversationId: c.id,
              text: latest?.data.text || m.proposal.data.text,
              status: ideaEntryStatus(state, m.id, now),
              at: m.at,
              sourceRefs: m.proposal.sourceRefs || []
            };
          })
      )
    ];
  return state.profile
    .filter((e) => e.conversationId)
    .map((e) => ({
      ...e,
      kind,
      basis: e.id,
      text: e.value,
      status: e.retractedBy ? 'retracted' : e.supersededBy ? 'superseded' : 'active',
      sourceRefs: source(e.id)
    }));
}
function goalBasis(state, c) {
  return (
    state.events
      .filter(
        (e) =>
          e.data?.conversationId === c.id &&
          [
            'goal.revise',
            'goal.close',
            'goal.reopen',
            'goal.pause',
            'goal.resume',
            'task.stop',
            'task.resume',
            'coach.profile',
            'journey.configure',
            'profile.set'
          ].includes(e.type)
      )
      .at(-1)?.id || c.id
  );
}

export function entryBasis(state, kind, id) {
  return entryObjects(state, kind).find((e) => e.id === id)?.basis || null;
}

const property = (maxLength = 160) => ({ type: 'string', minLength: 1, maxLength });
const schemaObject = (properties, required) => ({ type: 'object', additionalProperties: false, properties, required });
const kinds = { type: 'string', enum: Object.keys(ENTRY_REGISTRY) };
const refsSchema = {
  type: 'array',
  minItems: 1,
  maxItems: 3,
  items: schemaObject(
    {
      conversationId: property(),
      messageId: property(),
      start: { type: 'integer', minimum: 0 },
      end: { type: 'integer', minimum: 1 }
    },
    ['conversationId', 'messageId', 'start', 'end']
  )
};
const scheduleSchema = {
  oneOf: [
    schemaObject({ mode: { const: 'once' }, date: property(10), time: property(5), timezone: property(80) }, [
      'mode',
      'date',
      'time',
      'timezone'
    ]),
    schemaObject(
      {
        mode: { const: 'weekly' },
        time: property(5),
        timezone: property(80),
        repeatDays: {
          type: 'array',
          minItems: 1,
          maxItems: 7,
          uniqueItems: true,
          items: { type: 'integer', minimum: 0, maximum: 6 }
        }
      },
      ['mode', 'time', 'timezone', 'repeatDays']
    )
  ]
};
const fieldSchemas = {
  Goal: {
    goal: property(300),
    category: { enum: ['cet', 'kaoyan', 'civil', 'ielts', 'toefl', 'other'] },
    exam: { enum: ['english1', 'english2', 'cs408', 'general'] },
    subjects: { type: 'array', minItems: 1, maxItems: 12, items: property(40) },
    minutes: { type: ['integer', 'null'], minimum: 5, maximum: 120 },
    deadline: { type: ['string', 'null'], maxLength: 10 },
    foundation: { type: ['string', 'null'], maxLength: 300 }
  },
  Reminder: { kind: { enum: ['study', 'review', 'recap'] }, schedule: scheduleSchema, enabled: { type: 'boolean' } },
  Idea: { text: property(500) },
  Memory: { field: { enum: memoryFields }, value: property(1000) }
};
export const ENTRY_TOOL_SCHEMAS = {
  'entry.query': schemaObject(
    {
      kind: kinds,
      conversationId: property(),
      id: property(),
      status: property(),
      limit: { type: 'integer', minimum: 1, maximum: 50 },
      cursor: property(256),
      text: property(200)
    },
    ['kind']
  ),
  'entry.aggregate': schemaObject(
    {
      kind: kinds,
      metric: { enum: ['count', 'completed', 'due', 'submitted', 'assessed'] },
      conversationId: property(),
      from: property(10),
      to: property(10),
      groupBy: { enum: ['status', 'day', 'kind'] }
    },
    ['kind', 'metric']
  ),
  'entry.create': {
    oneOf: Object.entries(fieldSchemas).map(([kind, fields]) =>
      schemaObject(
        {
          kind: { const: kind },
          fields: schemaObject(
            fields,
            {
              Goal: ['goal', 'category', 'exam', 'subjects', 'minutes', 'deadline', 'foundation'],
              Reminder: ['kind', 'schedule'],
              Idea: ['text'],
              Memory: ['field', 'value']
            }[kind]
          ),
          sourceRefs: refsSchema,
          confidence: { type: 'number', minimum: 0.9, maximum: 1 }
        },
        ['kind', 'fields', 'sourceRefs']
      )
    )
  },
  'entry.update': {
    oneOf: Object.entries(fieldSchemas).map(([kind, fields]) =>
      schemaObject(
        {
          kind: { const: kind },
          id: property(),
          basis: property(),
          patch: {
            ...schemaObject(
              {
                ...fields,
                action: {
                  enum: {
                    Goal: ['pause', 'resume', 'complete', 'archive', 'reopen'],
                    Reminder: ['complete', 'cancel'],
                    Idea: ['keep', 'dismiss', 'promote'],
                    Memory: ['retract']
                  }[kind]
                },
                ...(kind === 'Idea' ? { targetEventId: property() } : {})
              },
              []
            ),
            minProperties: 1
          },
          sourceRefs: refsSchema,
          confidence: { type: 'number', minimum: 0.9, maximum: 1 }
        },
        ['kind', 'id', 'basis', 'patch', 'sourceRefs']
      )
    )
  }
};
// Small shared schema interpreter: no dependency, same contract in provider and host.
export function validateEntrySchema(schema, value, { exact = false, path = 'root' } = {}) {
  const guard = (ok, keyword, where = path) => {
    try {
      check(ok);
    } catch (error) {
      if (exact) Object.assign(error, { path: where, keyword });
      throw error;
    }
  };
  if (schema.oneOf) {
    guard(
      schema.oneOf.some((s) => {
        try {
          validateEntrySchema(s, value, { exact, path });
          return true;
        } catch {
          return false;
        }
      }),
      'oneOf'
    );
    return;
  }
  if (schema.const !== undefined) guard(value === schema.const, 'const');
  if (schema.enum) guard(schema.enum.includes(value), 'enum');
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (schema.type)
    guard(
      types.some((t) =>
        t === 'null'
          ? value === null
          : t === 'object'
            ? object(value)
            : t === 'array'
              ? Array.isArray(value)
              : t === 'integer'
                ? Number.isInteger(value)
                : typeof value === t
      ),
      'type'
    );
  if (value === null) return;
  if (typeof value === 'string')
    guard(
      exact
        ? value.length >= (schema.minLength ?? 0) && value.length <= (schema.maxLength ?? Infinity)
        : str(value, schema.maxLength || 1000),
      'stringLength'
    );
  if (typeof value === 'number')
    guard(
      Number.isFinite(value) && value >= (schema.minimum ?? -Infinity) && value <= (schema.maximum ?? Infinity),
      'number'
    );
  if (Array.isArray(value)) {
    guard(
      value.length >= (schema.minItems || 0) &&
        value.length <= (exact ? (schema.maxItems ?? Infinity) : schema.maxItems || 100),
      'items'
    );
    if (schema.uniqueItems) guard(new Set(value).size === value.length, 'uniqueItems');
    value.forEach((v, index) => validateEntrySchema(schema.items, v, { exact, path: `${path}[${index}]` }));
  }
  if (schema.properties) {
    if (exact)
      guard(
        object(value) && Object.keys(value).every((k) => Object.hasOwn(schema.properties, k)),
        'additionalProperties'
      );
    else keys(value, Object.keys(schema.properties));
    const missing = (schema.required || []).find((k) => value[k] === undefined);
    guard(missing === undefined, 'required', missing === undefined ? path : `${path}.${missing}`);
    guard(Object.keys(value).length >= (schema.minProperties || 0), 'minProperties');
    Object.entries(value).forEach(([k, v]) =>
      validateEntrySchema(schema.properties[k], v, { exact, path: `${path}.${k}` })
    );
  }
}
export function validateEntryCall(name, args) {
  check(ENTRY_TOOL_SCHEMAS[name]);
  validateEntrySchema(ENTRY_TOOL_SCHEMAS[name], args);
  return args;
}

export function assertEntrySource(state, refs, conversationId, kind) {
  validateEntrySchema(refsSchema, refs);
  const c = state.conversations.find((c) => c.id === conversationId);
  check(c, '来源会话不存在', 'NOT_FOUND');
  return refs.map((r) => {
    check(r.conversationId === conversationId, '来源不属于当前会话', 'FORBIDDEN');
    const m = c.messages.find((m) => m.id === r.messageId);
    check(
      m?.role === 'user' && !m.questionKey && !m.attemptId && r.start < r.end && r.end <= m.content.length,
      '来源不是可提取的用户指令',
      'FORBIDDEN'
    );
    const body = m.content;
    check(
      !/(?:我的答案|答案是|题干|资料说|他说|她说|假如|假设|开玩笑|不要|不想|别帮|跳过|[“”「」"])/u.test(body),
      '引用、否定与作答不提取',
      'FORBIDDEN'
    );
    const intent = {
      Goal: /我的目标|我要准备|目标.*(?:暂停|完成|归档|继续|重开)|(?:重开|归档|完成).*目标/,
      Reminder: /提醒我|提醒.*(?:改|完成|取消)|(?:取消|完成|修改).*提醒|改到\d|改为\d/,
      Idea: /记.*想法|想法.*(?:保留|忽略|转|改)/,
      Memory: /请记住|帮我记住|学习偏好|撤回.*(?:记忆|偏好)/
    }[kind];
    check(intent.test(body), '缺少明确保存或修改意图', 'FORBIDDEN');
    if (kind === 'Reminder')
      check(
        /学习|写作|复习|练|英语|目标|改到|改为|取消.*提醒|完成.*提醒/u.test(body),
        '只保存明确学习用途的提醒',
        'FORBIDDEN'
      );
    const splitsPair = (index) =>
      index > 0 &&
      index < body.length &&
      /[\uD800-\uDBFF]/.test(body[index - 1]) &&
      /[\uDC00-\uDFFF]/.test(body[index]);
    check(!splitsPair(r.start) && !splitsPair(r.end), '来源范围截断字符');
    return { ...r, content: body.slice(r.start, r.end) };
  });
}
function validDate(value) {
  return (
    str(value, 10) &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export function normalizeEntrySchedule(s) {
  validateEntrySchema(scheduleSchema, s);
  check(/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s.time));
  const clock = learningDateTimeFormat('en-CA', {
    timeZone: s.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });
  if (s.mode === 'once') {
    check(validDate(s.date));
    const instant = reminderInstant(s.date, s.time, s.timezone);
    check(instant !== null, '提醒时间不存在');
    // Reject ambiguous DST folds instead of silently choosing either instant.
    for (const delta of [-7200000, -3600000, -1800000, 1800000, 3600000, 7200000]) {
      const { year, month, day, hour, minute } = dateTimeParts(clock, instant + delta);
      check(`${year}-${month}-${day} ${hour}:${minute}` !== `${s.date} ${s.time}`, '夏令时重复时间需要明确选择');
    }
  }
  return { ...s, ...(s.repeatDays ? { repeatDays: [...s.repeatDays].sort() } : {}) };
}

export function prepareEntryProposal(state, name, args, conversationId, now) {
  validateEntryCall(name, args);
  const c = state.conversations.find((c) => c.id === conversationId);
  check(c, '目标会话不存在', 'NOT_FOUND');
  const evidence = assertEntrySource(state, args.sourceRefs, conversationId, args.kind);
  const update = name === 'entry.update',
    f = JSON.parse(JSON.stringify(update ? args.patch : args.fields));
  const evidenceText = canonical(evidence.map((r) => r.content).join(' '));
  if (args.kind === 'Idea' && f.text) check(evidenceText.includes(canonical(f.text)), '想法内容缺少原文依据');
  if (args.kind === 'Memory' && f.value) check(evidenceText.includes(canonical(f.value)), '记忆内容缺少原文依据');
  if (args.kind === 'Goal' && !update) {
    check(
      f.subjects.every(
        (subject) =>
          evidenceText.includes(canonical(subject)) || (subject === '英语写作' && /英语[一二]?写作/u.test(evidenceText))
      ),
      '科目缺少原文依据'
    );
    if (f.minutes !== null) check(new RegExp(`每天${f.minutes}分钟`).test(evidenceText), '时长缺少原文依据');
    if (f.deadline !== null) {
      const [y, m, d] = f.deadline.split('-');
      check(
        evidenceText.includes(canonical(f.deadline)) || evidenceText.includes(`${y}年${Number(m)}月${Number(d)}日`),
        '日期缺少原文依据'
      );
    }
  }
  const old = update
    ? entryObjects(state, args.kind, now).find((e) => e.id === args.id && e.conversationId === conversationId)
    : null;
  if (update) check(old && old.basis === args.basis, '对象已变化', 'CONTEXT_CHANGED');
  check(
    !c.goalLifecycle || (args.kind === 'Goal' && ['reopen', 'archive'].includes(f.action)),
    '目标已结束，请明确重开',
    'STOPPED'
  );
  check(
    !c.stopped || (args.kind === 'Goal' && ['resume', 'reopen', 'complete', 'archive'].includes(f.action)),
    '目标已暂停',
    'STOPPED'
  );
  let type, data;
  if (args.kind === 'Goal') {
    if (f.action) {
      check(Object.keys(f).length === 1);
      type = {
        pause: 'goal.pause',
        resume: 'goal.resume',
        complete: 'goal.close',
        archive: 'goal.close',
        reopen: 'goal.reopen'
      }[f.action];
      data = type === 'goal.close' ? { status: f.action === 'archive' ? 'archived' : 'completed' } : {};
    } else {
      if (!update) {
        check(f.subjects?.length, '必要科目未知');
        normalizeStudyProfile(f);
      } else keys(f, ['goal', 'minutes', 'deadline', 'foundation']);
      type = 'goal.revise';
      data = { patch: f };
    }
  } else if (args.kind === 'Reminder') {
    if (f.action) {
      check(Object.keys(f).length === 1);
      type = `reminder.${f.action}`;
      data = { reminderId: old.id };
    } else {
      const previous = old && c.reminders.find((r) => r.id === old.id);
      if (update) keys(f, ['schedule', 'enabled']);
      const schedule = normalizeEntrySchedule(
        f.schedule ||
          previous?.schedule || {
            mode: 'weekly',
            time: previous?.time,
            timezone: previous?.timezone,
            repeatDays: previous?.repeatDays
          }
      );
      type = 'reminder.set';
      data = {
        contract: 'learning-reminder-v2',
        kind: previous?.kind || f.kind,
        schedule,
        enabled: f.enabled ?? previous?.enabled ?? true,
        ...(old ? { reminderId: old.id } : {})
      };
    }
  } else if (args.kind === 'Idea') {
    if (!update) {
      type = 'idea.keep';
      data = { text: f.text };
    } else {
      type = 'idea.update';
      data = { ideaId: old.id, ...f };
      if (f.action) check(!f.text);
    }
  } else {
    if (update && f.action) {
      check(f.action === 'retract' && Object.keys(f).length === 1);
      type = 'profile.retract';
      data = { entryId: old.id };
    } else {
      check(!update || !f.field || f.field === old.field);
      type = 'profile.set';
      data = { field: old?.field || f.field, value: f.value, scope: conversationId, source: 'self_report' };
    }
  }
  const slot = update
    ? args.id
    : args.kind === 'Memory'
      ? f.field
      : args.kind === 'Reminder'
        ? `${f.kind}:${f.schedule.mode}`
        : args.kind;
  const identity = entryFingerprint({
    owner: state.owner,
    conversationId,
    refs: args.sourceRefs,
    kind: args.kind,
    slot
  });
  const fingerprint = entryFingerprint({ identity, sourceRefs: args.sourceRefs, type, data });
  return {
    type,
    data: { ...data, conversationId, sourceRefs: args.sourceRefs },
    entry: {
      kind: args.kind,
      objectId: old?.id || (args.kind === 'Goal' ? conversationId : null),
      identity,
      fingerprint,
      semantic: semantic({ kind: args.kind, type, conversationId, data }),
      basis:
        args.kind === 'Goal'
          ? entryBasis(state, 'Goal', conversationId)
          : old?.basis ||
            (args.kind === 'Memory'
              ? activeEntryMemories(state, conversationId).find((e) => e.field === f.field)?.id || null
              : null),
      extractorVersion: ENTRY_RULE_VERSION,
      confidence: args.confidence ?? 1,
      sourceRefs: args.sourceRefs,
      expiresAt: args.kind === 'Idea' ? now + 14 * 86400000 : null
    }
  };
}
export function entryCandidateOperation(state, name, args, conversationId, now = Date.now()) {
  const proposal = prepareEntryProposal(state, name, args, conversationId, now);
  const id = entryStableId(proposal.entry.identity);
  const messages = state.conversations.flatMap((c) => c.messages);
  const existing = messages.find((m) => m.id === id);
  if (existing) {
    check(
      existing.proposal?.entry?.identity === proposal.entry.identity &&
        existing.proposal.entry.fingerprint === proposal.entry.fingerprint,
      '相同来源候选内容冲突',
      'IDEMPOTENCY_CONFLICT'
    );
    return { proposalId: id, duplicate: true };
  }
  const reintroduced =
    args.kind === 'Idea' &&
    args.sourceRefs.some((r) =>
      state.conversations
        .find((c) => c.id === conversationId)
        ?.messages.find((m) => m.id === r.messageId)
        ?.content.includes('重新')
    );
  const same = messages.find(
    (m) =>
      m.proposal?.entry?.semantic === proposal.entry.semantic &&
      (!(args.kind === 'Goal' && ['goal.pause', 'goal.resume', 'goal.close', 'goal.reopen'].includes(proposal.type)) ||
        m.proposal.entry.basis === proposal.entry.basis) &&
      !(reintroduced && ['expired', 'dismissed'].includes(ideaEntryStatus(state, m.id, now)))
  );
  if (same) return { proposalId: same.id, duplicate: true };
  const { kind } = args;
  const objects = entryObjects(state, kind, now).filter((e) => e.conversationId === conversationId);
  const d = proposal.data;
  const fact = objects.find((e) =>
    kind === 'Reminder'
      ? e.status === 'active' &&
        e.reminderKind === d.kind &&
        semantic(e.schedule) === semantic(d.schedule) &&
        e.enabled === d.enabled
      : kind === 'Memory'
        ? e.status === 'active' && e.field === d.field && canonical(e.value) === canonical(d.value)
        : kind === 'Goal'
          ? !args.patch?.action &&
            canonical(e.text) === canonical(d.patch?.goal) &&
            Object.entries(d.patch || {}).every(
              ([k, v]) =>
                semantic(state.conversations.find((c) => c.id === conversationId)?.studyProfile?.[k]) === semantic(v)
            )
          : e.text === d.text && e.status === 'kept'
  );
  if (fact) return { proposalId: null, objectId: fact.id, duplicate: true };
  check(
    messages.filter((m) =>
      m.proposal?.entry?.sourceRefs?.some((r) => args.sourceRefs.some((s) => r.messageId === s.messageId))
    ).length < 3,
    '每条消息最多三个候选',
    'RESOURCE_LIMIT'
  );
  return {
    id,
    type: 'message.add',
    at: now,
    data: { conversationId, role: 'assistant', content: '请确认后保存。', proposal },
    proposalId: id
  };
}

export function assertEntryAcceptance(state, proposal, data, now) {
  const { entry } = proposal;
  const c = state.conversations.find((c) => c.id === data.conversationId);
  check(proposal.goal === c.goal, '目标已变化，请重新确认', 'CONTEXT_CHANGED');
  assertEntrySource(state, entry.sourceRefs, c.id, entry.kind);
  check(
    !entry.expiresAt || entry.expiresAt > now || ideaEntryStatus(state, data.proposalId, now) === 'kept',
    '想法候选已过期',
    'CONTEXT_CHANGED'
  );
  check(
    !c.goalLifecycle || (entry.kind === 'Goal' && ['goal.reopen', 'goal.close'].includes(proposal.type)),
    '目标已结束',
    'STOPPED'
  );
  check(
    !c.stopped || (entry.kind === 'Goal' && ['goal.resume', 'goal.reopen', 'goal.close'].includes(proposal.type)),
    '目标已暂停',
    'STOPPED'
  );
  const basis =
    entry.kind === 'Goal'
      ? entryBasis(state, 'Goal', c.id)
      : entry.objectId
        ? entryBasis(state, entry.kind, entry.objectId)
        : entry.kind === 'Memory'
          ? activeEntryMemories(state, c.id).find((e) => e.field === data.field)?.id || null
          : null;
  check(basis === entry.basis, '对象已变化，请重新确认', 'CONTEXT_CHANGED');
  // Recheck semantic facts in the same reducer commit, including concurrent candidates.
  if (!entry.objectId && entry.kind === 'Reminder')
    check(
      !(c.reminders || []).some(
        (r) => r.status !== 'cancelled' && semantic(r.schedule) === semantic(data.schedule) && r.kind === data.kind
      ),
      '提醒已经存在',
      'CONTEXT_CHANGED'
    );
}

export function applyEntryOperation(state, operation, { assert }) {
  const { data, id, at } = operation,
    c = state.conversations.find((c) => c.id === data.conversationId);
  assert(c && data.explicit === true, 'EXPLICIT_REQUIRED', '请明确确认对象变更');
  const common = ['conversationId', 'sourceRefs', 'proposalId', 'explicit'];
  const allowed = {
    'goal.revise': ['patch'],
    'goal.close': ['status'],
    'goal.reopen': [],
    'goal.pause': [],
    'goal.resume': [],
    'idea.keep': ['text'],
    'idea.update': ['ideaId', 'text', 'action', 'targetEventId'],
    'profile.retract': ['entryId']
  }[operation.type];
  keys(data, [...common, ...(allowed || [])]);
  if (operation.type === 'goal.revise') {
    const patch = data.patch;
    keys(patch, ENTRY_REGISTRY.Goal.fields);
    if (c.studyProfile) {
      keys(patch, ['goal', 'minutes', 'deadline', 'foundation']);
      c.studyProfile = normalizeStudyProfile({ ...c.studyProfile, ...patch });
    } else if (patch.category !== undefined) {
      check(patch.subjects?.length);
      c.studyProfile = normalizeStudyProfile(patch);
    } else {
      keys(patch, ['goal', 'minutes', 'deadline', 'foundation']);
      check(c.coach?.profile || c.journey, '请先明确科目并确认学习档案');
      if (patch.goal !== undefined) check(str(patch.goal, 300));
      if (patch.minutes !== undefined)
        check(Number.isInteger(patch.minutes) && patch.minutes >= 5 && patch.minutes <= 120);
      if (patch.deadline !== undefined) check(patch.deadline === null || validDate(patch.deadline));
      if (patch.foundation !== undefined) check(patch.foundation === null || str(patch.foundation, 300));
      if (!c.coach?.profile) keys(patch, ['goal', 'minutes']);
    }
    if (patch.goal !== undefined) c.goal = patch.goal;
    if (c.coach?.profile) {
      const p = c.coach.profile;
      if (patch.minutes !== undefined) check(patch.minutes !== null && patch.minutes >= 10 && patch.minutes <= 90);
      for (const field of ['goal', 'minutes', 'deadline', 'foundation'])
        if (patch[field] !== undefined) p[field] = patch[field];
    }
    if (c.journey) {
      if (patch.goal !== undefined) c.journey.title = patch.goal;
      if (patch.minutes !== undefined) {
        check(patch.minutes !== null && patch.minutes >= 5 && patch.minutes <= 120);
        c.journey.minutes = patch.minutes;
      }
    }
    c.goalChangedBy = id;
    return { conversationId: c.id, goal: c.goal };
  }
  if (operation.type.startsWith('goal.')) {
    if (operation.type === 'goal.close') {
      check(['completed', 'archived'].includes(data.status));
      c.goalLifecycle = { status: data.status, changedBy: id };
      c.stopped = true;
    } else if (operation.type === 'goal.reopen') {
      check(c.goalLifecycle);
      delete c.goalLifecycle;
      c.stopped = false;
    } else {
      check(!c.goalLifecycle, '已结束目标需要明确重开', 'STOPPED');
      c.stopped = operation.type === 'goal.pause';
    }
    c.goalChangedBy = id;
    return { conversationId: c.id, status: goalEntryStatus(c) };
  }
  if (operation.type === 'profile.retract') {
    const entry = state.profile.find(
      (e) => e.id === data.entryId && e.conversationId === c.id && !e.supersededBy && !e.retractedBy
    );
    check(entry, '记忆已变化', 'CONTEXT_CHANGED');
    entry.retractedBy = id;
    return { entryId: entry.id, status: 'retracted' };
  }
  if (operation.type === 'idea.keep') {
    check(str(data.text, 500));
    return { ideaId: data.proposalId, status: 'kept' };
  }
  if (operation.type === 'idea.update') {
    const idea = entryObjects(state, 'Idea', at).find((e) => e.id === data.ideaId && e.conversationId === c.id);
    check(idea && ['kept', 'pending'].includes(idea.status), '想法已失效', 'CONTEXT_CHANGED');
    if (data.action === 'promote') {
      const plan = state.events.find(
        (e) =>
          e.id === data.targetEventId && e.type === 'plan.set' && e.data.conversationId === c.id && e.data.proposalId
      );
      check(plan && plan.data.proposalId !== data.proposalId, '先明确采用关联计划', 'PRECONDITION');
    } else check(['keep', 'dismiss'].includes(data.action) || str(data.text, 500));
    return {
      ideaId: idea.id,
      status: { keep: 'kept', dismiss: 'dismissed', promote: 'promoted' }[data.action] || idea.status
    };
  }
  fail('UNKNOWN_TOOL', '对象操作不支持');
}

export function queryEntries(state, args, context, now = Date.now()) {
  validateEntryCall('entry.query', args);
  const conversationId = args.conversationId || context.conversationId;
  check(context.allConversations || conversationId === context.conversationId, '不能查询其他会话', 'FORBIDDEN');
  const scope = entryFingerprint({
    owner: state.owner,
    conversationId,
    kind: args.kind,
    status: args.status,
    text: args.text,
    id: args.id
  });
  const binding = entryStableId(scope);
  let offset = 0;
  if (args.cursor) {
    const parts = args.cursor.split(':');
    check(
      parts.length === 3 && parts[0] === binding && Number(parts[1]) === state.revision && /^\d+$/.test(parts[2]),
      '查询游标已失效',
      'CONTEXT_CHANGED'
    );
    offset = Number(parts[2]);
  }
  if (args.status) check(ENTRY_REGISTRY[args.kind].states.includes(args.status));
  const rows = entryObjects(state, args.kind, now).filter(
    (e) =>
      (!conversationId || e.conversationId === conversationId) &&
      (!args.id || e.id === args.id) &&
      (!args.status || e.status === args.status) &&
      (!args.text || e.text.includes(args.text))
  );
  const limit = args.limit || 20;
  return {
    items: rows.slice(offset, offset + limit),
    total: rows.length,
    cursor: offset + limit < rows.length ? `${binding}:${state.revision}:${offset + limit}` : null,
    revision: state.revision
  };
}
export function aggregateEntries(state, args, context, now = Date.now()) {
  validateEntryCall('entry.aggregate', args);
  check(
    args.metric === 'count' ||
      (args.metric === 'completed' && ['Goal', 'Reminder'].includes(args.kind)) ||
      (args.metric === 'due' && args.kind === 'Reminder') ||
      (['submitted', 'assessed'].includes(args.metric) && args.kind === 'Goal')
  );
  if (args.from) check(validDate(args.from));
  if (args.to) check(validDate(args.to));
  check(!!args.from === !!args.to, '请提供完整日期范围');
  if (args.from) check(args.from <= args.to && Date.parse(args.to) - Date.parse(args.from) <= 89 * 86400000);
  const scope = args.conversationId || context.conversationId;
  const rows = entryObjects(state, args.kind, now).filter(
    (e) => (!scope || e.conversationId === scope) && (args.kind !== 'Goal' || e.confirmed)
  );
  check(
    context.allConversations || !args.conversationId || args.conversationId === context.conversationId,
    '不能聚合其他会话',
    'FORBIDDEN'
  );
  let evidence = rows;
  if (['submitted', 'assessed'].includes(args.metric)) {
    const ids = new Set(rows.map((e) => e.id));
    evidence = state.attempts
      .filter(
        (a) =>
          ids.has(a.conversationId) &&
          (args.metric === 'submitted' ||
            a.grade?.status === 'reliable' ||
            a.corrections?.length ||
            a.assistance?.length)
      )
      .map((a) => ({ ...a, status: args.metric, kind: 'Goal' }));
  } else if (args.metric === 'completed') evidence = rows.filter((e) => e.status === 'completed');
  else if (args.metric === 'due') {
    const due = new Set(
      reminderJobs(state, now, { dayKey })
        .filter((j) => j.dueAt <= now)
        .map((j) => j.reminderId)
    );
    evidence = rows.filter((e) => e.status === 'active' && e.enabled && due.has(e.id));
  }
  evidence = evidence.filter(
    (e) =>
      !args.from ||
      (new Date(e.at).toISOString().slice(0, 10) >= args.from && new Date(e.at).toISOString().slice(0, 10) <= args.to)
  );
  const groups = {};
  for (const e of evidence) {
    const key =
      args.groupBy === 'day'
        ? new Date(e.at).toISOString().slice(0, 10)
        : args.groupBy === 'kind'
          ? args.kind
          : e.status;
    groups[key] = (groups[key] || 0) + 1;
  }
  let value = evidence.length;
  if (['submitted', 'assessed'].includes(args.metric))
    for (const c of state.conversations.filter((c) => (!scope || c.id === scope) && c.coach)) {
      const days = new Set([c.coach.startedDay, ...(c.coach.days || []).map((d) => d.day)]);
      for (const day of days) {
        if (args.from && (day < args.from || day > args.to)) continue;
        const n = coachAssessmentCounts(c.coach, day)[args.metric];
        const key = args.groupBy === 'day' ? day : args.groupBy === 'kind' ? 'Goal' : args.metric;
        if (n) groups[key] = (groups[key] || 0) + n;
        value += n;
      }
    }
  check(Object.keys(groups).length <= 100, '聚合最多100组', 'RESOURCE_LIMIT');
  return {
    value,
    groups,
    denominator: null,
    evidence: ['submitted', 'assessed'].includes(args.metric)
      ? 'attempts + coach originals; assessed includes AI feedback, not official scoring'
      : 'confirmed events',
    unknown: true
  };
}
