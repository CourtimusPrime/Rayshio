import type { CompiledQuery } from 'kysely';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `autoJoinByDomain` is one SQL statement, and the statement is the behaviour:
 * the NOT EXISTS guard and DO NOTHING are what keep it from pulling anyone out
 * of a workspace or changing a role. So a recording driver captures what the
 * query builder compiles. No database is touched.
 */
const recorded = vi.hoisted(() => ({
  queries: [] as CompiledQuery[],
  nextRows: [] as unknown[],
}));

vi.mock('../../src/db/client.js', async () => {
  const { Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } = await import(
    'kysely'
  );
  const connection = {
    executeQuery: async (compiled: CompiledQuery) => {
      recorded.queries.push(compiled);
      return { rows: recorded.nextRows };
    },
    streamQuery: async function* () {
      yield* [];
    },
  };
  const driver = {
    init: async () => {},
    acquireConnection: async () => connection,
    beginTransaction: async () => {},
    commitTransaction: async () => {},
    rollbackTransaction: async () => {},
    releaseConnection: async () => {},
    destroy: async () => {},
  };
  const db = new Kysely({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => driver,
      createIntrospector: (k) => new PostgresIntrospector(k),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
  return { db };
});

import { autoJoinByDomain } from '../../src/auth/memberships.js';

beforeEach(() => {
  recorded.queries.length = 0;
  recorded.nextRows = [];
});

describe('autoJoinByDomain', () => {
  it('does not query for a public provider', async () => {
    await expect(autoJoinByDomain('u1', 'x@gmail.com')).resolves.toBeUndefined();
    expect(recorded.queries).toHaveLength(0);
  });

  it('does not query for a malformed address', async () => {
    await expect(autoJoinByDomain('u1', 'not-an-email')).resolves.toBeUndefined();
    expect(recorded.queries).toHaveLength(0);
  });

  it('issues one guarded insert that can never change an existing row', async () => {
    await autoJoinByDomain('u1', 'Bob@ACME.com');

    expect(recorded.queries).toHaveLength(1);
    const { sql, parameters } = recorded.queries[0] as CompiledQuery;

    expect(sql).toContain('insert into "client"."org_member"');
    expect(sql).toContain('from "client"."org" as "o"');
    expect(sql).toContain('lower("o"."auto_join_domain") = $');
    expect(sql).toContain('not exists');
    expect(sql).toContain('"client"."org_member" as "existing"');
    expect(sql).toContain('on conflict ("org_id", "user_id") do nothing');
    expect(sql).toContain('returning "org_id"');
    expect(sql).not.toContain('do update');
    expect(parameters).toEqual(expect.arrayContaining(['u1', 'member', 'acme.com']));
  });

  it('resolves the org id when a row is inserted', async () => {
    recorded.nextRows = [{ org_id: '7' }];
    await expect(autoJoinByDomain('u1', 'bob@acme.com')).resolves.toBe(7);
  });

  it('resolves undefined when nothing was inserted', async () => {
    await expect(autoJoinByDomain('u1', 'bob@acme.com')).resolves.toBeUndefined();
  });
});
