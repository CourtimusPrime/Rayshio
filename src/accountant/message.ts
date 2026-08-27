/**
 * The covering note that travels with the zip.
 *
 * It answers, without the accountant opening the archive, the three questions
 * they would otherwise have to open it to answer: which period this covers, how
 * many vendors are in it, and what it comes to in total. A per-vendor list
 * follows, because reconciling against a ledger is a per-vendor job and the
 * alternative is counting PDFs by hand.
 *
 * Plain text as the source of truth, HTML derived from it. A bookkeeping inbox
 * is as likely to be Outlook in plain-text mode as anything else, and a message
 * whose only readable form is HTML is a message that arrives empty there.
 */

import { formatMinor } from '../queries/format.js';
import type { PackageSummary, PackagedInvoice } from './package.js';

export interface MessageInput {
  summary: PackageSummary;
  invoices: PackagedInvoice[];
  archiveName: string;
  /** Invoices left for the next send because the attachment ceiling was hit. */
  deferredCount: number;
  /** Included invoices with no PDF — figures only, no document. */
  withoutPdf: PackagedInvoice[];
  /** Set when totals were converted from other currencies. */
  sourceCurrencies?: string[];
  workspaceName?: string | undefined;
}

function periodLabel(summary: PackageSummary): string {
  if (!summary.period_start) return 'no dated invoices';
  if (!summary.period_end || summary.period_end === summary.period_start) {
    return summary.period_start;
  }
  return `${summary.period_start} to ${summary.period_end}`;
}

export function subjectFor(input: MessageInput): string {
  const { summary } = input;
  const who = input.workspaceName ? `${input.workspaceName} — ` : '';
  return `${who}${summary.invoice_count} invoice${summary.invoice_count === 1 ? '' : 's'}, ${periodLabel(summary)}`;
}

interface ServiceLine {
  service: string;
  count: number;
  total_minor: number;
}

/** Per-vendor rollup, biggest spend first — the order a reviewer reads in. */
export function serviceLines(invoices: PackagedInvoice[]): ServiceLine[] {
  const byService = new Map<string, ServiceLine>();
  for (const invoice of invoices) {
    const line = byService.get(invoice.service) ?? {
      service: invoice.service,
      count: 0,
      total_minor: 0,
    };
    line.count += 1;
    line.total_minor += invoice.converted_value;
    byService.set(invoice.service, line);
  }
  return [...byService.values()].sort((a, b) => b.total_minor - a.total_minor);
}

export function textBody(input: MessageInput): string {
  const { summary } = input;
  const lines: string[] = [];

  lines.push(`Invoices for ${periodLabel(summary)}.`);
  lines.push('');
  lines.push(`Period:    ${periodLabel(summary)}`);
  lines.push(`Services:  ${summary.service_count}`);
  lines.push(`Invoices:  ${summary.invoice_count}`);
  lines.push(`Total:     ${formatMinor(summary.total_minor, summary.currency)}`);
  lines.push('');
  lines.push(`Attached: ${input.archiveName}`);
  lines.push('');

  for (const line of serviceLines(input.invoices)) {
    lines.push(
      `  ${line.service} — ${line.count} invoice${line.count === 1 ? '' : 's'}, ${formatMinor(line.total_minor, summary.currency)}`,
    );
  }

  const others = (input.sourceCurrencies ?? []).filter((c) => c !== summary.currency);
  if (others.length > 0) {
    lines.push('');
    lines.push(
      `Totals are shown in ${summary.currency}. Invoices billed in ${others.join(', ')} were converted at the rate for each invoice's own date; each PDF states its original amount.`,
    );
  }

  /*
   * Both caveats are stated rather than quietly handled. An accountant counting
   * attachments against the invoice count will find a discrepancy either way,
   * and a note explaining it is the difference between a footnote and a phone
   * call.
   */
  if (input.withoutPdf.length > 0) {
    lines.push('');
    lines.push(
      `${input.withoutPdf.length} invoice${input.withoutPdf.length === 1 ? ' is' : 's are'} included in the totals above but had no PDF to attach (the vendor billed in the email body):`,
    );
    for (const invoice of input.withoutPdf) {
      lines.push(
        `  ${invoice.effective_date} ${invoice.service} ${invoice.invoice_number ?? ''} — ${formatMinor(invoice.converted_value, summary.currency)}`.trimEnd(),
      );
    }
  }

  if (input.deferredCount > 0) {
    lines.push('');
    lines.push(
      `${input.deferredCount} further invoice${input.deferredCount === 1 ? '' : 's'} did not fit in this message and will follow in the next one.`,
    );
  }

  lines.push('');
  lines.push('Sent by Rayshio.');
  return lines.join('\n');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The same content in HTML. Built from the text body rather than assembled
 * separately, so the two cannot say different things — a divergence nobody
 * would notice, because almost no one sees both.
 */
export function htmlBody(input: MessageInput): string {
  const body = escapeHtml(textBody(input)).replace(/\n/g, '<br />');
  return `<div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a">${body}</div>`;
}

/**
 * The covering note for a single invoice, sent on its own.
 *
 * Deliberately terse. In one-by-one mode the recipient is usually a filing
 * inbox — Hubdoc, Dext, Xero — that reads the attachment and ignores the prose,
 * and a human scanning three hundred of these wants the vendor, the date and
 * the amount in the subject rather than a paragraph repeating them.
 */
export function singleInvoiceSubject(invoice: PackagedInvoice, workspaceName?: string): string {
  const who = workspaceName ? `${workspaceName} — ` : '';
  const number = invoice.invoice_number ? ` ${invoice.invoice_number}` : '';
  return `${who}${invoice.service}${number} — ${invoice.effective_date}`;
}

export function singleInvoiceBody(
  invoice: PackagedInvoice,
  currency: string,
  hasAttachment: boolean,
): string {
  const lines = [
    `Service:  ${invoice.service}`,
    `Date:     ${invoice.effective_date}`,
    `Amount:   ${formatMinor(invoice.converted_value, currency)}`,
  ];
  if (invoice.invoice_number) lines.push(`Number:   ${invoice.invoice_number}`);
  if (invoice.currency !== currency) {
    lines.push(
      `Billed:   ${formatMinor(invoice.value, invoice.currency)} — converted at the rate for ${invoice.effective_date}`,
    );
  }
  lines.push('');
  lines.push(
    hasAttachment
      ? `Attached: ${invoice.filename}`
      : 'No document: this vendor billed in the body of the email, so the figures above are the whole record.',
  );
  lines.push('');
  lines.push('Sent by Rayshio.');
  return lines.join('\n');
}
