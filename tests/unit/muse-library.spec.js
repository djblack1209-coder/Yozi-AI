import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick, reactive } from 'vue';
import { emptyLearningState } from '@/services/learning/learning-domain.js';
import MuseLibrary from '@/components/business/learning/muse-library.vue';
import { safeNavigateTo } from '@/utils/safe-navigate.js';
vi.mock('@/utils/safe-navigate.js', () => ({ safeNavigateTo: vi.fn() }));

const harness = vi.hoisted(() => ({ store: null }));
vi.mock('@/stores/modules/conversation-learning.js', () => ({ useConversationLearningStore: () => harness.store }));
let wrapper;
beforeEach(() => {
  const state = emptyLearningState('library-owner');
  state.materials = [
    { id: 'one', name: '我的私人资料', at: 1000, segments: [{ id: 's1', content: '本人原文' }] },
    { id: 'two', name: '另一份资料', at: 2000, segments: [{ id: 's2', content: '另一份原文' }] }
  ];
  harness.store = reactive({
    state,
    busy: false,
    locateConversation: vi.fn(),
    focus: vi.fn(),
    calendarTime: Date.now(),
    recordContext() {
      return this.state.owner;
    }
  });
  wrapper = mount(MuseLibrary, { global: { stubs: { BaseIcon: true } } });
});
afterEach(() => wrapper?.unmount());
const button = (label) => wrapper.findAll('button').find((node) => node.text() === label);

it('keeps history, insights, practice and saved items reachable from the product library without writing facts', async () => {
  wrapper = mount(MuseLibrary, { global: { stubs: { BaseIcon: true } } });
  const before = JSON.stringify(harness.store.state);
  const links = wrapper.findAll('.library-sidebar .library-saved-view');
  for (const link of links) await link.trigger('tap');
  expect(wrapper.emitted('view')).toEqual([['all'], ['phrases'], ['mistake']]);
  expect(safeNavigateTo).toHaveBeenCalledWith('/pages/favorite/index');
  expect(JSON.stringify(harness.store.state)).toBe(before);
});
describe('Muse library keeps selection and private reading local', () => {
  it.each(['search', 'type navigation', 'filter menu'])(
    'S49 closes a private reader excluded by %s and requires an explicit reopen',
    async (filter) => {
      const before = JSON.stringify(harness.store.state),
        storageBefore = JSON.stringify(globalThis.__mockStorage),
        navigationsBefore = safeNavigateTo.mock.calls.length;
      await wrapper.get('[aria-label="打开 我的私人资料"]').trigger('tap');
      expect(wrapper.get('.material-reader').text()).toContain('本人原文');
      if (filter === 'search') await wrapper.get('input').setValue('另一份');
      else if (filter === 'type navigation') {
        await wrapper
          .findAll('.library-type')
          .find((node) => node.text() === '视频')
          .trigger('tap');
      } else {
        await wrapper.get('[aria-label="筛选资料"]').trigger('tap');
        await wrapper
          .findAll('.library-filter button')
          .find((node) => node.text() === '图片')
          .trigger('tap');
      }
      expect(wrapper.find('[aria-label="打开 我的私人资料"]').exists()).toBe(false);
      expect(wrapper.find('.material-reader').exists()).toBe(false);
      if (filter === 'search') await wrapper.get('input').setValue('');
      else if (filter === 'type navigation') {
        await wrapper
          .findAll('.library-type')
          .find((node) => node.text() === '全部学习内容')
          .trigger('tap');
      } else {
        await wrapper
          .findAll('.library-filter button')
          .find((node) => node.text() === '全部类型')
          .trigger('tap');
        await wrapper
          .findAll('.library-filter button')
          .find((node) => node.text() === '完成')
          .trigger('tap');
      }
      expect(wrapper.find('[aria-label="打开 我的私人资料"]').exists()).toBe(true);
      expect(wrapper.find('.material-reader').exists()).toBe(false);
      await wrapper.get('[aria-label="打开 我的私人资料"]').trigger('tap');
      expect(wrapper.get('.material-reader').text()).toContain('本人原文');
      expect(JSON.stringify(harness.store.state)).toBe(before);
      expect(JSON.stringify(globalThis.__mockStorage)).toBe(storageBefore);
      expect(safeNavigateTo.mock.calls).toHaveLength(navigationsBefore);
    }
  );
  it('S49 retains a matching private reader across search, document type and sort changes', async () => {
    const before = JSON.stringify(harness.store.state);
    await wrapper.get('[aria-label="打开 我的私人资料"]').trigger('tap');
    await wrapper.get('input').setValue('  私人  ');
    expect(wrapper.get('.material-reader').text()).toContain('本人原文');
    await wrapper
      .findAll('.library-type')
      .find((node) => node.text() === '文档')
      .trigger('tap');
    expect(wrapper.get('.material-reader').text()).toContain('本人原文');
    await wrapper.get('[aria-label="筛选资料"]').trigger('tap');
    await wrapper
      .findAll('.library-filter button')
      .find((node) => node.text() === '最早优先')
      .trigger('tap');
    expect(wrapper.get('.material-reader').text()).toContain('本人原文');
    await wrapper.get('input').setValue('');
    expect(wrapper.get('.material-reader').text()).toContain('本人原文');
    expect(JSON.stringify(harness.store.state)).toBe(before);
  });
  it('keeps type navigation visible, previews saved text, and does not fabricate empty media or write facts', async () => {
    const before = JSON.stringify(harness.store.state);
    expect(wrapper.findAll('.library-type').map((node) => node.text())).toEqual([
      '全部学习内容',
      '文档',
      '交互学习内容',
      '图片',
      '视频',
      '音频'
    ]);
    await wrapper
      .findAll('.library-type')
      .find((node) => node.text() === '文档')
      .trigger('tap');
    expect(wrapper.get('.library-title').text()).toBe('文档');
    expect(wrapper.findAll('.artifact')).toHaveLength(2);
    expect(wrapper.get('[aria-label="打开 我的私人资料"] .artifact-preview-copy').text()).toBe('本人原文');
    await wrapper
      .findAll('.library-type')
      .find((node) => node.text() === '视频')
      .trigger('tap');
    expect(wrapper.findAll('.artifact')).toHaveLength(0);
    expect(wrapper.get('.library-empty').text()).toContain('没有匹配的资料');
    expect(JSON.stringify(harness.store.state)).toBe(before);
  });
  it('带练成果使用已保存的学习日期，避免 UTC 零点显示成前一天', async () => {
    harness.store.state.conversations.push({
      id: 'cs',
      goal: '资料带练',
      at: 1,
      coach: {
        library: [],
        diagnostic: null,
        days: [
          {
            day: '2026-10-20',
            pack: { cards: [] },
            feedback: {},
            answers: [],
            drafts: [],
            rewrites: [],
            summary: { learned: ['练习了索引'] },
            completed: true
          }
        ]
      }
    });
    await nextTick();
    expect(wrapper.get('[aria-label="打开 2026-10-20 · 小结"] .artifact-meta').text()).toContain(
      '小结 · 2026-10-20 · 已完成'
    );
  });
  it('selects without opening or changing saved facts, and filters to a true empty media category', async () => {
    const before = JSON.stringify(harness.store.state);
    await button('选择').trigger('tap');
    await wrapper.get('[aria-label="选择 我的私人资料"]').trigger('tap');
    expect(wrapper.get('[aria-label="选择 我的私人资料"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.find('.material-reader').exists()).toBe(false);
    // Muse select mode: the title carries the count; private files have no pin to change.
    expect(wrapper.get('.library-title').text()).toBe('已选择 1 项');
    expect(button('置顶').attributes('disabled')).toBeDefined();
    await button('全选').trigger('tap');
    expect(wrapper.get('.library-title').text()).toBe('已选择 2 项');
    expect(wrapper.find('[aria-label="筛选资料"]').exists()).toBe(false);
    await wrapper.get('[aria-label="退出选择"]').trigger('tap');
    expect(wrapper.get('.library-title').text()).not.toContain('已选择');
    await wrapper.get('[aria-label="筛选资料"]').trigger('tap');
    await button('图片').trigger('tap');
    expect(wrapper.findAll('.artifact')).toHaveLength(0);
    expect(wrapper.get('.library-empty').text()).toContain('没有匹配的资料');
    expect(JSON.stringify(harness.store.state)).toBe(before);
  });
  it('closes an old private reader and clears its search immediately when the account changes', async () => {
    await wrapper.get('[aria-label="打开 我的私人资料"]').trigger('tap');
    expect(wrapper.get('.material-reader').text()).toContain('本人原文');
    await wrapper.get('input').setValue('私人');
    harness.store.state = emptyLearningState('new-owner');
    await nextTick();
    expect(wrapper.get('input').element.value).toBe('');
    expect(wrapper.find('.material-reader').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('本人原文');
    expect(wrapper.findAll('.artifact')).toHaveLength(0);
  });
});

it('returns a saved chat entry to its exact source message, with no model call or fact writes', async () => {
  harness.store.state.conversations.push({
    id: 'source',
    goal: '申请信讲解',
    at: 1000,
    messages: [{ id: 'reply', role: 'assistant', content: '称呼与落款', at: 1000 }]
  });
  await nextTick();
  const before = JSON.stringify(harness.store.state);
  await wrapper.get('[aria-label="打开 称呼与落款"]').trigger('tap');
  expect(harness.store.locateConversation).toHaveBeenCalledWith('source', undefined, null, 'reply');
  expect(JSON.stringify(harness.store.state)).toBe(before);
});
