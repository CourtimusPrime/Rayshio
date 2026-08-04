import { type Job, Worker } from 'bullmq';
import { db } from '../db/client.js';
import { backfillSender } from '../pipeline/backfill.js';
import { discoverSenders } from '../pipeline/discovery.js';
import { extractInvoice } from '../pipeline/stages/extract-invoice.js';
import { fetchPdf } from '../pipeline/stages/fetch-pdf.js';
import { processEmail } from '../pipeline/stages/process-email.js';
import { syncAccount, syncAll } from '../pipeline/sync.js';
import { INGESTION_QUEUE, type JobName, type JobPayloads } from './queues.js';
import { createRedis } from './redis.js';
import { upsertRecurringSync } from './scheduler.js';

async function process(job: Job): Promise<string> {
  const name = job.name as JobName;
  switch (name) {
    case 'discover-senders':
      return discoverSenders(job.data as JobPayloads['discover-senders']);
    case 'backfill-sender':
      return backfillSender(job.data as JobPayloads['backfill-sender']);
    case 'process-email':
      return processEmail(job.data as JobPayloads['process-email']);
    case 'fetch-pdf':
      return fetchPdf(job.data as JobPayloads['fetch-pdf']);
    case 'extract-invoice':
      return extractInvoice(job.data as JobPayloads['extract-invoice']);
    case 'sync-account':
      return syncAccount(job.data as JobPayloads['sync-account']);
    case 'sync-all':
      return syncAll();
    default:
      throw new Error(`unknown job: ${name satisfies never}`);
  }
}

const worker = new Worker(INGESTION_QUEUE, process, {
  connection: createRedis(),
  concurrency: 5,
});

worker.on('completed', (job, result) => {
  console.log(`[${job.name}:${job.id}] ${result}`);
});

worker.on('failed', (job, err) => {
  console.error(`[${job?.name}:${job?.id}] attempt ${job?.attemptsMade} failed: ${err.message}`);
  // after the final retry, surface infra failures on the invoice row
  void (async () => {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
    const invoiceId = (job.data as { invoiceId?: number }).invoiceId;
    if (!invoiceId) return;
    await db
      .updateTable('billing.invoices')
      .set({ status: 'failed', failure_reason: `${job.name}: ${err.message}`.slice(0, 2000) })
      .where('id', '=', invoiceId)
      .where('status', '!=', 'parsed')
      .execute();
  })().catch((e) => console.error('failed to record failure_reason:', e));
});

await upsertRecurringSync();
console.log(`worker listening on queue "${INGESTION_QUEUE}" (sync cron registered)`);
