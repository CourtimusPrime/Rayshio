/** Month keys are 'YYYY-MM'. All bounds returned are inclusive 'YYYY-MM-DD'. */

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonthKey(value: string): boolean {
  return MONTH_KEY.test(value);
}

export function currentMonthKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function parseMonthKey(month: string): { year: number; month: number } {
  if (!isMonthKey(month)) throw new Error(`invalid month '${month}', expected YYYY-MM`);
  const [year, mon] = month.split('-');
  return { year: Number(year), month: Number(mon) };
}

/** Shifts a month key by `delta` months, wrapping years. */
export function shiftMonth(month: string, delta: number): string {
  const { year, month: mon } = parseMonthKey(month);
  const zeroBased = year * 12 + (mon - 1) + delta;
  const y = Math.floor(zeroBased / 12);
  const m = zeroBased - y * 12 + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function monthRange(month: string): { from: string; to: string } {
  const { year, month: mon } = parseMonthKey(month);
  // day 0 of the next month is the last day of this one
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

/** `count` month keys ending at (and including) `month`, oldest first. */
export function trailingMonths(month: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(month, i - (count - 1)));
}

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** 'Aug' — the axis label the dashboard trend chart uses. */
export function shortMonthLabel(month: string): string {
  const { month: mon } = parseMonthKey(month);
  return SHORT_MONTHS[mon - 1] ?? month;
}

/** 'August 2026' — the card heading the dashboard uses. */
export function longMonthLabel(month: string): string {
  const { year, month: mon } = parseMonthKey(month);
  const full = new Date(Date.UTC(year, mon - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });
  return `${full} ${year}`;
}
