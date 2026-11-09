import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindBusinessMotion } from '@/design/business-motion.js';
import { mount } from '@vue/test-utils';
import MuseLaunch from '@/components/business/learning/muse-launch.vue';
import MuseChatEmpty from '@/components/business/learning/muse-chat-empty.vue';

afterEach(() => vi.restoreAllMocks());

function legacyMedia(matches) {
  const listeners = new Set();
  return {
    matches,
    addListener: (listener) => listeners.add(listener),
    removeListener: (listener) => listeners.delete(listener),
    set(value) {
      this.matches = value;
      for (const listener of listeners) listener();
    },
    get listenerCount() {
      return listeners.size;
    }
  };
}

describe('学习首页动效的实际播放与生命周期', () => {
  it('业务浮层跟随减少动态效果，旧浏览器监听在卸载后释放', () => {
    const reduced = legacyMedia(false);
    vi.spyOn(window, 'matchMedia').mockReturnValue(reduced);
    const change = vi.fn();
    const release = bindBusinessMotion(change);
    expect(change).toHaveBeenLastCalledWith(false);
    reduced.set(true);
    expect(change).toHaveBeenLastCalledWith(true);
    release();
    expect(reduced.listenerCount).toBe(0);
    const calls = change.mock.calls.length;
    reduced.set(false);
    expect(change).toHaveBeenCalledTimes(calls);
  });
});

describe('Muse launch entrance', () => {
  let wrappers = [];
  afterEach(() => {
    for (const wrapper of wrappers) wrapper.unmount();
    wrappers = [];
    vi.useRealTimers();
  });
  const launch = (props) => {
    const wrapper = mount(MuseLaunch, {
      props: { scope: {}, ...props },
      global: { stubs: { AnimatedAvatar: true } }
    });
    wrappers.push(wrapper);
    return wrapper;
  };
  it('waits for records, fades once, and never replays during navigation', async () => {
    vi.useFakeTimers();
    vi.spyOn(window, 'matchMedia').mockReturnValue(legacyMedia(false));
    const scope = {};
    const wrapper = launch({ scope, ready: false });
    await vi.advanceTimersByTimeAsync(1080);
    expect(wrapper.get('.muse-launch').classes()).not.toContain('is-leaving');
    await wrapper.setProps({ ready: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(wrapper.get('.muse-launch').classes()).toContain('is-leaving');
    await vi.advanceTimersByTimeAsync(220);
    expect(wrapper.find('.muse-launch').exists()).toBe(false);
    expect(wrapper.emitted('complete')).toHaveLength(1);
    wrapper.unmount();
    wrappers = [];
    const navigated = launch({ scope, ready: true });
    expect(navigated.find('.muse-launch').exists()).toBe(false);
    expect(navigated.emitted('complete')).toHaveLength(1);
  });
  it('gives the kitten a full visible cycle and completes after 1.3 seconds', async () => {
    vi.useFakeTimers();
    vi.spyOn(window, 'matchMedia').mockReturnValue(legacyMedia(false));
    const wrapper = launch({ ready: true });
    await vi.advanceTimersByTimeAsync(1079);
    expect(wrapper.get('.muse-launch').classes()).not.toContain('is-leaving');
    await vi.advanceTimersByTimeAsync(1);
    expect(wrapper.get('.muse-launch').classes()).toContain('is-leaving');
    await vi.advanceTimersByTimeAsync(220);
    expect(wrapper.find('.muse-launch').exists()).toBe(false);
  });
  it('respects a live reduced-motion change and releases pending timers/listeners', async () => {
    vi.useFakeTimers();
    const media = legacyMedia(false);
    vi.spyOn(window, 'matchMedia').mockReturnValue(media);
    const wrapper = launch({ ready: false });
    media.set(true);
    await wrapper.setProps({ ready: true });
    expect(wrapper.find('.muse-launch').exists()).toBe(false);
    expect(wrapper.emitted('complete')).toHaveLength(1);
    wrapper.unmount();
    wrappers = [];
    expect(media.listenerCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cancels an unfinished entrance on unmount instead of sending a late navigation signal', async () => {
    vi.useFakeTimers();
    const media = legacyMedia(false);
    vi.spyOn(window, 'matchMedia').mockReturnValue(media);
    const wrapper = launch({ ready: true });
    await vi.advanceTimersByTimeAsync(200);
    wrapper.unmount();
    wrappers = [];
    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.emitted('complete')).toBeUndefined();
    expect(media.listenerCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('compact chat connection status', () => {
  it.each(['未连接', '已连接 · glm-4.5-flash'])(
    '%s opens connectors without creating learning facts',
    async (status) => {
      const wrapper = mount(MuseChatEmpty, { props: { status } });
      try {
        expect(wrapper.findAll('button')).toHaveLength(1);
        expect(wrapper.find('.animated-avatar').exists()).toBe(false);
        await wrapper.get('button').trigger('keydown', { key: 'Enter' });
        expect(wrapper.emitted('connect')).toHaveLength(1);
        expect(wrapper.get('button').text()).toBe(status);
      } finally {
        wrapper.unmount();
      }
    }
  );
});
