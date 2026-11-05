import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';
import WorkspacePages from '@/components/business/learning/muse-workspace-pages.vue';
import ConversationEntries from '@/pages/archive/components/conversation-entries.vue';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { learningRepository } from '@/services/learning/learning-repository.js';
import { learningWriteLease } from '@/services/learning/learning-write-lease.js';
import '@/i18n/tutor.js';
let wrapper, store;
beforeEach(() => {
  uni.clearStorageSync();
  setActivePinia(createPinia());
  vi.clearAllMocks();
  store = useConversationLearningStore();
  store.start('合成学习目标');
  wrapper = mount(WorkspacePages, {
    attachTo: document.body,
    props: { view: 'plan' },
    global: {
      stubs: {
        BaseIcon: true,
        MuseConversationFilter: true,
        ConversationEntries: true,
        MuseShareSheet: true
      }
    }
  });
});
afterEach(() => {
  wrapper.unmount();
  store.$dispose();
  learningWriteLease.release();
});
it('keeps today and review reachable from Goals without changing learning facts', async () => {
  const before = store.exportData(),
    id = store.selectedConversationId;
  await wrapper.get('[aria-label="目标选项"]').trigger('tap');
  const entries = wrapper.findAll('.goal-entry-links button');
  expect(entries.map((button) => button.text())).toEqual(['今日安排', '分批复习']);
  await entries[0].trigger('tap');
  await flushPromises();
  expect(uni.navigateTo).toHaveBeenLastCalledWith(expect.objectContaining({ url: '/pages/learning/index' }));
  expect(store.selectedConversationId).toBe(id);
  await wrapper.get('[aria-label="目标选项"]').trigger('tap');
  await wrapper.findAll('.goal-entry-links button')[1].trigger('tap');
  await flushPromises();
  expect(uni.navigateTo).toHaveBeenLastCalledWith(expect.objectContaining({ url: '/pages/learning/review' }));
  expect(store.exportData()).toBe(before);
});
it('does not navigate away from an in-flight turn', async () => {
  store.busy = true;
  await flushPromises();
  await wrapper.get('[aria-label="目标选项"]').trigger('tap');
  expect(wrapper.findAll('.goal-entry-links button')).toHaveLength(2);
  for (const button of wrapper.findAll('.goal-entry-links button')) expect(button.attributes('disabled')).toBeDefined();
  expect(uni.navigateTo).not.toHaveBeenCalled();
  store.busy = false;
});

it('today continues the saved coach goal while preserving an unrelated conversation', async () => {
  store.startCoach('考研英语二写作');
  store.coachSave('profile', { profile: { exam: 'english2', minutes: 25, deadline: null } });
  const coachId = store.selectedConversationId;
  store.start('另一段合成对话');
  const before = store.exportData();
  await flushPromises();
  await wrapper.get('[aria-label="目标选项"]').trigger('tap');
  await wrapper.findAll('.goal-entry-links button')[0].trigger('tap');
  expect(store.selectedConversationId).toBe(coachId);
  expect(store.exportData()).toBe(before);
});

it('closes the options with Escape and returns focus without changing saved facts', async () => {
  const before = store.exportData();
  const trigger = wrapper.get('[aria-label="目标选项"]');
  trigger.element.focus();
  await trigger.trigger('tap');
  expect(wrapper.find('.goal-options-menu').exists()).toBe(true);
  await wrapper.get('.goal-options').trigger('focusout', { relatedTarget: null });
  expect(wrapper.find('.goal-options-menu').exists()).toBe(true);
  vi.spyOn(wrapper.get('.goal-options-menu').element, 'getClientRects').mockReturnValue([{}]);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await flushPromises();
  expect(wrapper.find('.goal-options-menu').exists()).toBe(false);
  expect(document.activeElement).toBe(trigger.element);
  expect(store.exportData()).toBe(before);
});

function mountEntries() {
  wrapper.unmount();
  wrapper = mount(ConversationEntries, { attachTo: document.body, global: { stubs: { BaseIcon: true } } });
}

it('S53 explicitly resumes a paused Goal without selecting it or changing another conversation', async () => {
  const id = store.selectedConversationId;
  store.commit('goal.pause', { conversationId: id, explicit: true });
  store.start('另一段保留对话');
  const selected = store.selectedConversationId,
    other = JSON.stringify(store.active),
    count = store.state.events.length;
  mountEntries();
  expect(wrapper.get('[data-test="goal-lifecycle"]').text()).toBe('继续目标');
  await wrapper.get('[data-test="goal-lifecycle"]').trigger('tap');
  expect(store.state.conversations.find((c) => c.id === id).stopped).toBe(false);
  expect(store.state.events).toHaveLength(count + 1);
  expect(store.state.events.at(-1)).toMatchObject({
    type: 'goal.resume',
    data: { conversationId: id, explicit: true }
  });
  expect(store.selectedConversationId).toBe(selected);
  expect(JSON.stringify(store.active)).toBe(other);
  expect(uni.navigateTo).not.toHaveBeenCalled();
});

it.each(['completed', 'archived'])(
  'S53 explicitly reopens a %s Goal while retaining its close history',
  async (status) => {
    const id = store.selectedConversationId;
    store.commit('goal.close', { conversationId: id, status, explicit: true });
    const before = JSON.parse(JSON.stringify(store.state.events));
    mountEntries();
    await wrapper
      .findAll('button')
      .find((button) => button.text().startsWith('查看历史'))
      .trigger('tap');
    expect(wrapper.get('[data-test="goal-lifecycle"]').text()).toBe('重开目标');
    await wrapper.get('[data-test="goal-lifecycle"]').trigger('tap');
    expect(store.active.stopped).toBe(false);
    expect(store.active.goalLifecycle).toBeFalsy();
    expect(store.state.events.slice(0, before.length)).toEqual(before);
    expect(store.state.events).toHaveLength(before.length + 1);
    expect(store.state.events.at(-1)).toMatchObject({
      type: 'goal.reopen',
      data: { conversationId: id, explicit: true }
    });
    expect(uni.navigateTo).not.toHaveBeenCalled();
  }
);

it('S53 refuses an old paused Goal button after the Goal has been closed', async () => {
  const id = store.selectedConversationId;
  store.commit('goal.pause', { conversationId: id, explicit: true });
  mountEntries();
  const button = wrapper.get('[data-test="goal-lifecycle"]');
  store.commit('goal.close', { conversationId: id, status: 'completed', explicit: true });
  const before = store.exportData();
  await button.trigger('tap');
  expect(store.exportData()).toBe(before);
  expect(wrapper.get('[role="status"]').text()).toContain('目标状态已变化');
});

it('S53 refuses an old Goal button after synchronized records replace the same identifiers and basis', async () => {
  store.commit('goal.pause', { conversationId: store.selectedConversationId, explicit: true });
  mountEntries();
  const button = wrapper.get('[data-test="goal-lifecycle"]');
  learningRepository.replaceSynchronized(learningRepository.read());
  store.refresh();
  const before = store.exportData();
  await button.trigger('tap');
  expect(store.exportData()).toBe(before);
  expect(wrapper.get('[role="status"]').text()).toContain('目标状态已变化');
});
