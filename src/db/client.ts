import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { config } from '../config.js';
import type { DB } from './types.js';

pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
// DATE columns stay 'YYYY-MM-DD' strings — no timezone shifting
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

/**
 * `connectionTimeoutMillis` is not optional in practice. pg's default is 0 —
 * wait forever — and a host that accepts the TCP connection but never completes
 * the Postgres handshake (a stale Railway TCP proxy, a firewall that drops
 * rather than refuses) then hangs every request that touches the database with
 * no error and no log line. Sign-in is the one that shows it first: the browser
 * sits on "Redirecting…" because the response is never written.
 */
export const pool = new pg.Pool({
  connectionString: config.PGSQL_DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 10_000,
});

export const db = new Kysely<DB>({
  dialect: new PostgresDialect({ pool }),
});
