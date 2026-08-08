import { sql } from 'kysely';
import { type Category, normalizeCategory } from '../categories.js';
import { db } from '../db/client.js';
import { type DateRange, dateAtLeast, dateAtMost } from './filters.js';
import { displayName } from './service-name.js';
import { keepsZeroCharges } from './zero-charges.js';

export interface SpendByServiceRow {
  currency: string;
  service: string;
  total_minor: number;
  invoice_count: number;
}

/**
 * Grouping is org first, currency second, dimension last — sums are never
 * collapsed across currencies (SPEC.md:190-196).
 */
export async function spendByService(
  orgId: number,
  range: DateRange = {},
): Promise<SpendByServiceRow[]> {
  let q = db
    .selectFrom('billing.invoices')
    .innerJoin('billing.email', 'billing.email.id', 'billing.invoices.email_id')
    .innerJoin('server.service', 'server.service.id', 'billing.email.server_id')
    .select(({ fn }) => [
      'billing.invoices.currency',
      displayName(orgId).as('service'),
      fn.sum('billing.invoices.value').as('total_minor'),
      fn.count('billing.invoices.id').as('invoice_count'),
    ])
    .where('billing.invoices.org_id', '=', orgId)
    .where('billing.invoices.status', '=', 'parsed')
    .where(keepsZeroCharges(orgId, 'billing.invoices.value'));
  if (range.dateFrom) q = q.where(dateAtLeast('billing.invoices.invoice_date', range.dateFrom));
  if (range.dateTo) q = q.where(dateAtMost('billing.invoices.invoice_date', range.dateTo));

  const rows = await q
    /*
     * `server.service.id` is grouped as well as the name expression. That
     * expression is a correlated subquery over the service id, and Postgres
     * rejects grouping by one whose referenced column is not itself grouped.
     * The id is what the name depends on, so adding it changes no result.
     */
    .groupBy(['billing.invoices.currency', 'server.service.id', displayName(orgId)])
    .orderBy('total_minor', 'desc')
    .execute();
  return rows.map((r) => ({
    currency: r.currency,
    service: r.service,
    total_minor: Number(r.total_minor),
    invoice_count: Number(r.invoice_count),
  }));
}

export interface SpendByDescriptionRow {
  currency: string;
  description: string;
  total_minor: number;
  line_count: number;
}

export async function spendByLineItemDescription(
  orgId: number,
  range: DateRange = {},
): Promise<SpendByDescriptionRow[]> {
  let q = db
    .selectFrom('billing.invoice_line_items')
    .innerJoin('billing.invoices', 'billing.invoices.id', 'billing.invoice_line_items.invoice_id')
    .select(({ fn }) => [
      'billing.invoices.currency',
      'billing.invoice_line_items.description',
      fn.sum('billing.invoice_line_items.amount').as('total_minor'),
      fn.count('billing.invoice_line_items.id').as('line_count'),
    ])
    .where('billing.invoices.org_id', '=', orgId)
    .where('billing.invoices.status', '=', 'parsed')
    .where(keepsZeroCharges(orgId, 'billing.invoice_line_items.amount'));
  if (range.dateFrom) q = q.where(dateAtLeast('billing.invoices.invoice_date', range.dateFrom));
  if (range.dateTo) q = q.where(dateAtMost('billing.invoices.invoice_date', range.dateTo));

  const rows = await q
    .groupBy(['billing.invoices.currency', 'billing.invoice_line_items.description'])
    .orderBy('total_minor', 'desc')
    .execute();
  return rows.map((r) => ({
    currency: r.currency,
    description: r.description,
    total_minor: Number(r.total_minor),
    line_count: Number(r.line_count),
  }));
}

export interface SpendByCategoryRow {
  currency: string;
  category: string;
  total_minor: number;
  line_count: number;
}

/**
 * Cross-vendor category rollup — "what is my storage costing me across every
 * vendor". Per-currency and unconverted, matching the tool's documented default.
 */
export async function spendByCategory(
  orgId: number,
  range: DateRange = {},
): Promise<SpendByCategoryRow[]> {
  let q = db
    .selectFrom('billing.invoice_line_items')
    .innerJoin('billing.invoices', 'billing.invoices.id', 'billing.invoice_line_items.invoice_id')
    .select(({ fn }) => [
      'billing.invoices.currency',
      'billing.invoice_line_items.category',
      fn.sum('billing.invoice_line_items.amount').as('total_minor'),
      fn.count('billing.invoice_line_items.id').as('line_count'),
    ])
    .where('billing.invoices.org_id', '=', orgId)
    .where('billing.invoices.status', '=', 'parsed')
    .where(keepsZeroCharges(orgId, 'billing.invoice_line_items.amount'));
  if (range.dateFrom) q = q.where(dateAtLeast('billing.invoices.invoice_date', range.dateFrom));
  if (range.dateTo) q = q.where(dateAtMost('billing.invoices.invoice_date', range.dateTo));

  const rows = await q
    .groupBy(['billing.invoices.currency', 'billing.invoice_line_items.category'])
    .orderBy('total_minor', 'desc')
    .execute();
  return rows.map((r) => ({
    currency: r.currency,
    category: normalizeCategory(r.category),
    total_minor: Number(r.total_minor),
    line_count: Number(r.line_count),
  }));
}
