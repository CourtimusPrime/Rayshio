import { animate, useMotionValue, usePresence, useTransform } from 'framer-motion';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { VelocityTracker, project, rubberband } from './physics';
import { AXIS_THRESHOLD, FADE, FLICK_VELOCITY, SPRING } from './tokens';

interface Options {
  panelRef: RefObject<HTMLElement | null>;
  /** Called once the panel has finished travelling off screen. */
  onDismiss: () => void;
  /** False under reduced motion: there is no slide, so there is nothing to grab. */
  enabled: boolean;
}

/** Belt and braces — never strand a node in the DOM if a spring is interrupted. */
const REMOVE_BAIL_MS = 700;

/**
 * A right-hand drawer that can be dragged and thrown shut.
 *
 * The whole design rests on one thing: a single motion value owns `x` for the
 * entry, the drag and the exit. With framer's own `drag` prop those are three
 * separate animations on the same element, so a pointer-down during the entry
 * cannot pick it up — the gesture and the entry transition each think they own
 * the value. Here a pointer-down at any instant stops whatever spring is
 * running and starts tracking from wherever the panel currently is, carrying
 * its current velocity. That is what makes it interruptible rather than merely
 * animated.
 *
 * The other three reasons not to use `drag`: dragElastic is a constant factor
 * and never asymptotes, so it cannot rubber-band; dragMomentum runs framer's
 * inertia rather than Apple's projection, with no way to substitute it; and
 * the dismiss would hand off to AnimatePresence's `exit`, a fresh animation
 * starting at zero velocity, which puts a visible seam exactly where the
 * gesture should flow into the animation.
 */
export function useSwipeDrawer({ panelRef, onDismiss, enabled }: Options) {
  const [isPresent, safeToRemove] = usePresence();

  const x = useMotionValue(0);
  const opacity = useMotionValue(enabled ? 1 : 0);
  const width = useRef(0);
  const tracker = useRef(new VelocityTracker()).current;
  /** Set once a dismiss commits, so the exit effect does not re-animate. */
  const dismissing = useRef(false);
  const [dragging, setDragging] = useState(false);

  const grab = useRef<{
    id: number;
    px: number;
    py: number;
    /** x at the moment of the grab — this is what honours where they grabbed. */
    origin: number;
    axis: 'undecided' | 'x' | 'y';
  } | null>(null);

  /** Scrim opacity from the same value, so it fades 1:1 with the finger. */
  const scrimOpacity = useTransform(x, (value) => {
    const w = width.current;
    if (!w) return 1;
    return 1 - Math.min(Math.max(value / w, 0), 1);
  });

  // Measure, then run the entry from off screen. Layout effect so the panel is
  // never painted at x: 0 for a frame before being moved out.
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;

    const measure = () => {
      width.current = el.offsetWidth || window.innerWidth;
    };
    measure();

    if (!enabled) {
      // reduced motion: no travel, just a short cross-fade
      x.jump(0);
      opacity.jump(0);
      const controls = animate(opacity, 1, FADE);
      return () => controls.stop();
    }

    x.jump(width.current);
    const controls = animate(x, 0, SPRING.surface);
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      controls.stop();
      observer.disconnect();
    };
  }, [enabled, opacity, panelRef, x]);

  /*
   * Exit. Runs from wherever x currently is, carrying its current velocity, so
   * closing by Escape, by the backdrop, or by letting go mid-drag all leave
   * along the path they arrived on rather than snapping to a start position.
   */
  useEffect(() => {
    if (isPresent) return;
    if (dismissing.current) {
      // the gesture already animated it off screen and called onDismiss
      safeToRemove?.();
      return;
    }

    const controls = enabled
      ? animate(x, width.current || window.innerWidth, {
          ...SPRING.surface,
          velocity: x.getVelocity(),
        })
      : animate(opacity, 0, FADE);

    let done = false;
    controls.then(() => {
      done = true;
      safeToRemove?.();
    });
    const bail = window.setTimeout(() => {
      if (!done) safeToRemove?.();
    }, REMOVE_BAIL_MS);

    return () => {
      controls.stop();
      window.clearTimeout(bail);
    };
  }, [enabled, isPresent, opacity, safeToRemove, x]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || event.button !== 0 || grab.current) return;
      // never hijack a drag that starts on a control or on selectable text
      if ((event.target as HTMLElement).closest('a,button,input,select,textarea')) return;

      // stop whatever spring is running; x keeps its current on-screen value
      x.stop();
      event.currentTarget.setPointerCapture(event.pointerId);
      grab.current = {
        id: event.pointerId,
        px: event.clientX,
        py: event.clientY,
        origin: x.get(),
        axis: 'undecided',
      };
      tracker.reset(event.timeStamp, event.clientX);
    },
    [enabled, tracker, x],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const g = grab.current;
      if (!g || g.id !== event.pointerId) return;

      const dx = event.clientX - g.px;
      const dy = event.clientY - g.py;

      if (g.axis === 'undecided') {
        // Watch both directions at once and drop the loser only when intent is
        // clear. Below the threshold nothing moves, so a vertical scroll inside
        // the panel is never stolen by a horizontal gesture that isn't one.
        if (Math.abs(dx) < AXIS_THRESHOLD && Math.abs(dy) < AXIS_THRESHOLD) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          g.axis = 'y';
          event.currentTarget.releasePointerCapture(event.pointerId);
          grab.current = null;
          return;
        }
        g.axis = 'x';
        setDragging(true);
      }

      tracker.add(event.timeStamp, event.clientX);

      const raw = g.origin + dx;
      // past the open edge there is nothing more to reveal, so resist rather
      // than stop dead
      x.set(raw < 0 ? rubberband(raw, width.current || window.innerWidth) : raw);
    },
    [tracker, x],
  );

  const end = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const g = grab.current;
      if (!g || g.id !== event.pointerId) return;
      grab.current = null;
      setDragging(false);
      if (g.axis !== 'x') return;

      const w = width.current || window.innerWidth;
      const velocity = tracker.velocity(event.timeStamp);
      const flick = Math.abs(velocity) > FLICK_VELOCITY;

      /*
       * Decide by the sign of the velocity, not by position. A drawer pulled
       * 80% of the way out and then flicked back must come back, however far
       * out it is; one barely moved but thrown hard must go. Only when there is
       * no meaningful velocity does position decide — and then via the
       * projected resting point, not the release point.
       */
      const dismiss = flick ? velocity > 0 : x.get() + project(velocity) > w / 2;

      if (dismiss) {
        dismissing.current = true;
        // bounce would happen off screen and only delay the unmount
        animate(x, w, { ...SPRING.surface, velocity }).then(onDismiss);
      } else {
        // a flick back earned its overshoot; a slow drag back did not
        animate(x, 0, { ...(flick ? SPRING.momentum : SPRING.ui), velocity });
      }
    },
    [onDismiss, tracker, x],
  );

  return {
    x,
    opacity,
    scrimOpacity,
    dragging,
    /**
     * False from the moment a close is requested rather than at unmount, so the
     * caller can release modality without waiting out the exit animation.
     */
    isPresent,
    handlers: enabled
      ? { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end }
      : {},
  };
}
