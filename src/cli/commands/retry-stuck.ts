import { pool } from '../../db/client.js';
import { findStuckInvoices, retryExtraction } from '../../pipeline/retry.js';
import { ingestionQueue } from '../../queue/queues.js';

/**
 * Finds invoices whose extraction never completed and re-queues them.
 *
 * Runs from inside the deployment when the queue is on a private network —
 * `railway ssh --service <svc> -- pnpm cli retry-stuck --apply` — because the
 * Redis a job must be enqueued to is the one the worker actually reads, and
 * that is only reachable from there.
 */
export async function retryStuck(
  orgId: number,
  olderThanMinutes: number,
  apply: boolean,
): Promise<void> {
  const stuck = await findStuckInvoices(orgId, olderThanMinutes);

  if (stuck.length === 0) {
    console.log(`no invoices stuck for more than ${olderThanMinutes} minute(s)`);
    await pool.end();
    return;
  }

  console.log(`${stuck.length} invoice(s) stuck in org ${orgId}:`);
  for (const row of stuck) {
    console.log(`  #${row.id}  ${row.status.padEnd(12)}  ${row.subject ?? '(no subject)'}`);
  }

  if (!apply) {
    console.log('\ndry run — re-run with --apply to re-queue them');
    await pool.end();
    return;
  }

  const now = Date.now();
  let enqueued = 0;
  for (const row of stuck) {
    const result = await retryExtraction(orgId, row.id, now);
    if (result.enqueued) {
      enqueued++;
      console.log(`  re-queued #${row.id}`);
    } else {
      console.log(`  skipped #${row.id}: ${result.reason}`);
    }
  }

  console.log(`\nre-queued ${enqueued} of ${stuck.length}`);
  await ingestionQueue().close();
  await pool.end();
}
