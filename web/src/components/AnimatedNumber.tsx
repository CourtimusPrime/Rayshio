import { animate } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { formatCurrency } from '../utils/format';

/**
 * Counts between values when the underlying figure changes (e.g. paging to
 * another month), so the numbers move with the charts rather than snapping.
 *
 * The tween writes to the DOM node directly instead of through state: at 60fps a
 * setState per frame would re-render the whole card, and several of these are on
 * screen at once.
 */

const DURATION = 0.55;
const EASE = [0.22, 1, 0.36, 1] as const;

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function useCountTo(value: number, format: (n: number) => string) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef(value);
  // format is typically an inline closure; keeping it in a ref stops a new
  // identity from restarting the tween on every render
  const formatRef = useRef(format);
  formatRef.current = format;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const from = previous.current;
    previous.current = value;

    if (from === value) return;
    if (prefersReducedMotion()) {
      node.textContent = formatRef.current(value);
      return;
    }

    const controls = animate(from, value, {
      duration: DURATION,
      ease: EASE,
      onUpdate: (v) => {
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
