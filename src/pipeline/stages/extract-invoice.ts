import { db } from '../../db/client.js';
import { fetchMessage } from '../../gmail/messages.js';
import { gmailClientForAccount } from '../../gmail/oauth.js';
import { extractInvoice as llmExtract } from '../../llm/extract.js';
import type { Extraction } from '../../llm/schemas.js';
import { getPdf } from '../../mongo/pdfs.js';
import type { JobPayloads } from '../../queue/queues.js';
import { DUPLICATE_PREFIX, NOT_AN_INVOICE_REASON } from '../failure-reasons.js';
import { pdfToText } from '../pdf-text.js';
import { reconcile } from '../reconcile.js';
import { attachUploadedInvoiceVendor, isUploadedInvoice } from '../uploads.js';

/**
 * An invoice this org already has from this vendor, under this invoice number.
 *
 * The natural key the documents themselves carry. The upload endpoint catches
 * byte-identical re-uploads earlier and far more cheaply via the PDF digest;
 * this is the layer that still works when the same invoice is re-downloaded
 * (so the bytes differ) or uploaded after the mailbox already ingested it.
 *
 * Deliberately narrow. Same org, same vendor, and only against invoices that
 * actually made it to `parsed` — comparing against failed rows would let one
 * bad extraction poison every later attempt at the same document. A vendor that
 * re-issues an invoice number would false-positive here; that is the known cost
 * of the rule, and it is why the loser is marked `failed` (reversible, visible
 * under the Invoices "failed" filter) rather than deleted.
 *
 * Returns undefined when the document carries no invoice number: there is no
 * key to compare, and treating "unnumbered" as a value would collapse every
 * unnumbered invoice in the org into one.
 */
async function findExistingInvoiceNumber(
  orgId: number,
  invoiceId: number,
  invoiceNumber: string | null,
): Promise<number | undefined> {
  if (!invoiceNumber) return undefined;

  const self = await db
    .selectFrom('billing.invoices as i')
    .innerJoin('billing.email as e', 'e.id', 'i.email_id')
    .select('e.server_id as serviceId')
    .where('i.id', '=', invoiceId)
    .executeTakeFirst();
  if (!self) return undefined;

  // The join is the vendor filter *and* part of the org filter; `i.org_id` is
  // still applied directly so this cannot widen if the join ever changes.
  const row = await db
    .selectFrom('billing.invoices as i')
    .innerJoin('billing.email as e', 'e.id', 'i.email_id')
    .select('i.id as id')
    .where('i.org_id', '=', orgId)
    .where('e.server_id', '=', self.serviceId)
    .where('i.invoice_number', '=', invoiceNumber)
    .where('i.status', '=', 'parsed')
    .where('i.id', '!=', invoiceId)
    .orderBy('i.id')
    .executeTakeFirst();

  return row ? Number(row.id) : undefined;
}

/** Marks the invoice failed with a reason. Business failures are terminal, not retried. */
async function markFailed(invoiceId: number, reason: string): Promise<string> {
  await db
    .updateTable('billing.invoices')
    .set({ status: 'failed', failure_reason: reason.slice(0, 2000) })
    .where('id', '=', invoiceId)
    .execute();
  return `failed: ${reason}`;
}

/**
 * Stage 3. PDF (or body) text → LLM structured extraction → reconciliation → write.
 * Reconciliation failure retries once on the escalation model before failing the invoice.
 */
export async function extractInvoice(payload: JobPayloads['extract-invoice']): Promise<string> {
  const { accountId, invoiceId, messageId } = payload;

  const invoice = await db
    .selectFrom('billing.invoices')
    .selectAll()
    .where('id', '=', invoiceId)
    .executeTakeFirstOrThrow();

  let text: string;
  if (invoice.pdf_id) {
    text = await pdfToText(await getPdf(invoice.pdf_id));
  } else {
    const { gmail } = await gmailClientForAccount(accountId);
    const msg = await fetchMessage(gmail, messageId);
    text = msg.bodyText;
  }
  if (text.trim().length < 20) {
    return markFailed(invoiceId, 'extraction: no usable text (scanned/image-only pdf?)');
  }

  let extraction: Extraction;
  try {
    extraction = await llmExtract(text);
  } catch (err) {
    return markFailed(invoiceId, `extraction: ${(err as Error).message}`);
  }

  let rec = reconcile(extraction);
  if (!rec.ok) {
    try {
      const escalated = await llmExtract(text, { escalate: true });
      const escalatedRec = reconcile(escalated);
      if (escalatedRec.ok) {
        extraction = escalated;
        rec = escalatedRec;
      }
    } catch {
      // escalation attempt failed — fall through to reconciliation failure
    }
  }
  if (!rec.ok) {
    return markFailed(
      invoiceId,
      `reconciliation: sum=${rec.sum} value=${rec.total} tolerance=${rec.tolerance}`,
    );
  }

  /*
   * A bill for nothing is not a bill — unless somebody went and uploaded it.
   *
   * The heuristic in stage 1 catches most non-invoices by subject, but some
   * arrive looking exactly like one — "Your invoice is available" with the
   * amount behind a link, or a purchase confirmation carrying no figure. They
   * extract cleanly to a total of zero and used to land as `parsed`, where they
   * counted toward the invoice and vendor totals on the dashboard while
   * contributing no spend.
   *
   * That reasoning is about *mail the pipeline selected for itself*, and it does
   * not transfer to an upload. Nobody drags a marketing email into the upload
   * box; they drag the invoice their vendor issued, and a month with no usage
   * produces a real invoice totalling 0.00 — Microsoft issues them, and this
   * rule was rejecting them with "not an invoice: no amount on the document"
   * while the document stated its total four times.
   *
   * So the test is not "is this zero" but "is this zero *and* did we choose it
   * ourselves". A zero-value upload lands as `parsed` and contributes nothing to
   * spend, which is exactly what it should contribute.
   *
   * Zero specifically, not `<= 0`: a negative total is a credit note, which is
   * a real document with a real effect on spend.
   */
  if (
    extraction.total_minor === 0 &&
    !(await isUploadedInvoice(Number(invoice.org_id), invoiceId))
  ) {
    return markFailed(invoiceId, NOT_AN_INVOICE_REASON);
  }

  /*
   * Vendor attribution moved ahead of the write so the duplicate check below
   * has a real vendor to compare against.
   *
   * An upload hangs off the "Uploaded" service until this call re-points it at
   * whoever the document names. Run afterwards — as it used to be — and every
   * upload still looks like the same vendor at duplicate-check time, so two
   * unrelated invoices that happened to share an invoice number would collide
   * while a genuine re-upload of a Microsoft bill would not be compared against
   * the Microsoft invoice already on file.
   *
   * Still a no-op for a Gmail-ingested invoice, which keeps the vendor its
   * sending address already established.
   */
  const vendor = await attachUploadedInvoiceVendor(invoiceId, extraction.vendor_name);

  const duplicateOf = await findExistingInvoiceNumber(
    Number(invoice.org_id),
    invoiceId,
    extraction.invoice_number,
  );
  if (duplicateOf !== undefined) {
    return markFailed(
      invoiceId,
      `${DUPLICATE_PREFIX}invoice ${extraction.invoice_number} already recorded as #${duplicateOf}`,
    );
  }

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable('billing.invoices')
      .set({
        invoice_number: extraction.invoice_number,
        value: extraction.total_minor,
        currency: extraction.currency.toUpperCase(),
        invoice_date: extraction.invoice_date,
        due_date: extraction.due_date,
        period_start: extraction.period_start,
        period_end: extraction.period_end,
        status: 'parsed',
        failure_reason: null,
      })
      .where('id', '=', invoiceId)
      .execute();

    // delete-then-insert keyed by invoice_id keeps re-runs idempotent
    await trx
      .deleteFrom('billing.invoice_line_items')
      .where('invoice_id', '=', invoiceId)
      .execute();
    await trx
      .insertInto('billing.invoice_line_items')
      .values(
        extraction.line_items.map((li) => ({
          invoice_id: invoiceId,
          description: li.description,
          category: li.category,
          quantity: li.quantity,
          unit: li.unit,
          rate: li.rate_minor,
          amount: li.amount_minor,
          period_start: li.period_start,
          period_end: li.period_end,
        })),
      )
      .execute();
  });

  const attribution = vendor ? ` (vendor: ${vendor})` : '';
  return `parsed: ${extraction.line_items.length} line items, total ${extraction.total_minor} ${extraction.currency}${attribution}`;
}
