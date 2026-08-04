import { enqueue, ingestionQueue } from '../../queue/queues.js';

export async function backfill(accountId: number, serviceId: number): Promise<void> {
  await enqueue(
    'backfill-sender',
    { accountId, serviceId },
    { jobId: `backfill:${accountId}:${serviceId}` },
  );
  console.log(`enqueued backfill for service ${serviceId} (account ${accountId})`);
  await ingestionQueue().close();
}
