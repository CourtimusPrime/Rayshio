import { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { useCategories } from '../api/hooks';
import { categoryColors, categoryLabel } from '../categoryColors';
import { useChartMotion } from '../motion/useChartMotion';
import { useWorkspace } from '../state/workspace';
import { AnimatedCurrency } from './AnimatedNumber';
import { ChartFigure } from './ChartFigure';
import { ConversionNote } from './ConversionNote';
import { EmptyNote, ErrorNote, LoadingBlock } from './states';

export function CategoryBreakdownChart() {
  const { currency, month } = useWorkspace();
  /*
   * Which slice the pointer is over, for the variants that read the hovered
   * value somewhere other than a floating tooltip. `null` is "not hovering",
   * which is a different state from index 0.
   */
  const [active, setActive] = useState<number | null>(null);
  // once: a Pie sweeps from zero degrees on every data change, so paging a
  // month would redraw the whole ring rather than morph it
  const chartMotion = useChartMotion(true);
  const { data, isPending, error } = useCategories(currency, month);

  // negative rows (credits, included-usage offsets) cannot be drawn as pie
  // slices; they still count towards the total shown in the middle
  const categories = data?.categories ?? [];
  const total = categories.reduce((sum, item) => sum + item.total_minor, 0);
  const slices = categories.filter((item) => item.total_minor > 0);
  const donutSummary = slices
    .map(
      (s) =>
        `${categoryLabel(s.category)} ${total === 0 ? '0' : Math.round((s.total_minor / total) * 100)}%`,
    )
    .join(', ');

  /* Shared across the variants: only the donut's hover behaviour differs. */
  const heading = (
    <>
      <h2 id="category-breakdown-heading" className="text-body font-medium text-ink-900">
        Spend by usage category
      </h2>
      <p className="mt-1 text-caption text-ink-500">Aggregated across all vendors this month</p>
    </>
  );

  const states = (
    <>
      {error && <ErrorNote message={error.message} />}
      {!error && (isPending || !currency) && <LoadingBlock className="h-40" />}
      {!error && !isPending && slices.length === 0 && (
        <EmptyNote message="No categorized spend this month." />
      )}
    </>
  );

  const legend = (activeCategory?: string) => (
    <ul className="w-full space-y-2.5">
      {categories.map((item) => (
        <li
          key={item.category}
          className={`flex items-center gap-2.5 rounded-md transition-colors ${
            activeCategory === item.category ? 'bg-canvas' : ''
          }`}
        >
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-sm"
            style={{ backgroundColor: categoryColors[item.category] }}
            aria-hidden="true"
          />
          <span className="text-footnote text-ink-700">{categoryLabel(item.category)}</span>
          <span className="tnum ml-auto text-footnote font-medium text-ink-900">
            <AnimatedCurrency value={item.total_minor} currency={currency ?? 'USD'} />
          </span>
          <span className="tnum w-10 text-right text-caption text-ink-400">
            {total === 0 ? '—' : `${Math.round((item.total_minor / total) * 100)}%`}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <section
      aria-labelledby="category-breakdown-heading"
      className="rounded-xl border border-line bg-surface p-5 shadow-card md:p-6"
    >
      {heading}
      <div className="mt-4">
        {states}
        {!error && slices.length > 0 && currency && (
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <ChartFigure
              className="relative h-40 w-40 shrink-0"
              label="Spend by usage category"
              summary={donutSummary}
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="total_minor"
                    nameKey="category"
                    innerRadius={52}
                    outerRadius={76}
                    paddingAngle={2}
                    stroke="none"
                    onMouseEnter={(_, index) => setActive(index)}
                    onMouseLeave={() => setActive(null)}
                    {...chartMotion}
                  >
                    {slices.map((entry, index) => (
                      <Cell
                        key={entry.category}
                        fill={categoryColors[entry.category]}
                        opacity={active === null || active === index ? 1 : 0.4}
                      />
                    ))}
                  </Pie>
                  {/* deliberately no <Tooltip> */}
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                <span className="w-full truncate text-micro uppercase tracking-wide text-ink-400">
                  {active !== null && slices[active]
                    ? categoryLabel(slices[active].category)
                    : 'Total'}
                </span>
                <span className="tnum text-body font-semibold text-ink-900">
                  <AnimatedCurrency
                    value={active !== null && slices[active] ? slices[active].total_minor : total}
                    currency={currency}
                    compact
                  />
                </span>
              </div>
            </ChartFigure>
            {legend()}
          </div>
        )}
        <ConversionNote meta={data?.conversion} />
      </div>
    </section>
  );
}
