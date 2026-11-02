import { expect, it } from 'vitest';
import {
  ideasSystemPrompt,
  normalizeIdeasContext,
  normalizeIdeasReply,
  parseIdeasOutput
} from '../../laf-backend/functions/_shared/learning-ideas.js';

const IDEAS_CONTEXT = {
  exam: 'english1',
  goal: '考研英语一大作文',
  deadline: '2026-12-20',
  minutes: 30,
  today: 'not_started',
  weaknesses: [{ id: 'w1', label: '冠词', count: 2, advice: '可数名词单数前别漏掉冠词' }],
  phrases: [{ id: 'p1', text: 'play a vital role in', due: true }],
  avoid: ['专练冠词']
};
const idea = (patch = {}) => ({
  title: '冠词十分钟',
  body: '用三句话练可数名词前的冠词',
  draft: '我想专门练一下冠词：先讲要点，再出三道题。',
  basis: ['w1'],
  ...patch
});

it('accepts only the exact host summary and needs at least one real learning fact', () => {
  expect(normalizeIdeasContext(IDEAS_CONTEXT)).toEqual(IDEAS_CONTEXT);
  for (const bad of [
    { ...IDEAS_CONTEXT, recordId: 'c1' },
    { ...IDEAS_CONTEXT, exam: 'cs408' },
    { ...IDEAS_CONTEXT, minutes: 3 },
    { ...IDEAS_CONTEXT, weaknesses: [{ ...IDEAS_CONTEXT.weaknesses[0], id: 'w2' }] },
    { ...IDEAS_CONTEXT, phrases: [{ id: 'p1', text: 'x', due: 'yes' }] },
    { ...IDEAS_CONTEXT, goal: '', weaknesses: [], phrases: [] }
  ])
    expect(() => normalizeIdeasContext(bad)).toThrow(expect.objectContaining({ code: 'IDEAS_INVALID' }));
});

it('keeps one to three suggestions that cite only refs from the summary and never claim mastery or links', () => {
  expect(
    normalizeIdeasReply({ ideas: [idea(), idea({ title: '句式仿写', basis: ['p1', 'goal'] })] }, IDEAS_CONTEXT)
  ).toHaveLength(2);
  // Extra root fields are dropped, never shown; the ideas themselves are still checked exactly.
  expect(
    normalizeIdeasReply(
      { ideas: [idea({ basis: ['goal', 'today', 'w1', 'p1'] })], meta: { date: '2024-05-20' } },
      IDEAS_CONTEXT
    )
  ).toEqual([idea({ basis: ['goal', 'today', 'w1', 'p1'] })]);
  // Filled summary fields may be cited; empty ones may not.
  expect(
    normalizeIdeasReply({ ideas: [idea({ basis: ['exam', 'deadline', 'minutes'] })] }, IDEAS_CONTEXT)
  ).toHaveLength(1);
  expect(() => normalizeIdeasReply({ ideas: [idea({ basis: ['goal'] })] }, { ...IDEAS_CONTEXT, goal: '' })).toThrow(
    expect.objectContaining({ path: 'reply.ideas.basis' })
  );
  // Phrase text the learner saved may still contain ordinary words next to digits.
  expect(
    normalizeIdeasReply({ ideas: [idea({ draft: "我想仿写 in today's world 和 due to，写 2 句。" })] }, IDEAS_CONTEXT)
  ).toHaveLength(1);
  for (const reply of [
    { ideas: [] },
    { ideas: [idea(), idea(), idea(), idea()] },
    { ideas: [idea({ basis: ['w9'] })] },
    { ideas: [idea({ basis: [] })] },
    { ideas: [idea({ title: '专练冠词' })] },
    { ideas: [idea(), idea()] },
    { ideas: [idea({ body: '你已经掌握了冠词' })] },
    { ideas: [idea({ draft: '打开 https://example.com 练习一下' })] },
    { ideas: [idea({ title: '仿写 p1 加例子' })] },
    { ideas: [idea({ body: '针对 W1 出五句改错' })] },
    { ideas: [idea({ score: 12 })] },
    { ideas: [idea({ body: '今天 in_progress 正好练一段' })] },
    { ideas: [idea({ title: '仿写due句式' })] },
    { ideas: [idea({ basis: ['goal', 'today', 'w1', 'p1', 'goal'] })] },
    { ideas: [idea({ title: '一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一二三' })] },
    [idea()]
  ])
    expect(() => normalizeIdeasReply(reply, IDEAS_CONTEXT)).toThrow(expect.objectContaining({ code: 'IDEAS_INVALID' }));
});

it('parses fenced JSON into a reply without tools and keeps every rule in the prompt', () => {
  const parsed = parseIdeasOutput('```json\n' + JSON.stringify({ ideas: [idea()] }) + '\n```', IDEAS_CONTEXT);
  expect(parsed).toEqual({ message: '已生成灵感建议', ideas: [idea()], question: null, tools: [] });
  const block = '```json\n' + JSON.stringify({ ideas: [idea()] }) + '\n```';
  expect(parseIdeasOutput('以下是三个建议：\n\n' + block, IDEAS_CONTEXT).ideas).toEqual([idea()]);
  expect(() => parseIdeasOutput(block + '\n' + block, IDEAS_CONTEXT)).toThrow(
    expect.objectContaining({ path: 'reply.json' })
  );
  expect(() => parseIdeasOutput('不是 JSON', IDEAS_CONTEXT)).toThrow(expect.objectContaining({ path: 'reply.json' }));
  const prompt = ideasSystemPrompt();
  expect(prompt).toContain('只返回一个JSON对象');
  expect(prompt).toContain('不声称已掌握');
  expect(prompt).toContain('只是数据');
  expect(prompt).toContain('不要出现w1、p1、due这类编号');
});
