import { type Variants, motion, useAnimationControls } from 'framer-motion';
import { forwardRef, useCallback, useImperativeHandle } from 'react';
import { useMotionPrefs } from '../../motion/useMotionPrefs';
import type { AnimatedIconHandle } from './handle';

/**
 * Lucide's `terminal`, with the prompt line blinking like a cursor.
 *
 * Ported from lucide-animated.com rather than added through `shadcn add` — see
 * [ReceiptTextAnimated] for why.
 *
 * **Bounded, unlike the registry version.** That one blinks with
 * `repeat: Infinity` and relies on a mouse-leave handler to stop it. The tabs
 * here only ever get a "play" — there is no stop — so an infinite repeat would
 * leave one nav item flashing for the rest of the session after a single
 * hover. Two blinks reads as a cursor and then stops on its own.
 */

const CURSOR: Variants = {
  rest: { opacity: 1 },
  blink: {
    opacity: [1, 0, 1, 0, 1],
    transition: { duration: 0.8, ease: 'linear', times: [0, 0.25, 0.5, 0.75, 1] },
  },
};

interface Props {
  className?: string;
  strokeWidth?: number;
}

export const TerminalAnimated = forwardRef<AnimatedIconHandle, Props>(
  ({ className, strokeWidth = 1.75 }, ref) => {
    const controls = useAnimationControls();
    const { reduced } = useMotionPrefs();

    const play = useCallback(() => {
      // A blink is pure flashing — precisely what reduced motion is asking us
      // not to do — so it is skipped entirely rather than shortened.
      if (reduced) return;
      void controls.start('blink');
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
        <polyline points="4 17 10 11 4 5" />
        <motion.line
          animate={controls}
          initial="rest"
          variants={CURSOR}
          x1="12"
          x2="20"
          y1="19"
          y2="19"
        />
      </svg>
    );
  },
);

TerminalAnimated.displayName = 'TerminalAnimated';
