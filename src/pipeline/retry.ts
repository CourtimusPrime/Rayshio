import { db } from '../db/client.js';
import { enqueue } from '../queue/queues.js';

/**
 * Re-queues extraction for an invoice that never finished it.
 *
 * A job can be lost for reasons the row itself cannot show: a worker that was
 * not running when the job was enqueued, a Redis that was never the one the
 * worker reads, a job evicted before it ran. The invoice then sits in a
 * non-terminal status forever, and nothing in the product could move it —
 * observed with an uploaded PDF whose job went to a local Redis with no worker
 * attached, leaving the UI saying "queued for parsing" indefinitely.
 */

/** Statuses that mean extraction has not completed, successfully or otherwise. */
export const STUCK_STATUSES = ['pending', 'classified', 'pdf_fetched'] as const;

export interface RetryResult {
  invoiceId: number;
  enqueued: boolean;
  reason?: string;
}

/**
 * The Gmail account this org ingests through, or 0.
 *
 * Only consulted for an invoice with no stored PDF, where extraction has to go
 * back to the message body. An upload always has a PDF, so it never needs one —
 * which is why a missing account is not by itself a failure.
 */
async function accountIdForOrg(orgId: number): Promise<number> {
  const account = await db
    .selectFrom('client.account')
    .select('id')
    .where('org_id', '=', orgId)
    .orderBy('status')
    .orderBy('id')
    .executeTakeFirst();
  return account ? Number(account.id) : 0;
}

export async function retryExtraction(
  orgId: number,
  invoiceId: number,
  now: number,
): Promise<RetryResult> {
  const invoice = await db
    .selectFrom('billing.invoices as i')
    .innerJoin('billing.email as e', 'e.id', 'i.email_id')
    .select(['i.id as id', 'i.status as status', 'i.pdf_id as pdfId', 'e.message_id as messageId'])
    .where('i.id', '=', invoiceId)
    .where('i.org_id', '=', orgId)
    .executeTakeFirst();

  if (!invoice) return { invoiceId, enqueued: false, reason: 'not found in this workspace' };
  if (invoice.status === 'parsed') {
    return { invoiceId, enqueued: false, reason: 'already parsed' };
  }

  const accountId = invoice.pdfId ? 0 : await accountIdForOrg(orgId);
  if (!invoice.pdfId && accountId === 0) {
    return {
      invoiceId,
      enqueued: false,
      reason: 'no stored PDF and no connected mailbox to re-read the message from',
    };
  }

  /*
   * A fresh job id every time. BullMQ treats a repeated id as the same job and
   * silently drops the duplicate, so reusing `extract-<id>` would make the
   * second retry a no-op — the failure mode being fixed here.
   *
   * Dashes, never colons: BullMQ 5.81+ rejects `:` in custom job ids.
   */
  await enqueue(
    'extract-invoice',
    { accountId, invoiceId, messageId: invoice.messageId },
    { jobId: `extract-${invoiceId}-retry-${now}`, attempts: 2 },
  );

  // back to the pre-extraction state, so a retry that fails again reports its
  // own reason rather than the stale one
  await db
    .updateTable('billing.invoices')
    .set({ status: 'pdf_fetched', failure_reason: null })
    .where('id', '=', invoiceId)
    .execute();

  return { invoiceId, enqueued: true };
}

/**
 * Every invoice that has been sitting in a non-terminal status long enough that
 * a worker would have picked it up by now.
 *
 * The age floor matters: without it a sweep run beside a healthy queue would
 * re-enqueue work that is merely in progress, doubling it.
 */
export async function findStuckInvoices(
  orgId: number,
  olderThanMinutes: number,
): Promise<{ id: number; status: string; subject: string | null }[]> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  const rows = await db
    .selectFrom('billing.invoices as i')
    .innerJoin('billing.email as e', 'e.id', 'i.email_id')
    .select(['i.id as id', 'i.status as status', 'e.subject as subject'])
    .where('i.org_id', '=', orgId)
    .where('i.status', 'in', [...STUCK_STATUSES])
    .where('i.created_at', '<', cutoff)
    .orderBy('i.id')
    .execute();

  return rows.map((r) => ({ id: Number(r.id), status: r.status, subject: r.subject }));
}
