import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import SupportFeedback from '@/pages/profile/support-feedback.vue';

const desktop = vi.hoisted(() => ({ available: true, invoke: vi.fn() }));
vi.mock('@/services/desktop/runtime.js', () => ({ isDesktopRuntime: () => desktop.available }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: desktop.invoke }));
const modal = {
  props: ['visible'],
  template: '<section v-if="visible" role="dialog"><slot /></section>'
};
let wrapper;
const note = '第一行 + 建议\n第二行 &bcc=other@example.test';
beforeEach(async () => {
  desktop.available = true;
  desktop.invoke.mockReset();
  wrapper = mount(SupportFeedback, {
    props: { visible: true, title: '意见反馈' },
    global: { stubs: { CustomModal: modal, BaseIcon: true } }
  });
  await wrapper.get('textarea').setValue(note);
});
afterEach(() => {
  wrapper.unmount();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function tap(label) {
  const button = wrapper.findAll('button').find((node) => node.text().trim() === label);
  expect(button).toBeTruthy();
  await button.trigger('tap');
  await flushPromises();
}

it('animates only after desktop accepts the draft and keeps the submitted text available', async () => {
  desktop.invoke.mockResolvedValueOnce();
  expect(wrapper.find('.feedback-flight').exists()).toBe(false);
  await tap('打开邮件草稿');
  expect(desktop.invoke).toHaveBeenCalledExactlyOnceWith('open_support_feedback', {
    note: note.replace('\n', '\r\n')
  });
  expect(wrapper.get('[role="status"]').text()).toBe('草稿已交给邮件应用');
  expect(wrapper.get('.feedback-flight').attributes('aria-hidden')).toBe('true');
  expect(wrapper.get('textarea').element.value).toBe(note);
});

it('retains a rejected draft and confirms the original clipboard fallback', async () => {
  desktop.invoke.mockRejectedValueOnce(new Error('no mail application'));
  const copy = vi.fn(({ success }) => success());
  vi.stubGlobal('uni', { ...uni, setClipboardData: copy });
  await tap('打开邮件草稿');
  expect(wrapper.get('[role="alert"]').text()).toContain('未能打开邮件应用');
  expect(wrapper.find('.feedback-flight').exists()).toBe(false);
  expect(wrapper.get('textarea').element.value).toBe(note);
  await tap('复制邮箱');
  expect(copy).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ data: 'yozi@245334.xyz' }));
  expect(wrapper.get('[role="status"]').text()).toBe('联系邮箱已复制');
});

it('ignores a late mobile error after the dialog closes and reopens', async () => {
  desktop.available = false;
  let fail;
  const openURL = vi.fn((_url, callback) => (fail = callback));
  vi.stubGlobal('plus', { runtime: { openURL } });
  await tap('打开邮件草稿');
  const url = new URL(openURL.mock.calls[0][0]);
  expect(url.pathname).toBe('yozi@245334.xyz');
  expect([...url.searchParams]).toEqual([
    ['subject', 'Yozi AI feedback'],
    ['body', note.replace('\n', '\r\n')]
  ]);
  expect(wrapper.get('[role="status"]').text()).toBe('已请求打开邮件应用');
  await wrapper.setProps({ visible: false });
  await wrapper.setProps({ visible: true });
  fail();
  await flushPromises();
  expect(wrapper.find('.support-feedback__status').exists()).toBe(false);
  expect(wrapper.find('.feedback-flight').exists()).toBe(false);
  expect(wrapper.get('textarea').element.value).toBe('');
});
