import { enqueue, ingestionQueue } from '../../queue/queues.js';

export async function discover(accountId: number): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await enqueue('discover-senders', { accountId }, { jobId: `discover-${accountId}-${today}` });
  console.log(`enqueued discovery scan for account ${accountId}`);
  await ingestionQueue().close();
}
