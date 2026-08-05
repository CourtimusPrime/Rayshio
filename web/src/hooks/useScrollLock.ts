import { useEffect } from 'react';

/**
 * Stops the page behind a modal from scrolling.
 *
 * Two containers, because this app has two. On desktop the scroller is the
 * element marked `data-scroll-container` in App.tsx; below md the document
 * scrolls instead. Locking only one leaves the other free, and which one is
 * live depends on the viewport.
 */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const root = document.documentElement;
    const container = document.querySelector<HTMLElement>('[data-scroll-container]');

    // compensate for the scrollbar disappearing, or the layout jumps sideways
    // the instant the drawer opens
    const gap = window.innerWidth - root.clientWidth;

    const previousOverflow = container?.style.overflow ?? '';
    root.classList.add('scroll-locked');
    if (container) container.style.overflow = 'hidden';
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;

    return () => {
      root.classList.remove('scroll-locked');
      if (container) container.style.overflow = previousOverflow;
      document.body.style.paddingRight = '';
    };
  }, [active]);
}
