import { type Variants, motion, useAnimationControls } from 'framer-motion';
import { forwardRef, useCallback, useImperativeHandle } from 'react';
import { useMotionPrefs } from '../../motion/useMotionPrefs';
import type { AnimatedIconHandle } from './handle';

/**
 * Lucide's `hand-coins`, with the two coins dropping into the hand.
 *
 * Ported from lucide-animated.com's shadcn registry item for the same reason as
 * [ReceiptTextAnimated]: the published component imports `motion/react` and
 * `@/lib/utils`, and adopting it verbatim would put a second copy of Motion in
 * the bundle alongside `framer-motion`.
 *
 * The second coin is delayed 0.15s rather than staggered by a parent, matching
 * the original — the two coins are different sizes and land in different
 * places, so they read as two separate arrivals rather than one group.
 */

const COIN: Variants = {
  rest: {
    translateY: 0,
    opacity: 1,
    transition: { opacity: { duration: 0.2 }, type: 'spring', stiffness: 150, damping: 15 },
  },
  drop: {
    opacity: [0, 1],
    translateY: [-20, 0],
    transition: { opacity: { duration: 0.2 }, type: 'spring', stiffness: 150, damping: 15 },
  },
};

const COIN_DELAYED: Variants = {
  rest: {
    translateY: 0,
    opacity: 1,
    transition: {
      opacity: { duration: 0.2 },
      delay: 0.15,
      type: 'spring',
      stiffness: 150,
      damping: 15,
    },
  },
  drop: {
    opacity: [0, 1],
    translateY: [-20, 0],
    transition: {
      opacity: { duration: 0.2 },
      delay: 0.15,
      type: 'spring',
      stiffness: 150,
      damping: 15,
    },
  },
};

interface Props {
  className?: string;
  strokeWidth?: number;
}

export const HandCoinsAnimated = forwardRef<AnimatedIconHandle, Props>(
  ({ className, strokeWidth = 1.75 }, ref) => {
    const controls = useAnimationControls();
    const { reduced } = useMotionPrefs();

    const play = useCallback(() => {
      // Reduced motion: the coins must still be *there*, so settle them rather
      // than skipping the call and risking a half-dropped resting state.
      if (reduced) {
        controls.set('rest');
        return;
      }
      // No `await` chain here: the drop starts from an explicit keyframe list
      // (-20 → 0), so it does not need a wipe first, and a re-hover mid-flight
      // simply restarts from the top.
      void controls.start('drop');
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
        {/* The hand stays put — it is what makes the tab recognisable. */}
        <path d="M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17" />
        <path d="m7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9" />
        <path d="m2 16 6 6" />
        <motion.circle animate={controls} cx="16" cy="9" r="2.9" initial="rest" variants={COIN} />
        <motion.circle
          animate={controls}
          cx="6"
          cy="5"
          r="3"
          initial="rest"
          variants={COIN_DELAYED}
        />
      </svg>
    );
  },
);

HandCoinsAnimated.displayName = 'HandCoinsAnimated';
