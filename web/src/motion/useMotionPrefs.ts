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
    /**
     * Pick between a moving value and a still one. The two are allowed to
     * differ in type: framer's `initial` takes either a target object or the
     * literal `false`, which means "start where you are meant to end up".
     */
    pick: <A, B>(moving: A, still: B): A | B => (reduced ? still : moving),
  };
}
