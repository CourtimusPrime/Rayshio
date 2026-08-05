import { useEffect, useRef, useState } from 'react';
import { useMotionPrefs } from './useMotionPrefs';

/** Long enough to read as motion, short enough not to delay the figure. */
const DURATION = 420;

/**
 * Animation props for a Recharts series.
 *
 * Recharts defaults to `isAnimationActive: true` with a 1500ms duration. That
 * is by some distance the longest motion in this app, it is not gated on
 * reduced motion, and ResponsiveContainer replays it on every resize.
 *
 * `once` is for the donut alone. Bar and Area interpolate their old geometry
 * into the new one when the data changes, which is a useful morph — you can see
 * where a value went. Pie instead sweeps from zero degrees every time, so
 * paging a month would redraw the whole ring from scratch.
 */
export function useChartMotion(once = false) {
  const { reduced } = useMotionPrefs();
  const [entered, setEntered] = useState(false);
  const timer = useRef<number>();

  useEffect(() => {
    timer.current = window.setTimeout(() => setEntered(true), DURATION + 60);
    return () => window.clearTimeout(timer.current);
  }, []);

  return {
    isAnimationActive: !reduced && !(once && entered),
    animationDuration: DURATION,
    animationEasing: 'ease-out' as const,
    animationBegin: 0,
  };
}
