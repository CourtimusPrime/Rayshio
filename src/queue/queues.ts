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

/**
 * Drops a job that has not run yet, best-effort.
 *
 * Called when the thing a job was going to work on is deleted. A miss is not a
 * failure: the job may have already completed, already been trimmed by
 * `removeOnComplete`, or be active right now (BullMQ refuses to remove a locked
 * job and throws). None of those change what the caller does next — the row is
 * going either way, and a job that runs against a deleted invoice fails
 * harmlessly.
 */
export async function removeJob(jobId: string): Promise<void> {
  try {
    await ingestionQueue().remove(jobId);
  } catch {
    // locked, missing, or already gone — nothing to undo
  }
}

export async function enqueue<N extends JobName>(
  name: N,
  payload: JobPayloads[N],
  opts?: { jobId?: string; attempts?: number },
): Promise<void> {
  await ingestionQueue().add(name, payload, opts);
}
