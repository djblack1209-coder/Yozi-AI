import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { storageService } from '@/services/storageService.js';
import { learningWriteLease } from '@/services/learning/learning-write-lease.js';
import { coachMaterialContext } from '@/services/learning/coach-material-context.js';
import { coachSavedRecords } from '../../laf-backend/functions/_shared/learning-coach-records.js';
import { museLearningInsights } from '@/services/learning/muse-learning-insights.js';
import {
  coachAssessmentCounts,
  coachInputFor,
  coachEssayType,
  parseCoachModelOutput,
  normalizeCoachOutput,
  COACH_MATERIAL_TRACK,
  WRITING_COACH_CONTRACT
} from '../../laf-backend/functions/_shared/learning-writing-coach.js';
import { generateLearningTurn, fetchLearningResult, fetchLearningModels } from '@/services/api/domains/learning.api.js';
import { coachFixture } from '../fixtures/writing-coach.js';
import WritingCoach from '@/pages/learning/components/writing-coach.vue';

vi.mock('@dcloudio/uni-app', () => ({ onShow: vi.fn(), onHide: vi.fn(), onLoad: vi.fn(), onBackPress: vi.fn() }));
vi.mock('@/services/api/domains/learning.api.js', async (original) => ({
  ...(await original()),
  generateLearningTurn: vi.fn(),
  fetchLearningResult: vi.fn(),
  fetchLearningModels: vi.fn(async () => ({
    success: true,
    data: {
      platformEnabled: false,
      preferences: { selectedModelId: 'fixture-model', sharingAllowed: true },
      presets: [],
      models: [
        {
          id: 'fixture-model',
          provider: 'synthetic',
          model: 'fixture-model',
          source: 'byok',
          configured: true,
          capabilities: { structured: true }
        }
      ]
    }
  }))
}));
const now = Date.parse('2026-10-21T12:00:00Z');
let store, wrapper;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  uni.clearStorageSync();
  storageService.save('EXAM_USER_ID', 'fixture-owner', true);
  storageService.save('EXAM_TOKEN', 'fixture-token', true);
  setActivePinia(createPinia());
  store = useConversationLearningStore();
  store.startCoach('资料练习');
  store.modelId = 'fixture-model';
  store.sharingAllowed = true;
  store.coachSave('profile', { profile: { exam: 'cs408', minutes: 15, track: COACH_MATERIAL_TRACK } });
  const material = {
    id: 'fixture-book',
    name: '三页合成资料',
    fingerprint: 'fixture-book-only',
    segments: [
      { id: 'segment-1', page: 1, content: '栈只允许在一端插入或删除，后进先出。'.repeat(160) },
      { id: 'segment-2', page: 2, content: '队列只允许在一端插入、另一端删除，先进先出。' },
      { id: 'segment-3', page: 3, content: '数组中的元素连续存储，可以按下标访问。' }
    ]
  };
  store.attachMaterial(material);
  vi.mocked(generateLearningTurn).mockReset();
  vi.mocked(fetchLearningResult).mockReset();
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  store.$dispose();
  learningWriteLease.release();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function generate(phase, target = phase) {
  const coach = store.active.coach,
    day = coach.days[0],
    bound = coachInputFor(coach, day, phase, target);
  const request = {
    contract: WRITING_COACH_CONTRACT,
    phase,
    target,
    exam: 'cs408',
    day: '2026-10-21',
    essayType: coachEssayType(coach, '2026-10-21'),
    ...bound,
    sources: coachMaterialContext(store.state, store.active, { phase, ...bound })
  };
  const id = `fixture-${phase}-${target}`;
  store.coachSave('request', { requestId: id, request, modelId: 'fixture-model', binding: 'fixture-binding' });
  const output =
    phase === 'summary'
      ? { kind: 'summary', learned: ['练习了三题'], tomorrow: ['核对待评估原答'] }
      : phase === 'feedback'
        ? feedback(request)
        : {
            kind: phase,
            cards: Array.from({ length: phase === 'diagnostic' ? 1 : 3 }, (_, i) => ({
              id: phase === 'diagnostic' ? 'd1' : `c${i + 1}`,
              kind: phase === 'diagnostic' ? 'diagnostic' : ['concept', 'trace', 'apply'][i],
              title: '栈',
              prompt: '依次入栈1和2，先弹出哪个？',
              sourceId: request.sources[i].id,
              sourceQuote: request.sources[i].content.slice(0, 18),
              sourcePage: request.sources[i].page
            }))
          };
  const parsed = parseCoachModelOutput(JSON.stringify({ message: '合成教学', coach: output }), request).coach;
  store.coachSave('result', { requestId: id, output: parsed });
}
function feedback(r) {
  return {
    kind: 'feedback',
    target: r.target,
    lines: [{ original: r.input, advice: '后进先出，应先弹出2。', rewrite: '2先出来。' }],
    weaknesses: ['后进先出'],
    weaknessEvidence: [{ label: '后进先出', quote: r.input }],
    strengths: [],
    phrases: [],
    dimensions: []
  };
}
function setupDaily() {
  generate('diagnostic');
  store.coachSave('answer', { target: 'diagnostic', cardId: 'd1', answer: '我猜是1' });
  generate('feedback', 'diagnostic');
  generate('daily');
}
describe('batch9 -fixture 状态与计数', () => {
  it('失败先查询原请求，终态关闭后仅明确重新评估才新生成，原答/时间/出处不变', async () => {
    setupDaily();
    store.coachSave('answer', { cardId: 'c1', answer: '我猜是1' });
    store.modelId = 'missing-saved-selection';
    await expect(store.requestCoach('feedback', 'card-c1')).rejects.toMatchObject({ code: 'NEEDS_CONNECTION' });
    expect(generateLearningTurn).not.toHaveBeenCalled();
    store.modelId = 'fixture-model';
    const saved = JSON.parse(JSON.stringify(store.active.coach.days[0].answers[0]));
    vi.mocked(generateLearningTurn).mockResolvedValueOnce({ success: false, code: 502, message: '评估校验失败' });
    vi.mocked(fetchLearningResult).mockImplementation(async (id) => {
      const req = store.active.coach.requests.find((r) => r.id === id);
      return {
        success: true,
        data: { requestId: id, requestBinding: req.binding, modelId: req.modelId, coach: feedback(req.request) }
      };
    });
    await store.requestCoach('feedback', 'card-c1');
    expect(coachAssessmentCounts(store.active.coach, '2026-10-21')).toEqual({ submitted: 2, assessed: 1, pending: 1 });
    expect(store.active.coach.days[0].answers[0]).toEqual(saved);
    expect(saved).toMatchObject({
      assessmentStatus: 'pending',
      reliability: 'pending',
      source: { kind: 'private_material' }
    });
    vi.mocked(fetchLearningResult).mockResolvedValueOnce({
      success: false,
      status: 'failed',
      code: 502,
      message: '原请求失败'
    });
    await store.requestCoach('feedback', 'card-c1');
    const closedId = store.active.coach.requests.at(-1).id;
    expect(store.active.coach.requests.at(-1).status).toBe('closed');
    expect(store.active.coach.days[0].feedback).toEqual({});
    expect(museLearningInsights(store.state, now).weaknesses[0].evidence).toHaveLength(1);
    expect(generateLearningTurn).toHaveBeenCalledTimes(1);
    vi.mocked(generateLearningTurn).mockImplementationOnce(async () => {
      const req = store.active.coach.requests.at(-1);
      return {
        success: true,
        data: {
          requestId: req.id,
          requestBinding: req.binding,
          modelId: req.modelId,
          coach: feedback(req.request)
        }
      };
    });
    await store.requestCoach('feedback', 'card-c1', closedId);
    expect(generateLearningTurn).toHaveBeenCalledTimes(2);
    expect(fetchLearningResult).toHaveBeenCalledTimes(1);
    expect(store.active.coach.days[0].answers[0]).toEqual({ ...saved, assessmentStatus: 'assessed' });
    expect(coachAssessmentCounts(store.active.coach)).toEqual({ submitted: 2, assessed: 2, pending: 0 });
    expect(museLearningInsights(store.state, now)).toMatchObject({
      submitted: 2,
      assessed: 2,
      pending: 0,
      completedDays: 0
    });
    await expect(store.requestCoach('feedback', 'card-c1')).rejects.toThrow('请先提交本卡原答');
    expect(generateLearningTurn).toHaveBeenCalledTimes(2);
  });
  it('未评估仍可提交下一题和保存小结，但不能确认完成；待评估原请求跨日回读', async () => {
    setupDaily();
    store.coachSave('answer', { cardId: 'c1', answer: '我猜是1' });
    vi.mocked(fetchLearningModels).mockResolvedValueOnce({
      success: true,
      data: {
        platformEnabled: false,
        presets: [],
        models: [
          {
            id: 'fixture-model',
            provider: 'synthetic',
            model: 'fixture-model',
            source: 'platform',
            configured: true,
            capabilities: { structured: true }
          }
        ]
      }
    });
    await expect(store.requestCoach('feedback', 'card-c1')).rejects.toMatchObject({ code: 'NEEDS_CONNECTION' });
    expect(generateLearningTurn).not.toHaveBeenCalled();
    vi.mocked(generateLearningTurn).mockResolvedValue({ success: false, code: 503, message: '离线' });
    for (const id of ['c1', 'c2', 'c3']) {
      if (id !== 'c1') store.coachSave('answer', { cardId: id, answer: '我猜是1' });
      await store.requestCoach('feedback', `card-${id}`);
    }
    generate('summary');
    expect(coachAssessmentCounts(store.active.coach)).toEqual({ submitted: 4, assessed: 1, pending: 3 });
    expect(() => store.coachSave('finish')).toThrow();
    const req = store.active.coach.requests.find((r) => r.request.target === 'card-c1');
    const before = store.exportData();
    expect(coachSavedRecords(store.active).find((r) => r.target === 'card-c1')).toMatchObject({
      assessmentStatus: 'pending',
      request: { id: req.id }
    });
    expect(store.exportData()).toBe(before);
    vi.setSystemTime(now + 86400000);
    vi.mocked(fetchLearningResult).mockResolvedValue({
      success: true,
      data: { requestId: req.id, requestBinding: req.binding, modelId: req.modelId, coach: feedback(req.request) }
    });
    await store.requestCoach('feedback', 'card-c1', req.id);
    expect(generateLearningTurn).toHaveBeenCalledTimes(3);
    expect(coachAssessmentCounts(store.active.coach)).toEqual({ submitted: 4, assessed: 2, pending: 2 });
  });
  it('失败 UI 保留原答、重试和先继续；提交与评估分开显示', async () => {
    setupDaily();
    store.coachSave('answer', { cardId: 'c1', answer: '我猜是1' });
    vi.mocked(generateLearningTurn).mockResolvedValue({ success: false, code: 503, message: '评估失败' });
    await store.requestCoach('feedback', 'card-c1');
    wrapper = mount(WritingCoach, { global: { stubs: { BaseIcon: true, PrivacyPopup: true } } });
    await flushPromises();
    expect(wrapper.text()).toContain('原答已保存，AI 评估待完成');
    expect(wrapper.text()).toContain('已提交 2 题，1 题已评估，1 题待评估');
    const next = wrapper.findAll('button').find((b) => b.text() === '先继续下一题');
    await next.trigger('tap');
    await flushPromises();
    expect(
      wrapper.findComponent({ name: 'muse-practice-sheet' }).exists() ||
        wrapper.find('[data-test="coach-practice-sheet"]').exists()
    ).toBe(true);
    expect(wrapper.get('[data-test="coach-practice-sheet"]').text()).toContain('依次入栈1和2，先弹出哪个？');
  });
});
describe('batch9 -fixture 资料与逐字证据', () => {
  it('长首页不能挤占三页覆盖；不足三页时按段分散；不读取未绑定资料', () => {
    const selected = coachMaterialContext(store.state, store.active, { task: '栈' });
    expect(new Set(selected.map((s) => s.page)).size).toBe(3);
    const material = store.state.materials[0];
    const state = {
      ...store.state,
      materials: [{ ...material, segments: material.segments.map((s) => ({ ...s, page: null })) }]
    };
    expect(coachMaterialContext(state, store.active, {})).toHaveLength(3);
  });
  it.each([
    ['栈只允许在一端插入或删除，后进先出。', 1, 'private_material'],
    ['栈 只允许在一端插入或删除 后进先出', 1, 'private_material'],
    ['栈先进先出', 1, 'model_generated'],
    ['栈只允许在一端插入或删除，后进先出。', 2, 'model_generated'],
    [undefined, 1, 'model_generated'],
    ['栈只允许在一端插入或删除，后进先出。', undefined, 'model_generated'],
    ['栈'.repeat(201), 1, 'model_generated']
  ])('quote=%s page=%s => %s', (quote, page, kind) => {
    const request = {
      contract: WRITING_COACH_CONTRACT,
      phase: 'diagnostic',
      exam: 'cs408',
      day: '2026-10-21',
      sources: [{ id: 'source', name: '资料', page: 1, content: '栈只允许在一端插入或删除，后进先出。' }]
    };
    const value = {
      kind: 'diagnostic',
      cards: [
        {
          id: 'd1',
          kind: 'diagnostic',
          title: '栈',
          prompt: '先取出哪个？',
          sourceId: 'source',
          sourceQuote: quote,
          sourcePage: page
        }
      ]
    };
    const card = parseCoachModelOutput(JSON.stringify({ message: '开始', coach: value }), request).coach.cards[0];
    expect(card.source.kind).toBe(kind);
    const persisted = normalizeCoachOutput({ kind: 'diagnostic', cards: [card] }, request).cards[0];
    expect(persisted.source.kind).toBe(kind);
    if (kind === 'model_generated') expect(persisted.source).toMatchObject({ materialUncovered: true });
    else
      expect(persisted.source.quote.replace(/[\s\p{P}]/gu, '')).toBe(
        request.sources[0].content.replace(/[\s\p{P}]/gu, '')
      );
  });
  it('英语写作题同样校验quote/page；卡片重排后仍按ID匹配引用', () => {
    const sources = [
      { id: 's1', name: '英语资料', page: 1, content: 'Invitation letter for a reading event.' },
      { id: 's2', name: '英语资料', page: 2, content: 'Thank you for your generous help.' }
    ];
    const request = { contract: WRITING_COACH_CONTRACT, phase: 'daily', exam: 'english1', day: '2026-10-21', sources };
    const raw = coachFixture(request);
    for (const [i, card] of raw.cards.entries())
      Object.assign(card, {
        sourceId: sources[i % 2].id,
        sourceQuote: sources[i % 2].content,
        sourcePage: sources[i % 2].page
      });
    raw.cards.reverse();
    raw.writing = { ...raw.writing, sourceId: 's1', sourceQuote: 'not in the material', sourcePage: 1 };
    const output = parseCoachModelOutput(JSON.stringify({ message: '今日训练', coach: raw }), request).coach;
    expect(output.cards.every((c) => c.source.kind === 'private_material')).toBe(true);
    expect(output.writing.source).toMatchObject({ kind: 'model_generated', materialUncovered: true });
    const saved = normalizeCoachOutput(output, request);
    expect(saved.writing.source).toMatchObject({ kind: 'model_generated', materialUncovered: true });
  });
  it('降级题反馈不写资料弱项；优点无原答逐字证据时留空；历史无quote来源保持可读', () => {
    const request = {
      contract: WRITING_COACH_CONTRACT,
      phase: 'feedback',
      target: 'card-c1',
      exam: 'cs408',
      day: '2026-10-21',
      input: '我猜是1',
      sourceKind: 'model_generated',
      sources: [{ id: 's', name: '资料', page: 1, content: '栈后进先出' }]
    };
    const output = parseCoachModelOutput(
      JSON.stringify({
        message: '反馈',
        coach: {
          ...feedback(request),
          strengths: ['掌握栈'],
          strengthEvidence: [{ label: '掌握栈', quote: '原答不存在' }]
        }
      }),
      request
    ).coach;
    expect(output).toMatchObject({ weaknesses: [], strengths: [], sourceStatus: 'material_uncovered' });
    const legacy = normalizeCoachOutput(
      { kind: 'diagnostic', cards: [{ id: 'd1', kind: 'diagnostic', title: '历史题', prompt: '旧题', sourceId: 's' }] },
      { ...request, phase: 'diagnostic', target: 'diagnostic' }
    );
    expect(legacy.cards[0].source).toMatchObject({ kind: 'private_material', page: 1 });
  });
});
