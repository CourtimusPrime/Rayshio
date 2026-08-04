import { config } from '../config.js';
import { ingestionQueue } from './queues.js';

/** Registers (or updates) the repeatable monthly sync. Called at worker boot. */
export async function upsertRecurringSync(): Promise<void> {
  await ingestionQueue().upsertJobScheduler(
    'recurring-sync',
    { pattern: config.SYNC_CRON },
    { name: 'sync-all', data: {} },
  );
}
