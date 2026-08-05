import { describe, expect, it } from 'vitest';
import { VelocityTracker, project, rubberband } from '../../web/src/motion/physics.js';

describe('project', () => {
  it('scales with velocity and lands far enough to feel thrown', () => {
    // Apple's exponential-decay form. The textbook v²/2a lands roughly an order
    // of magnitude shorter, which reads as the flick being caught.
    expect(project(1000)).toBeCloseTo(499, 0);
    expect(project(2000)).toBeCloseTo(998, 0);
  });

  it('is signed, so a backwards flick projects backwards', () => {
    expect(project(-1000)).toBeCloseTo(-499, 0);
  });

  it('is zero at rest', () => {
    expect(project(0)).toBe(0);
  });

  it('lands shorter as the deceleration rate drops', () => {
    expect(Math.abs(project(1000, 0.99))).toBeLessThan(Math.abs(project(1000, 0.998)));
  });
});

describe('rubberband', () => {
  it('resists sub-linearly — twice the pull gives less than twice the travel', () => {
    const near = rubberband(100, 500);
    const far = rubberband(200, 500);
    expect(far).toBeLessThan(2 * near);
  });

  it('never exceeds the pull', () => {
    for (const overshoot of [10, 100, 500, 5000]) {
      expect(rubberband(overshoot, 500)).toBeLessThan(overshoot);
    }
  });

  it('is asymptotic rather than runaway', () => {
    // a hard stop reads as frozen; unbounded following reads as broken
    expect(rubberband(100_000, 500)).toBeLessThan(500);
  });

  it('preserves sign and passes zero through', () => {
    expect(rubberband(-100, 500)).toBeCloseTo(-rubberband(100, 500), 6);
    expect(rubberband(0, 500)).toBe(0);
  });
});

describe('VelocityTracker', () => {
  it('measures px/s across the sample window', () => {
    const t = new VelocityTracker();
    t.reset(0, 0);
    t.add(20, 20);
    t.add(40, 40);
    t.add(60, 60); // 1px/ms
    expect(t.velocity(60)).toBeCloseTo(1000, 0);
  });

  it('reports zero once the pointer has gone quiet', () => {
    // the load-bearing case: hold a half-open drawer still, then let go. Without
    // this the stale velocity throws it off screen.
    const t = new VelocityTracker();
    t.reset(0, 0);
    t.add(20, 40);
    t.add(40, 80);
    expect(t.velocity(40)).toBeGreaterThan(0);
    expect(t.velocity(400)).toBe(0);
  });

  it('ignores a single frame, which is noise rather than a direction', () => {
    const t = new VelocityTracker();
    t.reset(0, 0);
    t.add(8, 30);
    expect(t.velocity(8)).toBe(0);
  });

  it('drops samples older than the window so a reversal reads as a reversal', () => {
    const t = new VelocityTracker();
    t.reset(0, 0);
    // travelling forwards...
    for (let i = 1; i <= 10; i++) t.add(i * 20, i * 20);
    expect(t.velocity(200)).toBeGreaterThan(0);
    // ...then back the other way, faster
    for (let i = 1; i <= 5; i++) t.add(200 + i * 20, 200 - i * 40);
    expect(t.velocity(300)).toBeLessThan(0);
  });

  it('reports zero before any movement', () => {
    const t = new VelocityTracker();
    t.reset(0, 0);
    expect(t.velocity(0)).toBe(0);
  });
});
