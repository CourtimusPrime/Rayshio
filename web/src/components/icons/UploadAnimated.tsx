import { type Variants, motion, useAnimationControls } from 'framer-motion';
import { forwardRef, useCallback, useImperativeHandle } from 'react';
import { useMotionPrefs } from '../../motion/useMotionPrefs';
import type { AnimatedIconHandle } from './handle';

/**
 * Lucide's `upload`, with the arrow lifting out of the tray and settling back.
 *
 * Ported from lucide-animated.com rather than added through `shadcn add` — see
 * [ReceiptTextAnimated] for why this project does not adopt those files
 * directly.
 *
 * **Out and back, not out and held.** The registry version lifts to y: -2 and
 * stays there until a mouse-leave returns it, which needs a stop call this
 * button never makes — the arrow would sit detached from the tray afterwards,
 * reading as a misaligned icon rather than an animation. One lift that returns
 * to rest is self-cleaning.
 */

const ARROW: Variants = {
  rest: { y: 0 },
  lift: {
    y: [0, -3, 0],
    transition: { duration: 0.5, ease: 'easeOut', times: [0, 0.4, 1] },
  },
};

interface Props {
  className?: string;
  strokeWidth?: number;
}

export const UploadAnimated = forwardRef<AnimatedIconHandle, Props>(
  ({ className, strokeWidth = 1.75 }, ref) => {
    const controls = useAnimationControls();
    const { reduced } = useMotionPrefs();

    const play = useCallback(() => {
      if (reduced) return;
      void controls.start('lift');
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
        {/* The tray stays put; only what is being uploaded moves. */}
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <motion.g animate={controls} initial="rest" variants={ARROW}>
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" x2="12" y1="3" y2="15" />
        </motion.g>
      </svg>
    );
  },
);

UploadAnimated.displayName = 'UploadAnimated';
