import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { storageService } from '@/services/storageService.js';
import { learningWriteLease } from '@/services/learning/learning-write-lease.js';
import { emptyLearningState } from '@/services/learning/learning-domain.js';
import { parsePastedMaterial } from '@/services/learning/material-intake.js';
import MuseModelIntake from '@/components/business/learning/muse-model-intake.vue';
import MuseWritingCard from '@/components/business/learning/muse-writing-card.vue';
import WritingCoach from '@/pages/learning/components/writing-coach.vue';
import { intakeChoicesFor } from '../../laf-backend/functions/_shared/learning-intake.js';
import { parseCoachModelOutput } from '../../laf-backend/functions/_shared/learning-writing-coach.js';
import {
  SHENLUN_METHOD,
  SHENLUN_METHOD_CONTRACT as METHOD,
  COACH_SHENLUN_TRACK
} from '../../laf-backend/functions/_shared/learning-shenlun-method.js';

let store, wrapper, calls, advertised;
const copy = (value) => JSON.parse(JSON.stringify(value));
const material =
  '合成社区材料：服务窗口仅在工作日白天开放，部分居民办理不便。社区拟新增周六预约时段，并在月底收集意见；措施尚未实施，没有成效数据。';
const coachReply = (r) => {
  const reference = {
    sourceId: r.sources[0]?.id,
    sourceQuote: r.sources[0]?.content.slice(0, 80),
    sourcePage: r.sources[0]?.page ?? null
  };
  const raw = ['daily', 'diagnostic'].includes(r.phase)
    ? {
        kind: r.phase,
        cards: (r.phase === 'diagnostic' ? SHENLUN_METHOD.diagnostic : SHENLUN_METHOD.dailyCards).map(
          (item, index) => ({
            id: `${r.phase === 'diagnostic' ? 'd' : 'c'}${index + 1}`,
            kind: r.phase === 'diagnostic' ? 'diagnostic' : item.kind,
            title: typeof item === 'string' ? item : item.title,
            prompt: '根据材料，说明服务窗口的办理困难。',
            example: '',
            ...reference
          })
        ),
        ...(r.phase === 'daily'
          ? {
              writing: {
                prompt: '面向社区负责人写一份120—180字的服务调整建议稿，区分当前困难、拟议措施与反馈安排。',
                patterns: [['交代材料情况与任务'], ['说明建议与反馈安排']],
                ...reference
              }
            }
          : {})
      }
    : {
        kind: r.phase,
        target: r.target,
        lines: [
          {
            original: r.input.split('\n')[0],
            advice: '合成评阅观察，仅验证保存与呈现。',
            rewrite: '依据材料区分当前情况和拟议措施。'
          }
        ],
        weaknesses: [],
        weaknessEvidence: [],
        strengths: [],
        phrases: [],
        dimensions: SHENLUN_METHOD.feedback.map((name) => ({ name, comment: '合成观察，无官方分数。' }))
      };
  return parseCoachModelOutput(JSON.stringify({ message: '继续这一小步。', question: null, tools: [], coach: raw }), r);
};
beforeEach(() => {
  uni.clearStorageSync();
  localStorage.clear();
  learningWriteLease.release();
  storageService.saveLoginSession({ userId: 'synthetic-shenlun-ui', token: 'fixture-only-token', userInfo: {} });
  setActivePinia(createPinia());
  store = useConversationLearningStore();
  calls = [];
  advertised = true;
  vi.spyOn(uni, 'request').mockImplementation((options) => {
    const data = copy(options.data);
    calls.push(data);
    const intake = data.learningContext?.intake || data.intake;
    const coach = data.learningContext?.coach;
    const payload = intake
      ? {
          message: !intake.turns.length
            ? '你在准备什么？'
            : intake.turns.length === 1
              ? '想先准备哪一科？'
              : '请确认学习目标',
          intake:
            intake.turns.length < 2
              ? { options: intakeChoicesFor(intake), input: !intake.turns.length, profile: null }
              : {
                  options: [],
                  input: false,
                  profile: {
                    goal: '申论材料与中文写作',
                    category: 'civil',
                    exam: 'general',
                    subjects: ['申论'],
                    minutes: null,
                    deadline: null,
                    foundation: null
                  }
                },
          question: null,
          tools: []
        }
      : coach
        ? coachReply(coach)
        : {};
    const response =
      data.action === 'pull'
        ? { success: true, data: { state: emptyLearningState(store.state.owner) } }
        : data.action === 'list'
          ? {
              success: true,
              data: {
                models: [
                  {
                    id: 'synthetic-model',
                    source: 'byok',
                    configured: true,
                    provider: 'Synthetic',
                    model: 'synthetic',
                    capabilities: {}
                  }
                ],
                intakeContract: 'model-intake-v1',
                intakeContracts: ['model-intake-v1', 'model-intake-v2'],
                ...(advertised ? { coachMethods: [METHOD] } : {})
              }
            }
          : {
              success: true,
              data: {
                ...payload,
                requestId: data.requestId,
                modelId: data.modelId,
                requestBinding: data.requestBinding
              }
            };
    queueMicrotask(() => options.success({ statusCode: 200, data: copy(response) }));
    return { abort: vi.fn() };
  });
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  store?.$dispose();
  learningWriteLease.release();
  vi.restoreAllMocks();
});
async function proposal() {
  await store.loadModels();
  store.modelId = 'synthetic-model';
  store.sharingAllowed = true;
  const opened = await store.beginModelIntake(store.modelId, { newGoal: true });
  expect(opened).toMatchObject({ success: true });
  expect(await store.answerModelIntake('考公')).toMatchObject({ success: true });
  expect(await store.answerModelIntake('申论')).toMatchObject({ success: true });
}
const modelCalls = () => calls.filter((call) => call.learningContext?.coach);
function renderCoach() {
  wrapper = mount(WritingCoach, {
    global: {
      stubs: {
        LearningShell: {
          props: ['title'],
          template: '<main :aria-label="title"><slot /><slot name="composer" /></main>'
        },
        BaseIcon: true
      }
    }
  });
}

describe('Shenlun intake, source consent and Chinese writing UI', () => {
  it('waits for explicit confirmation, then opens the existing coach with required material', async () => {
    await proposal();
    expect(store.state.conversations).toHaveLength(0);
    wrapper = mount(MuseModelIntake, { props: { newGoal: true } });
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '确认目标')
      .trigger('tap');
    await flushPromises();
    expect(store.active.coach.profile).toMatchObject({
      exam: 'shenlun',
      track: COACH_SHENLUN_TRACK,
      methodContract: METHOD
    });
    expect(store.state.events.at(-1).data.coachMethod).toBe(METHOD);
    expect(modelCalls()).toHaveLength(0);
    wrapper.unmount();
    renderCoach();
    await flushPromises();
    expect(wrapper.attributes('aria-label')).toBe('申论');
    expect(wrapper.text()).toContain('添加学习资料');
    expect(wrapper.text()).not.toContain('成分、搭配、翻译');
    expect(wrapper.text()).not.toContain('英语一还是英语二');
  });
  it('keeps a proposal as general intent when an older server has not advertised the method', async () => {
    advertised = false;
    await proposal();
    store.acceptModelIntake();
    expect(store.active.studyProfile.subjects).toEqual(['申论']);
    expect(store.active.coach).toBeUndefined();
    expect(store.state.events.at(-1).data.coachMethod).toBeUndefined();
  });
  it('requires consent and material, transmits only the new method contract, and renders Chinese paragraph input', async () => {
    await proposal();
    store.acceptModelIntake();
    const added = store.commit('material.add', { material: parsePastedMaterial(material, 'synthetic-material') });
    expect(added).toBeDefined();
    store.coachSave('material', { materialId: 'synthetic-material' });
    store.sharingAllowed = false;
    await expect(store.requestCoach('diagnostic')).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
    expect(modelCalls()).toHaveLength(0);
    store.sharingAllowed = true;
    expect((await store.requestCoach('diagnostic')).success).toBe(true);
    expect(modelCalls()).toHaveLength(1);
    const asked = modelCalls()[0].learningContext.coach;
    expect(asked).toMatchObject({ exam: 'shenlun', methodContract: METHOD });
    for (const key of [
      'feedbackVersion',
      'dimensionContract',
      'exerciseContract',
      'knowledgeContract',
      'predictionContract'
    ])
      expect(asked[key]).toBeUndefined();
    for (let i = 1; i <= 5; i++)
      store.coachSave('answer', {
        target: 'diagnostic',
        cardId: `d${i}`,
        answer: '工作日白天开放使部分居民办理不便。'
      });
    await store.requestCoach('feedback', 'diagnostic');
    await store.requestCoach('daily');
    for (let i = 1; i <= 4; i++) {
      store.coachSave('answer', { cardId: `c${i}`, answer: '建议增加周六预约时段并收集意见。' });
      await store.requestCoach('feedback', `card-c${i}`);
    }
    store.coachSave('analysis', {
      fields: {
        genre: '建议稿',
        recipient: '社区负责人',
        purpose: '改善服务',
        points: '问题、措施、反馈',
        words: '120—180字'
      }
    });
    await store.requestCoach('feedback', 'analysis');
    renderCoach();
    await flushPromises();
    const input = wrapper.findComponent(MuseWritingCard);
    expect(input.exists()).toBe(true);
    expect(input.props('english')).toBe(false);
    expect(wrapper.text()).toContain('交代任务与情况');
    expect(wrapper.text()).toContain('依据材料组织本段');
    expect(store.active.coach.days[0].writingSubmissions || []).toEqual([]);
    for (let index = 0; index < 2; index++) {
      store.coachSave('paragraph', {
        index,
        text: '社区拟增加周六预约时段，尚无实施效果数据。',
        authorship: 'user_typed'
      });
      await store.requestCoach('feedback', `paragraph-${index}`);
      store.coachSave('paragraph', {
        index,
        rewrite: true,
        text: '建议增加周六预约时段，并于月底收集意见。',
        authorship: 'user_typed'
      });
    }
    expect(store.active.coach.days[0].writingSubmissions || []).toEqual([]);
    store.coachSave('essaySubmit');
    await store.requestCoach('essay');
    await flushPromises();
    expect(store.active.coach.days[0].writingSubmissions).toHaveLength(1);
    expect(wrapper.text()).toContain('成文反馈 · AI 评估');
    expect(wrapper.text()).toContain('流程来源：带写成文');
    expect(wrapper.text()).not.toContain('流程来源：未知');
  });
});
