/**
 * The vocabulary of `billing.invoices.failure_reason`, and the one function that
 * reads it.
 *
 * `failure_reason` is free text — the pipeline writes prose so an operator can
 * tell at a glance why a row died. That is worth keeping, but it means the only
 * way to answer "what kind of failure was this" is to inspect the string, and
 * that inspection must happen in exactly one place. Scattering
 * `startsWith('not an invoice')` across the API, the CLI and the client is how
 * the categories silently drift apart the first time a reason is reworded.
 *
 * So: reasons are built from the prefixes below, and classified by the function
 * below. Adding a failure mode means adding a prefix here, not a comparison
 * somewhere else.
 */

/**
 * Retires invoices that were never invoices.
 *
 * Trusting the sender rather than the message meant every announcement from a
 * known billing address landed as an invoice — product updates, "payment method
 * added", "your workspace is ready". They extract to a total of zero, so they
 * add nothing to spend, but they inflate the invoice count and put phantom
 * vendors in the breakdowns.
 *
 * They are marked `failed`, not deleted. Failed invoices are already excluded
 * from every spend query and every count, so the numbers correct themselves,
 * while the row stays visible under the Invoices page's "failed" filter — which
 * is what makes this reversible if the rule ever proves too broad. Deleting
 * would also re-open the door for the next sync to ingest them again.
 */
export const NOT_AN_INVOICE_REASON = 'not an invoice: no amount on the document';

/**
 * The other kind of non-invoice: money coming *in*.
 *
 * A zero-value row adds nothing to spend, so it only distorts counts. These do
 * worse — they carry a real amount and are counted as cost the org never
 * incurred. The heuristic rejects them at ingest; `prune-non-invoices` retires
 * the ones already in the table.
 */
export const INBOUND_MONEY_REASON = 'not an invoice: inbound payment, not a bill';

/**
 * Shared by both of the above, and the test for the whole category.
 *
 * A file the user chose to upload that turns out not to be a bill is a
 * different event from one that crashed the extractor, and the interface says
 * so — "wasn't an invoice" is information, "errored" is a fault.
 */
export const NOT_AN_INVOICE_PREFIX = 'not an invoice: ';

/**
 * An invoice the org already has.
 *
 * Written by `extract-invoice` when a freshly parsed document turns out to
 * carry an invoice number this vendor has already billed under. The upload
 * endpoint catches byte-identical re-uploads earlier and more cheaply, via the
 * PDF digest — this covers the copy that differs by a byte, and the upload of
 * something already ingested from the mailbox.
 */
export const DUPLICATE_PREFIX = 'duplicate: ';

/**
 * What became of one file, from the point of view of the person who uploaded it.
 *
 * Deliberately coarser than `status` + `failure_reason`. Those describe the
 * pipeline; these describe outcomes a person asked for. `pending` is every
 * non-terminal pipeline status collapsed into one, because "classified" and
 * "pdf_fetched" are not distinctions a user has any use for.
 */
export type Outcome = 'pending' | 'added' | 'duplicate' | 'not_invoice' | 'error';

/**
 * Classifies one invoice row.
 *
 * Order matters: the two specific prefixes are tested before the fallback, and
 * the fallback is `error` rather than anything softer. A failure this function
 * does not recognise is a failure nobody has categorised yet, and showing it as
 * a fault is the honest default — the alternative silently files unknown
 * breakage under a reassuring heading.
 */
export function classifyOutcome(status: string, failureReason: string | null): Outcome {
  if (status === 'parsed') return 'added';
  if (status !== 'failed') return 'pending';

  const reason = failureReason ?? '';
  if (reason.startsWith(DUPLICATE_PREFIX)) return 'duplicate';
  if (reason.startsWith(NOT_AN_INVOICE_PREFIX)) return 'not_invoice';
  return 'error';
}
