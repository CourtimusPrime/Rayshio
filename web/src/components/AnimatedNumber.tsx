import { animate, useReducedMotion } from 'framer-motion';
import { useLayoutEffect, useRef } from 'react';
import { SPRING } from '../motion/tokens';
import { formatCurrency } from '../utils/format';

/**
 * Counts between values when the underlying figure changes (e.g. paging to
 * another month), so the numbers move with the charts rather than snapping.
 *
 * The tween writes to the DOM node directly instead of through state: at 60fps a
 * setState per frame would re-render the whole card, and several of these are on
 * screen at once.
 */

/** Slightly longer than the UI default: a figure needs to stay readable. */
const COUNT_DURATION = 0.45;

function useCountTo(value: number, format: (n: number) => string) {
  const ref = useRef<HTMLSpanElement>(null);
  /**
   * What is on screen right now, not the last target. Updated every frame from
   * the tween. Paging months faster than the animation settles used to restart
   * from the previous *target*, so the figure jumped backwards mid-count; an
   * interrupted animation has to resume from the presentation value.
   */
  const displayed = useRef(value);
  // format is typically an inline closure; keeping it in a ref stops a new
  // identity from restarting the tween on every render
  const formatRef = useRef(format);
  formatRef.current = format;

  const reduced = useReducedMotion() ?? false;
  // in a ref so flipping the preference mid-count affects the next tween rather
  // than restarting the one in flight
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  /*
   * Layout effect, not effect. The component renders {format(value)} as its
   * children, so React has already written the *final* figure into the node by
   * the time this runs. An ordinary effect fires after paint, which shows that
   * final value for one frame before the tween starts — a visible snap to the
   * answer followed by a count towards it.
   */
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const from = displayed.current;
    if (from === value) return;

    if (reducedRef.current) {
      displayed.current = value;
      node.textContent = formatRef.current(value);
      return;
    }

    // undo React's write before the browser paints; the tween owns it from here
    node.textContent = formatRef.current(from);

    const controls = animate(from, value, {
      // SPRING.ui is critically damped, which is not a stylistic choice here:
      // a spring that overshoots would briefly render a figure the data never
      // contained. A count-up must not show a number that is not a number.
      ...SPRING.ui,
      visualDuration: COUNT_DURATION,
      onUpdate: (v) => {
        displayed.current = v;
        node.textContent = formatRef.current(v);
      },
    });
    return () => controls.stop();
  }, [value]);

  return ref;
}

export function AnimatedCurrency({
  value,
  currency,
  compact = false,
}: {
  value: number;
  currency: string;
  compact?: boolean;
}) {
  const format = (n: number) => formatCurrency(Math.round(n), currency, compact);
  const ref = useCountTo(value, format);
  // rendered once on mount; the tween owns textContent afterwards
  return <span ref={ref}>{format(value)}</span>;
}

export function AnimatedCount({ value, suffix = '' }: { value: number; suffix?: string }) {
  const format = (n: number) => `${Math.round(n)}${suffix}`;
  const ref = useCountTo(value, format);
  return <span ref={ref}>{format(value)}</span>;
}
