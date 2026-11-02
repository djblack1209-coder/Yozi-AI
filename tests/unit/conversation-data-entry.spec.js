import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { createLearningRepository } from '@/services/learning/learning-repository.js';
import { executeLearningTool } from '@/services/learning/learning-tools.js';
import {
  applyLearningOperation,
  emptyLearningState,
  createLearningOperationBatch,
  normalizePrivateSyncOperation,
  dayKey
} from '@/services/learning/learning-domain.js';
import {
  entryCandidateOperation,
  entryObjects,
  entryBasis,
  activeEntryMemories,
  ENTRY_TOOL_SCHEMAS
} from '../../laf-backend/functions/_shared/learning-entries.js';
import {
  extractConversationEntries,
  stageConversationEntryScan
} from '../../laf-backend/functions/_shared/learning-entry-extractor.js';
import { proposalStatus } from '../../laf-backend/functions/_shared/learning-proposals.js';
import { reminderJobs } from '../../laf-backend/functions/_shared/learning-reminders.js';
import { encodeHistory, decodeHistory } from '../../laf-backend/functions/_shared/learning-history.js';
import { encodeServerHistory, decodeServerHistory } from '../../laf-backend/functions/_shared/learning-history-server';
import { runConversationEntryScan } from '../../laf-backend/functions/_shared/learning-entry-scan';
import { parseLearningOutput } from '../../laf-backend/functions/_shared/ai-providers/learning-provider';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import EntriesBoard from '@/pages/archive/components/conversation-entries.vue';
const NOW = Date.parse('2026-10-22T10:00:00+08:00');
let repo, sequence;
function repository() {
  const values = new Map();
  return createLearningRepository(
    {
      get: (k, fallback) => structuredClone(values.has(k) ? values.get(k) : fallback),
      save: (k, v) => {
        values.set(k, structuredClone(v));
        return true;
      },
      remove: (k) => {
        values.delete(k);
        return true;
      }
    },
    () => 'entry-fixture',
    null
  );
}
function op(type, data, id = `op${++sequence}`, at = Date.now()) {
  return repo.commit({ id, type, data, at });
}
function user(content, id = `user${++sequence}`, conversationId = 'chat') {
  op('message.add', { conversationId, role: 'user', content }, id);
  return id;
}
function extracted(text, id) {
  const messageId = user(text, id);
  const ops = extractConversationEntries(repo.read(), 'chat', messageId);
  for (const x of ops) repo.commit(x);
  return ops;
}
function accept(id) {
  const p = repo
    .read()
    .conversations.flatMap((c) => c.messages)
    .find((m) => m.id === id).proposal;
  return op(p.type, { ...p.data, proposalId: id, explicit: true }, `${id}:accept`);
}
function refs(messageId, conversationId = 'chat') {
  const m = repo
    .read()
    .conversations.find((c) => c.id === conversationId)
    .messages.find((m) => m.id === messageId);
  return [{ conversationId, messageId, start: 0, end: m.content.length }];
}
function context() {
  return {
    conversationId: 'chat',
    permissions: ['read', 'learn'],
    calls: 0,
    maxCalls: 3,
    deadline: Date.now() + 10000,
    origin: 'model'
  };
}
function tool(name, args, id = `tool${++sequence}`) {
  return executeLearningTool(repo, { id, name, arguments: args }, context());
}
// Entry writes are explicit host candidates, never model authority.
function hostTool(name, args, id = `host${++sequence}`) {
  return executeLearningTool(repo, { id, name, arguments: args }, { ...context(), origin: 'host' });
}
function setupGoal() {
  const [p] = extracted('我的目标是准备考研英语一写作，到2026年12月20日，每天20分钟。', 'goal-source');
  expect(p).toBeTruthy();
  accept(p.id);
}
function mongo(state, meta = {}) {
  let document = {
    _id: 'doc',
    user_id: state.owner,
    revision: 1,
    state,
    extraction: { enabled: true, enabledAt: NOW, consentVersion: 'fixture-only', generation: 1, ...meta }
  };
  let hook;
  const db = {
    collection: () => ({
      where: (query) => ({
        get: async () => ({
          data:
            document && Object.entries(query).every(([k, v]) => JSON.stringify(document[k]) === JSON.stringify(v))
              ? [structuredClone(document)]
              : []
        }),
        update: async (patch) => {
          if (hook) {
            const fn = hook;
            hook = null;
            fn(document, patch);
          }
          if (!document || !Object.entries(query).every(([k, v]) => JSON.stringify(document[k]) === JSON.stringify(v)))
            return { updated: 0 };
          document = { ...document, ...structuredClone(patch) };
          return { updated: 1 };
        }
      })
    })
  };
  return {
    db,
    read: () => document,
    change: (fn) => fn(document),
    hook: (fn) => {
      hook = fn;
    },
    delete: () => {
      document = null;
    }
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  setActivePinia(createPinia());
  uni.clearStorageSync();
  sequence = 0;
  repo = repository();
  repo.commit({ id: 'zone', type: 'timezone.set', at: NOW, data: { timezone: 'Asia/Shanghai' } });
  op('conversation.start', { goal: '待确认学习方向' }, 'chat');
});
afterEach(() => {
  vi.useRealTimers();
  uni.clearStorageSync();
});

describe('阶段 B：隔离对话即入口 8.2', () => {
  it('按顺序确认目标、一次性提醒、闲谈、想法、记忆、重复、改时间、暂停/完成，保持业务证据', () => {
    const [goal] = extracted('我的目标是准备考研英语一写作，到2026年12月20日，每天20分钟。', 'goal-source');
    expect(repo.read().conversations[0].studyProfile).toBeUndefined();
    expect(proposalStatus(repo.read(), goal.id)).toBe('pending');
    accept(goal.id);
    expect(repo.read().conversations[0].studyProfile).toMatchObject({
      minutes: 20,
      deadline: '2026-12-20',
      exam: 'english1'
    });
    expect(entryObjects(repo.read(), 'Goal')[0].text).toBe('准备考研英语一写作');
    const [reminder] = extracted('明天晚上8点提醒我练英语写作。', 'reminder-source');
    expect(repo.read().conversations[0].reminders).toBeUndefined();
    accept(reminder.id);
    const saved = repo.read().conversations[0].reminders[0];
    expect(saved).toMatchObject({
      contract: 'learning-reminder-v2',
      schedule: { mode: 'once', date: '2026-10-23', time: '20:00', timezone: 'Asia/Shanghai' }
    });
    expect(reminderJobs(repo.read(), NOW, { dayKey })[0].dueAt).toBe(Date.parse('2026-10-23T12:00:00Z'));
    expect(extracted('今天天气真好，晚上想吃火锅。')).toHaveLength(0);
    const [idea] = extracted('先记一个想法：以后把我的错句做成卡片。');
    accept(idea.id);
    expect(proposalStatus(repo.read(), idea.id)).toBe('kept');
    expect(repo.read().plans).toHaveLength(0);
    const [memory] = extracted('以后讲规则前先给我一个例子，请记住这个学习偏好。');
    accept(memory.id);
    expect(activeEntryMemories(repo.read(), 'chat')[0]).toMatchObject({
      field: 'preference',
      conversationId: 'chat',
      source: 'self_report'
    });
    const before = repo.read().revision;
    expect(accept(memory.id).reused).toBe(true);
    expect(extracted('明天晚上8点提醒我练英语写作。', 'reminder-source')).toHaveLength(0);
    expect(extracted('明天20点提醒我练英语写作。')).toHaveLength(0);
    const stage = stageConversationEntryScan(repo.read(), { enabled: true, consentVersion: 'fixture', enabledAt: NOW });
    expect(stage.operations).toHaveLength(0);
    expect(repo.read().revision).toBeGreaterThanOrEqual(before);
    const [change] = extracted('改到21点');
    accept(change.id);
    const next = repo.read().conversations[0].reminders[0];
    expect(repo.read().conversations[0].reminders).toHaveLength(1);
    expect(next.id).toBe(saved.id);
    expect(next.version).toBe(2);
    expect(next.generation).not.toBe(saved.generation);
    expect(() =>
      op('reminder.receipt', {
        conversationId: 'chat',
        reminderId: saved.id,
        generation: saved.generation,
        day: '2026-10-23',
        status: 'opened',
        channel: 'web'
      })
    ).toThrow();
    const [pause] = extracted('目标先暂停。');
    accept(pause.id);
    expect(reminderJobs(repo.read(), NOW, { dayKey })).toHaveLength(0);
    const [complete] = extracted('我完成目标了');
    accept(complete.id);
    expect(entryObjects(repo.read(), 'Goal')[0].status).toBe('completed');
    expect(repo.read().attempts).toHaveLength(0);
    expect(repo.read().events.find((e) => e.id === `${complete.id}:accept`).type).toBe('goal.close');
    expect(repo.read().conversations[0].messages.find((m) => m.id === 'goal-source').content).toContain('考研英语一');
  });
  it('Idea过期不删除消息，Memory替代/撤回后不再注入，旧偏好不复活', () => {
    setupGoal();
    const [idea] = extracted('先记一个想法：做错句卡片。');
    const [kept] = extracted('先记一个想法：每周练习一篇作文。');
    accept(kept.id);
    const [m] = extracted('以后讲规则前先给我一个例子，请记住这个学习偏好。');
    accept(m.id);
    const msg = user('请记住这个学习偏好：以后每次先看例子。');
    const p = entryCandidateOperation(
      repo.read(),
      'entry.create',
      { kind: 'Memory', fields: { field: 'preference', value: '以后每次先看例子' }, sourceRefs: refs(msg) },
      'chat'
    );
    repo.commit(p);
    accept(p.id);
    expect(activeEntryMemories(repo.read(), 'chat')).toHaveLength(1);
    expect(repo.read().profile[0].supersededBy).toBeTruthy();
    const [retract] = extracted('撤回这个学习偏好');
    accept(retract.id);
    expect(activeEntryMemories(repo.read(), 'chat')).toHaveLength(0);
    vi.setSystemTime(NOW + 15 * 86400000);
    expect(proposalStatus(repo.read(), idea.id)).toBe('expired');
    expect(proposalStatus(repo.read(), kept.id)).toBe('kept');
    expect(() => accept(idea.id)).toThrow();
    expect(repo.read().conversations[0].messages.some((m) => m.id === idea.id)).toBe(true);
  });
  it('模型仅读取条目，候选由宿主写入；查询无副作用、来源与越权拒绝', () => {
    setupGoal();
    const msg = user('先记一个想法：写作句式卡。');
    const args = { kind: 'Idea', fields: { text: '写作句式卡' }, sourceRefs: refs(msg), confidence: 0.99 };
    expect(() =>
      parseLearningOutput(JSON.stringify({ message: '请确认', tools: [{ name: 'entry.create', arguments: args }] }))
    ).toThrow('模型请求了未授权的工具');
    const before = repo.read();
    expect(() => tool('entry.create', args)).toThrow('模型不能选择教法或写入学习事实');
    expect(() => tool('entry.update', { kind: 'Idea', id: 'fake', patch: { action: 'keep' } })).toThrow(
      '模型不能选择教法或写入学习事实'
    );
    for (const field of ['profile', 'plans', 'attempts', 'conversations'])
      expect(repo.read()[field]).toEqual(before[field]);
    expect(entryObjects(repo.read(), 'Idea')).toEqual([]);
    const revision = repo.read().revision;
    expect(tool('entry.query', { kind: 'Goal' }).result.items).toHaveLength(1);
    expect(tool('entry.aggregate', { kind: 'Goal', metric: 'completed' }).result.value).toBe(0);
    expect(repo.read().revision).toBe(revision);
    expect(() => hostTool('entry.create', { ...args, owner: 'someone' })).toThrow();
    expect(() => hostTool('entry.create', { ...args, confidence: 0.5 })).toThrow();
    expect(() => tool('entry.query', { kind: 'Goal', conversationId: 'other' })).toThrow();
    expect(() =>
      tool('entry.create', { ...args, sourceRefs: [{ ...refs(msg)[0], conversationId: 'other' }] })
    ).toThrow();
    expect(() => hostTool('entry.create', { ...args, sourceRefs: [{ ...refs(msg)[0], end: 10000 }] })).toThrow();
    op(
      'message.add',
      { conversationId: 'chat', role: 'assistant', content: '先记一个想法：写作句式卡。' },
      'ai-source'
    );
    expect(() => hostTool('entry.create', { ...args, sourceRefs: refs('ai-source') })).toThrow();
    expect(() => tool('entry.aggregate', { kind: 'Idea', metric: 'due' })).toThrow();
    expect(Object.keys(ENTRY_TOOL_SCHEMAS)).toHaveLength(4);
  });
  it.each([
    '他说“明天20点提醒我学习”',
    '假如明天20点提醒我练习',
    '不要明天20点提醒我练写作',
    '我的答案是：先记一个想法：卡片',
    '今天累，有空也许试试',
    '这道题先讲例子'
  ])('保守排除：%s', (text) => {
    expect(extracted(text)).toHaveLength(0);
  });
  it('同ID异内容拒绝、basis变化废止，取消后回扫不复活', () => {
    setupGoal();
    const [p] = extracted('明天晚上8点提醒我练英语写作。', 'reminder-source');
    op('message.add', { conversationId: 'chat', role: 'notice', content: '已忽略' }, `${p.id}:dismiss`);
    expect(() => accept(p.id)).toThrow();
    expect(extractConversationEntries(repo.read(), 'chat', 'reminder-source')).toHaveLength(0);
    const msg = user('明天20点提醒我练写作。');
    const args = {
      kind: 'Reminder',
      fields: {
        kind: 'study',
        schedule: { mode: 'once', date: '2026-10-23', time: '20:00', timezone: 'Asia/Shanghai' }
      },
      sourceRefs: refs(msg)
    };
    const candidate = entryCandidateOperation(repo.read(), 'entry.create', args, 'chat');
    // Use a new time so a dismissed equivalent does not resurrect.
    args.fields.schedule.time = '21:00';
    const second = entryCandidateOperation(repo.read(), 'entry.create', args, 'chat');
    repo.commit(second);
    expect(() =>
      entryCandidateOperation(
        repo.read(),
        'entry.create',
        { ...args, fields: { ...args.fields, schedule: { ...args.fields.schedule, time: '22:00' } } },
        'chat'
      )
    ).toThrow(/冲突/);
    accept(second.id);
    const [change] = extracted('改到22点');
    const original = repo.read().conversations[0].reminders[0];
    op('reminder.set', {
      conversationId: 'chat',
      contract: 'learning-reminder-v2',
      reminderId: original.id,
      kind: 'study',
      schedule: { ...original.schedule, time: '23:00' },
      enabled: true
    });
    expect(() => accept(change.id)).toThrow(/变化/);
    expect(candidate.duplicate).toBe(true);
  });
  it('v1兼容、完成取消、DST消歧、同日plan按会话版本，未归类保留', () => {
    setupGoal();
    op('conversation.start', { goal: '另一个方向' }, 'other');
    const tasks = [{ id: 'task', title: '练写作', condition: 'manual' }];
    op('plan.set', { tasks, day: '2026-10-22' }, 'legacy');
    op('plan.set', { conversationId: 'chat', tasks, day: '2026-10-22' }, 'p1');
    op('plan.set', { conversationId: 'other', tasks, day: '2026-10-22' }, 'p2');
    op('plan.set', { conversationId: 'chat', tasks, day: '2026-10-22' }, 'p3');
    expect(repo.read().plans.map((p) => [p.conversationId, p.version, p.replaces])).toEqual([
      [undefined, 1, null],
      ['chat', 1, null],
      ['other', 1, null],
      ['chat', 2, 'p1']
    ]);
    expect(() => op('plan.merge', { planIds: ['p1', 'p2'] })).toThrow();
    op(
      'reminder.set',
      {
        conversationId: 'chat',
        kind: 'study',
        time: '20:00',
        repeatDays: [1, 3],
        timezone: 'Asia/Shanghai',
        enabled: true
      },
      'weekly'
    );
    const [r] = extracted('明天晚上8点提醒我练英语写作。');
    accept(r.id);
    expect(repo.read().conversations[0].reminders).toHaveLength(2);
    const reminder = repo.read().conversations[0].reminders[1],
      msg = user('取消这个提醒');
    hostTool('entry.update', {
      kind: 'Reminder',
      id: reminder.id,
      basis: reminder.generation,
      patch: { action: 'cancel' },
      sourceRefs: refs(msg)
    });
    const p = repo.read().conversations[0].messages.at(-1);
    accept(p.id);
    expect(repo.read().conversations[0].reminders[1].status).toBe('cancelled');
    const dst = user('明天20点提醒我学习');
    expect(() =>
      hostTool('entry.create', {
        kind: 'Reminder',
        fields: {
          kind: 'study',
          schedule: { mode: 'once', date: '2026-11-01', time: '01:30', timezone: 'America/Los_Angeles' }
        },
        sourceRefs: refs(dst)
      })
    ).toThrow();
    const syncReceipt = normalizePrivateSyncOperation({
      id: 'r',
      type: 'reminder.receipt',
      data: {
        conversationId: 'chat',
        reminderId: 'weekly',
        generation: 'weekly',
        day: '2026-10-26',
        status: 'accepted',
        channel: 'web'
      }
    });
    expect(syncReceipt.data.historyOnly).toBe(true);
  });
  it('原子Goal修订失败不保存半份档案，新事件可重放/raw/gzip往返', async () => {
    setupGoal();
    const before = repo.read();
    expect(() =>
      op('goal.revise', { conversationId: 'chat', explicit: true, patch: { goal: '坏补丁', minutes: 500 } })
    ).toThrow();
    expect(repo.read()).toEqual(before);
    const [r] = extracted('明天晚上8点提醒我练英语写作。');
    accept(r.id);
    const state = repo.read();
    const batch = createLearningOperationBatch(emptyLearningState(state.owner), state.events.length);
    state.events.forEach((e) => batch.apply({ id: e.id, type: e.type, at: e.at, data: e.data }));
    expect(batch.finish()).toEqual(state);
    const wire = encodeHistory(state, state.owner, 'entry-fixture');
    expect(decodeHistory(wire.manifest, wire.pages, state.owner)).toEqual(state);
    expect(await decodeServerHistory(await encodeServerHistory(state, state.owner), state.owner)).toEqual(state);
  });
});

describe('离线受控执行器：默认关闭、原子checkpoint与CAS', () => {
  it('补漏、重复扫描、实时同消息去重、迟到旧时间消息按事件顺序扫描', async () => {
    setupGoal();
    user('明天晚上8点提醒我练英语写作。', 'missed');
    const mock = mongo(repo.read());
    expect(
      (await runConversationEntryScan(mock.db, 'entry-fixture', { token: 'lease-1', clock: () => NOW })).candidates
    ).toBe(1);
    expect(
      (await runConversationEntryScan(mock.db, 'entry-fixture', { token: 'lease-2', clock: () => NOW })).candidates
    ).toBe(0);
    const state = mock.read().state;
    expect(extractConversationEntries(state, 'chat', 'missed')).toHaveLength(0);
    const late = applyLearningOperation(state, {
      id: 'late',
      type: 'message.add',
      at: NOW - 100000,
      data: { conversationId: 'chat', role: 'user', content: '先记一个想法：迟到同步。' }
    }).state;
    mock.change((d) => {
      d.state = late;
      d.revision++;
    });
    expect(
      (await runConversationEntryScan(mock.db, 'entry-fixture', { token: 'lease-3', clock: () => NOW })).candidates
    ).toBe(1);
  });
  it('失败保持cursor，重试退避，租约过期/撤回同意/删除不写入', async () => {
    setupGoal();
    user('先记一个想法：补扫。', 'missed');
    const mock = mongo(repo.read());
    const outcome = await runConversationEntryScan(mock.db, 'entry-fixture', {
      token: 'first',
      clock: () => NOW,
      extract: () => {
        throw Error('private body must not persist');
      }
    });
    expect(outcome.status).toBe('failed');
    expect(mock.read().extraction.cursor).toBeUndefined();
    expect(JSON.stringify(mock.read().extraction)).not.toContain('private');
    expect(
      (await runConversationEntryScan(mock.db, 'entry-fixture', { token: 'early', clock: () => NOW })).status
    ).toBe('retry_pending');
    expect(
      (await runConversationEntryScan(mock.db, 'entry-fixture', { token: 'retry', clock: () => NOW + 60000 })).status
    ).toBe('completed');
    const disabled = mongo(repo.read(), { enabled: false });
    expect((await runConversationEntryScan(disabled.db, 'entry-fixture', { token: 'off' })).status).toBe('disabled');
    const leased = mongo(repo.read(), { leaseUntil: NOW + 1000 });
    expect(
      (await runConversationEntryScan(leased.db, 'entry-fixture', { token: 'busy', clock: () => NOW })).status
    ).toBe('leased');
    const revoked = mongo(repo.read());
    let n = 0;
    const result = await runConversationEntryScan(revoked.db, 'entry-fixture', {
      token: 'revoked',
      clock: () => {
        if (++n === 5)
          revoked.change((d) => {
            d.extraction = { ...d.extraction, enabled: false, generation: 2 };
          });
        return NOW;
      }
    });
    expect(['disabled', 'conflict']).toContain(result.status);
    expect(revoked.read().extraction.enabled).toBe(false);
  });
});

it('计划分包组件呈现待确认、四类、历史与来源回跳，浏览不写事实', () => {
  setupGoal();
  extracted('先记一个想法：写作卡片。');
  const learning = useConversationLearningStore();
  learning.$patch({ state: repo.read() });
  const wrapper = mount(EntriesBoard, {
    global: {
      stubs: {
        BaseButton: {
          props: ['label'],
          template: '<button :aria-label="label" @click="$emit(\'tap\')"><slot /></button>'
        }
      }
    }
  });
  expect(wrapper.text()).toContain('待确认');
  expect(wrapper.text()).toContain('写作卡片');
  expect(wrapper.find('[aria-label="查看来源"]').exists()).toBe(true);
  expect(wrapper.text()).toContain('记忆');
  wrapper.unmount();
  learning.$dispose();
});

it('真实Store实时规则只产生确认卡，计划页按钮确认写入并回跳原消息，零网络', async () => {
  const net = vi.spyOn(uni, 'request').mockImplementation(() => {
    throw Error('No network in entry fixture');
  });
  const learning = useConversationLearningStore();
  learning.start('待确认方向');
  learning.selectedMode = 'offline';
  await learning.send('我的目标是准备考研英语一写作，到2026年12月20日，每天20分钟。', { id: 'live-goal' });
  const p = learning.active.messages.find((m) => m.proposal?.entry?.kind === 'Goal');
  expect(p).toBeTruthy();
  expect(learning.active.studyProfile).toBeUndefined();
  learning.commit(p.proposal.type, { ...p.proposal.data, proposalId: p.id, explicit: true }, `${p.id}:accept`);
  await learning.send('明天晚上8点提醒我练英语写作。', { id: 'live-reminder' });
  expect(learning.active.reminders).toBeUndefined();
  const wrapper = mount(EntriesBoard, {
    global: {
      stubs: {
        BaseButton: {
          props: ['label'],
          template: '<button :aria-label="label" @click="$emit(\'tap\')"><slot /></button>'
        }
      }
    }
  });
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '确认保存')
    .trigger('click');
  expect(learning.active.reminders[0].schedule.time).toBe('20:00');
  await wrapper
    .findAll('button')
    .find((b) => b.text() === '提醒')
    .trigger('click');
  expect(wrapper.text()).toContain('20:00');
  await wrapper
    .findAll('button')
    .find((b) => b.attributes('aria-label') === '查看来源')
    .trigger('click');
  expect(learning.conversationLocation).toMatchObject({ messageId: 'live-reminder:message' });
  expect(net).not.toHaveBeenCalled();
  wrapper.unmount();
  learning.$dispose();
  net.mockRestore();
});

it('离线同批同义消息合并；租约到期、删除、撤销同意不会复活或漏扫', async () => {
  setupGoal();
  user('先记一个想法：做错句卡片。', 'scan-a');
  user('先记一个想法：做错句卡片。', 'scan-b');
  const scan = stageConversationEntryScan(
    repo.read(),
    { enabled: true, enabledAt: NOW, consentVersion: 'fixture' },
    NOW
  );
  expect(scan.operations).toHaveLength(1);
  expect(scan.extraction.cursor).toBe('scan-b');
  const expired = mongo(repo.read());
  let time = NOW;
  const timed = await runConversationEntryScan(expired.db, 'entry-fixture', {
    token: 'expiry',
    clock: () => time,
    extract: (...args) => {
      const ops = extractConversationEntries(...args);
      time = NOW + 30001;
      return ops;
    }
  });
  expect(timed.status).toBe('lease_expired');
  expect(expired.read().extraction.cursor).toBeUndefined();
  expect(
    (await runConversationEntryScan(expired.db, 'entry-fixture', { token: 'fresh', clock: () => NOW + 30002 })).status
  ).toBe('completed');
  const deleted = mongo(repo.read());
  expect(
    (
      await runConversationEntryScan(deleted.db, 'entry-fixture', {
        token: 'deleted',
        clock: () => NOW,
        extract: (...args) => {
          deleted.delete();
          return extractConversationEntries(...args);
        }
      })
    ).status
  ).toBe('disabled');
  expect(deleted.read()).toBeNull();
  const revoked = mongo(repo.read());
  expect(
    (
      await runConversationEntryScan(revoked.db, 'entry-fixture', {
        token: 'revoked',
        clock: () => NOW,
        extract: (...args) => {
          revoked.change((d) => {
            d.extraction.enabled = false;
            d.extraction.generation++;
          });
          return extractConversationEntries(...args);
        }
      })
    ).status
  ).toBe('disabled');
  expect(revoked.read().extraction.cursor).toBeUndefined();
});

it('Idea关联已明确采用的计划才转为promoted，失败仍保留；反复确认不重复', () => {
  setupGoal();
  const [idea] = extracted('先记一个想法：练习写作卡片。');
  accept(idea.id);
  const msg = user('把这个想法转成计划');
  const args = {
    kind: 'Idea',
    id: idea.id,
    basis: entryBasis(repo.read(), 'Idea', idea.id),
    patch: { action: 'promote', targetEventId: 'missing' },
    sourceRefs: refs(msg)
  };
  expect(() => hostTool('entry.update', args)).toThrow();
  expect(entryObjects(repo.read(), 'Idea')[0].status).toBe('kept');
  const plan = tool(
    'plan',
    { tasks: [{ title: '练习写作卡片', condition: 'manual' }], reason: '用户明确安排想法' },
    'idea-plan'
  ).result.messageId;
  accept(plan);
  args.patch.targetEventId = `${plan}:accept`;
  const candidate = hostTool('entry.update', args).result.proposalId;
  accept(candidate);
  expect(accept(candidate).reused).toBe(true);
  expect(entryObjects(repo.read(), 'Idea')[0].status).toBe('promoted');
});

it('回扫写后断线读取checkpoint重试、实时写抢先CAS不复制候选', async () => {
  setupGoal();
  user('先记一个想法：做错句卡片。', 'scan-a');
  const mock = mongo(repo.read());
  let once = true;
  const dropped = {
    collection: (...args) => {
      const collection = mock.db.collection(...args);
      return {
        where: (query) => {
          const request = collection.where(query);
          return {
            ...request,
            update: async (patch) => {
              const result = await request.update(patch);
              if (once && patch.state && result.updated) {
                once = false;
                throw Error('response lost after durable commit');
              }
              return result;
            }
          };
        }
      };
    }
  };
  expect((await runConversationEntryScan(dropped, 'entry-fixture', { token: 'lost', clock: () => NOW })).status).toBe(
    'failed'
  );
  expect(mock.read().extraction.cursor).toBe('scan-a');
  expect(
    (await runConversationEntryScan(mock.db, 'entry-fixture', { token: 'read-checkpoint', clock: () => NOW }))
      .candidates
  ).toBe(0);
  const race = mongo(repo.read());
  let first = true;
  const outcome = await runConversationEntryScan(race.db, 'entry-fixture', {
    token: 'race',
    clock: () => NOW,
    extract: (...args) => {
      const ops = extractConversationEntries(...args);
      if (first && ops.length) {
        first = false;
        race.change((d) => {
          d.state = applyLearningOperation(d.state, ops[0]).state;
          d.revision++;
        });
      }
      return ops;
    }
  });
  expect(outcome.status).toBe('completed');
  expect(race.read().state.conversations[0].messages.filter((m) => m.proposal?.type === 'idea.keep')).toHaveLength(1);
});

it('旧coach档案原子修订不复制studyProfile，目标关闭后需确认重开，过期想法可明确重新提出', () => {
  op('coach.begin', { conversationId: 'chat', explicit: true });
  op('coach.profile', {
    conversationId: 'chat',
    explicit: true,
    profile: { exam: 'english1', minutes: 25, deadline: null, foundation: null }
  });
  op('goal.revise', { conversationId: 'chat', explicit: true, patch: { goal: '准备英语一', minutes: 30 } });
  expect(repo.read().conversations[0].studyProfile).toBeUndefined();
  expect(repo.read().conversations[0].coach.profile.minutes).toBe(30);
  const [idea] = extracted('先记一个想法：做写作卡片。');
  vi.setSystemTime(NOW + 15 * 86400000);
  expect(proposalStatus(repo.read(), idea.id)).toBe('expired');
  expect(extracted('重新记一个想法：做写作卡片。')).toHaveLength(1);
  const [close] = extracted('我完成目标了');
  accept(close.id);
  const [reopen] = extracted('重开目标');
  expect(repo.read().conversations[0].stopped).toBe(true);
  accept(reopen.id);
  expect(entryObjects(repo.read(), 'Goal')[0].status).toBe('active');
});
