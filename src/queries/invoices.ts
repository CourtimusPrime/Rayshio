import { sql } from 'kysely';
import { db } from '../db/client.js';
import { effectiveCategory } from './category-rules.js';
import { type DateRange, dateAtLeast, dateAtMost } from './filters.js';
import { displayName } from './service-name.js';
import { keepsZeroCharges } from './zero-charges.js';

/** Column order here is load-bearing: it is the MCP `list_invoices` wire shape. */
export interface InvoiceListRow {
  invoice_id: number;
  service: string;
  invoice_number: string | null;
  value: number;
  currency: string;
  invoice_date: string | null;
  period_start: string | null;
  period_end: string | null;
  status: string;
  delivered_at: Date;
}

export interface ListInvoicesOptions extends DateRange {
  service?: string | undefined;
  currency?: string | undefined;
  status?: string | undefined;
  /** Free-text match against invoice number, service name, and email subject. */
  search?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

function invoiceListQuery(orgId: number, opts: ListInvoicesOptions) {
  let q = db
    .selectFrom('billing.invoices')
    .innerJoin('billing.email', 'billing.email.id', 'billing.invoices.email_id')
    .innerJoin('server.service', 'server.service.id', 'billing.email.server_id')
    .where('billing.invoices.org_id', '=', orgId)
    .where(keepsZeroCharges(orgId, 'billing.invoices.value'));

  // Filters match what the user can see. Someone who renamed a vendor and then
  // filters by that name must get their invoices back — matching the global
  // name here would silently return nothing for the name on their own screen.
  // `ilike` without wildcards: case-insensitive exact match, matching the tool's
  // long-standing behaviour.
  if (opts.service) q = q.where(displayName(orgId), 'ilike', opts.service);
  if (opts.currency) q = q.where('billing.invoices.currency', '=', opts.currency);
  if (opts.status) q = q.where('billing.invoices.status', '=', opts.status);
  if (opts.dateFrom) q = q.where(dateAtLeast('billing.invoices.invoice_date', opts.dateFrom));
  if (opts.dateTo) q = q.where(dateAtMost('billing.invoices.invoice_date', opts.dateTo));
  if (opts.search) {
    const term = `%${opts.search}%`;
    q = q.where((eb) =>
      eb.or([
        eb('billing.invoices.invoice_number', 'ilike', term),
        eb(displayName(orgId), 'ilike', term),
        eb('billing.email.subject', 'ilike', term),
      ]),
    );
  }
  return q;
}

export async function listInvoices(
  orgId: number,
  opts: ListInvoicesOptions = {},
): Promise<InvoiceListRow[]> {
  const rows = await invoiceListQuery(orgId, opts)
    .select([
      'billing.invoices.id as invoice_id',
      displayName(orgId).as('service'),
      'billing.invoices.invoice_number',
      'billing.invoices.value',
      'billing.invoices.currency',
      'billing.invoices.invoice_date',
      'billing.invoices.period_start',
      'billing.invoices.period_end',
      'billing.invoices.status',
      'billing.email.delivered_at',
    ])
    // Not every invoice carries an invoice_date, and a plain `invoice_date DESC`
    // sorts those NULLs *first* in Postgres — which parked the oldest undated
    // invoices at the top of "recent invoices". Fall back to the delivery date,
    // which is what the UI displays for those rows anyway.
    .orderBy(sql`coalesce(billing.invoices.invoice_date, billing.email.delivered_at::date)`, 'desc')
    .orderBy('billing.invoices.id', 'desc')
    .$if(opts.limit !== undefined, (qb) => qb.limit(opts.limit as number))
    .$if(opts.offset !== undefined, (qb) => qb.offset(opts.offset as number))
    .execute();
  return rows as unknown as InvoiceListRow[];
}

export async function countInvoices(
  orgId: number,
  opts: ListInvoicesOptions = {},
): Promise<number> {
  const row = await invoiceListQuery(orgId, opts)
    .select(({ fn }) => fn.count('billing.invoices.id').as('total'))
    .executeTakeFirst();
  return Number(row?.total ?? 0);
}

/**
 * Highest-spend category per invoice. An invoice spans several categories at the
 * line-item grain; the table in the design shows one, so we surface the dominant
 * one rather than inventing an invoice-level classification.
 */
export async function dominantCategories(
  orgId: number,
  invoiceIds: number[],
): Promise<Map<number, string | null>> {
  const result = new Map<number, string | null>();
  if (invoiceIds.length === 0) return result;

  // The join is the org filter. Line items carry no org_id of their own, so
  // without it a caller holding another tenant's invoice id reads that
  // tenant's spend breakdown. Every column is qualified because the join puts
  // an `id` and a `category`-adjacent name in scope twice.
  /*
   * Resolved first, aggregated second — the rule expression cannot appear in a
   * GROUP BY.
   *
   * It is a correlated subquery over the vendor and the line's own text, so
   * grouping by it makes Postgres reject the query outright ("subquery uses
   * ungrouped column"), and adding those columns to the GROUP BY instead would
   * split the sum per description, which is not what "dominant category" means.
   * A derived table resolves each row's category, then the outer query groups
   * on a plain column.
   */
  const resolved = db
    .selectFrom('billing.invoice_line_items as li')
    .innerJoin('billing.invoices as i', 'i.id', 'li.invoice_id')
    .innerJoin('billing.email as e', 'e.id', 'i.email_id')
    .innerJoin('server.service as s', 's.id', 'e.server_id')
    .select([
      'li.invoice_id as invoice_id',
      'li.amount as amount',
      effectiveCategory(orgId, { lineItems: 'li', service: 's' }).as('category'),
    ])
    .where('li.invoice_id', 'in', invoiceIds)
    .where('i.org_id', '=', orgId)
    .where(keepsZeroCharges(orgId, 'li.amount'));

  const rows = await db
    .selectFrom(resolved.as('t'))
    .select(({ fn }) => [
      't.invoice_id as invoice_id',
      't.category as category',
      fn.sum('t.amount').as('total_minor'),
    ])
    .groupBy(['t.invoice_id', 't.category'])
    .execute();

  const best = new Map<number, { category: string | null; total: number }>();
  for (const row of rows) {
    const invoiceId = Number(row.invoice_id);
    const total = Number(row.total_minor);
    const current = best.get(invoiceId);
    if (!current || total > current.total) {
      best.set(invoiceId, { category: row.category, total });
    }
  }
  for (const [invoiceId, { category }] of best) result.set(invoiceId, category);
  return result;
}

export async function getInvoice(orgId: number, invoiceId: number) {
  const invoice = await db
    .selectFrom('billing.invoices')
    .innerJoin('billing.email', 'billing.email.id', 'billing.invoices.email_id')
    .innerJoin('server.service', 'server.service.id', 'billing.email.server_id')
    .selectAll('billing.invoices')
    .select([
      displayName(orgId).as('service'),
      'billing.email.subject as email_subject',
      'billing.email.delivered_at',
    ])
    .where('billing.invoices.id', '=', invoiceId)
    .where('billing.invoices.org_id', '=', orgId)
    .executeTakeFirst();
  return invoice;
}

/**
 * An invoice's line items, scoped to the org that owns the invoice.
 *
 * The join is the whole point: line items have no `org_id`, so an id alone is
 * enough to read another tenant's itemization. `selectAll('li')`, not
 * `selectAll()` — the unqualified form would spread the joined invoice's
 * columns into the response body as well.
 */
export async function getLineItems(orgId: number, invoiceId: number) {
  return (
    db
      .selectFrom('billing.invoice_line_items as li')
      .innerJoin('billing.invoices as i', 'i.id', 'li.invoice_id')
      // email and service are joined only to reach the vendor a category rule is
      // keyed on. They contribute no columns: `selectAll('li')` stays qualified,
      // or the joined tables' columns would spread into the response body.
      .innerJoin('billing.email as e', 'e.id', 'i.email_id')
      .innerJoin('server.service as s', 's.id', 'e.server_id')
      .selectAll('li')
      // Overrides the stored `category` selected by `selectAll` above — declared
      // after it, so the learned rule is what the caller sees.
      .select(effectiveCategory(orgId, { lineItems: 'li', service: 's' }).as('category'))
      .where('li.invoice_id', '=', invoiceId)
      .where('i.org_id', '=', orgId)
      .where(keepsZeroCharges(orgId, 'li.amount'))
      .orderBy('li.id')
      .execute()
  );
}

/**
 * Pipeline state for a set of invoices, scoped to the org that owns them.
 *
 * Ids the org does not own are absent from the result rather than rejected —
 * see the route for why that distinction matters. The `org_id` filter is what
 * enforces it; do not be tempted to drop it because the ids "came from us".
 */
export async function getInvoiceOutcomes(orgId: number, invoiceIds: number[]) {
  if (invoiceIds.length === 0) return [];
  return db
    .selectFrom('billing.invoices')
    .select(['id', 'status', 'failure_reason'])
    .where('id', 'in', invoiceIds)
    .where('org_id', '=', orgId)
    .orderBy('id')
    .execute();
}

export async function getInvoicePdfRef(orgId: number, invoiceId: number) {
  return db
    .selectFrom('billing.invoices')
    .select(['pdf_id', 'invoice_number'])
    .where('id', '=', invoiceId)
    .where('org_id', '=', orgId)
    .executeTakeFirst();
}

/** Newest invoice row creation time — the dashboard's "last sync" indicator. */
export async function lastIngestAt(orgId: number): Promise<Date | null> {
  const row = await db
    .selectFrom('billing.invoices')
    .select(({ fn }) => fn.max('created_at').as('last'))
    .where('org_id', '=', orgId)
    .executeTakeFirst();
  return (row?.last as Date | null) ?? null;
}
