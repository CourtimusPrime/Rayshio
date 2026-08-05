import { useEffect } from 'react';

/**
 * Marks everything outside the modal as inert while it is open, so the page
 * behind cannot be focused, clicked or read.
 *
 * Set through the DOM property rather than a JSX prop: `inert` landed in
 * React's types in 19, and this app is on 18. TypeScript's lib.dom does declare
 * the property, so this is typed even though the attribute is not.
 *
 * Requires the modal to be portalled *outside* the given element — see the
 * `#overlay-root` sibling in index.html. If it ever ends up inside, the drawer
 * silently becomes non-interactive.
 */
export function useBackgroundInert(active: boolean, selector = '#root') {
  useEffect(() => {
    if (!active) return;
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return;

    el.inert = true;
    // belt and braces: inert implies this in current engines, but older Safari
    // applied inert to focus without hiding the subtree from assistive tech
    el.setAttribute('aria-hidden', 'true');

    return () => {
      el.inert = false;
      el.removeAttribute('aria-hidden');
    };
  }, [active, selector]);
}
