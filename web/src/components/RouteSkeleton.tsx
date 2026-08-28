import { Skeleton } from 'boneyard-js/react';
import routeAccountant from '../bones/route-accountant.bones.json';
import routeBreakdown from '../bones/route-breakdown.bones.json';
import routeConnect from '../bones/route-connect.bones.json';
import routeDashboard from '../bones/route-dashboard.bones.json';
import routeInvoices from '../bones/route-invoices.bones.json';
import routeReports from '../bones/route-reports.bones.json';
import { APP_TITLES } from '../routes';

/**
 * Route-shaped loading states, shown while a page's code chunk arrives.
 *
 * These used to be hand-drawn: grey bars per route, sized by eye, under a
 * comment admitting they were "gross shape only" and would need re-editing
 * whenever a page's internals moved. They did move, repeatedly, and nothing
 * ever reported that the skeleton had stopped matching — the only symptom was
 * the layout jumping when the real page landed.
 *
 * Boneyard removes the guessing. `boneyardPlugin` in `vite.config.ts` opens
 * each route in a headless browser at three widths, measures where every
 * element actually is, and writes `src/bones/*.bones.json`. Re-running the
 * capture is the whole maintenance story.
 */

interface CapturedBones {
  breakpoints: Record<string, { width: number; height: number; bones: unknown[] }>;
}

const BONES: Record<string, { name: string; bones: CapturedBones }> = {
  '/': { name: 'route-dashboard', bones: routeDashboard as CapturedBones },
  '/breakdown': { name: 'route-breakdown', bones: routeBreakdown as CapturedBones },
  '/invoices': { name: 'route-invoices', bones: routeInvoices as CapturedBones },
  '/reports': { name: 'route-reports', bones: routeReports as CapturedBones },
  '/accountant': { name: 'route-accountant', bones: routeAccountant as CapturedBones },
  '/connect': { name: 'route-connect', bones: routeConnect as CapturedBones },
};

/**
 * The captured height for the widest breakpoint this viewport clears.
 *
 * Mirrors how the library picks a bone set at runtime, and exists because of
 * how `<Skeleton>` is built: the container is `position: relative`, sized by
 * its *children*, and the bones live in an absolutely-positioned overlay with
 * `overflow: hidden`. A route-level fallback has no children — the real page is
 * still downloading — so without this the box collapses to zero and the overlay
 * clips every bone it contains. The skeleton renders perfectly and shows
 * nothing, which is exactly what the first version of this did.
 */
function capturedHeight(bones: CapturedBones, width: number): number {
  const widths = Object.keys(bones.breakpoints)
    .map(Number)
    .sort((a, b) => a - b);
  const match = [...widths].reverse().find((bp) => width >= bp) ?? widths[0];
  return bones.breakpoints[String(match)]?.height ?? 0;
}

export function RouteSkeleton({ pathname }: { pathname: string }) {
  const captured = BONES[pathname];

  // Read once, not on resize: this is on screen for as long as a code chunk
  // takes to arrive, and a listener that outlives that costs more than the
  // stale pixel it would fix.
  const width = typeof window === 'undefined' ? 1440 : window.innerWidth;

  return (
    // One live region for the whole page, not one per card: several pulsing
    // blocks announcing "Loading" individually is several interruptions for one
    // event.
    <div role="status" aria-label={`Loading ${APP_TITLES[pathname] ?? 'page'}`}>
      <Skeleton
        loading
        name={captured?.name}
        select="viewport"
        animate="pulse"
        /*
         * Literal colours, not `rgb(var(--line-strong) / 1)`, and the reason is
         * not style: Boneyard derives a *container* tone from this value with
         * `adjustColor`, which parses the string. A CSS variable it cannot
         * parse comes back unchanged, so card containers and the rows inside
         * them render identically — a table collapses into one solid slab.
         * These are `--line-strong` from index.css in both themes; keep them in
         * step with it.
         */
        color="#d7d7df"
        darkColor="#2b2b33"
        /* No capture yet for this route: hold the scroller open rather than
           collapsing the page to nothing while the chunk downloads. */
        fallback={
          <div className="h-64 animate-pulse rounded-xl border border-line bg-surface shadow-card" />
        }
      >
        {captured ? (
          <div aria-hidden="true" style={{ height: capturedHeight(captured.bones, width) }} />
        ) : null}
      </Skeleton>
    </div>
  );
}
