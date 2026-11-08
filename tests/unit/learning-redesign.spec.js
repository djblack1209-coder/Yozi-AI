import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { h } from 'vue';
import LearningPage from '@/pages/learning/index.vue';
import CustomModal from '@/components/common/CustomModal.vue';
import JourneyReview from '@/pages/learning/components/journey-review.vue';
import LearningOverview from '@/components/business/learning/learning-overview.vue';
import LearningJourney from '@/pages/learning/components/learning-journey.vue';
import YoziMascot from '@/components/base/yozi-mascot/yozi-mascot.vue';
import AnimatedAvatar from '@/components/base/animated-avatar/animated-avatar.vue';
import { avatarStateFor } from '@/design/avatar-state.js';
import MuseChatEmpty from '@/components/business/learning/muse-chat-empty.vue';
import LearningShell from '@/components/business/learning/learning-shell.vue';
import MuseComposer from '@/components/business/learning/muse-composer.vue';
import BaseButton from '@/components/base/base-button/base-button.vue';
import BaseChip from '@/components/base/base-chip/base-chip.vue';
import BaseOptions from '@/components/base/base-options/base-options.vue';
import BaseInput from '@/components/base/base-input/base-input.vue';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { learningWriteLease } from '@/services/learning/learning-write-lease.js';
import { setMascotReducedMotion } from '@/design/mascot-motion.js';
import { initI18n, setLanguage, t } from '@/i18n/index.js';
import { learningText } from '@/i18n/learning.js';
import messages from '@/pages/learning/messages.js';
vi.mock('@dcloudio/uni-app', () => ({ onLoad: () => {}, onShow: () => {}, onHide: () => {}, onBackPress: () => {} }));
const wrappers = [];
const stubs = {
  view: { template: '<div><slot /></div>' },
  text: { template: '<span><slot /></span>' },
  PrivacyPopup: true,
  LearningLab: true,
  BaseIcon: true
};
function render(component = LearningPage, props = {}) {
  const wrapper = mount(component, { attachTo: document.body, props, global: { stubs } });
  wrappers.push(wrapper);
  return wrapper;
}
function pose(wrapper, name) {
  return wrapper.findAllComponents(YoziMascot).find((child) => child.props('pose') === name);
}
beforeEach(() => {
  // 保留模块在明确开启时仍须通过原安全和恢复合同。
  vi.stubEnv('VITE_ENABLE_WRITING_COACH', 'false');
  vi.stubEnv('VITE_ENABLE_LEGACY_LEARNING', 'true');
  uni.clearStorageSync();
  setActivePinia(createPinia());
  initI18n();
  setMascotReducedMotion(false, { persist: false });
  const query = {
    select: vi.fn().mockReturnThis(),
    boundingClientRect: vi.fn().mockReturnThis(),
    selectViewport: vi.fn().mockReturnThis(),
    scrollOffset: vi.fn().mockReturnThis(),
    exec: vi.fn((callback) => callback([null, { scrollTop: 0 }]))
  };
  vi.spyOn(uni, 'createSelectorQuery').mockReturnValue(query);
});
afterEach(() => {
  wrappers
    .splice(0)
    .reverse()
    .forEach((wrapper) => wrapper.unmount());
  for (const store of getActivePinia()?._s.values() || []) store.$dispose();
  learningWriteLease.release();
  setMascotReducedMotion(false, { persist: false });
  setLanguage('zh-CN');
  vi.restoreAllMocks();
});
describe('learning interface states preserve learning facts', () => {
  it('narrow navigation keeps every action labelled and closes the directory directly without writing facts', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390);
    const store = useConversationLearningStore();
    const before = store.exportData();
    const wrapper = render(LearningShell);
    await flushPromises();
    expect(wrapper.findAll('.rail-item-tip').map((item) => item.text())).toEqual([
      '对话',
      '搜索⌘K',
      '灵感',
      '计划',
      '资料',
      '用量',
      '登录',
      '设置⌘,'
    ]);
    expect(wrapper.findAll('.muse-rail button')).toHaveLength(8);
    await wrapper.get('.directory-pill').trigger('tap');
    await flushPromises();
    expect(wrapper.get('.directory-search input').attributes('placeholder')).toBe('搜索会话');
    await wrapper.get('.sidebar-close').trigger('tap');
    await flushPromises();
    expect(wrapper.get('.directory-pill').attributes('aria-expanded')).toBe('false');
    await wrapper.setProps({ active: 'settings' });
    expect(wrapper.get('.rail-settings').attributes('aria-current')).toBe('page');
    expect(store.exportData()).toBe(before);
  });
  it('mobile header discloses every action, preserves keyboard activation and restores focus on Escape', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390);
    const store = useConversationLearningStore();
    const before = store.exportData();
    const actions = ['档案', '统计', 'AI 连接器', '设置'].map((label) => ({ label, run: vi.fn() }));
    const wrapper = mount(LearningShell, {
      attachTo: document.body,
      global: { stubs },
      slots: {
        controls: () => actions.map(({ label, run }) => h(BaseButton, { label, iconOnly: true, onTap: run }))
      }
    });
    wrappers.push(wrapper);
    await flushPromises();
    const toggle = wrapper.get('.header-actions-toggle');
    const group = wrapper.get('#learning-header-actions');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    expect(group.isVisible()).toBe(false);
    for (let index = 0; index < actions.length; index++) {
      await toggle.trigger('keydown', { key: 'Enter' });
      await flushPromises();
      await group.find('button').trigger('keyup', { key: 'Enter' });
      expect(group.isVisible()).toBe(true);
      const buttons = group.findAll('button');
      expect(buttons.map((button) => button.attributes('aria-label'))).toEqual(actions.map(({ label }) => label));
      expect(document.activeElement).toBe(buttons[0].element);
      await buttons[index].trigger('keydown', { key: ' ' });
      await buttons[index].trigger('keyup', { key: ' ' });
      await flushPromises();
      expect(actions[index].run).toHaveBeenCalledTimes(1);
      expect(group.isVisible()).toBe(false);
      expect(document.activeElement).toBe(toggle.element);
    }
    await toggle.trigger('tap');
    await group.find('button').trigger('keydown', { key: 'Escape' });
    await flushPromises();
    expect(group.isVisible()).toBe(false);
    expect(document.activeElement).toBe(toggle.element);
    await toggle.trigger('tap');
    await wrapper.get('.space-content').trigger('pointerdown');
    expect(group.isVisible()).toBe(false);
    await toggle.trigger('tap');
    await group.trigger('focusout', { relatedTarget: wrapper.get('.directory-pill').element });
    expect(group.isVisible()).toBe(false);
    expect(store.exportData()).toBe(before);
  });
  it('desktop header keeps its direct controls and no overflow trigger', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1090);
    const wrapper = render(LearningShell);
    await flushPromises();
    expect(wrapper.find('.header-actions-toggle').exists()).toBe(false);
    expect(wrapper.get('.space-header-actions').isVisible()).toBe(true);
  });
  it.each([
    ['offline', null, 'idle'],
    ['offline', null, 'error'],
    ['local', 'connector_verified', 'error'],
    ['local', 'model_verified', 'idle'],
    ['cloud', 'connected', 'ready'],
    ['cloud', 'failed', 'ready'],
    ['cloud', 'stale', 'ready'],
    ['cloud', 'connected', 'error']
  ])('operation errors preserve the %s connection evidence (%s, %s)', async (mode, status, phase) => {
    const store = useConversationLearningStore();
    store.start('12 + 8');
    store.submit('19', true);
    store.selectedMode = mode;
    store.modelListState = { phase, message: phase === 'error' ? '读取服务暂不可用' : '' };
    if (mode === 'local') store.localConnection = { status };
    if (mode === 'cloud') {
      store.modelId = 'fixture-cloud';
      store.models = [{ id: 'fixture-cloud', connectionStatus: status }];
    }
    const wrapper = render(),
      before = store.exportData();
    for (const error of ['请求已取消，费用状态请查看模型用量', '学习天数必须在 1 到 365 之间']) {
      store.error = error;
      await flushPromises();
      // 批次 12A：右上连接入口为纯图标；仍严格核对已保存的连接事实。
      const connector = wrapper.get('.connection-pill');
      expect(connector.text()).toBe('');
      expect(connector.attributes('aria-label')).toBe('AI 连接器');
      expect(connector.attributes('title')).toBe('AI 连接器');
      expect(connector.find('.base-tag').exists()).toBe(false);
      expect(store.selectedMode).toBe(mode);
      expect(store.modelListState.phase).toBe(phase);
      if (mode === 'local') expect(store.localConnection.status).toBe(status);
      if (mode === 'cloud') expect(store.models[0].connectionStatus).toBe(status);
      expect(wrapper.get('#learning-request-error').text()).toContain(error);
      expect(store.exportData()).toBe(before);
    }
    setLanguage('en');
    await flushPromises();
    expect(wrapper.get('.connection-pill').text()).toBe('');
    expect(store.exportData()).toBe(before);
  });
  it('model failure is visible and focused beside recovery without writing or changing an original answer', async () => {
    const store = useConversationLearningStore();
    store.start('12 + 8');
    store.submit('19', true);
    expect(store.state.attempts).toHaveLength(1);
    const wrapper = render(),
      before = store.exportData(),
      scroll = vi.fn(),
      originalScroll = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll;
    try {
      store.error = messages['zh-CN']['learning.notice.networkNoReply'];
      await flushPromises();
      const error = wrapper.get('#learning-request-error');
      expect(document.activeElement).toBe(error.element);
      expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
      expect(error.get('[role="alert"]').text()).toContain('没有可恢复的回复');
      expect(error.element.closest('.conversation-area')).not.toBeNull();
      expect(store.exportData()).toBe(before);
      setLanguage('en');
      await flushPromises();
      expect(error.text()).toContain('there is no reply to recover');
      expect(store.exportData()).toBe(before);
      store.error = '';
      await flushPromises();
      expect(wrapper.find('#learning-request-error').exists()).toBe(false);
      expect(store.exportData()).toBe(before);
    } finally {
      Element.prototype.scrollIntoView = originalScroll;
    }
  });
  it('a chat goal locates its clarification without creating a route or answers', async () => {
    const store = useConversationLearningStore(),
      wrapper = render();
    const scroll = vi.fn(),
      originalScroll = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll;
    try {
      const goalInput = wrapper.get('#learning-composer').findComponent(BaseInput);
      await goalInput.get('textarea').setValue('分数加减与乘除');
      const start = wrapper.get('#learning-composer [aria-label="发送"]');
      await start.trigger('keydown', { key: 'Enter' });
      await flushPromises();
      const entry = wrapper.get('#learning-chat-latest');
      expect(document.activeElement).toBe(entry.element);
      expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
      expect(wrapper.get('.conversation-area').text()).toContain(t('learning.chat.question'));
      expect(store.state.conversations).toHaveLength(1);
      expect(store.state.attempts).toHaveLength(0);
      expect(store.state.questions).toHaveLength(0);
      expect(store.active.journey).toBeUndefined();
    } finally {
      Element.prototype.scrollIntoView = originalScroll;
    }
  });
  it('route choices start empty, remain drafts when cancelled and save only the selected modules', async () => {
    const store = useConversationLearningStore();
    store.start('分数加减与乘除');
    const before = store.exportData(),
      wrapper = render(LearningJourney, { inline: true });
    const button = (label) => wrapper.findAll('button').find((item) => item.text().trim() === label);
    await button(t('learning.klc')).trigger('keydown', { key: 'Enter' });
    expect(wrapper.get('[data-test="journey-save"]').attributes('disabled')).toBeDefined();
    expect(wrapper.findAll('.journey-module-options [aria-pressed="true"]')).toHaveLength(0);
    await wrapper
      .findAll('.journey-module-options button')
      .find((item) => item.text().includes('分数加减'))
      .trigger('keydown', { key: 'Enter' });
    expect(store.exportData()).toBe(before);
    await button(t('learning.k8s')).trigger('keydown', { key: 'Enter' });
    expect(store.exportData()).toBe(before);
    await button(t('learning.klc')).trigger('keydown', { key: 'Enter' });
    expect(wrapper.findAll('.journey-module-options [aria-pressed="true"]')).toHaveLength(0);
    for (const label of ['分数加减', '分数乘除'])
      await wrapper
        .findAll('.journey-module-options button')
        .find((item) => item.text().includes(label))
        .trigger('keydown', { key: 'Enter' });
    await wrapper.get('[data-test="journey-save"]').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(store.active.journey.moduleIds).toEqual(['fraction-add-subtract', 'fraction-multiply-divide']);
    expect(store.state.attempts).toHaveLength(0);
    expect(document.activeElement).toBe(wrapper.get('#learning-journey-panel').element);
    const saved = store.exportData();
    await button(t('learning.k1m')).trigger('keydown', { key: 'Enter' });
    expect(wrapper.findAll('.journey-module-options [aria-pressed="true"]')).toHaveLength(2);
    await button(t('learning.k8s')).trigger('keydown', { key: 'Enter' });
    expect(store.exportData()).toBe(saved);
  });
  it('stopping reveals a primary resume action before the question and preserves original answers', async () => {
    const store = useConversationLearningStore();
    store.start('12 + 8');
    store.submit('20', true);
    const originals = JSON.stringify(store.state.attempts),
      wrapper = render(),
      scroll = vi.fn(),
      originalScroll = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll;
    try {
      // 停止已移入输入区动作条，文字意图仍走同一结构化停止路径。
      expect(wrapper.findAll('#learning-composer [aria-label="停止当前任务"]')).toHaveLength(1);
      await wrapper.get('#learning-composer textarea').setValue('停止当前任务');
      await wrapper.get('#learning-composer [aria-label="发送"]').trigger('keydown', { key: 'Enter' });
      await flushPromises();
      const state = wrapper.get('#learning-stop-state');
      expect(document.activeElement).toBe(state.element);
      expect(
        state.element.compareDocumentPosition(wrapper.get('#active-learning-question').element) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      const resume = state.findComponent(BaseButton);
      expect(resume.props('variant')).toBe('primary');
      expect(store.active.stopped).toBe(true);
      expect(JSON.stringify(store.state.attempts)).toBe(originals);
      const stopped = store.exportData();
      store.error = '请求已取消，费用状态请查看模型用量';
      await flushPromises();
      expect(document.activeElement).toBe(state.element);
      expect(store.exportData()).toBe(stopped);
      await resume.trigger('keydown', { key: 'Enter' });
      await flushPromises();
      expect(store.active.stopped).toBe(false);
      expect(wrapper.find('#learning-stop-state').exists()).toBe(false);
      expect(document.activeElement).toBe(wrapper.get('#active-learning-question').element);
      expect(JSON.stringify(store.state.attempts)).toBe(originals);
    } finally {
      Element.prototype.scrollIntoView = originalScroll;
    }
  });
  it('the composer action bar stops through a structured action without submitting an answer', async () => {
    const store = useConversationLearningStore();
    store.start('12 + 8');
    const wrapper = render();
    await flushPromises();
    const action = vi.spyOn(store, 'dispatchLearningAction');
    const stop = wrapper.findAll('button').find((button) => button.attributes('aria-label') === '停止当前任务');
    expect(stop.element.closest('#learning-composer')).toBe(wrapper.get('#learning-composer').element);
    expect(wrapper.find('.space-header [aria-label="停止当前任务"]').exists()).toBe(false);
    await stop.trigger('tap');
    await flushPromises();
    expect(action).toHaveBeenCalledWith({ type: 'stop' });
    expect(store.active.stopped).toBe(true);
    expect(store.state.attempts).toHaveLength(0);
    expect(document.activeElement).toBe(wrapper.get('#learning-stop-state').element);
    expect(wrapper.findAll('button').some((button) => button.attributes('aria-label') === '停止当前任务')).toBe(false);
  });
  it('resuming a completed group locates its saved results without adding an answer', async () => {
    const store = useConversationLearningStore();
    store.start('分数练习');
    store.configureJourney(store.journeyContext(), {
      title: '分数练习',
      startDay: store.todaySummary.day,
      durationDays: 2,
      minutes: 15,
      mode: 'batch',
      moduleIds: ['fraction-add-subtract']
    });
    const group = store.startTraining(store.journeyContext(), 'fraction-add-subtract', 1);
    store.submitTraining(store.journeyContext(), group.id, ['11/12']);
    await store.send('停止当前任务', { discussionOnly: true });
    const originals = JSON.stringify(store.state.attempts),
      wrapper = render();
    const resume = wrapper.get('#learning-stop-state').findComponent(BaseButton);
    await resume.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(store.active.stopped).toBe(false);
    expect(document.activeElement).toBe(wrapper.get('#learning-training-panel').element);
    expect(wrapper.get('#learning-training-panel').text()).toContain('11/12');
    expect(JSON.stringify(store.state.attempts)).toBe(originals);
  });
  it('opening and reopening a module locates its results; revealing grading evidence preserves every fact', async () => {
    const store = useConversationLearningStore();
    store.start('分数练习');
    store.configureJourney(store.journeyContext(), {
      title: '分数练习',
      startDay: new Date().toLocaleDateString('en-CA', { timeZone: store.state.timezone }),
      durationDays: 2,
      minutes: 15,
      mode: 'batch',
      moduleIds: ['fraction-add-subtract', 'fraction-multiply-divide']
    });
    const group = store.startTraining(store.journeyContext(), 'fraction-add-subtract', 1);
    store.submitTraining(store.journeyContext(), group.id, ['22/24']);
    store.selectTraining(null);
    const before = store.exportData();
    const wrapper = render(LearningJourney);
    const scroll = vi.fn();
    const originalScroll = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll;
    try {
      await wrapper.get('[data-test="journey-module-fraction-add-subtract"]').trigger('keydown', { key: 'Enter' });
      await flushPromises();
      const panel = wrapper.get('#learning-training-panel');
      expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
      expect(document.activeElement).toBe(panel.element);
      expect(panel.text()).toContain('22/24');
      expect(panel.text()).not.toContain('fraction-arithmetic-v1');
      const basis = panel.findAll('button').find((button) => button.text() === t('learning.viewGradingBasis'));
      await basis.trigger('keydown', { key: 'Enter' });
      expect(basis.attributes('aria-expanded')).toBe('true');
      expect(panel.text()).toContain('fraction-arithmetic-v1');
      await basis.trigger('keydown', { key: 'Enter' });
      expect(panel.text()).not.toContain('fraction-arithmetic-v1');
      await wrapper.get('[data-test="journey-module-fraction-add-subtract"]').trigger('keydown', { key: 'Enter' });
      await flushPromises();
      expect(document.activeElement).toBe(panel.element);
      expect(store.exportData()).toBe(before);
    } finally {
      Element.prototype.scrollIntoView = originalScroll;
    }
  });
  it('shows the Muse chat empty state and composer without creating a conversation', async () => {
    const store = useConversationLearningStore(),
      wrapper = render();
    // Disconnected entrance retains intake; the header kitten follows the learning state (brief 2026-11-01).
    expect(wrapper.findComponent(MuseChatEmpty).exists()).toBe(false);
    const identity = wrapper.getComponent(LearningShell).get('.muse-chat-identity');
    expect(identity.get('.brand-mark').classes()).toContain('animated-avatar');
    expect(identity.find('.brand-status').exists()).toBe(false);
    expect(identity.get('.brand-name').text()).toBe('Yozi AI');
    expect(wrapper.get('.space-content').text()).not.toContain('未连接');
    expect(wrapper.get('.space-content').findAllComponents(BaseChip)).toHaveLength(0);
    const composer = wrapper.getComponent(MuseComposer);
    expect(composer.find('textarea').exists()).toBe(true);
    expect(composer.get('textarea').element.value).toBe('');
    expect(store.state.conversations).toHaveLength(0);
  });
  it('the header kitten thinks while replying and returns to the question when the reply or error ends', async () => {
    const store = useConversationLearningStore();
    store.start('12 + 8');
    const wrapper = render();
    const identity = () => wrapper.get('.muse-chat-identity');
    store.busy = true;
    await flushPromises();
    const kitten = () => avatarStateFor(identity().getComponent(AnimatedAvatar).props('business'));
    expect(kitten()).toBe('working');
    expect(identity().get('.brand-status').text()).toBe('正在思考');
    store.busy = false;
    await flushPromises();
    expect(kitten()).toBe('waiting');
    expect(identity().get('.brand-status').text()).toBe('12 + 8');
    expect(wrapper.find('.reply-state').exists()).toBe(false);
    store.busy = true;
    store.error = '合成连接错误';
    await flushPromises();
    expect(wrapper.find('.reply-state').exists()).toBe(false);
    expect(wrapper.get('#learning-request-error [role="alert"]').attributes('role')).toBe('alert');
    expect(store.state.attempts).toHaveLength(0);
  });
  it.each([
    ['20', 'celebrate', 'once', 'mint'],
    ['19', 'encourage', 'once', 'coral']
  ])('reliable answer %s displays %s once from the existing result', async (answer, expected, play, tone) => {
    const store = useConversationLearningStore();
    store.start('12 + 8');
    const wrapper = render();
    store.submit(answer, true);
    await flushPromises();
    const feedback = wrapper.find('.answer-feedback');
    expect(pose(feedback, expected).props('play')).toBe(play);
    expect(feedback.find('.base-tag').classes()).toContain(`base-tag--${tone}`);
    expect(store.state.attempts).toHaveLength(1);
  });
  it('subjective answers stay pending and show static reading without a correct reward', async () => {
    const store = useConversationLearningStore();
    store.start('英文论证写作');
    const wrapper = render();
    store.submit('保留原答及其  spacing。', true);
    await flushPromises();
    expect(pose(wrapper.find('.answer-feedback'), 'read').props('play')).toBe('none');
    expect(wrapper.find('.answer-feedback .base-tag').classes()).toContain('base-tag--apricot');
    expect(pose(wrapper.find('.answer-feedback'), 'celebrate')).toBeUndefined();
    expect(store.state.attempts[0].grade.status).toBe('pending');
    expect(store.state.attempts[0].answer).toBe('保留原答及其  spacing。');
  });
  it('the H5 click listener receives one keyboard activation after a disabled button becomes available', async () => {
    const click = vi.fn();
    const wrapper = render(BaseButton, { disabled: true, onClick: click });
    await wrapper.get('button').trigger('keydown', { key: 'Enter' });
    expect(click).not.toHaveBeenCalled();
    await wrapper.setProps({ disabled: false });
    await wrapper.get('button').trigger('keydown', { key: 'Enter' });
    expect(click).toHaveBeenCalledTimes(1);
    await wrapper.get('button').trigger('keydown', { key: 'Enter', repeat: true });
    expect(click).toHaveBeenCalledTimes(1);
  });
  it('options only change a draft; keyboard submit saves exactly one original answer', async () => {
    const store = useConversationLearningStore();
    store.start('学习物理');
    store.startScience(store.writingContext(), {
      template: 'distance_displacement',
      outward: 6,
      backward: 4,
      direction: 'right'
    });
    const wrapper = render(),
      answer = store.activeQuestion.validation.answer;
    const before = store.exportData();
    await wrapper.find(`.base-option[data-value="${answer}"]`).trigger('keydown', { key: 'Enter' });
    expect(store.exportData()).toBe(before);
    expect(wrapper.find('.composer textarea').element.value).toBe(answer);
    const submit = wrapper.findAll('button').find((button) => button.text().trim() === t('learning.submitAnswer'));
    await submit.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(store.state.attempts).toHaveLength(1);
    expect(store.state.attempts[0].answer).toBe(answer);
    expect(wrapper.find(`.base-option[data-value="${answer}"]`).attributes('data-state')).toBe('correct');
  });
  it('multiple choices have checkbox semantics and keyboard toggling emits only draft values', async () => {
    const wrapper = render(BaseOptions, {
      multiple: true,
      modelValue: ['A'],
      options: [
        { value: 'A', label: 'One' },
        { value: 'B', label: 'Two' }
      ],
      label: 'Choices'
    });
    await wrapper.findAll('[role="checkbox"]')[1].trigger('keydown', { key: ' ' });
    expect(wrapper.emitted('update:modelValue')).toEqual([[['A', 'B']]]);
    expect(wrapper.emitted('submit')).toBeUndefined();
  });
  it('keeps earlier answers reachable from an otherwise empty daily statistics view', async () => {
    const now = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(now - 2 * 86400000);
      const store = useConversationLearningStore();
      store.start('12 + 8');
      store.submit('19', true);
      vi.setSystemTime(now);
      store.refresh();
      const before = store.exportData();
      const wrapper = render(LearningOverview, { view: 'study-detail', initialExpanded: true, showNavigation: false });
      expect(wrapper.get('.overview-empty').text()).toContain(t('learning.history'));
      expect(wrapper.find('.base-stat').exists()).toBe(false);
      await wrapper.get('.overview-empty .base-button').trigger('keydown', { key: 'Enter' });
      await flushPromises();
      expect(wrapper.find('.overview-empty').exists()).toBe(false);
      await wrapper.setProps({ view: 'mistake' });
      expect(wrapper.text()).toContain('19');
      expect(store.exportData()).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });
  it('empty statistics have one action; reduced motion stops the empty avatar animation', async () => {
    const overview = render(LearningOverview);
    expect(overview.findComponent(YoziMascot).exists()).toBe(true);
    expect(overview.findAll('.overview-empty .base-button')).toHaveLength(1);
    expect(overview.find('.base-stat').exists()).toBe(false);
    setMascotReducedMotion(true, { persist: false });
    const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    });
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play');
    const wrapper = render();
    await flushPromises();
    const identity = wrapper.getComponent(LearningShell).get('.muse-chat-identity');
    await flushPromises();
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(identity.get('.brand-mark').attributes('data-avatar-fallback')).toBe('reduce-motion');
    expect(identity.findAll('video')).toHaveLength(0);
    expect(play).not.toHaveBeenCalled();
    expect(wrapper.getComponent(MuseComposer).find('textarea').exists()).toBe(true);
    expect(useConversationLearningStore().state.conversations).toHaveLength(0);
  });
  it('confirmed daily recap celebrates once without changing the saved original answers', async () => {
    const store = useConversationLearningStore();
    store.start('学习数学');
    store.configureJourney(store.journeyContext(), {
      title: '合成路线',
      startDay: store.todaySummary.day,
      durationDays: 7,
      minutes: 30,
      mode: 'batch',
      moduleIds: ['arithmetic-add']
    });
    const group = store.startTraining(store.journeyContext(), 'arithmetic-add', 1);
    const question = store.activeQuestion;
    store.submitTraining(store.journeyContext(), group.id, [String(question.validation.answer)]);
    const wrapper = render(JourneyReview),
      originals = JSON.stringify(store.state.attempts);
    expect(pose(wrapper, 'celebrate')).toBeUndefined();
    await wrapper.find('[data-test="recap-confirm"]').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(pose(wrapper, 'celebrate').props('play')).toBe('once');
    expect(JSON.stringify(store.state.attempts)).toBe(originals);
  });
  it('search focus appears for keyboard use and disappears for pointer use', async () => {
    const wrapper = render(BaseInput, { label: 'Search', hideLabel: true, focusVisibleOnly: true });
    document.dispatchEvent(new Event('pointerdown'));
    await wrapper.find('input').trigger('focus');
    expect(wrapper.find('.base-field__group').classes()).not.toContain('is-keyboard-focused');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    await flushPromises();
    expect(wrapper.find('.base-field__group').classes()).toContain('is-keyboard-focused');
    await wrapper.find('input').trigger('blur');
    expect(wrapper.find('.base-field__group').classes()).not.toContain('is-keyboard-focused');
  });
  it('BaseInput preserves native input events, numeric values, readonly and hidden accessible labels', async () => {
    const wrapper = render(BaseInput, { modelValue: 2, label: 'Quantity', hideLabel: true });
    const input = wrapper.find('input');
    expect(input.element.value).toBe('2');
    expect(input.attributes('aria-label')).toBe('Quantity');
    expect(input.attributes('aria-labelledby')).toBeUndefined();
    await input.setValue('3');
    expect(wrapper.emitted('update:modelValue')).toEqual([['3']]);
    expect(wrapper.emitted('input')).toHaveLength(1);
    await wrapper.setProps({ readonly: true });
    await input.setValue('4');
    expect(wrapper.emitted('input')).toHaveLength(1);
  });
});
describe('learning i18n', () => {
  it('localizes platform receipts, observed preferences and modal actions while preserving authored content', async () => {
    const store = useConversationLearningStore();
    store.start('12 + 8');
    store.submit('20', true);
    store.commit('message.add', { conversationId: store.active.id, role: 'assistant', content: '答对了。' });
    store.commit('profile.set', {
      field: 'foundation',
      value: '本次独立完成',
      source: 'self_report',
      scope: '当前任务'
    });
    const before = store.exportData();
    const wrapper = render();
    setLanguage('en');
    await flushPromises();
    expect(wrapper.get('.message.notice .learning-message-content').text()).toBe('Correct.');
    expect(wrapper.findAll('.message.assistant .learning-message-content').at(-1).text()).toBe('答对了。');
    await wrapper.get('.connection-pill').trigger('tap');
    await flushPromises();
    const profile = wrapper.findAllComponents(BaseButton).find((button) => button.text() === 'Goals and plans');
    expect(profile).toBeTruthy();
    await profile.trigger('tap');
    await flushPromises();
    expect(wrapper.text()).toContain('Completed independently this time');
    expect(wrapper.text()).toContain('本次独立完成');
    const hint = wrapper.findAllComponents(BaseChip).find((button) => button.text() === 'Record a hint used');
    await hint.trigger('tap');
    await flushPromises();
    const modal = wrapper.findAllComponents(CustomModal).find((component) => component.props('visible'));
    expect(modal).toBeTruthy();
    expect(modal.props('confirmText')).toBe('Confirm');
    expect(modal.props('cancelText')).toBe('Cancel');
    expect(modal.props('title')).not.toMatch(/[\u3400-\u9fff]/);
    expect(store.exportData()).toBe(before);
    expect(learningText('这次答错了，已加入错题。')).toBe('Saved to your mistakes. Try again.');
    expect(learningText('作答已保存，判分待核对。')).toBe('Answer saved. Grade pending verification.');
  });
  it('translates every learning style while retaining the stored preference values', async () => {
    const store = useConversationLearningStore();
    store.start('学习物理');
    const before = store.exportData();
    const wrapper = render();
    setLanguage('en');
    await flushPromises();
    await wrapper.get('.connection-pill').trigger('tap');
    await flushPromises();
    const styles = wrapper.get('.rhythm-options').text();
    expect(styles).toContain('Stay focused');
    expect(styles).toContain('Take it step by step');
    expect(styles).toContain('Review and practice');
    expect(styles).not.toMatch(/[\u3400-\u9fff]/);
    expect(store.exportData()).toBe(before);
  });
  it('keeps existing question actions together, with one primary submit and a compact result before them', async () => {
    const store = useConversationLearningStore();
    store.start('12 + 8');
    const wrapper = render();
    await wrapper.get('.connection-pill').trigger('tap');
    await flushPromises();
    const actions = wrapper.get('.question-actions');
    const buttons = actions.findAllComponents(BaseButton);
    expect(buttons.filter((button) => button.props('variant') === 'primary')).toHaveLength(1);
    const chips = actions.findAllComponents(BaseChip);
    expect(chips.length).toBeGreaterThan(0);
    expect(chips.every((chip) => chip.props('action') && chip.props('surface') === 'glass')).toBe(true);
    expect(actions.text()).toContain('要个提示');
    expect(actions.text()).toContain('变式练习');
    expect(actions.text()).toContain('校对题目');
    store.submit('20', true);
    await flushPromises();
    const result = wrapper.get('.answer-feedback');
    expect(pose(result, 'celebrate').props('size')).toBe('small');
    expect(result.element.compareDocumentPosition(actions.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(store.state.attempts).toHaveLength(1);
  });
  it.each(['zh-CN', 'en'])(
    'the %s hint button delivers actual help without asking the learner to supply it',
    async (language) => {
      const store = useConversationLearningStore();
      store.start('12 + 8');
      const wrapper = render();
      setLanguage(language);
      await flushPromises();
      const label = language === 'en' ? 'Give me a hint' : '要个提示';
      await wrapper
        .findAll('button')
        .find((button) => button.text().trim() === label)
        .trigger('tap');
      await flushPromises();
      expect(store.active.pendingHints).toHaveLength(1);
      expect(store.active.pendingHints[0]).toMatchObject({ level: 1 });
      expect(store.active.pendingHints[0].content).not.toContain('20');
      expect(wrapper.text()).toContain(store.active.pendingHints[0].content);
      expect(wrapper.getComponent(CustomModal).props('visible')).toBe(false);
      expect(store.state.attempts).toHaveLength(0);
      expect(store.state.events.filter((event) => event.type === 'teaching.deliver')).toHaveLength(1);
    }
  );
  it('disables help requests and manual help records when the task is stopped', async () => {
    const store = useConversationLearningStore();
    store.start('12 + 8');
    const wrapper = render();
    await store.send('停止当前任务', { discussionOnly: true });
    await flushPromises();
    await wrapper.get('.connection-pill').trigger('tap');
    await flushPromises();
    const hint = wrapper.findAll('button').find((button) => button.text().trim() === '要个提示');
    expect(hint.attributes('disabled')).toBeDefined();
    const record = wrapper.findAll('button').find((button) => button.text().trim() === '记录使用的提示');
    expect(record.attributes('disabled')).toBeDefined();
    expect(store.active.pendingHints).toHaveLength(0);
    expect(store.active.stopped).toBe(true);
  });
  it('uses one-row auto-growing input for the composer without changing draft-only entry', async () => {
    const store = useConversationLearningStore();
    store.start('12 + 8');
    const wrapper = render();
    const input = wrapper.get('.composer').findComponent(BaseInput);
    expect(input.props('autoGrow')).toBe(true);
    expect(input.props('maxRows')).toBe(7);
    expect(input.get('textarea').attributes('rows')).toBe('1');
    const before = store.exportData();
    await input.get('textarea').setValue('第一行\n第二行\n第三行');
    expect(store.exportData()).toBe(before);
    expect(store.state.attempts).toHaveLength(0);
  });
  it('translates the writing shortcuts without changing their stored topic values', () => {
    setLanguage('en', { persist: false });
    for (const topic of [
      '英文通知写作',
      '英文说明写作',
      '英文论证写作',
      '英文邮件写作',
      '英文学术讨论',
      '中文叙事写作'
    ]) {
      expect(learningText(topic)).not.toMatch(/[\u3400-\u9fff]/);
    }
    const store = useConversationLearningStore();
    store.start('英文论证写作');
    expect(store.active.goal).toBe('英文论证写作');
    expect(learningText('英文论证')).toBe('English argument');
    expect(learningText('回应题目')).toBe('Response to the prompt');
    const wrapper = render();
    expect(wrapper.get('.composer textarea').attributes('placeholder')).not.toMatch(/[\u3400-\u9fff]/);
  });
  it('has matching complete dictionaries and preserves interpolation parameters in English', () => {
    expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages['zh-CN']).sort());
    for (const [key, value] of Object.entries(messages['zh-CN'])) {
      expect(messages.en[key], key).toBeTruthy();
      expect(messages.en[key], key).not.toContain('[translation pending]');
      expect(messages.en[key], key).not.toMatch(/[\u3400-\u9fff]/);
      const parameters = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
      expect(parameters(messages.en[key]), key).toEqual(parameters(value));
    }
  });
  it('defaults to Chinese, updates controls immediately, and leaves question and original content untouched', async () => {
    const store = useConversationLearningStore();
    store.start('12 + 8');
    const question = store.activeQuestion.prompt,
      wrapper = render();
    expect(wrapper.text()).toContain('提交答案');
    const before = store.exportData();
    setLanguage('en');
    await flushPromises();
    expect(wrapper.text()).toContain('Submit answer');
    expect(wrapper.text()).not.toContain('要个提示');
    expect(wrapper.text()).toContain(question);
    expect(store.exportData()).toBe(before);
    expect(learningText('模型未连接')).toBe('Model not connected');
    expect(learningText('用户自写的故事')).toBe('用户自写的故事');
  });
});
