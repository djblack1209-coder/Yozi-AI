import { describe, expect, it } from 'vitest';
import { emptyLearningState, applyLearningOperation, dayKey } from '@/services/learning/learning-domain.js';
import { coachMaterialContext, coachSourcePassage } from '@/services/learning/coach-material-context.js';
import { museLearningInsights } from '@/services/learning/muse-learning-insights.js';
import { museGoals, museHistory } from '@/services/learning/muse-workspace-data.js';
import {
  COACH_MATERIAL_TRACK,
  WRITING_COACH_CONTRACT,
  coachInputFor,
  coachEssayType,
  parseCoachModelOutput,
  coachSystemPrompt,
  coachInferenceContext,
  coachWeaknesses,
  writingCoachDashboard,
  coachSourceDisputed,
  normalizeCoachOutput
} from '../../laf-backend/functions/_shared/learning-writing-coach.js';

const start = Date.parse('2026-10-17T12:00:00Z');

it.each([
  {
    id: 'writing-guide',
    pages: [
      'State the purpose of an email in the first paragraph.',
      'A library reservation system reduces queueing for study seats.',
      'Use a greeting when you know the recipient.',
      'Close a request with the expected response and a courteous sign-off.'
    ],
    questions: [
      { query: 'How can reservation reduce queueing for library seats?', pages: [2] },
      { query: 'Where do the greeting and purpose belong in an email?', pages: [1, 3] }
    ]
  },
  {
    id: 'data-structures',
    pages: [
      '栈只允许在同一端插入和删除，后进先出。',
      '队列在队尾插入，在队头删除，先进先出。',
      '递归调用把返回地址与局部变量压入栈帧。',
      '环形缓冲区用取模更新读写索引。'
    ],
    questions: [
      { query: '递归调用怎样保存返回地址和局部变量？', pages: [3] },
      { query: '队列怎样在队尾插入和队头删除？', pages: [2] }
    ]
  }
])('keeps the gold passage ranks for $id', ({ id, pages, questions }) => {
  const material = { id, name: id, segments: pages.map((content, index) => ({ content, page: index + 1 })) };
  const rows = questions.map(({ query, pages: relevant }) => {
    const results = coachMaterialContext(
      { materials: [material] },
      { coach: { materialIds: [id] } },
      { input: query },
      3
    );
    const hits = results.map(({ page }) => relevant.includes(page));
    const dcg = (items) => items.reduce((sum, hit, rank) => sum + Number(hit) / Math.log2(rank + 2), 0);
    const first = hits.indexOf(true);
    return {
      recallAt3: hits.filter(Boolean).length / relevant.length,
      ndcgAt3: dcg(hits) / dcg(relevant.map(() => true)),
      reciprocalRank: first < 0 ? 0 : 1 / (first + 1)
    };
  });
  expect(rows).toEqual(questions.map(() => ({ recallAt3: 1, ndcgAt3: 1, reciprocalRank: 1 })));
});

it('来源跳到实际检索的页内片段，资料被修改或删除后不跳到同名文件', () => {
  const quote = '下一段才开始解释先入先出。';
  const material = {
    id: 'book',
    name: '私人资料',
    segments: [{ id: 'page-7', page: 7, content: `${'甲'.repeat(1140)}${quote}后文` }]
  };
  const [source] = coachMaterialContext(
    { materials: [material] },
    { coach: { materialIds: ['book'] } },
    { input: quote },
    1
  );
  const reference = { ...source, kind: 'private_material', quote };
  expect(source.id).toBe('book:page:7:0:1000');
  expect(coachSourcePassage([material], reference)).toEqual({
    name: material.name,
    location: '第 7 页',
    materialId: 'book',
    segmentId: 'page-7',
    start: 1140,
    end: 1140 + quote.length
  });
  expect(coachSourcePassage([{ ...material, id: 'other' }], reference)).toBeNull();
  expect(
    coachSourcePassage([{ ...material, segments: [{ page: 7, content: '乙'.repeat(1200) }] }], reference)
  ).toBeNull();
});

it('薄弱点看板复用证据过滤且保留较早的有效记录，不改写历史', () => {
  const labels = Array.from({ length: 9 }, (_, i) => `合成观察${i}`);
  const coach = {
    profile: { exam: 'cs408', track: COACH_MATERIAL_TRACK },
    diagnostic: { feedback: { weaknesses: ['无证据的旧标签'], lines: [], weaknessEvidence: [] } },
    days: Array.from({ length: 4 }, (_, i) => ({
      day: `2026-10-${14 + i}`,
      answers: [],
      rewrites: [],
      feedback:
        i === 0
          ? {
              'card-c1': {
                weaknesses: labels,
                weaknessEvidence: labels.map((label) => ({ label, quote: '先取出1' })),
                lines: [{ original: '我会先取出1' }]
              }
            }
          : {}
    })),
    library: []
  };
  const before = JSON.stringify(coach);
  expect(coachWeaknesses(coach)).toEqual([]);
  expect(writingCoachDashboard(coach, '2026-10-18').weaknesses).toEqual(labels);
  expect(JSON.stringify(coach)).toBe(before);
});

function harness() {
  let state = emptyLearningState('material-student', 'Asia/Shanghai'),
    serial = 0,
    now = start;
  const apply = (type, data = {}) => {
    const result = applyLearningOperation(state, {
      id: `op${++serial}`,
      type,
      at: now,
      data: type.startsWith('coach.') ? { conversationId: 'study', explicit: true, ...data } : data
    });
    state = result.state;
    return result.result;
  };
  state = applyLearningOperation(state, {
    id: 'study',
    type: 'conversation.start',
    at: now,
    data: { goal: '今年计算机考研，零基础，容易分心' }
  }).state;
  apply('coach.begin');
  apply('coach.profile', {
    profile: {
      exam: 'cs408',
      track: COACH_MATERIAL_TRACK,
      subjects: ['kaoyan_major'],
      minutes: 15,
      foundation: '零基础，容易分心'
    }
  });
  state.materials.push({
    id: 'book',
    name: '私人数据结构资料',
    segments: [{ page: 3, content: '栈只允许在一端插入或删除，后进先出。队列先进先出。' }]
  });
  apply('coach.material', { materialId: 'book' });
  const current = () => state.conversations[0].coach;
  const generate = (phase, output, target = phase) => {
    const coach = current(),
      today = dayKey(now, state.timezone),
      day = coach.days.find((v) => v.day === today);
    const bound = coachInputFor(coach, day, phase, target);
    const request = {
      contract: WRITING_COACH_CONTRACT,
      phase,
      target,
      day: today,
      exam: 'cs408',
      minutes: 15,
      foundation: coach.profile.foundation,
      essayType: coachEssayType(coach, today),
      ...bound,
      sources: coachMaterialContext(state, state.conversations[0], bound)
    };
    const id = `request${++serial}`;
    apply('coach.request', { requestId: id, request, modelId: 'free-model', binding: 'binding' });
    const parsed = parseCoachModelOutput(
      JSON.stringify({ message: '继续一小步', question: null, tools: [], coach: output(request) }),
      request
    );
    apply('coach.result', { requestId: id, output: parsed.coach });
    return request;
  };
  const cards = (r, count, kind) => ({
    kind: r.phase,
    cards: Array.from({ length: count }, (_, i) => ({
      id: `${r.phase === 'daily' ? 'c' : 'd'}${i + 1}`,
      kind: kind[i] || kind[0],
      title: '栈与队列',
      prompt: '栈中依次放入1和2，先取出哪个？',
      example: '',
      sourceId: r.sources[0].id,
      sourceQuote: r.sources[0].content.slice(0, 90),
      sourcePage: r.sources[0].page
    }))
  });
  const feedback = (r) => ({
    kind: 'feedback',
    target: r.target,
    lines: [{ original: r.input.split('\n')[0], advice: '栈后进先出，比较最后进入的元素。', rewrite: '应先取出2。' }],
    weaknesses: ['栈的后进先出'],
    weaknessEvidence: [{ label: '栈的后进先出', quote: r.input.split('\n')[0] }],
    strengths: [],
    phrases: ['栈后进先出'],
    dimensions: []
  });
  return {
    get state() {
      return state;
    },
    apply,
    current,
    generate,
    cards,
    feedback,
    setNow: (value) => (now = value)
  };
}

describe('资料带练复用同一事实引擎', () => {
  it.each([
    '七个工作日不是交付资料期限，不索材料未要求的证明，不决定是否公开。',
    '不能把七个工作日写成交付资料期限，不能索取材料外证明或提前决定公开。',
    '资料交付另按程序核对，不能索要额外证明。'
  ])('S29 proof-document requests do not create a source dispute: %s', (input) => {
    expect(coachSourceDisputed(input)).toBe(false);
  });
  it.each([
    '提供的资料只解释next存下标，并未证明这道题的前提。',
    '资料没有明确提供该前提的依据。',
    '资料不能证明无需索取证明。',
    '题目超出资料范围，但不能索取额外证明。',
    '课本没有这条结论的证明。',
    '不要索取资料并未证明的额外前提。'
  ])('S29 genuine source disputes still withhold judgment: %s', (input) => {
    expect(coachSourceDisputed(input)).toBe(true);
  });
  it('本次评阅不携带旧错误标签，无原答证据的薄弱点不进入新洞察，历史仍可回看', () => {
    const h = harness();
    const request = {
      contract: WRITING_COACH_CONTRACT,
      phase: 'feedback',
      target: 'card-c1',
      day: '2026-10-17',
      exam: 'cs408',
      sources: [{ id: 'book:page:3', name: '资料', page: 3, content: '栈后进先出' }],
      input: '从0到1再到3，终止，目标不在这条链上。',
      task: '从0查找50',
      weaknesses: ['旧的错误标签']
    };
    const before = JSON.stringify(request);
    expect(coachInferenceContext(request).weaknesses).toEqual([]);
    expect(JSON.stringify(request)).toBe(before);
    const feedback = {
      ...h.feedback(request),
      weaknesses: ['旧的错误标签'],
      weaknessEvidence: [{ label: '旧的错误标签', quote: '原答没有说过这句话' }]
    };
    expect(
      parseCoachModelOutput(JSON.stringify({ message: '反馈', coach: feedback }), request).coach.weaknesses
    ).toEqual([]);
    expect(normalizeCoachOutput(feedback, request).weaknesses).toEqual(['旧的错误标签']);
    const current = { ...feedback, weaknesses: [{ label: '本题观察', quote: request.input }] };
    expect(
      parseCoachModelOutput(JSON.stringify({ message: '反馈', coach: current }), request).coach.weaknesses
    ).toEqual(['本题观察']);
    expect(coachSystemPrompt(request)).toContain('先独立求解当前题');
    const previous = { ...h.current(), diagnostic: { feedback: { ...feedback, weaknessEvidence: [] } } };
    expect(coachWeaknesses(previous)).toEqual([]);
    const daily = {
      ...request,
      phase: 'daily',
      target: 'daily',
      task: `上次已保存反馈：${JSON.stringify([{ original: request.input, advice: '旧的错误解释' }])}`
    };
    expect(coachInferenceContext(daily).task).toContain(request.input);
    expect(coachInferenceContext(daily).task).not.toContain('旧的错误解释');
    const disputed = { ...request, input: '提供的资料只解释next存下标，并未证明这道题的前提。' };
    expect(coachSourceDisputed(disputed.input)).toBe(true);
    expect(coachSourceDisputed('next保存的是下一个节点的值，不是数组下标。')).toBe(false);
    const candidate = h.feedback(disputed);
    const output = parseCoachModelOutput(JSON.stringify({ message: '反馈', coach: candidate }), disputed).coach;
    expect(output).toMatchObject({ sourceStatus: 'pending_verification', weaknesses: [], strengths: [], phrases: [] });
    expect(output.lines[0].rewrite).toContain('暂不判定对错');
  });
  it('零基础错答完整走到小结和完成，数据面板不凭反馈编造正确率或写作', () => {
    const h = harness();
    h.generate('diagnostic', (r) => h.cards(r, 1, ['diagnostic']));
    for (const card of h.current().diagnostic.cards)
      h.apply('coach.answer', { target: 'diagnostic', cardId: card.id, answer: '我不知道，猜1。' });
    h.generate('feedback', h.feedback, 'diagnostic');
    h.generate('daily', (r) => h.cards(r, 3, ['concept', 'trace', 'apply']));
    for (const card of h.current().days[0].pack.cards) {
      h.apply('coach.answer', { target: 'daily', cardId: card.id, answer: '1先出来，因为先进先出。' });
      h.generate('feedback', h.feedback, `card-${card.id}`);
    }
    expect(() => h.apply('coach.finish')).toThrow();
    h.generate('summary', () => ({ kind: 'summary', learned: ['练习区分栈与队列'], tomorrow: ['换例子复习后进先出'] }));
    h.apply('coach.finish');
    const facts = museLearningInsights(h.state, start);
    expect(facts).toMatchObject({ submitted: 4, completedDays: 1, essays: 0, familiar: 0 });
    expect(facts.weaknesses[0].evidence).toHaveLength(4);
    expect(facts.strengths).toHaveLength(0);
    expect(museGoals(h.state, start)[0].tasks.some((task) => task.id === 'writing')).toBe(false);
    expect(museHistory(h.state).length).toBeGreaterThan(0);
    expect(() => h.apply('coach.answer', { target: 'daily', cardId: 'c1', answer: '篡改已保存原答' })).toThrow();
    h.setNow(start + 3 * 86400000);
    const before = h.state.events.length;
    const goals = museGoals(h.state, start + 3 * 86400000);
    expect(goals[0].next).toBe('安排今日训练');
    expect(h.state.events).toHaveLength(before);
    expect(h.current().days).toHaveLength(1);
    expect(museLearningInsights(h.state, start + 3 * 86400000).days.filter((day) => day.count)).toHaveLength(1);
    h.generate('daily', (r) => h.cards(r, 3, ['concept', 'trace', 'apply']));
    expect(h.current().days).toHaveLength(2);
    expect(h.current().days[1].pack.cards).toHaveLength(3);
  });
  it('来源、原答、工具和密集输出继续受校验；基础描述真正进入教学约束', () => {
    const h = harness();
    const r = h.generate('diagnostic', (request) => h.cards(request, 1, ['diagnostic']));
    expect(coachSystemPrompt(r)).toContain('零基础，容易分心');
    expect(() => coachSystemPrompt({ ...r, sources: [] })).toThrow('请先添加学习资料');
    expect(coachSystemPrompt(r)).toContain('不奖励');
    const legacy = h.cards(r, 1, ['diagnostic']);
    delete legacy.cards[0].sourceQuote;
    expect(normalizeCoachOutput(legacy, r).cards[0].source.verified).toBe(false);
    const spaced = { ...r, sources: [{ ...r.sources[0], content: '栈只允许在一端\n插入或删除，后进先出。' }] };
    const quoted = h.cards(spaced, 1, ['diagnostic']);
    quoted.cards[0].sourceQuote = spaced.sources[0].content.replace(/\s/gu, '');
    expect(
      parseCoachModelOutput(JSON.stringify({ message: '开始', coach: quoted }), spaced).coach.cards[0].source.quote
    ).toBe(spaced.sources[0].content);
    quoted.cards[0].sourceQuote = '栈允许从两端插入或者删除';
    expect(
      parseCoachModelOutput(JSON.stringify({ message: '开始', coach: quoted }), spaced).coach.cards[0].source
    ).toMatchObject({ kind: 'model_generated', materialUncovered: true });
    expect(
      parseCoachModelOutput(JSON.stringify({ message: '开始', coach: legacy }), r).coach.cards[0].source.verified
    ).toBe(false);
    const broad = h.cards(r, 1, ['diagnostic']);
    broad.cards[0].prompt = '为什么它适合内存受限环境？';
    expect(() => parseCoachModelOutput(JSON.stringify({ message: '开始', coach: broad }), r)).toThrow('超出所引用资料');
    const output = h.cards(r, 1, ['diagnostic']);
    output.cards[0].sourceId = null;
    expect(() => parseCoachModelOutput(JSON.stringify({ message: '开始', coach: output }), r)).toThrow('每题引用');
    expect(() =>
      parseCoachModelOutput(
        JSON.stringify({ message: '小结', coach: { kind: 'summary', learned: ['掌握了静态链表'], tomorrow: [] } }),
        { ...r, phase: 'summary', target: 'summary' }
      )
    ).toThrow('不能宣称掌握');
    expect(() =>
      parseCoachModelOutput(JSON.stringify({ message: '已完成', tools: [{ name: 'progress' }], coach: output }), r)
    ).toThrow('不接受模型工具');
    const request = { ...r, phase: 'feedback', target: 'diagnostic', input: '我不知道' };
    const fake = h.feedback(request);
    expect(() =>
      parseCoachModelOutput(
        JSON.stringify({
          message: '反馈',
          coach: { ...fake, lines: [{ ...fake.lines[0], advice: '只解释一个关键原因' }] }
        }),
        request
      )
    ).toThrow('格式占位');
    fake.lines[0].original = '我完全掌握了';
    expect(() => parseCoachModelOutput(JSON.stringify({ message: '反馈', coach: fake }), request)).toThrow(
      '没有引用当前原答'
    );
  });
});
