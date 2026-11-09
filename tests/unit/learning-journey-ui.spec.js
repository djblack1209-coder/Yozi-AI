import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';
vi.mock('@dcloudio/uni-app', () => ({ onShow: () => {}, onHide: () => {}, onLoad: () => {}, onBackPress: () => {} }));
import LearningJourney from '@/pages/learning/components/learning-journey.vue';
import LearningMessage from '@/pages/learning/components/learning-message.vue';
import LearningPage from '@/pages/learning/index.vue';
import LearningOverview from '@/components/business/learning/learning-overview.vue';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { learningWriteLease } from '@/services/learning/learning-write-lease.js';
import { setLanguage } from '@/i18n/index.js';
let wrapper;
beforeEach(() => {
  uni.clearStorageSync();
  // Exercise the explicitly collapsed device layout; S3 tests cover the open default.
  uni.setStorageSync('yozi_shell_sidebar_v1', { version: 1, collapsed: true, width: 217 });
  setActivePinia(createPinia());
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  for (const s of getActivePinia()?._s.values() || []) s.$dispose();
  learningWriteLease.release();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setLanguage('zh-CN');
  uni.clearStorageSync();
});
const stubs = {
  view: { template: '<div><slot /></div>' },
  text: { template: '<span><slot /></span>' },
  BaseIcon: true
};
describe('学习路线的明确操作与阅读', () => {
  it('停止后可只读展开待核对原答，聚焦阅读区且不写记录或放开巩固和提交', async () => {
    const s = useConversationLearningStore();
    s.start('分数练习');
    s.configureJourney(s.journeyContext(), {
      title: '分数练习',
      startDay: s.todaySummary.day,
      durationDays: 7,
      minutes: 30,
      mode: 'batch',
      moduleIds: ['fraction-add-subtract', 'fraction-multiply-divide']
    });
    const first = s.startTraining(s.journeyContext(), 'fraction-add-subtract', 1);
    s.submitTraining(s.journeyContext(), first.id, ['0.9']);
    const pending = s.startTraining(s.journeyContext(), 'fraction-multiply-divide', 1);
    s.submitTraining(s.journeyContext(), pending.id, ['还没有算出']);
    s.commit('task.stop', { conversationId: s.active.id });
    const before = s.exportData();
    wrapper = mount(LearningPage, {
      attachTo: document.body,
      global: { stubs: { ...stubs, PrivacyPopup: true, LearningLab: true } }
    });
    const button = (label) => wrapper.findAll('button').find((b) => b.text().trim() === label);
    await button('查看原答').trigger('tap');
    await flushPromises();
    const original = wrapper.get('#learning-review-original');
    expect(original.text()).toContain('计算 2/3 × 1/4。');
    expect(original.text()).toContain('原答：还没有算出');
    expect(original.text()).toContain('原答已保存，反馈待核对');
    expect(document.activeElement).toBe(original.element);
    expect(button('开始巩固检验').attributes('disabled')).toBeDefined();
    expect(button('完成本次复盘').attributes('disabled')).toBeDefined();
    expect(s.exportData()).toBe(before);
    await original.find('button').trigger('tap');
    await flushPromises();
    expect(wrapper.find('#learning-review-original').exists()).toBe(false);
    expect(document.activeElement).toBe(button('查看原答').element);
    expect(s.exportData()).toBe(before);
  });
  it('到期复测和独立巩固都把焦点交给当前题，停止阅读不恢复任务或改原答', async () => {
    const s = useConversationLearningStore();
    s.start('分数练习');
    s.configureJourney(s.journeyContext(), {
      title: '分数练习',
      startDay: s.todaySummary.day,
      durationDays: 7,
      minutes: 30,
      mode: 'batch',
      moduleIds: ['fraction-add-subtract']
    });
    const group = s.startTraining(s.journeyContext(), 'fraction-add-subtract', 1);
    s.submitTraining(s.journeyContext(), group.id, ['0.9']);
    const originals = JSON.stringify(s.state.attempts);
    s.commit('task.stop', { conversationId: s.active.id });
    wrapper = mount(LearningPage, {
      attachTo: document.body,
      global: { stubs: { ...stubs, PrivacyPopup: true, LearningLab: true } }
    });
    const button = (label) => wrapper.findAll('button').find((b) => b.text().trim() === label);
    await button('回到复测题').trigger('tap');
    await flushPromises();
    expect(document.activeElement).toBe(wrapper.get('#active-learning-question').element);
    expect(s.state.events.at(-1).data.kind).toBe('review');
    expect(s.active.stopped).toBe(true);
    expect(button('提交答案').attributes('disabled')).toBeDefined();
    expect(JSON.stringify(s.state.attempts)).toBe(originals);
    s.commit('task.resume', { conversationId: s.active.id, source: 'self_report' });
    await flushPromises();
    await button('开始巩固检验').trigger('tap');
    await flushPromises();
    expect(document.activeElement).toBe(wrapper.get('#active-learning-question').element);
    expect(s.activeQuestion.parentQuestionKey).toBe(group.questionKeys[0]);
    expect(JSON.stringify(s.state.attempts)).toBe(originals);
  });
  it('复盘后的无效题量就近显示错误，未来题组只读定位且不生成额外事实', async () => {
    const s = useConversationLearningStore();
    s.start('分数练习');
    s.configureJourney(s.journeyContext(), {
      title: '分数练习',
      startDay: s.todaySummary.day,
      durationDays: 7,
      minutes: 30,
      mode: 'batch',
      moduleIds: ['fraction-add-subtract']
    });
    const group = s.startTraining(s.journeyContext(), 'fraction-add-subtract', 1);
    s.submitTraining(s.journeyContext(), group.id, ['11/12']);
    s.confirmRecap(s.journeyContext());
    wrapper = mount(LearningPage, {
      attachTo: document.body,
      global: { stubs: { ...stubs, PrivacyPopup: true, LearningLab: true } }
    });
    const button = (label) => wrapper.findAll('button').find((b) => b.text().trim() === label);
    const input = wrapper.get('[aria-label="分数加减下一批题量"]');
    const before = s.exportData();
    await input.setValue('999');
    await button('安排明日训练').trigger('tap');
    await flushPromises();
    expect(document.activeElement).toBe(wrapper.get('#learning-review-feedback').element);
    expect(s.exportData()).toBe(before);
    await input.setValue('2');
    await button('安排明日训练').trigger('tap');
    await flushPromises();
    expect(wrapper.find('#learning-review-feedback').exists()).toBe(false);
    const planned = s.exportData();
    wrapper.unmount();
    wrapper = mount(LearningPage, {
      attachTo: document.body,
      global: { stubs: { ...stubs, PrivacyPopup: true, LearningLab: true } }
    });
    expect(wrapper.get('[aria-label="分数加减下一批题量"]').element.value).toBe('2');
    expect(wrapper.get('[aria-label="分数加减下一批题量"]').attributes('readonly')).toBeDefined();
    await button('查看题组').trigger('tap');
    await flushPromises();
    expect(document.activeElement).toBe(wrapper.get('#learning-training-panel').element);
    expect(wrapper.get('[data-test="training-submit"]').attributes('disabled')).toBeDefined();
    expect(s.exportData()).toBe(planned);
  });
  it('修改已保存路线失败时就近显示并聚焦原因，原路线保持，取消后可重新修正', async () => {
    const s = useConversationLearningStore();
    s.start('分数练习');
    s.configureJourney(s.journeyContext(), {
      title: '分数练习',
      startDay: s.todaySummary.day,
      durationDays: 30,
      minutes: 40,
      mode: 'batch',
      moduleIds: ['fraction-add-subtract']
    });
    const before = s.exportData();
    wrapper = mount(LearningJourney, { attachTo: document.body, global: { stubs } });
    const originalScroll = Element.prototype.scrollIntoView;
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    try {
      const button = (label) => wrapper.findAll('button').find((b) => b.text().trim() === label);
      await button('调整目标').trigger('tap');
      await wrapper.get('[aria-label="路线计划天数"]').setValue('400');
      await wrapper.get('[data-test="journey-save"]').trigger('tap');
      await flushPromises();
      const error = wrapper.get('#learning-journey-feedback');
      expect(error.text()).toContain('计划周期须为1至365天');
      expect(error.element.compareDocumentPosition(wrapper.get('.journey-route-heading').element) & 4).toBe(4);
      expect(document.activeElement).toBe(error.element);
      expect(scroll).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' });
      expect(s.exportData()).toBe(before);
      expect(wrapper.get('[aria-label="路线计划天数"]').element.value).toBe('400');
      await button('取消').trigger('tap');
      expect(wrapper.find('#learning-journey-feedback').exists()).toBe(false);
      expect(s.exportData()).toBe(before);
      await button('调整目标').trigger('tap');
      expect(wrapper.get('[aria-label="路线计划天数"]').element.value).toBe('30');
      await wrapper.get('[aria-label="路线计划天数"]').setValue('20');
      await wrapper.get('[data-test="journey-save"]').trigger('tap');
      await flushPromises();
      expect(s.active.journey.durationDays).toBe(20);
      expect(s.state.attempts).toHaveLength(0);
    } finally {
      Element.prototype.scrollIntoView = originalScroll;
    }
  });
  it('从其他页面定位长会话旧日时不被当前题分页覆盖，较早日期可达且不改记录', async () => {
    vi.stubGlobal('innerWidth', 390);
    const query = {
      select: () => query,
      boundingClientRect: () => query,
      selectViewport: () => query,
      scrollOffset: () => query,
      exec: (done) => done([{ top: 120 }, { scrollTop: 240 }])
    };
    vi.spyOn(uni, 'createSelectorQuery').mockReturnValue(query);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-02T10:00:00Z'));
    const s = useConversationLearningStore();
    s.commit('timezone.set', { timezone: 'Asia/Shanghai' });
    s.start('九日连续目标');
    const id = s.active.id;
    s.configureJourney(s.journeyContext(), {
      title: '九日连续目标',
      startDay: '2026-10-02',
      durationDays: 14,
      minutes: 30,
      mode: 'batch',
      moduleIds: ['arithmetic-add']
    });
    let firstGroup;
    for (let day = 2; day <= 10; day++) {
      vi.setSystemTime(new Date(`2026-10-${String(day).padStart(2, '0')}T10:00:00Z`));
      s.refresh();
      const group = s.startTraining(s.journeyContext(), 'arithmetic-add', 1);
      firstGroup ||= group;
      for (let message = 0; message < 8; message++)
        s.commit('message.add', {
          conversationId: id,
          role: message % 2 ? 'assistant' : 'user',
          content: `第${day}日讨论-${message}`
        });
    }
    s.commit('task.stop', { conversationId: id });
    s.start('另一目标');
    s.locateConversation(id, '2026-10-02', firstGroup.id);
    const before = s.exportData();
    wrapper = mount(LearningPage, { global: { stubs: { ...stubs, PrivacyPopup: true, LearningLab: true } } });
    await flushPromises();
    expect(wrapper.findAll('.message .base-bubble__content').some((m) => m.text() === '第2日讨论-0')).toBe(true);
    expect(wrapper.findAll('.message').length).toBeLessThanOrEqual(50);
    await wrapper.get('.directory-pill').trigger('tap');
    await flushPromises();
    expect(wrapper.findAll('.directory-day-link').map((e) => e.attributes('aria-label'))).not.toContain(
      '查看原对话 · 2026-10-02'
    );
    await wrapper.find('[data-test="earlier-learning-days"]').trigger('tap');
    expect(wrapper.findAll('.directory-day-link').map((e) => e.attributes('aria-label'))).toContain(
      '查看原对话 · 2026-10-02'
    );
    expect(wrapper.findAll('.directory-day-link').every((e) => !/\d/.test(e.text()))).toBe(true);
    expect(s.active.id).toBe(id);
    expect(s.active.stopped).toBe(true);
    expect(s.active.messages).toHaveLength(72);
    expect(s.exportData()).toBe(before);
  });
  it('模块目录定位同一完整会话，日进度在对话内，导航/展开不改原答或停止状态', async () => {
    vi.stubGlobal('innerWidth', 390);
    const query = {
      select: () => query,
      boundingClientRect: () => query,
      selectViewport: () => query,
      scrollOffset: () => query,
      exec: (done) => done([{ top: 120 }, { scrollTop: 240 }])
    };
    const nativeQuery = vi.spyOn(uni, 'createSelectorQuery').mockReturnValue(query);
    const nativeScroll = vi.spyOn(uni, 'pageScrollTo');
    const s = useConversationLearningStore();
    s.start('运算与写作的连续目标');
    const id = s.active.id;
    s.configureJourney(s.journeyContext(), {
      title: '连续目标',
      startDay: s.todaySummary.day,
      durationDays: 7,
      minutes: 30,
      mode: 'batch',
      moduleIds: ['arithmetic-add', 'writing-notice']
    });
    const math = s.startTraining(s.journeyContext(), 'arithmetic-add', 1);
    s.commit('message.add', { conversationId: id, role: 'user', content: '完整数学讨论' });
    const writing = s.startTraining(s.journeyContext(), 'writing-notice', 1);
    s.commit('message.add', { conversationId: id, role: 'assistant', content: '完整写作讨论' });
    s.commit('task.stop', { conversationId: id });
    const before = s.exportData();
    wrapper = mount(LearningPage, { global: { stubs: { ...stubs, PrivacyPopup: true, LearningLab: true } } });
    await wrapper.get('.directory-pill').trigger('tap');
    await flushPromises();
    const directory = wrapper.findAll('.directory-module').find((b) => b.text() === '整数加法');
    await directory.trigger('tap');
    await flushPromises();
    expect(s.active.id).toBe(id);
    expect(s.trainingGroup.id).toBe(math.id);
    expect(nativeScroll).toHaveBeenCalledWith({ scrollTop: 360, duration: 0 });
    expect(wrapper.findAll('.message')).toHaveLength(2);
    expect(wrapper.find('.conversation-area .learning-overview').exists()).toBe(true);
    expect(wrapper.find('.session-progress').exists()).toBe(false);
    expect(wrapper.find('.library-heading').exists()).toBe(false);
    expect(wrapper.findAll('.message-role')).toHaveLength(0);
    await wrapper.find('.conversation-area .learning-summary').trigger('tap');
    await flushPromises();
    s.locateConversation(id, s.journey.day, writing.id);
    expect(s.active.stopped).toBe(true);
    expect(s.exportData()).toBe(before);
    await flushPromises();
    nativeQuery.mockRestore();
    nativeScroll.mockRestore();
  });

  it('嵌入日进度只统计该目标，待核对原答不混进可靠正确数，空样本不生成百分比', async () => {
    const s = useConversationLearningStore();
    s.start('12 + 8');
    s.submit('20', true);
    const mathId = s.active.id;
    const mathPlan = JSON.parse(JSON.stringify(s.currentPlan));
    s.start('英文说明写作');
    s.submit('An original pending explanation.', true);
    const writingId = s.active.id;
    expect(s.currentPlan.conversationId).toBe(writingId);
    expect(s.currentPlan.tasks).toHaveLength(1);
    expect(s.state.plans.find((plan) => plan.id === mathPlan.id)).toEqual(mathPlan);
    expect(s.scopedSummary('day', mathId).tasks).toMatchObject({ numerator: 1, denominator: 1 });
    const before = s.exportData();
    s.locateConversation(mathId);
    expect(s.scopedSummary('day', mathId).tasks.planId).toBe(mathPlan.id);
    s.locateConversation(writingId);
    wrapper = mount(LearningOverview, {
      props: { inline: true, conversationId: s.active.id, showNavigation: false },
      global: { stubs }
    });
    expect(wrapper.findAll('.summary-count').map((e) => e.text())).toEqual(['1', '0', '1']);
    expect(wrapper.findAll('.base-stat').map((stat) => stat.text())).toEqual([
      '已完成任务1/ 1',
      '可靠作答0 次',
      '待核对1 次'
    ]);
    expect(wrapper.text()).not.toContain('%');
    expect(wrapper.find('[aria-label="学习统计范围"]').exists()).toBe(false);
    expect(wrapper.find('.answer-distribution').attributes('aria-label')).toContain('待核对1次');
    await wrapper.find('.learning-summary').trigger('tap');
    expect(s.exportData()).toBe(before);
  });
  it('聊天建题只沿用当前目标的计划，同一目标换题保留已有任务', async () => {
    const s = useConversationLearningStore();
    s.start('12 + 8');
    s.submit('20', true);
    const mathPlan = JSON.parse(JSON.stringify(s.currentPlan));
    s.start('自选目标');
    const conversationId = s.active.id;
    await s.send('题目：2x+3=9', { chatEntry: true, id: 'plan-isolation-first' });
    const firstKey = s.active.activeQuestionKey;
    expect(s.currentPlan.conversationId).toBe(conversationId);
    expect(s.currentPlan.tasks.map((task) => task.questionKey)).toEqual([firstKey]);
    await s.send('题目：-2x+6>0', { chatEntry: true, id: 'plan-isolation-second' });
    expect(s.currentPlan.tasks.map((task) => task.questionKey)).toEqual([firstKey, s.active.activeQuestionKey]);
    expect(s.state.plans.find((plan) => plan.id === mathPlan.id)).toEqual(mathPlan);
  });
  it('选择节奏和模块仅改变草稿，明确保存后显示目标且可完成一次整批交卷', async () => {
    const s = useConversationLearningStore();
    s.start('自主学习');
    wrapper = mount(LearningJourney, { global: { stubs } });
    const before = s.exportData();
    await wrapper.find('button').trigger('tap');
    await wrapper.find('[aria-label="路线学习目标"]').setValue('清晰的运算目标');
    await wrapper.find('[aria-label="训练节奏"] button[aria-pressed="false"]').trigger('tap');
    expect(s.exportData()).toBe(before);
    // 重新明确选择整批训练。
    await wrapper
      .findAll('[aria-label="训练节奏"] button')
      .find((b) => b.text() === '整批训练')
      .trigger('tap');
    await wrapper
      .findAll('.journey-module-options button')
      .find((b) => b.text().includes('整数加法'))
      .trigger('tap');
    await wrapper.find('[data-test="journey-save"]').trigger('tap');
    await flushPromises();
    expect(wrapper.text()).toContain('清晰的运算目标');
    expect(s.active.journey.mode).toBe('batch');
    const size = wrapper.findAll('[aria-label="每组题量"] button').find((b) => b.text() === '2题');
    await size.trigger('tap');
    await wrapper.find('[data-test="journey-module-arithmetic-add"]').trigger('tap');
    await flushPromises();
    const selected = s.exportData();
    await wrapper.find('[aria-label="训练第1题作答"]').setValue('12');
    await wrapper.find('[aria-label="训练第2题作答"]').setValue('16');
    expect(s.exportData()).toBe(selected);
    await wrapper.find('[data-test="training-submit"]').trigger('tap');
    await flushPromises();
    expect(s.state.attempts.map((a) => a.answer)).toEqual(['12', '16']);
    expect(wrapper.text()).toContain('整批原答已保存');
    expect(wrapper.findAll('[data-test="training-submit"]')).toHaveLength(0);
  });

  it('英文整数与分数入口只改草稿，统一交卷按精确数值保存，原题不翻译', async () => {
    const s = useConversationLearningStore();
    s.start('Arithmetic goal');
    setLanguage('en');
    wrapper = mount(LearningJourney, { global: { stubs } });
    const before = s.exportData();
    await wrapper.find('button').trigger('tap');
    const chips = wrapper.findAll('.journey-module-options button');
    for (const label of [
      'Integer subtraction',
      'Integer division',
      'Fraction addition and subtraction',
      'Fraction multiplication and division'
    ])
      await chips.find((b) => b.text().includes(label)).trigger('tap');
    expect(s.exportData()).toBe(before);
    await wrapper.find('[data-test="journey-save"]').trigger('tap');
    await flushPromises();
    expect(s.active.journey.moduleIds).toEqual([
      'arithmetic-subtract',
      'arithmetic-divide',
      'fraction-add-subtract',
      'fraction-multiply-divide'
    ]);
    await wrapper
      .findAll('[aria-label="Batch size"] button')
      .find((b) => b.text() === '1 questions')
      .trigger('tap');
    for (const [moduleId, question, answer] of [
      ['arithmetic-subtract', '计算 7 − 5。', '2'],
      ['arithmetic-divide', '计算 7 ÷ 5。', '1.4'],
      ['fraction-add-subtract', '计算 2/3 + 1/4。', '22/24'],
      ['fraction-multiply-divide', '计算 2/3 × 1/4。', '1/6']
    ]) {
      await wrapper.find(`[data-test="journey-module-${moduleId}"]`).trigger('tap');
      await flushPromises();
      expect(wrapper.text()).toContain(question);
      const draft = s.exportData();
      await wrapper.find('[aria-label="Training question 1 answer"]').setValue(answer);
      expect(s.exportData()).toBe(draft);
      await wrapper.find('[data-test="training-submit"]').trigger('tap');
      await flushPromises();
      expect(s.state.attempts.at(-1)).toMatchObject({ answer, grade: { outcome: 'correct', status: 'reliable' } });
    }
  });

  it('英文物理路线入口只改草稿，保存后可打开速度图题组且题面不被翻译', async () => {
    const s = useConversationLearningStore();
    s.start('Original physics goal');
    setLanguage('en');
    wrapper = mount(LearningJourney, { global: { stubs } });
    const before = s.exportData();
    await wrapper.find('button').trigger('tap');
    const chips = wrapper.findAll('.journey-module-options button');
    expect(chips).toHaveLength(23);
    for (const label of [
      'Constant net force',
      'Initial velocity and motion in stages',
      'Velocity–time graph',
      'Work and kinetic energy',
      'Density and units',
      'Pressure and units'
    ]) {
      expect(chips.some((b) => b.text().includes(label))).toBe(true);
    }
    await chips.find((b) => b.text().includes('Velocity–time graph')).trigger('tap');
    expect(s.exportData()).toBe(before);
    await wrapper.find('[data-test="journey-save"]').trigger('tap');
    await flushPromises();
    expect(s.active.journey.moduleIds).toEqual(['science-velocity-graph']);
    await wrapper.find('[data-test="journey-module-science-velocity-graph"]').trigger('tap');
    await flushPromises();
    expect(s.state.attempts).toHaveLength(0);
    expect(s.state.questions[0].prompt).toContain('规定向右为正');
    expect(wrapper.text()).toContain(s.state.questions[0].prompt);
  });

  it('教学标题、要点和对照表可扫读，模型HTML和脚本仍作为普通文字', () => {
    wrapper = mount(LearningMessage, {
      props: {
        content:
          '## 本次结果\n\n- **先求一份**\n- 再求总数\n\n| 原答 | 参考 |\n| --- | --- |\n| 48 | 42 |\n\n<script>globalThis.__unsafe = true</script>'
      },
      global: { stubs }
    });
    expect(wrapper.find('[role="heading"]').text()).toBe('本次结果');
    expect(wrapper.find('[role="table"]').text()).toContain('48');
    expect(wrapper.find('script').exists()).toBe(false);
    expect(wrapper.text()).toContain('<script>globalThis.__unsafe = true</script>');
    expect(globalThis.__unsafe).toBeUndefined();
  });
});
