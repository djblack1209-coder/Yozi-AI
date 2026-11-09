import { describe, it, expect } from 'vitest';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { kittenPoseAt, paintKittenRig } from '../../src/design/kitten-rig.js';
import { AVATAR_STATES, avatarStateFor, avatarBusinessForLearning } from '../../src/design/avatar-state.js';
describe('task kitten articulation', () => {
  it('error wins over stale completion; a running assessment is visibly processing', () => {
    expect(avatarStateFor({ error: true, completed: true })).toBe('error');
    expect(avatarStateFor({ busy: true, completed: true })).toBe('working');
    const learning = {
      busy: true,
      retryState: { requestId: 'current' },
      active: { coach: { requests: [{ id: 'current', request: { phase: 'essay' } }] } }
    };
    expect(avatarStateFor(avatarBusinessForLearning(learning))).toBe('making');
    expect(avatarStateFor(avatarBusinessForLearning({ busy: false }, { id: 'saved', type: 'coach.result' }))).toBe(
      'idle'
    );
  });
  it('poses differ by ears, paws and tail and still differ with reduced motion', () => {
    const states = [
      'idle',
      'waiting',
      'working',
      'making',
      'celebrate',
      'error',
      'resume',
      'dozing',
      'sleeping',
      'stopped'
    ];
    const poses = states.map((state) => kittenPoseAt(900, state, { age: 900 }));
    expect(new Set(poses.map((p) => JSON.stringify(p))).size).toBe(states.length);
    expect(poses[1].headY).toBeGreaterThan(poses[0].headY);
    expect(poses[2].pawL).toBeGreaterThan(poses[0].pawL);
    expect(poses[5].earL).toBeGreaterThan(poses[0].earL);
    expect(new Set(states.map((state) => JSON.stringify(kittenPoseAt(0, state, { reduced: true })))).size).toBe(
      states.length
    );
  });
  it.each(AVATAR_STATES)('%s freezes in a recognizable pose with reduced motion', (state) => {
    expect(kittenPoseAt(99999, state, { reduced: true })).toEqual(kittenPoseAt(0, state, { reduced: true }));
  });
  it('uses irregular short paw bursts with quiet gaps and a settling completion', () => {
    const at = (t) => kittenPoseAt(t, 'making');
    expect(at(820).pawL).toBeGreaterThan(at(2200).pawL);
    expect(at(1800).pawR).toBeGreaterThan(at(2200).pawR);
    expect(kittenPoseAt(700, 'celebrate', { age: 700 }).pawL).toBeGreaterThan(
      kittenPoseAt(4000, 'celebrate', { age: 4000 }).pawL
    );
  });
  it.each(AVATAR_STATES)('%s renders transparent Pudding with orange fur and a blue cap', async (state) => {
    const canvas = createCanvas(144, 144),
      ctx = canvas.getContext('2d');
    const portrait = await loadImage('src/static/brand/kitten-avatar.png');
    paintKittenRig(ctx, 144, 144, kittenPoseAt(900, state, { age: 900 }), { portrait });
    const rgba = ctx.getImageData(0, 0, 144, 144).data;
    expect(rgba[3]).toBe(0);
    expect(rgba[rgba.length - 1]).toBe(0);
    let orange = 0,
      blue = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      const [r, g, b, a] = rgba.subarray(i, i + 4);
      if (a > 240 && r > 140 && r > b + 45) orange++;
      if (a > 240 && b > 100 && b > r + 50 && b > g + 40) blue++;
    }
    expect(orange).toBeGreaterThan(1200);
    expect(blue).toBeGreaterThan(600);
  });
});
