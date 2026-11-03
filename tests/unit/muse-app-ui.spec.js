import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
const voiceStart = vi.hoisted(() => vi.fn());
const voiceBuild = vi.hoisted(() => ({ devTest: false }));
vi.mock('@/config/build-channel.js', () => ({
  get DEV_TEST() {
    return voiceBuild.devTest;
  }
}));
beforeEach(() => {
  setActivePinia(createPinia());
  voiceStart.mockClear();
  voiceBuild.devTest = false;
});
import { mount } from '@vue/test-utils';
import MuseComposer from '@/components/business/learning/muse-composer.vue';
vi.mock('@/composables/useVoiceDictation.js', () => ({
  useVoiceDictation: () => ({
    active: false,
    phase: 'idle',
    error: '',
    capability: { platform: 'macos', available: true },
    start: voiceStart,
    stop: vi.fn(),
    cancel: vi.fn()
  })
}));
import { workspaceDrafts } from '@/services/learning/workspace-drafts.js';

let wrapper;
afterEach(() => {
  wrapper?.unmount();
  vi.unstubAllEnvs();
});
describe('Muse App input behavior', () => {
  it('IME confirmation and Shift Enter preserve the draft; plain Enter submits once', async () => {
    wrapper = mount(MuseComposer, { props: { modelValue: '自己的原答' } });
    const textarea = wrapper.get('textarea');
    await textarea.trigger('keydown', { key: 'Enter', isComposing: true });
    await textarea.trigger('keydown', { key: 'Enter', keyCode: 229 });
    await textarea.trigger('keydown', { key: 'Enter', shiftKey: true });
    await textarea.trigger('keydown', { key: 'Enter', repeat: true });
    await textarea.trigger('compositionstart');
    await textarea.trigger('keydown', { key: 'Enter' });
    await textarea.trigger('compositionend');
    expect(wrapper.emitted('submit')).toBeUndefined();
    await textarea.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('submit')).toHaveLength(1);
    expect(wrapper.props('modelValue')).toBe('自己的原答');
  });
  it('waiting exposes a working stop action and never submits another answer', async () => {
    wrapper = mount(MuseComposer, { props: { modelValue: '保留草稿', busy: true } });
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' });
    await wrapper.get('.muse-send').trigger('tap');
    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.emitted('stop')).toHaveLength(1);
  });
  it('navigation drafts stay separate by conversation and are revoked on an identity change', () => {
    const save = vi.spyOn(uni, 'setStorageSync');
    save.mockClear();
    const store = {};
    const first = workspaceDrafts(store);
    first.save('account-one:epoch-one', 'chat-one', { answer: '原答一' });
    first.save('account-one:epoch-one', 'chat-two', { answer: '原答二' });
    const reopened = workspaceDrafts(store);
    expect(reopened.read('account-one:epoch-one', 'chat-one')).toEqual({ answer: '原答一' });
    expect(reopened.read('account-one:epoch-one', 'chat-two')).toEqual({ answer: '原答二' });
    expect(reopened.read('account-two:epoch-two', 'chat-one')).toEqual({});
    expect(reopened.read('account-one:epoch-one', 'chat-one')).toEqual({});
    expect(workspaceDrafts({}).read('account-one:epoch-one', 'chat-one')).toEqual({});
    expect(save).not.toHaveBeenCalled();
    save.mockRestore();
  });
});

// Timestamps and paging must only change presentation, never saved facts.
import { groupLearningMessages } from '@/services/learning/message-groups.js';
import BaseBubble from '@/components/base/base-bubble/base-bubble.vue';
import MuseModelIntake from '@/components/business/learning/muse-model-intake.vue';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import WritingCoach from '@/pages/learning/components/writing-coach.vue';
import { flushPromises } from '@vue/test-utils';
import { learningWriteLease } from '@/services/learning/learning-write-lease.js';

describe('Muse conversation grouping and one shared input', () => {
  it('建档请求等待期间显示三点状态，不生成回复或写入学习事实', () => {
    uni.clearStorageSync();
    const store = useConversationLearningStore();
    store.state.intake = { status: 'pending', requestId: 'synthetic-wait', turns: [] };
    store.intakeBusy = true;
    const before = store.exportData();
    try {
      wrapper = mount(MuseModelIntake);
      expect(wrapper.findAll('.reply-dots > view')).toHaveLength(3);
      expect(wrapper.get('[role="status"]').text()).toContain('正在等待回复');
      expect(store.exportData()).toBe(before);
    } finally {
      store.intakeBusy = false;
      store.$dispose();
      learningWriteLease.release();
    }
  });
  it('groups adjacent same-side messages, breaks at 120 seconds, reversal and unknown time', () => {
    const at = Date.parse('2026-10-21T08:00:00Z');
    const messages = [
      { id: 'a', role: 'assistant', at },
      { id: 'b', role: 'notice', at: at + 4000 },
      { id: 'c', role: 'assistant', at: at + 5000 },
      { id: 'd', role: 'assistant', at: at + 125000 },
      { id: 'e', role: 'user', at: at + 126000 },
      { id: 'f', role: 'user', at: at + 125000 },
      { id: 'g', role: 'user' }
    ];
    const before = JSON.stringify(messages);
    const grouped = groupLearningMessages(messages, 'Asia/Shanghai');
    expect(grouped.map((m) => m.groupPosition)).toEqual([
      'first',
      'middle',
      'last',
      'single',
      'single',
      'single',
      'single'
    ]);
    expect(grouped.slice(0, 3).map((m) => m.groupTime)).toEqual(['16:00', '', '']);
    expect(JSON.stringify(messages)).toBe(before);
    expect(groupLearningMessages(messages.slice(1, 3), 'Asia/Shanghai')[0].groupTime).toBe('16:00');
  });
  it('keeps rendered cards transparent but leaves code samples and rejected tags in plain bubbles', () => {
    const content = [
      '<box surface>已有卡片</box>',
      '```html\n<box surface>代码示例</box>\n```',
      '<script>unsafe()</script>',
      '普通消息'
    ];
    expect(
      groupLearningMessages(
        content.map((content) => ({ role: 'assistant', at: 1, content })),
        'UTC'
      ).map((m) => m.rich)
    ).toEqual([true, false, false, false]);
  });
  it('has no default per-message avatar and keeps a group timestamp outside rich content', () => {
    wrapper = mount(BaseBubble, { props: { rich: true, group: 'first' }, slots: { time: '16:00', default: '原答' } });
    expect(wrapper.find('.base-bubble__avatar').exists()).toBe(false);
    expect(wrapper.get('.base-bubble__time').text()).toBe('16:00');
    expect(wrapper.get('.base-bubble__content').text()).toBe('原答');
  });
  it('a card confirmation can submit a shared draft without rendering a second input', async () => {
    uni.clearStorageSync();
    const store = useConversationLearningStore();
    store.state.intake = {
      status: 'ready',
      requestId: 'synthetic-intake',
      turns: [],
      reply: { message: '目前的基础？', intake: { options: [], input: true, profile: null } }
    };
    const answer = vi.spyOn(store, 'answerModelIntake').mockResolvedValue();
    wrapper = mount(MuseModelIntake, { props: { sharedInput: true, modelValue: '我的基础描述' } });
    expect(wrapper.findAll('input, textarea')).toHaveLength(0);
    expect(answer).not.toHaveBeenCalled();
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '发送')
      .trigger('tap');
    expect(answer).toHaveBeenCalledWith('我的基础描述');
    store.state.intake.reply.intake.profile = { goal: '英语一', subjects: [], minutes: 25 };
    await wrapper.setProps({ modelValue: '调整为英语二' });
    await wrapper.vm.submitDraft();
    expect(answer).toHaveBeenLastCalledWith('调整为英语二');
    answer.mockRestore();
    store.$dispose();
  });
});

it('review keeps the draft local until explicit submission and lets the host derive its rating', async () => {
  uni.clearStorageSync();
  const store = useConversationLearningStore();
  store.startCoach('考研英语写作');
  store.coachSave('profile', { profile: { exam: 'english1', minutes: 25, deadline: null } });
  store.active.coach.library.push({ id: 'synthetic-due', text: 'I am writing to invite you', due: 1, reviews: [] });
  const review = vi.spyOn(store, 'coachReview').mockReturnValue();
  try {
    wrapper = mount(WritingCoach, { global: { stubs: { BaseIcon: true, PrivacyPopup: true } } });
    expect(wrapper.findAll('textarea')).toHaveLength(1);
    const before = store.exportData();
    await wrapper.get('.muse-composer textarea').setValue('I am writing to invite you to a study group.');
    expect(store.exportData()).toBe(before);
    await wrapper.get('.muse-composer textarea').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(review).toHaveBeenCalledOnce();
    expect(review).toHaveBeenCalledWith('synthetic-due', 'I am writing to invite you to a study group.');
    expect(wrapper.findAll('button').map((button) => button.text())).not.toContain('记得');
  } finally {
    wrapper?.unmount();
    wrapper = null;
    review.mockRestore();
    store.$dispose();
    learningWriteLease.release();
  }
});

it('S3 A5 keeps unverified voice entry hidden by default in a QA build', () => {
  voiceBuild.devTest = true;
  wrapper = mount(MuseComposer, { props: { modelValue: '原答' } });
  expect(wrapper.findAll('button')).toHaveLength(2);
  expect(wrapper.findAll('button').some((button) => button.attributes('icon') === 'microphone')).toBe(false);
});

it('S19 isolated voice acceptance requires an explicit start and leaves the draft unsubmitted', async () => {
  vi.stubEnv('VITE_YOZI_VOICE_ACCEPTANCE', '1');
  voiceBuild.devTest = true;
  wrapper = mount(MuseComposer, { props: { modelValue: '自己的原答' } });
  const microphone = wrapper.get('button[aria-label="普通话听写"]');
  expect(voiceStart).not.toHaveBeenCalled();
  expect(wrapper.emitted('submit')).toBeUndefined();
  await microphone.trigger('tap');
  expect(voiceStart).toHaveBeenCalledTimes(1);
  expect(wrapper.props('modelValue')).toBe('自己的原答');
  expect(wrapper.emitted('submit')).toBeUndefined();
});

it('S19 voice acceptance flag cannot expose the microphone in a production build', () => {
  vi.stubEnv('VITE_YOZI_VOICE_ACCEPTANCE', '1');
  voiceBuild.devTest = false;
  wrapper = mount(MuseComposer, { props: { modelValue: '自己的原答' } });
  expect(wrapper.find('button[aria-label="普通话听写"]').exists()).toBe(false);
  expect(voiceStart).not.toHaveBeenCalled();
});
