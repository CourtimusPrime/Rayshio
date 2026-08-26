import { type Variants, motion, useAnimationControls } from 'framer-motion';
import { forwardRef, useCallback, useImperativeHandle } from 'react';
import { useMotionPrefs } from '../../motion/useMotionPrefs';
import type { AnimatedIconHandle } from './handle';

/**
 * Lucide's `layout-grid`, with the four tiles rotating once around the square
 * and returning to where they started.
 *
 * Ported from lucide-animated.com's shadcn registry item for the same reason as
 * the other two: that component imports `motion/react` and `@/lib/utils`, and
 * taking it verbatim would mean a second copy of Motion beside `framer-motion`.
 *
 * Each tile carries its own keyframe list rather than sharing one with a
 * rotation applied, because the four move along different axes — two
 * horizontally, two vertically — and the `times` array holds them still in the
 * swapped position for the middle fifth of the run, which is what makes it read
 * as tiles changing places rather than four things drifting.
 */

/** 11 user units: one tile (7) plus the gap (4), so a tile lands exactly on its neighbour. */
const STEP = 11;

const shuffle = (x: number, y: number): Variants => ({
  rest: { translateX: 0, translateY: 0 },
  move: {
    translateX: [0, x, x, 0],
    translateY: [0, y, y, 0],
    transition: { duration: 0.8, ease: 'easeInOut', times: [0, 0.4, 0.6, 1] },
  },
});

const TILES = [
  { x: 3, y: 3, variants: shuffle(STEP, 0) },
  { x: 14, y: 3, variants: shuffle(0, STEP) },
  { x: 14, y: 14, variants: shuffle(-STEP, 0) },
  { x: 3, y: 14, variants: shuffle(0, -STEP) },
];

interface Props {
  className?: string;
  strokeWidth?: number;
}

export const LayoutGridAnimated = forwardRef<AnimatedIconHandle, Props>(
  ({ className, strokeWidth = 1.75 }, ref) => {
    const controls = useAnimationControls();
    const { reduced } = useMotionPrefs();

    const play = useCallback(() => {
      // Nothing to settle under reduced motion: the tiles' resting state is
      // also their start and end, so the honest response is to not move them.
      if (reduced) return;
      void controls.start('move');
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
        {TILES.map((tile) => (
          <motion.rect
            key={`${tile.x}-${tile.y}`}
            animate={controls}
            height="7"
            initial="rest"
            rx="1"
            variants={tile.variants}
            width="7"
            x={tile.x}
            y={tile.y}
          />
        ))}
      </svg>
    );
  },
);

LayoutGridAnimated.displayName = 'LayoutGridAnimated';
