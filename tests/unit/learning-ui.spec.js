import { observeLearningDialogs } from '../setup.js';

function matchesLearningControl(button, label) {
  const expected = label === '提交作答' ? '提交答案' : label;
  if (button.text().trim() === expected || button.attributes('aria-label') === expected) return true;
  const key = button.find('.base-option__key');
  const text = button.find('.base-option__label');
  return key.exists() && text.exists() && `${key.text().trim()}. ${text.text().trim()}` === expected;
}
async function openSettingsSection(wrapper, label) {
  await wrapper
    .findAll('.settings-nav')
    .find((button) => button.text().trim() === label)
    .trigger('tap');
  await flushPromises();
}
async function openLearningSettings(wrapper) {
  const control = wrapper.find('.connection-pill');
  if (control.attributes('aria-expanded') !== 'true') {
    await control.trigger('tap');
    await flushPromises();
  }
}
import CustomModal from '@/components/common/CustomModal.vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import LearningLanding from '@/components/business/learning/learning-landing.vue';
import LearningShell from '@/components/business/learning/learning-shell.vue';
import LearningOverview from '@/components/business/learning/learning-overview.vue';
import HomePage from '@/pages/index/index.vue';
import SplashPage from '@/pages/splash/index.vue';
import LearningPage from '@/pages/learning/index.vue';
import ProfilePage from '@/pages/profile/index.vue';
import StudyDetailPage from '@/pages/study-detail/index.vue';
import OnboardingPage from '@/pages/login/onboarding.vue';
import LoginPage from '@/pages/login/index.vue';
import { useAuthStore } from '@/stores/modules/auth.js';
import { useThemeStore } from '@/stores/modules/theme.js';
import { useStudyStore } from '@/stores/modules/study.js';
import { storageService } from '@/services/storageService.js';
import { BRAND, DEFAULT_AVATAR } from '@/config/brand.js';
import { useUserStore } from '@/stores/modules/user.js';
import App from '@/App.vue';
import { applyTheme } from '@/design/theme-runtime.js';
vi.mock('wot-design-uni/components/wd-root-portal/wd-root-portal.vue', () => ({
  default: { name: 'WdRootPortal', template: '<div><slot /></div>' }
}));
const loadHooks = vi.hoisted(() => ({ callbacks: [], showCallbacks: [], backCallbacks: [], hideCallbacks: [] }));
vi.mock('@dcloudio/uni-app', () => ({
  onLoad: (callback) => loadHooks.callbacks.push(callback),
  onShow: (callback) => loadHooks.showCallbacks.push(callback),
  onUnload: () => {},
  onHide: (callback) => loadHooks.hideCallbacks.push(callback),
  onBackPress: (callback) => loadHooks.backCallbacks.push(callback)
}));
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { learningRepository } from '@/services/learning/learning-repository.js';
import * as desktopLearningFiles from '@/services/desktop/learning-files.js';
import { setLanguage, t } from '@/i18n/index.js';
import { learningText } from '@/i18n/learning.js';
import {
  emptyLearningState,
  applyLearningOperation,
  normalizePrivateSyncOperation
} from '@/services/learning/learning-domain.js';
it.each(['英文通知写作', '英文说明写作', '中文叙事写作', '英文论证写作', '英文学术讨论', '英文邮件写作'])(
  '写作换题按钮实际创建独立题、撤下帮助并保留原答和停止边界：%s',
  async (goal) => {
    const store = useConversationLearningStore();
    store.start(goal);
    const originalKey = store.active.activeQuestionKey;
    if (goal === '中文叙事写作') {
      store.readWritingReference(store.writingContext(), 'wikisource-chengtian-full-zh-v1', 1);
      store.readWritingReference(store.writingContext(), 'wikisource-xiaoshitan-full-zh-v1', 1);
    } else store.recordWritingHelp(store.writingContext(), '本题表达提示');
    store.submit('合成原答，语义待核对。  Keep original spacing.', true, 'before-variant');
    const originalAttempts = JSON.parse(JSON.stringify(store.state.attempts));
    const wrapper = mount(LearningPage, { global: { stubs: { ...stubs, PrivacyPopup: true, CustomTabbar: true } } });
    try {
      const control = () =>
        wrapper
          .find('[aria-label="写作操作"]')
          .findAll('button')
          .find((b) => b.text() === '换题练习');
      await control().trigger('tap');
      await flushPromises();
      expect(store.active.activeQuestionKey).not.toBe(originalKey);
      expect(store.activeQuestion.parentQuestionKey).toBe(originalKey);
      expect(store.activeQuestion.writingExercise.phase).toBe('independent');
      expect(store.active.pendingHints).toEqual([]);
      expect(store.state.attempts).toEqual(originalAttempts);
      expect(store.state.executions).toEqual([]);
      store.submit('独立新原答，语义待核对。', true, 'after-variant');
      expect(store.state.attempts.at(-1).hints).toEqual([]);
      store.commit('task.stop', { conversationId: store.active.id });
      await flushPromises();
      expect(control().attributes('disabled')).toBeDefined();
      const stopped = store.exportData();
      await control().trigger('tap');
      await flushPromises();
      expect(store.exportData()).toBe(stopped);
    } finally {
      wrapper.unmount();
    }
  }
);
it.each([
  ['英文论证写作', '英文论证作答', 8000],
  ['英文学术讨论', '英文讨论作答', 4000],
  ['英文邮件写作', '英文邮件作答', 4000]
])('%s页面与后端共用上限，长原答明确提交保存，超界保留输入', async (goal, label, limit) => {
  const store = useConversationLearningStore();
  store.start(goal);
  const wrapper = mount(LearningPage, { global: { stubs: { ...stubs, PrivacyPopup: true, CustomTabbar: true } } });
  try {
    const input = wrapper.find(`textarea[aria-label="${label}"]`);
    expect(input.attributes('maxlength')).toBe(String(limit));
    const raw = 'A clear independent explanation.  Another point.\n\n'.repeat(40);
    expect(raw.length).toBeGreaterThan(1000);
    await input.setValue(raw);
    const submit = wrapper.findAll('button').find((b) => matchesLearningControl(b, '提交作答'));
    await submit.trigger('tap');
    await flushPromises();
    expect(store.state.attempts.at(-1)).toMatchObject({ answer: raw, grade: { status: 'pending' } });
    expect(input.element.value).toBe('');
    const before = store.exportData(),
      tooLong = 'A'.repeat(limit + 1);
    await input.setValue(tooLong);
    await submit.trigger('tap');
    await flushPromises();
    expect(store.exportData()).toBe(before);
    expect(input.element.value).toBe(tooLong);
  } finally {
    wrapper.unmount();
  }
});
it('自由写句明确提交后才显示反馈入口，点击不重复原答，停止后禁用', async () => {
  const store = useConversationLearningStore();
  store.start('英文说明写作');
  const q = store.openVocabulary(store.writingContext(), 'recycle');
  const key = `${q.id}@${q.version}`;
  store.submitVocabulary(store.writingContext(), key, q.validation.answer);
  store.startVocabularyTask(store.writingContext(), key, 'usage');
  const wrapper = mount(LearningPage, { global: { stubs: { ...stubs, PrivacyPopup: true, CustomTabbar: true } } });
  try {
    expect(wrapper.find('[aria-label="词语使用反馈"]').exists()).toBe(false);
    store.submit('We recycle glass into jars.', true);
    await flushPromises();
    const before = store.exportData();
    const feedback = vi.spyOn(store, 'requestVocabularyFeedback').mockResolvedValue(undefined);
    const control = wrapper.find('[aria-label="词语使用反馈"] button');
    expect(control.text()).toBe('获取反馈');
    expect(wrapper.findAll('button').some((b) => b.text() === '评分维度')).toBe(false);
    await control.trigger('tap');
    expect(feedback).toHaveBeenCalledTimes(1);
    expect(store.exportData()).toBe(before);
    store.commit('task.stop', { conversationId: store.selectedConversationId });
    await flushPromises();
    expect(control.attributes('disabled')).toBeDefined();
  } finally {
    wrapper.unmount();
  }
});
it('统计用原题文字代替内部标识，同题干的不同题目保持分组，明确知识点和时区原值保留', () => {
  const store = useConversationLearningStore();
  store.refresh();
  store.start('合成统计阅读');
  store.commit('timezone.set', { timezone: 'America/Los_Angeles' });
  for (const [id, knowledgePoint] of [
    ['hidden-learning-a', undefined],
    ['hidden-learning-b', undefined],
    ['hidden-learning-c', '整数加法']
  ]) {
    const result = store.commit('question.add', {
      question: {
        id,
        version: 1,
        scope: 'generated',
        subject: '数学',
        knowledgePoint,
        prompt: '计算 12 + 8。',
        answerType: 'number',
        source: { kind: 'executable' },
        validation: { type: 'number', answer: '20', authority: 'executable', evidenceId: 'integer-arithmetic-v1' }
      }
    });
    store.focus(result.questionKey);
    store.submit('20', true);
  }
  const before = store.exportData();
  const wrapper = mount(LearningOverview, {
    props: { view: 'study-detail', initialExpanded: true },
    global: { stubs }
  });
  try {
    const rows = wrapper.findAll('.knowledge-row');
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.text().includes('计算 12 + 8。'))).toHaveLength(2);
    expect(wrapper.text()).not.toContain('hidden-learning-');
    expect(wrapper.text()).toContain('数学 / 整数加法');
    expect(wrapper.text()).toContain('洛杉矶');
    expect(store.state.timezone).toBe('America/Los_Angeles');
    expect(store.exportData()).toBe(before);
  } finally {
    wrapper.unmount();
  }
});

const stubs = {
  view: { template: '<div><slot /></div>' },
  text: { template: '<span><slot /></span>' },
  BaseIcon: true,
  LearningOverview: true
};
it.each(['writing', 'science', 'vocabulary'])(
  '%s页面停留跨日无需改草稿便更新提交门禁；隐藏/返回不写事实',
  async (kind) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T06:59:59.500Z'));
    const visible = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const store = useConversationLearningStore();
    store.start(kind === 'science' ? '学习物理' : kind === 'vocabulary' ? '英文说明写作' : '中文叙事写作');
    store.commit('timezone.set', { timezone: 'America/Los_Angeles' });
    let target;
    if (kind === 'writing') {
      store.submit('合成原答。', true);
      target = store.scheduleWritingRetest();
    } else if (kind === 'science') {
      store.startScience(store.writingContext(), {
        template: 'distance_displacement',
        outward: 6,
        backward: 4,
        direction: 'right'
      });
      store.submit(store.activeQuestion.validation.answer, true);
      target = store.scheduleScienceRetest();
    } else {
      const original = store.openVocabulary(store.writingContext(), 'recycle');
      const key = `${original.id}@${original.version}`;
      store.submitVocabulary(store.writingContext(), key, original.validation.answer);
      target = store.startVocabularyTask(store.writingContext(), key, 'retest');
    }
    store.focus(target.questionKey);
    const overview = mount(LearningOverview, { props: { view: 'plan', initialExpanded: true }, global: { stubs } });
    const wrapper = mount(LearningPage, { global: { stubs: { ...stubs, LearningLab: true } } });
    const submit = () => wrapper.findAll('button').find((button) => matchesLearningControl(button, '提交作答'));
    try {
      if (kind === 'writing') await wrapper.find('textarea[aria-label="中文叙事作答"]').setValue('合成待提交草稿。');
      else
        await wrapper
          .findAll('button')
          .find((button) => matchesLearningControl(button, store.activeQuestion.options[0]))
          .trigger('tap');
      const saved = store.exportData();
      expect(submit().attributes('disabled')).toBeDefined();
      vi.advanceTimersByTime(500);
      await flushPromises();
      expect(submit().attributes('disabled')).toBeUndefined();
      expect(store.summary.day).toBe('2026-10-07');
      expect(store.exportData()).toBe(saved);
      for (const callback of loadHooks.hideCallbacks) callback();
      vi.setSystemTime(new Date('2026-10-07T06:59:59.000Z'));
      for (const callback of loadHooks.showCallbacks) callback();
      await flushPromises();
      expect(submit().attributes('disabled')).toBeDefined();
      const beforeLeave = JSON.parse(saved),
        afterLeave = JSON.parse(store.exportData());
      const { events: oldEvents, revision: oldRevision, ...oldFacts } = beforeLeave;
      const { events: newEvents, revision: newRevision, ...newFacts } = afterLeave;
      expect(newFacts).toEqual(oldFacts);
      expect(newRevision).toBe(oldRevision + 1);
      expect(newEvents.slice(0, oldEvents.length)).toEqual(oldEvents);
      expect(newEvents.slice(oldEvents.length)).toEqual([
        expect.objectContaining({
          type: 'learning.leave',
          data: {
            owner: store.state.owner,
            source: 'conversation',
            conversationId: store.active.id,
            questionKey: target.questionKey,
            reason: null
          }
        })
      ]);
    } finally {
      wrapper.unmount();
      overview.unmount();
      store.$dispose();
      visible.mockRestore();
      vi.useRealTimers();
    }
  }
);
it('句子未来计划可返回原题，提前查看不新增作答或恢复停止', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse('2026-10-06T09:00:00Z'));
  const store = useConversationLearningStore();
  store.start('英文句子组织');
  store.submitSentence(store.writingContext(), ['t1', 't2', 't3']);
  const target = store.scheduleSentenceRetest(store.writingContext());
  const beforeAttempts = store.state.attempts.length;
  const plan = mount(LearningOverview, { props: { view: 'plan', initialExpanded: true }, global: { stubs } });
  try {
    expect(plan.text()).toContain('句子复测 · 10/07');
    await plan
      .findAll('button')
      .find((b) => b.text().trim() === '回到复测题')
      .trigger('tap');
    expect(store.active.activeQuestionKey).toBe(target.questionKey);
    expect(store.sentenceCanSubmit()).toBe(false);
    expect(store.state.attempts).toHaveLength(beforeAttempts);
    store.commit('task.stop', { conversationId: store.active.id });
    await plan
      .findAll('button')
      .find((b) => b.text().trim() === '回到复测题')
      .trigger('tap');
    expect(store.active.stopped).toBe(true);
    expect(store.state.attempts).toHaveLength(beforeAttempts);
  } finally {
    plan.unmount();
    store.$dispose();
    vi.useRealTimers();
  }
});
it('词义未来题选择只填草稿，到期后实际提交保存review；自由写句保持待核对', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse('2026-10-06T09:00:00Z'));
  const store = useConversationLearningStore();
  store.start('英文说明写作');
  const origin = store.openVocabulary(store.writingContext(), 'recycle');
  const key = `${origin.id}@${origin.version}`;
  store.submitVocabulary(store.writingContext(), key, origin.validation.answer);
  const writing = store.active.activeQuestionKey;
  const target = store.startVocabularyTask(store.writingContext(), key, 'retest');
  const plan = mount(LearningOverview, { props: { view: 'plan', initialExpanded: true }, global: { stubs } });
  const beforeOpen = store.state.attempts.length;
  expect(plan.text()).toContain('词义复测 · 10/07');
  await plan
    .findAll('button')
    .find((b) => b.text().trim() === '回到复测题')
    .trigger('tap');
  expect(store.active.activeQuestionKey).toBe(target.questionKey);
  expect(store.state.attempts).toHaveLength(beforeOpen);
  plan.unmount();
  const wrapper = mount(LearningPage, { global: { stubs: { ...stubs, LearningLab: true } } });
  const button = (label) => wrapper.findAll('button').find((b) => matchesLearningControl(b, label));
  try {
    const q = store.activeQuestion;
    expect(button('变式练习')).toBeUndefined();
    expect(button('校对题目')).toBeUndefined();
    await button(q.options['ABCD'.indexOf(q.validation.answer)]).trigger('tap');
    expect(button('提交作答').attributes('disabled')).toBeDefined();
    expect(store.state.attempts).toHaveLength(1);
    vi.setSystemTime(Date.parse('2026-10-07T09:00:00Z'));
    await button(q.options[('ABCD'.indexOf(q.validation.answer) + 1) % 4]).trigger('tap');
    await button(q.options['ABCD'.indexOf(q.validation.answer)]).trigger('tap');
    expect(button('提交作答').attributes('disabled')).toBeUndefined();
    await button('提交作答').trigger('tap');
    await flushPromises();
    expect(store.state.attempts.at(-1)).toMatchObject({
      kind: 'review',
      grade: { status: 'reliable', outcome: 'correct' }
    });
    store.focus(writing);
    store.startVocabularyTask(store.writingContext(), key, 'usage');
    await flushPromises();
    const input = wrapper.find('textarea[aria-label="消息或作答"]');
    expect(input.element.value).toBe('');
    expect(input.attributes('maxlength')).toBe('1000');
    await input.setValue('I recycle my homework to the teacher.');
    expect(store.state.attempts).toHaveLength(2);
    await button('提交作答').trigger('tap');
    await flushPromises();
    expect(store.state.attempts.at(-1).grade.status).toBe('pending');
    expect(store.state.reviews).toEqual([]);
  } finally {
    wrapper.unmount();
    vi.useRealTimers();
  }
});
describe('选择项与明确保存', () => {
  function page(attachTo) {
    const store = useConversationLearningStore();
    const wrapper = mount(LearningPage, {
      attachTo,
      global: {
        stubs: {
          ...stubs,
          LearningShell: { template: '<div><slot /><slot name="controls" /><slot name="composer" /></div>' },
          LearningLab: true,
          NumberLine: true
        }
      }
    });
    const button = (label, root = wrapper) =>
      root.findAll('button').find((item) => matchesLearningControl(item, label));
    return { store, wrapper, button };
  }
  function choice(store, id = 'choice-ui', options = ['A. 向右', 'B. 向左', 'C. 不变']) {
    const result = store.commit('question.add', {
      question: {
        id,
        version: 1,
        scope: 'private',
        prompt: '合成方向选择题',
        subject: '物理',
        knowledgePoint: '方向',
        answerType: 'choice',
        options,
        uncertainties: []
      }
    });
    store.focus(result.questionKey);
    return result;
  }
  it('默认聊天不先选学段教材，输入只改草稿，发送后只澄清必要知识点', async () => {
    const p = page();
    try {
      const before = p.store.exportData();
      expect(p.wrapper.findAll('#learning-composer')).toHaveLength(1);
      expect(p.wrapper.find('[data-test="task-track-junior"]').exists()).toBe(false);
      expect(p.wrapper.find('.goal-panel').exists()).toBe(false);
      expect(p.wrapper.find('.today-layout').exists()).toBe(false);
      await p.wrapper.get('#learning-composer textarea').setValue('我想复习初二数学，先测测我的薄弱点');
      expect(p.store.exportData()).toBe(before);
      await p.button('发送').trigger('tap');
      await flushPromises();
      expect(p.store.active.task).toBeUndefined();
      expect(p.store.active.messages.at(-1).content).toContain('想先练哪个知识点');
      expect(p.store.state.attempts).toHaveLength(0);
    } finally {
      p.wrapper.unmount();
    }
  });
  it.each([
    ['我想复习初二语文', []],
    ['我想复习初二', []],
    ['我想复习高中历史', []],
    ['I want to study history', []],
    ['Explain the aftermath', []],
    ['我想复习初二数学', ['方程', '一次不等式']],
    ['I want to review mathematics', ['方程', '一次不等式']],
    ['我想复习初中物理', ['密度']],
    ['我想练习英语写作', ['英文邮件写作', '英文句子组织']]
  ])('科目建议依据明确目标%s，未知或非数学目标不默认展示数学，保留自由输入', async (goal, topics) => {
    const p = page();
    try {
      await p.wrapper.get('.composer textarea').setValue(goal);
      await p.button('发送').trigger('tap');
      await flushPromises();
      const suggestions = p.wrapper.find('.chat-topics');
      expect(suggestions.exists() ? suggestions.findAll('button').map((button) => button.text().trim()) : []).toEqual(
        topics
      );
      expect(suggestions.exists()).toBe(topics.length > 0);
      expect(p.wrapper.get('.composer textarea').attributes('disabled')).toBeUndefined();
      expect(p.store.active.goal).toBe(goal);
      expect(p.store.state.questions).toHaveLength(0);
      expect(p.store.state.attempts).toHaveLength(0);
    } finally {
      p.wrapper.unmount();
    }
  });
  it('科目澄清后依据本次用户消息接续数学建议，保留首条学段目标和原会话', async () => {
    const p = page();
    try {
      const input = () => p.wrapper.get('.composer textarea');
      await input().setValue('我想复习初二');
      await p.button('发送').trigger('tap');
      await flushPromises();
      const id = p.store.active.id;
      expect(p.wrapper.find('.chat-topics').exists()).toBe(false);
      await input().setValue('数学');
      await p.button('发送').trigger('tap');
      await flushPromises();
      expect(p.store.active.id).toBe(id);
      expect(p.store.active.goal).toBe('我想复习初二');
      expect(
        p.wrapper
          .get('.chat-topics')
          .findAll('button')
          .map((button) => button.text().trim())
      ).toEqual(['方程', '一次不等式']);
      expect(p.store.state.questions).toHaveLength(0);
      await input().setValue('改学历史');
      await p.button('发送').trigger('tap');
      await flushPromises();
      expect(p.wrapper.find('.chat-topics').exists()).toBe(false);
      await input().setValue('数学');
      await p.button('发送').trigger('tap');
      await flushPromises();
      expect(p.store.active.goal).toBe('我想复习初二');
      const before = p.store.exportData();
      await p.button('一次不等式').trigger('tap');
      expect(p.store.exportData()).toBe(before);
      await p.button('发送').trigger('tap');
      await flushPromises();
      expect(p.store.active.id).toBe(id);
      expect(p.store.active.goal).toBe('我想复习初二');
      expect(p.store.activeQuestion.algebra.contract).toBe('safe-named-linear-inequality-v1');
      expect(p.store.state.attempts).toHaveLength(0);
    } finally {
      p.wrapper.unmount();
    }
  });
  it('英语写作目标提供邮件建议，选择只改草稿，明确提交才保存待核对原稿', async () => {
    const p = page();
    try {
      const input = () => p.wrapper.get('.composer textarea');
      await input().setValue('我想练习英语写作');
      await p.button('发送').trigger('tap');
      await flushPromises();
      const conversationId = p.store.active.id;
      const before = p.store.exportData();
      expect(
        p.wrapper
          .get('.chat-topics')
          .findAll('button')
          .map((button) => button.text().trim())
      ).toEqual(['英文邮件写作', '英文句子组织']);
      await p.button('英文邮件写作').trigger('tap');
      expect(p.store.exportData()).toBe(before);
      await p.button('发送').trigger('tap');
      await flushPromises();
      expect(p.store.active.id).toBe(conversationId);
      expect(p.store.activeQuestion.writingExercise.genreId).toBe('email');
      expect(input().attributes('aria-label')).toBe('英文邮件作答');
      const original = 'Dear Coordinator,\nCould we meet next Tuesday?\nThanks,\nMei  ';
      await input().setValue(original);
      expect(p.store.state.attempts).toHaveLength(0);
      await p.button('提交答案').trigger('tap');
      await flushPromises();
      expect(p.store.state.attempts.at(-1)).toMatchObject({ answer: original, grade: { status: 'pending' } });
      expect(p.store.state.reviews).toEqual([]);
    } finally {
      p.wrapper.unmount();
    }
  });
  it('句子聊天：建议只填草稿，同会话明确发送后拼句，词块仍需明确提交', async () => {
    const p = page();
    try {
      await p.store.send('我想练习英语写作', { chatEntry: true });
      await flushPromises();
      const id = p.store.active.id;
      const originalGoal = p.store.active.goal;
      const before = p.store.exportData();
      await p.button('英文句子组织').trigger('tap');
      expect(p.wrapper.get('.composer textarea').element.value).toBe('英文句子组织');
      expect(p.store.exportData()).toBe(before);
      await p.button('发送').trigger('tap');
      await flushPromises();
      expect(p.store.active.id).toBe(id);
      expect(p.store.active.goal).toBe(originalGoal);
      expect(p.wrapper.find('.sentence-builder').exists()).toBe(true);
      expect(p.wrapper.text()).toContain('原创练习 · 只核对本题组合');
      const opened = p.store.exportData();
      for (const tile of ['opens', 'at eight', 'every morning']) await p.button(tile).trigger('tap');
      expect(p.store.exportData()).toBe(opened);
      expect(p.button('提交答案')).toBeUndefined();
      await p.button('提交句子').trigger('tap');
      await flushPromises();
      expect(p.store.state.attempts).toHaveLength(1);
      expect(p.store.state.attempts[0]).toMatchObject({
        answer: 'The library opens at eight every morning.',
        hints: [],
        grade: { status: 'reliable', outcome: 'correct' }
      });
      await p.store.send('停止', { discussionOnly: true });
      await flushPromises();
      expect(p.button('提交句子').attributes('disabled')).toBeDefined();
      expect(p.button('看句子提示').attributes('disabled')).toBeDefined();
    } finally {
      p.wrapper.unmount();
    }
  });
  it('句子聊天：英文建议与开题说明复用双语，点击不保存事实', async () => {
    const p = page();
    try {
      setLanguage('en');
      await p.store.send('I want to practice English writing', { chatEntry: true });
      await flushPromises();
      const before = p.store.exportData();
      expect(p.button('English sentence building')).toBeTruthy();
      await p.button('English sentence building').trigger('tap');
      expect(p.wrapper.get('.composer textarea').element.value).toBe('English sentence building');
      expect(p.store.exportData()).toBe(before);
      expect(learningText('点选词块组织句子，明确提交后保存作答。')).toBe(
        'Choose the word tiles, then explicitly submit to save your sentence.'
      );
    } finally {
      p.wrapper.unmount();
      setLanguage('zh-CN');
    }
  });
  it('句子页顶提示：真实主按钮不带聊天标记仍展示本题提示', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const p = page(host);
    try {
      p.store.start('英文句子组织');
      await flushPromises();
      const before = JSON.parse(JSON.stringify(p.store.state));
      const action = vi.spyOn(p.store, 'dispatchLearningAction');
      await p.button('要个提示').trigger('tap');
      await flushPromises();
      expect(action).toHaveBeenCalledWith({ type: 'hint_only' });
      expect(p.store.active.pendingHints).toHaveLength(1);
      for (const key of ['attempts', 'questions', 'profile']) expect(p.store.state[key]).toEqual(before[key]);
      expect(p.store.state.strategy).toMatchObject({ method: 'hint', source: 'self_report' });
      expect(p.wrapper.text()).toContain('先找主语后的谓语，再安排两个时间短语。');
      expect(p.wrapper.text()).not.toContain('尚未连接模型，请先连接。');
      await p.store.send('停止', { discussionOnly: true });
      await flushPromises();
      expect(p.button('要个提示').attributes('disabled')).toBeDefined();
    } finally {
      p.wrapper.unmount();
      host.remove();
    }
  });
  it('句子提示消息定位：较早分页后仍以含提示的真实气泡为焦点，不使用空锚点', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const p = page(host);
    try {
      p.store.start('英文句子组织');
      for (let index = 0; index < 51; index++)
        p.store.commit('message.add', {
          conversationId: p.store.active.id,
          role: 'notice',
          content: `较早的学习消息 ${index + 1}`
        });
      await flushPromises();
      await p.button('更早消息').trigger('tap');
      await flushPromises();
      const empty = p.wrapper.get('#learning-chat-latest').element;
      const before = JSON.parse(JSON.stringify(p.store.state));
      await p.button('要个提示').trigger('tap');
      await flushPromises();
      const response = p.wrapper.get('.sentence-hint-target');
      expect(response.text()).toContain('先找主语后的谓语，再安排两个时间短语。');
      expect(response.attributes('id')).toBe(p.store.active.messages.at(-1).id);
      expect(response.attributes('tabindex')).toBe('-1');
      expect(response.element).not.toBe(empty);
      expect(document.activeElement).toBe(response.element);
      for (const key of ['attempts', 'questions', 'profile']) expect(p.store.state[key]).toEqual(before[key]);
      expect(p.store.state.strategy).toMatchObject({ method: 'hint', source: 'self_report' });
      expect(p.store.active.pendingHints).toHaveLength(1);
    } finally {
      p.wrapper.unmount();
      host.remove();
    }
  });
  it('句子已存原答呈现：停止后三份原答随原反馈显示，页面重建与双语阅读不改事实', async () => {
    let p = page();
    const originals = [
      'The library open at eight every morning.',
      'The library opens at eight every morning.',
      'Could you tell me where the meeting room is?'
    ];
    try {
      p.store.start('英文句子组织');
      p.store.submit(originals[0], true, 'saved-sentence-first');
      p.store.recordSentenceHelp(p.store.writingContext());
      const revision = p.store.submit(originals[1], true, 'saved-sentence-revision');
      p.store.startSentenceTask(p.store.writingContext());
      p.store.submit(originals[2], true, 'saved-sentence-independent');
      p.store.commit(
        'message.add',
        {
          conversationId: p.store.active.id,
          role: 'notice',
          content: '保留这份原答用于复习。',
          attemptId: revision.id
        },
        'saved-sentence-comment'
      );
      p.store.commit('task.stop', { conversationId: p.store.active.id });
      const before = p.store.exportData();
      const check = () => {
        const answers = p.wrapper.findAll('.sentence-saved-answer');
        expect(answers).toHaveLength(3);
        answers.forEach((answer, index) => expect(answer.element.textContent.endsWith(originals[index])).toBe(true));
        expect(p.store.exportData()).toBe(before);
        expect(p.store.active.stopped).toBe(true);
      };
      await flushPromises();
      check();
      expect(p.wrapper.findAll('.sentence-saved-answer').every((answer) => answer.text().includes('原答：'))).toBe(
        true
      );
      p.wrapper.unmount();
      p = page();
      await flushPromises();
      check();
      setLanguage('en');
      await flushPromises();
      check();
      expect(
        p.wrapper.findAll('.sentence-saved-answer').every((answer) => answer.text().startsWith('Original answer:'))
      ).toBe(true);
    } finally {
      p.wrapper.unmount();
      setLanguage('zh-CN');
    }
  });
  it('句子已存原答呈现：显示已存原文，未提交草稿及其他对话的关联消息不带出原答', async () => {
    const p = page();
    try {
      p.store.start('英文句子组织');
      const original = 'The library opens at eight every morning.  \n';
      const attempt = p.store.submit(original, true, 'sentence-exact-original');
      await flushPromises();
      expect(p.wrapper.get('.sentence-saved-answer').element.textContent.endsWith(attempt.answer)).toBe(true);
      p.store.start('英文句子组织');
      p.store.commit(
        'message.add',
        {
          conversationId: p.store.active.id,
          role: 'notice',
          content: '本题组合正确。',
          questionKey: attempt.questionKey,
          attemptId: attempt.id
        },
        'other-conversation-feedback'
      );
      p.store.commit(
        'message.add',
        { conversationId: p.store.active.id, role: 'notice', content: '本题组合正确。', attemptId: 'missing-sentence' },
        'missing-sentence:feedback'
      );
      await flushPromises();
      expect(p.wrapper.findAll('.sentence-saved-answer')).toHaveLength(0);
      const before = p.store.exportData();
      for (const tile of ['opens', 'at eight', 'every morning']) await p.button(tile).trigger('tap');
      expect(p.wrapper.findAll('.sentence-saved-answer')).toHaveLength(0);
      expect(p.store.exportData()).toBe(before);
    } finally {
      p.wrapper.unmount();
    }
  });
  it('离线邮件直达参考：主按钮在聊天显示已有信件和出处，不改教法或首稿', async () => {
    const p = page();
    const request = vi.spyOn(uni, 'request');
    try {
      await p.store.send('英文邮件写作', { chatEntry: true });
      const original = 'Dear Library Team,\n\nCould I renew the book?\n\nMei  ';
      p.store.submit(original, true, 'direct-reference-first', { chatEntry: true });
      await flushPromises();
      const first = JSON.parse(JSON.stringify(p.store.state.attempts[0]));
      const strategy = JSON.parse(JSON.stringify(p.store.state.strategy));
      expect(p.button('读参考信件')).toBeTruthy();
      expect(p.button('要个提示')).toBeUndefined();
      await p.button('读参考信件').trigger('tap');
      await flushPromises();
      expect(p.store.state.strategy).toEqual(strategy);
      expect(p.store.state.attempts[0]).toEqual(first);
      expect(p.store.active.pendingHints).toHaveLength(1);
      expect(p.store.active.pendingHints[0].reference.id).toBe('mcmurrey-inquiry-letter-body-en-v1');
      expect(p.wrapper.text()).toContain('公开参考内容，不计入学习记录。');
      expect(p.wrapper.text()).toContain('Dear Technical Support Department:');
      expect(p.wrapper.text()).toContain('https://mcmassociates.io/textbook/examples/inquirex2c.html');
      expect(p.store.state.events.some((event) => ['strategy.set', 'model.request'].includes(event.type))).toBe(false);
      expect(p.store.state.reviews).toEqual([]);
      expect(request).not.toHaveBeenCalled();
    } finally {
      p.wrapper.unmount();
    }
  });
  it('离线邮件直达参考：英文说明sample，停止时仍明确标示参考且不可读', async () => {
    const p = page();
    try {
      await p.store.send('英文邮件写作', { chatEntry: true });
      setLanguage('en');
      await flushPromises();
      expect(p.button('Read reference email')).toBeTruthy();
      expect(learningText('公开参考内容，不计入学习记录。')).toBe(
        'Public reference material. This is not a learning record.'
      );
      await p.store.send('停止', { discussionOnly: true });
      await flushPromises();
      expect(p.button('Read reference email').attributes('disabled')).toBeDefined();
      expect(p.store.active.pendingHints).toEqual([]);
    } finally {
      p.wrapper.unmount();
      setLanguage('zh-CN');
    }
  });
  it('物理目标只显示密度建议，点击只改草稿，发送后同会话明确提交才写原答', async () => {
    const p = page();
    try {
      const input = () => p.wrapper.get('textarea[aria-label="消息或作答"]');
      await input().setValue('我想复习初中物理');
      await p.button('发送').trigger('tap');
      await flushPromises();
      const conversationId = p.store.active.id;
      const before = p.store.exportData();
      expect(p.wrapper.get('.chat-topics').text()).toBe('密度');
      await p.button('密度').trigger('tap');
      expect(input().element.value).toBe('密度');
      expect(p.store.exportData()).toBe(before);
      await p.button('发送').trigger('tap');
      await flushPromises();
      expect(p.store.active.id).toBe(conversationId);
      expect(p.store.activeQuestion.subject).toBe('物理');
      expect(p.store.state.attempts).toHaveLength(0);
      await p.button('C. 2.4g/cm³').trigger('tap');
      expect(p.store.state.attempts).toHaveLength(0);
      await p.button('提交作答').trigger('tap');
      await flushPromises();
      expect(p.store.state.attempts.at(-1)).toMatchObject({ answer: 'C', grade: { outcome: 'correct' } });
    } finally {
      p.wrapper.unmount();
    }
  });
  it('默认页从小步引导到贴题、原答订正和独立变式，明确提交保留可靠判分且不再追加诗词', async () => {
    const p = page();
    try {
      await p.wrapper.get('#learning-composer textarea').setValue('这道题我不会，带我一步步理解');
      expect(p.store.state.conversations).toHaveLength(0);
      await p.button('发送').trigger('tap');
      await flushPromises();
      const conversationId = p.store.active.id;
      const input = () => p.wrapper.get('textarea[aria-label="消息或作答"]');
      await input().setValue('题目：2x+3=9');
      await p.button('发送').trigger('tap');
      await flushPromises();
      expect(p.store.active.pendingHints).toHaveLength(1);
      await input().setValue('x=4');
      await p.button('提交作答').trigger('tap');
      await flushPromises();
      expect(p.store.state.attempts[0].grade.outcome).toBe('wrong');
      await p.button('要个提示').trigger('tap');
      await input().setValue('x=3');
      await p.button('提交作答').trigger('tap');
      await flushPromises();
      expect(p.store.state.attempts[1]).toMatchObject({ kind: 'revision', grade: { outcome: 'correct' } });
      expect(p.store.state.attempts[1].hints).toHaveLength(1);
      await p.wrapper
        .findAll('button')
        .find((button) => button.text().includes('变式'))
        .trigger('tap');
      await input().setValue('x=2');
      await p.button('提交作答').trigger('tap');
      await flushPromises();
      expect(p.store.state.attempts[2]).toMatchObject({ kind: 'variant', hints: [], grade: { outcome: 'correct' } });
      expect(p.store.active.messages.filter((message) => message.content.startsWith('妙哉妙哉'))).toHaveLength(0);
      await input().setValue('停止当前任务');
      await p.wrapper.get('#learning-composer .muse-send').trigger('tap');
      await flushPromises();
      expect(p.store.active).toMatchObject({ id: conversationId, stopped: true });
      expect(p.store.state.reviews.length).toBeGreaterThan(0);
    } finally {
      p.wrapper.unmount();
    }
  });
  it('默认页贴题写入中断保留草稿，同一发送编号续接不误记作答', async () => {
    const p = page();
    const originalCommit = learningRepository.commit.bind(learningRepository);
    let fail = true;
    const spy = vi.spyOn(learningRepository, 'commit').mockImplementation((operation) => {
      if (fail && operation.id.endsWith(':chat-plan')) {
        fail = false;
        throw new Error('synthetic interrupted chat plan');
      }
      return originalCommit(operation);
    });
    try {
      await p.wrapper.get('textarea[aria-label="消息或作答"]').setValue('题目：2x+3=9');
      await p.button('发送').trigger('tap');
      await flushPromises();
      expect(p.wrapper.get('textarea[aria-label="消息或作答"]').element.value).toBe('题目：2x+3=9');
      expect(p.store.state.questions).toHaveLength(1);
      await p.button('发送').trigger('tap');
      await flushPromises();
      expect(p.store.state.questions).toHaveLength(1);
      expect(p.store.state.attempts).toHaveLength(0);
      expect(p.store.currentPlan.tasks).toHaveLength(1);
      expect(p.wrapper.get('textarea[aria-label="消息或作答"]').element.value).toBe('');
    } finally {
      spy.mockRestore();
      p.wrapper.unmount();
    }
  });
  it('新聊天不推断年级教材，原会话的显式学习范围保持', async () => {
    const p = page();
    try {
      const original = p.store.start('理解方向', { track: 'junior', stage: '八年级', edition: '自选教材' });
      p.store.selectedConversationId = null;
      await flushPromises();
      await p.wrapper.get('textarea[aria-label="消息或作答"]').setValue('我想复习初二数学');
      await p.button('发送').trigger('tap');
      await flushPromises();
      expect(p.store.active.task).toBeUndefined();
      expect(p.store.state.conversations.find((item) => item.id === original.id).task).toMatchObject({
        track: 'junior',
        stage: '八年级',
        edition: '自选教材'
      });
      expect(p.store.state.attempts).toHaveLength(0);
    } finally {
      p.wrapper.unmount();
    }
  });
  it('基础与时区只在保存时生效，自述基础不变成掌握证据', async () => {
    const p = page();
    try {
      await openLearningSettings(p.wrapper);
      await p.button('目标与计划').trigger('tap');
      const before = p.store.exportData();
      await p.button('有些基础').trigger('tap');
      await p.button('洛杉矶').trigger('tap');
      expect(p.store.exportData()).toBe(before);
      await p.button('保存基础').trigger('tap');
      expect(p.store.state.profile.at(-1)).toMatchObject({
        field: 'foundation',
        value: '有些基础',
        source: 'self_report',
        evidenceIds: []
      });
      await p.button('保存时区').trigger('tap');
      expect(p.store.state.timezone).toBe('America/Los_Angeles');
      expect(p.store.summary.totalReliableAnswers).toBe(0);
      expect(p.store.state.attempts).toHaveLength(0);
    } finally {
      p.wrapper.unmount();
    }
  });
  it('任务多选可取消，并保留自定义内容和历史计划，选择不会自动完成任务', async () => {
    const p = page();
    try {
      await openLearningSettings(p.wrapper);
      await p.button('目标与计划').trigger('tap');
      await p.button('自定义任务').trigger('tap');
      await p.wrapper.get('textarea[aria-label="自定义今日任务"]').setValue('复盘实验');
      const before = p.store.exportData();
      await p.button('复习错题').trigger('tap');
      await p.button('写一段短文').trigger('tap');
      await p.button('写一段短文').trigger('tap');
      expect(p.store.exportData()).toBe(before);
      expect(p.wrapper.get('textarea[aria-label="自定义今日任务"]').element.value).toBe('复盘实验\n复习错题');
      await p.button('保存计划').trigger('tap');
      const first = JSON.parse(JSON.stringify(p.store.state.plans.at(-1)));
      expect(first.tasks.map((t) => t.title)).toEqual(['复盘实验', '复习错题']);
      await p.button('理解一个概念').trigger('tap');
      await p.button('保存计划').trigger('tap');
      expect(p.store.state.plans).toHaveLength(2);
      expect(p.store.state.plans[0]).toEqual(first);
      expect(p.store.summary.tasks.numerator).toBe(0);
    } finally {
      p.wrapper.unmount();
    }
  });
  it('单选、多选和模式切换只改草稿，明确提交后才保存待核对作答', async () => {
    const p = page();
    try {
      p.store.start('合成选择题');
      choice(p.store);
      await flushPromises();
      const before = p.store.exportData();
      await p.button('A. 向右').trigger('tap');
      await p.button('B. 向左').trigger('tap');
      expect(p.wrapper.get('textarea[aria-label="消息或作答"]').element.value).toBe('B');
      await p.wrapper.get('[data-test="multiple-answers"]').trigger('tap');
      await p.button('A. 向右').trigger('tap');
      expect(p.wrapper.get('textarea[aria-label="消息或作答"]').element.value).toBe('A、B');
      await p.wrapper.get('[data-test="multiple-answers"]').trigger('tap');
      expect(p.wrapper.get('textarea[aria-label="消息或作答"]').element.value).toBe('A');
      await p.wrapper.get('[data-test="multiple-answers"]').trigger('tap');
      await p.button('C. 不变').trigger('tap');
      expect(p.store.exportData()).toBe(before);
      await p.button('提交作答').trigger('tap');
      expect(p.store.state.attempts).toHaveLength(1);
      expect(p.store.state.attempts[0]).toMatchObject({ answer: 'A、C', grade: { status: 'pending' } });
      expect(p.store.summary.totalReliableAnswers).toBe(0);
    } finally {
      p.wrapper.unmount();
    }
  });
  it('切换题目或共享同题的对话清空选择草稿，停止后不能选择或提交', async () => {
    const p = page();
    try {
      const first = p.store.start('合成选择题');
      const q = choice(p.store);
      await flushPromises();
      await p.button('A. 向右').trigger('tap');
      p.store.start('另一个合成对话');
      p.store.focus(q.questionKey);
      await flushPromises();
      expect(p.wrapper.get('textarea[aria-label="消息或作答"]').element.value).toBe('');
      await p.button('B. 向左').trigger('tap');
      choice(p.store, 'other-choice');
      await flushPromises();
      expect(p.wrapper.get('textarea[aria-label="消息或作答"]').element.value).toBe('');
      p.store.focus(q.questionKey, first.id);
      await flushPromises();
      await p.button('C. 不变').trigger('tap');
      await p.store.send('停止', { discussionOnly: true });
      await flushPromises();
      const before = p.store.exportData();
      expect(p.button('A. 向右').attributes('disabled')).toBeDefined();
      expect(p.button('提交作答').attributes('disabled')).toBeDefined();
      await p.button('A. 向右').trigger('tap');
      await p.button('提交作答').trigger('tap');
      expect(p.store.exportData()).toBe(before);
      expect(p.store.active.stopped).toBe(true);
      expect(p.store.state.attempts).toHaveLength(0);
    } finally {
      p.wrapper.unmount();
    }
  });
  it('重复选项标识保留原文，不为异常题目生成错误选择映射', async () => {
    const p = page();
    try {
      p.store.start('合成选择题');
      choice(p.store, 'duplicate-choice', ['A. 原选项', 'A. 重复标识']);
      await flushPromises();
      expect(p.wrapper.find('[aria-label="答案选项"]').exists()).toBe(false);
      expect(p.wrapper.text()).toContain('A. 原选项');
      expect(p.wrapper.text()).toContain('A. 重复标识');
      expect(p.store.state.attempts).toHaveLength(0);
    } finally {
      p.wrapper.unmount();
    }
  });
  it('跨端输入的 detail.value 更新目标和原答，输入后仍需明确提交', async () => {
    const p = page();
    try {
      await p.wrapper.get('textarea[aria-label="消息或作答"]').trigger('input', { detail: { value: '12 + 8' } });
      expect(p.store.state.conversations).toHaveLength(0);
      await p.button('发送').trigger('tap');
      expect(p.store.active.goal).toBe('12 + 8');
      await p.wrapper.get('textarea[aria-label="消息或作答"]').trigger('input', { detail: { value: '19' } });
      expect(p.store.state.attempts).toHaveLength(0);
      await p.button('提交作答').trigger('tap');
      expect(p.store.state.attempts.at(-1)).toMatchObject({
        answer: '19',
        grade: { status: 'reliable', outcome: 'wrong' }
      });
    } finally {
      p.wrapper.unmount();
    }
  });
});
beforeEach(() => {
  // 此文件继续验收保留的历史学习与恢复界面；当前带练首屏另走真实浏览器路径。
  vi.stubEnv('VITE_ENABLE_WRITING_COACH', 'false');
  vi.stubEnv('VITE_ENABLE_LEGACY_LEARNING', 'true');
  uni.clearStorageSync();
  // Exercise the explicitly collapsed device layout; S3 tests cover the open default.
  uni.setStorageSync('yozi_shell_sidebar_v1', { version: 1, collapsed: true, width: 217 });
  setActivePinia(createPinia());
  vi.clearAllMocks();
  loadHooks.callbacks = [];
  loadHooks.showCallbacks = [];
  loadHooks.backCallbacks = [];
  loadHooks.hideCallbacks = [];
});
it('合并已经成功后新的学习事实清理过时回执，不误报旧备份尚未合并', async () => {
  const store = useConversationLearningStore();
  store.start('12 + 8');
  const originalEvents = JSON.parse(JSON.stringify(store.state.events));
  const incoming = applyLearningOperation(emptyLearningState('guest', store.state.timezone), {
    id: 'restored-new-conversation',
    type: 'conversation.start',
    data: { goal: '合成恢复记录' }
  }).state;
  const wrapper = mount(LearningPage, { global: { stubs: { ...stubs, LearningLab: true } } });
  const button = (label) => wrapper.findAll('button').find((b) => matchesLearningControl(b, label));
  const close = observeLearningDialogs(wrapper, (dialog) => dialog.success({ confirm: true }));
  try {
    await openLearningSettings(wrapper);
    await button('记录与隐私').trigger('tap');
    await button('恢复备份').trigger('tap');
    await wrapper.get('textarea[aria-label="学习记录 JSON 备份"]').setValue(JSON.stringify(incoming));
    await button('校验并预览').trigger('tap');
    await flushPromises();
    await button('确认合并记录').trigger('tap');
    await flushPromises();
    expect(wrapper.text()).toContain('已合并 1 个操作');
    expect(store.state.conversations.some((c) => c.id === 'restored-new-conversation')).toBe(true);
    expect(wrapper.get('textarea[aria-label="学习记录 JSON 备份"]').element.value).toBe('');
    store.commit('timezone.set', { timezone: 'UTC' });
    await flushPromises();
    expect(wrapper.text()).not.toContain('未合并旧预览');
    expect(button('确认合并记录')).toBeUndefined();
    expect(store.state.events.slice(0, originalEvents.length)).toEqual(originalEvents);
  } finally {
    close();
    wrapper.unmount();
    store.$dispose();
  }
});
describe('同步等待与冲突确认', () => {
  function page() {
    uni.setStorageSync('EXAM_USER_ID', 'u1');
    uni.setStorageSync('EXAM_TOKEN', 'TEST_ONLY_token');
    const store = useConversationLearningStore();
    store.start('12 + 8');
    store.submit('19', true, 'page-sync-original-answer');
    const wrapper = mount(LearningPage, { global: { stubs } });
    const button = (name) => wrapper.findAll('button').find((item) => matchesLearningControl(item, name));
    const dialogs = [];
    const stop = observeLearningDialogs(wrapper, (dialog) => dialogs.push(dialog));
    return { store, wrapper, button, dialogs, stop };
  }
  it.each(['local', 'remote'])(
    'S25 native %s conflict export selects a distinct file kind and preserves both snapshots',
    async (side) => {
      vi.stubGlobal('__YOZI_DESKTOP__', true);
      const previous = Object.getOwnPropertyDescriptor(window, '__TAURI_INTERNALS__');
      Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: { invoke: vi.fn() } });
      const save = vi
        .spyOn(desktopLearningFiles, 'saveDesktopLearningFile')
        .mockResolvedValue({ saved: true, name: 'selected.json' });
      const p = page();
      const remote = JSON.parse(p.store.exportData());
      remote.conversations[0].goal = '保留的云端合成目标';
      remote.events.find((event) => event.id === remote.conversations[0].id).data.goal = '保留的云端合成目标';
      learningRepository.captureSyncConflict(remote, []);
      p.store.refresh();
      const expected = learningRepository.exportSyncConflict(side);
      const before = p.store.exportData();
      const other = learningRepository.exportSyncConflict(side === 'local' ? 'remote' : 'local');
      try {
        for (const load of loadHooks.callbacks) load({ panel: 'data' });
        await flushPromises();
        await p.button(side === 'local' ? '导出本机冲突副本' : '导出云端冲突副本').trigger('tap');
        await flushPromises();
        expect(save).toHaveBeenCalledWith(
          `records-conflict-${side}`,
          expected,
          expect.objectContaining({ isCurrent: expect.any(Function) })
        );
        expect(p.store.exportData()).toBe(before);
        expect(learningRepository.exportSyncConflict(side === 'local' ? 'remote' : 'local')).toBe(other);
      } finally {
        p.stop();
        p.wrapper.unmount();
        p.store.$dispose();
        save.mockRestore();
        if (previous) Object.defineProperty(window, '__TAURI_INTERNALS__', previous);
        else delete window.__TAURI_INTERNALS__;
        vi.unstubAllGlobals();
      }
    }
  );
  it.each(['local', 'remote'])('legacy关闭时实际导出%s冲突文件，不只写入隐藏的恢复输入', async (side) => {
    vi.stubEnv('VITE_ENABLE_LEGACY_LEARNING', 'false');
    const p = page();
    const remote = JSON.parse(p.store.exportData());
    remote.conversations[0].goal = '保留的云端合成目标';
    remote.events.find((event) => event.id === remote.conversations[0].id).data.goal = '保留的云端合成目标';
    learningRepository.captureSyncConflict(remote, []);
    p.store.refresh();
    const expected = learningRepository.exportSyncConflict(side);
    const before = p.store.exportData();
    const originalCreate = URL.createObjectURL,
      originalRevoke = URL.revokeObjectURL;
    let blob, filename;
    URL.createObjectURL = vi.fn((value) => {
      blob = value;
      return 'blob:isolated-conflict-export';
    });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      filename = this.download;
    });
    try {
      for (const load of loadHooks.callbacks) load({ panel: 'data' });
      await flushPromises();
      await p.button(side === 'local' ? '导出本机冲突副本' : '导出云端冲突副本').trigger('tap');
      await flushPromises();
      expect(filename).toBe(`learning-conflict-${side}.json`);
      const content = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(blob);
      });
      expect(content).toBe(expected);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:isolated-conflict-export');
      expect(p.store.exportData()).toBe(before);
      expect(learningRepository.exportSyncConflict(side)).toBe(expected);
    } finally {
      click.mockRestore();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      p.stop();
      p.wrapper.unmount();
      p.store.$dispose();
      vi.unstubAllEnvs();
    }
  });
  it.each([
    ['移除已保存的冲突副本', 'clearSyncConflict'],
    ['恢复本机冲突副本', 'restoreConflictLocal'],
    ['采用云端继续', 'adoptCloudRecords']
  ])('归档替换后旧页面确认不执行：%s', async (label, method) => {
    const p = page();
    const remote = JSON.parse(p.store.exportData());
    const conversation = remote.conversations[0].id;
    const changeGoal = (goal) => {
      const next = structuredClone(remote);
      next.conversations[0].goal = goal;
      next.events.find((e) => e.id === conversation).data.goal = goal;
      return next;
    };
    learningRepository.captureSyncConflict(changeGoal('第一份云端目标'), [conversation]);
    p.store.refresh();
    const action = vi.spyOn(p.store, method);
    try {
      await openLearningSettings(p.wrapper);
      await p.button('记录与隐私').trigger('tap');
      await p.button(label).trigger('tap');
      const old = p.dialogs.at(-1);
      learningRepository.clearSyncConflict();
      learningRepository.captureSyncConflict(changeGoal('新归档的云端目标'), [conversation]);
      const current = learningRepository.exportSyncConflict('remote');
      p.store.refresh();
      old.success({ confirm: true });
      await flushPromises();
      expect(action).not.toHaveBeenCalled();
      expect(learningRepository.exportSyncConflict('remote')).toBe(current);
      expect(p.store.state.attempts[0].answer).toBe('19');
      await p.button(label).trigger('tap');
      if (method === 'clearSyncConflict') {
        p.dialogs.at(-1).success({ confirm: true });
        await flushPromises();
        expect(action).toHaveBeenCalledTimes(1);
        expect(learningRepository.previewSyncConflict()).toBeNull();
        expect(p.wrapper.get('[data-test="record-sync-status"]').text()).toContain('冲突归档已移除');
      } else p.dialogs.at(-1).success({ confirm: false });
    } finally {
      p.stop();
      p.wrapper.unmount();
      p.store.$dispose();
      action.mockRestore();
    }
  });
  it('同步首个请求就近显示等待，取消不宣称已回退云端；迟到结果与离页提示不进入新页面', async () => {
    const p = page();
    let reply;
    const transport = vi.spyOn(uni, 'request').mockImplementation((options) => {
      reply = options;
      return { abort: vi.fn() };
    });
    try {
      await openLearningSettings(p.wrapper);
      await p.button('记录与隐私').trigger('tap');
      await p.button('同步学习记录').trigger('tap');
      p.dialogs.at(-1).success({ confirm: true });
      await flushPromises();
      expect(p.wrapper.get('[data-test="record-sync-status"]').attributes('aria-busy')).toBe('true');
      expect(p.wrapper.get('[data-test="record-sync-status"]').text()).toContain('正在同步');
      expect(p.button('同步学习记录').attributes('disabled')).toBeDefined();
      await p.button('同步学习记录').trigger('tap');
      expect(p.dialogs).toHaveLength(1);
      await p.button('取消同步').trigger('tap');
      expect(p.wrapper.get('[data-test="record-sync-status"]').text()).toContain('已发送批次可能已保存云端');
      for (const callback of loadHooks.hideCallbacks) callback();
      for (const callback of loadHooks.showCallbacks) callback();
      reply.success({ data: { success: false, message: '旧页面的迟到失败' } });
      await flushPromises();
      expect(p.wrapper.find('[data-test="record-sync-status"]').exists()).toBe(false);
      expect(p.wrapper.text()).not.toContain('旧页面的迟到失败');
      expect(p.wrapper.text()).not.toContain('已同步并按服务端事实重算');
      expect(p.store.state.attempts[0].answer).toBe('19');
      expect(p.button('同步学习记录').attributes('disabled')).toBeUndefined();
    } finally {
      p.stop();
      p.wrapper.unmount();
      p.store.$dispose();
      transport.mockRestore();
    }
  });
  it('重复弹窗的旧提示不遮盖下一次已确认的云端成功回执', async () => {
    const p = page();
    const transport = vi.spyOn(uni, 'request').mockImplementation((options) => {
      options.success({ data: { success: true, data: { deleted: true, modelResultCacheDeleted: true } } });
      return { abort: vi.fn() };
    });
    try {
      await openLearningSettings(p.wrapper);
      await p.button('记录与隐私').trigger('tap');
      await p.button('删除云端学习副本').trigger('tap');
      await p.button('同步学习记录').trigger('tap');
      expect(p.wrapper.text()).toContain('请先完成当前弹窗，稍后重试。');
      expect(transport).not.toHaveBeenCalled();
      p.dialogs.at(-1).success({ confirm: false });
      await p.button('删除云端学习副本').trigger('tap');
      p.dialogs.at(-1).success({ confirm: true });
      await flushPromises();
      expect(p.wrapper.get('[data-test="record-sync-status"]').text()).toContain(
        '服务端已确认清除学习副本和教学结果缓存'
      );
      expect(p.wrapper.text()).not.toContain('请先完成当前弹窗，稍后重试。');
      expect(transport).toHaveBeenCalledTimes(1);
      expect(p.store.state.attempts[0].answer).toBe('19');
    } finally {
      p.stop();
      p.wrapper.unmount();
      p.store.$dispose();
      transport.mockRestore();
    }
  });
  it('补传进度只随已校验回执增长，取消后不显示完整成功且不接纳迟到批次', async () => {
    const p = page();
    const conversationId = p.store.active.id;
    for (let i = 0; i < 101; i++)
      learningRepository.commit({
        id: `progress-message-${i}`,
        type: 'message.add',
        at: Date.now(),
        data: { conversationId, role: 'user', content: `合成消息 ${i}` }
      });
    p.store.refresh();
    const total = p.store.state.events.length;
    let remote = emptyLearningState('u1', p.store.state.timezone),
      reply;
    const transport = vi.spyOn(uni, 'request').mockImplementation((options) => {
      if (options.data.action === 'pull') options.success({ data: { success: true, data: { state: remote } } });
      else reply = options;
      return { abort: vi.fn() };
    });
    const receive = () => {
      for (const operation of reply.data.operations)
        remote = applyLearningOperation(remote, normalizePrivateSyncOperation(operation)).state;
      reply.success({
        data: {
          success: true,
          data: { accepted: reply.data.operations.map((e) => e.id), snapshotRequired: true, revision: 1 }
        }
      });
    };
    try {
      await openLearningSettings(p.wrapper);
      await p.button('记录与隐私').trigger('tap');
      await p.button('同步学习记录').trigger('tap');
      p.dialogs.at(-1).success({ confirm: true });
      await flushPromises();
      expect(p.wrapper.get('[data-test="record-sync-progress"]').attributes('aria-valuenow')).toBe('0');
      expect(p.wrapper.get('[data-test="record-sync-progress"]').attributes('aria-valuemax')).toBe(String(total));
      receive();
      await flushPromises();
      expect(p.wrapper.get('[data-test="record-sync-progress"]').attributes('aria-valuenow')).toBe('100');
      expect(p.wrapper.text()).toContain('完整结果仍需核对');
      expect(p.wrapper.text()).not.toContain('本次同步完成');
      await p.button('取消同步').trigger('tap');
      receive();
      await flushPromises();
      expect(p.wrapper.find('[data-test="record-sync-progress"]').exists()).toBe(false);
      expect(p.wrapper.text()).not.toContain('本次同步完成');
      expect(p.store.state.attempts[0].answer).toBe('19');
      expect(p.store.state.events).toHaveLength(total);
    } finally {
      p.stop();
      p.wrapper.unmount();
      p.store.$dispose();
      transport.mockRestore();
    }
  });
  it('同步失败保留原答与授权入口，就近可明确重试；删除缓存不完整不能显示全部清除成功', async () => {
    const p = page();
    const transport = vi.spyOn(uni, 'request').mockImplementation((options) => {
      options.success({ data: { success: false, message: '同步连接暂不可用' } });
      return { abort: vi.fn() };
    });
    try {
      await openLearningSettings(p.wrapper);
      await p.button('记录与隐私').trigger('tap');
      await p.button('同步学习记录').trigger('tap');
      p.dialogs.at(-1).success({ confirm: true });
      await flushPromises();
      expect(p.wrapper.get('[data-test="record-sync-status"]').attributes('role')).toBe('alert');
      expect(p.wrapper.get('[data-test="record-sync-status"]').text()).toContain(t('ui.operationFailed'));
      expect(p.wrapper.get('[data-test="record-sync-status"]').text()).not.toContain('同步连接暂不可用');
      expect(transport).toHaveBeenCalledTimes(1);
      transport.mockImplementation((options) => {
        options.success({ data: { success: true, data: { deleted: true } } });
        return { abort: vi.fn() };
      });
      await p.button('删除云端学习副本').trigger('tap');
      p.dialogs.at(-1).success({ confirm: true });
      await flushPromises();
      expect(p.wrapper.get('[data-test="record-sync-status"]').text()).toContain(t('ui.contentDeleteUnconfirmed'));
      expect(p.wrapper.text()).not.toContain('服务端已确认清除学习副本和教学结果缓存');
      expect(p.store.state.attempts[0].answer).toBe('19');
    } finally {
      p.stop();
      p.wrapper.unmount();
      p.store.$dispose();
      transport.mockRestore();
    }
  });
});
describe('网页备份文件与明确恢复', () => {
  function page() {
    const store = useConversationLearningStore();
    store.start('12 + 8');
    store.submit('19', true, 'browser-file-original-answer');
    store.commit('task.stop', { conversationId: store.active.id });
    const wrapper = mount(LearningPage, { global: { stubs } });
    const button = (name) => wrapper.findAll('button').find((item) => matchesLearningControl(item, name));
    const dialogs = [];
    const stop = observeLearningDialogs(wrapper, (dialog) => dialogs.push(dialog));
    const original = store.exportData();
    const open = async () => {
      await openLearningSettings(wrapper);
      await button('记录与隐私').trigger('tap');
      await button('恢复备份').trigger('tap');
      await wrapper.get('textarea[aria-label="学习记录 JSON 备份"]').setValue('原输入');
      await button('选择备份文件').trigger('tap');
      return document.querySelector('input[type="file"]');
    };
    const select = (picker, file) => {
      Object.defineProperty(picker, 'files', { configurable: true, value: [file] });
      picker.dispatchEvent(new Event('change'));
    };
    const close = () => {
      stop();
      wrapper.unmount();
      store.$dispose();
    };
    return { store, wrapper, button, dialogs, original, open, select, close };
  }
  it('读取不自动恢复；取消合并保留原答和停止，明确确认只合并一次', async () => {
    const p = page();
    try {
      const backup = JSON.parse(p.original);
      backup.events.push({
        id: 'browser-file-new-message',
        type: 'message.add',
        at: Date.now(),
        data: { conversationId: p.store.active.id, role: 'user', content: '合成文件的新消息' }
      });
      const picker = await p.open();
      expect(p.button('选择备份文件').attributes('disabled')).toBeDefined();
      expect(p.button('校验并预览').attributes('disabled')).toBeDefined();
      p.select(picker, new File([JSON.stringify(backup)], 'records.json'));
      await vi.waitFor(() => expect(p.wrapper.get('[data-test="record-file-status"]').text()).toContain('备份已读取'));
      expect(p.store.exportData()).toBe(p.original);
      expect(uni.request).not.toHaveBeenCalled();
      await p.button('校验并预览').trigger('tap');
      await flushPromises();
      await p.button('确认合并记录').trigger('tap');
      p.dialogs.at(-1).success({ confirm: false });
      await flushPromises();
      expect(p.store.exportData()).toBe(p.original);
      await p.button('确认合并记录').trigger('tap');
      const consent = p.dialogs.at(-1);
      consent.success({ confirm: true });
      await flushPromises();
      consent.success({ confirm: true });
      await flushPromises();
      expect(p.store.state.events.filter((e) => e.id === 'browser-file-new-message')).toHaveLength(1);
      expect(p.store.state.attempts[0].answer).toBe('19');
      expect(p.store.active.stopped).toBe(true);
      expect(uni.request).not.toHaveBeenCalled();
    } finally {
      p.close();
    }
  });
  it('选择取消、错误文件与再次选择保留原输入，重复点击只打开一次选择器', async () => {
    const p = page();
    try {
      const picker = await p.open();
      await p.button('选择备份文件').trigger('tap');
      expect(document.querySelectorAll('input[type="file"]')).toHaveLength(1);
      picker.dispatchEvent(new Event('cancel'));
      await flushPromises();
      expect(p.wrapper.get('[data-test="record-file-status"]').text()).toContain('已取消选择');
      expect(p.wrapper.get('textarea[aria-label="学习记录 JSON 备份"]').element.value).toBe('原输入');
      await p.button('选择备份文件').trigger('tap');
      p.select(document.querySelector('input[type="file"]'), new File(['{}'], 'wrong.csv'));
      await flushPromises();
      expect(p.wrapper.get('[data-test="record-file-status"]').attributes('role')).toBe('alert');
      expect(p.wrapper.get('textarea[aria-label="学习记录 JSON 备份"]').element.value).toBe('原输入');
      expect(p.store.exportData()).toBe(p.original);
    } finally {
      p.close();
    }
  });
  it.each(['cancel', 'input', 'hidden', 'revision'])(
    '迟到读取不能覆盖取消、输入往返、离页或新记录：%s',
    async (change) => {
      const p = page();
      let reader;
      const read = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer').mockImplementation(function () {
        reader = this;
      });
      try {
        const picker = await p.open();
        p.select(picker, new File(['旧正文'], 'records.json'));
        const late = reader.onload;
        if (change === 'cancel') await p.button('取消文件读取').trigger('tap');
        else if (change === 'input') {
          const input = p.wrapper.get('textarea[aria-label="学习记录 JSON 备份"]');
          await input.setValue('新输入');
          await input.setValue('原输入');
        } else if (change === 'hidden') {
          for (const callback of loadHooks.hideCallbacks) callback();
          for (const callback of loadHooks.showCallbacks) callback();
        } else p.store.commit('timezone.set', { timezone: 'Asia/Shanghai' });
        const current = p.store.exportData();
        late();
        await flushPromises();
        expect(p.wrapper.get('textarea[aria-label="学习记录 JSON 备份"]').element.value).toBe('原输入');
        expect(p.store.exportData()).toBe(current);
        expect(p.store.state.attempts[0].answer).toBe('19');
        expect(p.store.active.stopped).toBe(true);
        expect(p.wrapper.text()).not.toContain('备份已读取');
        expect(picker.isConnected).toBe(false);
        expect(p.button('选择备份文件').attributes('disabled')).toBeUndefined();
      } finally {
        read.mockRestore();
        p.close();
      }
    }
  );
  it('账户往返及收起恢复面板不接纳旧文件，访客原件保持', async () => {
    const p = page();
    const guestKey = Object.keys(global.__mockStorage).find((key) => key.endsWith('conversation_learning_v1'));
    const guestOriginal = structuredClone(uni.getStorageSync(guestKey));
    let reader;
    const read = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer').mockImplementation(function () {
      reader = this;
    });
    try {
      const picker = await p.open();
      p.select(picker, new File(['旧账户正文'], 'records.json'));
      const old = reader.onload;
      storageService.saveLoginSession({
        userId: 'browser-record-file-account',
        token: 'fixture-record-file-token',
        userInfo: { id: 'browser-record-file-account' }
      });
      p.store.refresh();
      await flushPromises();
      expect(p.store.state.owner).toBe('browser-record-file-account');
      expect(p.store.state.events).toHaveLength(0);
      storageService._clearRevokedCredentials();
      p.store.refresh();
      old();
      await flushPromises();
      expect(p.store.state.events).toHaveLength(0);
      expect(uni.getStorageSync(guestKey)).toEqual(guestOriginal);
      expect(p.wrapper.get('textarea[aria-label="学习记录 JSON 备份"]').element.value).toBe('');
      await p.button('选择备份文件').trigger('tap');
      const hiddenPicker = document.querySelector('input[type="file"]');
      p.select(hiddenPicker, new File(['收起前的正文'], 'records.json'));
      const hidden = reader.onload;
      await p.button('恢复备份').trigger('tap');
      hidden();
      await p.button('恢复备份').trigger('tap');
      await flushPromises();
      expect(p.wrapper.get('textarea[aria-label="学习记录 JSON 备份"]').element.value).toBe('');
      expect(picker.isConnected).toBe(false);
      expect(hiddenPicker.isConnected).toBe(false);
      expect(p.store.state.events).toHaveLength(0);
      expect(uni.getStorageSync(guestKey)).toEqual(guestOriginal);
    } finally {
      read.mockRestore();
      p.close();
    }
  });
});
describe('备份预览的输入和页面边界', () => {
  function page() {
    const store = useConversationLearningStore();
    store.start('12 + 8');
    const wrapper = mount(LearningPage, { global: { stubs } });
    const button = (name) => wrapper.findAll('button').find((item) => matchesLearningControl(item, name.trim()));
    const open = async () => {
      await openLearningSettings(wrapper);
      await button(t('learning.ksr')).trigger('tap');
      await button(t('learning.k61')).trigger('tap');
    };
    const preview = () => ({
      owner: store.state.owner,
      expectedRevision: store.state.revision,
      imported: 13,
      reused: 0,
      pendingReferences: 0,
      pendingReviews: 0
    });
    return { store, wrapper, button, open, preview };
  }
  it.each(['zh-CN', 'en'])(
    'S41 ambiguous-backup notice renders once and keeps input/confirmation boundaries in %s',
    async (language) => {
      setLanguage(language);
      const p = page(),
        original = '原样保留的旧备份输入';
      const failure = Object.assign(
        new Error('这份旧备份缺少当时确认的考试范围，请使用完整记录或重新导出；当前记录保留'),
        { code: 'MISSING_INTAKE_SCOPE' }
      );
      const prepare = vi.spyOn(p.store, 'previewRestore').mockRejectedValueOnce(failure);
      const before = JSON.stringify(p.store.state);
      try {
        await p.open();
        const input = p.wrapper.get(`textarea[aria-label="${t('learning.kny')}"]`);
        await input.setValue(original);
        await p.button(t('learning.k1d')).trigger('tap');
        await flushPromises();
        const status = p.wrapper.get('[data-test="record-preview-status"]');
        expect(status.attributes('role')).toBe('alert');
        expect(status.text()).toContain(t('ui.backupScopeSnapshotRequired'));
        expect(status.text()).not.toContain(t('ui.backupScopeSnapshotRequired') + ' 当前记录保留。');
        if (language === 'en') expect(status.text()).not.toContain('当前记录保留');
        expect(input.element.value).toBe(original);
        expect(prepare).toHaveBeenCalledExactlyOnceWith(original);
        expect(p.button(t('learning.k7h'))).toBeUndefined();
        expect(JSON.stringify(p.store.state)).toBe(before);
      } finally {
        p.wrapper.unmount();
        p.store.$dispose();
        prepare.mockRestore();
        setLanguage('zh-CN');
      }
    }
  );
  it('校验期间禁用重复请求，输入改回原文也不能接纳旧结果；明确重试才显示新预览', async () => {
    const p = page();
    let finish;
    const prepare = vi
      .spyOn(p.store, 'previewRestore')
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const cancel = vi.spyOn(p.store, 'cancelHistory');
    try {
      await p.open();
      const input = p.wrapper.get('textarea[aria-label="学习记录 JSON 备份"]');
      await input.setValue('备份 A');
      await p.button('校验并预览').trigger('tap');
      expect(p.button('校验并预览').attributes('disabled')).toBeDefined();
      await p.button('校验并预览').trigger('tap');
      expect(prepare).toHaveBeenCalledTimes(1);
      await input.setValue('备份 B');
      await input.setValue('备份 A');
      finish(p.preview());
      await flushPromises();
      expect(cancel).toHaveBeenCalled();
      expect(p.wrapper.text()).not.toContain('新增 13 个操作');
      expect(p.button('确认合并记录')).toBeUndefined();
      prepare.mockResolvedValueOnce(p.preview());
      await p.button('校验并预览').trigger('tap');
      await flushPromises();
      expect(p.wrapper.text()).toContain('新增 13 个操作');
      expect(prepare).toHaveBeenCalledTimes(2);
    } finally {
      p.wrapper.unmount();
      p.store.$dispose();
      prepare.mockRestore();
      cancel.mockRestore();
    }
  });
  it('取消后迟到成功不恢复确认；原输入保留，下一次校验可继续', async () => {
    const p = page();
    let finish;
    const prepare = vi
      .spyOn(p.store, 'previewRestore')
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    try {
      await p.open();
      const input = p.wrapper.get('textarea[aria-label="学习记录 JSON 备份"]');
      await input.setValue('尚未合并的备份');
      await p.button('校验并预览').trigger('tap');
      await p.button('取消历史校验').trigger('tap');
      finish(p.preview());
      await flushPromises();
      expect(p.wrapper.get('[data-test="record-preview-status"]').text()).toContain('已取消');
      expect(input.element.value).toBe('尚未合并的备份');
      expect(p.button('确认合并记录')).toBeUndefined();
      prepare.mockResolvedValueOnce(p.preview());
      await p.button('校验并预览').trigger('tap');
      await flushPromises();
      expect(p.button('确认合并记录')).toBeDefined();
    } finally {
      p.wrapper.unmount();
      p.store.$dispose();
      prepare.mockRestore();
    }
  });
  it('离开后返回拒绝迟到失败，不把旧错误写入新页面；历史任务请求取消', async () => {
    const p = page();
    let fail;
    const prepare = vi
      .spyOn(p.store, 'previewRestore')
      .mockImplementationOnce(() => new Promise((_resolve, reject) => (fail = reject)));
    const cancel = vi.spyOn(p.store, 'cancelHistory');
    try {
      await p.open();
      await p.wrapper.get('textarea[aria-label="学习记录 JSON 备份"]').setValue('备份 A');
      await p.button('校验并预览').trigger('tap');
      for (const hide of loadHooks.hideCallbacks) hide();
      for (const show of loadHooks.showCallbacks) show();
      fail(new Error('旧页面迟到校验失败'));
      await flushPromises();
      expect(cancel).toHaveBeenCalled();
      expect(p.wrapper.text()).not.toContain('旧页面迟到校验失败');
      expect(p.button('确认合并记录')).toBeUndefined();
    } finally {
      p.wrapper.unmount();
      p.store.$dispose();
      prepare.mockRestore();
      cancel.mockRestore();
    }
  });
  it('实际错误就近说明且保留原输入，空白禁用，不自动重试', async () => {
    const p = page();
    const prepare = vi.spyOn(p.store, 'previewRestore');
    try {
      await p.open();
      expect(p.button('校验并预览').attributes('disabled')).toBeDefined();
      const input = p.wrapper.get('textarea[aria-label="学习记录 JSON 备份"]');
      await input.setValue('{');
      await p.button('校验并预览').trigger('tap');
      await flushPromises();
      const status = p.wrapper.get('[data-test="record-preview-status"]');
      expect(status.attributes('role')).toBe('alert');
      expect(status.text()).toContain('JSON');
      expect(input.element.value).toBe('{');
      expect(prepare).toHaveBeenCalledTimes(1);
      expect(p.store.state.attempts).toHaveLength(0);
    } finally {
      p.wrapper.unmount();
      p.store.$dispose();
      prepare.mockRestore();
    }
  });
  it.each([856845, 1500001])(
    '大备份 %i 字符不常驻渲染整段正文，仍完整校验；明确清除恢复输入并拒绝旧结果',
    async (characters) => {
      const p = page();
      let finish;
      const prepare = vi
        .spyOn(p.store, 'previewRestore')
        .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
      const content = JSON.stringify({ fixture: '学'.repeat(characters) });
      try {
        await p.open();
        await p.wrapper.get('textarea[aria-label="学习记录 JSON 备份"]').setValue(content);
        expect(p.wrapper.find('textarea[aria-label="学习记录 JSON 备份"]').exists()).toBe(false);
        expect(p.wrapper.get('[data-test="record-large-backup"]').text()).toContain(String(content.length));
        expect(p.wrapper.get('[data-test="record-large-backup"]').text()).not.toContain('学学学');
        await p.button('展开完整正文').trigger('tap');
        expect(p.wrapper.get('textarea[aria-label="学习记录 JSON 备份"]').element.value).toBe(content);
        await p.button('收起正文').trigger('tap');
        expect(p.wrapper.find('textarea[aria-label="学习记录 JSON 备份"]').exists()).toBe(false);
        await p.button('校验并预览').trigger('tap');
        expect(prepare).toHaveBeenCalledExactlyOnceWith(content);
        await p.button('清除并重新粘贴').trigger('tap');
        finish(p.preview());
        await flushPromises();
        expect(p.wrapper.get('textarea[aria-label="学习记录 JSON 备份"]').element.value).toBe('');
        expect(p.button('确认合并记录')).toBeUndefined();
        expect(p.store.state.attempts).toHaveLength(0);
      } finally {
        p.wrapper.unmount();
        p.store.$dispose();
        prepare.mockRestore();
      }
    }
  );
  it('预览后学习记录改变立即撤销旧确认，保留备份正文', async () => {
    const p = page();
    const prepare = vi.spyOn(p.store, 'previewRestore').mockResolvedValueOnce(p.preview());
    try {
      await p.open();
      const input = p.wrapper.get('textarea[aria-label="学习记录 JSON 备份"]');
      await input.setValue('合成备份正文');
      await p.button('校验并预览').trigger('tap');
      await flushPromises();
      expect(p.button('确认合并记录')).toBeDefined();
      p.store.submit('19', true, 'restore-preview-new-attempt');
      await flushPromises();
      expect(p.button('确认合并记录')).toBeUndefined();
      expect(input.element.value).toBe('合成备份正文');
      expect(p.store.state.attempts[0].answer).toBe('19');
    } finally {
      p.wrapper.unmount();
      p.store.$dispose();
      prepare.mockRestore();
    }
  });
});
describe('模型读取的页内状态与离开保护', () => {
  function page() {
    storageService.saveLoginSession({ userId: 'ui-model-read-owner', token: 'fixture-only-token', userInfo: {} });
    const requests = [];
    const transport = vi.spyOn(uni, 'request').mockImplementation((options) => {
      const abort = vi.fn();
      requests.push({ ...options, abort });
      return { abort };
    });
    const store = useConversationLearningStore();
    const wrapper = mount(LearningPage, { global: { stubs } });
    for (const load of loadHooks.callbacks) load({ panel: 'connections' });
    return { requests, transport, store, wrapper };
  }
  it('未读取后端也可选正确端点，切换预设清除旧密钥、能力与保存同意；选择只改草稿', async () => {
    const { requests, transport, store, wrapper } = page();
    const button = (text) => wrapper.findAll('button').find((item) => item.text().trim() === text);
    try {
      await flushPromises();
      await button(t('learning.k9r')).trigger('tap');
      const before = store.exportData();
      await button('智谱 · glm-4.7-flash').trigger('tap');
      const endpoint = wrapper.get(`input[aria-label="${t('learning.kk4')}"]`);
      expect(endpoint.element.value).toBe('https://open.bigmodel.cn/api/paas/v4/chat/completions');
      const key = wrapper.get(`input[aria-label="${t('learning.kba')}"]`);
      await key.setValue('synthetic-key-for-first-provider');
      const checkbox = (label) =>
        wrapper
          .findAll('[role="checkbox"]')
          .find((item) => item.text().replace(/\s+/g, ' ').trim() === label.replace(/\s+/g, ' ').trim());
      expect(checkbox(t('learning.keh')).attributes('aria-checked')).toBe('true'); // the current Zhipu preset opts into streaming
      await checkbox(t('learning.keh')).trigger('tap');
      expect(checkbox(t('learning.keh')).attributes('aria-checked')).toBe('false');
      for (const label of ['learning.kke', 'learning.k32']) {
        await checkbox(t(label)).trigger('tap');
        expect(checkbox(t(label)).attributes('aria-checked')).toBe('true');
      }
      expect(button('Groq · openai/gpt-oss-20b')).toBeUndefined(); // unsaved overseas templates are not current choices
      await button('DeepSeek · deepseek-flash').trigger('tap');
      expect(key.element.value).toBe('');
      for (const label of ['learning.keh', 'learning.kke', 'learning.k32']) {
        expect(checkbox(t(label)).attributes('aria-checked')).toBe('false');
      }
      expect(endpoint.element.value).toBe('https://api.deepseek.com/chat/completions');
      await endpoint.setValue('https://api.deepseek.com/');
      await endpoint.trigger('blur');
      expect(endpoint.element.value).toBe('https://api.deepseek.com/chat/completions');
      expect(store.exportData()).toBe(before);
      expect(requests).toEqual([]);
    } finally {
      wrapper.unmount();
      store.$dispose();
      transport.mockRestore();
    }
  });
  it('真实请求期间禁用重复读取，可取消；错误、明确重试与空列表在操作旁显示', async () => {
    const { requests, transport, store, wrapper } = page();
    const view = () => wrapper.findAll('button').find((button) => button.text().trim() === '查看云模型');
    try {
      await flushPromises();
      await view().trigger('tap');
      const status = wrapper.get('[data-test="model-list-status"]');
      expect(status.attributes('role')).toBe('status');
      expect(status.text()).toContain('正在读取');
      expect(wrapper.get('[data-test="model-list-read"]').attributes('disabled')).toBeDefined();
      requests[0].fail({});
      await flushPromises();
      expect(wrapper.get('[data-test="model-list-status"]').attributes('role')).toBe('alert');
      expect(wrapper.get('[data-test="model-list-status"]').text()).toContain('服务连接不可用');
      await wrapper
        .findAll('button')
        .find((button) => button.text().trim() === '重试云模型列表')
        .trigger('tap');
      expect(requests).toHaveLength(2);
      requests[1].success({ data: { success: true, data: { models: [], presets: [] } } });
      await flushPromises();
      expect(wrapper.get('[data-test="model-list-status"]').text()).toContain('当前没有可选云模型');
      expect(store.selectedMode).toBe('offline');
      expect(store.sharingAllowed).toBe(false);
      expect(requests.every((request) => request.data.action === 'list')).toBe(true);
    } finally {
      wrapper.unmount();
      store.$dispose();
      transport.mockRestore();
    }
  });
  it('列表和用量分别显示等待；取消列表不影响用量，错误用量提供明确重试', async () => {
    const { requests, transport, store, wrapper } = page();
    try {
      await flushPromises();
      await wrapper
        .findAll('button')
        .find((button) => button.text().trim() === '查看云模型')
        .trigger('tap');
      await wrapper
        .findAll('button')
        .find((button) => button.text().trim() === '查看模型用量')
        .trigger('tap');
      await wrapper
        .findAll('button')
        .find((button) => button.text().trim() === '取消列表读取')
        .trigger('tap');
      await flushPromises();
      expect(wrapper.get('[data-test="model-list-status"]').text()).toContain('已取消读取');
      expect(wrapper.get('[data-test="model-usage-status"]').text()).toContain('正在读取');
      requests[1].fail({});
      await flushPromises();
      expect(wrapper.get('[data-test="model-usage-status"]').attributes('role')).toBe('alert');
      expect(wrapper.findAll('button').some((button) => button.text().trim() === '重试模型用量')).toBe(true);
      expect(wrapper.findAll('.feedback').some((entry) => entry.text().includes('取消'))).toBe(false);
    } finally {
      wrapper.unmount();
      store.$dispose();
      transport.mockRestore();
    }
  });
  it('隐藏页面立即终止两种读取；迟到失败不进入页底反馈或泄露结果', async () => {
    const { requests, transport, store, wrapper } = page();
    try {
      await flushPromises();
      await wrapper
        .findAll('button')
        .find((button) => button.text().trim() === '查看云模型')
        .trigger('tap');
      await wrapper
        .findAll('button')
        .find((button) => button.text().trim() === '查看模型用量')
        .trigger('tap');
      for (const hide of loadHooks.hideCallbacks) hide();
      expect(requests.every((request) => request.abort.mock.calls.length === 1)).toBe(true);
      requests[0].success({ data: { success: false, message: '旧页面迟到错误' } });
      requests[1].success({ data: { success: true, data: { entitlement: { week: 'old-owner' } } } });
      await flushPromises();
      expect(wrapper.text()).not.toContain('旧页面迟到错误');
      expect(wrapper.text()).not.toContain('old-owner');
      expect(store.usage).toBeNull();
      expect(store.models).toEqual([]);
    } finally {
      wrapper.unmount();
      store.$dispose();
      transport.mockRestore();
    }
  });
  it('桌面窗口暂时隐藏时保留在途带练，离开学习页仍取消并清除共享', async () => {
    vi.stubGlobal('__YOZI_DESKTOP__', true);
    const native = Object.getOwnPropertyDescriptor(window, '__TAURI_INTERNALS__');
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: { invoke: vi.fn() } });
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const oldUrl = location.href;
    history.replaceState(null, '', '#/pages/learning/index');
    const { transport, store, wrapper } = page();
    const cancel = vi.spyOn(store, 'cancel');
    try {
      await flushPromises();
      store.sharingAllowed = true;
      store.busy = true;
      store.reply = { kind: 'coach', pending: true };
      loadHooks.hideCallbacks.at(-1)();
      expect(cancel).not.toHaveBeenCalled();
      expect(store.sharingAllowed).toBe(true);
      history.replaceState(null, '', '#/pages/profile/index');
      loadHooks.hideCallbacks.at(-1)();
      expect(cancel).toHaveBeenCalledOnce();
      expect(store.sharingAllowed).toBe(false);
    } finally {
      wrapper.unmount();
      store.$dispose();
      cancel.mockRestore();
      transport.mockRestore();
      visibility.mockRestore();
      history.replaceState(null, '', oldUrl);
      if (native) Object.defineProperty(window, '__TAURI_INTERNALS__', native);
      else delete window.__TAURI_INTERNALS__;
      vi.unstubAllGlobals();
    }
  });
  it('未登录就近提供登录入口，记录返回模型面板的位置且不发起模型请求', async () => {
    const { requests, transport, store, wrapper } = page();
    try {
      storageService.remove('EXAM_TOKEN', true);
      await flushPromises();
      await wrapper
        .findAll('button')
        .find((button) => button.text().trim() === '查看云模型')
        .trigger('tap');
      await flushPromises();
      expect(wrapper.get('[data-test="model-list-status"]').text()).toContain('登录后');
      await wrapper
        .findAll('button')
        .find((button) => button.text().trim() === '前往登录')
        .trigger('tap');
      expect(storageService.get('redirect_after_login')).toBe('/pages/learning/index?panel=connections');
      expect(uni.navigateTo).toHaveBeenCalledWith(expect.objectContaining({ url: '/pages/login/index' }));
      expect(requests).toHaveLength(0);
    } finally {
      wrapper.unmount();
      store.$dispose();
      transport.mockRestore();
    }
  });
});
describe('错题概览的判分争议输入', () => {
  function overview() {
    const store = useConversationLearningStore();
    store.start('12 + 8');
    store.submit('19', true, 'overview-dispute-original');
    const attemptId = store.state.attempts[0].id;
    const wrapper = mount(LearningOverview, {
      props: { initialExpanded: true, view: 'mistake', showNavigation: false },
      global: {
        stubs: {
          ...stubs,
          LearningOverview: false,
          WdPopup: { props: ['modelValue'], template: '<div v-if="modelValue"><slot /></div>' }
        }
      }
    });
    const open = () =>
      wrapper
        .findAll('button')
        .find((button) => button.text().trim() === '这次判分有误')
        .trigger('tap');
    return { store, attemptId, wrapper, open };
  }
  it('复用真实输入组件；取消保留原判分，明确确认仅一次记录完整争议并转为待核对', async () => {
    const { store, attemptId, wrapper, open } = overview();
    try {
      await open();
      let modal = wrapper.getComponent(CustomModal);
      expect(uni.showModal).not.toHaveBeenCalled();
      expect(modal.props('editable')).toBe(true);
      expect(modal.props('title')).toBe('纠正判分');
      expect(modal.get('.confirm-btn').attributes('disabled')).toBeDefined();
      await modal.get('textarea').setValue('尚未提交的争议');
      await modal.get('.cancel-btn').trigger('tap');
      await flushPromises();
      expect(store.summary.first).toMatchObject({ numerator: 1, denominator: 1 });
      expect(store.state.events.some((event) => event.type === 'assessment.correct')).toBe(false);
      await open();
      modal = wrapper.getComponent(CustomModal);
      expect(modal.get('textarea').element.value).toBe('');
      const reason = '请核对原题条件和原答。\n'.repeat(30);
      await modal.get('textarea').setValue(reason);
      const old = wrapper.vm.dialogState;
      await modal.get('.confirm-btn').trigger('tap');
      old.confirm('重复或迟到输入');
      await flushPromises();
      const corrections = store.state.events.filter((event) => event.type === 'assessment.correct');
      expect(corrections).toHaveLength(1);
      expect(corrections[0].data).toMatchObject({ attemptId, reason, outcome: null });
      expect(store.state.attempts[0].answer).toBe('19');
      expect(store.summary.first).toMatchObject({ numerator: 0, denominator: 0 });
      expect(store.summary.pending).toBe(1);
      expect(wrapper.get('[data-test="assessment-feedback"]').attributes('role')).toBe('status');
      expect(wrapper.text()).toContain('等待有依据的核对');
    } finally {
      wrapper.unmount();
      store.$dispose();
    }
  });
  it('保存失败不宣称撤销，重新打开可接续完整输入，成功后才清空草稿', async () => {
    const { store, wrapper, open } = overview();
    const corrected = vi.spyOn(store, 'correctAssessment').mockImplementationOnce(() => {
      throw new Error('本机暂不可写，请稍后重试');
    });
    try {
      await open();
      const reason = '本次争议尚未保存。\n第二行原文与核对依据。';
      let modal = wrapper.getComponent(CustomModal);
      await modal.get('textarea').setValue(reason);
      await modal.get('.confirm-btn').trigger('tap');
      await flushPromises();
      expect(wrapper.get('[data-test="assessment-feedback"]').attributes('role')).toBe('alert');
      expect(wrapper.text()).toContain('本机暂不可写');
      expect(wrapper.text()).not.toContain('已撤销可靠结论');
      expect(store.summary.first).toMatchObject({ numerator: 1, denominator: 1 });
      await open();
      modal = wrapper.getComponent(CustomModal);
      expect(modal.get('textarea').element.value).toBe(reason);
      await modal.get('.confirm-btn').trigger('tap');
      await flushPromises();
      expect(store.summary.pending).toBe(1);
      expect(corrected).toHaveBeenCalledTimes(2);
      expect(wrapper.get('[data-test="assessment-feedback"]').attributes('role')).toBe('status');
    } finally {
      corrected.mockRestore();
      wrapper.unmount();
      store.$dispose();
    }
  });
  it('争议已落盘而后续步骤失败时，不错误宣称说明尚未保存', async () => {
    const { store, wrapper, open } = overview();
    const correct = store.correctAssessment;
    const corrected = vi.spyOn(store, 'correctAssessment').mockImplementationOnce((id, reason) => {
      correct(id, reason);
      throw new Error('复习安排更新未确认，请核对当前记录');
    });
    try {
      await open();
      const modal = wrapper.getComponent(CustomModal);
      await modal.get('textarea').setValue('实际已保存的争议');
      await modal.get('.confirm-btn').trigger('tap');
      await flushPromises();
      expect(store.summary.pending).toBe(1);
      expect(store.state.events.filter((event) => event.type === 'assessment.correct')).toHaveLength(1);
      expect(wrapper.get('[data-test="assessment-feedback"]').attributes('role')).toBe('alert');
      expect(wrapper.text()).toContain('复习安排更新未确认');
      expect(wrapper.text()).not.toContain('说明尚未保存');
    } finally {
      corrected.mockRestore();
      wrapper.unmount();
      store.$dispose();
    }
  });
  it.each(['owner-return', 'records'])('保存失败的草稿在%s后清除，不流入同标识作答', async (kind) => {
    const { store, wrapper, open } = overview();
    const corrected = vi.spyOn(store, 'correctAssessment').mockImplementationOnce(() => {
      throw new Error('本机暂不可写');
    });
    try {
      await open();
      const modal = wrapper.getComponent(CustomModal);
      await modal.get('textarea').setValue('失效账户或记录的私人争议草稿');
      await modal.get('.confirm-btn').trigger('tap');
      await flushPromises();
      if (kind === 'owner-return') {
        uni.setStorageSync('EXAM_USER_ID', 'synthetic-overview-other-owner');
        store.refresh();
        uni.removeStorageSync('EXAM_USER_ID');
        store.refresh();
      } else {
        store.deleteData();
        store.start('12 + 8');
        store.submit('19', true, 'overview-dispute-original');
      }
      await open();
      expect(wrapper.getComponent(CustomModal).get('textarea').element.value).toBe('');
      expect(wrapper.text()).not.toContain('本机暂不可写');
      expect(corrected).toHaveBeenCalledOnce();
    } finally {
      corrected.mockRestore();
      wrapper.unmount();
      store.$dispose();
    }
  });
  it.each(['owner', 'owner-return', 'records', 'grade', 'hide', 'back', 'unmount'])(
    '%s 后旧确认不写入，新账户/重建同标识作答也不能接收旧争议',
    async (kind) => {
      const { store, attemptId, wrapper, open } = overview();
      const corrected = vi.spyOn(store, 'correctAssessment');
      let unmounted = false;
      try {
        await open();
        const old = wrapper.vm.dialogState;
        if (kind === 'owner' || kind === 'owner-return') {
          uni.setStorageSync('EXAM_USER_ID', 'synthetic-overview-other-owner');
          store.refresh();
          if (kind === 'owner-return') {
            uni.removeStorageSync('EXAM_USER_ID');
            store.refresh();
          }
        } else if (kind === 'records') {
          store.deleteData();
          store.start('12 + 8');
          store.submit('19', true, 'overview-dispute-original');
          expect(store.state.attempts[0].id).toBe(attemptId);
        } else if (kind === 'grade') {
          store.correctAssessment(attemptId, '其他已完成的明确争议');
          corrected.mockClear();
        } else if (kind === 'hide') {
          loadHooks.hideCallbacks.at(-1)();
          loadHooks.showCallbacks.at(-1)();
        } else if (kind === 'back') {
          expect(loadHooks.backCallbacks.at(-1)()).toBe(true);
        } else {
          wrapper.unmount();
          unmounted = true;
        }
        old.confirm('已失效的私人争议输入');
        await flushPromises();
        expect(corrected).not.toHaveBeenCalled();
        expect(store.state.events.some((event) => event.data?.reason === '已失效的私人争议输入')).toBe(false);
        if (!unmounted) {
          expect(wrapper.getComponent(CustomModal).props('visible')).toBe(false);
          if (kind === 'hide' || kind === 'back' || kind === 'owner-return' || kind === 'records') {
            await open();
            expect(wrapper.getComponent(CustomModal).props('visible')).toBe(true);
            expect(wrapper.getComponent(CustomModal).get('textarea').element.value).toBe('');
          }
        }
      } finally {
        corrected.mockRestore();
        if (!unmounted) wrapper.unmount();
        store.$dispose();
      }
    }
  );
});
describe('学习空间的实际入口与目录', () => {
  function dialogPage() {
    const wrapper = mount(LearningPage, {
      global: {
        stubs: {
          ...stubs,
          LearningShell: { template: '<div><slot /><slot name="controls" /><slot name="composer" /></div>' },
          NumberLine: true,
          WdPopup: { props: ['modelValue'], template: '<div v-if="modelValue"><slot /></div>' }
        }
      }
    });
    const button = (label) => wrapper.findAll('button').find((node) => matchesLearningControl(node, label));
    return { wrapper, button };
  }
  it('资料空状态、禁用与写入失败在操作附近展示，重试成功才清空正文', async () => {
    const store = useConversationLearningStore();
    const { wrapper, button } = dialogPage();
    let save;
    try {
      wrapper.vm.showMaterial = true;
      await flushPromises();
      expect(wrapper.get('[data-test="material-empty"]').text()).toContain('暂无资料');
      expect(button('保存文字').attributes('disabled')).toBeDefined();
      const field = wrapper.get('textarea[aria-label="粘贴的私人资料"]');
      await field.setValue(' \n ');
      expect(button('保存文字').attributes('disabled')).toBeDefined();
      const content = '2024: 80\n2025: 100';
      await field.setValue(content);
      save = vi.spyOn(store, 'importText').mockImplementationOnce(() => {
        throw new Error('本机暂不可写，请保留原文后重试');
      });
      await button('保存文字').trigger('tap');
      await flushPromises();
      expect(wrapper.get('[data-test="material-feedback"]').attributes('role')).toBe('alert');
      expect(wrapper.get('[data-test="material-feedback"]').text()).toContain('保留原文');
      expect(field.element.value).toBe(content);
      expect(wrapper.find('.feedback').exists()).toBe(false);
      await button('保存文字').trigger('tap');
      await flushPromises();
      expect(store.state.materials).toHaveLength(1);
      expect(field.element.value).toBe('');
      expect(wrapper.get('[data-test="material-feedback"]').attributes('role')).toBe('status');
      expect(wrapper.get('[data-test="material-feedback"]').text()).toContain('资料已保存到本设备');
      expect(wrapper.find('[data-test="material-empty"]').exists()).toBe(false);
    } finally {
      save?.mockRestore();
      wrapper.unmount();
      store.$dispose();
    }
  });
  it('实际页面检查等待、取消、同目标重试复用仅在内存的令牌且不上传正文', async () => {
    const store = useConversationLearningStore();
    const { wrapper, button } = dialogPage();
    const calls = [];
    let resolve;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, options) => {
        calls.push(options);
        return new Promise((r, reject) => {
          resolve = r;
          options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), {
            once: true
          });
        });
      })
    );
    try {
      wrapper.vm.showMaterial = true;
      await flushPromises();
      await button('解析设置').trigger('tap');
      await wrapper.get('input[aria-label="资料识别服务令牌"]').setValue('TEST_ONLY_MATERIAL_UI_TOKEN_32_CHARS');
      await button('授权并连接').trigger('tap');
      await flushPromises();
      expect(wrapper.find('[data-test="material-connection-pending"]').exists()).toBe(true);
      expect(button('连接中').attributes('disabled')).toBeDefined();
      expect(button('选择 PDF / 作答图片').attributes('disabled')).toBeDefined();
      await button('取消连接检查').trigger('tap');
      await flushPromises();
      expect(store.materialConnectionBusy).toBe(false);
      expect(wrapper.get('[data-test="material-feedback"]').text()).toContain('取消');
      expect(wrapper.get('input[aria-label="资料识别服务令牌"]').element.value).toBe('');
      await button('授权并连接').trigger('tap');
      resolve({
        ok: true,
        text: async () =>
          JSON.stringify({ success: true, data: { version: 'isolated-ui-parser', pdfText: true, pagePreview: true } })
      });
      await flushPromises();
      expect(store.materialConnection.status).toBe('connector_verified');
      expect(wrapper.get('[data-test="material-feedback"]').text()).toContain('尚未发送资料');
      expect(calls).toHaveLength(2);
      expect(calls.every((call) => call.body === '{}')).toBe(true);
      expect(calls[0].headers.Authorization).toBe(calls[1].headers.Authorization);
      expect(store.state.materials).toHaveLength(0);
      await button('授权并连接').trigger('tap');
      resolve({ ok: false, text: async () => JSON.stringify({ success: false, message: '拒绝' }) });
      await flushPromises();
      expect(store.materialConnection.status).toBeUndefined();
      expect(wrapper.get('[data-test="material-feedback"]').attributes('role')).toBe('alert');
      expect(wrapper.get('[data-test="material-feedback"]').text()).toContain('请核对地址、访问令牌');
      expect(wrapper.get('[data-test="material-feedback"]').text()).toContain('尚未发送资料');
      expect(calls).toHaveLength(3);
      expect(calls.every((call) => call.body === '{}')).toBe(true);
    } finally {
      wrapper.unmount();
      store.$dispose();
      vi.unstubAllGlobals();
    }
  });
  it('真实提示输入组件提交完整正文一次，切换对话后旧输入不得写到新对话', async () => {
    const store = useConversationLearningStore();
    store.start('12 + 8');
    const conversationId = store.active.id;
    const { wrapper, button } = dialogPage();
    try {
      await openLearningSettings(wrapper);
      await button('记录使用的提示').trigger('tap');
      const modal = wrapper.getComponent(CustomModal);
      expect(modal.props('editable')).toBe(true);
      expect(modal.get('.confirm-btn').attributes('disabled')).toBeDefined();
      const content = '先拆分个位与十位。\n'.repeat(20);
      await modal.get('textarea').setValue(content);
      await modal.get('.confirm-btn').trigger('tap');
      await flushPromises();
      const hints = store.state.events.filter((event) => event.type === 'hint.add');
      expect(hints).toHaveLength(1);
      expect(hints[0].data).toMatchObject({ conversationId, content });
      await openLearningSettings(wrapper);
      await button('记录使用的提示').trigger('tap');
      const old = wrapper.vm.dialogState;
      store.start('7 + 9');
      old.confirm('旧对话未提交的输入');
      await flushPromises();
      expect(store.state.events.filter((event) => event.type === 'hint.add')).toHaveLength(1);
    } finally {
      wrapper.unmount();
    }
  });
  it('题干预填、取消保留原件，确认创建新版本且保留原版', async () => {
    const store = useConversationLearningStore();
    store.start('12 + 8');
    const original = { ...store.activeQuestion };
    const { wrapper, button } = dialogPage();
    try {
      await openLearningSettings(wrapper);
      await button('校对题目').trigger('tap');
      let modal = wrapper.getComponent(CustomModal);
      expect(modal.get('textarea').element.value).toBe(original.prompt);
      await modal.get('textarea').setValue('尚未保存的校对');
      await modal.get('.cancel-btn').trigger('tap');
      await flushPromises();
      expect(store.activeQuestion.prompt).toBe(original.prompt);
      await openLearningSettings(wrapper);
      await button('校对题目').trigger('tap');
      modal = wrapper.getComponent(CustomModal);
      const prompt = '12 + 8 等于多少？\n请写出计算过程。';
      await modal.get('textarea').setValue(prompt);
      await modal.get('.confirm-btn').trigger('tap');
      await flushPromises();
      expect(store.activeQuestion.prompt).toBe(prompt);
      expect(store.activeQuestion.version).toBe(original.version + 1);
      expect(store.state.questions.find((q) => q.version === original.version).prompt).toBe(original.prompt);
    } finally {
      wrapper.unmount();
    }
  });
  it('同一对话切换题目后，旧提示不能记到新题', async () => {
    const store = useConversationLearningStore();
    store.start('12 + 8');
    const conversationId = store.active.id;
    const { wrapper, button } = dialogPage();
    try {
      await openLearningSettings(wrapper);
      await button('记录使用的提示').trigger('tap');
      const old = wrapper.vm.dialogState;
      store.correctQuestion(store.activeQuestion, { prompt: '另一版题干', uncertainties: [] }, '合成题目版本切换');
      expect(store.active.id).toBe(conversationId);
      old.confirm('上一题未提交的提示');
      await flushPromises();
      expect(store.state.events.some((event) => event.type === 'hint.add')).toBe(false);
      expect(wrapper.getComponent(CustomModal).props('visible')).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });
  it.each(['hide', 'back'])('页面%s取消编辑，迟到确认不落盘并可再次打开', async (kind) => {
    const store = useConversationLearningStore();
    store.start('12 + 8');
    const { wrapper, button } = dialogPage();
    try {
      await openLearningSettings(wrapper);
      await button('记录使用的提示').trigger('tap');
      const old = wrapper.vm.dialogState;
      if (kind === 'hide') {
        loadHooks.hideCallbacks.at(-1)();
        loadHooks.showCallbacks.at(-1)();
      } else {
        expect(loadHooks.backCallbacks.at(-1)()).toBe(true);
      }
      old.confirm('迟到输入');
      await flushPromises();
      expect(wrapper.getComponent(CustomModal).props('visible')).toBe(false);
      expect(store.state.events.some((event) => event.type === 'hint.add')).toBe(false);
      await openLearningSettings(wrapper);
      await button('记录使用的提示').trigger('tap');
      expect(wrapper.getComponent(CustomModal).props('visible')).toBe(true);
    } finally {
      wrapper.unmount();
    }
  });
  it('统一偏好优先于旧运行时值，显式浅色不会被系统深色覆盖', () => {
    const theme = useThemeStore();
    uni.setStorageSync('theme_mode', 'light');
    const readPreference = vi.spyOn(storageService, 'get').mockImplementationOnce(() => 'dark');
    const context = {
      $pinia: getActivePinia(),
      globalData: {},
      updateNavigationBarColor: vi.fn(),
      switchTheme: App.methods.switchTheme
    };
    try {
      App.onShow.call(context);
      expect(theme.isDark).toBe(true);
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      applyTheme('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(document.documentElement.style.getPropertyValue('--bg-card')).toBe('');
    } finally {
      readPreference.mockRestore();
    }
  });
  it('应用重开将保存的主题恢复到共享状态，避免只有全局颜色改变', () => {
    const theme = useThemeStore();
    uni.setStorageSync('theme_mode', 'dark');
    const context = {
      $pinia: getActivePinia(),
      globalData: {},
      updateNavigationBarColor: vi.fn(),
      switchTheme: App.methods.switchTheme
    };
    App.onShow.call(context);
    expect(theme.isDark).toBe(true);
    expect(context.globalData.currentTheme).toBe('dark');
    expect(context.globalData.isDarkMode).toBe(true);
    uni.setStorageSync('theme_mode', 'light');
    App.onShow.call(context);
    expect(theme.isDark).toBe(false);
  });
  it('账户与抽屉导航在重开和切换时共用当前主题，不依赖旧偏好缓存', async () => {
    const theme = useThemeStore();
    theme.setDarkMode(true);
    const wrapper = mount(ProfilePage, {
      global: { stubs: { ...stubs, image: true } }
    });
    expect(wrapper.get('.learning-space').classes()).toContain('space-dark');
    expect(wrapper.get('.settings-sidebar').element.closest('.space-dark')).toBe(
      wrapper.get('.learning-space').element
    );
    expect(wrapper.find('.mobile-dock').exists()).toBe(false);
    theme.setDarkMode(false);
    await flushPromises();
    expect(wrapper.get('.learning-space').classes()).toContain('space-light');
    expect(wrapper.get('.settings-sidebar').element.closest('.space-dark')).toBeNull();
    wrapper.unmount();
  });
  it('关闭设置返回登录页之前已经打开的学习页', async () => {
    const wrapper = mount(ProfilePage, { global: { stubs: { ...stubs, image: true } } });
    try {
      await flushPromises();
      globalThis.getCurrentPages.mockReturnValueOnce([
        { route: 'pages/learning/index' },
        { route: 'pages/login/index' },
        { route: 'pages/profile/index' }
      ]);
      uni.navigateBack.mockClear();
      uni.navigateTo.mockClear();
      await wrapper.get('.settings-back').trigger('tap');
      expect(uni.navigateBack).toHaveBeenCalledWith(expect.objectContaining({ delta: 2 }));
      expect(uni.navigateTo).not.toHaveBeenCalled();
    } finally {
      wrapper.unmount();
    }
  });
  it('账户导航到共享统计后沿原答更新概览，旧题库数据保留独立口径', async () => {
    const store = useConversationLearningStore();
    store.start('12 + 8');
    store.submit('19', true, 'profile-first');
    const legacy = useStudyStore();
    legacy.studyProgress.completedQuestions = 7;
    const wrapper = mount(ProfilePage, {
      global: { stubs: { ...stubs, LearningOverview: false, CustomTabbar: true, image: true } }
    });
    await openSettingsSection(wrapper, '数据控制');
    expect(wrapper.find('.learning-overview').exists()).toBe(false);
    expect(wrapper.text()).toContain('历史题库记录');
    expect(wrapper.find('.stats-card').text()).toContain('7');
    await wrapper.get('.learning-archive-link').trigger('tap');
    expect(uni.navigateTo).toHaveBeenCalledWith(expect.objectContaining({ url: '/pages/archive/index?view=plan' }));
    const statistics = mount(StudyDetailPage, {
      global: { stubs: { ...stubs, LearningOverview: false, image: true } }
    });
    expect(statistics.get('.learning-overview').text()).toContain('1 次');
    store.submit('20', true, 'profile-second');
    await flushPromises();
    expect(statistics.get('.learning-overview').text()).toContain('2 次');
    expect(store.summary.first).toMatchObject({ numerator: 1, denominator: 1 });
    expect(legacy.studyProgress.completedQuestions).toBe(7);
    expect(store.state.attempts).toHaveLength(2);
    statistics.unmount();
    wrapper.unmount();
  });
  it.each([
    [[], '—'],
    [Array.from({ length: 4 }, () => ({ isCorrect: false })), '0%'],
    [Array.from({ length: 4 }, () => ({ isCorrect: true })), '100%'],
    [[{ isCorrect: true, grade: { status: 'pending' } }, { isCorrect: NaN }], '—']
  ])('近期旧判对只使用逐题旧布尔分母：%j', async (history, expected) => {
    const study = useStudyStore();
    study.studyProgress.completedQuestions = 999;
    study.studyProgress.correctQuestions = 998;
    study.questionHistory = history;
    const wrapper = mount(ProfilePage, { global: { stubs: { ...stubs, CustomTabbar: true } } });
    try {
      await openSettingsSection(wrapper, '数据控制');
      expect(wrapper.find('.stats-card').text()).toContain('近期旧判对');
      expect(wrapper.find('.stats-card .base-list-row__value').text()).toBe(expected);
    } finally {
      wrapper.unmount();
    }
  });
  it('登录入口 Enter 与 Space 不绕过协议，QQ 不再出现', async () => {
    uni.setStorageSync('yozi_login_region', 'CN');
    const api = vi.spyOn(useAuthStore(), 'regionalLogin').mockResolvedValue({ code: 0, data: { wechat: true } });
    const wrapper = mount(LoginPage, { global: { stubs: { ...stubs, PrivacyPopup: true } } });
    try {
      await flushPromises();
      api.mockClear();
      expect(wrapper.find('.qq-btn').exists()).toBe(false);
      const agreement = wrapper.get('#e2e-login-agreement');
      expect(wrapper.findAll('.login-agreement [role="link"]')).toHaveLength(2);
      expect(agreement.find('[role="link"]').exists()).toBe(false);
      const email = wrapper.find('.email-btn');
      expect(email.attributes('aria-disabled')).toBe('false');
      await email.trigger('keydown', { key: 'Enter' });
      await email.trigger('keydown', { key: ' ' });
      expect(api).not.toHaveBeenCalled();
      expect(wrapper.find('.email-form').exists()).toBe(false);
      expect(wrapper.get('.login-error').text()).toBe(t('login.consent'));
      await agreement.trigger('keydown', { key: ' ' });
      await email.trigger('keydown', { key: 'Enter' });
      await flushPromises();
      expect(wrapper.find('.email-form').exists()).toBe(true);
    } finally {
      wrapper.unmount();
      api.mockRestore();
    }
  });
  it('登录密码可键盘切换，空邮箱验证码按钮禁用且不发送请求', async () => {
    uni.setStorageSync('yozi_login_region', 'CN');
    const api = vi.spyOn(useAuthStore(), 'regionalLogin').mockResolvedValue({ code: 0, data: {} });
    const send = vi.spyOn(useAuthStore(), 'sendEmailCode');
    const wrapper = mount(LoginPage, { global: { stubs: { ...stubs, PrivacyPopup: true } } });
    try {
      await flushPromises();
      await wrapper.find('#e2e-login-agreement').trigger('keydown', { key: ' ' });
      await wrapper.find('.email-btn').trigger('keydown', { key: 'Enter' });
      const toggle = wrapper.find('[aria-label="显示密码"]');
      await toggle.trigger('keydown', { key: ' ' });
      expect(wrapper.find('[aria-label="隐藏密码"]').exists()).toBe(true);
      await wrapper
        .findAll('button')
        .find((b) => b.text() === '创建账户')
        .trigger('keydown', { key: 'Enter' });
      const resend = wrapper.find('.email-form .base-field__group .base-button--quiet');
      expect(resend.attributes('aria-disabled')).toBe('true');
      await resend.trigger('keydown', { key: 'Enter' });
      await flushPromises();
      expect(send).not.toHaveBeenCalled();
    } finally {
      wrapper.unmount();
      api.mockRestore();
      send.mockRestore();
    }
  });
  it('账户优先保留用户头像，加载失败才使用本地卡通头像，新头像可重新加载', async () => {
    const user = useUserStore();
    const wrapper = mount(ProfilePage, { global: { stubs: { ...stubs, CustomTabbar: true } } });
    expect(wrapper.find('.avatar').attributes('src')).toBe(DEFAULT_AVATAR);
    user.userInfo = { avatarUrl: '/test-original-avatar.png' };
    await flushPromises();
    expect(wrapper.find('.avatar').attributes('src')).toBe('/test-original-avatar.png');
    await wrapper.find('.avatar').trigger('error');
    expect(wrapper.find('.avatar').attributes('src')).toBe(DEFAULT_AVATAR);
    user.userInfo = { avatarUrl: '/test-replacement-avatar.png' };
    await flushPromises();
    expect(wrapper.find('.avatar').attributes('src')).toBe('/test-replacement-avatar.png');
    wrapper.unmount();
  });
  it('账户弹窗取消保留登录和学习事实，确认退出隔离显示并保留原账户记录', async () => {
    const user = useUserStore();
    user.isLogin = true;
    storageService.saveLoginSession({
      userId: 'isolated-profile-user',
      token: 'synthetic-profile-session-token',
      userInfo: {}
    });
    const learning = useConversationLearningStore();
    learning.start('12 + 8');
    learning.submit('19', true, 'profile-dialog-answer');
    const before = learning.exportData();
    const logout = vi.spyOn(user, 'logout');
    const wrapper = mount(ProfilePage, {
      global: {
        stubs: {
          ...stubs,
          CustomTabbar: true,
          WdLoading: true,
          WdPopup: { props: ['modelValue'], template: '<div v-if="modelValue"><slot /></div>' }
        }
      }
    });
    try {
      await wrapper.find('.logout-btn').trigger('tap');
      await flushPromises();
      expect(wrapper.find('[role="dialog"]').text()).toContain('确认退出');
      await wrapper.find('.cancel-btn').trigger('tap');
      expect(logout).not.toHaveBeenCalled();
      expect(storageService.get('EXAM_USER_ID')).toBe('isolated-profile-user');
      expect(learning.exportData()).toBe(before);
      await wrapper.find('.logout-btn').trigger('tap');
      await flushPromises();
      vi.useFakeTimers();
      await wrapper.find('.confirm-btn').trigger('tap');
      await flushPromises();
      expect(logout).toHaveBeenCalledOnce();
      expect(storageService.get('EXAM_USER_ID')).toBeNull();
      // The unit uni event bus is a spy; repository reads still prove owner isolation.
      const guest = JSON.parse(learning.exportData());
      expect(guest.owner).toBe('guest');
      expect(guest.attempts).toHaveLength(0);
      vi.runOnlyPendingTimers();
      expect(uni.navigateTo).toHaveBeenLastCalledWith(expect.objectContaining({ url: '/pages/index/index' }));
      uni.switchTab.mockClear();
      storageService.saveLoginSession({
        userId: 'isolated-profile-user',
        token: 'synthetic-profile-session-token',
        userInfo: {}
      });
      learning.refresh();
      expect(learning.exportData()).toBe(before);
      storageService.remove('EXAM_USER_ID');
      learning.refresh();
      vi.runOnlyPendingTimers();
      expect(uni.switchTab).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      logout.mockRestore();
      wrapper.unmount();
    }
  });
  it('首次引导和跳过不覆盖既有考试、每日目标或学习事实', async () => {
    const existing = { exam: 'kaoyan', targetYear: 2028, tracks: ['english2'] };
    storageService.save('exam_profile', existing);
    storageService.save('daily_goal', 40);
    const store = useConversationLearningStore();
    const wrapper = mount(OnboardingPage, { global: { stubs } });
    expect(wrapper.text()).toContain('开始学习');
    expect(wrapper.text()).not.toContain('2027 考研公共课');
    await flushPromises();
    expect(storageService.get('onboarding_completed')).not.toBe(true);
    await wrapper.find('.base-button--primary').trigger('tap');
    expect(storageService.get('onboarding_completed')).toBe(true);
    expect(storageService.get('exam_profile')).toEqual(existing);
    expect(storageService.get('daily_goal')).toBe(40);
    expect(store.state.conversations).toHaveLength(0);
    expect(store.summary.validAnswers).toBe(0);
    wrapper.unmount();
  });
  it('引导页离开后停止返回首页核验，迟到回执不打断当前页面', async () => {
    vi.useFakeTimers();
    const previousRedirectTo = uni.redirectTo;
    uni.redirectTo = vi.fn(() => Promise.resolve());
    const previousPages = globalThis.getCurrentPages;
    globalThis.getCurrentPages = vi.fn(() => [{ route: 'pages/learning/index' }]);
    const wrapper = mount(OnboardingPage, { global: { stubs } });
    const schedule = vi.spyOn(globalThis, 'setTimeout');
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    try {
      await wrapper.find('.base-button--primary').trigger('tap');
      const navigation = uni.redirectTo.mock.calls.at(-1)[0];
      const first = schedule.mock.calls.length;
      navigation.success?.();
      expect(schedule.mock.calls.slice(first).map(([, delay]) => delay)).toEqual([350, 1200, 2500]);
      const verificationTimers = schedule.mock.results.slice(first).map(({ value }) => value);
      wrapper.unmount();
      for (const timer of verificationTimers) expect(clear).toHaveBeenCalledWith(timer);
      const scheduled = schedule.mock.calls.length;
      navigation.success?.();
      navigation.fail?.({ errMsg: 'late failure' });
      expect(schedule.mock.calls).toHaveLength(scheduled);
      expect(uni.reLaunch).not.toHaveBeenCalled();
      expect(uni.redirectTo).toHaveBeenCalledTimes(1);
      expect(uni.switchTab).not.toHaveBeenCalled();
    } finally {
      wrapper.unmount();
      uni.redirectTo = previousRedirectTo;
      globalThis.getCurrentPages = previousPages;
      schedule.mockRestore();
      clear.mockRestore();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
  it('Android 欢迎页重开学习页页面栈，失败时沿用原导航', async () => {
    vi.stubGlobal('uni', { ...uni, getDeviceInfo: () => ({ platform: 'android' }) });
    const wrapper = mount(OnboardingPage, { global: { stubs } });
    try {
      await wrapper.find('.base-button--primary').trigger('tap');
      expect(storageService.get('onboarding_completed')).toBe(true);
      expect(uni.reLaunch).toHaveBeenCalledOnce();
      const navigation = uni.reLaunch.mock.calls[0][0];
      expect(navigation.url).toBe('/pages/learning/index');
      expect(uni.redirectTo).not.toHaveBeenCalled();
      navigation.fail({ errMsg: 'synthetic reLaunch failure' });
      expect(uni.redirectTo).toHaveBeenCalledWith(expect.objectContaining({ url: '/pages/learning/index' }));
    } finally {
      wrapper.unmount();
      vi.unstubAllGlobals();
    }
  });
  it('欢迎页只需一个开始动作且不再写入考研预设', async () => {
    const wrapper = mount(OnboardingPage, { global: { stubs } });
    try {
      expect(wrapper.findAll('.base-button--primary')).toHaveLength(1);
      expect(wrapper.text()).not.toContain('考研公共课');
      await wrapper.find('.base-button--primary').trigger('tap');
      expect(storageService.get('onboarding_completed')).toBe(true);
      expect(storageService.get('exam_profile')).toBeNull();
    } finally {
      wrapper.unmount();
    }
  });
  it('品牌与恢复入口使用共享状态，校验预览不会再次提交作答', async () => {
    const store = useConversationLearningStore();
    store.start('12 + 8');
    store.submit('19', true, 'backup-ui-answer');
    const content = store.exportData();
    const wrapper = mount(LearningPage, {
      global: {
        stubs: {
          ...stubs,
          LearningShell: { template: '<div><slot /><slot name="controls" /><slot name="composer" /></div>' },
          NumberLine: true
        }
      }
    });
    const button = (label) => wrapper.findAll('button').find((node) => matchesLearningControl(node, label));
    await openLearningSettings(wrapper);
    await button('记录与隐私').trigger('tap');
    await button('恢复备份').trigger('tap');
    await wrapper.find('[aria-label="学习记录 JSON 备份"]').setValue(content);
    await button('校验并预览').trigger('tap');
    expect(wrapper.text()).toContain('新增 0 个操作');
    expect(button('确认合并记录').attributes('disabled')).toBeDefined();
    expect(store.state.attempts).toHaveLength(1);
    wrapper.unmount();
    const shell = mount(LearningShell, { global: { stubs } });
    expect(shell.find('.brand-name').text()).toContain(BRAND.chinese);
    expect(shell.find('.brand-mark').classes()).toContain('animated-avatar');
    expect(shell.find('.brand-status').attributes('role')).toBe('status');
    shell.unmount();
  });
  it('聊天发送向辅助工具说明禁用状态，填写目标后才创建学习记录', async () => {
    const store = useConversationLearningStore();
    const wrapper = mount(LearningPage, {
      global: {
        stubs: {
          ...stubs,
          LearningShell: { template: '<div><slot /><slot name="controls" /><slot name="composer" /></div>' },
          NumberLine: true
        }
      }
    });
    const start = wrapper.find('[aria-label="发送"]');
    expect(start.attributes('aria-disabled')).toBe('true');
    await start.trigger('tap');
    expect(store.state.conversations).toHaveLength(0);
    await wrapper.find('[aria-label="消息或作答"]').setValue('12 + 8');
    expect(start.attributes('aria-disabled')).toBe('false');
    await start.trigger('tap');
    expect(store.active.goal).toBe('12 + 8');
    expect(store.state.conversations).toHaveLength(1);
    wrapper.unmount();
  });
  it('加载期间不能重复提交，取消入口可用且保留输入草稿', async () => {
    const store = useConversationLearningStore();
    store.start('12 + 8');
    const wrapper = mount(LearningPage, {
      global: {
        stubs: {
          ...stubs,
          LearningShell: { template: '<div><slot /><slot name="controls" /><slot name="composer" /></div>' },
          NumberLine: true
        }
      }
    });
    const button = (label) => wrapper.findAll('button').find((node) => matchesLearningControl(node, label));
    await wrapper.find('.composer textarea').setValue('20');
    store.busy = true;
    await flushPromises();
    expect(button('提交作答').attributes('aria-disabled')).toBe('true');
    await button('提交作答').trigger('tap');
    expect(store.state.attempts).toHaveLength(0);
    expect(wrapper.findAll('#learning-composer [aria-label="停止当前任务"]')).toHaveLength(1);
    expect(wrapper.findAll('#learning-composer .muse-send[aria-label="取消请求"]')).toHaveLength(1);
    const stop = wrapper.get('#learning-composer .muse-send[aria-label="取消请求"]');
    expect(stop.attributes('aria-disabled')).toBe('false');
    const cancel = vi.spyOn(store, 'cancel');
    await stop.trigger('tap');
    expect(cancel).toHaveBeenCalledOnce();
    expect(wrapper.find('.composer textarea').element.value).toBe('20');
    cancel.mockRestore();
    wrapper.unmount();
  });
  it('访客从同步进入登录，保留学习记录，取消或登录返回均不自动同步', async () => {
    const store = useConversationLearningStore();
    store.start('12 + 8');
    store.submit('19', true, 'guest-sync-login-answer');
    const before = store.exportData();
    const sync = vi.spyOn(store, 'syncRecords');
    let dialog;
    const wrapper = mount(LearningPage, {
      global: {
        stubs: {
          ...stubs,
          LearningShell: { template: '<div><slot /><slot name="controls" /><slot name="composer" /></div>' },
          NumberLine: true
        }
      }
    });
    observeLearningDialogs(wrapper, (state) => {
      dialog = state;
    });
    const button = (label) => wrapper.findAll('button').find((node) => matchesLearningControl(node, label));
    await openLearningSettings(wrapper);
    await button('记录与隐私').trigger('tap');
    await button('同步学习记录').trigger('tap');
    expect(dialog.title).toBe('登录后同步学习记录');
    dialog.success({ confirm: false });
    expect(uni.navigateTo).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
    expect(store.exportData()).toBe(before);
    await button('同步学习记录').trigger('tap');
    dialog.success({ confirm: true });
    expect(uni.navigateTo).toHaveBeenCalledWith(expect.objectContaining({ url: '/pages/login/index' }));
    expect(storageService.get('redirect_after_login')).toBe('/pages/learning/index');
    expect(sync).not.toHaveBeenCalled();
    expect(store.exportData()).toBe(before);
    wrapper.unmount();
    sync.mockRestore();
  });
  it('首页默认只挂载学习空间，不同时加载旧仪表盘或第二套导航', () => {
    const wrapper = mount(HomePage, {
      global: { stubs: { ...stubs, LearningLanding: true, PrivacyPopup: true, CustomTabbar: true } }
    });
    expect(wrapper.findComponent({ name: 'LearningLanding' }).exists()).toBe(true);
    expect(wrapper.find('.page').exists()).toBe(false);
    expect(wrapper.findComponent({ name: 'CustomTabbar' }).exists()).toBe(false);
    wrapper.unmount();
  });
  it('启动入口卸载后收回返回核验，迟到回执不重新跳转', async () => {
    vi.useFakeTimers();
    storageService.save('onboarding_completed', true);
    // 明确控制本次导航回执，避免异步推进时钟顺便触发另一轮恢复核验。
    const previousRedirectTo = uni.redirectTo;
    uni.redirectTo = vi.fn(() => Promise.resolve());
    const unrelated = setTimeout(() => undefined, 90000);
    const previousPages = globalThis.getCurrentPages;
    globalThis.getCurrentPages = vi.fn(() => [{ route: 'pages/splash/index' }]);
    const wrapper = mount(SplashPage, { global: { stubs: { ...stubs, image: true } } });
    const schedule = vi.spyOn(globalThis, 'setTimeout');
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    try {
      await vi.advanceTimersByTimeAsync(1800);
      expect(uni.redirectTo).toHaveBeenCalledTimes(1);
      const navigation = uni.redirectTo.mock.calls[0][0];
      // Only this explicit acknowledgement owns the timers under test.
      // Other mounted UI/runner callbacks may schedule the same delays while the clock advances.
      const acknowledgementStart = schedule.mock.calls.length;
      navigation.success?.();
      const acknowledgementCalls = schedule.mock.calls.slice(acknowledgementStart);
      expect(acknowledgementCalls.map((call) => call[1])).toEqual([350, 1200, 2500]);
      const verificationTimers = acknowledgementCalls.map(
        (_call, index) => schedule.mock.results[acknowledgementStart + index].value
      );
      expect(verificationTimers).toHaveLength(3);
      wrapper.unmount();
      for (const timer of verificationTimers) expect(clear).toHaveBeenCalledWith(timer);
      expect(clear).not.toHaveBeenCalledWith(unrelated);
      const scheduled = schedule.mock.calls.length;
      navigation.success?.();
      navigation.fail?.({ errMsg: 'late failure' });
      expect(schedule.mock.calls).toHaveLength(scheduled);
      await vi.advanceTimersByTimeAsync(5000);
      expect(uni.reLaunch).not.toHaveBeenCalled();
      expect(uni.redirectTo).toHaveBeenCalledTimes(1);
    } finally {
      wrapper.unmount();
      uni.redirectTo = previousRedirectTo;
      globalThis.getCurrentPages = previousPages;
      schedule.mockRestore();
      clear.mockRestore();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
  it('启动失败显示真实兜底按钮，明确重试才重新导航且学习事实不变', async () => {
    vi.useFakeTimers();
    storageService.save('onboarding_completed', true);
    const store = useConversationLearningStore();
    store.start('12 + 8');
    store.commit('task.stop', { conversationId: store.selectedConversationId });
    const before = store.exportData();
    for (const name of ['reLaunch', 'redirectTo']) {
      uni[name].mockImplementationOnce(({ fail }) => fail?.({ errMsg: `${name}:fail synthetic` }));
    }
    uni.redirectTo.mockImplementationOnce(({ fail }) => fail?.({ errMsg: 'redirectTo:fail final fallback' }));
    const unrelated = setTimeout(() => undefined, 90000);
    const schedule = vi.spyOn(globalThis, 'setTimeout');
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    const wrapper = mount(SplashPage, { global: { stubs: { ...stubs, image: true } } });
    try {
      await vi.advanceTimersByTimeAsync(1800);
      const fallback = wrapper.get('button.manual-entry');
      expect(fallback.text()).toBe('首页');
      expect(fallback.attributes('role')).toBe('button');
      expect(wrapper.text()).not.toContain('从提问，走向理解');
      expect(wrapper.text()).not.toContain('Yozi AI Team');
      await fallback.trigger('tap');
      expect(uni.redirectTo).toHaveBeenCalledTimes(3);
      expect(uni.switchTab).not.toHaveBeenCalled();
      expect(store.exportData()).toBe(before);
      const pageTimers = schedule.mock.calls.flatMap((call, index) =>
        [4200, 350, 1200, 2500].includes(call[1]) ? [schedule.mock.results[index].value] : []
      );
      expect(pageTimers).toHaveLength(4);
      expect(schedule.mock.calls.some((call) => call[1] === 1800)).toBe(false);
      wrapper.unmount();
      for (const timer of pageTimers) expect(clear).toHaveBeenCalledWith(timer);
      expect(clear).not.toHaveBeenCalledWith(unrelated);
    } finally {
      wrapper.unmount();
      schedule.mockRestore();
      clear.mockRestore();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
  it('欢迎页不再包含旧题库仪表盘，也不改写已有学习事实', async () => {
    const store = useConversationLearningStore();
    store.start('中文叙事写作');
    store.commit('task.stop', { conversationId: store.selectedConversationId });
    const before = store.exportData();
    const wrapper = mount(HomePage, { global: { stubs: { ...stubs, LearningLanding: true, PrivacyPopup: true } } });
    try {
      for (const selector of ['.progress-card', '.stats-row', '.today-focus-panel', '.paper-score'])
        expect(wrapper.find(selector).exists()).toBe(false);
      expect(wrapper.text()).not.toContain('真题整卷');
      expect(store.exportData()).toBe(before);
      expect(store.active.stopped).toBe(true);
    } finally {
      wrapper.unmount();
    }
  });
  for (const [goal, genre, subject] of [
    ['英文说明写作', 'explanation', '英语'],
    ['英文论证写作', 'argument', '英语'],
    ['英文学术讨论', 'discussion', '英语'],
    ['英文邮件写作', 'email', '英语'],
    ['英文句子组织', null, '英语'],
    ['功与动能', null, '物理'],
    ['密度、质量与体积', null, '物理'],
    ['压强、压力与接触面积', null, '物理'],
    ['中文叙事写作', 'narrative', '语文']
  ]) {
    it(`首页主题${goal}先选择，明确开始才建立对应原答任务`, async () => {
      const store = useConversationLearningStore();
      store.start('12 + 8');
      store.commit('task.stop', { conversationId: store.selectedConversationId });
      const original = JSON.parse(store.exportData());
      let wrapper = mount(LearningLanding, { global: { stubs } });
      expect(wrapper.find('.app-entry').exists()).toBe(true);
      expect(JSON.parse(store.exportData())).toEqual(original);
      wrapper.unmount();
      wrapper = mount(LearningPage, { global: { stubs: { ...stubs, LearningLab: true } } });
      await wrapper.get('.mobile-menu').trigger('tap');
      await wrapper.get('.new-session').trigger('tap');
      await wrapper.get('textarea[aria-label="消息或作答"]').setValue(goal);
      expect(JSON.parse(store.exportData())).toEqual(original);
      await wrapper.get('[aria-label="发送"]').trigger('tap');
      await flushPromises();
      expect(store.active.goal).toBe(goal);
      expect(store.activeQuestion).toMatchObject(
        genre
          ? {
              subject,
              answerType: 'subjective',
              validation: null,
              writingExercise: { genreId: genre }
            }
          : goal === '功与动能'
            ? { subject, answerType: 'choice', scienceExercise: { contract: 'science-transfer-v4' } }
            : goal === '密度、质量与体积'
              ? { subject, answerType: 'choice', scienceExercise: { contract: 'science-transfer-v5' } }
              : goal === '压强、压力与接触面积'
                ? { subject, answerType: 'choice', scienceExercise: { contract: 'science-transfer-v6' } }
                : { subject, answerType: 'sentence_order', sentenceExercise: { contract: 'sentence-building-v1' } }
      );
      expect(store.state.attempts).toEqual([]);
      expect(store.state.conversations[0]).toEqual(original.conversations[0]);
      expect(store.state.conversations[0].stopped).toBe(true);
      wrapper.unmount();
    });
  }
  it.each([
    ['功与动能', 'science-transfer-v4'],
    ['密度、质量与体积', 'science-transfer-v5'],
    ['压强、压力与接触面积', 'science-transfer-v6']
  ])('对话%s先选草稿，明确开始才创建题目，原停止任务不恢复', async (goal, contract) => {
    const store = useConversationLearningStore();
    store.start('12 + 8');
    store.commit('task.stop', { conversationId: store.active.id });
    const before = JSON.parse(store.exportData());
    const wrapper = mount(LearningPage, { global: { stubs: { ...stubs, PrivacyPopup: true, CustomTabbar: true } } });
    try {
      await wrapper
        .findAll('button')
        .find((b) => b.text() === '新对话')
        .trigger('tap');
      await wrapper.get('textarea[aria-label="消息或作答"]').setValue(goal);
      expect(JSON.parse(store.exportData())).toEqual(before);
      await wrapper.get('[aria-label="发送"]').trigger('tap');
      await flushPromises();
      expect(store.activeQuestion.scienceExercise.contract).toBe(contract);
      expect(store.activeQuestion.options).toHaveLength(4);
      expect(store.state.conversations[0]).toEqual(before.conversations[0]);
      expect(store.state.attempts).toEqual([]);
      expect(store.state.executions).toEqual([]);
    } finally {
      wrapper.unmount();
    }
  });
  it.each([
    ['密度、质量与体积', 'mass', '密度＝质量÷体积', 'deterministic-science-v5'],
    ['压强、压力与接触面积', 'force', '垂直压力÷面积', 'deterministic-science-v6']
  ])(
    '%s真实页面绑定方法/独立/提交/明日入口，选择不写事实，停止后动作不生效',
    async (goal, nextTarget, method, evaluator) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-07T18:00:00Z'));
      const store = useConversationLearningStore();
      store.start(goal);
      store.commit('timezone.set', { timezone: 'America/Los_Angeles' });
      store.commit('strategy.set', {
        conversationId: store.active.id,
        method: 'steps',
        source: 'self_report',
        reason: '用户选择逐步'
      });
      const wrapper = mount(LearningPage, { global: { stubs: { ...stubs, PrivacyPopup: true, CustomTabbar: true } } });
      const control = (label) => wrapper.findAll('button').find((b) => matchesLearningControl(b, label));
      const chooseCorrect = async () => {
        const option = wrapper.get('[aria-label="答案选项"]').findAll('button')[
          'ABCD'.indexOf(store.activeQuestion.validation.answer)
        ];
        const before = store.exportData();
        await option.trigger('tap');
        expect(option.attributes('aria-checked')).toBe('true');
        expect(store.exportData()).toBe(before);
      };
      try {
        expect(wrapper.find('.density-practice').exists()).toBe(true);
        expect(wrapper.find('.learning-lab').exists()).toBe(false);
        const originalKey = store.active.activeQuestionKey;
        await control('看计算方法').trigger('tap');
        await flushPromises();
        expect(wrapper.find('.density-method').text()).toContain(method);
        expect(store.active.pendingHints).toHaveLength(1);
        expect(store.active.pendingHints[0].questionKey).toBe(originalKey);
        const helped = store.exportData();
        await control('看计算方法').trigger('tap');
        expect(store.exportData()).toBe(helped);
        await chooseCorrect();
        await control('提交作答').trigger('tap');
        await flushPromises();
        expect(store.state.attempts.at(-1)).toMatchObject({
          questionKey: originalKey,
          grade: { outcome: 'correct', evaluator },
          hints: [{ questionKey: originalKey }]
        });
        const originalAttempts = JSON.parse(JSON.stringify(store.state.attempts));
        await control('换条件独立作答').trigger('tap');
        await flushPromises();
        expect(store.activeQuestion.parentQuestionKey).toBe(originalKey);
        expect(store.activeQuestion.scienceExercise.input.target).toBe(nextTarget);
        expect(store.active.pendingHints).toEqual([]);
        expect(wrapper.find('.density-method').exists()).toBe(false);
        expect(store.state.attempts).toEqual(originalAttempts);
        expect(store.activeStrategy.method).toBe('steps');
        await chooseCorrect();
        await control('提交作答').trigger('tap');
        await flushPromises();
        expect(store.state.attempts.at(-1).hints).toEqual([]);
        await control('明日复测').trigger('tap');
        await flushPromises();
        expect(store.scienceRetest.day).toBe('2026-10-08');
        expect(control('已安排 10/08').attributes('disabled')).toBeDefined();
        store.commit('task.stop', { conversationId: store.active.id, source: 'self_report' });
        await flushPromises();
        const stopped = store.exportData();
        for (const label of ['看计算方法', '换条件独立作答', '提交作答']) {
          expect(control(label).attributes('disabled')).toBeDefined();
          await control(label).trigger('tap');
        }
        await flushPromises();
        expect(store.exportData()).toBe(stopped);
        expect(store.active.stopped).toBe(true);
      } finally {
        wrapper.unmount();
        vi.useRealTimers();
      }
    }
  );
  it('首页直接开始真实学习、保留来源口径，私人资料进入资料库', async () => {
    let wrapper = mount(LearningLanding, { global: { stubs } });
    const store = useConversationLearningStore();
    expect(wrapper.find('.app-entry').exists()).toBe(true);
    expect(store.state.conversations).toHaveLength(0);
    wrapper.unmount();
    wrapper = mount(LearningPage, { global: { stubs } });
    await wrapper.get('textarea[aria-label="消息或作答"]').setValue('12 + 8');
    await wrapper.get('[aria-label="发送"]').trigger('tap');
    await flushPromises();
    expect(store.active.goal).toBe('12 + 8');
    expect(store.activeQuestion.validation.type).toBe('number');
    expect(store.summary.validAnswers).toBe(0);
    await wrapper
      .findAll('.rail-item')
      .find((button) => button.attributes('aria-label') === '资料库')
      .trigger('tap');
    await flushPromises();
    expect(uni.navigateTo).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/pages/archive/index?view=materials' })
    );
    wrapper.unmount();
  });
  it('显式打开目录聚焦搜索，收起恢复原按钮焦点', async () => {
    const wrapper = mount(LearningShell, { attachTo: document.body, global: { stubs } });
    await wrapper.find('.mobile-menu').trigger('tap');
    await flushPromises();
    expect(wrapper.find('.space-sidebar').classes()).toContain('sidebar-open');
    expect(document.activeElement).toBe(wrapper.find('.space-sidebar input').element);
    expect(wrapper.find('.space-main').attributes()).not.toHaveProperty('inert');
    await collapseDirectory(wrapper);
    await flushPromises();
    expect(wrapper.find('.space-sidebar.sidebar-open').exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.find('.mobile-menu').element);
    wrapper.unmount();
  });
});

it('统一学习页显示保存的完整阅读、指定片段和待核对来源，阅读不改原答或帮助', async () => {
  const { recordQuizLearningAttempt } = await import('@/services/learning/quiz-learning-bridge.js');
  await recordQuizLearningAttempt({
    currentQuestion: {
      id: 'source-reading-ui',
      question: '请选择文中出现的两项。',
      options: ['月亮', '太阳', '小河'],
      type: 'multi_choice',
      answer: 'AC',
      passage: 'The moon shone over the river.\n\nThe bridge was empty.',
      targetSegment: 'The bridge was empty.',
      source: { title: '合成阅读原件', page: 2 },
      sourceLicense: '本轮原创',
      sourceSha256: 'a'.repeat(64)
    },
    userAnswer: 'AC',
    sessionId: 'source_reading_ui',
    attemptId: 'quiz_answer_source_reading_ui'
  });
  const store = useConversationLearningStore();
  store.refresh();
  const before = learningRepository.read();
  const wrapper = mount(LearningPage, { global: { stubs: { ...stubs, PrivacyPopup: true, CustomTabbar: true } } });
  try {
    expect(wrapper.get('[data-test="quiz-original-reading"]').text()).toContain('The moon shone over the river.');
    expect(wrapper.get('[data-test="quiz-original-reading"]').text()).toContain('The bridge was empty.');
    expect(wrapper.get('[data-test="quiz-original-target"]').text()).toContain('The bridge was empty.');
    expect(wrapper.get('[data-test="quiz-original-source"]').text()).toContain('合成阅读原件');
    expect(wrapper.get('[data-test="quiz-original-source"]').text()).toContain('本轮原创');
    expect(wrapper.get('[data-test="quiz-original-source"]').text()).toContain('待核对');
    expect(wrapper.find('[data-test="quiz-original-partial"]').exists()).toBe(false);
    expect(learningRepository.read()).toEqual(before);
  } finally {
    wrapper.unmount();
    store.$dispose();
  }
});

it('学习侧栏跟随身份事务更新登录入口，不依赖当前窗口的登录事件', async () => {
  const session = await storageService.saveLoginSession({
    userId: 'shell-identity-fixture',
    token: 'fixture-shell-identity-token',
    userInfo: { id: 'shell-identity-fixture' }
  });
  const wrapper = mount(LearningShell, { global: { stubs } });
  try {
    expect(wrapper.find('.rail-login').exists()).toBe(false);
    await storageService._clearRevokedCredentials(session);
    await flushPromises();
    expect(wrapper.find('.rail-login').exists()).toBe(true);
    await storageService.saveLoginSession({
      userId: 'shell-identity-fixture-next',
      token: 'fixture-shell-identity-next-token',
      userInfo: { id: 'shell-identity-fixture-next' }
    });
    await flushPromises();
    expect(wrapper.find('.rail-login').exists()).toBe(false);
  } finally {
    wrapper.unmount();
  }
});
it('Muse settings preview appearance in a draft and save only on confirmation', async () => {
  const theme = useThemeStore();
  theme.setDarkMode(false);
  const store = useConversationLearningStore();
  const before = store.exportData();
  const wrapper = mount(ProfilePage, { global: { stubs } });
  try {
    await wrapper.get('[aria-label="深色"]').trigger('tap');
    expect(theme.isDark).toBe(false);
    const save = wrapper.findAll('.settings-actions button').find((button) => button.text() === '保存偏好');
    await save.trigger('tap');
    expect(theme.isDark).toBe(true);
    expect(store.exportData()).toBe(before);
  } finally {
    wrapper.unmount();
  }
});
async function collapseDirectory(wrapper) {
  expect(wrapper.find('.sidebar-close').exists()).toBe(false);
  await wrapper.get('.sidebar-options').trigger('tap');
  const close = wrapper
    .findAll('.directory-options-menu button')
    .find((button) => button.text().includes('收起会话列表'));
  expect(close).toBeDefined();
  await close.trigger('tap');
  await flushPromises();
}

it('Muse directory width is keyboard bounded and explicit close restores focus', async () => {
  const wrapper = mount(LearningShell, { global: { stubs }, attachTo: document.body });
  try {
    await wrapper.get('.mobile-menu').trigger('tap');
    const separator = wrapper.get('[role="separator"]');
    await separator.trigger('keydown', { key: 'End' });
    expect(separator.attributes('aria-valuenow')).toBe('420');
    await separator.trigger('keydown', { key: 'ArrowRight' });
    expect(separator.attributes('aria-valuenow')).toBe('420');
    await separator.trigger('keydown', { key: 'Home' });
    await separator.trigger('keydown', { key: 'ArrowRight', shiftKey: true });
    expect(separator.attributes('aria-valuenow')).toBe('244');
    await separator.trigger('keydown', { key: 'Home' });
    await separator.trigger('keydown', { key: 'ArrowLeft' });
    expect(separator.attributes('aria-valuenow')).toBe('180');
    await collapseDirectory(wrapper);
    await flushPromises();
    expect(wrapper.get('.mobile-menu').attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(wrapper.get('.mobile-menu').element);
  } finally {
    wrapper.unmount();
  }
});

it('Muse search focuses the query instead of the close button', async () => {
  const wrapper = mount(LearningShell, { global: { stubs }, attachTo: document.body });
  try {
    await wrapper.get('.rail-item[aria-label="搜索题目、原答或对话"]').trigger('tap');
    await flushPromises();
    expect(document.activeElement).toBe(wrapper.get('.space-sidebar input').element);
  } finally {
    wrapper.unmount();
  }
});

it('Muse drawer resize cancellation preserves width and facts; a handle click preserves it', async () => {
  const store = useConversationLearningStore();
  const before = store.exportData();
  const wrapper = mount(LearningShell, { global: { stubs }, attachTo: document.body });
  const pointer = (type, clientX) => new PointerEvent(type, { pointerId: 7, clientX, button: 0 });
  try {
    await wrapper.get('.mobile-menu').trigger('tap');
    const separator = wrapper.get('[role="separator"]');
    await separator.trigger('pointerdown', { pointerId: 7, clientX: 217, button: 0 });
    window.dispatchEvent(pointer('pointermove', 320));
    await flushPromises();
    expect(separator.attributes('aria-valuenow')).toBe('320');
    expect(wrapper.classes()).toContain('is-resizing');
    window.dispatchEvent(pointer('pointercancel', 320));
    await flushPromises();
    expect(separator.attributes('aria-valuenow')).toBe('217');
    expect(wrapper.get('.space-sidebar').classes()).toContain('sidebar-open');
    expect(wrapper.classes()).not.toContain('is-resizing');
    await separator.trigger('pointerdown', { pointerId: 7, clientX: 217, button: 0 });
    window.dispatchEvent(pointer('pointerup', 217));
    await flushPromises();
    expect(wrapper.get('.space-sidebar').classes()).toContain('sidebar-open');
    await collapseDirectory(wrapper);
    expect(wrapper.get('.mobile-menu').attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(wrapper.get('.mobile-menu').element);
    expect(store.exportData()).toBe(before);
  } finally {
    wrapper.unmount();
  }
});

it('Muse edge drag previews the original threshold, ignores other pointers and cancels without opening or saving facts', async () => {
  const store = useConversationLearningStore();
  const before = store.exportData();
  const wrapper = mount(LearningShell, { global: { stubs }, attachTo: document.body });
  const pointer = (type, clientX, pointerId = 8) => new PointerEvent(type, { pointerId, clientX, button: 0 });
  try {
    const edge = () => wrapper.get('.directory-edge');
    await edge().trigger('pointerdown', { pointerId: 8, clientX: 78, button: 0 });
    window.dispatchEvent(pointer('pointermove', 200, 9));
    await flushPromises();
    expect(wrapper.find('.directory-edge-preview').exists()).toBe(false);
    window.dispatchEvent(pointer('pointermove', 142));
    await flushPromises();
    expect(wrapper.get('.directory-edge-preview').attributes('style')).toContain('width: 64px');
    window.dispatchEvent(pointer('pointerup', 142));
    await flushPromises();
    expect(wrapper.get('.mobile-menu').attributes('aria-expanded')).toBe('false');
    await edge().trigger('pointerdown', { pointerId: 8, clientX: 78, button: 0 });
    window.dispatchEvent(pointer('pointermove', 320));
    window.dispatchEvent(pointer('pointercancel', 320));
    await flushPromises();
    expect(wrapper.find('.directory-edge-preview').exists()).toBe(false);
    expect(wrapper.get('.mobile-menu').attributes('aria-expanded')).toBe('false');
    await edge().trigger('pointerdown', { pointerId: 8, clientX: 78, button: 0 });
    window.dispatchEvent(pointer('pointermove', 143));
    window.dispatchEvent(pointer('pointerup', 143));
    await flushPromises();
    expect(wrapper.get('.space-sidebar').classes()).toContain('sidebar-open');
    expect(document.activeElement).toBe(wrapper.get('.space-sidebar input').element);
    expect(store.exportData()).toBe(before);
  } finally {
    wrapper.unmount();
  }
  window.dispatchEvent(pointer('pointermove', 400));
  expect(store.exportData()).toBe(before);
});

it('Muse desktop pin preserves chat interaction while the mobile drawer remains modal', async () => {
  const store = useConversationLearningStore();
  const before = store.exportData();
  const wrapper = mount(LearningShell, { global: { stubs }, attachTo: document.body });
  try {
    await wrapper.get('.mobile-menu').trigger('tap');
    await flushPromises();
    expect(wrapper.get('.space-main').attributes()).not.toHaveProperty('inert');
    await wrapper.get('.space-content').trigger('pointerdown');
    await flushPromises();
    expect(wrapper.find('.space-sidebar.sidebar-open').exists()).toBe(true);
    await wrapper.get('.sidebar-options').trigger('tap');
    await wrapper.get('.directory-options-menu [aria-pressed]').trigger('tap');
    await wrapper.get('.space-content').trigger('pointerdown');
    await flushPromises();
    expect(wrapper.find('.space-sidebar.sidebar-open').exists()).toBe(false);
    const width = window.innerWidth;
    window.innerWidth = 390;
    window.dispatchEvent(new Event('resize'));
    await wrapper.get('.mobile-menu').trigger('tap');
    await flushPromises();
    expect(wrapper.get('.space-main').attributes()).toHaveProperty('inert');
    window.innerWidth = width;
    window.dispatchEvent(new Event('resize'));
    expect(store.exportData()).toBe(before);
  } finally {
    wrapper.unmount();
  }
});
