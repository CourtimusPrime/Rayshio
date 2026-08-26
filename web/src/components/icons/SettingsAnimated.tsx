import { motion, useAnimationControls } from 'framer-motion';
import { forwardRef, useCallback, useImperativeHandle } from 'react';
import { useMotionPrefs } from '../../motion/useMotionPrefs';
import type { AnimatedIconHandle } from './handle';

/**
 * Lucide's `settings`, with the cog turning once.
 *
 * Ported from lucide-animated.com rather than added through `shadcn add` — see
 * [ReceiptTextAnimated] for why this project does not adopt those files
 * directly.
 *
 * **A full turn, not the registry's half turn.** That version rotates to 180°
 * and stays there until a mouse-leave puts it back, which needs a stop call the
 * rail never makes — the cog would sit visibly upside down after one hover.
 * 360° ends exactly where it started, so a single play is self-cleaning.
 */

interface Props {
  className?: string;
  strokeWidth?: number;
}

export const SettingsAnimated = forwardRef<AnimatedIconHandle, Props>(
  ({ className, strokeWidth = 1.75 }, ref) => {
    const controls = useAnimationControls();
    const { reduced } = useMotionPrefs();

    const play = useCallback(() => {
      if (reduced) return;
      // A spring would overshoot past 360° and settle backwards into it, which
      // on a cog reads as the tooth count changing. A fixed ease turns once.
      void controls.start({ rotate: 360, transition: { duration: 0.7, ease: 'easeInOut' } });
    }, [controls, reduced]);

    useImperativeHandle(ref, () => ({ play }), [play]);

    return (
      <motion.svg
        animate={controls}
        aria-hidden="true"
        className={className}
        fill="none"
        // Reset between plays: without this the second hover animates from 360
        // to 360 — a no-op — and the cog never turns again.
        onAnimationComplete={() => controls.set({ rotate: 0 })}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </motion.svg>
    );
  },
);

SettingsAnimated.displayName = 'SettingsAnimated';
