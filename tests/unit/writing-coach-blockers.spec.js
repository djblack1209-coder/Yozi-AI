import { beforeEach, describe, it, expect, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useConversationLearningStore } from '@/stores/modules/conversation-learning.js';
import { storageService } from '@/services/storageService.js';
import { resolveSkippedProfile } from '@/services/learning/coach-profile.js';
import { parsePastedMaterial } from '@/services/learning/material-intake.js';
import { flushPromises, mount } from '@vue/test-utils';
import LearningPage from '@/pages/learning/index.vue';
import { generateLearningTurn, fetchLearningResult, fetchLearningModels } from '@/services/api/domains/learning.api.js';
import { learningWriteLease } from '@/services/learning/learning-write-lease.js';
import { coachFixture } from '../fixtures/writing-coach.js';
import WritingCoach from '@/pages/learning/components/writing-coach.vue';
import MuseFeedbackCard from '@/components/business/learning/muse-feedback-card.vue';
import MuseModelControl from '@/components/business/learning/muse-model-control.vue';
import MuseModelFeedback from '@/components/business/learning/muse-model-feedback.vue';
import BaseInput from '@/components/base/base-input/base-input.vue';
import { coachSavedRecords } from '../../laf-backend/functions/_shared/learning-coach-records.js';
import { applyLearningOperation, emptyLearningState } from '@/services/learning/learning-domain.js';
import { prepareLearningRestore } from '@/services/learning/learning-backup.js';
import {
  coachWritingBandContext,
  coachInputFor,
  coachSystemPrompt,
  parseCoachModelOutput
} from '../../laf-backend/functions/_shared/learning-writing-coach.js';
import { writingBandExample } from '../../laf-backend/functions/_shared/learning-rubric.js';
import { coachErrorReviews } from '../../laf-backend/functions/_shared/learning-coach-review.js';

const testChannel = vi.hoisted(() => ({ enabled: false }));
vi.mock('@/config/build-channel.js', () => ({
  get DEV_TEST() {
    return testChannel.enabled;
  }
}));

vi.mock('@dcloudio/uni-app', () => ({
  onShow: vi.fn(),
  onHide: vi.fn(),
  onLoad: vi.fn(),
  onBackPress: vi.fn()
}));

const TOKEN = 'synthetic-blocker-session-token';
const paused = new Promise(() => {});

vi.mock('@/services/api/domains/learning.api.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    generateLearningTurn: vi.fn(() => paused),
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
  };
});

function freshStore() {
  uni.clearStorageSync();
  storageService.save('EXAM_USER_ID', 'synthetic-blocker-owner', true);
  storageService.save('EXAM_TOKEN', TOKEN, true);
  setActivePinia(createPinia());
  const store = useConversationLearningStore();
  store.startCoach('考研英语二写作');
  // BYOK-first no longer implicitly selects a platform model. This fixture explicitly opts in.
  store.modelId = 'synthetic-model';
  store.sharingAllowed = true;
  return store;
}

const material = (text) => parsePastedMaterial(text, `m_${Math.random().toString(36).slice(2, 8)}`);

it('routes an explicitly saved error-review answer through the real store request and result lifecycle', async () => {
  const store = freshStore(),
    previousGenerate = generateLearningTurn.getMockImplementation();
  vi.mocked(generateLearningTurn).mockImplementation(async (body) => {
    const request = body.learningContext.coach;
    const output = coachFixture(request);
    if (request.phase === 'feedback')
      Object.assign(output, {
        feedbackVersion: 2,
        lines: [
          {
            original: request.target === 'diagnostic' ? 'On' : request.input,
            advice: 'Synthetic assessment.',
            rewrite: request.target === 'diagnostic' ? 'On' : request.input
          }
        ],
        weaknesses: request.target === 'diagnostic' ? ['介词搭配'] : [],
        weaknessEvidence:
          request.target === 'diagnostic' ? [{ label: '介词搭配', quote: 'On', classification: 'error' }] : [],
        dimensions: [
          {
            name: '搭配',
            score: request.target === 'diagnostic' ? 1 : 2,
            evidence: [request.target === 'diagnostic' ? 'On' : request.input],
            comment: 'Synthetic dimension.'
          }
        ]
      });
    return {
      success: true,
      data: {
        requestId: body.requestId,
        requestBinding: body.requestBinding,
        modelId: body.modelId,
        coach: output,
        ...(request.knowledgeContract || request.predictionContract
          ? {
              modelOrigin: {
                contract: 'learning-model-origin-v1',
                callId: body.requestId,
                modelId: body.modelId,
                requestBinding: body.requestBinding,
                source: 'byok',
                provider: 'Synthetic provider',
                actualModel: 'synthetic-actual-model',
                configurationVersion: 'a'.repeat(64),
                upstreamVersion: null,
                inferencePolicy: 'native-coach-tools-v1',
                outputContract: request.contract,
                schemaDigest: 'b'.repeat(64),
                sentParameters: { max_tokens: 8192 },
                verificationModels: []
              }
            }
          : {})
      }
    };
  });
  try {
    store.coachSave('profile', { profile: { exam: 'english2', minutes: 25, deadline: null } });
    await store.requestCoach('diagnostic');
    expect(store.active.coach.requests[0]).toMatchObject({
      request: { predictionContract: 'writing-prediction-check-v1' },
      predictionSnapshot: { contract: 'writing-prediction-check-v1' },
      resultModel: { source: 'byok', actualModel: 'synthetic-actual-model' }
    });
    expect(store.active.coach.predictionChecks).toHaveLength(5);
    for (const [index, card] of store.active.coach.diagnostic.cards.entries())
      store.coachSave('answer', {
        target: 'diagnostic',
        cardId: card.id,
        answer: index === 1 ? 'On' : `Original answer ${index}.`
      });
    await store.requestCoach('feedback', 'diagnostic');
    const [item] = coachErrorReviews(store.state, Date.now(), store.active.id);
    expect(item).toBeDefined();
    store.coachSave('errorAnswer', { reviewId: item.id, answer: 'in' });
    expect((await store.requestCoach('feedback', 'error-review')).success).toBe(true);
    expect(store.active.coach.errorReviews[0].feedback.target).toBe('error-review');
    expect(coachErrorReviews(store.state, Date.now(), store.active.id)[0].completedBy).toBeTruthy();
    expect(store.active.coach.diagnostic.answers[1].answer).toBe('On');
    const records = store.active.coach.learningRecords;
    expect(records).toHaveLength(2);
    expect(records.every((record) => record.knowledge?.contract === 'writing-knowledge-binding-v1')).toBe(true);
    expect(
      records.every(
        (record) => record.model?.source === 'byok' && record.model.actualModel === 'synthetic-actual-model'
      )
    ).toBe(true);
    expect(records[1].knowledge).toMatchObject({
      graphVersion: 'yozi-writing-diagnosis-v0.1',
      mappingVersion: 'writing-knowledge-map-v1',
      scope: 'adult-kaoyan-english-writing',
      curriculumStatus: 'pending_verification',
      observations: [expect.objectContaining({ nodeId: 'collocation', dimension: '搭配', score: 2 })]
    });
    const restored = prepareLearningRestore(
      emptyLearningState('synthetic-blocker-owner', store.state.timezone),
      JSON.stringify(store.state)
    ).state;
    expect(restored.conversations.find((session) => session.id === store.active.id).coach.learningRecords).toEqual(
      records
    );
  } finally {
    vi.mocked(generateLearningTurn).mockImplementation(previousGenerate);
    store.$dispose();
  }
});

it('明确提交全文独立于共享和模型，快照重放保留；测试渠道同请求独立保存观察结果', async () => {
  const store = freshStore();
  const previousGenerate = generateLearningTurn.getMockImplementation();
  let wrapper;
  let observationWrapper;
  vi.mocked(generateLearningTurn).mockImplementation(async (body) => ({
    success: true,
    data: {
      requestId: body.requestId,
      requestBinding: body.requestBinding,
      modelId: body.modelId,
      coach: coachFixture(body.learningContext.coach)
    }
  }));
  try {
    store.coachSave('profile', { profile: { exam: 'english2', minutes: 25, deadline: null } });
    await store.requestCoach('diagnostic');
    for (const card of store.active.coach.diagnostic.cards)
      store.coachSave('answer', { target: 'diagnostic', cardId: card.id, answer: 'Synthetic answer.' });
    await store.requestCoach('feedback', 'diagnostic');
    await store.requestCoach('daily');
    for (const card of store.active.coach.days[0].pack.cards) {
      store.coachSave('answer', { cardId: card.id, answer: 'Synthetic answer.' });
      await store.requestCoach('feedback', `card-${card.id}`);
    }
    store.coachSave('analysis', {
      fields: { genre: 'letter', recipient: 'friend', purpose: 'invite', points: 'event', words: '100' }
    });
    await store.requestCoach('feedback', 'analysis');
    for (let index = 0; index < store.active.coach.days[0].pack.writing.patterns.length; index++) {
      store.coachSave('paragraph', { index, text: 'I am writing to invite you.' });
      await store.requestCoach('feedback', `paragraph-${index}`);
      store.coachSave('paragraph', {
        index,
        rewrite: true,
        text: `I am writing to invite you to reading event ${index + 1}.`,
        authorship: 'user_typed'
      });
    }
    expect(
      store.state.events
        .filter((event) => event.type.startsWith('coach.'))
        .every((event) => event.data.explicit === true)
    ).toBe(true);
    const input = JSON.parse(JSON.stringify(store.state));
    const operation = {
      id: 'synthetic-full-submission',
      at: Date.now(),
      type: 'coach.essaySubmit',
      data: { conversationId: store.active.id, explicit: true }
    };
    for (const missing of ['writingTask', 'authorship']) {
      const old = structuredClone(input);
      const day = old.conversations.find((c) => c.id === store.active.id).coach.days[0];
      if (missing === 'writingTask') delete day.writingTask;
      else delete day.rewrites[0].authorship;
      expect(() => applyLearningOperation(old, operation)).toThrow();
      expect(day.writingSubmissions).toBeUndefined();
    }
    expect(() =>
      applyLearningOperation(input, { ...operation, data: { ...operation.data, explicit: false } })
    ).toThrow();
    store.sharingAllowed = false;
    wrapper = mount(WritingCoach, { global: { stubs: { BaseIcon: true, PrivacyPopup: true } } });
    await flushPromises();
    const button = wrapper.findAll('button').find((b) => b.text() === '交卷');
    expect(button).toBeDefined();
    expect(button.attributes('disabled')).toBeUndefined();
    const calls = [generateLearningTurn.mock.calls.length, fetchLearningModels.mock.calls.length];
    await button.trigger('tap');
    await flushPromises();
    expect([generateLearningTurn.mock.calls.length, fetchLearningModels.mock.calls.length]).toEqual(calls);
    const day = store.active.coach.days[0];
    const snapshot = JSON.parse(JSON.stringify(day.writingSubmissions[0]));
    expect(snapshot).toMatchObject({
      text: day.rewrites.map((p) => p.text).join('\n\n'),
      taskId: day.writingTask.taskId,
      taskVersion: 1,
      authorship: 'user_typed'
    });
    expect(snapshot.answerHash).toMatch(/^fnv1a32:[a-f0-9]{8}:\d+$/);
    expect(day.essay).toBeNull();
    expect(store.state.attempts).toEqual(input.attempts);
    expect(store.state.reviews).toEqual(input.reviews);
    expect(store.active.coach.diagnostic).toEqual(
      input.conversations.find((c) => c.id === store.active.id).coach.diagnostic
    );
    store.reloadRecords();
    expect(store.active.coach.days[0].writingSubmissions).toEqual([snapshot]);
    const restored = prepareLearningRestore(
      emptyLearningState(store.state.owner, store.state.timezone),
      store.exportData()
    );
    expect(restored.state.conversations.find((c) => c.id === store.active.id).coach.days[0].writingSubmissions).toEqual(
      [snapshot]
    );
    store.coachSave('essaySubmit');
    expect(store.active.coach.days[0].writingSubmissions).toEqual([snapshot]);
    const beforeAssessment = JSON.parse(JSON.stringify(store.state));
    const originalFacts = {
      attempts: beforeAssessment.attempts,
      reviews: beforeAssessment.reviews,
      diagnostic: beforeAssessment.conversations.find((c) => c.id === store.active.id).coach.diagnostic
    };
    const context = coachWritingBandContext(store.active.coach, store.active.coach.days[0], 'synthetic-bound-request');
    const bound = coachInputFor(store.active.coach, store.active.coach.days[0], 'essay', 'essay');
    const request = {
      contract: store.active.coach.contract,
      phase: 'essay',
      target: 'essay',
      day: store.active.coach.days[0].day,
      exam: 'english2',
      essayType: 'small',
      ...bound,
      writingBand: { ...context, submissionId: 'another-original' }
    };
    expect(() =>
      applyLearningOperation(beforeAssessment, {
        id: 'synthetic-forged-request',
        at: Date.now(),
        type: 'coach.request',
        data: {
          conversationId: store.active.id,
          explicit: true,
          requestId: context.requestId,
          request,
          modelId: 'synthetic-model',
          binding: 'synthetic-binding'
        }
      })
    ).toThrow('请先明确提交当前全文');
    expect(
      coachWritingBandContext(
        store.active.coach,
        { ...store.active.coach.days[0], writingTask: null },
        context.requestId
      )
    ).toBeNull();
    testChannel.enabled = true;
    store.sharingAllowed = true;
    vi.mocked(generateLearningTurn).mockImplementation(async (body) => {
      const actual = body.learningContext.coach;
      const bandResult = writingBandExample(actual.writingBand, actual.input);
      bandResult.observations[0].note = '该句明确表达邀请意图。';
      expect(actual.writingBand.submissionId).toBe(snapshot.submissionId);
      expect(actual.writingBand.requestId).toBe(body.requestId);
      expect(coachSystemPrompt(actual)).toContain('writing-band-observations-v1');
      const { coach } = parseCoachModelOutput(
        JSON.stringify({
          message: '继续这一小步。',
          question: null,
          tools: [],
          coach: { ...coachFixture(actual), bandResult }
        }),
        actual
      );
      expect(coach.bandCandidate).toEqual(bandResult);
      return {
        success: true,
        data: { requestId: body.requestId, requestBinding: body.requestBinding, modelId: body.modelId, coach }
      };
    });
    const callsBeforeEssay = generateLearningTurn.mock.calls.length;
    await store.requestCoach('essay');
    expect(generateLearningTurn.mock.calls.length).toBe(callsBeforeEssay + 1);
    const assessedDay = store.active.coach.days[0];
    expect(assessedDay.essay.dimensions).toHaveLength(4);
    expect(assessedDay.essay.bandCandidate).toBeUndefined();
    expect(assessedDay.writingBandResults).toHaveLength(1);
    expect(assessedDay.writingBandResults[0]).toMatchObject({
      contract: 'writing-band-result-v1',
      status: 'observation_only',
      binding: { submissionId: snapshot.submissionId, answerHash: snapshot.answerHash },
      scoreEstimate: null,
      maxScore: null,
      officialScore: false,
      provenance: { modelId: 'synthetic-model', promptVersion: 'writing-band-observations-v1' }
    });
    const projected = coachSavedRecords(store.active).find((row) => row.feedback?.id === assessedDay.essay.id);
    expect(projected.writingObservation).toEqual(assessedDay.writingBandResults[0]);
    expect(projected.writingProcessSource).toBe('guided');
    await flushPromises();
    expect(wrapper.get('[data-test="writing-process-source"]').text()).toBe('流程来源：带写成文');
    expect(wrapper.get('[data-test="writing-process-source"]').attributes('title')).toContain('不证明未使用 AI');
    const unbound = JSON.parse(JSON.stringify(store.active));
    delete unbound.coach.days[0].writingSubmissions;
    const beforeUnboundProjection = JSON.stringify(unbound);
    expect(coachSavedRecords(unbound).find((row) => row.phase === 'essay').writingProcessSource).toBe('unknown');
    expect(JSON.stringify(unbound)).toBe(beforeUnboundProjection);
    const unidentifiedTask = JSON.parse(JSON.stringify(store.active));
    delete unidentifiedTask.coach.days[0].writingTask.taskId;
    delete unidentifiedTask.coach.days[0].writingSubmissions[0].taskId;
    expect(coachSavedRecords(unidentifiedTask).find((row) => row.phase === 'essay').writingProcessSource).toBe(
      'unknown'
    );
    const stale = JSON.parse(JSON.stringify(store.active));
    stale.coach.days[0].writingBandResults.push({
      ...JSON.parse(JSON.stringify(assessedDay.writingBandResults[0])),
      binding: { ...assessedDay.writingBandResults[0].binding, answerHash: 'older-original' }
    });
    const beforeProjection = JSON.stringify(stale);
    expect(
      coachSavedRecords(stale).find((row) => row.feedback?.id === assessedDay.essay.id).writingObservation
    ).toEqual(assessedDay.writingBandResults[0]);
    stale.coach.days[0].writingSubmissions[0].text = 'Changed original';
    expect(coachSavedRecords(stale).some((row) => row.writingObservation)).toBe(false);
    expect(coachSavedRecords(stale).find((row) => row.phase === 'essay').writingProcessSource).toBe('unknown');
    stale.coach.days[0].writingSubmissions[0].text = snapshot.text;
    expect(JSON.stringify(stale)).toBe(beforeProjection);
    observationWrapper = mount(MuseFeedbackCard, {
      props: { feedback: projected.feedback, writingObservation: projected.writingObservation },
      global: { stubs: { BaseIcon: true } }
    });
    const observationText = observationWrapper.get('[data-test="writing-observations"]').text();
    expect(observationText).toContain('全文观察 · AI 评估');
    expect(observationText).toContain('该句明确表达邀请意图。');
    expect(observationText).toContain('本次只看语言与衔接');
    expect(observationText).not.toMatch(/分数|档位|得分/);
    expect(store.state.attempts).toEqual(originalFacts.attempts);
    expect(store.state.reviews).toEqual(originalFacts.reviews);
    expect(store.active.coach.diagnostic).toEqual(originalFacts.diagnostic);
    const replayed = prepareLearningRestore(
      emptyLearningState(store.state.owner, store.state.timezone),
      store.exportData()
    );
    expect(replayed.state.conversations.find((c) => c.id === store.active.id).coach.days[0]).toEqual(
      JSON.parse(JSON.stringify(assessedDay))
    );
    // Replaying a separately isolated malformed response preserves legacy feedback,
    // records only a program-confirmed null and never writes a numeric assessment.
    const completedRequest = store.active.coach.requests.at(-1);
    const malformedRequest = applyLearningOperation(beforeAssessment, {
      id: 'synthetic-null-request',
      at: Date.now(),
      type: 'coach.request',
      data: {
        conversationId: store.active.id,
        explicit: true,
        requestId: completedRequest.id,
        request: JSON.parse(JSON.stringify(completedRequest.request)),
        modelId: completedRequest.modelId,
        binding: completedRequest.binding
      }
    }).state;
    const invalidOutput = { ...coachFixture(completedRequest.request), bandCandidate: { scoreEstimate: 10 } };
    const nullState = applyLearningOperation(malformedRequest, {
      id: 'synthetic-null-result',
      at: Date.now(),
      type: 'coach.result',
      data: { conversationId: store.active.id, explicit: true, requestId: completedRequest.id, output: invalidOutput }
    }).state;
    const nullDay = nullState.conversations.find((c) => c.id === store.active.id).coach.days[0];
    expect(nullDay.essay.dimensions).toHaveLength(4);
    expect(nullDay.writingBandResults[0]).toMatchObject({
      status: 'null',
      nullReason: 'model_output_invalid',
      observations: [],
      integrityFlags: [],
      scoreEstimate: null
    });
    await observationWrapper.setProps({
      writingObservation: {
        ...nullDay.writingBandResults[0],
        blockReasons: ['task_data_missing']
      }
    });
    expect(observationWrapper.get('[data-test="writing-observations"]').text()).toContain('图画或图表事实待核对');
    expect(observationWrapper.get('[data-test="writing-observations"]').text()).toContain('原答和逐句反馈已保留');
    await observationWrapper.setProps({ writingObservation: null });
    expect(observationWrapper.find('[data-test="writing-observations"]').exists()).toBe(false);
  } finally {
    testChannel.enabled = false;
    observationWrapper?.unmount();
    wrapper?.unmount();
    vi.mocked(generateLearningTurn).mockImplementation(previousGenerate);
    store.$dispose();
    learningWriteLease.release();
  }
});

beforeEach(() => {
  uni.clearStorageSync();
  setActivePinia(createPinia());
});

it('指定模型已不可用时拒绝带练，不静默回落平台模型', async () => {
  const store = freshStore();
  const before = generateLearningTurn.mock.calls.length;
  try {
    store.coachSave('profile', { profile: { exam: 'english2', minutes: 25, deadline: null } });
    store.modelId = 'unavailable-selected-model';
    await expect(store.requestCoach('diagnostic')).rejects.toMatchObject({ code: 'NEEDS_CONNECTION' });
    expect(generateLearningTurn.mock.calls.length).toBe(before);
    expect(store.active.coach.requests).toHaveLength(0);
  } finally {
    store.$dispose();
    learningWriteLease.release();
  }
});

it.each(['model', 'mode', 'consent'])('等待带练时变更%s，迟到回复不写学习事实', async (change) => {
  const store = freshStore();
  const previousGenerate = generateLearningTurn.getMockImplementation();
  let finish;
  vi.mocked(generateLearningTurn).mockImplementationOnce(
    (body) =>
      new Promise((resolve) => {
        finish = () =>
          resolve({
            success: true,
            data: {
              requestId: body.requestId,
              requestBinding: body.requestBinding,
              modelId: body.modelId,
              coach: coachFixture(body.learningContext.coach)
            }
          });
      })
  );
  try {
    store.coachSave('profile', { profile: { exam: 'english2', minutes: 25, deadline: null } });
    store.modelId = 'synthetic-model';
    store.selectedMode = 'cloud';
    const pending = store.requestCoach('diagnostic');
    const rejected = expect(pending).rejects.toMatchObject({ code: 'CONTEXT_CHANGED' });
    await flushPromises();
    expect(finish).toBeTypeOf('function');
    const before = store.exportData();
    if (change === 'model') store.modelId = 'another-model';
    if (change === 'mode') store.selectedMode = 'offline';
    if (change === 'consent') store.sharingAllowed = false;
    finish();
    await rejected;
    expect(store.exportData()).toBe(before);
    expect(store.active.coach.diagnostic).toBeNull();
    expect(store.active.coach.requests[0].status).toBe('pending');
  } finally {
    store.$dispose();
    learningWriteLease.release();
    vi.mocked(generateLearningTurn).mockReset().mockImplementation(previousGenerate);
  }
});

it('带练失败留在当前带练中；连接器入口不改学习事实，回读终态不重发模型且切换对话不残留错误', async () => {
  vi.stubEnv('VITE_ENABLE_WRITING_COACH', 'true');
  const viewport = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390);
  const message = '模型任务未完成或已取消，没有可应用的结果；请查看实际用量';
  vi.mocked(generateLearningTurn).mockClear().mockResolvedValueOnce({ success: false, code: 503, message });
  vi.mocked(fetchLearningResult)
    .mockReset()
    .mockResolvedValueOnce({ success: false, code: 503, status: 'failed', message });
  const store = freshStore();
  store.coachSave('profile', { profile: { exam: 'english2', minutes: 25, deadline: null } });
  let wrapper;
  try {
    await store.requestCoach('diagnostic');
    expect(store.coachError).toBe(message);
    expect(store.error).toBe('');
    wrapper = mount(LearningPage, { global: { stubs: { BaseIcon: true, PrivacyPopup: true } } });
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('请求未完成，原答已保留，请先查询原请求');
    expect(wrapper.findAll('button').some((button) => button.text().trim() === '查询原请求')).toBe(true);
    const before = store.exportData();
    await wrapper.get('button[aria-label="AI 连接器"]').trigger('tap');
    await flushPromises();
    expect(uni.navigateTo).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/pages/profile/index?panel=connectors' })
    );
    wrapper.unmount();
    wrapper = null;
    expect(store.exportData()).toBe(before);
    await store.requestCoach('diagnostic');
    expect(generateLearningTurn).toHaveBeenCalledTimes(1);
    expect(fetchLearningResult).toHaveBeenCalledTimes(1);
    expect(store.active.coach.requests).toHaveLength(1);
    expect(store.active.coach.requests[0].status).toBe('closed');
    const closed = store.exportData();
    store.selectedConversationId = null;
    expect(store.coachError).toBe('');
    expect(store.exportData()).toBe(closed);
  } finally {
    wrapper?.unmount();
    viewport.mockRestore();
    store.$dispose();
    learningWriteLease.release();
    vi.unstubAllEnvs();
  }
});

it.each([
  ['带练确认失败', 'requestCoach', 'failed', 'TIMEOUT', '重新评估', 'retry'],
  ['普通对话仍只回读', 'recoverModelResult', 'failed', 'TIMEOUT', '查询原请求', 'query_result'],
  ['带练尚在执行', 'requestCoach', 'reserved', 'TIMEOUT', '查询原请求', 'query_result'],
  ['费用尚未确认', 'requestCoach', 'failed', 'COST_PENDING', '查询原请求', 'query_result']
])('%s只派发对应动作，不把未知执行或费用状态改成新请求', async (_name, operation, status, error, label, type) => {
  const wrapper = mount(MuseModelFeedback, {
    props: { failure: { status, error }, state: { phase: 'failed', operation, status, errorCode: error }, busy: false },
    global: { stubs: { BaseIcon: true } }
  });
  try {
    expect(wrapper.emitted('action')).toBeUndefined();
    expect(wrapper.get('button').text()).toBe(label);
    await wrapper.get('button').trigger('tap');
    expect(wrapper.emitted('action')).toEqual([[{ type }]]);
  } finally {
    wrapper.unmount();
  }
});

it('服务端未授权模型地址时引导检查连接；已终止的请求不再提供无效查询或自动重发', async () => {
  vi.stubEnv('VITE_ENABLE_WRITING_COACH', 'true');
  const previousGenerate = generateLearningTurn.getMockImplementation();
  vi.mocked(generateLearningTurn).mockClear().mockResolvedValueOnce({
    success: false,
    code: 403,
    status: 'failed',
    error: 'ENDPOINT_FORBIDDEN'
  });
  vi.mocked(fetchLearningResult).mockClear();
  const store = freshStore();
  store.coachSave('profile', { profile: { exam: 'english2', minutes: 25, deadline: null } });
  let wrapper;
  try {
    await store.requestCoach('diagnostic');
    expect(store.active.coach.requests.at(-1).status).toBe('closed');
    wrapper = mount(LearningPage, { global: { stubs: { BaseIcon: true, PrivacyPopup: true } } });
    await flushPromises();
    const alert = wrapper.get('[role="alert"]');
    expect(alert.text()).toContain('模型地址未获服务端授权');
    expect(alert.text()).not.toContain('查询原请求');
    const before = store.exportData();
    await alert.get('button').trigger('tap');
    await flushPromises();
    expect(uni.navigateTo).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/pages/profile/index?panel=connectors' })
    );
    expect(store.exportData()).toBe(before);
    expect(generateLearningTurn).toHaveBeenCalledTimes(1);
    expect(fetchLearningResult).not.toHaveBeenCalled();
  } finally {
    wrapper?.unmount();
    store.$dispose();
    learningWriteLease.release();
    vi.mocked(generateLearningTurn).mockReset().mockImplementation(previousGenerate);
    vi.unstubAllEnvs();
  }
});

it('评估未知时仅查询，确认失败后次日点击重新评估才调用新模型，沿用已保存原答', async () => {
  const store = freshStore();
  const previousGenerate = generateLearningTurn.getMockImplementation();
  const previousModels = fetchLearningModels.getMockImplementation();
  let wrapper;
  const response = async (body) => ({
    success: true,
    data: {
      requestId: body.requestId,
      requestBinding: body.requestBinding,
      modelId: body.modelId,
      coach: coachFixture(body.learningContext.coach)
    }
  });
  vi.mocked(generateLearningTurn).mockClear().mockImplementation(response);
  vi.mocked(fetchLearningResult).mockReset();
  try {
    store.coachSave('profile', { profile: { exam: 'english2', minutes: 25, deadline: null } });
    await store.requestCoach('diagnostic');
    for (const card of store.active.coach.diagnostic.cards)
      store.coachSave('answer', { target: 'diagnostic', cardId: card.id, answer: 'Buoyancy acts upward.' });
    const answers = JSON.parse(JSON.stringify(store.active.coach.diagnostic.answers));
    vi.mocked(generateLearningTurn).mockResolvedValueOnce({ success: false, code: 503, message: '合成评估失败' });
    await store.requestCoach('feedback', 'diagnostic');
    const original = store.active.coach.requests.at(-1);
    vi.mocked(fetchLearningResult).mockResolvedValueOnce({ success: false, code: 409, status: 'reserved' });
    await store.requestCoach('feedback', 'diagnostic', original.id);
    expect(store.active.coach.requests.at(-1).status).toBe('pending');
    vi.mocked(fetchLearningResult).mockResolvedValueOnce({
      success: false,
      code: 503,
      status: 'failed',
      error: 'TIMEOUT'
    });
    await store.requestCoach('feedback', 'diagnostic', original.id);
    expect(store.active.coach.requests.at(-1).status).toBe('closed');
    expect(generateLearningTurn).toHaveBeenCalledTimes(2);
    expect(store.active.coach.diagnostic.answers).toEqual(answers);
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 86400000);
    store.calendarTime = now + 86400000;
    const nextModel = {
      id: 'synthetic-model-two',
      provider: 'synthetic',
      model: 'synthetic-model-two',
      source: 'byok',
      configured: true,
      capabilities: {}
    };
    store.models.push(nextModel);
    store.modelId = nextModel.id;
    vi.mocked(fetchLearningModels).mockResolvedValueOnce({
      success: true,
      data: { platformEnabled: true, presets: [], models: [nextModel] }
    });
    const retryAction = vi.spyOn(store, 'requestCoach');
    wrapper = mount(WritingCoach, { global: { stubs: { BaseIcon: true, PrivacyPopup: true } } });
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('模型响应超时，原答已保留，可重新评估');
    expect(wrapper.findAll('button').some((button) => button.text().trim() === '查询原请求')).toBe(false);
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '重新评估')
      .trigger('tap');
    await flushPromises();
    await expect(retryAction.mock.results.at(-1).value).resolves.toMatchObject({ success: true });
    expect(generateLearningTurn).toHaveBeenCalledTimes(3);
    expect(fetchLearningResult).toHaveBeenCalledTimes(2);
    expect(generateLearningTurn.mock.calls.at(-1)[0]).toMatchObject({
      modelId: nextModel.id,
      learningContext: { coach: { day: original.request.day, input: original.request.input } }
    });
    expect(store.active.coach.requests.at(-1)).toMatchObject({ status: 'completed', retryOf: original.id });
    expect(store.active.coach.diagnostic.answers.map((a) => a.answer)).toEqual(answers.map((a) => a.answer));
    expect(store.active.coach.diagnostic.answers.every((a) => a.assessmentStatus === 'assessed')).toBe(true);
  } finally {
    wrapper?.unmount();
    store.$dispose();
    learningWriteLease.release();
    vi.restoreAllMocks();
    vi.mocked(generateLearningTurn).mockReset().mockImplementation(previousGenerate);
    vi.mocked(fetchLearningModels).mockReset().mockImplementation(previousModels);
    vi.mocked(fetchLearningResult).mockReset();
  }
});

describe('跳过建档保留已明确的考试类型', () => {
  it('英语二被保留，不被改写成英语一', () => {
    expect(resolveSkippedProfile({ exam: 'english2' }).exam).toBe('english2');
  });

  it('英语一同样保留', () => {
    expect(resolveSkippedProfile({ exam: 'english1' }).exam).toBe('english1');
  });

  it('未选择考试时间时不编造考试日期', () => {
    expect(resolveSkippedProfile({}).deadline).toBeNull();
  });

  it.each(['this', 'next'])('跳过时保留已点选的考试时间区间 %s，不编造日期', (deadlineBucket) => {
    expect(resolveSkippedProfile({ deadlineBucket })).toMatchObject({ deadline: null, deadlineBucket });
  });

  it('未知建档不补英语一，已明确的时长与基础仍保留', () => {
    const profile = resolveSkippedProfile({ exam: '', minutes: '25', foundation: '写了点东西' });
    expect(profile).toEqual({
      exam: null,
      deadline: null,
      deadlineBucket: null,
      minutes: 25,
      foundation: '写了点东西',
      skipped: true,
      subjects: [],
      track: 'kaoyan-english-writing'
    });
  });

  it('跳过时保留用户已点选的准备方向', () => {
    expect(resolveSkippedProfile({ subject: 'gongkao_shenlun', subjects: ['kaoyan_math'] }).subjects).toEqual([
      'gongkao_shenlun',
      'kaoyan_math'
    ]);
  });

  it('非法准备方向被丢弃，不写进档案', () => {
    expect(resolveSkippedProfile({ subject: 'made-up', subjects: ['also-made-up'] }).subjects).toEqual([]);
  });

  it('非法考试类型也保持未知，不把脏值或英语一写进档案', () => {
    expect(resolveSkippedProfile({ exam: 'english3' }).exam).toBeNull();
  });

  it('未传参数时未知建档不生成考试、时长或日期', () => {
    expect(resolveSkippedProfile()).toMatchObject({ exam: null, minutes: null, deadline: null, skipped: true });
  });
});

describe('资料保存与绑定是一个整体', () => {
  it('没有在建档案时拒绝，且一个版本都不推进', () => {
    const store = useConversationLearningStore();
    const materialsBefore = store.state.materials.length;
    const revisionBefore = store.state.revision;
    expect(() => store.attachMaterial(material('浮力是竖直向上的'))).toThrow('请回到当前带练');
    // revision 只在真的写入后才前进，是「一笔都没写」的直接证据。
    expect(store.state.revision).toBe(revisionBefore);
    expect(store.state.materials.length).toBe(materialsBefore);
  });

  it('正常路径：资料已保存且已绑定到当前带练', () => {
    const store = freshStore();
    const before = store.state.materials.length;
    const id = store.attachMaterial(material('均衡价格由供给与需求共同决定')).id;
    expect(store.state.materials.length).toBe(before + 1);
    expect(store.active.coach.materialIds).toContain(id);
  });

  it('粘贴入口同样一次完成保存与绑定', () => {
    const store = freshStore();
    const before = store.state.materials.length;
    store.attachText('光合作用把光能转成化学能');
    expect(store.state.materials.length).toBe(before + 1);
    expect(store.active.coach.materialIds).toHaveLength(1);
  });

  it('同一份资料再传一次只绑定一次，且绑的是已存在的规范 id', () => {
    const store = freshStore();
    const text = '一次函数图像是一条直线';
    const sealed = { ...parsePastedMaterial(text, 'm_dup_first') };
    sealed.fingerprint = 'synthetic-fingerprint';
    const first = store.attachMaterial(JSON.parse(JSON.stringify(sealed)));
    const twice = { ...JSON.parse(JSON.stringify(sealed)), id: 'm_dup_second' };
    const second = store.attachMaterial(twice);
    expect(second.id).toBe(first.id);
    expect(store.active.coach.materialIds).toEqual([first.id]);
    expect(store.state.materials.filter((m) => m.fingerprint === 'synthetic-fingerprint')).toHaveLength(1);
  });

  it('模型请求在途时导入资料：整笔拒绝，不留「已保存未绑定」的半写入', async () => {
    const store = freshStore();
    store.coachSave('profile', {
      profile: { exam: 'english2', deadline: '2026-12-22', minutes: 25 }
    });
    store.modelId = 'synthetic-model';
    store.models = [
      {
        id: 'synthetic-model',
        provider: 'synthetic',
        model: 'synthetic-model',
        source: 'platform',
        configured: true,
        capabilities: {}
      }
    ];
    const generate = vi.mocked(generateLearningTurn);
    const previousGenerate = generate.getMockImplementation();
    const started = Promise.withResolvers();
    const response = Promise.withResolvers();
    generate.mockImplementation(() => {
      started.resolve();
      return response.promise;
    });
    const pending = store.requestCoach('diagnostic');
    try {
      await Promise.race([started.promise, pending]);
      expect(store.busy).toBe(true);

      const materialsBefore = store.state.materials.length;
      const revisionBefore = store.state.revision;
      const boundBefore = [...store.active.coach.materialIds];
      expect(() => store.attachMaterial(material('需求曲线向右下方倾斜'))).toThrow('请回到当前带练，等待请求结束');

      // 关键：版本未推进、没有新增资料、也没有产生未绑定的孤儿资料。
      expect(store.state.revision).toBe(revisionBefore);
      expect(store.state.materials.length).toBe(materialsBefore);
      expect(store.active.coach.materialIds).toEqual(boundBefore);
    } finally {
      response.resolve({ success: false, status: 'cancelled' });
      await Promise.allSettled([pending]);
      generate.mockImplementation(previousGenerate);
      store.$dispose();
    }
  });
});

it('已验证连接的单次请求失败仍可手动切换，未通过能力门禁的连接不进入选择器', () => {
  const store = freshStore();
  const model = (id, tools, structured, connectionStatus) => ({
    id,
    source: 'byok',
    provider: id,
    model: 'synthetic-model',
    configured: true,
    connectionStatus,
    capabilityCheck: { version: 1, tools, structured }
  });
  store.models = [
    model('current', true, true, 'connected'),
    model('verified-failed', true, true, 'failed'),
    model('unsupported', false, true, 'connected'),
    model('unverified', false, false, 'connected')
  ];
  store.modelId = 'current';
  const wrapper = mount(MuseModelControl);
  try {
    const options = wrapper.findComponent(BaseInput).props('options');
    expect(options.map((option) => option.value)).toEqual(['current', 'verified-failed']);
    expect(options[1].label).toContain('上次请求失败');
  } finally {
    wrapper.unmount();
  }
});

it('已提交审题后重新挂载恢复写作，不被待评日卡抢回，待评原答仍保留', async () => {
  const store = freshStore();
  const previousGenerate = generateLearningTurn.getMockImplementation();
  let wrapper;
  vi.mocked(generateLearningTurn).mockImplementation(async (body) => ({
    success: true,
    data: {
      requestId: body.requestId,
      requestBinding: body.requestBinding,
      modelId: body.modelId,
      coach: coachFixture(body.learningContext.coach)
    }
  }));
  try {
    store.coachSave('profile', { profile: { exam: 'english2', minutes: 25, deadline: null } });
    await store.requestCoach('diagnostic');
    for (const card of store.active.coach.diagnostic.cards)
      store.coachSave('answer', { target: 'diagnostic', cardId: card.id, answer: 'Synthetic answer.' });
    await store.requestCoach('feedback', 'diagnostic');
    await store.requestCoach('daily');
    for (const card of store.active.coach.days[0].pack.cards)
      store.coachSave('answer', { cardId: card.id, answer: 'Original pending answer.' });
    store.coachSave('analysis', {
      fields: { genre: 'letter', recipient: 'friend', purpose: 'invite', points: 'event', words: '100' }
    });
    store.refresh();
    wrapper = mount(WritingCoach);
    await flushPromises();
    expect(wrapper.text()).toContain('对照审题反馈');
    expect(wrapper.find('[data-test="coach-practice-sheet"]').exists()).toBe(false);
    expect(store.active.coach.days[0].answers).toHaveLength(8);
    expect(store.active.coach.days[0].answers.every((answer) => answer.answer === 'Original pending answer.')).toBe(
      true
    );
  } finally {
    wrapper?.unmount();
    vi.mocked(generateLearningTurn).mockImplementation(previousGenerate);
  }
});
