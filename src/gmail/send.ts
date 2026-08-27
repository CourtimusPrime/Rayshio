/**
 * Sending mail as the signed-in mailbox, through the Gmail API.
 *
 * This replaces a third-party provider (Resend), and the reason is not cost. A
 * message sent here comes *from the user's own address*: it lands in their Sent
 * folder, replies come back to them, and the accountant sees a sender they
 * already correspond with rather than a machine address on a domain they have
 * never heard of. Nothing else in the product needed a verified sending domain,
 * an API key, or a second vendor holding a copy of the invoices.
 *
 * The cost is a scope. `gmail.send` is restricted, so it has to be declared to
 * Google alongside `gmail.readonly`, and every grant minted before it existed
 * must be renewed once — which is why `client.account.scopes` is recorded and
 * checked before a send is offered rather than attempted.
 */

import { Readable } from 'node:stream';
import { google } from 'googleapis';
import { GMAIL_SEND_SCOPE, gmailClientForAccount } from './oauth.js';

export class GmailSendScopeMissingError extends Error {}
export class GmailSendError extends Error {}

export interface Attachment {
  filename: string;
  content: Buffer;
  mimeType?: string;
}

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Attachment[];
}

/**
 * Gmail accepts a message up to 35 MB, counted *after* base64 encoding, which
 * inflates by a third. 25 MB of raw attachment is the largest payload that
 * clears that with room for the body and headers.
 */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/**
 * Above this, the message cannot travel in the JSON body and has to go through
 * the media-upload endpoint instead. Well under Google's own limit for a JSON
 * request, because the base64 `raw` string is a third larger than the bytes it
 * encodes and the margin is cheaper than a 413 halfway through a send.
 */
const JSON_BODY_LIMIT = 4 * 1024 * 1024;

/** RFC 2822 wants CRLF, and Gmail is strict about it in a multipart body. */
const CRLF = '\r\n';

/**
 * Encodes a header value that may contain non-ASCII.
 *
 * A vendor named "Génie" or a workspace with an em dash in its name makes the
 * Subject invalid as raw UTF-8, and Gmail does not reject it — it delivers a
 * subject line of mojibake. RFC 2047 encoded-words are the fix.
 */
function encodeHeader(value: string): string {
  // Printable ASCII only; anything else has to be encoded or it arrives as
  // mojibake in the Subject line.
  if (/^[ -~]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

/** Splits base64 into the 76-character lines RFC 2045 requires. */
function wrapBase64(data: Buffer): string {
  return (data.toString('base64').match(/.{1,76}/g) ?? []).join(CRLF);
}

/**
 * Builds the RFC 2822 message.
 *
 * Exported for its own tests: this is string assembly where a single missing
 * blank line silently changes what the recipient sees — headers rendered as
 * body text, or an attachment that arrives as inline noise.
 */
export function buildMimeMessage(from: string, message: OutboundEmail): Buffer {
  const boundary = `rayshio_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const altBoundary = `${boundary}_alt`;
  const attachments = message.attachments ?? [];

  const head = [
    `From: ${from}`,
    `To: ${message.to}`,
    `Subject: ${encodeHeader(message.subject)}`,
    'MIME-Version: 1.0',
  ];

  const body: string[] = [];

  /*
   * Two nested multiparts, and both are load-bearing. `multipart/mixed` carries
   * the attachment; `multipart/alternative` inside it offers text and HTML as
   * two renderings of one message. Flattening them into a single mixed part
   * makes some clients show the plain-text version *and* the HTML one stacked,
   * which is how a covering note ends up appearing twice.
   */
  const writeAlternative = (target: string[]) => {
    if (message.html) {
      target.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`, '');
      target.push(`--${altBoundary}`);
      target.push(
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: 7bit',
        '',
      );
      target.push(message.text);
      target.push(`--${altBoundary}`);
      target.push(
        'Content-Type: text/html; charset="UTF-8"',
        'Content-Transfer-Encoding: 7bit',
        '',
      );
      target.push(message.html);
      target.push(`--${altBoundary}--`);
    } else {
      target.push(
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: 7bit',
        '',
      );
      target.push(message.text);
    }
  };

  if (attachments.length === 0) {
    writeAlternative(head);
    return Buffer.from(head.join(CRLF), 'utf8');
  }

  head.push(`Content-Type: multipart/mixed; boundary="${boundary}"`, '');
  body.push(`--${boundary}`);
  writeAlternative(body);

  for (const attachment of attachments) {
    body.push('', `--${boundary}`);
    body.push(
      `Content-Type: ${attachment.mimeType ?? 'application/octet-stream'}; name="${attachment.filename}"`,
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      'Content-Transfer-Encoding: base64',
      '',
      wrapBase64(attachment.content),
    );
  }
  body.push('', `--${boundary}--`, '');

  return Buffer.from([...head, ...body].join(CRLF), 'utf8');
}

/** Whether a stored grant can send, from the scopes recorded at consent time. */
export function grantCanSend(scopes: string | null): boolean {
  // Null means the grant predates scope recording, and every one of those was
  // minted asking for readonly alone — so it cannot send.
  return (scopes ?? '').split(/\s+/).includes(GMAIL_SEND_SCOPE);
}

/**
 * Sends as the given account, or throws.
 *
 * No retry, deliberately: the caller records the outcome in a ledger that
 * decides whether invoices count as delivered, and a retry that succeeds after
 * a timeout it never saw would risk two copies reaching the accountant.
 */
export async function sendAsAccount(
  accountId: number,
  message: OutboundEmail,
): Promise<{ id: string; from: string }> {
  const { gmail, account } = await gmailClientForAccount(accountId);

  if (!grantCanSend(account.scopes)) {
    throw new GmailSendScopeMissingError(
      `${account.email_address} was connected before sending was supported — reconnect the mailbox to grant permission to send`,
    );
  }

  const raw = buildMimeMessage(account.email_address, message);

  try {
    /*
     * Two transports for one operation. A small message rides in the JSON body
     * as base64url; anything larger must go through the media-upload endpoint,
     * because the base64 string would otherwise blow the request-size limit —
     * and a real batch of invoice PDFs is several megabytes, so this is the
     * normal path here rather than the exception.
     */
    const response =
      raw.length <= JSON_BODY_LIMIT
        ? await gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw: raw.toString('base64url') },
          })
        : await gmail.users.messages.send({
            userId: 'me',
            media: { mimeType: 'message/rfc822', body: Readable.from(raw) },
          });

    return { id: response.data.id ?? '', from: account.email_address };
  } catch (error) {
    const err = error as { code?: number; message?: string; errors?: { message?: string }[] };
    const detail = err.errors?.[0]?.message ?? err.message ?? 'unknown error';

    // 403 with an insufficient-scope body is the same situation the check above
    // catches, arriving from Google instead: the recorded scopes disagreed with
    // what the token can actually do, e.g. the user revoked part of the grant.
    if (err.code === 403 && /scope|permission/i.test(detail)) {
      throw new GmailSendScopeMissingError(
        `Google refused the send: ${detail}. Reconnect the mailbox to grant permission to send.`,
      );
    }
    throw new GmailSendError(detail);
  }
}

/** The Gmail client, exposed so callers do not import googleapis directly. */
export const gmailApi = google.gmail;
