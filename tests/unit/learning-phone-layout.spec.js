import { afterEach, describe, it, expect, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { storageService } from '@/services/storageService.js';
import { generateLearningTurn } from '@/services/api/domains/learning.api.js';
import { bindKeyboardInset } from '@/components/business/learning/keyboard-inset.js';
import WritingCoach from '@/pages/learning/components/writing-coach.vue';
import MuseComposer from '@/components/business/learning/muse-composer.vue';
import MusePracticeSheet from '@/pages/learning/components/muse-practice-sheet.vue';
import { coachFixture } from '../fixtures/writing-coach.js';

vi.mock('@dcloudio/uni-app', () => ({ onShow: vi.fn(), onHide: vi.fn(), onLoad: vi.fn(), onBackPress: vi.fn() }));
vi.mock('@/services/api/domains/learning.api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  generateLearningTurn: vi.fn(),
  fetchLearningResult: vi.fn(),
  fetchLearningModels: vi.fn(async () => ({
    success: true,
    data: {
      platformEnabled: true,
      presets: [],
      models: [
        {
          id: 'synthetic-model',
          provider: 'synthetic',
          model: 'synthetic-model',
          source: 'platform',
          configured: true,
          capabilities: { structured: true }
        }
      ]
    }
  }))
}));

function fakeView(innerHeight, height, offsetTop = 0) {
  const listeners = {};
  const visualViewport = {
    height,
    offsetTop,
    addEventListener: (name, fn) => (listeners[name] = fn),
    removeEventListener: (name) => delete listeners[name]
  };
  return { innerHeight, visualViewport, listeners };
}

describe('keyboard inset', () => {
  it('reports how much of the window the on-screen keyboard covers', () => {
    const element = document.createElement('div');
    const view = fakeView(844, 844);
    const release = bindKeyboardInset(element, view);
    expect(element.style.getPropertyValue('--keyboard-inset')).toBe('0px');
    view.visualViewport.height = 508;
    view.listeners.resize();
    expect(element.style.getPropertyValue('--keyboard-inset')).toBe('336px');
    release();
    expect(element.style.getPropertyValue('--keyboard-inset')).toBe('');
    expect(view.listeners.resize).toBeUndefined();
  });

  it('does not count a page the browser has already panned', () => {
    const element = document.createElement('div');
    bindKeyboardInset(element, fakeView(844, 508, 336));
    expect(element.style.getPropertyValue('--keyboard-inset')).toBe('0px');
  });

  it('leaves the element alone where the platform has no visual viewport', () => {
    const element = document.createElement('div');
    expect(() => bindKeyboardInset(element, { innerHeight: 844 })()).not.toThrow();
    expect(element.style.getPropertyValue('--keyboard-inset')).toBe('');
  });
});

describe('composer focus', () => {
  it('keeps typing focus when a composer control is pressed, and leaves the field itself alone', () => {
    const wrapper = mount(MuseComposer, { attachTo: document.body, global: { stubs: { BaseIcon: true } } });
    const press = (element) => {
      const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const root = wrapper.get('.muse-composer').element;
    expect(press(root)).toBe(true);
    expect(press(wrapper.get('.base-field__group').element)).toBe(false);
    wrapper.unmount();
  });
});

describe('coach card on a phone', () => {
  let wrapper, scrollIntoView, content;

  afterEach(() => {
    wrapper?.unmount();
    content?.remove();
    delete Element.prototype.scrollIntoView;
  });

  async function trainingCard({ sharing }) {
    uni.clearStorageSync();
    storageService.save('EXAM_USER_ID', 'synthetic-phone-owner', true);
    storageService.save('EXAM_TOKEN', 'synthetic-phone-session-token', true);
    setActivePinia(createPinia());
    const store = useConversationLearningStore();
    store.startCoach('考研英语二写作');
    store.modelId = 'synthetic-model';
    store.sharingAllowed = true;
    vi.mocked(generateLearningTurn).mockImplementation(async (body) => ({
      success: true,
      data: {
        requestId: body.requestId,
        requestBinding: body.requestBinding,
        modelId: body.modelId,
        coach: coachFixture(body.learningContext.coach)
      }
    }));
    store.coachSave('profile', { profile: { exam: 'english2', minutes: 25, deadline: null } });
    await store.requestCoach('diagnostic');
    for (const card of store.active.coach.diagnostic.cards)
      store.coachSave('answer', { target: 'diagnostic', cardId: card.id, answer: 'Synthetic answer.' });
    await store.requestCoach('feedback', 'diagnostic');
    await store.requestCoach('daily');
    store.sharingAllowed = sharing;
    store.refresh();
    // A student who scrolled up: the "follow latest" flag is off, the turn must still come into view.
    content = document.createElement('div');
    content.className = 'space-content';
    content.dataset.followLatest = 'false';
    document.body.appendChild(content);
    scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    wrapper = mount(WritingCoach, {
      attachTo: content,
      global: { stubs: { BaseIcon: true, PrivacyPopup: true } }
    });
    await flushPromises();
    return store;
  }

  it('brings the next step into view after the student submits, even when scrolled up', async () => {
    const store = await trainingCard({ sharing: false });
    expect(scrollIntoView).not.toHaveBeenCalled();
    const card = store.active.coach.days[0].pack.cards[0];
    wrapper.vm.answer = 'Synthetic answer.';
    wrapper.findComponent(MusePracticeSheet).vm.$emit('submit', card);
    await flushPromises();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
  });

  it('brings the next card into view after 先继续下一题', async () => {
    const store = await trainingCard({ sharing: false });
    const card = store.active.coach.days[0].pack.cards[0];
    wrapper.vm.answer = 'Synthetic answer.';
    wrapper.findComponent(MusePracticeSheet).vm.$emit('submit', card);
    await flushPromises();
    scrollIntoView.mockClear();
    wrapper.vm.continueTraining();
    await flushPromises();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
  });

  it('offers per-send consent at the current step, not only at the top of the conversation', async () => {
    const store = await trainingCard({ sharing: false });
    const consent = wrapper.get('#coach-current-turn [data-test="coach-consent"]');
    expect(consent.text()).toContain('同意共享本次原答和必要资料片段');
    wrapper.getComponent('[data-test="coach-consent"]').vm.$emit('update:modelValue', true);
    await flushPromises();
    expect(store.sharingAllowed).toBe(true);
  });
});
