import type { gmail_v1 } from 'googleapis';

/** Gmail query for the discovery pass: anything that looks like it could carry an invoice. */
export function discoveryQuery(): string {
  return [
    '(',
    'subject:(invoice OR receipt OR "payment received" OR billing OR statement)',
    'OR (has:attachment filename:pdf)',
    ')',
    '-in:spam -in:trash',
  ].join(' ');
}

/**
 * Full-history query for a known billing sender.
 *
 * `from:` alone is not enough when a vendor's mail reaches the mailbox through a
 * billing alias or Google Group: the `From:` header is then the alias, so
 * `from:receipts@openrouter.ai` matches nothing even though 118 such messages
 * exist. Gmail's `from:` also matches the *display name*, which the group
 * preserves ("'OpenRouter, Inc' via Tech Team"), so OR the vendor name in.
 */
export function senderQuery(
  senderAddress: string,
  vendorName?: string | null,
  afterEpochSeconds?: number,
): string {
  const clauses = [`from:${senderAddress}`];
  const name = vendorName?.trim();
  // a bare-address "name" adds nothing, and quotes would break the query
  if (name && name !== senderAddress && !name.includes('"')) {
    clauses.push(`from:"${name}"`);
  }

  const parts = [clauses.length > 1 ? `(${clauses.join(' OR ')})` : (clauses[0] as string)];
  parts.push('-in:spam -in:trash');
  if (afterEpochSeconds !== undefined) parts.push(`after:${afterEpochSeconds}`);
  return parts.join(' ');
}

/** Pages through messages.list until exhausted (or maxMessages). Returns bare {id} refs. */
export async function listAllMessages(
  gmail: gmail_v1.Gmail,
  query: string,
  maxMessages = Number.POSITIVE_INFINITY,
): Promise<{ id: string }[]> {
  const out: { id: string }[] = [];
  let pageToken: string | undefined;
  do {
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 100,
      ...(pageToken ? { pageToken } : {}),
    });
    for (const m of res.data.messages ?? []) {
      if (m.id) out.push({ id: m.id });
      if (out.length >= maxMessages) return out;
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}
