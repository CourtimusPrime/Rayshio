import { type Expression, type SqlBool, sql } from 'kysely';
import { db } from '../db/client.js';
import { effectiveCategory } from './category-rules.js';
import type { DateRange } from './filters.js';
import { displayName } from './service-name.js';

/**
 * Row-level facts for the dashboard.
 *
 * Aggregation moved out of SQL because each invoice converts at the FX rate on
 * its own date, so sums can only be taken after conversion. At a few hundred
 * invoices per org this is comfortably cheaper than the round trips it replaces.
 *
 * `effective_date` is `invoice_date` falling back to the email's delivery date:
 * a third of these invoices carry no invoice_date, and requiring one silently
 * dropped them from every monthly total.
 */

const EFFECTIVE = sql`coalesce(billing.invoices.invoice_date, billing.email.delivered_at::date)`;
const EFFECTIVE_DATE = sql<string>`to_char(${EFFECTIVE}, 'YYYY-MM-DD')`;

const effectiveAtLeast = (d: string): Expression<SqlBool> =>
  sql<SqlBool>`${EFFECTIVE} >= ${d}::date`;
const effectiveAtMost = (d: string): Expression<SqlBool> =>
  sql<SqlBool>`${EFFECTIVE} <= ${d}::date`;

export interface InvoiceFact {
  invoice_id: number;
  service: string;
  currency: string;
  value: number;
  effective_date: string;
  invoice_date: string | null;
  status: string;
}

export async function invoiceFacts(
  orgId: number,
  range: DateRange = {},
  { parsedOnly = true }: { parsedOnly?: boolean } = {},
): Promise<InvoiceFact[]> {
  let q = db
    .selectFrom('billing.invoices')
    .innerJoin('billing.email', 'billing.email.id', 'billing.invoices.email_id')
    .innerJoin('server.service', 'server.service.id', 'billing.email.server_id')
    .select([
      'billing.invoices.id as invoice_id',
      displayName(orgId).as('service'),
      'billing.invoices.currency',
      'billing.invoices.value',
      'billing.invoices.status',
      sql<string | null>`to_char(billing.invoices.invoice_date, 'YYYY-MM-DD')`.as('invoice_date'),
      EFFECTIVE_DATE.as('effective_date'),
    ])
    .where('billing.invoices.org_id', '=', orgId);
  if (parsedOnly) q = q.where('billing.invoices.status', '=', 'parsed');
  if (range.dateFrom) q = q.where(effectiveAtLeast(range.dateFrom));
  if (range.dateTo) q = q.where(effectiveAtMost(range.dateTo));

  const rows = await q.execute();
  return rows.map((r) => ({
    invoice_id: Number(r.invoice_id),
    service: r.service,
    currency: r.currency,
    value: Number(r.value),
    status: r.status,
    invoice_date: r.invoice_date,
    effective_date: r.effective_date,
  }));
}

export interface LineItemFact {
  invoice_id: number;
  service: string;
  category: string | null;
  description: string;
  amount: number;
  currency: string;
  effective_date: string;
}

export async function lineItemFacts(orgId: number, range: DateRange = {}): Promise<LineItemFact[]> {
  let q = db
    .selectFrom('billing.invoice_line_items')
    .innerJoin('billing.invoices', 'billing.invoices.id', 'billing.invoice_line_items.invoice_id')
    .innerJoin('billing.email', 'billing.email.id', 'billing.invoices.email_id')
    .innerJoin('server.service', 'server.service.id', 'billing.email.server_id')
    .select([
      'billing.invoice_line_items.invoice_id',
      displayName(orgId).as('service'),
      effectiveCategory(orgId, {
        lineItems: 'billing.invoice_line_items',
        service: 'server.service',
      }).as('category'),
      'billing.invoice_line_items.description',
      'billing.invoice_line_items.amount',
      'billing.invoices.currency',
      EFFECTIVE_DATE.as('effective_date'),
    ])
    .where('billing.invoices.org_id', '=', orgId)
    .where('billing.invoices.status', '=', 'parsed');
  if (range.dateFrom) q = q.where(effectiveAtLeast(range.dateFrom));
  if (range.dateTo) q = q.where(effectiveAtMost(range.dateTo));

  const rows = await q.execute();
  return rows.map((r) => ({
    invoice_id: Number(r.invoice_id),
    service: r.service,
    category: r.category,
    description: r.description,
    amount: Number(r.amount),
    currency: r.currency,
    effective_date: r.effective_date,
  }));
}
