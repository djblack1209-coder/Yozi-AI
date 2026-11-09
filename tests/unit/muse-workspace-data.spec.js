import { describe, expect, it } from 'vitest';
import { emptyLearningState } from '@/services/learning/learning-domain.js';
import { museGoals, museActivity, museArtifacts, museUsage } from '@/services/learning/muse-workspace-data.js';
import { coachSavedRecords } from '../../laf-backend/functions/_shared/learning-coach-records.js';
import {
  searchLearningRecords,
  learningRecordTarget
} from '../../laf-backend/functions/_shared/learning-record-search.js';
import { progressBoundaryFixture } from '../fixtures/learning-progress.js';

function fixture() {
  const state = emptyLearningState('muse-isolated');
  state.timezone = 'Asia/Shanghai';
  const at = Date.parse('2026-10-20T02:00:00Z');
  const conversation = {
    id: 'english',
    goal: '英语二写作',
    at,
    coach: {
      startedDay: '2026-10-20',
      timezone: state.timezone,
      profile: null,
      days: [],
      library: [],
      diagnostic: {
        cards: [{ id: 'd1', title: '成分识别', prompt: 'Find the subject.' }],
        answers: [{ id: 'raw-1', cardId: 'd1', answer: '  Original\nSpacing <script>  ', at: at + 1000 }],
        feedback: null
      }
    }
  };
  state.conversations.push(conversation);
  state.materials.push({ id: 'private', name: '我的资料', segments: [{ id: 'p1', content: '本机原文' }], at });
  state.events.push({
    id: 'event-1',
    type: 'coach.answer',
    at: at + 1000,
    data: {
      conversationId: conversation.id,
      target: 'diagnostic',
      cardId: 'd1',
      answer: conversation.coach.diagnostic.answers[0].answer
    }
  });
  return { state, at, conversation };
}
describe('Muse workspace reads saved facts', () => {
  it('never invents a deadline, mastery percentage or completed training and leaves facts unchanged', () => {
    const { state, at } = fixture();
    const before = JSON.stringify(state);
    const [goal] = museGoals(state, at);
    expect(goal).toMatchObject({ next: '继续建档', percent: null, completedDays: 0 });
    expect(goal.tasks[0]).toMatchObject({ count: 1, done: false });
    expect(museActivity(state)[0]).toMatchObject({ title: '成分识别', kind: 'practice' });
    expect(museArtifacts(state).find((row) => row.materialId === 'private').material.segments[0].content).toBe(
      '本机原文'
    );
    expect(JSON.stringify(state)).toBe(before);
  });
  it('searches the exact original and locates a coach answer without converting AI feedback into reliable grading', () => {
    const { state, conversation } = fixture();
    const before = JSON.stringify(state);
    const [record] = searchLearningRecords(state, 'original', { filter: 'pending' }).items;
    expect(record).toMatchObject({ coachRecordId: 'raw-1', gradeStatus: 'pending', outcome: null });
    expect(learningRecordTarget(state, record.id).answer).toBe(conversation.coach.diagnostic.answers[0].answer);
    expect(coachSavedRecords(conversation)[0].answer).toBe(conversation.coach.diagnostic.answers[0].answer);
    expect(searchLearningRecords(state, 'original', { filter: 'wrong' }).total).toBe(0);
    expect(JSON.stringify(state)).toBe(before);
  });
  it('reads legacy answers without request receipts and binds only a matching pending feedback request', () => {
    const { conversation } = fixture();
    const before = JSON.stringify(conversation);
    const [legacy] = coachSavedRecords(conversation);
    expect(legacy).toMatchObject({ key: 'raw-1', assessmentStatus: 'pending' });
    expect(legacy.request).toBeUndefined();
    expect(JSON.stringify(conversation)).toBe(before);
    const matching = {
      id: 'pending-feedback',
      status: 'pending',
      request: { target: 'diagnostic', phase: 'feedback' }
    };
    conversation.coach.requests = [
      { ...matching, id: 'completed-feedback', status: 'completed' },
      { ...matching, id: 'wrong-target', request: { target: 'card-other', phase: 'feedback' } },
      matching
    ];
    const withRequests = JSON.stringify(conversation);
    expect(coachSavedRecords(conversation)[0].request).toEqual(matching);
    expect(JSON.stringify(conversation)).toBe(withRequests);
  });
  it('does not resurrect removed conversations or materials from retained events and rebuilds after a revision', () => {
    const { state } = fixture();
    searchLearningRecords(state, 'original');
    state.conversations = [];
    state.materials = [];
    state.revision++;
    expect(museActivity(state)).toEqual([]);
    expect(museArtifacts(state)).toEqual([]);
    expect(searchLearningRecords(state, 'original').total).toBe(0);
    expect(searchLearningRecords(emptyLearningState('other-owner'), '').total).toBe(0);
  });
  it('keeps unknown quota and costs unknown, groups requests by local day, and leaves pending outcomes intact', () => {
    const { state, conversation, at } = fixture();
    conversation.coach.requests = [
      { id: 'one', modelId: 'platform', status: 'completed', at },
      { id: 'two', modelId: 'platform', status: 'pending', at: at + 1000 },
      { id: 'three', modelId: 'byok', status: 'closed', at: at - 86400000 }
    ];
    const before = JSON.stringify(state);
    const usage = museUsage(state, at);
    expect(usage).toMatchObject({
      total: 3,
      completed: 1,
      pending: 1,
      closed: 1,
      quotaPercent: null,
      cost: null,
      weekTotal: 3
    });
    expect(usage.days.at(-1)).toEqual({ day: '2026-10-20', count: 2 });
    expect(usage.models).toEqual([
      { id: 'platform', count: 2 },
      { id: 'byok', count: 1 }
    ]);
    expect(JSON.stringify(state)).toBe(before);
    expect(museUsage(emptyLearningState('another-owner'), at)).toMatchObject({
      total: 0,
      models: [],
      quotaPercent: null,
      cost: null
    });
  });
});

describe('Muse plan page follows the conversation on the next day', () => {
  const dayAt = (day) => Date.parse(`${day}T12:00:00Z`);
  function nextDay({ saved = true, finished = false } = {}) {
    const { state } = fixture();
    state.timezone = 'UTC';
    const conversation = state.conversations[0];
    conversation.at = dayAt('2026-05-01');
    Object.assign(conversation.coach, {
      timezone: 'UTC',
      startedDay: '2026-05-01',
      profile: { minutes: 20 },
      requests: []
    });
    conversation.coach.diagnostic.feedback = { weaknesses: [] };
    conversation.coach.days = [
      {
        day: '2026-05-01',
        completed: finished,
        writingTask: { taskVersion: 1 },
        pack: { cards: [{ id: 'c1' }], writing: { patterns: ['p1'] } },
        answers: saved ? [{ id: 'a1', cardId: 'c1', answer: 'x' }] : [],
        rewrites: [],
        drafts: [],
        feedback: {}
      }
    ];
    return state;
  }
  it('names an unfinished task carried over the same way the conversation does', () => {
    const [goal] = museGoals(nextDay(), dayAt('2026-05-02'));
    expect(goal.current.day).toBe('2026-05-01');
    expect(goal.tasks.find((t) => t.id === 'practice')).toMatchObject({ title: '继续上次训练', count: 1, total: 1 });
    expect(goal.next).toBe('继续上次训练');
  });
  it('keeps a finished day as history and asks for a new plan', () => {
    const [goal] = museGoals(nextDay({ finished: true }), dayAt('2026-05-02'));
    expect(goal.current).toBeUndefined();
    expect(goal.tasks.some((t) => t.id === 'practice')).toBe(false);
    expect(goal.next).toBe('安排今日训练');
  });
  it('puts saved corrections on the next day’s plan without inventing a result', () => {
    const state = progressBoundaryFixture(1, 0);
    const { coach } = state.conversations[0];
    coach.diagnostic = { cards: [], answers: [], feedback: { weaknesses: [] } };
    const day = coach.days[0];
    day.answers[0].answer = 'On';
    Object.assign(day.feedback['card-card0'], {
      weaknesses: ['介词搭配'],
      weaknessEvidence: [{ label: '介词搭配', quote: 'On', classification: 'error' }],
      dimensions: [{ name: '搭配', score: 1, evidence: ['On'], comment: '合成错误反馈' }]
    });
    const before = JSON.stringify(state);
    const [goal] = museGoals(state, Date.parse('2026-10-31T03:00:00Z'));
    expect(goal.tasks.find((t) => t.id === 'retry')).toMatchObject({
      title: '待重练',
      done: false,
      count: 0,
      total: 1
    });
    expect(goal.next).toBe('待重练');
    expect(JSON.stringify(state)).toBe(before);
  });
  it('titles the same day as today’s training', () => {
    const [goal] = museGoals(nextDay(), dayAt('2026-05-01'));
    expect(goal.tasks.find((t) => t.id === 'practice').title).toBe('今日训练');
  });
});
