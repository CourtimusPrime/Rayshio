import type { gmail_v1 } from 'googleapis';

export interface ParsedMessage {
  messageId: string;
  from: { name: string | null; address: string };
  /** All addresses on To/Cc/Delivered-To — candidates for billing_address matching. */
  recipients: string[];
  subject: string | null;
  /** Group/alias address the mail was routed through, null when delivered directly. */
  deliveredVia: string | null;
  deliveredAt: Date;
  hasPdfAttachment: boolean;
  pdfAttachments: { attachmentId: string; filename: string }[];
  /** Plain-text body (text/plain part, else stripped text/html). */
  bodyText: string;
}

function header(payload: gmail_v1.Schema$MessagePart | undefined, name: string): string | null {
  const h = payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? null;
}

/** "Neon <invoices@neon.tech>" → { name: 'Neon', address: 'invoices@neon.tech' } */
export function parseAddress(raw: string): { name: string | null; address: string } {
  const angle = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (angle?.[2]) {
    const name = angle[1]?.trim() || null;
    return { name, address: angle[2].trim().toLowerCase() };
  }
  return { name: null, address: raw.trim().toLowerCase() };
}

/** "'OpenRouter, Inc' via Tech Team" → "OpenRouter, Inc" */
export function cleanDisplayName(name: string | null): string | null {
  if (!name) return null;
  const via = name.match(/^\s*'?(.+?)'?\s+via\s+.+$/i);
  const cleaned = (via?.[1] ?? name)
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .trim();
  return cleaned || null;
}

/**
 * Resolves the vendor a message actually came from.
 *
 * Organisations commonly route vendor invoices through a shared billing alias or
 * Google Group (billing@, techteam@, …). The group re-sends the mail with itself
 * as the RFC `From:` address, leaving the vendor only in the display name
 * ("'OpenRouter, Inc' via Tech Team"). Attributing on `From` alone collapses
 * every vendor behind one alias into a single pseudo-sender that no classifier
 * will ever accept as a billing vendor.
 *
 * Google preserves the true sender in `X-Original-Sender`; its presence is the
 * signal that a rewrite happened, so no per-org alias list is needed.
 */
export function resolveSender(
  fromRaw: string,
  originalSenderRaw: string | null,
): { name: string | null; address: string; deliveredVia: string | null } {
  const from = parseAddress(fromRaw);
  const name = cleanDisplayName(from.name);

  if (!originalSenderRaw) return { name, address: from.address, deliveredVia: null };

  const original = parseAddress(originalSenderRaw);
  if (!original.address.includes('@') || original.address === from.address) {
    return { name, address: from.address, deliveredVia: null };
  }
  // display name still carries the vendor label; the alias becomes provenance
  return { name: name ?? original.name, address: original.address, deliveredVia: from.address };
}

function extractAddresses(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((part) => parseAddress(part).address)
    .filter((a) => a.includes('@'));
}

function walkParts(
  part: gmail_v1.Schema$MessagePart | undefined,
  visit: (p: gmail_v1.Schema$MessagePart) => void,
): void {
  if (!part) return;
  visit(part);
  for (const child of part.parts ?? []) walkParts(child, visit);
}

function decodeBody(data: string | null | undefined): string {
  if (!data) return '';
  return Buffer.from(data, 'base64url').toString('utf8');
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalizes a full gmail messages.get (format=full) response. */
export function parseMessage(msg: gmail_v1.Schema$Message): ParsedMessage {
  const payload = msg.payload;
  const sender = resolveSender(header(payload, 'From') ?? '', header(payload, 'X-Original-Sender'));
  const recipients = [
    ...extractAddresses(header(payload, 'Delivered-To')),
    ...extractAddresses(header(payload, 'To')),
    ...extractAddresses(header(payload, 'Cc')),
  ];

  const pdfAttachments: { attachmentId: string; filename: string }[] = [];
  let plain = '';
  let html = '';
  walkParts(payload, (p) => {
    const mime = p.mimeType ?? '';
    const filename = p.filename ?? '';
    if (p.body?.attachmentId && (mime === 'application/pdf' || /\.pdf$/i.test(filename))) {
      pdfAttachments.push({ attachmentId: p.body.attachmentId, filename });
    } else if (mime === 'text/plain' && !plain) {
      plain = decodeBody(p.body?.data);
    } else if (mime === 'text/html' && !html) {
      html = decodeBody(p.body?.data);
    }
  });

  return {
    messageId: msg.id ?? '',
    from: { name: sender.name, address: sender.address },
    recipients: [...new Set(recipients)],
    subject: header(payload, 'Subject'),
    deliveredVia: sender.deliveredVia,
    deliveredAt: new Date(Number(msg.internalDate ?? Date.now())),
    hasPdfAttachment: pdfAttachments.length > 0,
    pdfAttachments,
    bodyText: plain || stripHtml(html),
  };
}

export async function fetchMessage(
  gmail: gmail_v1.Gmail,
  messageId: string,
): Promise<ParsedMessage> {
  const res = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
  return parseMessage(res.data);
}

export async function fetchAttachment(
  gmail: gmail_v1.Gmail,
  messageId: string,
  attachmentId: string,
): Promise<Buffer> {
  const res = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId,
  });
  const data = res.data.data;
  if (!data) throw new Error(`attachment ${attachmentId} has no data`);
  return Buffer.from(data, 'base64url');
}
