/**
 * The Accountant tab's one action, end to end: gather what has never been sent
 * to this address, zip it, mail it, and only then record it as delivered.
 *
 * Order matters and is the whole safety property. The ledger is written after
 * the provider has accepted the message, so a failure leaves every invoice
 * untracked and pressing the button again is a retry rather than a duplicate.
 * The opposite order would trade "sent twice" for "silently never sent", which
 * is the worse failure — nobody notices an invoice that quietly stopped being
 * outstanding.
 */

import { EmailNotConfiguredError, emailConfigured, sendEmail } from '../email/send.js';
import { getPdf } from '../mongo/pdfs.js';
import {
  type UntrackedInvoice,
  getAccountantEmail,
  recordDelivery,
  recordFailedDelivery,
  untrackedInvoices,
} from '../queries/accountant.js';
import { ConversionTracker, converterFor } from '../queries/converted.js';
import { getOrg } from '../queries/meta.js';
import { htmlBody, subjectFor, textBody } from './message.js';
import { archiveFilename, buildPackage, summarize } from './package.js';
import type { PackageSummary } from './package.js';

export class NoRecipientError extends Error {}
export class NothingToSendError extends Error {}

export interface OutstandingPreview {
  recipient: string | null;
  email_configured: boolean;
  summary: PackageSummary;
  /** Vendors in the outstanding batch, biggest first — what the tab lists. */
  services: { service: string; count: number; total_minor: number }[];
  /** Outstanding invoices with no stored PDF; sent as figures only. */
  without_pdf_count: number;
}

/**
 * Converts a batch to the display currency once, so the preview and the send
 * agree on every number. Both call this rather than each doing their own
 * arithmetic — the tab promising one total and the email stating another would
 * be the kind of discrepancy that destroys trust in the whole feature.
 */
async function convert(invoices: UntrackedInvoice[], currency: string) {
  const converter = await converterFor(
    invoices.map((i) => ({ currency: i.currency, date: i.effective_date })),
    currency,
  );
  const tracker = new ConversionTracker(currency);
  const converted = invoices.map((invoice) => {
    const { minor, rate } = converter(invoice.value, invoice.currency, invoice.effective_date);
    tracker.note(invoice.currency, rate);
    return { ...invoice, converted_value: minor };
  });
  return { converted, meta: tracker.meta() };
}

/** What the tab shows before anyone presses send. */
export async function outstanding(orgId: number, currency: string): Promise<OutstandingPreview> {
  const recipient = await getAccountantEmail(orgId);

  if (!recipient) {
    return {
      recipient: null,
      email_configured: emailConfigured(),
      summary: {
        invoice_count: 0,
        service_count: 0,
        period_start: null,
        period_end: null,
        total_minor: 0,
        currency,
      },
      services: [],
      without_pdf_count: 0,
    };
  }

  const invoices = await untrackedInvoices(orgId, recipient);
  const { converted } = await convert(invoices, currency);
  const packaged = converted.map((i) => ({ ...i, filename: '' }));

  const services = new Map<string, { service: string; count: number; total_minor: number }>();
  for (const invoice of packaged) {
    const line = services.get(invoice.service) ?? {
      service: invoice.service,
      count: 0,
      total_minor: 0,
    };
    line.count += 1;
    line.total_minor += invoice.converted_value;
    services.set(invoice.service, line);
  }

  return {
    recipient,
    email_configured: emailConfigured(),
    summary: summarize(packaged, currency),
    services: [...services.values()].sort((a, b) => b.total_minor - a.total_minor),
    without_pdf_count: packaged.filter((i) => !i.pdf_id).length,
  };
}

export interface SendResult {
  recipient: string;
  delivery_id: number;
  summary: PackageSummary;
  /** Left for the next send because the message hit its attachment ceiling. */
  deferred_count: number;
  without_pdf_count: number;
}

export async function sendOutstanding(orgId: number, currency: string): Promise<SendResult> {
  if (!emailConfigured()) {
    throw new EmailNotConfiguredError(
      'email delivery is not configured on this deployment — set RESEND_API_KEY and MAIL_FROM',
    );
  }

  const recipient = await getAccountantEmail(orgId);
  if (!recipient) throw new NoRecipientError('no accountant address is set for this workspace');

  const invoices = await untrackedInvoices(orgId, recipient);
  if (invoices.length === 0) {
    throw new NothingToSendError(`${recipient} already has every invoice`);
  }

  const [{ converted, meta }, org] = await Promise.all([
    convert(invoices, currency),
    getOrg(orgId),
  ]);

  const pkg = await buildPackage({ invoices: converted, currency, loadPdf: getPdf });
  const archiveName = archiveFilename(pkg.summary);
  const message = {
    summary: pkg.summary,
    invoices: pkg.included,
    archiveName,
    deferredCount: pkg.deferred.length,
    withoutPdf: pkg.withoutPdf,
    sourceCurrencies: meta.source_currencies,
    workspaceName: org?.name,
  };

  try {
    await sendEmail({
      to: recipient,
      subject: subjectFor(message),
      text: textBody(message),
      html: htmlBody(message),
      // No attachment at all when every invoice in the batch was body-text
      // billed: a zip holding nothing is worse than none, because the recipient
      // opens it looking for the documents the note describes.
      attachments:
        pkg.zip.length > 0 && pkg.included.length > pkg.withoutPdf.length
          ? [{ filename: archiveName, content: pkg.zip }]
          : [],
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await recordFailedDelivery({
      orgId,
      recipient,
      invoiceCount: pkg.included.length,
      serviceCount: pkg.summary.service_count,
      periodStart: pkg.summary.period_start,
      periodEnd: pkg.summary.period_end,
      totalMinor: pkg.summary.total_minor,
      currency,
      error: reason,
    });
    throw error;
  }

  const deliveryId = await recordDelivery({
    orgId,
    recipient,
    invoiceIds: pkg.included.map((i) => i.invoice_id),
    serviceCount: pkg.summary.service_count,
    periodStart: pkg.summary.period_start,
    periodEnd: pkg.summary.period_end,
    totalMinor: pkg.summary.total_minor,
    currency,
  });

  return {
    recipient,
    delivery_id: deliveryId,
    summary: pkg.summary,
    deferred_count: pkg.deferred.length,
    without_pdf_count: pkg.withoutPdf.length,
  };
}
