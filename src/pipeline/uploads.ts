import { createHash, randomUUID } from 'node:crypto';
import { db } from '../db/client.js';
import { deletePdf, putPdf } from '../mongo/pdfs.js';
import { enqueue, removeJob } from '../queue/queues.js';

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

/**
 * The outcome of one upload.
 *
 * A discriminated union rather than a bare id, because "here is your invoice"
 * and "you already have this invoice" are different answers and the caller has
 * to say which one happened. `invoiceId` on a duplicate points at the row the
 * org already had — the one worth linking to — not at anything just created,
 * because nothing was.
 */
export type UploadResult =
  | { kind: 'created'; invoiceId: number; filename: string }
  | { kind: 'duplicate'; invoiceId: number; filename: string };

/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = '23505';

/** The digest that identifies an uploaded file, independent of what it is named. */
function digestOf(pdf: Buffer): string {
  return createHash('sha256').update(pdf).digest('hex');
}

async function findByDigest(orgId: number, sha: string): Promise<number | undefined> {
  const row = await db
    .selectFrom('billing.invoices')
    .select('id')
    .where('org_id', '=', orgId)
    .where('pdf_sha256', '=', sha)
    .executeTakeFirst();
  return row ? Number(row.id) : undefined;
}

/**
 * Stores one uploaded PDF and queues it for extraction, unless the org already
 * has it.
 *
 * Returns as soon as the row exists — parsing happens on the worker, so a batch
 * of twenty PDFs is twenty quick requests rather than one request that holds a
 * connection open through twenty LLM round-trips.
 *
 * The digest check is first for a reason: it is the only duplicate test that
 * can run *before* anything is spent. The invoice number is the better key, but
 * it does not exist until an LLM has read the document, so leaning on it alone
 * would mean paying for the extraction of every file the org already has.
 */
export async function createUploadedInvoice(
  orgId: number,
  filename: string,
  pdf: Buffer,
): Promise<UploadResult> {
  const sha = digestOf(pdf);

  const already = await findByDigest(orgId, sha);
  if (already !== undefined) return { kind: 'duplicate', invoiceId: already, filename };

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

  let invoiceId: number;
  try {
    invoiceId = await db.transaction().execute(async (trx) => {
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
          pdf_sha256: sha,
          status: 'pdf_fetched',
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      return Number(invoice.id);
    });
  } catch (err) {
    /*
     * The check above is not atomic with the insert, so two uploads of the same
     * file in flight together both pass it and the second one lands here. The
     * partial unique index is what actually enforces this; the SELECT exists to
     * make the common case cheap, not to be the guarantee.
     *
     * The transaction rolled back, so there is no row pointing at the blob
     * written a moment ago — clean it up rather than leave it orphaned, which
     * is the one piece of residue this path can create.
     */
    if ((err as { code?: string }).code !== UNIQUE_VIOLATION) throw err;
    await deletePdf(pdfId);

    const winner = await findByDigest(orgId, sha);
    if (winner === undefined) throw err; // the collision was not the one expected
    return { kind: 'duplicate', invoiceId: winner, filename };
  }

  await enqueue(
    'extract-invoice',
    // accountId is unused downstream whenever pdf_id is set, which it always is
    // here — an upload has no Gmail account to read from.
    { accountId: 0, invoiceId, messageId },
    { jobId: `extract-${invoiceId}`, attempts: 2 },
  );

  return { kind: 'created', invoiceId, filename };
}

/**
 * Whether this invoice came from the upload endpoint rather than the mailbox.
 *
 * Reads the synthetic email's `message_id` prefix, which is the only durable
 * marker of an upload — the service the invoice hangs off is re-pointed at the
 * real vendor once extraction names it, so "sits under Uploaded" stops being
 * true within seconds of the upload and cannot be the test.
 */
export async function isUploadedInvoice(orgId: number, invoiceId: number): Promise<boolean> {
  const row = await db
    .selectFrom('billing.invoices as i')
    .innerJoin('billing.email as e', 'e.id', 'i.email_id')
    .select('e.message_id as messageId')
    .where('i.id', '=', invoiceId)
    .where('i.org_id', '=', orgId)
    .executeTakeFirst();
  return row?.messageId.startsWith(UPLOAD_MESSAGE_PREFIX) ?? false;
}

export interface DeleteResult {
  deleted: boolean;
  reason?: string;
}

/**
 * Removes an uploaded invoice and everything that exists only because of it.
 *
 * Restricted to uploads on purpose. A Gmail-ingested invoice is derived data —
 * deleting the row would not delete the mail it came from, so the next sync
 * would re-ingest it and the delete would look like it silently failed. An
 * upload has no such source: the PDF the user sent is the only copy, so
 * removing it is both possible and final.
 *
 * Order is Postgres first, then GridFS — the mirror of the upload path, and for
 * the same reason. The row is what makes the invoice visible; a failure after
 * it is gone leaves an unreferenced blob, which costs storage. The reverse
 * order deletes the PDF out from under a surviving row, leaving an invoice that
 * offers an "Open PDF" link to a file that is no longer there.
 */
export async function deleteUploadedInvoice(
  orgId: number,
  invoiceId: number,
): Promise<DeleteResult> {
  const row = await db
    .selectFrom('billing.invoices as i')
    .innerJoin('billing.email as e', 'e.id', 'i.email_id')
    .select(['i.pdf_id as pdfId', 'i.email_id as emailId', 'e.message_id as messageId'])
    .where('i.id', '=', invoiceId)
    .where('i.org_id', '=', orgId)
    .executeTakeFirst();

  // One reason for both "no such invoice" and "another tenant's invoice" — the
  // caller must not be able to tell those apart.
  if (!row) return { deleted: false, reason: 'not found in this workspace' };
  if (!row.messageId.startsWith(UPLOAD_MESSAGE_PREFIX)) {
    return {
      deleted: false,
      reason: 'only uploaded invoices can be deleted — this one came from the mailbox',
    };
  }

  await db.transaction().execute(async (trx) => {
    // Line items go with it: they carry `ON DELETE CASCADE` on invoice_id.
    await trx.deleteFrom('billing.invoices').where('id', '=', invoiceId).execute();
    // The email row is synthetic — created by the upload, referenced by nothing
    // else (`billing.invoices.email_id` is UNIQUE), and invisible to every
    // listing query once its invoice is gone.
    await trx.deleteFrom('billing.email').where('id', '=', Number(row.emailId)).execute();
  });

  // Deleting mid-parse is the normal case, not an edge one: the button is most
  // useful right after a mistaken upload, while extraction is still queued.
  await removeJob(`extract-${invoiceId}`);

  if (row.pdfId) await deletePdf(row.pdfId);

  return { deleted: true };
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
