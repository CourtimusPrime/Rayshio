import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { useMotionPrefs } from '../motion/useMotionPrefs';

/**
 * The only motion on the marketing pages: a section fades up as it arrives.
 *
 * It borrows the app's existing vocabulary rather than inventing a marketing
 * one — `SPRING.ui` via `useMotionPrefs`, and a 12px displacement, which is the
 * same small-travel value the dashboard uses. No parallax, no scroll-scrubbing,
 * no animated counters: this page sits in front of a dense, quiet product and
 * should not promise a different one.
 *
 * `once: true` because a section that re-animates every time it re-enters the
 * viewport turns scrolling back up into a distraction.
 */
export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const { pick, spring } = useMotionPrefs();

  return (
    <motion.div
      className={className}
      initial={pick({ opacity: 0, y: 12 }, false)}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-64px' }}
      transition={{ ...spring('ui'), delay }}
    >
      {children}
    </motion.div>
  );
}
