import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Keeps Tab inside a dialog and returns focus to whatever opened it.
 *
 * `aria-modal="true"` asserts a modality the DOM does not enforce on its own:
 * without this, Tab walks straight out of the drawer into the page behind it,
 * which is still fully interactive.
 */
export function useFocusTrap(active: boolean, containerRef: RefObject<HTMLElement | null>) {
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    restoreTo.current = document.activeElement as HTMLElement | null;

    const container = containerRef.current;
    // the container itself, not its first control: a screen reader should
    // announce the dialog and its label before it announces a close button
    container?.focus({ preventScroll: true });

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !container) return;
      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      const first = items[0];
      const last = items[items.length - 1];

      if (!first || !last) {
        // nothing focusable yet (the drawer opens before its data arrives)
        event.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === container)
      ) {
        event.preventDefault();
        last.focus();
      }
    };

    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      const target = restoreTo.current;
      // Restore on close-request rather than after the exit animation: leaving
      // focus nowhere for the length of the exit loses screen readers entirely.
      // isConnected because the trigger may have re-rendered away by now.
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, [active, containerRef]);
}
