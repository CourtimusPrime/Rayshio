import { DECELERATION } from './tokens';

/**
 * Where a flick would come to rest, given its release velocity.
 *
 * This is the exponential-decay form Apple ships, not the textbook v²/2a. The
 * textbook version lands consistently short, which makes a flick feel like it
 * was caught rather than thrown. Used to pick the target *before* animating, so
 * a fast flick commits even from a position that looks like it should not.
 */
export function project(velocity: number, deceleration = DECELERATION): number {
  return ((velocity / 1000) * deceleration) / (1 - deceleration);
}

/**
 * Progressive resistance past a boundary. Asymptotic: the further you pull, the
 * less it gives, and it never runs away. A hard stop reads as frozen; this
 * reads as responsive with nothing more to show.
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** Samples older than this are dropped before computing velocity. */
const WINDOW_MS = 100;
/** Below this span the sample is a single frame of noise, not a direction. */
const MIN_SPAN_MS = 16;

/**
 * Velocity over a short history rather than the last two events.
 *
 * Two reasons. A single frame's delta is noise. And — the one that actually
 * matters — a finger that has been resting for 200ms must read as zero, not as
 * whatever it was doing before it stopped. Without the staleness check, holding
 * a half-open drawer still and then letting go throws it off the screen.
 */
export class VelocityTracker {
  private samples: { t: number; p: number }[] = [];

  reset(t: number, p: number) {
    this.samples = [{ t, p }];
  }

  add(t: number, p: number) {
    this.samples.push({ t, p });
    let first = this.samples[0];
    while (this.samples.length > 2 && first && t - first.t > WINDOW_MS) {
      this.samples.shift();
      first = this.samples[0];
    }
  }

  /** Pixels per second at `now`, or 0 if the pointer has gone quiet. */
  velocity(now: number): number {
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    if (!first || !last) return 0;
    if (now - last.t > WINDOW_MS) return 0;
    const span = last.t - first.t;
    if (span < MIN_SPAN_MS) return 0;
    return ((last.p - first.p) / span) * 1000;
  }
}
