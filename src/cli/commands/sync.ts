import { enqueue, ingestionQueue } from '../../queue/queues.js';

export async function sync(): Promise<void> {
  await enqueue('sync-all', {});
  console.log('enqueued sync-all');
  await ingestionQueue().close();
}
