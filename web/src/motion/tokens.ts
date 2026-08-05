import type { Transition } from 'framer-motion';

/**
 * Apple describes a spring with two designer-facing numbers rather than the
 * physics triplet, and both map onto Motion's API:
 *
 *   damping ratio → `bounce`          (bounce = 1 − dampingRatio, so 1.0 → 0)
 *   response      → `visualDuration`  (time to visually reach the target)
 *
 * `visualDuration`, not `duration`. With `duration`, adding bounce steals time
 * from the travel, so a bouncy spring reaches its target *later* than a stiff
 * one of the same nominal length — which is not what "response" means.
 * `visualDuration` fixes the travel time and lets the settle happen after it.
 *
 * A spring rather than a fixed curve because a spring animates from wherever
 * the value currently is. New input just moves the target; the motion stays
 * continuous instead of restarting from a jump.
 */
export const SPRING = {
  /** The default. Anything the interface initiates. Critically damped. */
  ui: { type: 'spring', visualDuration: 0.35, bounce: 0 },
  /** Small local changes: chevrons, chips, an accordion opening. */
  quick: { type: 'spring', visualDuration: 0.26, bounce: 0 },
  /** Large surfaces the user did not throw — the drawer arriving on its own. */
  surface: { type: 'spring', visualDuration: 0.4, bounce: 0 },
  /**
   * Reserved for gesture releases. Overshoot is only honest when a flick
   * preceded it: bounce on a panel that merely faded in reads as a wobble,
   * bounce on something you threw reads as physics. Never use for a state
   * change.
   */
  momentum: { type: 'spring', visualDuration: 0.35, bounce: 0.2 },
} satisfies Record<string, Transition>;

/** What every reduced-motion path degrades to: a short, flat cross-fade. */
export const FADE = { duration: 0.15, ease: 'linear' } satisfies Transition;

/**
 * Apple's scroll deceleration rate, from the Designing Fluid Interfaces sample
 * code. 0.998 is the normal scroll feel; lower is snappier.
 */
export const DECELERATION = 0.998;

/** Release speed (px/s) above which the velocity *sign* decides the outcome. */
export const FLICK_VELOCITY = 300;

/** Movement (px) before a drag commits to an axis. */
export const AXIS_THRESHOLD = 10;
