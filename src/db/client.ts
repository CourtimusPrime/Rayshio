import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { config } from '../config.js';
import type { DB } from './types.js';

pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
// DATE columns stay 'YYYY-MM-DD' strings — no timezone shifting
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export const pool = new pg.Pool({ connectionString: config.PGSQL_DATABASE_URL, max: 10 });

export const db = new Kysely<DB>({
  dialect: new PostgresDialect({ pool }),
});
