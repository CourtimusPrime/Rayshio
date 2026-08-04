import { db } from '../db/client.js';
import { gmailClientForAccount } from '../gmail/oauth.js';
import { listAllMessages, senderQuery } from '../gmail/search.js';
import type { JobPayloads } from '../queue/queues.js';
import { enqueue } from '../queue/queues.js';

/** Enqueues process-email for every message ever received from a known sender. */
export async function backfillSender(payload: JobPayloads['backfill-sender']): Promise<string> {
  const { accountId, serviceId } = payload;
  const { gmail } = await gmailClientForAccount(accountId);

  const service = await db
    .selectFrom('server.service')
    .selectAll()
    .where('id', '=', serviceId)
    .executeTakeFirstOrThrow();

  const messages = await listAllMessages(gmail, senderQuery(service.sender_address));
  for (const m of messages) {
    await enqueue(
      'process-email',
      { accountId, serviceId, messageId: m.id },
      { jobId: `email:${serviceId}:${m.id}` },
    );
  }
  return `enqueued ${messages.length} messages from ${service.sender_address}`;
}
