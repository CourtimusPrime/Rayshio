/**
 * What *kind* of document an invoice row came from.
 *
 * Distinct from `status`, which tracks how far through the pipeline a row got
 * (`pending → classified → pdf_fetched → parsed`). That is an implementation
 * detail of ingestion: useful when something breaks, meaningless to someone
 * reconciling spend. The document type answers the question a person actually
 * has in front of a list — is there a document behind this figure, and is it a
 * bill or proof of payment.
 *
 * Derived rather than stored, deliberately. Nothing in the extraction schema
 * records a document type today, so a column would be null for every existing
 * row and could only be filled by re-running extraction over the whole table.
 * This reads the two signals already present, and can be replaced by a real
 * extracted field later without changing what the API returns.
 */

export type DocumentType = 'invoice' | 'receipt' | 'email';

/**
 * Subjects that announce proof of payment.
 *
 * The `(?!@)` is load-bearing and not obvious: `\b` treats `@` as a word
 * boundary, so a bare `\breceipts?\b` matches the address in "Invoice from
 * receipts@vendor.com" and files a plain invoice as a receipt. The lookahead
 * keeps the word from matching when it is really the local part of an address.
 */
const RECEIPT_SUBJECT =
  /\breceipts?\b(?!@)|\bpayment (received|confirmation)\b|\bthank you for your payment\b/i;

export interface DocumentTypeInput {
  /** Null when the vendor billed in the email body and attached nothing. */
  pdfId: string | null;
  subject: string | null;
}

/**
 * The rule, in order:
 *
 * 1. **No PDF is `email`.** The figures were read out of the message body,
 *    which is the one case where there is no document to open, forward, or
 *    hand to an accountant — so it is the distinction most worth surfacing.
 * 2. **A subject that announces a receipt is `receipt`.** Vendors that send
 *    proof of payment say so: "Your receipt from…", "Payment received".
 * 3. **Everything else with a PDF is `invoice`.** This is the useful default
 *    rather than an admission of defeat: it covers subjects that say "invoice"
 *    outright, and manual uploads, whose subject is the filename and carries
 *    no signal at all — and a document uploaded through a button labelled
 *    "Upload invoices" is an invoice unless something says otherwise.
 */
export function classifyDocumentType({ pdfId, subject }: DocumentTypeInput): DocumentType {
  if (!pdfId) return 'email';
  if (subject && RECEIPT_SUBJECT.test(subject)) return 'receipt';
  return 'invoice';
}
