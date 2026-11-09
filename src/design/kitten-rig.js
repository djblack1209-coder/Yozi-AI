// Gesture timing for the avatar business states. The approved Pudding portrait supplies the artwork.
const ease = (t) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};
function gesture(t, start, rise, hold, fall) {
  const a = t - start;
  if (a < 0 || a > rise + hold + fall) return 0;
  return a < rise ? ease(a / rise) : a < rise + hold ? 1 : 1 - ease((a - rise - hold) / fall);
}
export function kittenPoseAt(elapsed, state = 'idle', { reduced = false, age = elapsed, exit = 0 } = {}) {
  if (reduced) {
    const still = kittenPoseAt(0, state, { age: 700 });
    return { ...still, phase: 'still', breath: 0, tailTip: 0, jump: 0 };
  }
  const t = elapsed % 57100;
  const blink = [1700, 6400, 11900, 22400, 34100, 46200].reduce(
    (v, start) => Math.max(v, gesture(t, start, 130, 45, 260)),
    0
  );
  const ear = [2700, 14600, 38000].reduce((v, start) => Math.max(v, gesture(t, start, 110, 50, 250)), 0);
  const look = gesture(t, 8200, 650, 1600, 850) - gesture(t, 27800, 700, 1200, 900);
  const p = {
    head: 12,
    headY: 0,
    body: 1,
    earL: 0,
    earR: 0,
    tail: 0,
    tailTip: 0,
    pawL: 0,
    pawR: 0,
    pawTurnL: 0,
    pawTurnR: 0,
    blink,
    gazeX: 0,
    gazeY: 0,
    breath: 0,
    headScale: 1,
    bodyWidth: 1,
    pawY: 865,
    jump: 0,
    shiftX: state === 'making' ? 80 : 0,
    laptop: state === 'making',
    cushion: state === 'sleeping',
    tucked: ['sleeping', 'stopped'].includes(state),
    phase: exit > 0 ? 'exit' : age < 450 ? 'enter' : 'loop'
  };
  if (state === 'dozing') {
    const nod = gesture(elapsed % 19300, 2100, 1700, 1400, 600) + gesture(elapsed % 19300, 11600, 2100, 1900, 800);
    Object.assign(p, {
      head: 10 + nod * 13,
      headY: 48 + nod * 42,
      body: 0.9,
      earL: 10 + ear * 16,
      earR: -8,
      tail: 30,
      blink: 0.7 + nod * 0.3,
      gazeY: 9,
      tailTip: gesture(elapsed % 31700, 6200, 500, 300, 1000) * 6
    });
  }
  if (['sleeping', 'stopped'].includes(state))
    Object.assign(p, {
      head: state === 'sleeping' ? -8 : 6,
      headY: state === 'sleeping' ? 250 : 225,
      headScale: 0.8,
      body: 0.48,
      bodyWidth: 1.25,
      pawY: 897,
      tail: 45,
      blink: state === 'sleeping' ? 1 : 0.1,
      earL: 12,
      earR: -10,
      gazeY: 4
    });
  if (state === 'waiting')
    Object.assign(p, {
      head: 20,
      headY: 70 + gesture(t, 4800, 900, 900, 1500) * 12,
      body: 0.78,
      tail: 38,
      tailTip: look * 4,
      pawL: -5,
      pawR: -5,
      blink: 0.2 + blink * 0.8,
      gazeY: 7,
      earL: 10 + ear * 5,
      earR: -5
    });
  if (state === 'working')
    Object.assign(p, {
      head: 4 + look * 5,
      headY: -5,
      earL: -9,
      earR: 12 + ear * 12,
      tail: -12,
      pawL: 150,
      pawTurnL: 24,
      gazeX: -9,
      gazeY: -12,
      blink: blink * 0.55,
      tailTip: look * 7
    });
  if (state === 'making') {
    // Knead, settle, change paws: unequal timing and weight, with time to see
    // each press at 72px. No whole-image shake or constant-speed typing loop.
    const taps = [
      450, 1420, 2450, 3900, 5120, 6830, 8050, 9620, 11000, 12800, 14050, 15570, 17030, 18300, 20150, 21520, 23200,
      24750, 26400, 27980, 29700, 31110, 32850, 34020, 35770, 37140, 38700, 40520, 42000, 43570, 45300, 46750, 48520,
      49970, 51700, 52920, 54660, 55900
    ];
    const press = (start, i) =>
      gesture(t, start, 280 + (i % 3) * 55, 160 + (i % 2) * 80, 380) * (0.85 + (i % 3) * 0.08);
    const left = taps.reduce((v, start, i) => (i % 2 === 0 ? Math.max(v, press(start, i)) : v), 0);
    const right = taps.reduce((v, start, i) => (i % 2 ? Math.max(v, press(start, i)) : v), 0);
    Object.assign(p, {
      headY: 24 + Math.max(left, right) * 8,
      body: 0.94,
      earL: -8,
      earR: 6,
      tail: -20,
      tailTip: ear * 9,
      pawL: 25 + left * 110,
      pawR: 28 + right * 105,
      pawTurnL: -8 + left * 9,
      pawTurnR: 8 - right * 9,
      head: 7 - gesture(elapsed % 23900, 13500, 450, 1400, 700) * 8,
      gazeY: 15 - gesture(elapsed % 23900, 13500, 450, 1400, 700) * 19,
      blink: blink * 0.65
    });
  }
  if (state === 'celebrate') {
    const stretch = gesture(age, 70, 370, 450, 650);
    Object.assign(p, {
      head: 5,
      headY: -20 - stretch * 35,
      body: 1.04,
      earL: -12,
      earR: 12,
      tail: -30,
      tailTip: -8,
      pawL: 45 + stretch * 140,
      pawR: 45 + stretch * 140,
      pawTurnL: -stretch * 24,
      pawTurnR: stretch * 24,
      blink: Math.max(0.6, stretch)
    });
    p.jump = gesture(age, 500, 180, 100, 400) * 48;
  }
  if (state === 'error')
    Object.assign(p, {
      head: -7,
      headY: 35,
      body: 0.92,
      earL: 40,
      earR: -38,
      tail: 65,
      pawL: 58,
      pawTurnL: 12,
      gazeX: 10,
      gazeY: 5,
      blink: 0
    });
  if (state === 'resume') {
    const wake = gesture(age, 30, 500, 700, 900);
    Object.assign(p, {
      head: 12 - wake * 10,
      earL: -wake * 15,
      earR: wake * 15,
      tail: -18,
      headY: (1 - ease(age / 1800)) * 180,
      body: 1 + wake * 0.08,
      pawL: wake * 100,
      pawR: wake * 115,
      pawTurnL: -wake * 20,
      pawTurnR: wake * 22,
      blink: age < 350 ? 1 - ease(age / 350) : blink * 0.5
    });
  }
  if (state === 'idle') Object.assign(p, { head: 12 + look * 2, earL: ear * 15, tailTip: look * 5 });
  if (!['error', 'stopped'].includes(state)) p.breath = Math.sin((elapsed / 5100) * Math.PI * 2) * 0.006;
  if (!reduced && exit > 0) {
    const relax = ease(exit);
    p.head += (12 - p.head) * relax;
    p.pawL *= 1 - relax;
    p.pawR *= 1 - relax;
    p.tailTip *= 1 - relax;
  }
  return p;
}
export function paintKittenRig(ctx, width, height, pose, props = {}) {
  ctx.clearRect(0, 0, width, height);
  const { portrait, laptop, cushion } = props;
  if (!portrait || !(portrait.naturalWidth || portrait.width)) return;

  ctx.save();
  ctx.scale(width / 1000, height / 1000);
  if (pose.cushion && cushion?.naturalWidth) ctx.drawImage(cushion, 105, 763, 790, 225);

  const size = (pose.laptop ? 818 : 894) * pose.headScale;
  const weightShift = (pose.pawR - pose.pawL) * 0.12;
  ctx.save();
  ctx.translate(500 + pose.shiftX * 0.58 + weightShift, 493 + pose.headY * 0.42 - pose.jump * 0.62);
  ctx.rotate(((pose.head - 10) * 0.65 * Math.PI) / 180);
  ctx.scale(1, 1 + pose.breath);
  ctx.drawImage(portrait, -size / 2, -size / 2, size, size);
  ctx.restore();

  if (pose.laptop && laptop?.naturalWidth) ctx.drawImage(laptop, 35, 620, 530, 280);
  ctx.restore();
}
