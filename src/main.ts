// Railway entrypoint: one repo, two services, SERVICE_ROLE picks what runs.
// role 'worker' also applies pending migrations before starting.
import { execFileSync } from 'node:child_process';

const role = process.env.SERVICE_ROLE ?? 'mcp';

if (role === 'worker') {
  execFileSync(
    './node_modules/.bin/node-pg-migrate',
    ['--migrations-dir', 'migrations', '--migration-file-language', 'sql', 'up'],
    {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: process.env.PGSQL_DATABASE_URL ?? '' },
    },
  );
  await import('./queue/worker.js');
} else {
  await import('./mcp/server.js');
}
