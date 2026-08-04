import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { monthQueries } from './hooks';

/**
 * Warms every month's figures in the background so paging through months reads
 * from cache instead of hitting the network each time.
 *
 * Months are fetched nearest-first, so the neighbours you are most likely to
 * click next land before the far end of the history. Concurrency is capped
 * because each request aggregates and FX-converts a month's invoices — firing
 * thirteen months × four endpoints at once would just queue behind itself and
 * slow down the month you are actually looking at.
 */

const CONCURRENCY = 3;

export function useMonthPrefetch(
  currency: string | undefined,
  activeMonth: string,
  months: { month: string }[],
): void {
  const queryClient = useQueryClient();
  const monthKeys = months.map((m) => m.month).join(',');

  useEffect(() => {
    if (!currency || months.length === 0) return;

    // nearest-first: whatever is adjacent to the current month is likeliest next
    const ordered = [...months.map((m) => m.month)].sort((a, b) => {
      const da = Math.abs(monthDistance(a, activeMonth));
      const db = Math.abs(monthDistance(b, activeMonth));
      return da - db;
    });

    let cancelled = false;
    let cursor = 0;

    const worker = async (): Promise<void> => {
      while (!cancelled && cursor < ordered.length) {
        const month = ordered[cursor++] as string;
        await Promise.all([
          queryClient.prefetchQuery(monthQueries.summary(currency, month)),
          queryClient.prefetchQuery(monthQueries.services(currency, month)),
          queryClient.prefetchQuery(monthQueries.categories(currency, month)),
          queryClient.prefetchQuery(monthQueries.calendar(currency, month)),
        ]).catch(() => {
          // a warm-up failure is not worth surfacing; the real query will retry
        });
      }
    };

    // let the month actually on screen finish first
    const start = window.setTimeout(() => {
      void Promise.all(Array.from({ length: CONCURRENCY }, worker));
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(start);
    };
  }, [queryClient, currency, activeMonth, monthKeys, months]);
}

/** Whole months between two 'YYYY-MM' keys. */
function monthDistance(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (ay ?? 0) * 12 + (am ?? 0) - ((by ?? 0) * 12 + (bm ?? 0));
}
