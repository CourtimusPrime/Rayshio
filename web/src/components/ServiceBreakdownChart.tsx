import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useServices } from '../api/hooks';
import { useChartColors } from '../state/theme';
import { useWorkspace } from '../state/workspace';
import { formatCurrency } from '../utils/format';
import { ConversionNote } from './ConversionNote';
import { EmptyNote, ErrorNote, LoadingBlock } from './states';

const TOP_N = 6;

export function ServiceBreakdownChart() {
  const { currency, month } = useWorkspace();
  const chart = useChartColors();
  const { data, isPending, error } = useServices(currency, month);

  const rows = (data?.services ?? []).slice(0, TOP_N);
  const max = Math.max(...rows.map((d) => d.total_minor), 0);

  return (
    <section
      aria-labelledby="service-breakdown-heading"
      className="rounded-xl border border-line bg-surface p-5 shadow-card md:p-6"
    >
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 id="service-breakdown-heading" className="text-body font-medium text-ink-900">
            Top vendors by spend
          </h2>
          <p className="mt-1 text-caption text-ink-500">This month, parsed invoices only</p>
        </div>
      </div>

      <div className="mt-5">
        {error && <ErrorNote message={error.message} />}
        {!error && (isPending || !currency) && <LoadingBlock className="h-56" />}
        {!error && !isPending && currency && rows.length === 0 && (
          <EmptyNote message="No invoices this month." />
        )}
        {!error && !isPending && rows.length > 0 && currency && (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -12 }} barSize={26}>
                <CartesianGrid stroke={chart.grid} vertical={false} />
                <XAxis
                  dataKey="service"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: chart.labelTick, fontSize: 12 }}
                  dy={6}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: chart.axisTick, fontSize: 11 }}
                  tickFormatter={(value: number) => formatCurrency(value, currency, true)}
                />
                <Tooltip
                  cursor={{ fill: chart.cursor }}
                  contentStyle={chart.tooltip}
                  formatter={(value: number) => [formatCurrency(value, currency), 'Spend']}
                />
                <Bar dataKey="total_minor" radius={[6, 6, 0, 0]}>
                  {rows.map((entry) => (
                    <Cell
                      key={entry.service}
                      fill={entry.total_minor === max ? chart.accent : chart.barMuted}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <ConversionNote meta={data?.conversion} />
      </div>
    </section>
  );
}
