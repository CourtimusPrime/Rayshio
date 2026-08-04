/**
 * Amounts cross the wire as integer minor units and are only divided here.
 * Currency is always passed explicitly — the backend never sums across
 * currencies, so neither does the UI.
 */
export function formatCurrency(minorUnits: number, currency: string, compact = false): string {
  const value = minorUnits / 100;
  const options: Intl.NumberFormatOptions = compact
    ? { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }
    : { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 };
  try {
    return new Intl.NumberFormat('en-US', options).format(value);
  } catch {
    // unrecognised currency code — fall back to a plain number plus the code
    return `${value.toFixed(compact ? 1 : 2)} ${currency}`;
  }
}

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - Date.parse(iso);
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** 'YYYY-MM' for the month a Date falls in, in local time. */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

/** 'YYYY-MM' -> 'August 2026' */
export function longMonthLabel(month: string): string {
  const [year, mon] = month.split('-');
  return `${MONTH_NAMES[Number(mon) - 1] ?? month} ${year}`;
}
