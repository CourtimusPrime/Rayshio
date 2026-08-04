// Maintenance: wipe the ingestion queue and re-enqueue a full backfill for every
// registered sender. Safe to run any time — (server_id, message_id) dedupe makes
// re-ingestion idempotent. Run: tsx scripts/requeue-backfills.ts [accountId]
import { db, pool } from '../src/db/client.js';
import { enqueue, ingestionQueue } from '../src/queue/queues.js';

const accountId = Number(process.argv[2] ?? 1);

const q = ingestionQueue();
await q.obliterate({ force: true });
console.log('queue obliterated');

const services = await db.selectFrom('server.service').select(['id', 'name']).execute();
for (const s of services) {
  await enqueue(
    'backfill-sender',
    { accountId, serviceId: s.id },
    { jobId: `backfill-${accountId}-${s.id}` },
  );
  console.log('re-enqueued backfill:', s.name);
}
await q.close();
await pool.end();
