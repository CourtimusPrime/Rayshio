import { db } from '../../db/client.js';
import { fetchMessage } from '../../gmail/messages.js';
import { gmailClientForAccount } from '../../gmail/oauth.js';
import { extractInvoice as llmExtract } from '../../llm/extract.js';
import type { Extraction } from '../../llm/schemas.js';
import { getPdf } from '../../mongo/pdfs.js';
import type { JobPayloads } from '../../queue/queues.js';
import { pdfToText } from '../pdf-text.js';
import { reconcile } from '../reconcile.js';

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

  return `parsed: ${extraction.line_items.length} line items, total ${extraction.total_minor} ${extraction.currency}`;
}
