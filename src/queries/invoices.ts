import { sql } from 'kysely';
import { db } from '../db/client.js';
import { type DateRange, dateAtLeast, dateAtMost } from './filters.js';

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
    .where('billing.invoices.org_id', '=', orgId);

  // `ilike` without wildcards: case-insensitive exact match, matching the tool's
  // long-standing behaviour.
  if (opts.service) q = q.where('server.service.name', 'ilike', opts.service);
  if (opts.currency) q = q.where('billing.invoices.currency', '=', opts.currency);
  if (opts.status) q = q.where('billing.invoices.status', '=', opts.status);
  if (opts.dateFrom) q = q.where(dateAtLeast('billing.invoices.invoice_date', opts.dateFrom));
  if (opts.dateTo) q = q.where(dateAtMost('billing.invoices.invoice_date', opts.dateTo));
  if (opts.search) {
    const term = `%${opts.search}%`;
    q = q.where((eb) =>
      eb.or([
        eb('billing.invoices.invoice_number', 'ilike', term),
        eb('server.service.name', 'ilike', term),
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
      'server.service.name as service',
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
  invoiceIds: number[],
): Promise<Map<number, string | null>> {
  const result = new Map<number, string | null>();
  if (invoiceIds.length === 0) return result;

  const rows = await db
    .selectFrom('billing.invoice_line_items')
    .select(({ fn }) => ['invoice_id', 'category', fn.sum('amount').as('total_minor')])
    .where('invoice_id', 'in', invoiceIds)
    .groupBy(['invoice_id', 'category'])
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
      'server.service.name as service',
      'billing.email.subject as email_subject',
      'billing.email.delivered_at',
    ])
    .where('billing.invoices.id', '=', invoiceId)
    .where('billing.invoices.org_id', '=', orgId)
    .executeTakeFirst();
  return invoice;
}

export async function getLineItems(invoiceId: number) {
  return db
    .selectFrom('billing.invoice_line_items')
    .selectAll()
    .where('invoice_id', '=', invoiceId)
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
