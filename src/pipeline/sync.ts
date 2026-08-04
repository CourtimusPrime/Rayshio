import { db } from '../db/client.js';
import { gmailClientForAccount } from '../gmail/oauth.js';
import { listAllMessages, senderQuery } from '../gmail/search.js';
import type { JobPayloads } from '../queue/queues.js';
import { enqueue } from '../queue/queues.js';
import { discoverSenders } from './discovery.js';

const OVERLAP_MS = 3 * 24 * 60 * 60 * 1000;

/** Watermark: newest ingested email per (org, service), minus a 3-day overlap.
 *  Dedupe on (server_id, message_id) makes the overlap free. */
export function watermarkEpochSeconds(newestDeliveredAt: Date | null): number | undefined {
  if (!newestDeliveredAt) return undefined; // never synced — full history
  return Math.floor((newestDeliveredAt.getTime() - OVERLAP_MS) / 1000);
}

/**
 * Incremental sync for one account: per known sender, only messages since the
 * watermark; then a bounded discovery pass over recent mail as the new-sender
 * safety net.
 */
export async function syncAccount(payload: JobPayloads['sync-account']): Promise<string> {
  const { accountId } = payload;
  const { gmail, account } = await gmailClientForAccount(accountId);

  const services = await db
    .selectFrom('server.service')
    .leftJoin('billing.email', 'billing.email.server_id', 'server.service.id')
    .leftJoin('client.billing_address', 'client.billing_address.id', 'billing.email.recipient_id')
    .select(({ fn }) => [
      'server.service.id as serviceId',
      'server.service.sender_address as senderAddress',
      'server.service.name as serviceName',
      fn.max('billing.email.delivered_at').as('newestDeliveredAt'),
    ])
    .where((eb) =>
      eb.or([
        eb('client.billing_address.org_id', '=', account.org_id),
        eb('billing.email.id', 'is', null),
      ]),
    )
    .groupBy(['server.service.id', 'server.service.sender_address', 'server.service.name'])
    .execute();

  let enqueued = 0;
  for (const service of services) {
    const after = watermarkEpochSeconds(service.newestDeliveredAt as Date | null);
    const messages = await listAllMessages(
      gmail,
      senderQuery(service.senderAddress, service.serviceName, after),
    );
    for (const m of messages) {
      await enqueue(
        'process-email',
        { accountId, serviceId: service.serviceId, messageId: m.id, classifyFirst: true },
        { jobId: `email-${service.serviceId}-${m.id}` },
      );
      enqueued += 1;
    }
  }

  // safety net: look for brand-new billing senders in recent mail only
  const newest = await db
    .selectFrom('billing.email')
    .innerJoin('client.billing_address', 'client.billing_address.id', 'billing.email.recipient_id')
    .select(({ fn }) => fn.max('billing.email.delivered_at').as('newest'))
    .where('client.billing_address.org_id', '=', account.org_id)
    .executeTakeFirst();
  const sinceEpochSeconds = watermarkEpochSeconds((newest?.newest as Date | null) ?? null);
  const discovery = await discoverSenders(
    sinceEpochSeconds !== undefined ? { accountId, sinceEpochSeconds } : { accountId },
  );

  return `enqueued ${enqueued} known-sender messages; safety net: ${discovery}`;
}

/** Fans out sync-account for every active account. Fired by the cron scheduler. */
export async function syncAll(): Promise<string> {
  const accounts = await db
    .selectFrom('client.account')
    .select('id')
    .where('status', '=', 'active')
    .execute();
  for (const account of accounts) {
    await enqueue('sync-account', { accountId: account.id });
  }
  return `enqueued sync for ${accounts.length} account(s)`;
}
