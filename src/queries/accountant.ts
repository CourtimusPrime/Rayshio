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

/** The active mailbox a send would go out from, with the scopes it holds. */
export async function sendingAccount(orgId: number) {
  const accounts = await db
    .selectFrom('client.account')
    .select(['id', 'email_address', 'status', 'scopes'])
    .where('org_id', '=', orgId)
    .where('provider', '=', 'google')
    .orderBy('connected_at')
    .execute();
  // The active one, or the newest of whatever exists — a revoked account is
  // still worth naming on screen, since "reconnect it" is the fix either way.
  const active = accounts.find((a) => a.status === 'active') ?? accounts[accounts.length - 1];
  return active ? { ...active, id: Number(active.id) } : undefined;
}

export type SendMode = 'bulk' | 'individual';

export async function getAccountantEmail(orgId: number): Promise<string | null> {
  const row = await db
    .selectFrom('client.accountant')
    .select('email')
    .where('org_id', '=', orgId)
    .executeTakeFirst();
  return row?.email ?? null;
}

export async function getAccountantSettings(
  orgId: number,
): Promise<{ email: string | null; sendMode: SendMode }> {
  const row = await db
    .selectFrom('client.accountant')
    .select(['email', 'send_mode'])
    .where('org_id', '=', orgId)
    .executeTakeFirst();
  return {
    email: row?.email ?? null,
    sendMode: (row?.send_mode as SendMode | undefined) ?? 'bulk',
  };
}

/**
 * Sets how invoices are delivered. Requires an address, because the row is
 * keyed on the org and `email` is NOT NULL — a mode with nobody to send to is
 * not a state this table can hold, and the UI never offers it.
 */
export async function setSendMode(orgId: number, mode: SendMode): Promise<void> {
  await db
    .updateTable('client.accountant')
    .set({ send_mode: mode, updated_at: sql`now()` })
    .where('org_id', '=', orgId)
    .execute();
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
  /** 'sending' while a one-by-one run holds the row; invoice_count is then the live count. */
  status: 'sending' | 'sent' | 'failed';
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
 * Minutes after which a 'sending' row is taken to belong to a dead process.
 * A batch is at most 25 sends, about 25-60 seconds of work, so ten minutes is
 * unambiguous evidence that whatever opened the row is no longer running.
 */
export const STALE_SENDING_MINUTES = 10;

const UNIQUE_VIOLATION = '23505';
const ONE_SENDING_INDEX = 'index_accountant_delivery_one_sending';

/** Another one-by-one run already holds this org's single 'sending' row. */
export class AlreadySendingError extends Error {}

/**
 * Opens a delivery that will be filled in as individual emails land.
 *
 * One-by-one sending cannot use `recordDelivery`, which writes everything in
 * one transaction after a single message is accepted. Here each email is its
 * own outcome: the twentieth can fail after nineteen have arrived, and those
 * nineteen must stay delivered or the accountant gets them twice on the retry.
 * So the parent row is opened first — the items reference it — and each invoice
 * is recorded the moment its own message is accepted.
 *
 * The row is also the org's send lock. It is inserted as 'sending', and a
 * partial unique index allows one such row per org, so a second run fails here
 * instead of mailing the same invoices in parallel. Until it is closed it is not
 * a result, which is why it is not 'sent' with zero totals: that read as a
 * failure for the whole run.
 */
export async function startDelivery(input: {
  orgId: number;
  recipient: string;
  currency: string;
}): Promise<number> {
  try {
    const row = await db
      .insertInto('billing.accountant_delivery')
      .values({
        org_id: input.orgId,
        recipient: input.recipient,
        currency: input.currency,
        status: 'sending',
        invoice_count: 0,
        service_count: 0,
        total_minor: 0,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return Number(row.id);
  } catch (err) {
    const pg = err as { code?: string; constraint?: string };
    if (pg.code === UNIQUE_VIOLATION && pg.constraint === ONE_SENDING_INDEX) {
      throw new AlreadySendingError('already sending — wait for the current run to finish');
    }
    throw err;
  }
}

export interface SendingDelivery {
  id: number;
  recipient: string;
  currency: string;
  /** Older than STALE_SENDING_MINUTES: the process that opened it has died. */
  stale: boolean;
}

/** The org's live 'sending' row, if any. The partial index guarantees at most one. */
export async function sendingDelivery(orgId: number): Promise<SendingDelivery | undefined> {
  const row = await db
    .selectFrom('billing.accountant_delivery')
    .select([
      'id',
      'recipient',
      'currency',
      sql<boolean>`sent_at < now() - make_interval(mins => ${STALE_SENDING_MINUTES}::int)`.as(
        'stale',
      ),
    ])
    .where('org_id', '=', orgId)
    .where('status', '=', 'sending')
    .executeTakeFirst();
  return row
    ? { id: Number(row.id), recipient: row.recipient, currency: row.currency, stale: row.stale }
    : undefined;
}

/**
 * The invoices recorded under one delivery.
 *
 * Same shape as untrackedInvoices so the totals of a closed batch are computed
 * from what the ledger says went out, not from an in-memory list that a crash
 * would have lost. The org filter on billing.invoices is the enforcement: items
 * carry no org_id of their own, so a bare delivery id must never be trusted.
 */
export async function deliveryInvoices(
  orgId: number,
  deliveryId: number,
): Promise<UntrackedInvoice[]> {
  const rows = await db
    .selectFrom('billing.invoices')
    .innerJoin('billing.email', 'billing.email.id', 'billing.invoices.email_id')
    .innerJoin('server.service', 'server.service.id', 'billing.email.server_id')
    .innerJoin('billing.accountant_delivery_item as item', 'item.invoice_id', 'billing.invoices.id')
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
    .where('item.delivery_id', '=', deliveryId)
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

/**
 * Drops a freshly opened row that found nothing left to send.
 *
 * The rare race: the row is opened, then the last outstanding invoice turns out
 * to be gone. Closing it would leave exactly the "0 invoices" history row this
 * lock was introduced to remove, so it is deleted instead. Guarded on 'sending'
 * and on having no items, so it can never erase a row that delivered anything.
 */
export async function discardEmptyDelivery(orgId: number, deliveryId: number): Promise<void> {
  await db
    .deleteFrom('billing.accountant_delivery')
    .where('id', '=', deliveryId)
    .where('org_id', '=', orgId)
    .where('status', '=', 'sending')
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom('billing.accountant_delivery_item as item')
            .select('item.invoice_id')
            .whereRef('item.delivery_id', '=', 'billing.accountant_delivery.id'),
        ),
      ),
    )
    .execute();
}

/** Marks one invoice delivered, immediately after its own email is accepted. */
export async function recordDeliveredItem(
  deliveryId: number,
  invoiceId: number,
  recipient: string,
): Promise<void> {
  await db
    .insertInto('billing.accountant_delivery_item')
    .values({ delivery_id: deliveryId, invoice_id: invoiceId, recipient })
    .onConflict((oc) => oc.columns(['invoice_id', 'recipient']).doNothing())
    .execute();
}

/**
 * Closes a run, with the totals of what actually went out.
 *
 * Written at the end rather than predicted at the start: the counts have to
 * describe delivered mail, not intended mail, or the history reports a batch
 * that partly failed as though it had all arrived.
 */
export async function finishDelivery(
  deliveryId: number,
  totals: {
    invoiceCount: number;
    serviceCount: number;
    periodStart: string | null;
    periodEnd: string | null;
    totalMinor: number;
    error?: string | null;
  },
): Promise<void> {
  await db
    .updateTable('billing.accountant_delivery')
    .set({
      invoice_count: totals.invoiceCount,
      service_count: totals.serviceCount,
      period_start: totals.periodStart,
      period_end: totals.periodEnd,
      total_minor: totals.totalMinor,
      // A run that delivered nothing at all is a failure; one that delivered
      // some and then stopped is not, because that mail really did arrive.
      status: totals.invoiceCount === 0 && totals.error ? 'failed' : 'sent',
      error: totals.error ? totals.error.slice(0, 500) : null,
    })
    .where('id', '=', deliveryId)
    // First writer wins: a row the stale sweep already closed is not reopened or
    // rewritten, and two sweeps racing each other are idempotent.
    .where('status', '=', 'sending')
    .execute();
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
      // While a run holds the row its stored count is still 0; the live number is
      // however many items it has recorded so far. The outer org filter scopes
      // this, since the correlated count is keyed on the row's own id.
      sql<number>`CASE WHEN status = 'sending'
        THEN (SELECT count(*) FROM billing.accountant_delivery_item i
              WHERE i.delivery_id = billing.accountant_delivery.id)
        ELSE invoice_count END`.as('invoice_count'),
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
    status: r.status as DeliveryRecord['status'],
    error: r.error,
  }));
}
