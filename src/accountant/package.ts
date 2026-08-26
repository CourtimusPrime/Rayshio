/**
 * Turning a set of untracked invoices into the thing that lands in an
 * accountant's inbox: one zip, and a covering note that says what is in it.
 *
 * Everything here is pure apart from the `loadPdf` callback the caller supplies,
 * so the selection rules, the filenames and the summary arithmetic are testable
 * without Mongo, Postgres or a mail provider.
 */

import JSZip from 'jszip';
import { MAX_ATTACHMENT_BYTES } from '../email/send.js';
import type { UntrackedInvoice } from '../queries/accountant.js';

export interface PackagedInvoice extends UntrackedInvoice {
  /** Value in the display currency, at the rate for this invoice's own date. */
  converted_value: number;
  filename: string;
}

export interface InvoicePackage {
  zip: Buffer;
  included: PackagedInvoice[];
  /**
   * Invoices left out of *this* send because the archive hit the attachment
   * ceiling. They are not recorded as delivered, so they lead the next batch.
   */
  deferred: UntrackedInvoice[];
  /** Included invoices that had no stored PDF; the covering note lists them. */
  withoutPdf: PackagedInvoice[];
  summary: PackageSummary;
}

export interface PackageSummary {
  invoice_count: number;
  service_count: number;
  period_start: string | null;
  period_end: string | null;
  total_minor: number;
  currency: string;
}

/**
 * A filename an accountant can sort and search without opening anything:
 * `2026-08-13_OpenRouter_XROFBRAV-0095.pdf`.
 *
 * Date first because a bookkeeper works in date order, and lexical order and
 * chronological order then agree. Everything outside `[A-Za-z0-9._-]` collapses
 * to a single `-`: vendor names carry slashes, ampersands and non-breaking
 * spaces, and a slash in a zip entry name is a directory separator, so leaving
 * it in would silently scatter the invoices into folders named after fragments
 * of vendors.
 */
export function invoiceFilename(invoice: UntrackedInvoice): string {
  const parts = [invoice.effective_date, invoice.service, invoice.invoice_number ?? ''].filter(
    (p) => p !== '',
  );
  const stem = parts
    .join('_')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    // A vendor named entirely in characters that do not survive sanitising —
    // CJK, emoji, a stray '///' — leaves its separators behind and produces
    // `2026-03-15_.pdf`. Collapse runs, then trim the ends, so the name degrades
    // to just the date rather than to punctuation.
    .replace(/[-_]{2,}/g, '_')
    .replace(/^[-_.]+|[-_.]+$/g, '');
  return `${stem || `invoice-${invoice.invoice_id}`}.pdf`;
}

/**
 * Makes every name in the archive unique.
 *
 * Two invoices from the same vendor on the same day with no invoice number
 * produce identical stems, and a zip with two identical entry names is a zip
 * where one of them is unreachable — the second silently replaces the first in
 * most extractors. The invoice id is what disambiguates, because it is the one
 * thing guaranteed to differ.
 */
export function uniqueFilenames(invoices: UntrackedInvoice[]): Map<number, string> {
  const used = new Set<string>();
  const names = new Map<number, string>();
  for (const invoice of invoices) {
    let name = invoiceFilename(invoice);
    if (used.has(name)) name = name.replace(/\.pdf$/, `_${invoice.invoice_id}.pdf`);
    used.add(name);
    names.set(invoice.invoice_id, name);
  }
  return names;
}

export function summarize(invoices: PackagedInvoice[], currency: string): PackageSummary {
  const dates = invoices.map((i) => i.effective_date).sort();
  return {
    invoice_count: invoices.length,
    service_count: new Set(invoices.map((i) => i.service)).size,
    period_start: dates[0] ?? null,
    period_end: dates[dates.length - 1] ?? null,
    total_minor: invoices.reduce((sum, i) => sum + i.converted_value, 0),
    currency,
  };
}

/**
 * Ceiling on invoices per send, independent of the byte ceiling.
 *
 * 25 MB of PDFs is roughly eight hundred invoices at typical sizes, and
 * fetching that many blobs out of GridFS inside one HTTP request is how a send
 * dies to a proxy timeout with the mail already gone and the ledger not yet
 * written — the one ordering this design exists to avoid. A first send from a
 * long-established mailbox is exactly the case that would hit it.
 *
 * The overflow is deferred, not dropped, and the tab tells the user to send
 * again — so a backlog drains in date order over a few clicks.
 */
export const MAX_INVOICES_PER_SEND = 150;

export interface BuildPackageOptions {
  invoices: (UntrackedInvoice & { converted_value: number })[];
  currency: string;
  loadPdf: (pdfId: string) => Promise<Buffer>;
  maxBytes?: number;
  maxInvoices?: number;
}

/**
 * Builds the archive, oldest invoice first, stopping before the attachment
 * ceiling.
 *
 * Oldest first is what makes the ceiling harmless rather than arbitrary: a
 * workspace with more history than fits in one message sends the backlog in
 * date order across successive clicks, and the accountant receives it the way
 * they would have filed it anyway. Selecting newest first would leave the
 * oldest invoices permanently at the back of a queue that never drains.
 *
 * An invoice whose PDF is missing (body-text extraction, or a blob that has
 * gone) is still *included* and still marked delivered. Its figures are in the
 * covering note, and holding it back forever because there is no attachment to
 * send would mean the count on the tab never reaches zero.
 */
export async function buildPackage(options: BuildPackageOptions): Promise<InvoicePackage> {
  const maxBytes = options.maxBytes ?? MAX_ATTACHMENT_BYTES;
  const maxInvoices = options.maxInvoices ?? MAX_INVOICES_PER_SEND;
  const names = uniqueFilenames(options.invoices);

  const zip = new JSZip();
  const included: PackagedInvoice[] = [];
  const deferred: UntrackedInvoice[] = [];
  const withoutPdf: PackagedInvoice[] = [];
  let bytes = 0;
  let full = false;

  for (const invoice of options.invoices) {
    const filename = names.get(invoice.invoice_id) ?? `invoice-${invoice.invoice_id}.pdf`;
    const packaged: PackagedInvoice = { ...invoice, filename };

    // Once the archive is full every later invoice is deferred, including ones
    // small enough to fit. Slipping a small invoice past a large one would
    // break the date ordering the accountant is being handed.
    if (full || included.length >= maxInvoices) {
      deferred.push(invoice);
      continue;
    }

    if (!invoice.pdf_id) {
      included.push(packaged);
      withoutPdf.push(packaged);
      continue;
    }

    let pdf: Buffer;
    try {
      pdf = await options.loadPdf(invoice.pdf_id);
    } catch {
      // The row points at a blob that is no longer in GridFS. Treat it as an
      // invoice without a PDF rather than failing the whole send: one missing
      // attachment must not hold up the other ninety-nine.
      included.push(packaged);
      withoutPdf.push(packaged);
      continue;
    }

    if (bytes + pdf.length > maxBytes && included.length > 0) {
      full = true;
      deferred.push(invoice);
      continue;
    }

    zip.file(filename, pdf);
    bytes += pdf.length;
    included.push(packaged);
  }

  const archive = await zip.generateAsync({
    type: 'nodebuffer',
    // PDFs are already compressed; DEFLATE buys a percent or two for real CPU
    // time on a request the user is waiting on.
    compression: 'STORE',
  });

  return {
    zip: archive,
    included,
    deferred,
    withoutPdf,
    summary: summarize(included, options.currency),
  };
}

/** `zip` name mirroring the covering note: the range, so files never collide. */
export function archiveFilename(summary: PackageSummary): string {
  const from = summary.period_start ?? 'invoices';
  const to = summary.period_end ?? '';
  return `rayshio-invoices_${from}${to && to !== from ? `_${to}` : ''}.zip`;
}
