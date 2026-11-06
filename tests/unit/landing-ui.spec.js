import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { nextTick } from 'vue';
import LearningLanding from '@/components/business/learning/learning-landing.vue';
import NomiLanding from '@/components/business/learning/nomi-landing.vue';
import { initI18n, setLanguage, t } from '@/i18n/index.js';
import { landingMessages } from '@/i18n/messages/landing.js';
import { setMascotReducedMotion } from '@/design/mascot-motion.js';

vi.mock('@dcloudio/uni-app', () => ({ onHide: vi.fn(), onShow: vi.fn(), onLoad: vi.fn(), onBackPress: vi.fn() }));
let wrapper;
beforeEach(() => {
  initI18n();
  setLanguage('zh-CN');
  setMascotReducedMotion(false, { persist: false });
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback) {
        this.callback = callback;
      }
      observe() {
        this.callback([{ isIntersecting: true }]);
      }
      disconnect() {}
    }
  );
});
afterEach(() => {
  wrapper?.unmount();
  setMascotReducedMotion(false, { persist: false });
  vi.unstubAllGlobals();
});
function render(component, props = {}) {
  wrapper = mount(component, {
    props,
    attachTo: document.body,
    global: {
      plugins: [createPinia()],
      mocks: { $yoziInsets: {} },
      stubs: { view: { template: '<div><slot /></div>' }, text: { template: '<span><slot /></span>' } }
    }
  });
  return wrapper;
}
describe('landing language, entry and mascot behavior', () => {
  it('every landing key has both languages and never falls back to its key', () => {
    expect(Object.keys(landingMessages.en).sort()).toEqual(Object.keys(landingMessages['zh-CN']).sort());
    for (const locale of ['zh-CN', 'en']) {
      setLanguage(locale);
      for (const key of Object.keys(landingMessages.en)) expect(t(`landing.${key}`)).toBe(landingMessages[locale][key]);
    }
  });
  it('the App welcome keeps one explicit entry and the approved transparent mascot', async () => {
    render(LearningLanding, { welcome: true });
    expect(wrapper.findAll('.base-button--primary')).toHaveLength(1);
    expect(wrapper.find('.animated-avatar').exists()).toBe(true);
    await wrapper.get('.base-button--primary').trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('start')).toHaveLength(1);
    setLanguage('en');
    await nextTick();
    expect(wrapper.text()).toContain('Start learning');
    expect(wrapper.find('.playful-footer, .future-landing').exists()).toBe(false);
  });
  it('Nomi homepage keeps Chinese copy and controls in both learning languages', async () => {
    render(NomiLanding);
    for (const language of ['zh-CN', 'en']) {
      setLanguage(language);
      await nextTick();
      expect(wrapper.get('h1').text()).toBe('Yozi AI · 考研英语写作教练');
      expect(wrapper.get('.hero__lede').text()).toContain('你的考研英语写作教练');
      expect(wrapper.get('.hero__stats').text()).toContain('考研英语一 / 二');
      expect(
        wrapper
          .findAll('button')
          .every((button) => /[\u3400-\u9fff]/.test(button.text() || button.attributes('aria-label')))
      ).toBe(true);
      expect(wrapper.text()).not.toMatch(/Nomi|bills paid|inboxes tamed/);
    }
  });
  it('Nomi menu closes on navigation and Escape, with download and account entries', async () => {
    render(NomiLanding);
    await wrapper.get('#navToggle').trigger('tap');
    expect(wrapper.get('#navToggle').attributes('aria-expanded')).toBe('true');
    await wrapper
      .findAll('#navLinks button')
      .find((button) => button.text() === '学习数据')
      .trigger('tap');
    expect(wrapper.emitted('open')).toEqual([['progress']]);
    expect(wrapper.get('#navToggle').attributes('aria-expanded')).toBe('false');
    await wrapper.get('#navToggle').trigger('tap');
    await wrapper.get('#nav').trigger('keydown', { key: 'Escape' });
    expect(wrapper.get('#navToggle').attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(wrapper.get('#navToggle').element);
    await wrapper.get('.hero__actions .btn').trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('open')).toEqual([['progress']]);
    expect(wrapper.get('.download-card a').attributes('href')).toMatch(/downloads\/Yozi-AI.*\.zip$/);
    expect(wrapper.text()).not.toContain('导入学习资料');
  });
});
