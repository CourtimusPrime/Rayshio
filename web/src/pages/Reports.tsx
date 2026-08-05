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
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';
import { useReport } from '../api/hooks';
import { categoryColors, categoryLabel } from '../categoryColors';
import { AnimatedCount, AnimatedCurrency } from '../components/AnimatedNumber';
import { ChartFigure } from '../components/ChartFigure';
import { ConversionNote } from '../components/ConversionNote';
import { FiscalYearSetting } from '../components/FiscalYearSetting';
import { ServiceLogo } from '../components/ServiceLogo';
import { EmptyNote, ErrorNote, LoadingBlock } from '../components/states';
import { useRovingTabIndex } from '../hooks/useRovingTabIndex';
import { useChartMotion } from '../motion/useChartMotion';
import { useChartColors } from '../state/theme';
import { useWorkspace } from '../state/workspace';
import type { PeriodType } from '../types';
import { formatCurrency, formatPercent } from '../utils/format';

/**
 * The Dashboard's views, reported over fiscal quarters and years rather than
 * calendar months. Periods come from the org's fiscal year start, so an April
 * start makes Jul–Sep "Q2" rather than "Q3".
 */
const PERIOD_TYPES = ['quarter', 'year'] as const;

export function Reports() {
  const { currency } = useWorkspace();
  const chart = useChartColors();
  const chartMotion = useChartMotion();
  const [type, setType] = useState<PeriodType>('quarter');
  const [periodKey, setPeriodKey] = useState<string | undefined>();

  const { data, isPending, error } = useReport(currency, type, periodKey);

  const periods = data?.available_periods ?? [];
  const index = periods.findIndex((p) => p.key === data?.period.key);
  const older = index >= 0 ? periods[index + 1]?.key : periods[0]?.key;
  const newer = index > 0 ? periods[index - 1]?.key : undefined;

  const periodTabs = useRovingTabIndex({
    values: PERIOD_TYPES,
    active: type,
    onActivate: (next) => switchType(next),
  });

  const switchType = (next: PeriodType) => {
    setType(next);
    // period keys are not comparable across types; fall back to the newest
    setPeriodKey(undefined);
  };

  const services = (data?.services ?? []).slice(0, 6);
  const maxService = Math.max(...services.map((s) => s.total_minor), 0);
  const categories = data?.categories ?? [];
  const categoryTotal = categories.reduce((sum, c) => sum + c.total_minor, 0);

  const delta =
    data && data.previous_total_minor !== 0
      ? ((data.current_total_minor - data.previous_total_minor) / data.previous_total_minor) * 100
      : null;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-line bg-surface p-5 shadow-card md:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div
            role="tablist"
            aria-label="Reporting period"
            className="flex gap-1.5 rounded-lg border border-line p-1"
          >
            {PERIOD_TYPES.map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                id={`report-tab-${value}`}
                aria-selected={type === value}
                aria-controls="report-panel"
                onClick={() => switchType(value)}
                {...periodTabs.itemProps(value)}
                className={`press rounded-md px-3 py-1.5 text-footnote transition-colors ${
                  type === value
                    ? 'bg-accent-soft font-medium text-accent-strong'
                    : 'text-ink-500 hover:bg-canvas hover:text-ink-900'
                }`}
              >
                {value === 'quarter' ? 'Quarters' : 'Years'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => older && setPeriodKey(older)}
              disabled={!older}
              aria-label="Previous period"
              className="press tap flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink-500 transition-colors hover:bg-canvas hover:text-ink-900 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronLeftIcon className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <span className="min-w-[7rem] text-center text-footnote font-medium text-ink-900">
              {data?.period.label ?? '—'}
            </span>
            <button
              type="button"
              onClick={() => newer && setPeriodKey(newer)}
              disabled={!newer}
              aria-label="Next period"
              className="press tap flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink-500 transition-colors hover:bg-canvas hover:text-ink-900 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronRightIcon className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>

          {/* the FY naming convention is not universal — always show the range */}
          <span className="text-caption text-ink-500">{data?.period.rangeLabel}</span>

          <div className="ml-auto">
            <FiscalYearSetting />
          </div>
        </div>
      </section>

      {/* the panel the tabs control; everything below reflects the selected
          period type */}
      <div
        id="report-panel"
        role="tabpanel"
        aria-labelledby={`report-tab-${type}`}
        tabIndex={0}
        className="space-y-6"
      >
        {error && (
          <section className="rounded-xl border border-line bg-surface p-5 shadow-card md:p-6">
            <ErrorNote message={error.message} />
          </section>
        )}

        {!error && (isPending || !data || !currency) && <LoadingBlock className="h-64" />}

        {!error && data && currency && (
          <>
            <section
              aria-labelledby="report-total-heading"
              className="rounded-xl border border-line bg-surface p-5 shadow-card md:p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="report-total-heading" className="text-body font-medium text-ink-500">
                    Total spend · {data.period.label}
                  </h2>
                  <p className="tnum mt-2 text-display font-semibold text-ink-900">
                    <AnimatedCurrency value={data.current_total_minor} currency={currency} />
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-2.5 py-1 text-caption font-medium text-ink-500">
                  {delta === null ? 'no prior period' : formatPercent(delta)}
                </span>
              </div>

              <p className="mt-2 text-footnote text-ink-500">
                <span className="tnum text-ink-700">
                  <AnimatedCurrency value={data.previous_total_minor} currency={currency} />
                </span>{' '}
                in {data.previous_period.label}
              </p>

              <ChartFigure
                className="mt-5 h-40"
                label={`Spend by ${type === 'quarter' ? 'quarter' : 'year'}`}
                summary={data.trend
                  .map((t) => `${t.label} ${formatCurrency(t.total_minor, currency)}`)
                  .join(', ')}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.trend} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
                    <CartesianGrid stroke={chart.grid} vertical={false} />
                    <XAxis
                      dataKey="label"
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
                    <Bar
                      dataKey="total_minor"
                      radius={[6, 6, 0, 0]}
                      fill={chart.accent}
                      {...chartMotion}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartFigure>

              <dl className="mt-5 grid grid-cols-3 gap-4 border-t border-line pt-4">
                <div>
                  <dt className="text-micro uppercase tracking-wide text-ink-400">Invoices</dt>
                  <dd className="tnum mt-1 text-body font-medium text-ink-900">
                    <AnimatedCount value={data.invoice_count} />
                  </dd>
                </div>
                <div>
                  <dt className="text-micro uppercase tracking-wide text-ink-400">Services</dt>
                  <dd className="tnum mt-1 text-body font-medium text-ink-900">
                    <AnimatedCount value={data.service_count} />
                  </dd>
                </div>
                <div>
                  <dt className="text-micro uppercase tracking-wide text-ink-400">Avg / invoice</dt>
                  <dd className="tnum mt-1 text-body font-medium text-ink-900">
                    {data.invoice_count === 0 ? (
                      '—'
                    ) : (
                      <AnimatedCurrency
                        value={Math.round(data.current_total_minor / data.invoice_count)}
                        currency={currency}
                      />
                    )}
                  </dd>
                </div>
              </dl>

              <ConversionNote meta={data.conversion} />
            </section>

            <section
              aria-labelledby="report-vendors-heading"
              className="rounded-xl border border-line bg-surface p-5 shadow-card md:p-6"
            >
              <h2 id="report-vendors-heading" className="text-body font-medium text-ink-900">
                Top vendors by spend
              </h2>
              <p className="mt-1 text-caption text-ink-500">
                {data.period.rangeLabel}, parsed invoices only
              </p>

              <div className="mt-5">
                {services.length === 0 ? (
                  <EmptyNote message="No invoices in this period." />
                ) : (
                  <ChartFigure
                    className="h-56"
                    label="Top vendors by spend this period"
                    summary={services
                      .map((v) => `${v.service} ${formatCurrency(v.total_minor, currency)}`)
                      .join('; ')}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={services}
                        margin={{ top: 8, right: 4, bottom: 0, left: -12 }}
                        barSize={26}
                      >
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
                          {services.map((entry) => (
                            <Cell
                              key={entry.service}
                              fill={
                                entry.total_minor === maxService ? chart.accent : chart.barMuted
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartFigure>
                )}
              </div>
            </section>

            <section
              aria-labelledby="report-categories-heading"
              className="clip-card rounded-xl border border-line bg-surface shadow-card"
            >
              <div className="px-5 py-4 md:px-6">
                <h2 id="report-categories-heading" className="text-body font-medium text-ink-900">
                  Spend by category
                </h2>
                <p className="mt-1 text-caption text-ink-500">
                  Rolled up across every vendor for {data.period.label}
                </p>
              </div>

              {categories.length === 0 ? (
                <div className="px-5 pb-5 md:px-6">
                  <EmptyNote message="No categorized spend in this period." />
                </div>
              ) : (
                <ul className="border-t border-line">
                  {categories.map((category) => (
                    <li key={category.category} className="border-b border-line last:border-b-0">
                      <div className="flex items-center gap-3 px-5 py-3.5 md:px-6">
                        <span
                          className="h-8 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: categoryColors[category.category] }}
                          aria-hidden="true"
                        />
                        <span className="min-w-0">
                          <span className="block text-footnote font-medium text-ink-900">
                            {categoryLabel(category.category)}
                          </span>
                          <span className="tnum mt-0.5 block text-caption text-ink-500">
                            {category.services.length} vendors ·{' '}
                            {categoryTotal === 0
                              ? 0
                              : Math.round((category.total_minor / categoryTotal) * 100)}
                            % of spend
                          </span>
                        </span>
                        <span className="ml-auto flex items-center gap-3">
                          <span className="hidden items-center gap-1 sm:flex">
                            {category.services.slice(0, 4).map((s) => (
                              <ServiceLogo key={s.service} name={s.service} />
                            ))}
                          </span>
                          <span className="tnum text-body font-medium text-ink-900">
                            <AnimatedCurrency value={category.total_minor} currency={currency} />
                          </span>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
