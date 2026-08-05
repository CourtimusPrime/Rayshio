// Railway entrypoint: one repo, two services, SERVICE_ROLE picks what runs.
// Both roles apply pending migrations before starting.
import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const role = process.env.SERVICE_ROLE ?? 'mcp';

/** Retries for the concurrent-migration case only; see runMigrations. */
const LOCK_RETRIES = 10;
const LOCK_RETRY_MS = 3000;

/**
 * Both roles migrate, not just 'worker'. The web service can boot before the
 * worker has applied a migration, and once sign-in reads client.auth_user that
 * window is not a stale dashboard — it is every login 500ing on a missing table.
 *
 * Which makes two services racing the same migration routine, and
 * node-pg-migrate does *not* serialise that for us: it takes the lock with
 * `pg_try_advisory_lock`, which does not wait. The process that loses the race
 * throws "Another migration is already running" and exits — so on a
 * simultaneous deploy one of the two services would crash on boot rather than
 * start with a stale schema.
 *
 * So we do the waiting node-pg-migrate won't: retry on that one error until the
 * other process commits, at which point this run finds nothing pending and
 * returns immediately. Any other failure is a real migration failure and must
 * still stop the boot — a service running against a half-applied schema is
 * worse than a service that did not start.
 */
async function runMigrations(): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      execFileSync(
        './node_modules/.bin/node-pg-migrate',
        ['--migrations-dir', 'migrations', '--migration-file-language', 'sql', 'up'],
        {
          stdio: ['ignore', 'inherit', 'pipe'],
          env: { ...process.env, DATABASE_URL: process.env.PGSQL_DATABASE_URL ?? '' },
        },
      );
      return;
    } catch (err) {
      const stderr = String((err as { stderr?: unknown }).stderr ?? '');
      process.stderr.write(stderr);
      const locked = stderr.includes('Another migration is already running');
      if (!locked || attempt > LOCK_RETRIES) throw err;
      console.log(
        `migrations locked by the other service, retrying in ${LOCK_RETRY_MS}ms ` +
          `(${attempt}/${LOCK_RETRIES})`,
      );
      await sleep(LOCK_RETRY_MS);
    }
  }
}

await runMigrations();

if (role === 'worker') {
  await import('./queue/worker.js');
} else {
  await import('./mcp/server.js');
}
