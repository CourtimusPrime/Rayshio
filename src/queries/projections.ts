import { sql } from 'kysely';
import { db } from '../db/client.js';
import { dateAtLeast } from './filters.js';
import { displayName } from './service-name.js';
import { keepsZeroCharges } from './zero-charges.js';

export interface ProjectedInvoice {
  id: string;
  service: string;
  value: number;
  invoice_date: string;
}

/** A cadence only counts as monthly if the median gap lands in this window. */
const MIN_MONTHLY_GAP_DAYS = 25;
const MAX_MONTHLY_GAP_DAYS = 40;
/** Every observed gap must be within this fraction of the median to be "regular". */
const GAP_TOLERANCE = 0.25;
const MIN_HISTORY = 3;
const MAX_PROJECTIONS_PER_SERVICE = 6;

const DAY_MS = 86_400_000;

function toEpochDay(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

function fromEpochDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return Math.round(((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2);
}

/**
 * Projects future invoices from observed billing cadence. Deliberately
 * conservative: a service must have at least three invoices spaced at a
 * consistent monthly interval before anything is projected. Irregular or
 * usage-priced vendors emit nothing — a blank calendar day is more honest than
 * a bad guess.
 */
export async function projectInvoices(
  orgId: number,
  currency: string,
  through: string,
  historyFrom: string,
): Promise<ProjectedInvoice[]> {
  const rows = await db
    .selectFrom('billing.invoices')
    .innerJoin('billing.email', 'billing.email.id', 'billing.invoices.email_id')
    .innerJoin('server.service', 'server.service.id', 'billing.email.server_id')
    .select([
      displayName(orgId).as('service'),
      'billing.invoices.value',
      sql<string>`to_char(billing.invoices.invoice_date, 'YYYY-MM-DD')`.as('invoice_date'),
    ])
    .where('billing.invoices.org_id', '=', orgId)
    .where('billing.invoices.status', '=', 'parsed')
    .where(keepsZeroCharges(orgId, 'billing.invoices.value'))
    .where('billing.invoices.currency', '=', currency)
    .where('billing.invoices.invoice_date', 'is not', null)
    .where(dateAtLeast('billing.invoices.invoice_date', historyFrom))
    .orderBy('billing.invoices.invoice_date')
    .execute();

  const byService = new Map<string, { day: number; value: number }[]>();
  for (const row of rows) {
    const history = byService.get(row.service) ?? [];
    history.push({ day: toEpochDay(row.invoice_date), value: Number(row.value) });
    byService.set(row.service, history);
  }

  const throughDay = toEpochDay(through);
  const projections: ProjectedInvoice[] = [];

  for (const [service, history] of byService) {
    if (history.length < MIN_HISTORY) continue;

    const gaps: number[] = [];
    for (let i = 1; i < history.length; i++) {
      gaps.push((history[i] as { day: number }).day - (history[i - 1] as { day: number }).day);
    }

    const cadence = median(gaps);
    if (cadence < MIN_MONTHLY_GAP_DAYS || cadence > MAX_MONTHLY_GAP_DAYS) continue;
    if (gaps.some((gap) => Math.abs(gap - cadence) > cadence * GAP_TOLERANCE)) continue;

    const amount = median(history.slice(-3).map((h) => h.value));
    const observedDays = new Set(history.map((h) => h.day));
    let day = (history[history.length - 1] as { day: number }).day;

    for (let n = 0; n < MAX_PROJECTIONS_PER_SERVICE; n++) {
      day += cadence;
      if (day > throughDay) break;
      if (observedDays.has(day)) continue;
      projections.push({
        id: `projected-${service}-${fromEpochDay(day)}`,
        service,
        value: amount,
        invoice_date: fromEpochDay(day),
      });
    }
  }

  return projections.sort((a, b) => a.invoice_date.localeCompare(b.invoice_date));
}
