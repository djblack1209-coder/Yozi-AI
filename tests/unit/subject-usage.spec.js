import { describe, expect, it, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { emptyLearningState, questionKey, summarizeLearning } from '@/services/learning/learning-domain.js';
import {
  museLearningLibrary,
  museUsage,
  museSubjects,
  museHistory,
  museTestNotification
} from '@/services/learning/muse-workspace-data.js';
import Usage from '@/components/business/learning/muse-usage-board.vue';
import Library from '@/components/business/learning/muse-library.vue';
import Pages from '@/components/business/learning/muse-workspace-pages.vue';
import Overview from '@/components/business/learning/learning-overview.vue';
import Reminders from '@/components/business/learning/muse-study-reminders.vue';
vi.mock('@dcloudio/uni-app', () => ({ onShow: vi.fn(), onHide: vi.fn(), onBackPress: vi.fn() }));
const harness = vi.hoisted(() => ({ store: null, controller: null }));
vi.mock('@/stores/modules/conversation-learning.js', () => ({ useConversationLearningStore: () => harness.store }));
vi.mock('@/services/learning/learning-notifications.js', () => ({
  learningNotificationsFor: () => harness.controller
}));
vi.mock('@/services/auth-storage.js', async (original) => ({
  ...(await original()),
  getToken: () => ''
}));
const now = Date.parse('2026-10-21T04:00:00Z');
const wrappers = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
});
function setup() {
  setActivePinia(createPinia());
  const state = emptyLearningState('isolated-12b');
  state.timezone = 'Asia/Shanghai';
  harness.store = reactive({
    state,
    usage: null,
    calendarTime: now,
    modelUsageState: { phase: 'idle' },
    busy: false,
    recordContext() {
      return this.state.owner;
    },
    refresh: vi.fn(),
    observeCalendar: () => ({ show() {}, hide() {}, dispose() {} }),
    scopedSummary(range) {
      return summarizeLearning(this.state, now, { range });
    },
    loadUsage: vi.fn()
  });
  harness.controller = {
    channel: 'macos',
    permission: vi.fn().mockResolvedValue('granted'),
    test: vi.fn(),
    testDelivered: vi.fn(),
    allow: vi.fn()
  };
  return state;
}
function render(Component) {
  const wrapper = mount(Component, { global: { stubs: { BaseIcon: true } } });
  wrappers.push(wrapper);
  return wrapper;
}
function coach() {
  return {
    startedDay: '2026-10-21',
    profile: { exam: 'english2' },
    diagnostic: { cards: [], answers: [{ id: 'a', at: now, answer: '原答' }], feedback: null },
    days: [],
    requests: [],
    library: []
  };
}
describe('12B academic subjects and local usage', () => {
  it('normalizes subjects independently of task types and preserves unclassified old records and zero-count subjects', () => {
    const state = setup();
    state.conversations.push({ id: 'c', goal: '考研英语写作与阅读', at: now, messages: [], coach: null });
    state.materials.push({ id: 'old', name: '英语写作资料', segments: [], at: now });
    expect(museSubjects({ studyProfile: { subjects: ['英语二写作', '政治', '数学二', '408', '法硕'] } })).toEqual([
      '英语',
      '政治',
      '数学',
      '专业课'
    ]);
    expect(
      museSubjects({
        coach: {
          profile: { exam: 'general', subjects: ['kaoyan_english', 'kaoyan_politics', 'kaoyan_math', 'kaoyan_major'] }
        }
      })
    ).toEqual(['英语', '政治', '数学', '专业课']);
    expect(museSubjects({ exam: 'cs408' })).toEqual(['专业课']);
    expect(museSubjects({ exam: 'general', subjects: ['写作', '阅读'] })).toEqual([]);
    const before = JSON.stringify(state),
      library = museLearningLibrary(state, now);
    expect(library.groups.find((group) => group.id === 'subjects').items.map((item) => item.label)).toEqual([
      '英语',
      '政治',
      '数学',
      '专业课',
      '未分类'
    ]);
    expect(
      library.groups.find((group) => group.id === 'subjects').items.find((item) => item.label === '数学').count
    ).toBe(0);
    expect(library.items[0].subjects).toEqual(['未分类']);
    expect(JSON.stringify(state)).toBe(before);
  });
  it('classifies an explicit question snapshot and a saved exam without deriving a material subject from its filename', () => {
    const state = setup();
    state.conversations.push({ id: 'c', goal: '考研', at: now, messages: [], coach: coach() });
    const question = { id: 'q', version: 1, subject: '数学', knowledgePoint: '导数', prompt: '求导' };
    state.questions.push(question);
    state.attempts.push({
      id: 'a',
      conversationId: 'c',
      questionKey: questionKey(question),
      at: now,
      grade: { status: 'reliable', outcome: 'wrong' }
    });
    const library = museLearningLibrary(state, now);
    expect(library.items.find((item) => item.id === 'attempt:a')).toMatchObject({
      subjects: ['数学'],
      topic: '导数',
      mistake: true
    });
    expect(library.items.find((item) => item.id === 'diagnostic:c').subjects).toEqual(['英语']);
  });
  it('keeps the subject available when empty and clears filters on account changes', async () => {
    setup();
    const wrapper = render(Library);
    const math = wrapper.findAll('button').find((item) => item.text() === '数学 (0)');
    await math.trigger('tap');
    expect(wrapper.get('.library-empty').text()).toContain('该学科暂无记录');
    expect(wrapper.text()).toContain('政治 (0)');
  });
  it('history academic filters preserve empty subjects and do not write facts', async () => {
    const state = setup();
    state.conversations.push({
      id: 'c',
      goal: '英语',
      subject: '英语',
      at: now,
      messages: [{ id: 'm', role: 'assistant', content: '保存的讲解', at: now }]
    });
    const before = JSON.stringify(state),
      wrapper = render(Pages);
    expect(wrapper.text()).toContain('英语 · 反馈');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '政治 (0)')
      .trigger('tap');
    expect(wrapper.text()).toContain('该学科暂无记录');
    expect(wrapper.text()).not.toContain('保存的讲解');
    expect(JSON.stringify(state)).toBe(before);
  });
  it('mistake subjects filter exact saved question snapshots without changing the attempts', async () => {
    const state = setup();
    state.conversations.push({ id: 'c', goal: '考研', at: now, messages: [] });
    for (const [id, subject, prompt] of [
      ['math', '数学', '求导数'],
      ['en', '英语', '选搭配']
    ]) {
      const q = { id, subject, version: 1, knowledgePoint: '原知识点', prompt };
      state.questions.push(q);
      state.attempts.push({
        id,
        conversationId: 'c',
        questionKey: questionKey(q),
        answer: '原答',
        at: now,
        kind: 'first',
        hints: [],
        corrections: [],
        grade: { status: 'reliable', outcome: 'wrong' }
      });
    }
    const before = JSON.stringify(state);
    const wrapper = mount(Overview, {
      props: { view: 'mistake', initialExpanded: true, showNavigation: false },
      global: { stubs: { BaseIcon: true } }
    });
    wrappers.push(wrapper);
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '数学 (1)')
      .trigger('tap');
    expect(wrapper.text()).toContain('数学 · 原知识点');
    expect(wrapper.text()).toContain('求导数');
    expect(wrapper.text()).not.toContain('选搭配');
    expect(JSON.stringify(state)).toBe(before);
  });
  it('empty usage shows real local zeros and compact unknown cloud rows, without placeholder tables', async () => {
    setup();
    const wrapper = render(Usage);
    await flushPromises();
    expect(wrapper.text()).toContain('本机学习用量');
    expect(wrapper.text()).toContain('账户总额度未同步');
    expect(wrapper.text()).toContain('暂无第三方模型用量');
    expect(wrapper.text()).toContain('本机记录，不等于供应商账单');
    expect(wrapper.text()).not.toContain('—');
    expect(wrapper.find('[role="table"]').exists()).toBe(false);
    expect(museUsage(harness.store.state, now)).toMatchObject({
      submitted: 0,
      assessed: 0,
      awaitingAssessment: 0,
      weekSubmitted: 0,
      unconfirmed: 0
    });
  });
  it('partial receipts keep unknown tokens and costs pending, and local facts count failed and unresolved requests separately', async () => {
    const state = setup(),
      saved = coach();
    saved.days.push({
      day: '2026-10-21',
      answers: [{ id: 'b', cardId: 'q', at: now }],
      drafts: [{ id: 'draft', at: now, text: '段落' }],
      rewrites: [{ id: 'rewrite', at: now, text: '改写' }],
      feedback: { 'card-q': { id: 'feedback' } }
    });
    saved.requests.push(
      { id: 'r1', status: 'completed', outcome: 'failed', at: now },
      { id: 'r2', status: 'closed', outcome: 'failed', at: now },
      { id: 'r3', status: 'pending', at: now }
    );
    saved.library.push({ id: 'p', due: now - 1 });
    state.conversations.push({ id: 'c', goal: '英语', at: now, coach: saved });
    harness.store.usage = { calls: [{ source: 'byok', modelId: 'x', provider: 'DeepSeek', costStatus: 'pending' }] };
    const before = JSON.stringify(state),
      result = museUsage(state, now);
    expect(result).toMatchObject({
      submitted: 3,
      assessed: 1,
      awaitingAssessment: 2,
      due: 1,
      failed: 1,
      unconfirmed: 1,
      weekSubmitted: 3
    });
    expect(result.submissionDays.at(-1).count).toBe(3);
    expect(JSON.stringify(state)).toBe(before);
    const wrapper = render(Usage);
    await flushPromises();
    expect(wrapper.text()).toContain('1 成功 · 1 失败 · 1 待确认');
    expect(wrapper.text()).toContain('待确认');
    expect(wrapper.text()).toContain('待结算');
    expect(wrapper.findAll('[role="table"]')).toHaveLength(1);
  });
  it('full receipts display actual cloud quota and settled costs, then withdraw them on owner switch', async () => {
    setup();
    harness.store.usage = {
      entitlement: { weeklyUnits: 100, spent: 20, reserved: 4, week: '2026-W43' },
      calls: [
        {
          source: 'byok',
          provider: 'DeepSeek',
          modelId: 'x',
          usage: { prompt_tokens: 10, completion_tokens: 20 },
          costStatus: 'settled',
          actualCost: 0.002
        }
      ]
    };
    const wrapper = render(Usage);
    await flushPromises();
    expect(wrapper.text()).toContain('20 / 100');
    expect(wrapper.text()).toContain('30');
    expect(wrapper.text()).toContain('0.0020');
    harness.store.state = emptyLearningState('other');
    harness.store.usage = null;
    await nextTick();
    expect(wrapper.text()).not.toContain('0.0020');
    expect(wrapper.find('[role="table"]').exists()).toBe(false);
  });
  it('counts journaled normal chat requests without replaying removed conversations or treating transport errors as terminal', () => {
    const state = setup();
    state.conversations.push({ id: 'c', messages: [], at: now });
    state.events.push(
      { type: 'model.request', at: now, data: { requestId: 'normal', conversationId: 'c' } },
      { id: 'normal:error', data: { conversationId: 'c' } },
      { type: 'model.request', at: now, data: { requestId: 'deleted', conversationId: 'gone' } }
    );
    expect(museUsage(state, now)).toMatchObject({ total: 1, completed: 0, unconfirmed: 1, failed: 0 });
    state.events.push({ id: 'normal:reply', data: { conversationId: 'c' } });
    expect(museUsage(state, now)).toMatchObject({ completed: 1, unconfirmed: 0 });
  });
  it('filters only explicit test notices and leaves real reminder text and canonical history untouched', async () => {
    const state = setup();
    state.conversations.push({
      id: 'c',
      goal: '英语',
      at: now,
      messages: [
        { id: 'test', role: 'assistant', content: '测试通知已安排 · 5 秒后', at: now },
        { id: 'real', role: 'assistant', content: '今晚复习；资料含测试通知排查', at: now }
      ]
    });
    const before = JSON.stringify(state);
    expect(museHistory(state).map((item) => item.id)).toEqual(['real']);
    expect(museTestNotification({ type: 'reminder.test' })).toBe(true);
    expect(museTestNotification({ type: 'reminder.receipt', title: '今晚复习' })).toBe(false);
    const wrapper = render(Reminders);
    await flushPromises();
    expect(wrapper.text()).toContain('系统通知');
    expect(wrapper.text()).not.toContain('发送测试通知');
    expect(harness.controller.test).not.toHaveBeenCalled();
    expect(harness.controller.testDelivered).not.toHaveBeenCalled();
    expect(JSON.stringify(state)).toBe(before);
  });
});
