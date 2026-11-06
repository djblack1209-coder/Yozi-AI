import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import WebsiteWorkspace from '@/components/business/website/website-workspace.vue';
import WebsiteHome from '@/components/business/website/website-home.vue';
import { emptyLearningState } from '@/services/learning/learning-domain.js';
import config from '@/config';
const mocks = vi.hoisted(() => ({ read: vi.fn(), hide: [], show: [] }));
vi.mock('@dcloudio/uni-app', () => ({ onHide: (fn) => mocks.hide.push(fn), onShow: (fn) => mocks.show.push(fn) }));
vi.mock('@/services/learning/learning-sync.js', () => ({ readLearningSnapshot: mocks.read }));
vi.mock('@/config', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: { ...actual.default, api: { ...actual.default.api, baseUrl: 'https://test.example.com' } }
  };
});
let wrapper;
const signIn = (owner) => {
  uni.setStorageSync('EXAM_USER_ID', owner);
  uni.setStorageSync('EXAM_TOKEN', 'test-only-token');
};
function render(signedIn) {
  wrapper = mount(WebsiteWorkspace, {
    props: { signedIn },
    global: {
      plugins: [createPinia()],
      stubs: {
        AnimatedAvatar: true,
        view: { template: '<div><slot/></div>' },
        text: { template: '<span><slot/></span>' }
      }
    }
  });
  return wrapper;
}
beforeEach(() => {
  config.api.baseUrl = 'https://test.example.com';
  uni.clearStorageSync();
  const listeners = new Map();
  uni.$on.mockImplementation((event, callback) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(callback);
  });
  uni.$off.mockImplementation((event, callback) => listeners.get(event)?.delete(callback));
  uni.$emit.mockImplementation((event, ...args) => {
    for (const callback of listeners.get(event) || []) callback(...args);
  });
  mocks.read.mockReset();
  mocks.hide.length = mocks.show.length = 0;
});
afterEach(() => wrapper?.unmount());
describe('personal progress workspace', () => {
  it('uses a standard unavailable status without requesting data when the service has no address', async () => {
    signIn('u1');
    config.api.baseUrl = '';
    render(true);
    await flushPromises();
    expect(wrapper.get('[role="status"]').text()).toBe('账户服务暂时不可用，请稍后再试');
    expect(mocks.read).not.toHaveBeenCalled();
    expect(wrapper.find('.portal-metrics').exists()).toBe(false);
  });
  it('lets a signed-in person visit the public homepage and return to progress without signing out', async () => {
    signIn('u1');
    wrapper = mount(WebsiteHome, {
      global: {
        stubs: {
          PortalWorkspace: { template: '<button @click="$emit(\'home\')">Public home</button>' },
          NomiLanding: { template: "<button @click=\"$emit('open', 'progress')\">Progress</button>" }
        }
      }
    });
    await flushPromises();
    expect(wrapper.text()).toBe('Public home');
    await wrapper.get('button').trigger('click');
    expect(wrapper.text()).toBe('Progress');
    expect(uni.getStorageSync('EXAM_TOKEN')).toBe('test-only-token');
    await wrapper.get('button').trigger('click');
    expect(wrapper.text()).toBe('Public home');
  });
  it('guest sees a sign-in gate and no cloud request, metrics, or learning editor', async () => {
    render(false);
    await flushPromises();
    expect(mocks.read).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('登录后查看已保存的学习进度。');
    await wrapper.get('.portal-empty button').trigger('tap');
    expect(wrapper.emitted('login')).toHaveLength(1);
    expect(wrapper.find('.portal-metrics').exists()).toBe(false);
    expect(wrapper.find('input, textarea').exists()).toBe(false);
    await wrapper.get('button[aria-label="展开侧栏"]').trigger('tap');
    expect(wrapper.classes()).not.toContain('sidebar-collapsed');
  });
  it('shows only returned account facts and clears them as soon as the page hides', async () => {
    signIn('u1');
    const state = emptyLearningState('u1');
    state.events = [{ at: Date.now() }];
    state.attempts = [{ at: Date.now() }, { at: Date.now() }];
    mocks.read.mockResolvedValue(state);
    render(true);
    await flushPromises();
    expect(wrapper.get('.portal-metrics').text()).toContain('已保存作答2');
    expect(mocks.read.mock.calls[0][0].session.owner).toBe('u1');
    mocks.hide[0]();
    await flushPromises();
    expect(wrapper.find('.portal-metrics').exists()).toBe(false);
  });
  it('ignores an old pending reply after account switching and aborts its transport', async () => {
    signIn('u1');
    let finish;
    const old = emptyLearningState('u1');
    old.events = [{ at: 1 }];
    old.attempts = Array.from({ length: 99 }, () => ({ at: Date.now() }));
    mocks.read
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      )
      .mockResolvedValue(emptyLearningState('u2'));
    render(true);
    await flushPromises();
    const signal = mocks.read.mock.calls[0][0].signal;
    signIn('u2');
    uni.$emit('auth:userdata');
    await flushPromises();
    expect(signal.aborted).toBe(true);
    finish(old);
    await flushPromises();
    expect(wrapper.find('.portal-metrics').exists()).toBe(false);
    expect(wrapper.text()).toContain('还没有同步的学习记录。');
    expect(wrapper.text()).not.toContain('99');
  });
});

it('S3 website settings remain reachable at the bottom through existing read-only policy pages', async () => {
  render(false);
  const before = mocks.read.mock.calls.length;
  await wrapper.get('.rail-settings').trigger('tap');
  expect(wrapper.find('.portal-settings').exists()).toBe(true);
  expect(wrapper.find('.portal-settings input, .portal-settings textarea').exists()).toBe(false);
  expect(wrapper.findAll('.portal-settings button').map((button) => button.text())).toEqual(['隐私政策', '用户协议']);
  expect(mocks.read).toHaveBeenCalledTimes(before);
});
