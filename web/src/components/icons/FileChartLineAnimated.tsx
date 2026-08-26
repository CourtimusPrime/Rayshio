import { type Variants, motion, useAnimationControls } from 'framer-motion';
import { forwardRef, useCallback, useImperativeHandle } from 'react';
import { useMotionPrefs } from '../../motion/useMotionPrefs';
import type { AnimatedIconHandle } from './handle';

/**
 * Lucide's `file-chart-line`, with the trend line drawing itself across the page.
 *
 * Ported from lucide-animated.com rather than added through `shadcn add`, for
 * the reason set out in [ReceiptTextAnimated]: the published component pulls in
 * `motion/react` and `@/lib/utils`, and taking it verbatim would put a second
 * copy of Motion next to `framer-motion`.
 */

const TREND: Variants = {
  rest: { pathLength: 1, opacity: 1 },
  draw: {
    pathLength: [0, 1],
    opacity: [0, 1],
    // The delay is the point: the page is already there, and the line arrives
    // onto it a beat later rather than with it.
    transition: { delay: 0.15, duration: 0.3, opacity: { delay: 0.1, duration: 0.15 } },
  },
};

interface Props {
  className?: string;
  strokeWidth?: number;
}

export const FileChartLineAnimated = forwardRef<AnimatedIconHandle, Props>(
  ({ className, strokeWidth = 1.75 }, ref) => {
    const controls = useAnimationControls();
    const { reduced } = useMotionPrefs();

    const play = useCallback(() => {
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
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
        <path d="M14 2v4a2 2 0 0 0 2 2h4" />
        <motion.path
          animate={controls}
          d="m8 17 2.5-2.5 2 2L16 13"
          initial="rest"
          variants={TREND}
        />
      </svg>
    );
  },
);

FileChartLineAnimated.displayName = 'FileChartLineAnimated';
