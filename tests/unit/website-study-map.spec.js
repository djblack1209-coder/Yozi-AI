import { describe, expect, it } from 'vitest';
import { recordFor, subjects } from '../../website/study-map.mjs';

describe('public study map examples', () => {
  it('weights accuracy by answers across branches and finds the lowest topic rate', () => {
    const subject = { branches: [
      { topics: [{ marks: '1' }] }, { topics: [{ marks: '100' }, { marks: '1100' }] }
    ] };
    const { accuracy, correct, total, weak } = recordFor(subject);
    expect({ accuracy, correct, total }).toEqual({ accuracy: 50, correct: 4, total: 8 });
    expect(weak.item).toBe(subject.branches[1].topics[0]);
  });

  it.each(subjects)('keeps the last miss and next exercise on the highlighted $en leaf', subject => {
    const { item } = recordFor(subject).weak;
    expect(item.marks.endsWith('0')).toBe(true);
    expect(item.example.answer).not.toEqual(item.example.correction);
    for (const field of ['question', 'reason', 'revisit']) {
      expect(item.example[field]).toHaveLength(2);
      expect(item.example[field].every(Boolean)).toBe(true);
    }
  });
});
