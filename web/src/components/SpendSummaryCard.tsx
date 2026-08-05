import { ArrowDownRightIcon, ArrowRightIcon, ArrowUpRightIcon } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useSummary } from '../api/hooks';
import { useChartColors } from '../state/theme';
import { useWorkspace } from '../state/workspace';
import { formatCurrency, formatPercent } from '../utils/format';
import { AnimatedCount, AnimatedCurrency } from './AnimatedNumber';
import { ConversionNote } from './ConversionNote';
import { ErrorNote, LoadingBlock } from './states';

export function SpendSummaryCard() {
  const { currency, month } = useWorkspace();
  const { data, isPending, error } = useSummary(currency, month);

  return (
    <section
      aria-labelledby="spend-summary-heading"
      className="rounded-xl border border-line bg-surface p-5 shadow-card md:p-6"
    >
      {error && <ErrorNote message={error.message} />}
      {!error && (isPending || !currency || !data) && <LoadingBlock className="h-56" />}
      {!error && data && currency && <Body data={data} currency={currency} />}
    </section>
  );
}

function Body({
  data,
  currency,
}: {
  data: NonNullable<ReturnType<typeof useSummary>['data']>;
  currency: string;
}) {
  const chart = useChartColors();
  const {
    current_total_minor: current,
    previous_total_minor: previous,
    month_label: monthLabel,
    invoice_count: invoiceCount,
    service_count: serviceCount,
    trend,
  } = data;

  const delta = previous === 0 ? null : ((current - previous) / previous) * 100;
  const difference = current - previous;

  // spending more is not good news, so the chip is tinted by direction rather
  // than always reading as the accent colour
  const chip =
    delta === null || Math.abs(delta) < 0.05
      ? { className: 'bg-canvas text-ink-500', Icon: ArrowRightIcon }
      : delta > 0
        ? { className: 'bg-warn-soft text-warn-text', Icon: ArrowUpRightIcon }
        : { className: 'bg-accent-soft text-accent-strong', Icon: ArrowDownRightIcon };

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="spend-summary-heading" className="text-body font-medium text-ink-500">
            Total spend · {monthLabel}
          </h2>
          <p className="tnum mt-2 text-display font-semibold text-ink-900">
            <AnimatedCurrency value={current} currency={currency} />
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-caption font-medium ${chip.className}`}
        >
          <chip.Icon className="h-3.5 w-3.5" strokeWidth={2} />
          {delta === null ? 'no prior month' : formatPercent(delta)}
        </span>
      </div>

      <p className="mt-2 text-footnote text-ink-500">
        <span className="tnum text-ink-700">
          <AnimatedCurrency value={previous} currency={currency} />
        </span>{' '}
        last month ·{' '}
        <span className="tnum text-ink-700">
          <AnimatedCurrency value={Math.abs(difference)} currency={currency} />
        </span>{' '}
        {difference >= 0 ? 'more' : 'less'}
      </p>

      <div className="-mx-1 mt-5 h-24">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chart.accent} stopOpacity={0.14} />
                <stop offset="100%" stopColor={chart.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Tooltip
              cursor={{ stroke: chart.grid }}
              contentStyle={chart.tooltip}
              labelFormatter={(_label, payload) => payload?.[0]?.payload?.label ?? ''}
              formatter={(value: number) => [formatCurrency(value, currency), 'Spend']}
            />
            <Area
              type="monotone"
              dataKey="total_minor"
              stroke={chart.accent}
              strokeWidth={2}
              fill="url(#spendFill)"
              dot={false}
              activeDot={{ r: 3, fill: chart.accent, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-4 border-t border-line pt-4">
        <div>
          <dt className="text-micro uppercase tracking-wide text-ink-400">Invoices</dt>
          <dd className="tnum mt-1 text-body font-medium text-ink-900">
            <AnimatedCount value={invoiceCount} />
          </dd>
        </div>
        <div>
          <dt className="text-micro uppercase tracking-wide text-ink-400">Services</dt>
          <dd className="tnum mt-1 text-body font-medium text-ink-900">
            <AnimatedCount value={serviceCount} />
          </dd>
        </div>
        <div>
          <dt className="text-micro uppercase tracking-wide text-ink-400">Avg / invoice</dt>
          <dd className="tnum mt-1 text-body font-medium text-ink-900">
            {invoiceCount === 0 ? (
              '—'
            ) : (
              <AnimatedCurrency value={Math.round(current / invoiceCount)} currency={currency} />
            )}
          </dd>
        </div>
      </dl>

      <ConversionNote meta={data.conversion} />
    </>
  );
}
