import { useReducedMotion } from 'framer-motion';
import { FADE, SPRING } from './tokens';

/**
 * The single place that answers "may I move things?".
 *
 * framer's `useReducedMotion` subscribes to the media query. Reading
 * `matchMedia(...).matches` imperatively inside an effect — which is what this
 * app used to do in one component and nowhere else — does not: change the OS
 * setting mid-session and the app keeps animating until something unrelated
 * happens to re-render.
 */
export function useMotionPrefs() {
  const reduced = useReducedMotion() ?? false;

  return {
    reduced,
    /** A named spring, or the flat cross-fade when motion is unwelcome. */
    spring: (key: keyof typeof SPRING = 'ui') => (reduced ? FADE : SPRING[key]),
    /** Pick between a moving value and a still one. */
    pick: <T>(moving: T, still: T): T => (reduced ? still : moving),
  };
}
