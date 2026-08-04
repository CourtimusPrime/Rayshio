import { randomUUID } from 'node:crypto';
import { db } from '../../db/client.js';
import { fetchAttachment, fetchMessage } from '../../gmail/messages.js';
import { gmailClientForAccount } from '../../gmail/oauth.js';
import { putPdf } from '../../mongo/pdfs.js';
import type { JobPayloads } from '../../queue/queues.js';
import { enqueue } from '../../queue/queues.js';

/**
 * Stage 2. Downloads the message's PDF attachment into GridFS and points
 * invoices.pdf_id at it. Emails with no PDF (HTML-body receipts) pass through
 * with pdf_id null — extraction falls back to body text.
 */
export async function fetchPdf(payload: JobPayloads['fetch-pdf']): Promise<string> {
  const { accountId, invoiceId, messageId } = payload;
  const { gmail } = await gmailClientForAccount(accountId);
  const msg = await fetchMessage(gmail, messageId);

  let result: string;
  if (msg.pdfAttachments.length > 0) {
    const attachment = msg.pdfAttachments[0];
    if (!attachment) throw new Error('unreachable');
    const data = await fetchAttachment(gmail, messageId, attachment.attachmentId);
    const invoice = await db
      .selectFrom('billing.invoices')
      .select('pdf_id')
      .where('id', '=', invoiceId)
      .executeTakeFirstOrThrow();
    const pdfId = invoice.pdf_id ?? randomUUID();
    await putPdf(pdfId, data, attachment.filename || `invoice-${invoiceId}.pdf`);
    await db
      .updateTable('billing.invoices')
      .set({ pdf_id: pdfId, status: 'pdf_fetched' })
      .where('id', '=', invoiceId)
      .execute();
    result = `pdf stored (${data.length} bytes)`;
  } else {
    await db
      .updateTable('billing.invoices')
      .set({ status: 'pdf_fetched' })
      .where('id', '=', invoiceId)
      .execute();
    result = 'no pdf attachment — will extract from body';
  }

  await enqueue(
    'extract-invoice',
    { accountId, invoiceId, messageId },
    { jobId: `extract-${invoiceId}`, attempts: 2 },
  );
  return result;
}
