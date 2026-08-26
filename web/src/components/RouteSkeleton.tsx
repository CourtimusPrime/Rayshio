/**
 * Route-shaped loading states, shown while a page's code chunk arrives.
 *
 * The fallback used to be a single grey block of a fixed height for every
 * route. It kept the scroller from collapsing, which was the point, but it also
 * told the user nothing about where they had just navigated and then jumped as
 * the real page — a different height, a different number of cards — replaced
 * it. These trace each page's actual composition, so the arriving content
 * settles into a shape that is already there.
 *
 * Gross shape only: card count, card chrome, roughly where the headings and
 * rows fall. Chasing pixel accuracy here would mean re-editing this file every
 * time a page's internals move, and a skeleton that lies about detail is worse
 * than one that is honestly approximate.
 */

/** The card chrome every page uses, so the swap does not redraw the container. */
const CARD = 'rounded-xl border border-line bg-surface shadow-card';

function Bar({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-canvas ${className}`} />;
}

/** A card with a title block and a body of the given height. */
function CardSkeleton({ body, title = true }: { body: string; title?: boolean }) {
  return (
    <section className={`${CARD} p-5 md:p-6`}>
      {title && (
        <div className="space-y-2">
          <Bar className="h-4 w-36" />
          <Bar className="h-3 w-24 opacity-70" />
        </div>
      )}
      <Bar className={`mt-5 w-full ${body}`} />
    </section>
  );
}

/** A card whose body is a list of rows — tables and detail lists. */
function TableSkeleton({ rows }: { rows: number }) {
  return (
    <section className={CARD}>
      <div className="flex items-center justify-between px-5 py-4 md:px-6">
        <div className="space-y-2">
          <Bar className="h-4 w-32" />
          <Bar className="h-3 w-20 opacity-70" />
        </div>
        <Bar className="h-9 w-28" />
      </div>
      <div className="divide-y divide-line border-t border-line">
        {Array.from({ length: rows }, (_, i) => (
          // Rows fade toward the bottom rather than all pulsing at equal
          // weight, which reads as a list continuing past the fold instead of
          // a block that happens to be striped. Same trick as `LoadingLines`.
          <div
            key={i}
            className="flex items-center gap-3 px-5 py-3 md:px-6"
            style={{ opacity: 1 - i * 0.1 }}
          >
            <Bar className="h-7 w-7 shrink-0 rounded-full" />
            <Bar className="h-3 flex-1" />
            <Bar className="h-3 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Which skeleton belongs to which path.
 *
 * Keyed on the same paths as the route table in `App.tsx`; anything unlisted
 * falls back to a single card, which is what an unknown route would have shown
 * anyway.
 */
export function RouteSkeleton({ pathname }: { pathname: string }) {
  const content = (() => {
    switch (pathname) {
      case '/':
        // ServiceBreakdownChart (lead stats + chart), then recent invoices
        return (
          <>
            <CardSkeleton body="h-64" />
            <TableSkeleton rows={6} />
          </>
        );
      case '/breakdown':
        // CategoryDetailList, then CategoryBreakdownChart
        return (
          <>
            <TableSkeleton rows={5} />
            <CardSkeleton body="h-60" />
          </>
        );
      case '/invoices':
        return <TableSkeleton rows={8} />;
      case '/reports':
        return (
          <>
            <CardSkeleton body="h-64" />
            <CardSkeleton body="h-48" />
          </>
        );
      case '/accountant':
        // recipient card, outstanding figures + vendor list, then history
        return (
          <>
            <CardSkeleton body="h-16" />
            <CardSkeleton body="h-40" />
            <TableSkeleton rows={3} />
          </>
        );
      case '/connect':
        return (
          <>
            <CardSkeleton body="h-32" />
            <CardSkeleton body="h-40" />
          </>
        );
      default:
        return <CardSkeleton body="h-40" />;
    }
  })();

  return (
    // One live region for the whole page, not one per card: six pulsing blocks
    // announcing "Loading" individually is six interruptions for one event.
    <div role="status" aria-label="Loading page" className="space-y-6">
      {content}
    </div>
  );
}
