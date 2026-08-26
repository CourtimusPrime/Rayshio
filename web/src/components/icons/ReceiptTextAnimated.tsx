import { type Variants, motion, useAnimationControls } from 'framer-motion';
import { forwardRef, useCallback, useImperativeHandle } from 'react';
import { useMotionPrefs } from '../../motion/useMotionPrefs';
import type { AnimatedIconHandle } from './handle';

/**
 * Lucide's `receipt-text`, with its three text lines drawing themselves in.
 *
 * Ported from lucide-animated.com's shadcn registry item rather than installed
 * through `shadcn add`. That command wanted three things this project does not
 * have and should not grow for one icon: a `components.json`, the `@/lib/utils`
 * `cn` helper, and the `motion` package — which is the same library as the
 * `framer-motion` already in `package.json`, so installing it would mean two
 * copies of Motion in the bundle and two `MotionConfig` contexts that cannot
 * see each other.
 *
 * **Each line is driven directly, not through a parent `<motion.g>`.** The
 * registry version staggers children from a container variant, and ported onto
 * framer-motion 11 that propagation silently does nothing here: the container's
 * variants carry only a `transition`, no animatable value, and the paths never
 * receive the change — verified in a browser, where hovering wrote no
 * `strokeDasharray` at all and the icon simply sat there. Per-path keyframes
 * with an explicit delay produce the same staggered redraw and cannot fail
 * quietly.
 */

/** Same shape for all three lines; only the delay differs, top to bottom. */
const line = (delay: number): Variants => ({
  rest: { pathLength: 1, opacity: 1 },
  draw: {
    pathLength: [0, 1],
    opacity: [0, 1],
    transition: { delay, duration: 0.35, ease: 'easeOut', opacity: { duration: 0.15, delay } },
  },
});

const LINES = [
  { d: 'M8 8H14', variants: line(0) },
  { d: 'M8 12H16', variants: line(0.1) },
  { d: 'M8 16H13', variants: line(0.2) },
];

interface Props {
  className?: string;
  strokeWidth?: number;
}

export const ReceiptTextAnimated = forwardRef<AnimatedIconHandle, Props>(
  ({ className, strokeWidth = 1.75 }, ref) => {
    const controls = useAnimationControls();
    const { reduced } = useMotionPrefs();

    const play = useCallback(() => {
      // The lines' resting state is also where the animation ends, so under
      // reduced motion the honest response is to leave them alone.
      if (reduced) return;
      void controls.start('draw');
    }, [controls, reduced]);

    useImperativeHandle(ref, () => ({ play }), [play]);

    return (
      <svg
        aria-hidden="true"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* The receipt body never animates: it is the shape you recognise the
            tab by, and redrawing it would read as the icon reloading. */}
        <path d="M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z" />
        {LINES.map(({ d, variants }) => (
          <motion.path key={d} animate={controls} d={d} initial="rest" variants={variants} />
        ))}
      </svg>
    );
  },
);

ReceiptTextAnimated.displayName = 'ReceiptTextAnimated';
