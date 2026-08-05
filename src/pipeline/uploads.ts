import { randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { putPdf } from '../mongo/pdfs.js';
import { enqueue } from '../queue/queues.js';

/**
 * Manually uploaded invoice PDFs.
 *
 * The parsing itself is not new: an uploaded PDF joins the existing pipeline at
 * stage 3 (`extract-invoice`), which reads the PDF out of GridFS and only falls
 * back to Gmail when `pdf_id` is null. Uploads always set it, so no part of
 * extraction, reconciliation or writing had to change.
 *
 * What is new is the shape of the row. `billing.invoices.email_id` is NOT NULL
 * and UNIQUE, and every listing query inner-joins `billing.email` — so an
 * invoice with no email would be invisible to the entire dashboard. Rather than
 * make the column nullable and rewrite those joins, an upload gets a synthetic
 * email row. That keeps every existing query correct without touching one.
 */

/** Where uploads live until extraction can name the real vendor. */
export const UPLOAD_SERVICE_NAME = 'Uploaded';
const UPLOAD_SERVICE_SENDER = 'upload@rayshio.local';

/** Marks a synthetic email as an upload, so vendor re-pointing never touches real mail. */
const UPLOAD_MESSAGE_PREFIX = 'upload-';

async function resolveServiceId(name: string, senderAddress: string): Promise<number> {
  const inserted = await db
    .insertInto('server.service')
    .values({ name, sender_address: senderAddress })
    .onConflict((oc) => oc.columns(['name', 'sender_address']).doNothing())
    .returning('id')
    .executeTakeFirst();
  if (inserted) return Number(inserted.id);

  const existing = await db
    .selectFrom('server.service')
    .select('id')
    .where('name', '=', name)
    .where('sender_address', '=', senderAddress)
    .executeTakeFirstOrThrow();
  return Number(existing.id);
}

/**
 * The org's billing address, for the synthetic email's `recipient_id`. Any of
 * the org's own addresses will do — nothing reads it for an upload — so this
 * reuses one rather than inventing another alias that would then show up in
 * discovery.
 */
async function resolveRecipientId(orgId: number): Promise<number> {
  const existing = await db
    .selectFrom('client.billing_address')
    .select('id')
    .where('org_id', '=', orgId)
    .orderBy('id')
    .executeTakeFirst();
  if (existing) return Number(existing.id);

  const inserted = await db
    .insertInto('client.billing_address')
    .values({ org_id: orgId, address: `uploads+org${orgId}@rayshio.local` })
    .onConflict((oc) => oc.columns(['org_id', 'address']).doNothing())
    .returning('id')
    .executeTakeFirstOrThrow();
  return Number(inserted.id);
}

export interface UploadedInvoice {
  invoiceId: number;
  filename: string;
}

/**
 * Stores one uploaded PDF and queues it for extraction.
 *
 * Returns as soon as the row exists — parsing happens on the worker, so a batch
 * of twenty PDFs is twenty quick requests rather than one request that holds a
 * connection open through twenty LLM round-trips.
 */
export async function createUploadedInvoice(
  orgId: number,
  filename: string,
  pdf: Buffer,
): Promise<UploadedInvoice> {
  const [serviceId, recipientId] = await Promise.all([
    resolveServiceId(UPLOAD_SERVICE_NAME, UPLOAD_SERVICE_SENDER),
    resolveRecipientId(orgId),
  ]);

  const messageId = `${UPLOAD_MESSAGE_PREFIX}${randomUUID()}`;
  const pdfId = randomUUID();

  /*
   * Order matters, and it is: GridFS, then both rows in one transaction.
   *
   * Mongo is the failure-prone step — it is reached over a network — and doing
   * it first means a failure leaves nothing behind in Postgres to clean up.
   * The reverse order orphans a billing.email row on every failed upload, and
   * those rows are invisible: nothing joins to them without an invoice.
   *
   * The residue this order can leave is an unreferenced GridFS blob, which
   * costs storage and nothing else.
   */
  await putPdf(pdfId, pdf, filename);

  const invoiceId = await db.transaction().execute(async (trx) => {
    const email = await trx
      .insertInto('billing.email')
      .values({
        recipient_id: recipientId,
        server_id: serviceId,
        message_id: messageId,
        subject: filename,
        delivered_at: new Date(),
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const invoice = await trx
      .insertInto('billing.invoices')
      .values({
        org_id: orgId,
        email_id: Number(email.id),
        pdf_id: pdfId,
        status: 'pdf_fetched',
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    return Number(invoice.id);
  });
  await enqueue(
    'extract-invoice',
    // accountId is unused downstream whenever pdf_id is set, which it always is
    // here — an upload has no Gmail account to read from.
    { accountId: 0, invoiceId, messageId },
    { jobId: `extract-${invoiceId}`, attempts: 2 },
  );

  return { invoiceId, filename };
}

/**
 * Legal-entity suffixes, stripped before matching a vendor name.
 *
 * Not cosmetic. The invoice page says "Neon Inc." while the service created
 * from the sending address is "Neon", so a case-insensitive exact match misses
 * and creates a second vendor row — which then splits that vendor's spend
 * across two entries and halves it in every per-vendor total. Observed on the
 * first upload put through this path.
 */
const LEGAL_SUFFIXES = new Set([
  'inc',
  'incorporated',
  'llc',
  'llp',
  'ltd',
  'limited',
  'corp',
  'corporation',
  'co',
  'company',
  'pbc',
  'gmbh',
  'ag',
  'bv',
  'nv',
  'sa',
  'sas',
  'srl',
  'plc',
  'pty',
  'ab',
  'oy',
  'as',
]);

/**
 * A comparison key for vendor names: lowercased, punctuation dropped, trailing
 * legal suffixes removed. "Neon Inc." and "Neon" both reduce to "neon".
 */
export function vendorMatchKey(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);

  while (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1] as string)) {
    words.pop();
  }
  return words.join(' ');
}

/**
 * Re-points an uploaded invoice at the vendor extraction found, so it stops
 * sitting under "Uploaded" and joins that vendor's spend.
 *
 * Matches against existing services first and only creates one on a miss,
 * because a vendor split in two is worse than a vendor named slightly oddly:
 * the first corrupts every total, the second is cosmetic.
 *
 * A no-op for anything that is not an upload: a Gmail-ingested invoice knows
 * its vendor from the sending address, which beats anything read off the page.
 */
export async function attachUploadedInvoiceVendor(
  invoiceId: number,
  vendorName: string | null,
): Promise<string | undefined> {
  const name = vendorName?.trim();
  if (!name) return undefined;

  const email = await db
    .selectFrom('billing.email')
    .innerJoin('billing.invoices', 'billing.invoices.email_id', 'billing.email.id')
    .select(['billing.email.id as emailId', 'billing.email.message_id as messageId'])
    .where('billing.invoices.id', '=', invoiceId)
    .executeTakeFirst();

  if (!email?.messageId.startsWith(UPLOAD_MESSAGE_PREFIX)) return undefined;

  /*
   * Matched in JS rather than SQL because the key strips trailing legal
   * suffixes, which no index can express. The table is one row per vendor —
   * tens, not thousands — so reading it whole costs nothing.
   */
  const key = vendorMatchKey(name);
  const services = await db
    .selectFrom('server.service')
    .select(['id', 'name'])
    .where('name', '!=', UPLOAD_SERVICE_NAME)
    .orderBy('id')
    .execute();

  const match = services.find((s) => vendorMatchKey(s.name) === key);

  const serviceId = match ? Number(match.id) : await resolveServiceId(name, `upload:${key}`);

  await db
    .updateTable('billing.email')
    .set({ server_id: serviceId })
    .where('id', '=', email.emailId)
    .execute();

  return match?.name ?? name;
}
