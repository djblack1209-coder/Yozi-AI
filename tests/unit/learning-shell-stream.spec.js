import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { readFileSync } from 'node:fs';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import {
  generateLearningTurn,
  fetchLearningModels,
  cancelLearningTurn,
  testLearningModel
} from '@/services/api/domains/learning.api.js';
import LearningPage from '@/pages/learning/index.vue';
import WritingCoach from '@/pages/learning/components/writing-coach.vue';
import LearningMessage from '@/pages/learning/components/learning-message.vue';
import BaseBubble from '@/components/base/base-bubble/base-bubble.vue';
import MuseFeedbackCard from '@/components/business/learning/muse-feedback-card.vue';
import LearningShell from '@/components/business/learning/learning-shell.vue';
import { bindMessageFollow } from '@/components/business/learning/message-follow.js';
import { storageService } from '@/services/storageService.js';
import { learningWriteLease } from '@/services/learning/learning-write-lease.js';
import { coachFixture } from '../fixtures/writing-coach.js';
import { artifactWorkspace, openStudentArtifact, studentEssaySources } from '@/services/learning/learning-artifacts.js';
import { artifactFixtureState } from '../fixtures/learning-artifacts.js';
import { INTAKE_CHOICES } from '../../laf-backend/functions/_shared/learning-intake.js';

vi.mock('@dcloudio/uni-app', () => ({ onShow: vi.fn(), onHide: vi.fn(), onLoad: vi.fn(), onBackPress: vi.fn() }));
vi.mock('@/services/api/domains/learning.api.js', async (original) => ({
  ...(await original()),
  generateLearningTurn: vi.fn(),
  fetchLearningModels: vi.fn(),
  cancelLearningTurn: vi.fn(async () => ({ success: true })),
  testLearningModel: vi.fn()
}));
const model = {
  id: 'shell-fixture',
  model: 'explicit',
  provider: 'synthetic',
  source: 'byok',
  configured: true,
  capabilities: { structured: true, stream: true }
};
const stubs = {
  BaseIcon: true,
  AnimatedAvatar: true,
  LearningShell: { template: '<div><slot /><slot name="composer" /></div>' }
};
let store, wrappers;
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
beforeEach(() => {
  uni.clearStorageSync();
  localStorage.clear();
  setActivePinia(createPinia());
  wrappers = [];
  uni.setStorageSync('EXAM_USER_ID', 'shell-stream-owner');
  uni.setStorageSync('EXAM_TOKEN', 'synthetic-shell-token');
  fetchLearningModels.mockResolvedValue({
    success: true,
    data: { models: [model], presets: [], platformEnabled: false }
  });
  store = useConversationLearningStore();
  store.start('理解函数');
  store.models = [model];
  store.modelId = model.id;
  store.selectedMode = 'cloud';
  store.sharingAllowed = true;
});
afterEach(async () => {
  wrappers.forEach((w) => w.unmount());
  store.cancel();
  store.$dispose();
  learningWriteLease.release();
  await flushPromises();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
function render(component = LearningPage, extra = {}) {
  const wrapper = mount(component, { attachTo: document.body, global: { stubs: { ...stubs, ...extra } } });
  wrappers.push(wrapper);
  return wrapper;
}
function receipt(body, patch = {}) {
  return {
    success: true,
    data: {
      requestId: body.requestId,
      requestBinding: body.requestBinding,
      modelId: model.id,
      model: 'explicit',
      message: '先区分观点与依据。',
      tools: [],
      ...patch
    }
  };
}
describe('Learning record loading', () => {
  it.each([false, true])('restores records on page show with writing mode %s', async (writing) => {
    if (writing) store.startCoach('考研英语二写作');
    const refresh = vi.spyOn(store, 'refresh');
    const readAccountRecords = vi.spyOn(store, 'readAccountRecords');
    const hookIndex = onShow.mock.calls.length;
    const wrapper = render(LearningPage, { LearningShell: false });
    expect(wrapper.findComponent(WritingCoach).exists()).toBe(writing);
    expect(refresh).not.toHaveBeenCalled();
    await onShow.mock.calls[hookIndex][0]();
    expect(readAccountRecords).toHaveBeenCalledTimes(1);
  });

  it('refreshes records when the shell is mounted on its own', () => {
    const refresh = vi.spyOn(store, 'refresh');
    render(LearningShell, { LearningShell: false });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
describe('S2 continuous reply', () => {
  it('S4 A1 covers the composer and reserved bottom space with an opaque dock', () => {
    const wrapper = render(LearningPage, { LearningShell: false });
    expect(wrapper.get('.muse-composer-dock').find('.muse-composer').exists()).toBe(true);
    const css = readFileSync('src/components/business/learning/learning-space.css', 'utf8');
    expect(css).toMatch(
      /\.muse-composer-dock \{[^}]*bottom: 0;[^}]*padding: 0 12px max\(18px, env\(safe-area-inset-bottom\)\);[^}]*background: var\(--paper\)/s
    );
    expect(css).toContain('padding-bottom: max(12px, env(safe-area-inset-bottom))');
  });
  it('S4 A2 removes the numeric chapter date without removing record navigation or earlier-day paging', async () => {
    const fixtureState = artifactFixtureState('shell-stream-owner');
    fixtureState.conversations[0].trainingGroups = [
      { id: 'saved-group', day: '2026-10-30', moduleId: 'writing', questionKeys: [] }
    ];
    expect(storageService.save('conversation_learning_v1', fixtureState, true)).toBe(true);
    store.refresh();
    store.selectedConversationId = 'essay-chat';
    const wrapper = render(LearningShell, { LearningShell: false });
    await nextTick();
    expect(wrapper.find('.directory-date').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('10 / 30');
    const modules = wrapper.findAll('.directory-module');
    expect(modules.length).toBeGreaterThan(0);
    const locate = vi.spyOn(store, 'locateConversation').mockImplementation(() => {});
    await modules[0].trigger('tap');
    expect(locate).toHaveBeenCalledWith('essay-chat', '2026-10-30', expect.any(String));
    const source = readFileSync('src/components/business/learning/learning-shell.vue', 'utf8');
    expect(source).toContain('directoryDayLimit += 7');
  });
  it('brings the conversation back when the student picks it from an open panel', async () => {
    store.startCoach('考研英语二写作');
    const dismissOverlay = vi.fn(() => true);
    const wrapper = render(LearningShell, { LearningShell: false });
    await wrapper.setProps({ dismissOverlay });
    const locate = vi.spyOn(store, 'locateConversation').mockImplementation(() => {});
    await wrapper.get('.recent-conversation [aria-label]').trigger('tap');
    expect(dismissOverlay).toHaveBeenCalledTimes(1);
    expect(locate).toHaveBeenCalledWith(store.active.id);
    await wrapper.get('[aria-label="对话"]').trigger('tap');
    expect(dismissOverlay).toHaveBeenCalledTimes(2);
  });
  it.each(['chat', 'coach'])('S3 hides an empty stopped %s reply and retains partial text', async (kind) => {
    if (kind === 'coach') {
      store.startCoach('考研英语二写作');
      store.coachSave('profile', { profile: { exam: 'english2', minutes: 25, deadline: null } });
    }
    const wrapper = render(kind === 'coach' ? WritingCoach : LearningPage);
    store.reply = {
      kind,
      id: 'stopped:reply',
      requestId: 'stopped',
      at: Date.now(),
      conversationId: store.active.id,
      pending: false,
      cancelled: true,
      content: ''
    };
    await nextTick();
    expect(wrapper.find('[id="stopped:reply"]').exists()).toBe(false);
    store.reply.content = '已收到的部分';
    await nextTick();
    expect(wrapper.get('[id="stopped:reply"]').text()).toContain('已收到的部分');
  });
  it('S3 places the cancellation notice before the composer without duplicating the error block', async () => {
    store.error = '请求已取消，费用状态请查看模型用量';
    const wrapper = render(LearningPage, { LearningShell: false });
    await nextTick();
    expect(wrapper.get('.muse-composer-dock [role="status"]').text()).toBe(store.error);
    expect(wrapper.get('#learning-request-error').classes()).toContain('shell-notice');
    expect(wrapper.find('.muse-composer-dock').element.firstElementChild.classList.contains('shell-notice')).toBe(true);
    const css = readFileSync('src/components/business/learning/learning-space.css', 'utf8');
    expect(css).toContain('.has-composer.has-notice .space-content');
  });
  it('S3 reserves the header kitten outside the history scroller', () => {
    const wrapper = render(LearningShell, { LearningShell: false });
    expect(wrapper.find('.muse-chat-identity animated-avatar-stub.brand-mark').exists()).toBe(true);
    const css = readFileSync('src/components/business/learning/learning-space.css', 'utf8');
    expect(css).toMatch(/\.is-chat \.space-content \{[^}]*margin-top: calc\(116px[^}]*padding-top: 16px/s);
  });

  it('prepares before the first byte, grows one message, completes in the same DOM node, and returns the cat to idle', async () => {
    const wait = deferred();
    generateLearningTurn.mockReturnValue(wait.promise);
    const wrapper = render();
    const sending = store.send('请讲解', { id: 'same-node' });
    expect(store.reply).toMatchObject({ pending: true, content: '' });
    await nextTick();
    const node = wrapper.get('[id="same-node:reply"]').element;
    expect(node.querySelector('.learning-message-origin')).toBeNull();
    expect(node.querySelector('.reply-progress')).not.toBeNull();
    expect(wrapper.get('[data-avatar-state="working"]').exists()).toBe(true);
    await flushPromises();
    const [body, options] = generateLearningTurn.mock.calls.at(-1);
    options.onPreview('先区分');
    await nextTick();
    expect(wrapper.get('[id="same-node:reply"]').element).toBe(node);
    expect(node.querySelector('.learning-message-origin')?.textContent.trim()).toBe('AI 生成');
    expect(wrapper.get('[data-avatar-state="making"]').exists()).toBe(true);
    expect(JSON.stringify(store.state)).not.toContain('先区分');
    wait.resolve(
      receipt(body, {
        contentBlocks: { version: 1, items: [{ kind: 'knowledge', title: '观点', body: '依据支持观点。' }] },
        tools: [
          { name: 'plan', arguments: { reason: '独立检验', tasks: [{ title: '说明依据', condition: 'manual' }] } }
        ]
      })
    );
    await sending;
    await nextTick();
    expect(wrapper.get('[id="same-node:reply"]').element).toBe(node);
    expect(node.querySelector('.learning-message-origin.request-arrival')).not.toBeNull();
    expect(wrapper.get('[id="same-node:reply"]').classes()).not.toContain('base-bubble--rich');
    const ids = wrapper.findAll('.conversation-day .message').map((message) => message.attributes('id'));
    expect(ids.indexOf('same-node:reply')).toBe(ids.indexOf('same-node:message') + 1);
    expect(wrapper.get('[id="same-node:reply"] [data-avatar-state="idle"]').exists()).toBe(true);
    expect(store.active.messages.filter((m) => m.id === 'same-node:reply')).toHaveLength(1);
    // Display order remains stable when the current transient reply is released
    // (also the state seen after reopening the saved conversation).
    store.reply = null;
    await nextTick();
    const reopenedIds = wrapper.findAll('.conversation-day .message').map((message) => message.attributes('id'));
    expect(reopenedIds.indexOf('same-node:reply')).toBe(reopenedIds.indexOf('same-node:message') + 1);
    expect(wrapper.get('[id="same-node:reply"] .learning-message-origin').text()).toBe('AI 生成');
    expect(wrapper.get('[id="same-node:reply"]').text()).toContain('观点');
    expect(wrapper.get('[id="same-node:message"]').text()).not.toContain('AI 生成');
  });
  it.each(['failure', 'stop'])(
    '%s returns immediately to idle; late previews/results cannot save facts',
    async (kind) => {
      const wait = deferred();
      generateLearningTurn.mockReturnValue(wait.promise);
      const wrapper = render();
      const pending = store.send('请讲解', { id: 'late' });
      await flushPromises();
      const [body, options] = generateLearningTurn.mock.calls.at(-1);
      options.onPreview('临时说明');
      if (kind === 'stop') {
        store.cancel();
        expect(store.busy).toBe(false);
        expect(store.reply.pending).toBe(false);
        expect(() => options.onPreview('迟到的分片')).toThrow();
      }
      const snapshot = store.exportData();
      wait.resolve(
        kind === 'failure'
          ? { success: false, error: 'UPSTREAM_FAILED' }
          : receipt(body, {
              tools: [
                { name: 'plan', arguments: { reason: '迟到', tasks: [{ title: '迟到计划', condition: 'manual' }] } }
              ]
            })
      );
      await pending;
      expect(store.reply.pending).toBe(false);
      expect(store.reply.content).toBe(kind === 'stop' ? '临时说明' : '');
      expect(wrapper.find('[id="late:reply"]').exists()).toBe(kind === 'stop');
      expect(store.state.plans).toHaveLength(0);
      expect(store.state.attempts).toHaveLength(0);
      if (kind === 'stop') expect(store.exportData()).toBe(snapshot);
    }
  );
  it('keeps corrections once and rejects the stopped generation even when it resolves after the correction', async () => {
    const old = deferred(),
      fresh = deferred();
    generateLearningTurn.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const first = store.send('讲原来的题', { id: 'original' });
    await flushPromises();
    const oldCall = generateLearningTurn.mock.calls.at(-1);
    const options = { id: 'corrected', correctionOf: 'original:message' };
    const second = store.send('改为讲解依据', options),
      repeated = store.send('改为讲解依据', options);
    await flushPromises();
    const newCall = generateLearningTurn.mock.calls.at(-1);
    old.resolve(receipt(oldCall[0], { message: '迟到旧回复' }));
    await first;
    expect(store.busy).toBe(true);
    expect(store.reply.requestId).toBe('corrected');
    newCall[1].onPreview('新的说明');
    fresh.resolve(receipt(newCall[0]));
    await Promise.all([second, repeated]);
    expect(generateLearningTurn).toHaveBeenCalledTimes(2);
    expect(store.active.messages.filter((m) => m.id === 'corrected:message')).toHaveLength(1);
    expect(store.active.messages.filter((m) => m.id === 'corrected:reply')).toHaveLength(1);
    expect(JSON.stringify(store.state)).not.toContain('迟到旧回复');
    expect(cancelLearningTurn).toHaveBeenCalledOnce();
  });
  it('keeps a structured preview as a placeholder until a complete validated card arrives', async () => {
    const blocks = { version: 1, items: [{ kind: 'knowledge', title: '观点与依据', body: '依据需要支持观点。' }] };
    const wrapper = mount(LearningMessage, {
      props: { pending: true, content: '<box>半截', contentBlocks: blocks },
      global: { stubs: { BaseIcon: true } }
    });
    wrappers.push(wrapper);
    expect(wrapper.find('.learning-card-placeholder').exists()).toBe(true);
    expect(wrapper.find('.rich-box, .learning-content-cards').exists()).toBe(false);
    await wrapper.setProps({ pending: false, content: '完整说明', contentBlocks: blocks });
    expect(wrapper.find('.learning-card-placeholder').exists()).toBe(false);
    expect(wrapper.text()).toContain('观点与依据');
    expect(wrapper.emitted('submit')).toBeUndefined();
  });
  it('prepares a writing card during model lookup and displays the complete exercise without auto answering', async () => {
    store.startCoach('考研英语二写作');
    store.coachSave('profile', { profile: { exam: 'english2', minutes: 25, deadline: null } });
    const catalog = deferred(),
      wait = deferred();
    fetchLearningModels.mockReturnValue(catalog.promise);
    generateLearningTurn.mockReturnValue(wait.promise);
    const wrapper = render(WritingCoach);
    const pending = store.requestCoach('diagnostic');
    await nextTick();
    expect(wrapper.get('[data-avatar-state="working"]').exists()).toBe(true);
    catalog.resolve({ success: true, data: { models: [model], presets: [], platformEnabled: false } });
    await flushPromises();
    const [body, options] = generateLearningTurn.mock.calls.at(-1);
    options.onPreview('正在准备');
    await nextTick();
    const node = wrapper.get('.coach-reply').element;
    expect(wrapper.find('.practice-sheet').exists()).toBe(false);
    wait.resolve(receipt(body, { coach: coachFixture(body.learningContext.coach) }));
    await pending;
    await nextTick();
    expect(wrapper.get('.coach-reply').element).toBe(node);
    expect(store.active.coach.diagnostic.cards).toHaveLength(5);
    expect(store.active.coach.diagnostic.answers).toHaveLength(0);
    expect(store.state.attempts).toHaveLength(0);
  });
  it('retains a proposed plan until an explicit student confirmation', async () => {
    generateLearningTurn.mockImplementation(async (body) =>
      receipt(body, {
        tools: [
          {
            name: 'plan',
            arguments: { reason: '先理解再检验', tasks: [{ title: '独立解释依据', condition: 'manual' }] }
          }
        ]
      })
    );
    await store.send('请建议学习计划', { id: 'proposed' });
    expect(store.state.plans).toHaveLength(0);
    expect(store.active.messages.filter((m) => m.proposal?.type === 'plan.set')).toHaveLength(1);
    expect(store.state.attempts).toHaveLength(0);
  });
  it('keeps grading as a placeholder until the complete feedback receipt, preserving all explicit originals', async () => {
    store.startCoach('考研英语二写作');
    store.coachSave('profile', { profile: { exam: 'english2', minutes: 25, deadline: null } });
    generateLearningTurn.mockImplementationOnce(async (body) =>
      receipt(body, { coach: coachFixture(body.learningContext.coach) })
    );
    await store.requestCoach('diagnostic');
    for (const card of store.active.coach.diagnostic.cards)
      store.coachSave('answer', { target: 'diagnostic', cardId: card.id, answer: 'I am writing to invite you.' });
    const originals = JSON.stringify(
        store.active.coach.diagnostic.answers.map(({ id, cardId, answer }) => ({ id, cardId, answer }))
      ),
      wait = deferred();
    generateLearningTurn.mockReturnValueOnce(wait.promise);
    const wrapper = render(WritingCoach),
      pending = store.requestCoach('feedback', 'diagnostic');
    await flushPromises();
    const [body, options] = generateLearningTurn.mock.calls.at(-1);
    options.onPreview('正在核对原答');
    await nextTick();
    expect(wrapper.findComponent(MuseFeedbackCard).exists()).toBe(false);
    expect(wrapper.find('.learning-card-placeholder').exists()).toBe(true);
    wait.resolve(receipt(body, { coach: coachFixture(body.learningContext.coach) }));
    await pending;
    await nextTick();
    expect(wrapper.findComponent(MuseFeedbackCard).exists()).toBe(true);
    expect(
      JSON.stringify(store.active.coach.diagnostic.answers.map(({ id, cardId, answer }) => ({ id, cardId, answer })))
    ).toBe(originals);
  });
  it('does not let a stopped coach result replace the cancellation with a late UI error', async () => {
    store.startCoach('考研英语二写作');
    store.coachSave('profile', { profile: { exam: 'english2', minutes: 25, deadline: null } });
    const wait = deferred();
    generateLearningTurn.mockReturnValue(wait.promise);
    const wrapper = render(WritingCoach);
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '开始摸底')
      .trigger('tap');
    await flushPromises();
    const [body] = generateLearningTurn.mock.calls.at(-1);
    store.cancel();
    await nextTick();
    const before = wrapper.text();
    wait.resolve(receipt(body, { coach: coachFixture(body.learningContext.coach) }));
    await flushPromises();
    expect(wrapper.text()).toBe(before);
    expect(store.active.coach.diagnostic).toBeNull();
  });
  // 11-01 brief: WeChat-style rows put an avatar beside every message, the student's included.
  it('uses Muse 2 user bubble parameters and shows the student avatar on the right', async () => {
    const wrapper = mount(BaseBubble, { props: { author: 'user', avatar: true } });
    wrappers.push(wrapper);
    expect(wrapper.find('.base-bubble__avatar--user').exists()).toBe(true);
    expect(wrapper.find('.base-bubble__still').exists()).toBe(false);
    await wrapper.setProps({ avatarSrc: '/fixture-student-photo.png' });
    expect(wrapper.get('.base-bubble__photo').attributes('src')).toBe('/fixture-student-photo.png');
    await wrapper.get('.base-bubble__photo').trigger('error');
    expect(wrapper.find('.base-bubble__photo').exists()).toBe(false);
    const css = readFileSync('src/components/base/base-bubble/base-bubble.vue', 'utf8');
    expect(css).toContain('border-radius: 22px');
    expect(css).toContain('font-size: 16px');
    expect(css).toContain('line-height: 26px');
  });
  it('discards a late intake result after stop, including a transport that ignores cancellation', async () => {
    store.commit('intake.request', { modelId: model.id, requestId: 'intake-first', explicit: true });
    store.commit('intake.result', {
      modelId: model.id,
      requestId: 'intake-first',
      reply: {
        message: '你在准备什么？',
        intake: { options: INTAKE_CHOICES, input: true, profile: null },
        question: null,
        tools: []
      }
    });
    const wait = deferred();
    testLearningModel.mockReturnValue(wait.promise);
    const pending = store.answerModelIntake('考研英语二');
    await flushPromises();
    const rejected = expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
    store.cancelModelIntake();
    const snapshot = store.exportData();
    expect(store.intakeBusy).toBe(false);
    expect(store.reply.pending).toBe(false);
    wait.resolve({ success: true, data: { message: '迟到的建档结果' } });
    await rejected;
    expect(store.exportData()).toBe(snapshot);
    expect(store.reply.content).toBe('');
  });
});
describe('S2 reading and Escape ownership', () => {
  it('S4 B1 Escape first dismisses overlays, then the artifact panel, then generation', async () => {
    const item = studentEssaySources(artifactFixtureState(store.state.owner))[0];
    const close = vi.fn(() => {
      artifactWorkspace(store).target = null;
    });
    const wrapper = render(LearningShell, {
      LearningShell: false,
      MuseArtifactPanel: { template: '<div />', methods: { close } }
    });
    vi.spyOn(wrapper.element, 'getClientRects').mockReturnValue([{}]);
    openStudentArtifact(store, item);
    await nextTick();
    const cancel = vi.spyOn(store, 'cancel');
    store.busy = true;
    let overlay = true;
    await wrapper.setProps({
      dismissOverlay: () => {
        const was = overlay;
        overlay = false;
        return was;
      }
    });
    const escape = () =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    escape();
    expect(close).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
    escape();
    expect(close).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();
    await nextTick();
    escape();
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('anchors the visible reply when a complete card and inline profile arrive in separate updates', async () => {
    const scroller = document.createElement('div'),
      reply = document.createElement('div');
    reply.dataset.replyPending = 'true';
    scroller.append(reply);
    document.body.append(scroller);
    let height = 1000,
      scrollTop = 600,
      absoluteTop = 900,
      paint;
    Object.defineProperties(scroller, {
      scrollTop: {
        get: () => scrollTop,
        set: (value) => {
          scrollTop = Math.max(0, Math.min(value, height - 400));
        }
      },
      scrollHeight: { get: () => height },
      clientHeight: { get: () => 400 }
    });
    scroller.getBoundingClientRect = () => ({ top: 0, bottom: 400 });
    reply.getBoundingClientRect = () => ({ top: absoluteTop - scroller.scrollTop });
    vi.stubGlobal('requestAnimationFrame', (callback) => {
      paint = callback;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    scroller.scrollTop = 600;
    const release = bindMessageFollow(scroller);
    scroller.append(document.createTextNode('preview'));
    await flushPromises();
    // Use a browser-clamped scroll range for the completion geometry.
    scroller.scrollTop = 600;
    scroller.dispatchEvent(new Event('scroll'));
    scroller.append(document.createTextNode('preview 2'));
    await flushPromises();
    // Record the visible pending reply after the follow update.
    const before = reply.getBoundingClientRect().top;
    height = 1500;
    reply.removeAttribute('data-reply-pending');
    await flushPromises();
    absoluteTop += 250;
    height += 250;
    scroller.append(document.createTextNode('profile'));
    await flushPromises();
    paint();
    expect(reply.getBoundingClientRect().top).toBe(before);
    expect(scroller.dataset.followLatest).toBe('false');
    release();
    scroller.remove();
    vi.unstubAllGlobals();
  });
  it('does not let an inline profile card consume the generation Escape', async () => {
    const wrapper = render(LearningPage, { LearningShell: false });
    await wrapper.get('button[aria-label="完善学习档案"]').trigger('tap');
    const shell = wrapper.getComponent(LearningShell);
    store.busy = true;
    expect(shell.props('dismissOverlay')()).toBe(false);
    expect(wrapper.find('[data-test="profile-draft"]').exists()).toBe(true);
  });
  it('does not pull history down, and resumes following when the student returns within 48px', async () => {
    const scroller = document.createElement('div');
    document.body.append(scroller);
    let height = 1000;
    Object.defineProperties(scroller, { scrollHeight: { get: () => height }, clientHeight: { get: () => 400 } });
    scroller.scrollTop = 600;
    const release = bindMessageFollow(scroller);
    scroller.scrollTop = 100;
    scroller.dispatchEvent(new Event('scroll'));
    height = 1300;
    scroller.append(document.createTextNode('new'));
    await flushPromises();
    expect(scroller.scrollTop).toBe(100);
    scroller.scrollTop = 900;
    scroller.dispatchEvent(new Event('scroll'));
    height = 1500;
    scroller.append(document.createTextNode('more'));
    await flushPromises();
    expect(scroller.scrollTop).toBe(1500);
    release();
    scroller.remove();
  });
  it.each(['dialog', 'page overlay', 'shell menu'])(
    'Escape closes only the %s; the next Escape stops generation',
    async (layer) => {
      const wrapper = render(LearningShell, { LearningShell: false });
      vi.spyOn(wrapper.element, 'getClientRects').mockReturnValue([{}]);
      const cancel = vi.spyOn(store, 'cancel');
      store.busy = true;
      let dialog;
      if (layer === 'dialog') {
        dialog = document.createElement('div');
        dialog.setAttribute('role', 'dialog');
        document.body.append(dialog);
        const close = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            dialog.remove();
            document.removeEventListener('keydown', close);
          }
        };
        document.addEventListener('keydown', close);
      } else if (layer === 'page overlay') {
        let open = true;
        await wrapper.setProps({
          dismissOverlay: () => {
            if (!open) return false;
            open = false;
            return true;
          }
        });
      } else {
        await wrapper.get('button[aria-label="搜索题目、原答或对话"]').trigger('tap');
        await nextTick();
      }
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await nextTick();
      expect(cancel).not.toHaveBeenCalled();
      expect(store.busy).toBe(true);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      expect(cancel).toHaveBeenCalledOnce();
      expect(store.busy).toBe(false);
    }
  );
});

it('S3 changing accounts clears the foreign draft and returning restores the original conversation draft', async () => {
  const wrapper = render();
  const id = store.selectedConversationId;
  await wrapper.get('.muse-composer textarea').setValue('账号甲未提交草稿');
  await storageService.saveLoginSession({ userId: 'shell-owner-b', token: 'synthetic-b' });
  store.refresh();
  await flushPromises();
  expect(wrapper.get('.muse-composer textarea').element.value).toBe('');
  expect(store.modelId).toBe('');
  await storageService.saveLoginSession({ userId: 'shell-stream-owner', token: 'synthetic-a-return' });
  store.refresh();
  await flushPromises();
  expect(store.selectedConversationId).toBe(id);
  expect(wrapper.get('.muse-composer textarea').element.value).toBe('账号甲未提交草稿');
});

describe('S3 sidebar and navigation', () => {
  it.each(['plan', 'materials', 'settings'])(
    'does not put the chat directory behind the %s workspace sidebar',
    async (active) => {
      const wrapper = render(LearningShell, { LearningShell: false });
      wrapper.unmount();
      const page = mount(LearningShell, { props: { active }, global: { stubs: { BaseIcon: true } } });
      wrappers.push(page);
      await nextTick();
      expect(page.find('.space-sidebar').exists()).toBe(false);
      expect(page.find('.rail-settings').exists()).toBe(true);
    }
  );

  it('defaults to 240/open, keeps a close action for modal search and restores the device layout', async () => {
    let wrapper = render(LearningShell, { LearningShell: false });
    vi.spyOn(wrapper.element, 'getClientRects').mockReturnValue([{}]);
    expect(wrapper.get('.directory-resize').attributes('aria-valuenow')).toBe('240');
    expect(wrapper.find('.sidebar-close').exists()).toBe(false);
    expect(wrapper.get('.sidebar-options').attributes('aria-label')).toBe('会话选项');
    const facts = store.exportData();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
    await nextTick();
    expect(wrapper.get('.space-sidebar').attributes('aria-modal')).toBe('true');
    expect(wrapper.get('.sidebar-close').attributes('aria-label')).toBeTruthy();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    expect(wrapper.find('.sidebar-close').exists()).toBe(false);
    expect(store.exportData()).toBe(facts);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true }));
    await nextTick();
    expect(uni.getStorageSync('yozi_shell_sidebar_v1')).toMatchObject({ collapsed: true, width: 240 });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, repeat: true, bubbles: true }));
    expect(uni.getStorageSync('yozi_shell_sidebar_v1').collapsed).toBe(true);
    wrapper.unmount();
    wrapper = render(LearningShell, { LearningShell: false });
    vi.spyOn(wrapper.element, 'getClientRects').mockReturnValue([{}]);
    expect(wrapper.find('.space-sidebar').exists()).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }));
    await nextTick();
    await wrapper.get('.directory-resize').trigger('keydown', { key: 'Home' });
    expect(uni.getStorageSync('yozi_shell_sidebar_v1').width).toBe(180);
    await wrapper.get('.directory-resize').trigger('keydown', { key: 'End' });
    expect(uni.getStorageSync('yozi_shell_sidebar_v1').width).toBe(420);
    await wrapper.get('.directory-resize').trigger('dblclick');
    expect(wrapper.get('.directory-resize').attributes('aria-valuenow')).toBe('240');
    expect(uni.getStorageSync('yozi_shell_sidebar_v1').width).toBe(240);
  });
  it('reorders/hides rail entries and rejects a corrupt config without touching the conversation', async () => {
    const wrapper = render(LearningShell, { LearningShell: false });
    const id = store.selectedConversationId,
      before = store.exportData();
    const apply = uni.$on.mock.calls.findLast(([name]) => name === 'shellNavigationChanged')[1];
    apply({
      schema: 'yozi.shell.navigation.v1',
      modules: [
        { id: 'materials', visible: true },
        { id: 'learning', visible: true },
        { id: 'plan', visible: false }
      ]
    });
    await nextTick();
    expect(wrapper.findAll('.rail-group button').map((button) => button.attributes('aria-label'))).toEqual([
      '资料库',
      '对话'
    ]);
    apply({ modules: [] });
    await nextTick();
    expect(wrapper.findAll('.rail-group button')).toHaveLength(2);
    expect(store.selectedConversationId).toBe(id);
    expect(store.exportData()).toBe(before);
    expect(wrapper.get('.rail-settings').exists()).toBe(true);
  });
});
