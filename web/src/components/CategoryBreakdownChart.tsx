import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useCategories } from '../api/hooks';
import { categoryColors, categoryLabel } from '../categoryColors';
import { useWorkspace } from '../state/workspace';
import { formatCurrency } from '../utils/format';
import { AnimatedCurrency } from './AnimatedNumber';
import { ConversionNote } from './ConversionNote';
import { EmptyNote, ErrorNote, LoadingBlock } from './states';

export function CategoryBreakdownChart() {
  const { currency, month } = useWorkspace();
  const { data, isPending, error } = useCategories(currency, month);

  // negative rows (credits, included-usage offsets) cannot be drawn as pie
  // slices; they still count towards the total shown in the middle
  const categories = data?.categories ?? [];
  const total = categories.reduce((sum, item) => sum + item.total_minor, 0);
  const slices = categories.filter((item) => item.total_minor > 0);

  return (
    <section
      aria-labelledby="category-breakdown-heading"
      className="rounded-xl border border-line bg-white p-5 shadow-card md:p-6"
    >
      <h2 id="category-breakdown-heading" className="text-sm font-medium text-ink-900">
        Spend by usage category
      </h2>
      <p className="mt-1 text-xs text-ink-500">Aggregated across all vendors this month</p>

      <div className="mt-4">
        {error && <ErrorNote message={error.message} />}
        {!error && (isPending || !currency) && <LoadingBlock className="h-40" />}
        {!error && !isPending && slices.length === 0 && (
          <EmptyNote message="No categorized spend this month." />
        )}

        {!error && slices.length > 0 && currency && (
          <div className="flex flex-col items-center gap-6 sm:flex-row">
            <div className="relative h-40 w-40 shrink-0">
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
                  >
                    {slices.map((entry) => (
                      <Cell key={entry.category} fill={categoryColors[entry.category]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: 10,
                      border: '1px solid #ececf0',
                      boxShadow: '0 6px 24px rgba(24,24,28,0.08)',
                      fontSize: 12,
                    }}
                    formatter={(value: number) => [formatCurrency(value, currency), 'Spend']}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[11px] uppercase tracking-wide text-ink-400">Total</span>
                <span className="tnum text-sm font-semibold text-ink-900">
                  <AnimatedCurrency value={total} currency={currency} compact />
                </span>
              </div>
            </div>

            <ul className="w-full space-y-2.5">
              {categories.map((item) => (
                <li key={item.category} className="flex items-center gap-2.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: categoryColors[item.category] }}
                    aria-hidden="true"
                  />
                  <span className="text-[13px] text-ink-700">{categoryLabel(item.category)}</span>
                  <span className="tnum ml-auto text-[13px] font-medium text-ink-900">
                    <AnimatedCurrency value={item.total_minor} currency={currency} />
                  </span>
                  <span className="tnum w-10 text-right text-xs text-ink-400">
                    {total === 0 ? '—' : `${Math.round((item.total_minor / total) * 100)}%`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <ConversionNote meta={data?.conversion} />
      </div>
    </section>
  );
}
