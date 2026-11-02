import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';
import WorkspacePages from '@/components/business/learning/muse-workspace-pages.vue';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
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
