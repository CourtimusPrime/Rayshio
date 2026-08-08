import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useServices, useSummary } from '../api/hooks';
import { useChartMotion } from '../motion/useChartMotion';
import { useChartColors } from '../state/theme';
import { useWorkspace } from '../state/workspace';
import { formatCurrency } from '../utils/format';
import { AnimatedCurrency } from './AnimatedNumber';
import { ChartFigure } from './ChartFigure';
import { ConversionNote } from './ConversionNote';
import { EmptyNote, ErrorNote, LoadingBlock } from './states';

const TOP_N = 6;

/**
 * The dashboard's lead section: this month's spend, then where it went.
 *
 * The totals used to live in a standalone card above this one, which meant the
 * headline figure and the vendors that produced it were two separate objects
 * saying the same thing in different shapes. They are one section now — the
 * figure states the month, the chart answers "on what".
 */
export function ServiceBreakdownChart() {
  const { currency, month } = useWorkspace();
  const chart = useChartColors();
  const chartMotion = useChartMotion();
  const { data, isPending, error } = useServices(currency, month);
  const summaryQuery = useSummary(currency, month);

  const rows = (data?.services ?? []).slice(0, TOP_N);
  const max = Math.max(...rows.map((d) => d.total_minor), 0);
  const summary = rows
    .map((r) => `${r.service} ${formatCurrency(r.total_minor, currency ?? 'USD')}`)
    .join('; ');

  return (
    <section aria-label="Top vendors by spend">
      <MinimalSummary query={summaryQuery} currency={currency} />
      <div className="mt-5 border-t border-line pt-5">
        <VendorChart
          rows={rows}
          max={max}
          summary={summary}
          currency={currency}
          chart={chart}
          chartMotion={chartMotion}
          isPending={isPending}
          error={error}
        />
        <ConversionNote meta={data?.conversion} />
      </div>
    </section>
  );
}

/**
 * Total spend and the budget position, and nothing else.
 *
 * The month-over-month line and the prior-average line are deliberately absent:
 * they answered "how does this compare", which is a different question from the
 * one this section now asks.
 */
function MinimalSummary({
  query,
  currency,
  compact = false,
}: {
  query: ReturnType<typeof useSummary>;
  currency: string | undefined;
  compact?: boolean;
}) {
  const { data, isPending, error } = query;

  if (error) return <ErrorNote message={error.message} />;
  if (isPending || !data || !currency) return <LoadingBlock className="h-20" />;

  const { current_total_minor: current, month_label: monthLabel, budget_minor: budget } = data;

  return (
    <div>
      <p className="text-caption font-medium text-ink-500">Total spend · {monthLabel}</p>
      <p
        className={`tnum mt-1.5 font-semibold text-ink-900 ${compact ? 'text-title1' : 'text-display'}`}
      >
        <AnimatedCurrency value={current} currency={currency} />
      </p>
      {budget !== null && (
        <p className="mt-1.5 text-footnote text-ink-500">
          <span className="tnum text-ink-700">
            <AnimatedCurrency value={Math.abs(budget - current)} currency={currency} />
          </span>{' '}
          {current <= budget ? 'under' : 'over'} budget
        </p>
      )}
    </div>
  );
}

/** The vendor bars, with the states that surround them. */
function VendorChart({
  rows,
  max,
  summary,
  currency,
  chart,
  chartMotion,
  isPending,
  error,
  height = 'h-56',
  monochrome = false,
}: {
  rows: { service: string; total_minor: number }[];
  max: number;
  summary: string;
  currency: string | undefined;
  chart: ReturnType<typeof useChartColors>;
  chartMotion: ReturnType<typeof useChartMotion>;
  isPending: boolean;
  error: Error | null;
  height?: string;
  monochrome?: boolean;
}) {
  if (error) return <ErrorNote message={error.message} />;
  if (isPending || !currency) return <LoadingBlock className={height} />;
  if (rows.length === 0) return <EmptyNote message="No invoices this month." />;

  return (
    <ChartFigure
      className={height}
      label={`Top ${rows.length} vendors by spend this month`}
      summary={summary}
    >
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
          <Bar dataKey="total_minor" radius={[6, 6, 0, 0]} {...chartMotion}>
            {rows.map((entry) => (
              <Cell
                key={entry.service}
                fill={
                  monochrome || entry.total_minor !== max ? chart.barMuted : chart.accent
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFigure>
  );
}
