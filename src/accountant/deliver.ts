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

import { GmailSendScopeMissingError, grantCanSend, sendAsAccount } from '../gmail/send.js';
import { getPdf } from '../mongo/pdfs.js';
import {
  AlreadySendingError,
  type SendMode,
  type SendingDelivery,
  type UntrackedInvoice,
  deliveryInvoices,
  discardEmptyDelivery,
  finishDelivery,
  getAccountantSettings,
  recordDeliveredItem,
  recordDelivery,
  recordFailedDelivery,
  sendingAccount,
  sendingDelivery,
  startDelivery,
  untrackedInvoices,
} from '../queries/accountant.js';
import { ConversionTracker, converterFor } from '../queries/converted.js';
import { getOrg } from '../queries/meta.js';
import { type JobPayloads, enqueue } from '../queue/queues.js';
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
 * Invoices per batch in one-by-one mode — one batch is one history row.
 *
 * Far below the bulk ceiling of 150, and the limit is Gmail rather than us:
 * `messages.send` costs 100 quota units against a 250-per-second per-user
 * budget, so sustained sending is about two messages a second. Twenty-five is
 * roughly fifteen seconds of work, which keeps each history row a readable size
 * and bounds how long any one row can legitimately stay 'sending'. The whole
 * backlog goes out in successive batches on the worker, because ~337 invoices
 * at ~1s each is far beyond any request timeout.
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
  mode: 'bulk';
  recipient: string;
  /** The mailbox it was sent from, which is also where it now sits in Sent. */
  sender: string;
  delivery_id: number;
  summary: PackageSummary;
  /** Left for the next send because the message hit its attachment ceiling. */
  deferred_count: number;
  without_pdf_count: number;
}

/** One-by-one send accepted: the run continues on the worker, not in the request. */
export interface SendStarted {
  mode: 'individual';
  status: 'sending';
  recipient: string;
  sender: string;
  delivery_id: number;
  outstanding_count: number;
  batch_size: number;
}

/**
 * Closes a batch row with the totals of what its own items say went out.
 *
 * Totals come from the ledger rather than an in-memory list, so a resumed or
 * swept row still describes delivered mail instead of whatever this process
 * happened to remember.
 */
async function closeBatch(
  orgId: number,
  deliveryId: number,
  currency: string,
  error: string | null,
): Promise<void> {
  const recorded = await deliveryInvoices(orgId, deliveryId);
  const { converted } = await convert(recorded, currency);
  const summary = summarize(
    converted.map((i) => ({ ...i, filename: '' })),
    currency,
  );
  await finishDelivery(deliveryId, {
    invoiceCount: summary.invoice_count,
    serviceCount: summary.service_count,
    periodStart: summary.period_start,
    periodEnd: summary.period_end,
    totalMinor: summary.total_minor,
    error,
  });
}

/**
 * Closes the org's 'sending' row if its process has evidently died, so a crashed
 * run cannot lock the workspace forever. Returns the live run, if there is one.
 *
 * Runs on the read and send paths of the API rather than at worker boot: a boot
 * sweep would be cross-tenant, and would race the old worker during a rolling
 * deploy. Staleness is measured from the row's own start time and a batch is
 * bounded at 25 sends, so the age threshold is safe to check from any request.
 */
export async function sweepStaleRun(orgId: number): Promise<SendingDelivery | undefined> {
  const live = await sendingDelivery(orgId);
  if (!live) return undefined;
  if (!live.stale) return live;
  await closeBatch(
    orgId,
    live.id,
    live.currency,
    'Stopped partway — the sending process was interrupted. Invoices not counted here are still outstanding and go out on the next send.',
  );
  return undefined;
}

export async function sendOutstanding(
  orgId: number,
  currency: string,
): Promise<SendResult | SendStarted> {
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

  // Refused in both modes. A bulk send mid-run would zip and mail the very
  // invoices the run is about to send one by one — a second concurrent run is how
  // an accountant gets every invoice twice.
  const live = await sweepStaleRun(orgId);
  if (live) {
    throw new AlreadySendingError(
      `already sending to ${live.recipient} — wait for the current run to finish`,
    );
  }

  const invoices = await untrackedInvoices(orgId, recipient);
  if (invoices.length === 0) {
    throw new NothingToSendError(`${recipient} already has every invoice`);
  }

  if (sendMode === 'individual') {
    // AlreadySendingError from here is the race between the check above and
    // this insert; the partial unique index is what actually settles it.
    const deliveryId = await startDelivery({ orgId, recipient, currency });
    try {
      await enqueue(
        'accountant-send',
        { orgId, currency, recipient, deliveryId },
        // Dashes, never colons: BullMQ 5.81+ rejects ':' in job ids. attempts: 1
        // because a send is not safe to retry blind; stalled re-runs are handled
        // by the job holding its row, not by BullMQ's retry count.
        { jobId: `accountant-send-${orgId}-${deliveryId}`, attempts: 1 },
      );
    } catch (error) {
      // Otherwise a dead Redis would leave the workspace locked for ten minutes.
      const reason = error instanceof Error ? error.message : String(error);
      await finishDelivery(deliveryId, {
        invoiceCount: 0,
        serviceCount: 0,
        periodStart: null,
        periodEnd: null,
        totalMinor: 0,
        error: `could not start sending: ${reason}`,
      });
      throw error;
    }
    return {
      mode: 'individual',
      status: 'sending',
      recipient,
      sender: sendable.sender ?? '',
      delivery_id: deliveryId,
      outstanding_count: invoices.length,
      batch_size: MAX_INDIVIDUAL_PER_SEND,
    };
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
 * One email per invoice, its own PDF attached rather than zipped, for the whole
 * outstanding backlog, in batches of MAX_INDIVIDUAL_PER_SEND — one batch is one
 * history row. Runs on the worker; the API only opens the first row and enqueues.
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
 *
 * Single-holder rule: every email is sent while this run holds the org's one
 * 'sending' row (a partial unique index allows only one). The row is acquired
 * before the untracked invoices are read, and re-checked immediately before each
 * send, so two runs can never both be mailing and a row swept as stale stops the
 * run that lost it before its next message. That ordering is the no-duplicate
 * invariant.
 *
 * Business failures (a rejected send, a changed address, a lost hold) end the
 * run and return a string, like the pipeline stages, so BullMQ does not retry a
 * job that has already mailed people. Only unexpected errors throw.
 */
export async function runIndividualSend(
  job: JobPayloads['accountant-send'],
  deps: {
    /** Persist the row this run now holds, so a stalled re-run resumes it. */
    hold: (deliveryId: number) => Promise<void>;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<string> {
  const { orgId, currency, recipient } = job;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  let held = job.deliveryId;
  let delivered = 0;
  let batches = 0;
  let sentAny = false;

  const summary = (reason: string) =>
    `delivered ${delivered} invoice${delivered === 1 ? '' : 's'} to ${recipient} in ${batches} batch${batches === 1 ? '' : 'es'}; ${reason}`;

  /** Closes the held row, but only if it is still the live one. */
  const closeIfHeld = async (error: string | null) => {
    const live = await sendingDelivery(orgId);
    if (live?.id === held) await closeBatch(orgId, held, currency, error);
  };

  try {
    const sendable = await sendability(orgId);
    if (sendable.blocker !== null || sendable.accountId === undefined) {
      const reason = `Stopped — ${sendable.sender ?? 'the mailbox'} can no longer send (${sendable.blocker ?? 'no mailbox'}). Reconnect it to continue.`;
      await closeIfHeld(reason);
      return summary('stopped, mailbox cannot send');
    }
    const accountId = sendable.accountId;

    for (;;) {
      // Never mail the old address after the user pointed the workspace elsewhere.
      const settings = await getAccountantSettings(orgId);
      if (settings.email !== recipient) {
        await closeIfHeld('Stopped — the accountant address changed.');
        return summary('stopped, accountant address changed');
      }

      // Acquire (or confirm) the single 'sending' row before reading anything.
      const live = await sendingDelivery(orgId);
      let existing = 0;
      if (live && live.id === held) {
        // Our row: the first batch, or a stalled re-run resuming where it died.
        existing = (await deliveryInvoices(orgId, held)).length;
      } else if (live) {
        return summary('another run is in progress');
      } else {
        try {
          held = await startDelivery({ orgId, recipient, currency });
        } catch (error) {
          if (error instanceof AlreadySendingError) return summary('another run is in progress');
          throw error;
        }
        await deps.hold(held);
      }

      const capacity = MAX_INDIVIDUAL_PER_SEND - existing;
      if (capacity <= 0) {
        await closeBatch(orgId, held, currency, null);
        batches += 1;
        continue;
      }

      const untracked = await untrackedInvoices(orgId, recipient);
      if (untracked.length === 0) {
        if (existing === 0) await discardEmptyDelivery(orgId, held);
        else {
          await closeBatch(orgId, held, currency, null);
          batches += 1;
        }
        return summary('nothing left to send');
      }

      const batch = untracked.slice(0, capacity);
      const { converted } = await convert(batch, currency);
      let failure: string | null = null;

      for (const invoice of converted) {
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

        // Spacing, not throttling after the fact: messages.send costs 100 of
        // Gmail's 250 per-second quota units, so back to back this would start
        // returning 429s partway through a run.
        if (sentAny) await sleep(SEND_INTERVAL_MS);

        // The row may have been swept as stale while this run was slow. Without
        // the hold, another run could now be mailing the same invoices.
        const still = await sendingDelivery(orgId);
        if (still?.id !== held) return summary('stopped, the sending row was closed elsewhere');

        try {
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
        sentAny = true;

        // After the send, never before: recording first would mark an invoice
        // delivered that a bounce swallowed.
        await recordDeliveredItem(held, invoice.invoice_id, recipient);
        delivered += 1;
      }

      await closeBatch(orgId, held, currency, failure);
      batches += 1;
      // A failure stops the run: what went stays delivered, the remainder stays
      // outstanding, and no further batch starts.
      if (failure) return summary(`stopped on error: ${failure}`);
      if (untracked.length <= batch.length) return summary('done');
    }
  } catch (error) {
    // Best effort: leave the row closed rather than locking the org until the
    // stale sweep. A secondary failure must not mask the original.
    try {
      await closeIfHeld(error instanceof Error ? error.message : String(error));
    } catch {
      // the original error is the one worth surfacing
    }
    throw error;
  }
}
