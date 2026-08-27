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

import {
  GmailSendError,
  GmailSendScopeMissingError,
  grantCanSend,
  sendAsAccount,
} from '../gmail/send.js';
import { getPdf } from '../mongo/pdfs.js';
import {
  type SendMode,
  type UntrackedInvoice,
  finishDelivery,
  getAccountantSettings,
  recordDeliveredItem,
  recordDelivery,
  recordFailedDelivery,
  sendingAccount,
  startDelivery,
  untrackedInvoices,
} from '../queries/accountant.js';
import { ConversionTracker, converterFor } from '../queries/converted.js';
import { getOrg } from '../queries/meta.js';
import {
  htmlBody,
  singleInvoiceBody,
  singleInvoiceSubject,
  subjectFor,
  textBody,
} from './message.js';
import { archiveFilename, buildPackage, invoiceFilename, summarize } from './package.js';
import type { PackageSummary, PackagedInvoice } from './package.js';

/**
 * Invoices per press in one-by-one mode.
 *
 * Far below the bulk ceiling of 150, and the limit is Gmail rather than us:
 * `messages.send` costs 100 quota units against a 250-per-second per-user
 * budget, so sustained sending is about two messages a second. Twenty-five is
 * roughly fifteen seconds of work — long enough to be worth doing, short enough
 * that the request is in no danger of a gateway timeout. The rest defers, and
 * the tab says how many are left.
 */
export const MAX_INDIVIDUAL_PER_SEND = 25;

/** Spacing between individual sends, to stay inside Gmail's per-second quota. */
const SEND_INTERVAL_MS = 500;

export class NoRecipientError extends Error {}
export class NothingToSendError extends Error {}
/** No connected Gmail account at all — nothing to send *from*. */
export class NoMailboxError extends Error {}

/**
 * Why a workspace cannot send, in the order the user has to fix it.
 *
 * A single boolean was enough when a server-side API key was the only
 * prerequisite. Sending as the user's own mailbox has three distinct failure
 * states — no mailbox, a revoked one, and one connected before `gmail.send`
 * existed — and each needs different words on screen, so the API names which.
 */
export type SendBlocker = 'no_mailbox' | 'mailbox_revoked' | 'missing_send_scope';

export interface OutstandingPreview {
  recipient: string | null;
  /** The address a send goes out from — the user's own connected mailbox. */
  sender: string | null;
  send_mode: SendMode;
  can_send: boolean;
  blocker: SendBlocker | null;
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

/**
 * Whether this workspace can send, and if not, which fix applies.
 *
 * Checked before the button is offered rather than discovered during a send:
 * building a multi-megabyte zip and then failing on a missing scope wastes the
 * user's time and tells them nothing they could have known beforehand.
 */
async function sendability(orgId: number) {
  const account = await sendingAccount(orgId);
  if (!account) return { sender: null, blocker: 'no_mailbox' as const };
  if (account.status !== 'active') {
    return { sender: account.email_address, blocker: 'mailbox_revoked' as const };
  }
  if (!grantCanSend(account.scopes)) {
    return { sender: account.email_address, blocker: 'missing_send_scope' as const };
  }
  return { sender: account.email_address, blocker: null, accountId: account.id };
}

/** What the tab shows before anyone presses send. */
export async function outstanding(orgId: number, currency: string): Promise<OutstandingPreview> {
  const [settings, sendable] = await Promise.all([
    getAccountantSettings(orgId),
    sendability(orgId),
  ]);
  const recipient = settings.email;

  if (!recipient) {
    return {
      recipient: null,
      sender: sendable.sender,
      send_mode: settings.sendMode,
      can_send: sendable.blocker === null,
      blocker: sendable.blocker,
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
    sender: sendable.sender,
    send_mode: settings.sendMode,
    can_send: sendable.blocker === null,
    blocker: sendable.blocker,
    summary: summarize(packaged, currency),
    services: [...services.values()].sort((a, b) => b.total_minor - a.total_minor),
    without_pdf_count: packaged.filter((i) => !i.pdf_id).length,
  };
}

export interface SendResult {
  mode: SendMode;
  recipient: string;
  /** The mailbox it was sent from, which is also where it now sits in Sent. */
  sender: string;
  delivery_id: number;
  summary: PackageSummary;
  /** Left for the next send because the message hit its attachment ceiling. */
  deferred_count: number;
  without_pdf_count: number;
}

export async function sendOutstanding(orgId: number, currency: string): Promise<SendResult> {
  const sendable = await sendability(orgId);
  if (sendable.blocker === 'no_mailbox') {
    throw new NoMailboxError('connect a Gmail account before sending — invoices go out from it');
  }
  if (sendable.blocker === 'mailbox_revoked') {
    throw new GmailSendScopeMissingError(
      `${sendable.sender} is no longer connected — reconnect the mailbox to send from it`,
    );
  }
  if (sendable.blocker === 'missing_send_scope' || sendable.accountId === undefined) {
    throw new GmailSendScopeMissingError(
      `${sendable.sender} was connected before sending was supported — reconnect the mailbox to grant permission to send`,
    );
  }
  const accountId = sendable.accountId;

  const { email: recipient, sendMode } = await getAccountantSettings(orgId);
  if (!recipient) throw new NoRecipientError('no accountant address is set for this workspace');

  const invoices = await untrackedInvoices(orgId, recipient);
  if (invoices.length === 0) {
    throw new NothingToSendError(`${recipient} already has every invoice`);
  }

  if (sendMode === 'individual') {
    return sendOneByOne({ orgId, accountId, recipient, currency, invoices });
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
    await sendAsAccount(accountId, {
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
    mode: 'bulk',
    recipient,
    sender: sendable.sender ?? '',
    delivery_id: deliveryId,
    summary: pkg.summary,
    deferred_count: pkg.deferred.length,
    without_pdf_count: pkg.withoutPdf.length,
  };
}

/**
 * One email per invoice, its own PDF attached rather than zipped.
 *
 * The mode exists for filing inboxes — Hubdoc, Dext, Xero — which read one
 * attachment per message and cannot see inside a zip at all. A single bulk
 * message to one of those files as a single unreadable document, or nothing.
 *
 * Each invoice is recorded the instant its own message is accepted, rather than
 * all of them at the end. That is the whole difference from bulk: here the
 * twentieth send can fail after nineteen have arrived, and those nineteen must
 * stay delivered or the accountant receives them again on the retry. A failure
 * therefore stops the run and keeps what already went — it does not roll back.
 */
async function sendOneByOne(input: {
  orgId: number;
  accountId: number;
  recipient: string;
  currency: string;
  invoices: UntrackedInvoice[];
}): Promise<SendResult> {
  const { orgId, accountId, recipient, currency } = input;
  const { converted } = await convert(input.invoices, currency);
  const batch = converted.slice(0, MAX_INDIVIDUAL_PER_SEND);

  const deliveryId = await startDelivery({ orgId, recipient, currency });

  const sent: PackagedInvoice[] = [];
  let withoutPdf = 0;
  let failure: string | null = null;

  for (const [index, invoice] of batch.entries()) {
    const packaged: PackagedInvoice = { ...invoice, filename: invoiceFilename(invoice) };

    let pdf: Buffer | undefined;
    if (invoice.pdf_id) {
      try {
        pdf = await getPdf(invoice.pdf_id);
      } catch {
        // The row points at a blob that is gone. Send the figures rather than
        // holding the invoice back forever over a missing attachment.
        pdf = undefined;
      }
    }
    if (!pdf) withoutPdf += 1;

    try {
      // Spacing, not throttling after the fact: messages.send costs 100 of
      // Gmail's 250 per-second quota units, so back to back this would start
      // returning 429s partway through a run.
      if (index > 0) await new Promise((resolve) => setTimeout(resolve, SEND_INTERVAL_MS));

      await sendAsAccount(accountId, {
        to: recipient,
        subject: singleInvoiceSubject(packaged, undefined),
        text: singleInvoiceBody(packaged, currency, Boolean(pdf)),
        attachments: pdf
          ? [{ filename: packaged.filename, content: pdf, mimeType: 'application/pdf' }]
          : [],
      });
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
      break;
    }

    // After the send, never before: recording first would mark an invoice
    // delivered that a bounce swallowed.
    await recordDeliveredItem(deliveryId, invoice.invoice_id, recipient);
    sent.push(packaged);
  }

  const summary = summarize(sent, currency);
  await finishDelivery(deliveryId, {
    invoiceCount: summary.invoice_count,
    serviceCount: summary.service_count,
    periodStart: summary.period_start,
    periodEnd: summary.period_end,
    totalMinor: summary.total_minor,
    error: failure,
  });

  // A run that sent nothing at all is a failure the user has to see; one that
  // stopped partway is reported through the counts, with the remainder simply
  // still outstanding.
  if (sent.length === 0 && failure) throw new GmailSendError(failure);

  return {
    mode: 'individual',
    recipient,
    sender: (await sendingAccount(orgId))?.email_address ?? '',
    delivery_id: deliveryId,
    summary,
    deferred_count: input.invoices.length - sent.length,
    without_pdf_count: withoutPdf,
  };
}
