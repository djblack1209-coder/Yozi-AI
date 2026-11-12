// A bead is evidence of saved work, never a login, timer or self-reported check-in.
export const BEAD_ARTWORKS = Object.freeze([
  { id: 'notebook', label: '开卷', english: 'Open book' },
  { id: 'bloom', label: '花开', english: 'Bloom' }
]);
export const BEAD_SUBMISSIONS = new Set([
  'coach.answer',
  'coach.errorAnswer',
  'coach.paragraph',
  'attempt.submit',
  'attempt.submit-original-v1'
]);
const DAY = 86400000;
const ordinal = (day) => Date.parse(`${day}T00:00:00Z`) / DAY;

export function startBeadArt(state, operation, { assert, dayKey }) {
  const data = operation.data;
  const conversation = state.conversations.find((item) => item.id === data.conversationId);
  assert(conversation && !conversation.stopped, 'PRECONDITION', '请先选择正在学习的目标');
  assert(!conversation.beadArt, 'PRECONDITION', '这幅图案的考期已固定，请继续完成它');
  assert(
    BEAD_ARTWORKS.some((art) => art.id === data.artwork),
    'INVALID_INPUT',
    '请选择图案'
  );
  const today = dayKey(operation.at, state.timezone);
  const deadline = data.deadline;
  assert(
    typeof deadline === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(deadline) &&
      Number.isFinite(ordinal(deadline)) &&
      new Date(ordinal(deadline) * DAY).toISOString().slice(0, 10) === deadline &&
      deadline >= today,
    'INVALID_INPUT',
    '请选择今天或之后的考试日期'
  );
  const art = {
    id: operation.id,
    artwork: data.artwork,
    startDay: today,
    deadline,
    timezone: state.timezone,
    at: operation.at
  };
  conversation.beadArt = art;
  return art;
}

export function beadArtProgress(state, conversationId, now, dayKey) {
  const art = state.conversations.find((item) => item.id === conversationId)?.beadArt;
  if (!art) return null;
  const total = ordinal(art.deadline) - ordinal(art.startDay) + 1;
  const today = dayKey(now, art.timezone);
  const slots = Array.from({ length: total }, (_, index) => ({
    day: new Date((ordinal(art.startDay) + index) * DAY).toISOString().slice(0, 10),
    earnedBy: null,
    repaired: false
  }));
  const startIndex = state.events.findIndex((event) => event.id === art.id);
  const submissions = state.events
    .slice(startIndex + 1)
    .filter(
      (event) =>
        BEAD_SUBMISSIONS.has(event.type) &&
        event.data?.conversationId === conversationId &&
        event.at >= art.at &&
        event.at <= now
    )
    .sort((a, b) => a.at - b.at);
  for (const event of submissions) {
    const day = dayKey(event.at, art.timezone);
    if (day < art.startDay || day > art.deadline) continue;
    const index = ordinal(day) - ordinal(art.startDay);
    const slot = !slots[index].earnedBy ? slots[index] : slots.find((item) => !item.earnedBy && item.day < day);
    if (slot) Object.assign(slot, { earnedBy: event.id, repaired: slot.day !== day });
  }
  const earned = slots.filter((slot) => slot.earnedBy).length;
  return {
    ...art,
    total,
    slots,
    earned,
    missing: slots.filter((slot) => !slot.earnedBy && slot.day < today).length,
    repaired: slots.filter((slot) => slot.repaired).length,
    ended: today > art.deadline,
    complete: earned === total
  };
}

// Sample one chosen picture into exactly one bead per study day. The picture and
// allocation stay fixed; future beads cannot be prepaid by a burst of submissions.
export function beadArtworkPoints(artwork, total) {
  const inside = (x, y) =>
    artwork === 'bloom'
      ? x * x + y * y < 0.16 ||
        [0, 1, 2, 3, 4, 5].some((petal) => {
          const angle = (petal * Math.PI) / 3;
          return (x - Math.cos(angle) * 0.5) ** 2 + (y - Math.sin(angle) * 0.5) ** 2 < 0.18;
        })
      : Math.abs(x) < 0.88 && Math.abs(y + 0.16 * Math.abs(x)) < 0.65;
  let side = Math.max(3, Math.ceil(Math.sqrt(total * 2)));
  let candidates;
  do {
    candidates = [];
    for (let row = 0; row < side; row++)
      for (let col = 0; col < side; col++) {
        const x = (col / (side - 1)) * 2 - 1,
          y = (row / (side - 1)) * 2 - 1;
        if (inside(x, y))
          candidates.push({
            x: (x + 1) * 50,
            y: (y + 1) * 50,
            color:
              artwork === 'bloom'
                ? x * x + y * y < 0.16
                  ? '#f7bd56'
                  : '#8eabf4'
                : Math.abs(x) < 0.15
                  ? '#afc9ee'
                  : x < 0
                    ? '#e1eafa'
                    : '#8eaef2'
          });
      }
    side++;
  } while (candidates.length < total);
  return Array.from({ length: total }, (_, index) => ({
    ...candidates[Math.floor((index * candidates.length) / total)],
    size: 94 / (side - 1)
  }));
}
