import { expect, it } from 'vitest';
import { emptyLearningState, applyLearningOperation, dayKey } from '@/services/learning/learning-domain.js';
import { beadArtProgress, beadArtworkPoints } from '../../laf-backend/functions/_shared/learning-bead-art.js';
const at = Date.parse('2026-11-10T12:00:00Z');
function fixture() {
  const state = emptyLearningState('isolated-bead-owner');
  state.timezone = 'UTC';
  state.conversations.push({ id: 'study', goal: '学习目标', at });
  return applyLearningOperation(state, {
    id: 'picture',
    type: 'bead.start',
    at,
    data: { conversationId: 'study', artwork: 'notebook', deadline: '2026-11-13' }
  }).state;
}
const answer = (id, date, extra = {}) => ({
  id,
  type: 'attempt.submit',
  at: Date.parse(date),
  data: { conversationId: 'study', ...extra }
});
it('chooses a fixed picture in advance, rejects invalid dates, and reuses the exact start receipt', () => {
  const state = fixture();
  const op = state.events[0];
  expect(applyLearningOperation(state, op).reused).toBe(true);
  expect(beadArtProgress(state, 'study', at, dayKey)).toMatchObject({ earned: 0, total: 4, missing: 0 });
  expect(() => applyLearningOperation(state, { ...op, id: 'changed', data: { ...op.data, artwork: 'bloom' } })).toThrow(
    '考期已固定'
  );
  const fresh = emptyLearningState('fresh');
  fresh.conversations.push({ id: 'study' });
  expect(() => applyLearningOperation(fresh, { ...op, data: { ...op.data, deadline: '2026-11-31' } })).toThrow(
    '考试日期'
  );
});
it('keeps missed-day holes, repairs them from extra real answers, and never prepays future days', () => {
  const state = fixture();
  state.events.push(
    answer('first', '2026-11-10T13:00Z'),
    answer('extra-no-debt', '2026-11-10T14:00Z'),
    answer('today', '2026-11-12T12:00Z')
  );
  let progress = beadArtProgress(state, 'study', Date.parse('2026-11-12T14:00Z'), dayKey);
  expect(progress.slots.map((slot) => Boolean(slot.earnedBy))).toEqual([true, false, true, false]);
  expect(progress.missing).toBe(1);
  state.events.push(answer('extra-repair', '2026-11-12T13:00Z'));
  progress = beadArtProgress(state, 'study', Date.parse('2026-11-12T14:00Z'), dayKey);
  expect(progress.slots[1]).toMatchObject({ earnedBy: 'extra-repair', repaired: true });
  expect(progress).toMatchObject({ earned: 3, repaired: 1, missing: 0, complete: false });
  expect(beadArtProgress(JSON.parse(JSON.stringify(state)), 'study', Date.parse('2026-11-12T14:00Z'), dayKey)).toEqual(
    progress
  );
});
it('ignores old work, another goal, model replies, self-rating, and work after the fixed exam date', () => {
  const state = fixture();
  state.events.unshift(answer('older', '2026-11-10T11:00Z'));
  state.events.push(
    answer('other', '2026-11-11T12:00Z', { conversationId: 'another' }),
    { id: 'self', type: 'coach.review', at: at + 86400000, data: { conversationId: 'study' } },
    { id: 'model', type: 'coach.result', at: at + 86400000, data: { conversationId: 'study' } },
    answer('late', '2026-11-14T12:00Z')
  );
  expect(beadArtProgress(state, 'study', at + 5 * 86400000, dayKey)).toMatchObject({
    earned: 0,
    missing: 4,
    ended: true
  });
  expect(beadArtProgress(state, 'another', at, dayKey)).toBeNull();
});
it('uses the saved timezone across a DST transition and completes only from saved work', () => {
  const state = fixture();
  state.conversations[0].beadArt = {
    ...state.conversations[0].beadArt,
    startDay: '2026-11-01',
    deadline: '2026-11-02',
    at: Date.parse('2026-11-01T07:00Z'),
    timezone: 'America/Los_Angeles'
  };
  state.events.push(answer('dst-one', '2026-11-01T08:30Z'), answer('dst-two', '2026-11-01T09:30Z'));
  expect(beadArtProgress(state, 'study', Date.parse('2026-11-02T09:00Z'), dayKey)).toMatchObject({
    total: 2,
    earned: 1,
    complete: false
  });
  state.events.push(answer('next-day', '2026-11-02T08:30Z'));
  expect(beadArtProgress(state, 'study', Date.parse('2026-11-02T09:00Z'), dayKey)).toMatchObject({
    total: 2,
    earned: 2,
    complete: true
  });
});
it('keeps the chosen picture stable with one visible bead position for each planned day', () => {
  for (const art of ['notebook', 'bloom'])
    for (const count of [1, 4, 35, 366]) {
      const points = beadArtworkPoints(art, count);
      expect(points).toHaveLength(count);
      expect(new Set(points.map((point) => `${point.x}:${point.y}`)).size).toBe(count);
      expect(beadArtworkPoints(art, count)).toEqual(points);
    }
});
