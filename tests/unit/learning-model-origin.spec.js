import { describe, it, expect } from 'vitest';
import {
  learningSentParameters,
  normalizeLearningModelOrigin
} from '../../laf-backend/functions/_shared/learning-model-origin.js';
import { learningProgressReadModel } from '@/services/learning/learning-progress-read-model.js';
import { progressFixture } from '../fixtures/learning-progress.js';

const binding = { requestId: 'request-0', modelId: 'qa-external-connection', binding: 'request-binding' };
const origin = () => ({
  contract: 'learning-model-origin-v1',
  callId: binding.requestId,
  modelId: binding.modelId,
  requestBinding: binding.binding,
  source: 'byok',
  provider: 'Synthetic provider',
  actualModel: 'actual-model',
  configurationVersion: 'a'.repeat(64),
  upstreamVersion: null,
  inferencePolicy: 'native-coach-tools-v1',
  outputContract: 'kaoyan-writing-coach-v1',
  schemaDigest: 'b'.repeat(64),
  sentParameters: { max_tokens: 8192, thinking: { type: 'disabled' } },
  verificationModels: []
});

describe('bound learning model provenance', () => {
  it.each(['request', 'connection', 'binding', 'secret-field', 'revision-claim', 'parameter-payload'])(
    'cannot attribute a foreign or malformed %s origin to a saved learning record',
    (reason) => {
      const value = origin();
      if (reason === 'request') value.callId = 'another-request';
      if (reason === 'connection') value.modelId = 'another-connection';
      if (reason === 'binding') value.requestBinding = 'another-binding';
      if (reason === 'secret-field') value.apiKey = 'synthetic-key';
      if (reason === 'revision-claim') value.upstreamVersion = 'invented-model-release';
      if (reason === 'parameter-payload') value.sentParameters.thinking.messages = ['private original'];
      expect(normalizeLearningModelOrigin(value, binding)).toBeNull();
    }
  );
  it('records only explicitly sent non-content parameters and tolerates JSON property reordering', () => {
    const value = origin();
    value.sentParameters = { thinking: { type: 'disabled' }, max_tokens: 8192 };
    expect(normalizeLearningModelOrigin(value, binding).sentParameters).toEqual({
      max_tokens: 8192,
      thinking: { type: 'disabled' }
    });
    expect(
      learningSentParameters({
        ...value.sentParameters,
        model: 'name',
        messages: ['private original'],
        apiKey: 'secret',
        endpoint: 'https://example.test'
      })
    ).toEqual({ max_tokens: 8192, thinking: { type: 'disabled' } });
    expect(learningSentParameters({})).toEqual({});
  });
  it('records a prompt-only subject method without inventing a schema or relaxing strict-format origins', () => {
    const methodContract = 'shenlun-writing-method-v1';
    const value = {
      ...origin(),
      contract: 'learning-model-origin-prompt-v1',
      inferencePolicy: 'subject-coach-prompt-v1',
      outputContract: methodContract,
      schemaDigest: null
    };
    expect(normalizeLearningModelOrigin(value, { ...binding, methodContract })).toEqual(value);
    expect(normalizeLearningModelOrigin(value, binding)).toBeNull();
    expect(normalizeLearningModelOrigin(value, { ...binding, methodContract: 'unregistered-method' })).toBeNull();
    expect(
      normalizeLearningModelOrigin({ ...value, schemaDigest: 'b'.repeat(64) }, { ...binding, methodContract })
    ).toBeNull();
    expect(
      normalizeLearningModelOrigin({ ...value, contract: 'learning-model-origin-v1' }, { ...binding, methodContract })
    ).toBeNull();
    expect(
      normalizeLearningModelOrigin({ ...value, requestBinding: 'other-request' }, { ...binding, methodContract })
    ).toBeNull();
  });
  it('preserves a completed bounded repair call without changing the original request binding', () => {
    expect(normalizeLearningModelOrigin({ ...origin(), callId: 'request-0:repair1' }, binding).callId).toBe(
      'request-0:repair1'
    );
    expect(normalizeLearningModelOrigin({ ...origin(), callId: 'request-0:repair999' }, binding)).toBeNull();
  });
  it('uses saved response provenance for arbitrary connection names, keeps old sources unknown, and never admits platform reference data', () => {
    const state = progressFixture(2, 0),
      coach = state.conversations[0].coach;
    coach.requests.forEach((request) => {
      request.modelId = binding.modelId;
      request.binding = binding.binding;
    });
    coach.requests[0].request.knowledgeContract = 'writing-knowledge-binding-v1';
    coach.learningRecords = [{ id: 'receipt-0', requestId: 'request-0', model: origin() }];
    const before = JSON.stringify(state),
      model = learningProgressReadModel(state);
    expect(model.evidence.find((event) => event.id === 'receipt-0').model).toMatchObject({
      source: 'byok',
      modelId: binding.modelId,
      actualModel: 'actual-model'
    });
    expect(model.evidence.find((event) => event.id === 'receipt-1').model).toEqual({
      source: 'unknown',
      modelId: binding.modelId
    });
    expect(model.sources.find((source) => source.source === 'byok').evidenceIds).toEqual(['receipt-0']);
    expect(model.platformReference).toEqual({ status: 'insufficient', percentage: null, evidenceIds: [] });
    expect(JSON.stringify(state)).toBe(before);
  });
});
