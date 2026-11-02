import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import ProgressOverview from '@/components/business/learning/progress/progress-overview.vue';
import ProgressMindMap from '@/components/business/learning/progress/progress-mind-map.vue';
import ProgressEvidence from '@/components/business/learning/progress/progress-evidence.vue';
import Knowledge from '@/pages/learning/knowledge.vue';
import WebsiteWorkspace from '@/components/business/website/website-workspace.vue';
import { knowledgeGraphSeed } from '@/services/learning/knowledge-graph-seed.js';
import { learningProgressReadModel } from '@/services/learning/learning-progress-read-model.js';
import { progressBoundaryFixture, progressFixture } from '../fixtures/learning-progress.js';
const harness = vi.hoisted(() => ({ learning: null, read: vi.fn() }));
vi.mock('@/stores/modules/conversation-learning.js', () => ({ useConversationLearningStore: () => harness.learning }));
vi.mock('@/services/learning/learning-sync.js', () => ({ readLearningSnapshot: harness.read }));
vi.mock('@dcloudio/uni-app', () => ({ onLoad: vi.fn(), onShow: vi.fn(), onHide: vi.fn(), onResize: vi.fn() }));
const button = {
  props: ['label', 'selected', 'disabled'],
  emits: ['tap'],
  template: '<button :aria-label="label" :disabled="disabled" @click="$emit(\'tap\')"><slot /></button>'
};
const modal = { props: ['visible'], template: '<section v-if="visible" role="dialog"><slot /></section>' };
const global = { stubs: { BaseButton: button, BaseIcon: true, CustomModal: modal, AnimatedAvatar: true } };
beforeEach(() => {
  setActivePinia(createPinia());
  harness.read.mockReset();
});

describe('progress presentation shares one read model without writing learning facts', () => {
  it.each([4, 5])('renders the same sample gate in subjects, framework and mind map at %i events', async (count) => {
    harness.learning = reactive({
      state: progressBoundaryFixture(count),
      recordReadState: 'ready',
      recordContext() {
        return this.state.owner;
      },
      refresh: vi.fn()
    });
    const model = learningProgressReadModel(harness.learning.state);
    const wrapper = mount(Knowledge, { global });
    expect(wrapper.get('[data-metric="语法"]').text()).toContain(count === 5 ? '0%' : '数据不足');
    expect(wrapper.find('[data-metric="数学"]').exists()).toBe(false);
    for (const selector of ['data-node-id', 'data-mind-node']) {
      if (selector === 'data-mind-node')
        await wrapper
          .findAll('button')
          .find((item) => item.text() === '思维导图')
          .trigger('click');
      const node = wrapper.get(`[${selector}="agreement"]`);
      expect(node.text()).toContain(count === 5 ? '可改进' : '数据不足');
      expect(node.text().includes('薄弱点')).toBe(count === 5);
      expect(node.classes().includes('is-weakness')).toBe(count === 5);
      expect(
        wrapper
          .findAll(`[${selector}].is-weakness`)
          .map((item) => item.attributes(selector))
          .sort()
      ).toEqual(model.weaknesses.map((item) => item.id).sort());
    }
    wrapper.unmount();
  });
  it.each([0, 4, 5, 6])(
    'never renders mastery claims in any node, detail, evidence or mind map (%i receipts)',
    async (count) => {
      harness.learning = reactive({
        state: progressFixture(count, count),
        recordReadState: 'ready',
        recordContext() {
          return this.state.owner;
        },
        refresh: vi.fn()
      });
      const wrapper = mount(Knowledge, { global });
      expect(wrapper.html()).not.toMatch(/掌握|mastered/i);
      for (const node of wrapper.findAll('[data-node-id]')) {
        await node.trigger('click');
        expect(wrapper.html()).not.toMatch(/掌握|mastered/i);
      }
      await wrapper
        .findAll('button')
        .find((item) => item.text() === '思维导图')
        .trigger('click');
      expect(wrapper.html()).not.toMatch(/掌握|mastered/i);
      wrapper.unmount();
    }
  );
  it('empty and four-event panels display 数据不足 without percentages; sufficient metrics expand exact sources', async () => {
    const wrapper = mount(ProgressOverview, {
      props: { model: learningProgressReadModel(progressFixture(4, 4)) },
      global
    });
    expect(wrapper.text()).toContain('数据不足');
    expect(wrapper.text()).not.toContain('%');
    await wrapper.setProps({ model: learningProgressReadModel(progressFixture()) });
    expect(wrapper.get('[data-metric="语法"]').text()).toContain('67%');
    await wrapper.get('[data-metric="语法"]').trigger('click');
    expect(wrapper.findAll('.progress-event')).toHaveLength(6);
    expect(wrapper.findAll('.progress-event')[0].text()).toContain('合成短句题 6');
    expect(wrapper.findAll('.progress-event')[0].text()).toContain('BYOK');
    await wrapper.setProps({ model: learningProgressReadModel({ owner: 'other' }) });
    expect(wrapper.find('.progress-trace').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('合成短句题');
    wrapper.unmount();
  });
  it('framework and mind map show the same rubric status; record opens the exact saved original and clears on account change', async () => {
    const state = progressFixture(),
      before = JSON.stringify(state);
    harness.learning = reactive({
      state,
      recordReadState: 'ready',
      recordContext() {
        return this.state.owner;
      },
      refresh: vi.fn()
    });
    const wrapper = mount(Knowledge, { global });
    expect(wrapper.get('[data-node-id="sentence"]').text()).toContain('可改进');
    expect(wrapper.get('[data-node-id="sentence"]').text()).toContain('薄弱点');
    expect(wrapper.get('[data-node-id="sentence"]').classes()).toContain('is-weakness');
    await wrapper.get('[data-node-id="sentence"]').trigger('click');
    expect(wrapper.get('#knowledge-detail').findAll('.progress-event')).toHaveLength(2);
    await wrapper.get('#knowledge-detail .progress-event button').trigger('click');
    expect(wrapper.get('[role="dialog"]').text()).toContain('Synthetic answer 5');
    expect(wrapper.get('[role="dialog"]').text()).toContain('合成短句题 6');
    const mindButton = wrapper.findAll('button').find((item) => item.text() === '思维导图');
    await mindButton.trigger('click');
    expect(wrapper.get('[data-mind-node="sentence"]').text()).toContain('可改进');
    expect(wrapper.find('[draggable="true"]').exists()).toBe(false);
    expect(JSON.stringify(harness.learning.state)).toBe(before);
    harness.learning.state = { ...progressFixture(0, 0), owner: 'other' };
    await nextTick();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Synthetic answer 5');
    wrapper.unmount();
  });
  it('mind map only emits selection and has no editing or exercise control', async () => {
    const model = learningProgressReadModel(progressFixture()),
      before = JSON.stringify(model);
    const wrapper = mount(ProgressMindMap, { props: { model }, global });
    expect(wrapper.findAll('[data-mind-node]')).toHaveLength(26);
    await wrapper.get('[data-mind-node="agreement"]').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['agreement']]);
    expect(wrapper.find('input,textarea,[contenteditable],[draggable]').exists()).toBe(false);
    expect(JSON.stringify(model)).toBe(before);
    wrapper.unmount();
  });
  it('renders the explicit framework title exactly once as a level-one heading, even when the active goal is mathematics', () => {
    harness.learning = reactive({
      state: progressFixture(),
      active: { studyProfile: { subject: '数学' } },
      recordReadState: 'ready',
      recordContext() {
        return this.state.owner;
      },
      refresh: vi.fn()
    });
    const wrapper = mount(Knowledge, { global });
    expect(wrapper.get('[aria-level="1"]').text()).toBe('考研英语写作 · 知识框架');
    expect(
      wrapper.findAll('[role="heading"],h1,h2,h3').filter((heading) => heading.text() === '考研英语写作 · 知识框架')
    ).toHaveLength(1);
    expect(wrapper.find('.framework-title').exists()).toBe(false);
    expect(wrapper.findAll('.progress-heading').map((heading) => heading.text())).toEqual(['考研英语写作']);
    wrapper.unmount();
  });
  it('applies one source scope to overview, framework, mind map and original evidence without writing facts', async () => {
    const state = progressBoundaryFixture(6, 0);
    state.conversations[0].coach.requests[5].modelId = 'unknown-external-model';
    harness.learning = reactive({
      state,
      recordReadState: 'ready',
      recordContext() {
        return this.state.owner;
      },
      refresh: vi.fn()
    });
    const before = JSON.stringify(state);
    const wrapper = mount(Knowledge, { global });
    expect(wrapper.get('[data-node-id="agreement"]').text()).toContain('可改进');
    const sourceButtons = wrapper.findAll('.progress-sources button');
    await sourceButtons.find((button) => button.text().includes('unknown-external-model')).trigger('click');
    expect(wrapper.get('[data-metric="语法"]').text()).toContain('数据不足');
    expect(wrapper.get('[data-node-id="agreement"]').text()).toContain('数据不足');
    await wrapper.get('[data-node-id="agreement"]').trigger('click');
    expect(wrapper.findAll('#knowledge-detail .progress-event')).toHaveLength(1);
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '思维导图')
      .trigger('click');
    expect(wrapper.get('[data-mind-node="agreement"]').text()).toContain('数据不足');
    await sourceButtons[0].trigger('click');
    expect(wrapper.get('[data-mind-node="agreement"]').text()).toContain('可改进');
    expect(JSON.stringify(state)).toBe(before);
    wrapper.unmount();
  });
  it('selects the actual model group when one connection name has two returned models', async () => {
    const model = learningProgressReadModel(progressFixture(6, 0));
    model.sources = [
      { ...learningProgressReadModel(progressFixture(5, 0)).sources[0], actualModel: 'model-A' },
      { ...learningProgressReadModel(progressFixture(1, 0)).sources[0], actualModel: 'model-B' }
    ];
    const wrapper = mount(ProgressOverview, { props: { model }, global });
    const buttons = wrapper.findAll('.progress-sources button');
    expect(buttons.map((button) => button.text())).toEqual(['全部', 'BYOK · model-A', 'BYOK · model-B']);
    await buttons[2].trigger('click');
    expect(wrapper.get('[data-metric="语法"]').text()).toContain('数据不足');
    await buttons[1].trigger('click');
    expect(wrapper.get('[data-metric="语法"]').text()).toContain('80%');
    wrapper.unmount();
  });
  it('renders only the framework subject and its sources while the website renders both subjects from the same events', async () => {
    const state = progressBoundaryFixture(5),
      before = JSON.stringify(state),
      model = learningProgressReadModel(state);
    harness.learning = reactive({
      state,
      recordReadState: 'ready',
      recordContext() {
        return this.state.owner;
      },
      refresh: vi.fn()
    });
    const wrapper = mount(Knowledge, { global });
    expect(wrapper.findAll('.progress-heading').map((heading) => heading.text())).toEqual(['考研英语写作']);
    const sourceButtons = wrapper.findAll('.progress-sources button');
    expect(sourceButtons.map((button) => button.text())).toEqual(['全部', 'BYOK · byok_progress_qa']);
    await sourceButtons[1].trigger('click');
    expect(wrapper.findAll('.progress-heading').map((heading) => heading.text())).toEqual(['考研英语写作']);
    await wrapper.get('[data-metric="语法"]').trigger('click');
    expect(wrapper.findAll('.progress-trace .progress-event')).toHaveLength(5);
    expect(wrapper.get('.progress-trace').text()).not.toContain('合成算术题');
    wrapper.unmount();

    uni.setStorageSync('EXAM_USER_ID', state.owner);
    uni.setStorageSync('EXAM_TOKEN', 'progress-qa-local-token');
    harness.read.mockResolvedValue(state);
    const website = mount(WebsiteWorkspace, { props: { signedIn: true }, global });
    await flushPromises();
    expect(harness.read).toHaveBeenCalledOnce();
    expect(website.findAll('.progress-heading').map((heading) => heading.text())).toEqual(['考研英语写作', '数学']);
    expect(website.get('[data-metric="数学"]').text()).toContain('100%');
    expect(website.getComponent(ProgressOverview).props('model')).toEqual(model);
    expect(JSON.stringify(state)).toBe(before);
    website.unmount();
  });
  it.each([
    { subject: undefined, subjectLabel: '考研英语写作' },
    { subject: '  ', subjectLabel: '考研英语写作' },
    { subject: 'kaoyan-english-writing', subjectLabel: undefined },
    { subject: 'kaoyan-english-writing', subjectLabel: '  ' }
  ])('hides the overview without explicit framework subject metadata: %j', (metadata) => {
    const original = { subject: knowledgeGraphSeed.subject, subjectLabel: knowledgeGraphSeed.subjectLabel };
    let wrapper;
    try {
      Object.assign(knowledgeGraphSeed, metadata);
      harness.learning = reactive({
        state: progressBoundaryFixture(5),
        active: { studyProfile: { subject: '数学' } },
        recordReadState: 'ready',
        recordContext() {
          return this.state.owner;
        },
        refresh: vi.fn()
      });
      wrapper = mount(Knowledge, { global });
      expect(wrapper.findComponent(ProgressOverview).exists()).toBe(false);
      expect(wrapper.findAll('[data-node-id]')).toHaveLength(26);
    } finally {
      wrapper?.unmount();
      Object.assign(knowledgeGraphSeed, original);
    }
  });
  it('keeps receipt, event and learning IDs out of rendered text, attributes and originals while preserving exact opens', async () => {
    const model = learningProgressReadModel(progressFixture());
    const events = model.evidence.slice(0, 3).map((event, index) => ({
      ...event,
      id: ['receipt-private', 'evt-private', 'learning_private'][index],
      recordId: `learning_original_${index}`
    }));
    const wrapper = mount(ProgressEvidence, { props: { events }, global });
    expect(wrapper.html()).not.toMatch(/receipt-|evt-|learning_/);
    expect(wrapper.text()).toContain('2026-10-30');
    expect(wrapper.text()).toContain('AI 评估');
    expect(wrapper.text()).toContain('语法 · 可改进');
    expect(wrapper.text()).toContain('BYOK');
    await wrapper.findAll('.progress-event')[1].get('button').trigger('click');
    expect(wrapper.emitted('open')[0]).toEqual([events[1]]);
    wrapper.unmount();
  });
  it('paginates node evidence at complete records, expands all records and resets on selection', async () => {
    const events = learningProgressReadModel(progressFixture()).evidence.filter(
      (event) => event.kind === 'writing-feedback'
    );
    const wrapper = mount(ProgressEvidence, { props: { events, pageSize: 2 }, global });
    const more = () => wrapper.findAll('button').find((item) => item.text() === '查看更多');
    expect(wrapper.findAll('.progress-event')).toHaveLength(2);
    for (const event of wrapper.findAll('.progress-event')) expect(event.text()).toContain('查看原答');
    await more().trigger('click');
    expect(wrapper.findAll('.progress-event')).toHaveLength(4);
    await more().trigger('click');
    expect(wrapper.findAll('.progress-event')).toHaveLength(6);
    expect(more()).toBeUndefined();
    await wrapper.setProps({ events: events.slice(0, 5) });
    expect(wrapper.findAll('.progress-event')).toHaveLength(2);
    wrapper.unmount();
  });
  it.each([4, 5])(
    'subject summaries separate writing attainment and objective accuracy with traceable fractions (%i)',
    async (count) => {
      const model = learningProgressReadModel(progressFixture(count, count));
      const wrapper = mount(ProgressOverview, { props: { model }, global });
      const writing = wrapper.get('[data-metric="kaoyan-english-writing:attainment"]');
      const objective = wrapper.get('[data-metric="数学"]');
      expect(writing.text()).toContain('达成本次要求');
      expect(writing.text()).toContain('AI 评估');
      expect(writing.text()).toContain(count === 5 ? '80%' : '数据不足');
      expect(objective.text()).toContain(count === 5 ? '100%' : '数据不足');
      if (count === 4) expect(wrapper.text()).not.toContain('%');
      else {
        expect(writing.text()).toContain('4 / 5');
        expect(objective.text()).toContain('5 / 5');
      }
      for (const [button, expected] of [
        [writing, '合成短句题'],
        [objective, '合成算术题']
      ]) {
        await button.trigger('click');
        const records = wrapper.findAll('.progress-trace .progress-event');
        expect(records).toHaveLength(count);
        expect(records.every((record) => record.text().includes(expected))).toBe(true);
        expect(wrapper.html()).not.toMatch(/receipt-|evt-|learning_/);
      }
      wrapper.unmount();
    }
  );
  it.each([0, 1, 2])(
    'preserves rubric level %i across framework, detail and mind map without mastery claims',
    async (score) => {
      const state = progressBoundaryFixture(5, 0);
      for (const feedback of Object.values(state.conversations[0].coach.days[0].feedback))
        feedback.dimensions[0].score = score;
      harness.learning = reactive({
        state,
        recordReadState: 'ready',
        recordContext() {
          return this.state.owner;
        },
        refresh: vi.fn()
      });
      const wrapper = mount(Knowledge, { global });
      const label = ['需重练', '可改进', '达成本次要求'][score];
      await wrapper.get('[data-node-id="agreement"]').trigger('click');
      expect(wrapper.get('[data-node-id="agreement"]').text()).toContain(label);
      expect(wrapper.get('#knowledge-detail').text()).toContain(label);
      await wrapper
        .findAll('button')
        .find((item) => item.text() === '思维导图')
        .trigger('click');
      expect(wrapper.get('[data-mind-node="agreement"]').text()).toContain(label);
      expect(wrapper.html()).not.toMatch(/掌握|mastered|receipt-|evt-|learning_/i);
      wrapper.unmount();
    }
  );
});
