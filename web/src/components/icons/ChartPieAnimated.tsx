import { type Variants, motion, useAnimationControls } from 'framer-motion';
import { forwardRef, useCallback, useImperativeHandle } from 'react';
import { useMotionPrefs } from '../../motion/useMotionPrefs';
import type { AnimatedIconHandle } from './handle';

/**
 * Lucide's `chart-pie`, with the slice pulling out of the pie and settling back.
 *
 * Ported from lucide-animated.com rather than added through `shadcn add` — see
 * [ReceiptTextAnimated] for why this project does not adopt those files
 * directly.
 *
 * The registry version leaves the slice *out* (it moves on hover and back on
 * mouse-leave). Here it is a single spring out-and-back, because the tab plays
 * once on hover and never gets a "stop" call — a slice that stayed displaced
 * would look like a rendering fault to anyone who moved the pointer away
 * quickly.
 */

const SLICE: Variants = {
  rest: { translateX: 0, translateY: 0 },
  pull: {
    translateX: [0, 1.4, 0],
    translateY: [0, -1.4, 0],
    transition: { duration: 0.6, ease: 'easeOut', times: [0, 0.45, 1] },
  },
};

interface Props {
  className?: string;
  strokeWidth?: number;
}

export const ChartPieAnimated = forwardRef<AnimatedIconHandle, Props>(
  ({ className, strokeWidth = 1.75 }, ref) => {
    const controls = useAnimationControls();
    const { reduced } = useMotionPrefs();

    const play = useCallback(() => {
      if (reduced) return;
      void controls.start('pull');
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
        <motion.path
          animate={controls}
          d="M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z"
          initial="rest"
          variants={SLICE}
        />
        <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      </svg>
    );
  },
);

ChartPieAnimated.displayName = 'ChartPieAnimated';
