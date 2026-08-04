import {
  longMonthLabel,
  monthRange,
  parseMonthKey,
  shiftMonth,
  shortMonthLabel,
} from './months.js';

/**
 * Fiscal period maths.
 *
 * A fiscal year is named for the calendar year it *ends* in — the common
 * convention, and the one that degenerates correctly when the fiscal year starts
 * in January (FY2026 is then simply calendar 2026). Every label also carries the
 * actual date range, because the naming convention is not universal and a bare
 * "FY2026" is ambiguous to a reader who assumes the other one.
 */

export type PeriodType = 'quarter' | 'year';

export interface FiscalPeriod {
  /** Stable identifier: 'FY2026' or 'FY2026-Q3'. */
  key: string;
  type: PeriodType;
  fiscalYear: number;
  /** 1-4 for quarters, null for a full year. */
  quarter: number | null;
  label: string;
  /** 'Apr 2025 – Mar 2026' — disambiguates the FY naming convention. */
  rangeLabel: string;
  from: string;
  to: string;
  months: string[];
}

export function isFiscalStartMonth(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 12;
}

/** The fiscal year a calendar month falls in. */
export function fiscalYearOf(month: string, startMonth: number): number {
  const { year, month: m } = parseMonthKey(month);
  if (startMonth === 1) return year;
  return m >= startMonth ? year + 1 : year;
}

/** First calendar month of a fiscal year, as 'YYYY-MM'. */
export function fiscalYearStart(fiscalYear: number, startMonth: number): string {
  const year = startMonth === 1 ? fiscalYear : fiscalYear - 1;
  return `${year}-${String(startMonth).padStart(2, '0')}`;
}

function monthsFrom(startKey: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(startKey, i));
}

function rangeLabel(months: string[]): string {
  const first = months[0] as string;
  const last = months[months.length - 1] as string;
  const fmt = (m: string) => `${shortMonthLabel(m)} ${parseMonthKey(m).year}`;
  return `${fmt(first)} – ${fmt(last)}`;
}

export function fiscalYearPeriod(fiscalYear: number, startMonth: number): FiscalPeriod {
  const months = monthsFrom(fiscalYearStart(fiscalYear, startMonth), 12);
  return {
    key: `FY${fiscalYear}`,
    type: 'year',
    fiscalYear,
    quarter: null,
    label: `FY${fiscalYear}`,
    rangeLabel: rangeLabel(months),
    from: monthRange(months[0] as string).from,
    to: monthRange(months[months.length - 1] as string).to,
    months,
  };
}

export function fiscalQuarterPeriod(
  fiscalYear: number,
  quarter: number,
  startMonth: number,
): FiscalPeriod {
  const yearStart = fiscalYearStart(fiscalYear, startMonth);
  const months = monthsFrom(shiftMonth(yearStart, (quarter - 1) * 3), 3);
  return {
    key: `FY${fiscalYear}-Q${quarter}`,
    type: 'quarter',
    fiscalYear,
    quarter,
    label: `FY${fiscalYear} Q${quarter}`,
    rangeLabel: rangeLabel(months),
    from: monthRange(months[0] as string).from,
    to: monthRange(months[months.length - 1] as string).to,
    months,
  };
}

/** The fiscal quarter (1-4) a calendar month falls in. */
export function fiscalQuarterOf(month: string, startMonth: number): number {
  const fiscalYear = fiscalYearOf(month, startMonth);
  const yearStart = fiscalYearStart(fiscalYear, startMonth);
  const { year: sy, month: sm } = parseMonthKey(yearStart);
  const { year, month: m } = parseMonthKey(month);
  const offset = (year - sy) * 12 + (m - sm);
  return Math.floor(offset / 3) + 1;
}

export function parsePeriodKey(key: string, startMonth: number): FiscalPeriod | null {
  const year = key.match(/^FY(\d{4})$/);
  if (year?.[1]) return fiscalYearPeriod(Number(year[1]), startMonth);

  const quarter = key.match(/^FY(\d{4})-Q([1-4])$/);
  if (quarter?.[1] && quarter[2]) {
    return fiscalQuarterPeriod(Number(quarter[1]), Number(quarter[2]), startMonth);
  }
  return null;
}

/**
 * Every fiscal period covering the supplied calendar months, newest first — the
 * same "only offer periods that have data" rule the month navigation uses.
 */
export function periodsForMonths(
  months: string[],
  startMonth: number,
  type: PeriodType,
): FiscalPeriod[] {
  const seen = new Map<string, FiscalPeriod>();
  for (const month of months) {
    const fiscalYear = fiscalYearOf(month, startMonth);
    const period =
      type === 'year'
        ? fiscalYearPeriod(fiscalYear, startMonth)
        : fiscalQuarterPeriod(fiscalYear, fiscalQuarterOf(month, startMonth), startMonth);
    seen.set(period.key, period);
  }
  return [...seen.values()].sort((a, b) => (a.from < b.from ? 1 : -1));
}

/** The period immediately before `period` — what the comparison figure uses. */
export function previousPeriod(period: FiscalPeriod, startMonth: number): FiscalPeriod {
  if (period.type === 'year') return fiscalYearPeriod(period.fiscalYear - 1, startMonth);
  const quarter = period.quarter ?? 1;
  return quarter === 1
    ? fiscalQuarterPeriod(period.fiscalYear - 1, 4, startMonth)
    : fiscalQuarterPeriod(period.fiscalYear, quarter - 1, startMonth);
}

/** 'January' etc — for the fiscal-year-start setting. */
export function monthName(startMonth: number): string {
  return longMonthLabel(`2000-${String(startMonth).padStart(2, '0')}`).replace(' 2000', '');
}
