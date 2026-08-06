import { db } from '../../db/client.js';
import { fetchMessage } from '../../gmail/messages.js';
import { gmailClientForAccount } from '../../gmail/oauth.js';
import { classifyEmail } from '../../llm/classify.js';
import type { JobPayloads } from '../../queue/queues.js';
import { enqueue } from '../../queue/queues.js';
import { scoreEmail } from '../heuristics.js';

/**
 * Stage 1. Ingests one Gmail message: dedupe via (server_id, message_id), resolve the
 * recipient billing_address, create the invoice row at status 'classified', hand off
 * to fetch-pdf. Known senders are treated as invoices by default; classifyFirst runs
 * the heuristic + LLM safety net (used for mail from unconfirmed senders).
 */
export async function processEmail(payload: JobPayloads['process-email']): Promise<string> {
  const { accountId, serviceId, messageId, classifyFirst } = payload;
  const { gmail, account } = await gmailClientForAccount(accountId);
  const orgId = account.org_id;

  const existing = await db
    .selectFrom('billing.email')
    .innerJoin('billing.invoices', 'billing.invoices.email_id', 'billing.email.id')
    .select([
      'billing.email.id as emailId',
      'billing.invoices.id as invoiceId',
      'billing.invoices.status',
    ])
    .where('billing.email.server_id', '=', serviceId)
    .where('billing.email.message_id', '=', messageId)
    .executeTakeFirst();

  if (existing?.status === 'parsed') return 'already parsed';

  const msg = await fetchMessage(gmail, messageId);

  // The backfill query also matches on vendor display name (the only thing a
  // group forward preserves), which can pull in mail from a *different* service
  // sharing that name — e.g. from:"Neon" hits both noreply@ar.neon.tech and
  // changelog@neon.tech. Dedupe is keyed on (server_id, message_id), so without
  // this check the same message would be ingested once per matching service.
  const service = await db
    .selectFrom('server.service')
    .select('sender_address')
    .where('id', '=', serviceId)
    .executeTakeFirstOrThrow();
  if (msg.from.address !== service.sender_address) {
    return `sender mismatch (${msg.from.address} != ${service.sender_address})`;
  }

  /*
   * The heuristic runs for EVERY email, not only mail from unconfirmed senders.
   *
   * Gating on the sender was the bug: a known billing sender is not a sender
   * that only ever sends bills. cloudplatform-noreply@google.com sends product
   * announcements, workspace-noreply@google.com sends security digests, and
   * Doppler sends "your workplace is ready to go" — all of which were ingested
   * as invoices, unread, because the sender was trusted. That produced 77
   * zero-value "invoices" out of 275, inflating both the invoice count and the
   * vendor list.
   *
   * Being a known sender still buys something: it skips the LLM call below.
   * The heuristic is free, so applying it everywhere costs nothing.
   */
  const heuristic = scoreEmail(msg);
  if (!heuristic.isCandidate) {
    return `heuristic reject (score=${heuristic.score}; ${heuristic.reasons.join(',')})`;
  }

  if (classifyFirst) {
    const verdict = await classifyEmail({
      senderAddress: msg.from.address,
      subject: msg.subject,
      bodyPreview: msg.bodyText,
    });
    if (!verdict.is_invoice) return 'classifier reject';
  }

  // resolve recipient: prefer an already-known billing_address, else register the first
  // recipient as a new alias for this org
  const known = await db
    .selectFrom('client.billing_address')
    .selectAll()
    .where('org_id', '=', orgId)
    .where('address', 'in', msg.recipients.length > 0 ? msg.recipients : ['-'])
    .executeTakeFirst();

  let recipientId: number;
  if (known) {
    recipientId = known.id;
  } else {
    const address = msg.recipients[0] ?? account.email_address;
    const inserted = await db
      .insertInto('client.billing_address')
      .values({ org_id: orgId, address })
      .onConflict((oc) => oc.columns(['org_id', 'address']).doNothing())
      .returningAll()
      .executeTakeFirst();
    recipientId =
      inserted?.id ??
      (
        await db
          .selectFrom('client.billing_address')
          .selectAll()
          .where('org_id', '=', orgId)
          .where('address', '=', address)
          .executeTakeFirstOrThrow()
      ).id;
  }

  let emailId: number;
  if (existing) {
    emailId = existing.emailId;
  } else {
    const insertedEmail = await db
      .insertInto('billing.email')
      .values({
        recipient_id: recipientId,
        server_id: serviceId,
        message_id: messageId,
        subject: msg.subject,
        delivered_at: msg.deliveredAt,
      })
      .onConflict((oc) => oc.columns(['server_id', 'message_id']).doNothing())
      .returning('id')
      .executeTakeFirst();
    emailId =
      insertedEmail?.id ??
      (
        await db
          .selectFrom('billing.email')
          .select('id')
          .where('server_id', '=', serviceId)
          .where('message_id', '=', messageId)
          .executeTakeFirstOrThrow()
      ).id;
  }

  const invoice = await db
    .insertInto('billing.invoices')
    .values({ org_id: orgId, email_id: emailId, status: 'classified' })
    .onConflict((oc) =>
      oc.column('email_id').doUpdateSet({ status: 'classified', failure_reason: null }),
    )
    .returning('id')
    .executeTakeFirstOrThrow();

  await enqueue(
    'fetch-pdf',
    { accountId, invoiceId: invoice.id, messageId },
    { jobId: `fetch-pdf-${invoice.id}` },
  );
  return `invoice ${invoice.id} classified`;
}
