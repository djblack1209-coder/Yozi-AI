import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { h, nextTick, reactive, ref } from 'vue';
import { workspaceDrafts } from '@/services/learning/workspace-drafts.js';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { learningWriteLease } from '@/services/learning/learning-write-lease.js';
import MuseChatEmpty from '@/components/business/learning/muse-chat-empty.vue';
import MuseModelIntake from '@/components/business/learning/muse-model-intake.vue';
import MuseComposer from '@/components/business/learning/muse-composer.vue';
import WritingCoach from '@/pages/learning/components/writing-coach.vue';
import LearningShell from '@/components/business/learning/learning-shell.vue';
import BaseInput from '@/components/base/base-input/base-input.vue';

let wrapper;
beforeEach(() => {
  uni.clearStorageSync();
  localStorage.clear();
  setActivePinia(createPinia());
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  learningWriteLease.release();
  vi.restoreAllMocks();
});
const key = (owner) => `yozi_workspace_drafts_v1:${encodeURIComponent(owner)}`;
function student(owner = 'student-a') {
  return reactive({
    state: { owner },
    context: 'session-a',
    recordContext() {
      return this.context;
    }
  });
}
function renderCoach(props = { connectionTone: 'mint' }) {
  wrapper = mount(WritingCoach, {
    props,
    global: { stubs: { LearningShell: { template: '<div><slot /><slot name="composer" /></div>' }, BaseIcon: true } }
  });
  return wrapper;
}

describe('device-only student drafts', () => {
  it('S32 restores only the five analysis inputs by owner, conversation and day across a fresh runtime', () => {
    const store = student(),
      drafts = workspaceDrafts(store),
      before = JSON.stringify(store.state),
      analysis = { genre: '核对说明', recipient: '服务站', purpose: '保留原件', points: '每日核对', words: '一段' };
    drafts.save(store.context, 'coach:a:day-1', {
      analysis: { ...analysis, apiKey: 'must-not-persist', nested: { token: 'must-not-persist' } }
    });
    const restarted = workspaceDrafts(student());
    expect(restarted.read('session-a', 'coach:a:day-1')).toEqual({ analysis });
    expect(restarted.read('session-a', 'coach:b:day-1')).toEqual({});
    expect(restarted.read('session-a', 'coach:a:day-2')).toEqual({});
    expect(workspaceDrafts(student('student-b')).read('session-a', 'coach:a:day-1')).toEqual({});
    expect(JSON.stringify(uni.getStorageSync(key('student-a')))).not.toContain('must-not-persist');
    expect(JSON.stringify(store.state)).toBe(before);
    drafts.save(store.context, 'coach:a:day-1', { analysis: { genre: '', points: '', unknown: 'ignored' } });
    expect(workspaceDrafts(student()).read('session-a', 'coach:a:day-1')).toEqual({});
  });

  it('S32 keeps each unsent analysis form through conversation switches and remounts without submitting facts', async () => {
    const learning = useConversationLearningStore();
    const seed = (goal) => {
      const conversation = learning.startCoach(goal);
      learning.coachSave('profile', { profile: { exam: 'english2', minutes: 25, deadline: null } });
      learning.active.coach.diagnostic = { cards: [], answers: [], feedback: { kind: 'feedback', lines: [] } };
      learning.active.coach.days.push({
        day: learning.todaySummary.day,
        pack: {
          kind: 'daily',
          cards: [],
          writing: {
            prompt: 'Synthetic task.',
            patterns: [['Synthetic role.']],
            source: { kind: 'model_generated', verified: false }
          }
        },
        answers: [],
        analysis: null,
        drafts: [],
        rewrites: [],
        feedback: {},
        essay: null,
        summary: null,
        completed: false
      });
      return conversation.id;
    };
    const first = seed('第一份写作任务'),
      second = seed('另一份写作任务');
    learning.selectedConversationId = first;
    const before = learning.exportData(),
      request = vi.spyOn(learning, 'requestCoach');
    const fields = () =>
      wrapper
        .findAllComponents(BaseInput)
        .filter((input) => ['体裁', '对象', '目的', '要点', '字数'].includes(input.props('label')));
    renderCoach();
    await flushPromises();
    expect(fields()).toHaveLength(5);
    const original = ['说明', '服务站', '核对记录', '保留原件', '180字'];
    for (const [index, input] of fields().entries()) await input.get('input').setValue(original[index]);
    learning.selectedConversationId = second;
    await flushPromises();
    expect(fields().map((input) => input.props('modelValue'))).toEqual(['', '', '', '', '']);
    await fields()[0].get('input').setValue('比较建议');
    learning.selectedConversationId = first;
    await flushPromises();
    expect(fields().map((input) => input.props('modelValue'))).toEqual(original);
    wrapper.unmount();
    renderCoach();
    await flushPromises();
    expect(fields().map((input) => input.props('modelValue'))).toEqual(original);
    learning.selectedConversationId = second;
    await flushPromises();
    expect(fields().map((input) => input.props('modelValue'))).toEqual(['比较建议', '', '', '', '']);
    expect(learning.exportData()).toBe(before);
    expect(request).not.toHaveBeenCalled();
  });

  it('S23 restores question entry with its unsent text, isolates it by owner and does not keep an empty default draft', () => {
    const owner = student(),
      drafts = workspaceDrafts(owner),
      before = JSON.stringify(owner.state);
    drafts.save(owner.context, 'coach:new:day', { entryMode: 'study' });
    expect(uni.getStorageSync(key('student-a'))).toBeFalsy();
    drafts.save(owner.context, 'coach:new:day', { entryMode: 'question', goal: '我的一次提问' });
    expect(workspaceDrafts(student()).read('session-a', 'coach:new:day')).toEqual({
      entryMode: 'question',
      goal: '我的一次提问'
    });
    expect(workspaceDrafts(student('student-b')).read('session-a', 'coach:new:day')).toEqual({});
    expect(JSON.stringify(owner.state)).toBe(before);
    drafts.save(owner.context, 'coach:new:day', { entryMode: 'unknown' });
    expect(workspaceDrafts(student()).read('session-a', 'coach:new:day')).toEqual({});
  });
  it('restores the owning conversation after a fresh store/runtime, without exporting learning facts', () => {
    const store = student();
    const drafts = workspaceDrafts(store);
    const before = JSON.stringify(store.state);
    drafts.save(store.context, 'chat:a', { draft: '尚未提交的原答' });
    drafts.save(store.context, 'chat:b', { draft: '另一个会话' });
    expect(JSON.stringify(store.state)).toBe(before);
    const restarted = student();
    restarted.context = 'fresh-session';
    expect(workspaceDrafts(restarted).read(restarted.context, 'chat:a')).toEqual({ draft: '尚未提交的原答' });
    expect(workspaceDrafts(restarted).read(restarted.context, 'chat:b')).toEqual({ draft: '另一个会话' });
    expect(workspaceDrafts(student('student-b')).read('session-a', 'chat:a')).toEqual({});
    drafts.save(store.context, 'chat:a', { draft: '' });
    expect(workspaceDrafts(student()).read('session-a', 'chat:a')).toEqual({});
  });
  it('retains only the latest 50, touching a draft moves it to the end', () => {
    const store = student(),
      drafts = workspaceDrafts(store);
    for (let i = 0; i < 50; i++) drafts.save(store.context, `chat:${i}`, { draft: `原答${i}` });
    drafts.save(store.context, 'chat:0', { draft: '最近编辑' });
    drafts.save(store.context, 'chat:50', { draft: '新草稿' });
    const restarted = workspaceDrafts(student());
    expect(uni.getStorageSync(key('student-a')).entries).toHaveLength(50);
    expect(restarted.read('session-a', 'chat:1')).toEqual({});
    expect(restarted.read('session-a', 'chat:0').draft).toBe('最近编辑');
    expect(restarted.read('session-a', 'chat:50').draft).toBe('新草稿');
  });
  it('rejects stale identity writes, isolates accounts, and clears restored drafts after local reset', () => {
    const store = student(),
      drafts = workspaceDrafts(store);
    drafts.save(store.context, 'chat:a', { draft: '学生甲' });
    store.context = 'session-b';
    store.state.owner = 'student-b';
    drafts.save('session-a', 'chat:a', { draft: '迟到回调' });
    expect(drafts.read('session-b', 'chat:a')).toEqual({});
    drafts.save('session-b', 'chat:a', { draft: '学生乙' });
    expect(workspaceDrafts(student()).read('session-a', 'chat:a').draft).toBe('学生甲');
    uni.removeStorageSync(key('student-b'));
    store.context = 'reset-session';
    expect(drafts.read(store.context, 'chat:a')).toEqual({});
  });
  it('copies only input fields and never persists credentials, model state or nested extra fields', () => {
    const store = student(),
      drafts = workspaceDrafts(store);
    drafts.save(store.context, 'coach:a:day', {
      answer: '我的原答',
      goal: '英文邮件写作',
      step: 1,
      token: 'must-not-persist',
      profile: { exam: 'english2', subjects: ['english'], apiKey: 'must-not-persist' },
      models: [{ token: 'must-not-persist' }]
    });
    expect(JSON.stringify(uni.getStorageSync(key('student-a')))).not.toContain('must-not-persist');
    const read = drafts.read(store.context, 'coach:a:day');
    read.profile.subjects.push('mutation');
    expect(drafts.read(store.context, 'coach:a:day').profile.subjects).toEqual(['english']);
  });
  it('tolerates corrupt storage and keeps input in memory during quota failures', () => {
    uni.setStorageSync(key('student-a'), '{broken');
    const store = student(),
      drafts = workspaceDrafts(store);
    expect(drafts.read(store.context, 'chat:a')).toEqual({});
    vi.spyOn(uni, 'setStorageSync').mockImplementation(() => {
      throw new Error('quota');
    });
    drafts.save(store.context, 'chat:a', { draft: '不要丢失' });
    drafts.save(store.context, 'chat:b', { draft: '第二份' });
    expect(drafts.read(store.context, 'chat:a')).toEqual({ draft: '不要丢失' });
    expect(drafts.read(store.context, 'chat:b')).toEqual({ draft: '第二份' });
  });
});

describe('production connected entrance', () => {
  it('shows existing writing examples; picking one only fills the shared draft, then restores after remount', async () => {
    const learning = useConversationLearningStore();
    const begin = vi.spyOn(learning, 'beginModelIntake');
    const before = learning.exportData();
    renderCoach();
    const empty = wrapper.getComponent(MuseChatEmpty);
    expect(empty.text()).toContain('今天，想学会什么？');
    expect(empty.find('image, canvas, video').exists()).toBe(false);
    expect(wrapper.getComponent(MuseModelIntake).text()).not.toContain('连接自己的 API 后');
    await empty.findAll('button')[0].trigger('tap');
    expect(wrapper.get('textarea').element.value).toBe('英文邮件写作');
    expect(begin).not.toHaveBeenCalled();
    expect(learning.exportData()).toBe(before);
    wrapper.unmount();
    renderCoach();
    expect(wrapper.get('textarea').element.value).toBe('英文邮件写作');
    expect(wrapper.getComponent(MuseComposer).find('[aria-label="听写"]').exists()).toBe(false);
  });
  it('keeps the original disconnected guide and an in-progress intake', async () => {
    const learning = useConversationLearningStore();
    renderCoach({ connectionTone: 'apricot' });
    expect(wrapper.findComponent(MuseChatEmpty).exists()).toBe(false);
    expect(wrapper.text()).toContain('连接自己的 API 后，告诉我你想学什么。');
    await wrapper.setProps({ connectionTone: 'mint' });
    learning.state.intake = {
      status: 'ready',
      requestId: 'synthetic',
      turns: [],
      reply: { message: '目前的基础？', intake: { options: [], input: true, profile: null } }
    };
    await flushPromises();
    expect(wrapper.findComponent(MuseChatEmpty).exists()).toBe(false);
    expect(wrapper.text()).toContain('目前的基础？');
  });
  it('a new intake request id preserves newer shared input until its own explicit submission', async () => {
    const learning = useConversationLearningStore();
    renderCoach();
    await wrapper.get('textarea').setValue('尚未提交的新输入');
    learning.state.intake = { status: 'pending', requestId: 'new-request', turns: [] };
    await flushPromises();
    expect(wrapper.get('textarea').element.value).toBe('尚未提交的新输入');
    wrapper.unmount();
    renderCoach();
    expect(wrapper.get('textarea').element.value).toBe('尚未提交的新输入');
  });
  it('late intake success after a new conversation or unmount never clears another draft', async () => {
    const learning = useConversationLearningStore();
    learning.modelId = 'synthetic';
    learning.sharingAllowed = true;
    let finish;
    vi.spyOn(learning, 'beginModelIntake').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    vi.spyOn(learning, 'answerModelIntake').mockResolvedValue({ success: true });
    renderCoach();
    await wrapper.get('textarea').setValue('第一份目标');
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' });
    // Navigation binding changes independently of a model reply or a facts write.
    const newConversation = { id: 'another-conversation' };
    learning.selectedConversationId = newConversation.id;
    await flushPromises();
    wrapper.unmount();
    const context = learning.recordContext();
    const drafts = workspaceDrafts(learning);
    const draftKey = `coach:${newConversation.id}:${learning.todaySummary.day}`;
    drafts.save(context, draftKey, { answer: '另一个会话的原答' });
    finish({ success: true });
    await flushPromises();
    expect(drafts.read(context, draftKey).answer).toBe('另一个会话的原答');
    expect(drafts.read(context, `coach:new:${learning.todaySummary.day}`).goal).toBe('第一份目标');
  });
});

it('input growth follows the bottom without moving a reader viewing older messages or reacting to message updates', async () => {
  const height = ref(54),
    title = ref('已保存的目标');
  const learning = useConversationLearningStore(),
    before = learning.exportData();
  wrapper = mount(
    {
      setup: () => () =>
        h(
          LearningShell,
          { title: title.value, style: { '--muse-composer-height': `${height.value}px` } },
          {
            default: () => h('div', '已有消息'),
            composer: () => h('textarea')
          }
        )
    },
    { global: { stubs: { BaseIcon: true, MuseLaunch: true } } }
  );
  await flushPromises();
  const scroller = wrapper.get('.space-content').element;
  const surface = wrapper.get('.learning-space').element;
  let position = 200;
  Object.defineProperties(scroller, {
    clientHeight: { configurable: true, get: () => 800 },
    scrollHeight: {
      configurable: true,
      get: () => 1000 + parseFloat(surface.style.getPropertyValue('--muse-composer-height')) - 54
    },
    scrollTop: {
      configurable: true,
      get: () => position,
      set: (value) => {
        position = Math.max(0, Math.min(value, scroller.scrollHeight - scroller.clientHeight));
      }
    }
  });
  height.value = 186;
  await nextTick();
  expect(position).toBe(332);
  position = 20;
  height.value = 54;
  await nextTick();
  expect(position).toBe(20);
  title.value = '另一条已保存的消息';
  await nextTick();
  expect(position).toBe(20);
  expect(learning.exportData()).toBe(before);
});
