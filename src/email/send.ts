/**
 * Outbound transactional email, over Resend's HTTP API.
 *
 * A `fetch` call rather than the Resend SDK. The whole surface this app needs
 * is one POST with four fields and an attachment array, and the SDK would add a
 * dependency whose version has to be kept current for no capability we use.
 *
 * Both variables are optional in `config`, so a deploy without them boots
 * normally and only the Accountant tab notices — it reports the feature as
 * unconfigured instead of the server failing to start over a feature nobody has
 * opened yet. `emailConfigured()` is what the API asks before offering a send.
 */

import { config } from '../config.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Resend caps a message at 40 MB across all attachments, and counts the
 * base64-encoded size rather than the raw bytes — which is a third larger than
 * what we measure. 25 MB of PDFs is the ceiling that keeps us clear of it with
 * room for the body, and it is also roughly where recipient mailboxes start
 * rejecting messages regardless of what we send.
 */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export interface Attachment {
  filename: string;
  content: Buffer;
}

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Attachment[];
}

export class EmailNotConfiguredError extends Error {}
export class EmailSendError extends Error {}

/** Whether this deployment can send mail at all. */
export function emailConfigured(): boolean {
  return Boolean(config.RESEND_API_KEY && config.MAIL_FROM);
}

/**
 * Sends one message, or throws.
 *
 * Deliberately has no retry. The caller records the outcome in a ledger that
 * decides whether invoices count as delivered, and a retry that succeeds on the
 * second attempt after the first already timed out would risk two copies
 * landing with the accountant. A failed send leaves everything untracked, which
 * makes pressing the button again the safe and obvious recovery.
 */
export async function sendEmail(message: OutboundEmail): Promise<{ id: string }> {
  if (!emailConfigured()) {
    throw new EmailNotConfiguredError(
      'email delivery is not configured — set RESEND_API_KEY and MAIL_FROM',
    );
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: config.MAIL_FROM,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(message.attachments?.length
        ? {
            attachments: message.attachments.map((a) => ({
              filename: a.filename,
              content: a.content.toString('base64'),
            })),
          }
        : {}),
    }),
  });

  if (!response.ok) {
    // Resend answers with {"message": "..."} on failure; fall back to the
    // status line when the body is not the JSON we expect, so the ledger never
    // stores an empty reason.
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { message?: string; error?: string };
      if (body.message ?? body.error) detail = String(body.message ?? body.error);
    } catch {
      // keep the status line
    }
    throw new EmailSendError(detail);
  }

  const body = (await response.json()) as { id?: string };
  return { id: body.id ?? '' };
}
