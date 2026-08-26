/**
 * The Accountant tab's data access.
 *
 * The idea the whole feature rests on: an invoice is *untracked* for an address
 * until it has been successfully emailed to that address, and it becomes
 * tracked the moment it has. There is no per-invoice checkbox anywhere in the
 * product, because there is nothing to decide — the ledger in
 * `billing.accountant_delivery_item` already knows what went out, so "send
 * everything outstanding" is always the right button.
 *
 * Tracking is per *recipient*, not per org. Pointing the workspace at a new
 * accountant hands that accountant the full history rather than whatever
 * happened to arrive after the switch, which is what someone changing firms
 * actually wants, and it leaves the previous address's record untouched.
 */

import { sql } from 'kysely';
import { db } from '../db/client.js';
import { EFFECTIVE_DATE } from './facts.js';
import { displayName } from './service-name.js';
import { keepsZeroCharges } from './zero-charges.js';

export async function getAccountantEmail(orgId: number): Promise<string | null> {
  const row = await db
    .selectFrom('client.accountant')
    .select('email')
    .where('org_id', '=', orgId)
    .executeTakeFirst();
  return row?.email ?? null;
}

/**
 * Upserts the address. Deliberately does not touch the delivery ledger: what
 * has already been sent stays sent, and an address that is set back to a
 * previous one picks its own history up again rather than resending it.
 */
export async function setAccountantEmail(orgId: number, email: string): Promise<void> {
  await db
    .insertInto('client.accountant')
    .values({ org_id: orgId, email })
    .onConflict((oc) => oc.column('org_id').doUpdateSet({ email, updated_at: sql`now()` }))
    .execute();
}

export async function clearAccountantEmail(orgId: number): Promise<void> {
  await db.deleteFrom('client.accountant').where('org_id', '=', orgId).execute();
}

/** An invoice that is ready to send: parsed, and not yet sent to this address. */
export interface UntrackedInvoice {
  invoice_id: number;
  service: string;
  invoice_number: string | null;
  currency: string;
  value: number;
  effective_date: string;
  pdf_id: string | null;
}

/**
 * Invoices this recipient has never received.
 *
 * `status = 'parsed'` only. A pending or failed row has no trustworthy total
 * and often no PDF, and an accountant receiving a half-extracted invoice cannot
 * tell that is what it is — the honest move is to leave it out until the
 * pipeline finishes with it. It stays untracked, so it goes out next time.
 *
 * Zero-charge rows follow the org's own display setting via `keepsZeroCharges`,
 * so what gets emailed matches what the dashboard shows. Negative rows (credit
 * notes) are always included; they are exactly the documents an accountant most
 * needs.
 */
export async function untrackedInvoices(
  orgId: number,
  recipient: string,
): Promise<UntrackedInvoice[]> {
  const rows = await db
    .selectFrom('billing.invoices')
    .innerJoin('billing.email', 'billing.email.id', 'billing.invoices.email_id')
    .innerJoin('server.service', 'server.service.id', 'billing.email.server_id')
    .select([
      'billing.invoices.id as invoice_id',
      displayName(orgId).as('service'),
      'billing.invoices.invoice_number',
      'billing.invoices.currency',
      'billing.invoices.value',
      sql<string | null>`billing.invoices.pdf_id::text`.as('pdf_id'),
      EFFECTIVE_DATE.as('effective_date'),
    ])
    .where('billing.invoices.org_id', '=', orgId)
    .where('billing.invoices.status', '=', 'parsed')
    .where(keepsZeroCharges(orgId, 'billing.invoices.value'))
    /*
     * NOT EXISTS against (invoice, recipient), not a left join with a null
     * check: the unique index is on that pair, so this is an index probe per
     * row, and it cannot duplicate an invoice that somehow appears in two
     * deliveries.
     */
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom('billing.accountant_delivery_item as item')
            .select('item.invoice_id')
            .whereRef('item.invoice_id', '=', 'billing.invoices.id')
            .where('item.recipient', '=', recipient),
        ),
      ),
    )
    .orderBy(EFFECTIVE_DATE, 'asc')
    .orderBy('billing.invoices.id', 'asc')
    .execute();

  return rows.map((r) => ({
    invoice_id: Number(r.invoice_id),
    service: r.service,
    invoice_number: r.invoice_number,
    currency: r.currency,
    value: Number(r.value),
    effective_date: r.effective_date,
    pdf_id: r.pdf_id,
  }));
}

export interface DeliveryRecord {
  id: number;
  recipient: string;
  sent_at: Date;
  invoice_count: number;
  service_count: number;
  period_start: string | null;
  period_end: string | null;
  total_minor: number;
  currency: string;
  status: string;
  error: string | null;
}

export interface RecordDeliveryInput {
  orgId: number;
  recipient: string;
  invoiceIds: number[];
  serviceCount: number;
  periodStart: string | null;
  periodEnd: string | null;
  totalMinor: number;
  currency: string;
}

/**
 * Writes the ledger for a send that succeeded.
 *
 * One transaction, so an invoice is never marked as delivered without the
 * delivery row it belongs to. `onConflict().doNothing()` on the items covers
 * the one race worth covering — two sends fired at once — by letting the second
 * one's overlapping invoices fall away instead of failing the whole write on
 * the unique index. Called only after the provider has accepted the message:
 * recording first would mean a bounce silently swallowed the invoices forever.
 */
export async function recordDelivery(input: RecordDeliveryInput): Promise<number> {
  return db.transaction().execute(async (trx) => {
    const delivery = await trx
      .insertInto('billing.accountant_delivery')
      .values({
        org_id: input.orgId,
        recipient: input.recipient,
        invoice_count: input.invoiceIds.length,
        service_count: input.serviceCount,
        period_start: input.periodStart,
        period_end: input.periodEnd,
        total_minor: input.totalMinor,
        currency: input.currency,
        status: 'sent',
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    if (input.invoiceIds.length > 0) {
      await trx
        .insertInto('billing.accountant_delivery_item')
        .values(
          input.invoiceIds.map((invoice_id) => ({
            delivery_id: Number(delivery.id),
            invoice_id,
            recipient: input.recipient,
          })),
        )
        .onConflict((oc) => oc.columns(['invoice_id', 'recipient']).doNothing())
        .execute();
    }

    return Number(delivery.id);
  });
}

/**
 * Records an attempt that never reached the accountant.
 *
 * No items are written, so every invoice in the failed batch stays untracked
 * and goes out on the next attempt. The row exists purely so the tab can say
 * what happened rather than showing an unchanged count and no explanation.
 */
export async function recordFailedDelivery(
  input: Omit<RecordDeliveryInput, 'invoiceIds'> & { invoiceCount: number; error: string },
): Promise<void> {
  await db
    .insertInto('billing.accountant_delivery')
    .values({
      org_id: input.orgId,
      recipient: input.recipient,
      invoice_count: input.invoiceCount,
      service_count: input.serviceCount,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      total_minor: input.totalMinor,
      currency: input.currency,
      status: 'failed',
      error: input.error.slice(0, 500),
    })
    .execute();
}

export async function recentDeliveries(orgId: number, limit = 10): Promise<DeliveryRecord[]> {
  const rows = await db
    .selectFrom('billing.accountant_delivery')
    .select([
      'id',
      'recipient',
      'sent_at',
      'invoice_count',
      'service_count',
      sql<string | null>`to_char(period_start, 'YYYY-MM-DD')`.as('period_start'),
      sql<string | null>`to_char(period_end, 'YYYY-MM-DD')`.as('period_end'),
      'total_minor',
      'currency',
      'status',
      'error',
    ])
    .where('org_id', '=', orgId)
    .orderBy('sent_at', 'desc')
    .limit(limit)
    .execute();

  return rows.map((r) => ({
    id: Number(r.id),
    recipient: r.recipient,
    sent_at: r.sent_at as Date,
    invoice_count: Number(r.invoice_count),
    service_count: Number(r.service_count),
    period_start: r.period_start,
    period_end: r.period_end,
    total_minor: Number(r.total_minor),
    currency: r.currency,
    status: r.status,
    error: r.error,
  }));
}
