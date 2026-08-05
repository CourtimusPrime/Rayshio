import { useEffect, useRef, useState } from 'react';

/**
 * Tracks whether the scroll container is at its very top.
 *
 * Drives the top bar's scroll edge: floating chrome should only grow a seam
 * once content is genuinely underneath it, rather than carrying a permanent
 * 1px divider that claims an overlap that is not happening.
 *
 * An IntersectionObserver on a 1px sentinel rather than a scroll listener —
 * there is no per-frame main-thread work, and it needs no debouncing. The
 * sentinel sits at the top of the scroller; the default root works in both
 * layouts because the container's top edge is the viewport's top edge whether
 * the container scrolls (desktop) or the document does (mobile).
 */
export function useScrollEdge() {
  const sentinel = useRef<HTMLDivElement>(null);
  const [atTop, setAtTop] = useState(true);

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setAtTop(entry?.isIntersecting ?? true),
      { threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { sentinel, atTop };
}
