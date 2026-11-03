import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import {
  normalizeContentBlocks,
  mapContentBlocks
} from '../../laf-backend/functions/_shared/learning-content-blocks.js';

const fixture = vi.hoisted(() => ({
  session: { owner: 'first', epoch: 'first-epoch' },
  data: new Map(),
  listeners: new Set(),
  fail: false,
  writes: 0
}));
vi.mock('@/services/auth-storage.js', () => ({
  captureSession: () => ({ ...fixture.session }),
  checkSession: (session) =>
    session.owner === fixture.session.owner && session.epoch === fixture.session.epoch ? 'current' : 'changed'
}));
vi.mock('@/services/storageService.js', () => {
  const storage = {
    read: (key, fallback, options = {}) => ({
      status: 'ready',
      value: fixture.data.get(`${options.session?.owner || fixture.session.owner}:${key}`) ?? fallback
    }),
    get: (key, fallback, options = {}) =>
      fixture.data.get(`${options.session?.owner || fixture.session.owner}:${key}`) ?? fallback,
    save: (key, value, _silent, session) => {
      if (fixture.fail || session.owner !== fixture.session.owner || session.epoch !== fixture.session.epoch)
        return false;
      fixture.writes++;
      fixture.data.set(`${session.owner}:${key}`, structuredClone(value));
      return true;
    },
    onIdentityChange: (listener) => {
      fixture.listeners.add(listener);
      return () => fixture.listeners.delete(listener);
    }
  };
  return { storageService: storage, default: storage };
});
import { presentationCommand, useLearningPresentation } from '@/composables/useLearningPresentation.js';
import LearningContentCards from '@/pages/learning/components/learning-content-cards.vue';
import BaseCheckbox from '@/components/base/base-checkbox/base-checkbox.vue';
import MusePresentationControl from '@/components/business/learning/muse-presentation-control.vue';
import BaseSegmented from '@/components/base/base-segmented/base-segmented.vue';

let wrapper;
beforeEach(() => {
  fixture.session = { owner: 'first', epoch: 'first-epoch' };
  fixture.data.clear();
  fixture.listeners.clear();
  fixture.fail = false;
  fixture.writes = 0;
  setActivePinia(createPinia());
});
afterEach(() => wrapper?.unmount());
const data = () => ({
  version: 3,
  items: [
    { kind: 'knowledge', title: '语气', body: '根据对象与目的选择表达。' },
    {
      kind: 'table',
      title: '比较',
      columns: ['原句', '观察'],
      rows: [
        ['Please send it.', '请求'],
        ['You must send it.', '要求']
      ]
    },
    {
      kind: 'checklist',
      title: '自查',
      items: [
        { id: 'reader', label: '核对读者' },
        { id: 'purpose', label: '核对目的' }
      ]
    },
    { kind: 'example', title: '步骤', steps: ['确定读者。', '说明目的。'] }
  ]
});
const invalid = (value) =>
  expect(() => normalizeContentBlocks(value)).toThrowError(expect.objectContaining({ code: 'CONTENT_BLOCKS_INVALID' }));

describe('versioned host presentation data', () => {
  it('keeps legacy normalization and quotas, while new presentation has no card or envelope budget', () => {
    const item = { kind: 'knowledge', title: 'Example', body: 'a'.repeat(1900) };
    expect(normalizeContentBlocks({ version: 1, items: [item] }).version).toBe(2);
    invalid({ version: 2, items: Array(7).fill(item) });
    invalid({ version: 2, items: [{ ...item, points: Array(5).fill('point') }] });
    const content = {
      version: 3,
      items: Array.from({ length: 8 }, () => ({ ...item, points: Array(5).fill('point') }))
    };
    expect(JSON.stringify(content).length).toBeGreaterThan(12000);
    expect(normalizeContentBlocks(content)).toEqual(content);
    const steps = { version: 3, items: [{ kind: 'example', title: 'Steps', steps: Array(8).fill('A step') }] };
    expect(normalizeContentBlocks(steps)).toEqual(steps);
  });
  it('validates new table and checklist descriptions and maps text without changing identity or input', () => {
    const content = data(),
      before = JSON.stringify(content);
    const mapped = mapContentBlocks(content, (text) => text.replaceAll('核对', '检查'));
    expect(mapped.items[2].items).toEqual([
      { id: 'reader', label: '检查读者' },
      { id: 'purpose', label: '检查目的' }
    ]);
    expect(mapped.items[1].rows).toEqual(content.items[1].rows);
    expect(JSON.stringify(content)).toBe(before);
    invalid({ version: 2, items: [content.items[1]] });
  });
  it.each([
    { kind: 'table', columns: ['A', 'B'], rows: [['only one']] },
    { kind: 'table', columns: [], rows: [[]] },
    { kind: 'table', columns: ['A'], rows: [['x']], onClick: 'execute' },
    { kind: 'checklist', items: [{ id: 'a', label: 'x', checked: true }] },
    {
      kind: 'checklist',
      items: [
        { id: 'a', label: 'x' },
        { id: 'a', label: 'y' }
      ]
    },
    { kind: 'checklist', items: [{ id: 'a', label: 'x', score: 1 }] },
    { kind: 'checklist', items: [], tool: 'submit' }
  ])('rejects malformed or executable descriptor %#', (item) => invalid({ version: 3, items: [item] }));
  it('shows all new cards by default; self-check and display switches never mutate model content or emit learning actions', async () => {
    const content = data(),
      before = JSON.stringify(content);
    wrapper = mount(LearningContentCards, { props: { content }, global: { stubs: { BaseIcon: true } } });
    expect(wrapper.findAll('.teaching-card')).toHaveLength(4);
    expect(wrapper.findAll('[role="table"]')).toHaveLength(1);
    expect(wrapper.text()).toContain('勾选仅供自查，不计作答');
    const checkbox = wrapper.findAllComponents(BaseCheckbox)[0];
    checkbox.vm.$emit('update:modelValue', true);
    await nextTick();
    expect(checkbox.props('modelValue')).toBe(true);
    await wrapper.setProps({ presentation: 'text' });
    expect(wrapper.findAllComponents(BaseCheckbox)).toHaveLength(0);
    expect(wrapper.text()).toContain('核对读者');
    expect(wrapper.text()).toContain('说明目的。');
    await wrapper.setProps({ presentation: 'interactive' });
    expect(wrapper.findAllComponents(BaseCheckbox)[0].props('modelValue')).toBe(true);
    await wrapper.setProps({ presentation: 'guided' });
    expect(wrapper.findAll('.teaching-card')).toHaveLength(1);
    expect(wrapper.emitted()).toEqual({});
    expect(JSON.stringify(content)).toBe(before);
  });
});

describe('local display intent and account isolation', () => {
  function start(context = ref('first-context')) {
    let presentation;
    wrapper = mount(
      defineComponent({
        setup() {
          presentation = useLearningPresentation(() => context.value);
          return () => h('div');
        }
      })
    );
    return { presentation, context };
  }
  it('reserves only explicit display syntax during answer entry and leaves quoted, partial or ordinary answers intact', () => {
    expect(presentationCommand('显示方式：文字', { answering: true })).toBe('text');
    expect(presentationCommand('请多用交互卡片')).toBe('interactive');
    for (const answer of [
      '用文字讲解',
      '我的原答是“显示方式：文字”，这句话是材料中的要求。',
      'The phrase "显示方式：文字" is part of my answer.',
      '显示方式：文字，并替我交卷'
    ])
      expect(presentationCommand(answer, { answering: true })).toBeNull();
  });
  it('restores only the same account preference across remount and rejects stale account writes', async () => {
    const { presentation, context } = start();
    expect(presentation.mode).toBe('auto');
    expect(presentation.command('显示方式：文字')).toEqual({ mode: 'text', success: true });
    fixture.session = { owner: 'second', epoch: 'second-epoch' };
    expect(presentation.save('guided')).toBe(false);
    expect(fixture.writes).toBe(1);
    context.value = 'second-context';
    await nextTick();
    expect(presentation.mode).toBe('auto');
    expect(presentation.save('guided')).toBe(true);
    fixture.session = { owner: 'first', epoch: 'new-first-epoch' };
    context.value = 'first-new-context';
    await nextTick();
    expect(presentation.mode).toBe('text');
    wrapper.unmount();
    start();
    expect(fixture.data.get('first:learning_presentation_v1')).toEqual({ version: 1, mode: 'text' });
    expect(fixture.data.get('second:learning_presentation_v1')).toEqual({ version: 1, mode: 'guided' });
  });
  it('keeps failed saves and unsupported choices from changing the current display', () => {
    const { presentation } = start();
    fixture.fail = true;
    expect(presentation.command('显示方式：文字')).toEqual({ mode: 'text', success: false });
    expect(presentation.mode).toBe('auto');
    expect(fixture.writes).toBe(0);
    expect(presentation.save('execute')).toBe(false);
  });
  it('isolates guest binding epochs without writing any draft, answer or learning-state key', async () => {
    fixture.session = { owner: 'guest', epoch: 'guest-one' };
    const { presentation, context } = start(ref('guest-one-context'));
    expect(presentation.save('text')).toBe(true);
    fixture.session = { owner: 'guest', epoch: 'guest-two' };
    context.value = 'guest-two-context';
    await nextTick();
    expect(presentation.mode).toBe('auto');
    expect([...fixture.data.keys()]).toEqual(['guest:learning_presentation_v1:guest-one']);
  });
  it('keeps settings choices as drafts until explicit save and discards cancellation', async () => {
    const save = vi.fn(() => true);
    const presentation = { mode: 'auto', available: true, context: 'one', save };
    wrapper = mount(MusePresentationControl, {
      props: { presentation },
      global: {
        stubs: { BaseIcon: true, WdPopup: { props: ['modelValue'], template: '<div v-if="modelValue"><slot /></div>' } }
      }
    });
    await wrapper.find('button').trigger('tap');
    wrapper.findComponent(BaseSegmented).vm.$emit('update:modelValue', 'text');
    await nextTick();
    expect(save).not.toHaveBeenCalled();
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '取消')
      .trigger('tap');
    expect(save).not.toHaveBeenCalled();
    await wrapper.find('button').trigger('tap');
    wrapper.findComponent(BaseSegmented).vm.$emit('update:modelValue', 'guided');
    await nextTick();
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '保存显示方式')
      .trigger('tap');
    expect(save).toHaveBeenCalledWith('guided');
  });
});
