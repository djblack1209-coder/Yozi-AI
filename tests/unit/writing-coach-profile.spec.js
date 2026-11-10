import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, getActivePinia, setActivePinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';
vi.mock('@dcloudio/uni-app', () => ({
  onShow: () => {},
  onHide: () => {},
  onLoad: () => {},
  onBackPress: () => {}
}));
import WritingCoach from '@/pages/learning/components/writing-coach.vue';
import BaseOptions from '@/components/base/base-options/base-options.vue';
import BaseSegmented from '@/components/base/base-segmented/base-segmented.vue';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { learningWriteLease } from '@/services/learning/learning-write-lease.js';
import { setLanguage } from '@/i18n/index.js';
import {
  normalizeCoachRequest,
  coachInputFor,
  WRITING_COACH_CONTRACT
} from '../../laf-backend/functions/_shared/learning-writing-coach.js';
import { coachFixture } from '../fixtures/writing-coach.js';

let wrapper;
beforeEach(() => {
  uni.clearStorageSync();
  setActivePinia(createPinia());
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  for (const s of getActivePinia()?._s.values() || []) s.$dispose();
  learningWriteLease.release();
  vi.restoreAllMocks();
  vi.useRealTimers();
  setLanguage('zh-CN');
  uni.clearStorageSync();
});
const stubs = {
  view: { template: '<div><slot /></div>' },
  text: { template: '<span><slot /></span>' },
  BaseIcon: true
};

it('开发建档使用已明确的考试时间与时长，仍等待明确保存', async () => {
  vi.stubGlobal('__YOZI_DEV_TEST__', true);
  vi.resetModules();
  const { default: DevWritingCoach } = await import('@/pages/learning/components/writing-coach.vue');
  const { useConversationLearningStore: useFreshStore } = await import('@/stores/modules/conversation-learning.js');
  const store = useFreshStore();
  store.startCoach('我准备考研英语一，今年12月考，每天40分钟，先练大作文。');
  try {
    wrapper = mount(DevWritingCoach, { global: { stubs }, attachTo: document.body });
    await flushPromises();
    expect(wrapper.text()).toContain('目前写作哪里最吃力？');
    expect(wrapper.text()).not.toContain('英语一还是英语二？');
    expect(wrapper.text()).not.toContain('每天能学多久？');
    expect(store.active.coach.profile).toBeNull();
    await wrapper.get('textarea').setValue('不知道如何组织段落');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '保存建档')
      .trigger('tap');
    await flushPromises();
    expect(store.active.coach.profile).toMatchObject({
      exam: 'english1',
      deadlineBucket: 'this',
      minutes: 40,
      foundation: '不知道如何组织段落'
    });
    expect(wrapper.text()).toContain('建档已保存：英语一 · 今年12月 · 40分钟/天 · 困难：不知道如何组织段落');
  } finally {
    wrapper?.unmount();
    wrapper = null;
    store.$dispose();
    vi.unstubAllGlobals();
    vi.resetModules();
  }
});

it('开发段落编辑保留题干全文字数，不重复显示默认全文字数为本段要求', async () => {
  vi.stubGlobal('__YOZI_DEV_TEST__', true);
  vi.resetModules();
  const { default: DevWritingCoach } = await import('@/pages/learning/components/writing-coach.vue');
  const { useConversationLearningStore: useFreshStore } = await import('@/stores/modules/conversation-learning.js');
  const store = useFreshStore();
  store.startCoach('考研英语二应用文');
  store.coachSave('profile', { profile: { exam: 'english2', deadline: null, minutes: 15 } });
  const pack = coachFixture({ phase: 'daily', exam: 'english2', sources: [] });
  const feedback = { lines: [], dimensions: [], weaknesses: [], strengths: [], phrases: [] };
  pack.writing.prompt = '请写邀请信，全文字数120–150词。';
  pack.writing.essayType = 'small';
  Object.assign(store.active.coach, {
    diagnostic: { cards: [], answers: [], feedback },
    days: [
      {
        day: store.todaySummary.day,
        pack,
        answers: [],
        analysis: {},
        drafts: [],
        rewrites: [],
        feedback: Object.fromEntries([
          ...pack.cards.map((card) => [`card-${card.id}`, feedback]),
          ['analysis', feedback]
        ]),
        essay: null,
        summary: null
      }
    ]
  });
  try {
    wrapper = mount(DevWritingCoach, { global: { stubs }, attachTo: document.body });
    await flushPromises();
    expect(wrapper.text()).toContain('全文字数120–150词');
    expect(wrapper.text()).toContain('全文字数以题干为准');
    expect(wrapper.text()).not.toContain('约100词');
    expect(wrapper.findAll('textarea')).toHaveLength(1);
  } finally {
    wrapper?.unmount();
    wrapper = null;
    store.$dispose();
    vi.unstubAllGlobals();
    vi.resetModules();
  }
});

it('页面交接时先保留草稿，旧页面稍后销毁也不会覆盖新草稿或写入学习事实', async () => {
  const store = useConversationLearningStore();
  const before = store.exportData();
  const old = mount(WritingCoach, { global: { stubs } });
  await old.get('textarea[aria-label="发送消息"]').setValue('我准备考研英语二');
  wrapper = mount(WritingCoach, { global: { stubs } });
  expect(wrapper.get('textarea[aria-label="发送消息"]').element.value).toBe('我准备考研英语二');
  await wrapper.get('textarea[aria-label="发送消息"]').setValue('我准备考研英语二，练应用文');
  old.unmount();
  wrapper.unmount();
  wrapper = mount(WritingCoach, { global: { stubs } });
  expect(wrapper.get('textarea[aria-label="发送消息"]').element.value).toBe('我准备考研英语二，练应用文');
  expect(store.exportData()).toBe(before);
});

it('未连接时保留输入目标，不自动建立未经确认的学习事实', async () => {
  const store = useConversationLearningStore();
  wrapper = mount(WritingCoach, { attrs: { onGeneral: (input) => store.start(input) }, global: { stubs } });
  await wrapper.get('textarea[aria-label="发送消息"]').setValue('考研英语二申请信写作');
  await wrapper.get('button[aria-label="发送"]').trigger('tap');
  await flushPromises();
  expect(store.active).toBeFalsy();
  expect(wrapper.get('textarea[aria-label="发送消息"]').element.value).toBe('考研英语二申请信写作');
  expect(wrapper.text()).toContain('请先连接自己的 API');
});

it('重新打开接续上次选择的对话；写作带练仍能从目录定位且不改写记录', () => {
  vi.stubEnv('VITE_ENABLE_WRITING_COACH', 'true');
  let store = useConversationLearningStore();
  store.startCoach('考研英语二写作');
  const coachId = store.active.id;
  store.start('12 + 8');
  const legacyId = store.active.id;
  const before = store.exportData();
  for (const s of getActivePinia()._s.values()) s.$dispose();
  learningWriteLease.release();
  setActivePinia(createPinia());
  store = useConversationLearningStore();
  expect(store.active.id).toBe(legacyId);
  expect(store.exportData()).toBe(before);
  store.locateConversation(coachId);
  expect(store.active.id).toBe(coachId);
  expect(store.exportData()).toBe(before);
  vi.unstubAllEnvs();
});

// 建档卡片只有在 coach 已建立、profile 仍为空时出现。
async function profileCard() {
  const store = useConversationLearningStore();
  store.startCoach('考研英语写作');
  wrapper = mount(WritingCoach, { global: { stubs }, attachTo: document.body });
  await flushPromises();
  return { store, card: wrapper };
}

function byLabel(component, label) {
  return wrapper.findAllComponents(component).find((item) => item.props('label') === label);
}

function examPicker() {
  return byLabel(BaseSegmented, '英语一还是英语二？');
}

function subjectPicker() {
  return byLabel(BaseOptions, '你在准备什么？');
}

function skipButton() {
  return wrapper.findAll('button').find((item) => item.text().includes('跳过，直接开始'));
}

function startButton() {
  return wrapper.findAll('button').find((item) => item.text().includes('开始建档'));
}

it('建档选择阶段说明输入暂不可用，进入基础补充后提示选填且不提前保存档案', async () => {
  const { store } = await profileCard();
  const input = wrapper.get('textarea');
  expect(input.attributes('disabled')).toBeDefined();
  expect(input.attributes('placeholder')).toBe('请先完成上方选择');
  for (let step = 0; step < 3; step++) {
    await wrapper
      .findAll('button')
      .find((item) => item.text() === '继续')
      .trigger('tap');
  }
  expect(input.attributes('disabled')).toBeUndefined();
  expect(input.attributes('placeholder')).toBe('写下目前的基础或困难（选填）');
  expect(store.active.coach.profile).toBeNull();
});

describe('建档「跳过」不覆盖用户已选的考试类型', () => {
  it('选了英语二再跳过，保存的仍是英语二', async () => {
    const { store } = await profileCard();
    expect(examPicker()).toBeTruthy();
    examPicker().vm.$emit('update:modelValue', 'english2');
    await flushPromises();
    skipButton().trigger('tap');
    await flushPromises();
    expect(store.active.coach.profile.exam).toBe('english2');
  });

  it('没选择考试或时长，跳过仍保留未知字段为空', async () => {
    const { store } = await profileCard();
    skipButton().trigger('tap');
    await flushPromises();
    expect(store.active.coach.profile).toMatchObject({
      exam: null,
      deadline: null,
      minutes: null,
      foundation: null
    });
    expect(wrapper.findAll('button').some((item) => item.attributes('aria-label') === '学习看板')).toBe(false);
    expect(store.active.coach.profile.deadline).toBeNull();
  });

  it('保存建档但未选择考试时间时，日期同样为空', async () => {
    const store = useConversationLearningStore();
    wrapper = mount(WritingCoach, { global: { stubs }, attachTo: document.body });
    await flushPromises();
    store.startCoach('考研英语写作');
    await flushPromises();
    for (let i = 0; i < 3; i++) {
      await wrapper
        .findAll('button')
        .find((item) => item.text() === '继续')
        .trigger('tap');
      await flushPromises();
    }
    await wrapper
      .findAll('button')
      .find((item) => item.text().includes('保存建档'))
      .trigger('tap');
    await flushPromises();
    expect(store.active.coach.profile?.deadline).toBeNull();
  });

  it('只给出写作方向，跳过后不擅自推断英语一', async () => {
    const store = useConversationLearningStore();
    wrapper = mount(WritingCoach, { global: { stubs }, attachTo: document.body });
    await flushPromises();
    store.startCoach('考研英语写作');
    await flushPromises();
    skipButton().trigger('tap');
    await flushPromises();
    expect(store.active.coach.profile.exam).toBeNull();
  });
});

describe('新入口等待真实模型回执', () => {
  it('没有连接回执时不呈现固定考试选择框，也不创建档案', async () => {
    const store = useConversationLearningStore();
    wrapper = mount(WritingCoach, { global: { stubs }, attachTo: document.body });
    await flushPromises();
    expect(subjectPicker()).toBeUndefined();
    expect(startButton()).toBeUndefined();
    expect(wrapper.text()).not.toContain('你在准备什么？');
    expect(store.active).toBeFalsy();
  });
});

describe('新一轮带练不继承上一轮的选择', () => {
  it('上一轮选英语二，这一轮重新建档后保存的是英语一', async () => {
    const store = await profileCard().then((r) => r.store);
    examPicker().vm.$emit('update:modelValue', 'english2');
    await flushPromises();
    skipButton().trigger('tap');
    await flushPromises();
    expect(store.active.coach.profile.exam).toBe('english2');

    // 结束会话让入口卡重现，草稿必须回到种子。
    store.selectedConversationId = null;
    await flushPromises();
    expect(subjectPicker()).toBeUndefined();
    store.startCoach('考研英语写作');
    await flushPromises();
    expect(store.active.coach.profile).toBe(null);
    examPicker().vm.$emit('update:modelValue', 'english1');
    await flushPromises();
    skipButton().trigger('tap');
    await flushPromises();
    expect(store.active.coach.profile.exam).toBe('english1');
  });
});

describe('Muse navigation keeps unfinished profile choices as drafts', () => {
  it('returning from another page restores the selected exam and step without saving a profile', async () => {
    const { store } = await profileCard();
    examPicker().vm.$emit('update:modelValue', 'english2');
    await flushPromises();
    for (let i = 0; i < 3; i++) {
      await wrapper
        .findAll('button')
        .find((item) => item.text() === '继续')
        .trigger('tap');
    }
    await wrapper.get('textarea[aria-label="补充基础"]').setValue('句子结构');
    const before = store.exportData();
    wrapper.unmount();
    wrapper = mount(WritingCoach, { global: { stubs }, attachTo: document.body });
    await flushPromises();
    expect(wrapper.get('textarea[aria-label="补充基础"]').element.value).toBe('句子结构');
    for (let i = 0; i < 3; i++)
      await wrapper
        .findAll('button')
        .find((item) => item.text() === '上一步')
        .trigger('tap');
    expect(examPicker().props('modelValue')).toBe('english2');
    expect(store.active.coach.profile).toBeNull();
    expect(store.exportData()).toBe(before);
  });
});

it('Muse 答题卡明确提交原答，按题名回看与重新进入不改写历史事实', async () => {
  const store = useConversationLearningStore();
  store.startCoach('考研英语一写作');
  store.coachSave('profile', { profile: { exam: 'english1', deadline: null, minutes: 25 } });
  const request = normalizeCoachRequest({
    contract: WRITING_COACH_CONTRACT,
    phase: 'diagnostic',
    exam: 'english1',
    day: store.todaySummary.day,
    ...coachInputFor(store.active.coach, null, 'diagnostic', 'diagnostic')
  });
  const data = { conversationId: store.active.id, explicit: true, requestId: 'ui-sheet-request' };
  store.commit('coach.request', { ...data, request, modelId: 'synthetic', binding: 'synthetic' });
  store.commit('coach.result', { ...data, output: coachFixture(request) });
  wrapper = mount(WritingCoach, { global: { stubs }, attachTo: document.body });
  await flushPromises();
  const raw = 'I am writing to invite you.  My original spacing.';
  expect(wrapper.findAll('textarea')).toHaveLength(1);
  await wrapper.get('.muse-composer textarea').setValue(raw);
  expect(store.active.coach.diagnostic.answers).toHaveLength(0);
  await wrapper.get('.muse-composer .muse-send').trigger('tap');
  await flushPromises();
  expect(store.active.coach.diagnostic.answers[0]).toMatchObject({ cardId: 'd1', answer: raw });
  const before = store.exportData();
  await wrapper.get('button[aria-label="成分识别，已提交"]').trigger('tap');
  expect(wrapper.get('.practice-answer').text()).toBe(raw);
  expect(store.exportData()).toBe(before);
  wrapper.unmount();
  wrapper = mount(WritingCoach, { global: { stubs }, attachTo: document.body });
  await flushPromises();
  expect(wrapper.get('.coach-history-turn').text()).toContain(raw);
  expect(wrapper.get('.coach-history-turn').text()).toContain('成分识别');
  expect(store.exportData()).toBe(before);
});

it('明确首条目标只填入未提交草稿，并保留用户确认', async () => {
  const store = useConversationLearningStore();
  store.startCoach('考研英语二，每天25分钟，2027-12-20考试');
  wrapper = mount(WritingCoach, { global: { stubs } });
  await flushPromises();
  expect(wrapper.text()).toContain('英语二');
  expect(wrapper.text()).toContain('25分钟/天');
  expect(wrapper.text()).toContain('2027-12-20');
  expect(store.active.coach.profile).toBeNull();
  expect(wrapper.text()).toContain('保存建档');
});
