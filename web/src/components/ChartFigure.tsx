import type { ReactNode } from 'react';

/**
 * Gives a chart one accessible name and one spoken summary, and hides the SVG
 * beneath it.
 *
 * Recharts emits an SVG with no text alternative, so a screen reader either
 * finds nothing or walks dozens of unlabelled path and tick elements. Neither
 * is useful. A single `role="img"` with a summary derived from the same data
 * the chart draws is — and hiding the internals is what stops the second case.
 */
export function ChartFigure({
  label,
  summary,
  className,
  children,
}: {
  /** What the chart is, e.g. "Spend over the last 6 months". */
  label: string;
  /** The figures themselves, so the data is reachable without the picture. */
  summary: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className} role="img" aria-label={`${label}. ${summary}`}>
      <div aria-hidden="true" className="h-full w-full">
        {children}
      </div>
    </div>
  );
}
