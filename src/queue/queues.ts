import { Queue } from 'bullmq';
import { createRedis } from './redis.js';

export const INGESTION_QUEUE = 'ingestion';

export interface JobPayloads {
  'discover-senders': { accountId: number };
  'backfill-sender': { accountId: number; serviceId: number };
  'process-email': {
    accountId: number;
    serviceId: number;
    messageId: string;
    /** true when the sender is not yet confirmed — run the LLM safety-net classifier */
    classifyFirst?: boolean;
  };
  'fetch-pdf': { accountId: number; invoiceId: number; messageId: string };
  'extract-invoice': { accountId: number; invoiceId: number; messageId: string };
  'sync-account': { accountId: number };
  'sync-all': Record<string, never>;
}

export type JobName = keyof JobPayloads;

let queue: Queue | undefined;

export function ingestionQueue(): Queue {
  if (!queue) {
    queue = new Queue(INGESTION_QUEUE, {
      connection: createRedis(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return queue;
}

export async function enqueue<N extends JobName>(
  name: N,
  payload: JobPayloads[N],
  opts?: { jobId?: string; attempts?: number },
): Promise<void> {
  await ingestionQueue().add(name, payload, opts);
}
