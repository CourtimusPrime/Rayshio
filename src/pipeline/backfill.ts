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

  const query = senderQuery(service.sender_address, service.name);
  const messages = await listAllMessages(gmail, query);
  for (const m of messages) {
    await enqueue(
      'process-email',
      // matching on the vendor display name can pull in non-billing mail from the
      // same vendor, so every backfilled message goes through the classifier
      { accountId, serviceId, messageId: m.id, classifyFirst: true },
      { jobId: `email-${serviceId}-${m.id}` },
    );
  }
  return `enqueued ${messages.length} messages from ${service.sender_address} (${query})`;
}
