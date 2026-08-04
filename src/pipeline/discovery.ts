import type { gmail_v1 } from 'googleapis';
import { db } from '../db/client.js';
import { parseAddress } from '../gmail/messages.js';
import { gmailClientForAccount } from '../gmail/oauth.js';
import { discoveryQuery, listAllMessages } from '../gmail/search.js';
import { classifySender } from '../llm/classify.js';
import type { JobPayloads } from '../queue/queues.js';
import { enqueue } from '../queue/queues.js';
import { scoreEmail } from './heuristics.js';

const DISCOVERY_MESSAGE_CAP = 2000;
const SUBJECT_SAMPLE_SIZE = 5;

interface SenderCandidate {
  address: string;
  name: string | null;
  subjects: string[];
  messageCount: number;
}

async function fetchHeaderMeta(
  gmail: gmail_v1.Gmail,
  messageId: string,
): Promise<{ from: string; subject: string | null }> {
  const res = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'metadata',
    metadataHeaders: ['From', 'Subject'],
  });
  const headers = res.data.payload?.headers ?? [];
  const get = (n: string) => headers.find((h) => h.name?.toLowerCase() === n.toLowerCase())?.value;
  return { from: get('From') ?? '', subject: get('Subject') ?? null };
}

/**
 * Whole-mailbox discovery: heuristic Gmail query → group candidates by sender →
 * LLM sender classification → upsert server.service → enqueue full backfill per
 * confirmed billing sender. `sinceEpochSeconds` bounds the scan for sync safety-net runs.
 */
export async function discoverSenders(
  payload: JobPayloads['discover-senders'] & { sinceEpochSeconds?: number },
): Promise<string> {
  const { accountId, sinceEpochSeconds } = payload;
  const { gmail } = await gmailClientForAccount(accountId);

  const query = sinceEpochSeconds
    ? `${discoveryQuery()} after:${sinceEpochSeconds}`
    : discoveryQuery();
  const refs = await listAllMessages(gmail, query, DISCOVERY_MESSAGE_CAP);

  const candidates = new Map<string, SenderCandidate>();
  for (const ref of refs) {
    const meta = await fetchHeaderMeta(gmail, ref.id);
    if (!meta.from) continue;
    const from = parseAddress(meta.from);
    const existing = candidates.get(from.address) ?? {
      address: from.address,
      name: from.name,
      subjects: [],
      messageCount: 0,
    };
    existing.messageCount += 1;
    existing.name ??= from.name;
    if (existing.subjects.length < SUBJECT_SAMPLE_SIZE && meta.subject) {
      existing.subjects.push(meta.subject);
    }
    candidates.set(from.address, existing);
  }

  const knownSenders = new Set(
    (await db.selectFrom('server.service').select('sender_address').execute()).map(
      (s) => s.sender_address,
    ),
  );

  let confirmed = 0;
  let skippedKnown = 0;
  for (const candidate of candidates.values()) {
    if (knownSenders.has(candidate.address)) {
      skippedKnown += 1;
      continue;
    }

    // cheap pre-filter before spending an LLM call on the sender
    const plausible = candidate.subjects.some(
      (subject) =>
        scoreEmail({
          from: { name: candidate.name, address: candidate.address },
          subject,
          hasPdfAttachment: false,
        }).score >= 1,
    );
    if (!plausible) continue;

    const verdict = await classifySender({
      senderAddress: candidate.address,
      senderName: candidate.name,
      sampleSubjects: candidate.subjects,
    });
    if (!verdict.is_billing_sender || verdict.confidence === 'low') continue;

    const service = await db
      .insertInto('server.service')
      .values({
        name: verdict.service_name ?? candidate.name ?? candidate.address,
        sender_address: candidate.address,
      })
      .onConflict((oc) => oc.columns(['name', 'sender_address']).doNothing())
      .returning('id')
      .executeTakeFirst();
    const serviceId =
      service?.id ??
      (
        await db
          .selectFrom('server.service')
          .select('id')
          .where('sender_address', '=', candidate.address)
          .executeTakeFirstOrThrow()
      ).id;

    await enqueue(
      'backfill-sender',
      { accountId, serviceId },
      { jobId: `backfill-${accountId}-${serviceId}` },
    );
    confirmed += 1;
  }

  return `scanned ${refs.length} messages, ${candidates.size} senders, ${confirmed} new billing senders (${skippedKnown} already known)`;
}
