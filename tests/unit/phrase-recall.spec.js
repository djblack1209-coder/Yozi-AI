import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import {
  emptyLearningState,
  applyLearningOperation,
  normalizePrivateSyncOperation
} from '@/services/learning/learning-domain.js';
import { prepareLearningRestore } from '@/services/learning/learning-backup.js';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { workspaceDrafts } from '@/services/learning/workspace-drafts.js';
import { learningWriteLease } from '@/services/learning/learning-write-lease.js';
import WritingCoach from '@/pages/learning/components/writing-coach.vue';
import { coachFixture } from '../fixtures/writing-coach.js';
import {
  normalizeCoachRequest,
  coachInputFor,
  WRITING_COACH_CONTRACT
} from '../../laf-backend/functions/_shared/learning-writing-coach.js';
import {
  PHRASE_RECALL_CONTRACT,
  phraseRecallCue
} from '../../laf-backend/functions/_shared/learning-writing-corpus.js';
import { phraseReviewRating } from '../../laf-backend/functions/_shared/learning-runtime-policy.js';
import { coachSavedRecords } from '../../laf-backend/functions/_shared/learning-coach-records.js';
import { reviewFacts } from '../../laf-backend/functions/_shared/learning-adherence.js';
import { coachDueItem } from '../../laf-backend/functions/_shared/learning-reminders.js';

vi.mock('@dcloudio/uni-app', () => ({ onShow: vi.fn(), onHide: vi.fn(), onLoad: vi.fn(), onBackPress: vi.fn() }));
const AT = Date.parse('2026-11-04T09:00:00Z');
const sentence = 'The library gives students more space to study.';
const cue = '译成英文：图书馆为学生提供更多学习空间。';

// Synthetic originals and receipts; no actual model, public teaching content or prediction evidence.
function fixture() {
  let state = emptyLearningState('recall-synthetic-owner', 'Asia/Shanghai'),
    serial = 0;
  const apply = (type, data = {}) => {
    const op = {
      id: `recall-${++serial}`,
      type,
      at: AT - 2 * 86400000 + serial,
      data: type.startsWith('coach.') ? { conversationId: 'c', explicit: true, ...data } : data
    };
    if (type === 'conversation.start') op.id = 'c';
    state = applyLearningOperation(state, op).state;
    return op.id;
  };
  const coach = () => state.conversations[0].coach;
  const generate = (phase, target = phase) => {
    const request = normalizeCoachRequest({
      contract: WRITING_COACH_CONTRACT,
      exam: 'english2',
      phase,
      target,
      day: '2026-11-02',
      essayType: 'small',
      sources: [],
      ...coachInputFor(coach(), coach().days[0], phase, target)
    });
    const requestId = `request-${serial}`;
    apply('coach.request', { requestId, request, modelId: 'synthetic', binding: 'synthetic' });
    const output = coachFixture(request);
    if (phase === 'daily') output.cards[5].prompt = cue;
    if (phase === 'feedback')
      Object.assign(output, {
        weaknesses: [],
        phrases: [sentence],
        lines: [{ original: request.input, advice: 'Synthetic suggestion.', rewrite: sentence }]
      });
    apply('coach.result', { requestId, output });
  };
  apply('conversation.start', { goal: '合成英语二复习' });
  apply('coach.begin');
  apply('coach.profile', { profile: { exam: 'english2', minutes: 20 } });
  generate('diagnostic');
  for (let i = 1; i <= 5; i++)
    apply('coach.answer', { target: 'diagnostic', cardId: `d${i}`, answer: 'Synthetic answer.' });
  generate('feedback', 'diagnostic');
  generate('daily');
  for (let i = 0; i <= 5; i++) {
    apply('coach.answer', { target: 'daily', cardId: `c${i}`, answer: sentence });
    generate('feedback', `card-c${i}`);
  }
  apply('coach.adopt', { feedbackId: coach().days[0].feedback['card-c5'].id, phrase: sentence });
  return state;
}
function review(state, patch = {}) {
  return applyLearningOperation(state, {
    id: 'new-review',
    type: 'coach.review',
    at: AT,
    data: {
      conversationId: 'c',
      explicit: true,
      itemId: state.conversations[0].coach.library[0].id,
      answer: sentence,
      rating: 2,
      ratingSource: 'host-v1',
      reviewContract: PHRASE_RECALL_CONTRACT,
      referenceShown: true,
      schedule: { due: new Date(AT + 600000).toISOString() },
      ...patch
    }
  }).state;
}

describe('S38 versioned English phrase recall', () => {
  it('keeps exact-match normalization and legacy ratings, while a shown reference caps exact matches at 2', () => {
    const item = { text: sentence, reviews: [{ rating: 3 }, { rating: 4 }] };
    expect(phraseReviewRating(item, `  ${sentence.toUpperCase().replaceAll(' ', '  ')} `)).toBe(4);
    expect(phraseReviewRating(item, sentence, { hinted: true })).toBe(2);
    expect(phraseReviewRating(item, 'A natural alternative.', { hinted: true })).toBe(1);
    expect(phraseReviewRating({ ...item, reviews: [] }, sentence)).toBe(3);
  });
  it('uses only a traceable saved translation cue, never an example, an included answer or another card', () => {
    const state = fixture(),
      coach = state.conversations[0].coach,
      item = coach.library[0];
    const before = JSON.stringify(state);
    expect(phraseRecallCue(coach, item)).toBe(cue);
    expect(JSON.stringify(state)).toBe(before);
    coach.days[0].pack.cards[5].prompt = `Translate: ${sentence.toUpperCase()}`;
    expect(phraseRecallCue(coach, item)).toBe('');
    coach.days[0].pack.cards[5].prompt = cue;
    coach.days[0].pack.cards[5].kind = 'translate_zh';
    expect(phraseRecallCue(coach, item)).toBe('');
    item.feedbackId = 'unbound';
    expect(phraseRecallCue(coach, item)).toBe('');
  });
  it('saves explicit reference context, changes the due queue and replays identically through sync/restore', () => {
    const before = fixture(),
      state = review(before),
      coach = state.conversations[0].coach;
    expect(coach.library[0].reviews.at(-1)).toMatchObject({
      rating: 2,
      source: 'host_checked',
      referenceShown: true,
      reviewContract: PHRASE_RECALL_CONTRACT
    });
    expect(coachDueItem(before.conversations[0].coach, AT)).toBeTruthy();
    expect(coachDueItem(coach, AT)).toBeNull();
    expect(reviewFacts(state, AT).filter((v) => !v.completedBy && v.availableAt <= AT)).toHaveLength(0);
    expect(coachSavedRecords(state.conversations[0]).at(-1)).toMatchObject({
      title: '句式复习',
      reviewContext: '复习卡已显示原句'
    });
    let replay = emptyLearningState(before.owner, before.timezone);
    for (const op of state.events) replay = applyLearningOperation(replay, normalizePrivateSyncOperation(op)).state;
    expect(replay).toEqual(state);
    expect(
      prepareLearningRestore(emptyLearningState(before.owner, before.timezone), JSON.stringify(state), { now: AT })
        .state
    ).toEqual(state);
    expect(state.attempts).toEqual(before.attempts);
    expect(coach.predictionChecks || []).toEqual(before.conversations[0].coach.predictionChecks || []);
    expect(coach.requests).toEqual(before.conversations[0].coach.requests);
    expect(coach.days).toEqual(before.conversations[0].coach.days);
  });
  it('keeps old untagged reviews unchanged and supports unshown exact matches without inventing independence', () => {
    const old = review(fixture(), { reviewContract: undefined, referenceShown: undefined, rating: 3 });
    expect(old.conversations[0].coach.library[0].reviews[0]).not.toHaveProperty('referenceShown');
    expect(coachSavedRecords(old.conversations[0]).at(-1)).toMatchObject({ title: '复习自评' });
    const fresh = review(fixture(), { referenceShown: false, rating: 3 });
    expect(coachSavedRecords(fresh.conversations[0]).at(-1).reviewContext).toBe('复习卡未显示原句');
    expect(JSON.stringify(fresh.conversations[0].coach.library[0].reviews)).not.toMatch(/independent|mastery/);
  });
  it.each([
    { reviewContract: 'unknown' },
    { reviewContract: undefined },
    { referenceShown: 'false' },
    { referenceShown: undefined },
    { ratingSource: undefined },
    { practice: true },
    { rating: 3 }
  ])('rejects tampered or unversioned recall metadata %j without changing facts', (patch) => {
    const state = fixture(),
      before = JSON.stringify(state);
    expect(() => review(state, patch)).toThrow();
    expect(JSON.stringify(state)).toBe(before);
  });
  it('does not extend the new English review contract to a different subject', () => {
    const state = fixture();
    state.conversations[0].coach.profile.exam = 'general';
    expect(() => review(state)).toThrow('句式复习版本或参考状态不合法');
  });
});

let store, wrapper;
beforeEach(() => {
  uni.clearStorageSync();
  localStorage.clear();
  setActivePinia(createPinia());
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  store?.$dispose();
  store = null;
  learningWriteLease.release();
  vi.restoreAllMocks();
});
function uiStore() {
  store = useConversationLearningStore();
  store.startCoach('合成复习卡');
  store.coachSave('profile', { profile: { exam: 'english2', minutes: 20 } });
  store.active.coach.library.push({
    id: 'synthetic-phrase',
    text: sentence,
    day: '2026-11-01',
    due: 1,
    reviews: [],
    schedule: null
  });
  return store;
}
async function render() {
  wrapper = mount(WritingCoach, {
    global: {
      stubs: {
        LearningShell: { template: '<div><slot/><slot name="composer"/></div>' },
        MuseModelControl: true,
        BaseIcon: true
      }
    }
  });
  await flushPromises();
  return wrapper;
}
describe('S38 local reference visibility and explicit submit', () => {
  it('hides the original, preserves a revealed reference across remounts and scopes it to this due item and owner', async () => {
    uiStore();
    const request = vi.spyOn(store, 'requestCoach'),
      before = store.exportData();
    await render();
    expect(wrapper.get('.muse-composer textarea').attributes('placeholder')).toBe('回忆并写出原句');
    expect(wrapper.find('[data-test="phrase-review-original"]').exists()).toBe(false);
    await wrapper.get('[data-test="phrase-review-reveal"]').trigger('tap');
    expect(wrapper.get('[data-test="phrase-review-original"]').text()).toBe(sentence);
    expect(store.exportData()).toBe(before);
    wrapper.unmount();
    await render();
    expect(wrapper.get('[data-test="phrase-review-original"]').text()).toBe(sentence);
    const original = store.active.id;
    store.startCoach('另一个目标');
    store.coachSave('profile', { profile: { exam: 'english2', minutes: 20 } });
    store.active.coach.library.push({ id: 'synthetic-phrase', text: sentence, day: '2026-11-01', due: 1, reviews: [] });
    await flushPromises();
    expect(wrapper.find('[data-test="phrase-review-original"]').exists()).toBe(false);
    store.selectedConversationId = original;
    await flushPromises();
    expect(wrapper.find('[data-test="phrase-review-original"]').exists()).toBe(true);
    store.active.coach.library[0].due = 2;
    await flushPromises();
    expect(wrapper.find('[data-test="phrase-review-original"]').exists()).toBe(false);
    const anotherOwner = reactive({
      state: { owner: 'another-synthetic-owner' },
      recordContext: () => 'other-context'
    });
    expect(workspaceDrafts(anotherOwner).read('other-context', `coach:recall:${original}:synthetic-phrase:1`)).toEqual(
      {}
    );
    expect(request).not.toHaveBeenCalled();
  });
  it('uses the real host store and FSRS only on submission, records shown status and leaves no extra model task', async () => {
    uiStore();
    const request = vi.spyOn(store, 'requestCoach');
    await render();
    await wrapper.get('[data-test="phrase-review-reveal"]').trigger('tap');
    await wrapper.get('.muse-composer textarea').setValue(sentence);
    const before = store.state.events.length;
    await wrapper.get('[data-test="phrase-review-submit"]').trigger('tap');
    await flushPromises();
    expect(store.state.events).toHaveLength(before + 1);
    expect(store.state.events.at(-1).data).toMatchObject({
      reviewContract: PHRASE_RECALL_CONTRACT,
      referenceShown: true,
      rating: 2
    });
    expect(store.active.coach.library[0].due).toBeGreaterThan(Date.now());
    expect(wrapper.find('[data-test="phrase-review-card"]').exists()).toBe(false);
    expect(wrapper.get('[data-test="phrase-review-context"]').text()).toBe('复习卡已显示原句');
    expect(request).not.toHaveBeenCalled();
  });
  it.each(['failure', 'new-input', 'conversation'])(
    'preserves the appropriate draft during an asynchronous %s',
    async (change) => {
      uiStore();
      await render();
      let resolve, reject;
      const pending = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      });
      vi.spyOn(store, 'coachReview').mockReturnValue(pending);
      await wrapper.get('.muse-composer textarea').setValue(sentence);
      await wrapper.get('[data-test="phrase-review-submit"]').trigger('tap');
      expect(wrapper.get('.muse-composer textarea').element.value).toBe(sentence);
      if (change === 'new-input') await wrapper.get('.muse-composer textarea').setValue('A later draft.');
      if (change === 'conversation') {
        store.startCoach('另一个目标');
        await flushPromises();
      }
      if (change === 'failure') reject(Object.assign(new Error('Synthetic save failure'), { code: 'BUSY' }));
      else resolve();
      await flushPromises();
      if (change === 'conversation') expect(wrapper.get('.muse-composer textarea').element.value).toBe('');
      else
        expect(wrapper.get('.muse-composer textarea').element.value).toBe(
          change === 'failure' ? sentence : 'A later draft.'
        );
    }
  );
});
