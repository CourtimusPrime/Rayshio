import { createHash, randomBytes } from 'node:crypto';
import { db } from '../db/client.js';

/**
 * MCP client keys, resolved to an org.
 *
 * `imcp_`, not `rayshio_`: published client configs carry this prefix, same as
 * the /mcp endpoint itself. The product rename does not reach the wire.
 *
 * Only the sha256 of a key is stored. A leaked database therefore yields no
 * usable key, and the raw value exists exactly once — in the response to the
 * call that created it.
 */

const KEY_PREFIX = 'imcp_';
const PREFIX_DISPLAY_LENGTH = 8;

export function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export interface CreatedKey {
  id: number;
  /** Shown once, at creation, and never retrievable again. */
  raw: string;
  prefix: string;
  name: string;
}

export async function createApiKey(
  orgId: number,
  name: string,
  createdBy: string | null,
): Promise<CreatedKey> {
  const raw = `${KEY_PREFIX}${randomBytes(32).toString('base64url')}`;
  const prefix = raw.slice(0, KEY_PREFIX.length + PREFIX_DISPLAY_LENGTH);

  const row = await db
    .insertInto('client.api_key')
    .values({
      org_id: orgId,
      name,
      key_hash: hashKey(raw),
      key_prefix: prefix,
      created_by: createdBy,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  return { id: Number(row.id), raw, prefix, name };
}

/**
 * The org a raw key belongs to, or undefined. A revoked key resolves to
 * nothing, which is what makes revocation immediate rather than eventual.
 *
 * The lookup is by hash, so it is a single indexed equality — there is no
 * candidate-by-candidate comparison for a timing side channel to leak.
 */
export async function orgForApiKey(raw: string): Promise<number | undefined> {
  const row = await db
    .selectFrom('client.api_key')
    .select(['id', 'org_id'])
    .where('key_hash', '=', hashKey(raw))
    .where('revoked_at', 'is', null)
    .executeTakeFirst();

  if (!row) return undefined;

  // last_used_at is an operator convenience, not part of the auth decision, so
  // a failure to record it must not fail the request
  void db
    .updateTable('client.api_key')
    .set({ last_used_at: new Date() })
    .where('id', '=', row.id)
    .execute()
    .catch((err: unknown) => console.error('failed to record api key use:', err));

  return Number(row.org_id);
}

export async function listApiKeys(orgId: number) {
  return db
    .selectFrom('client.api_key')
    .select(['id', 'name', 'key_prefix', 'created_at', 'last_used_at', 'revoked_at'])
    .where('org_id', '=', orgId)
    .orderBy('created_at', 'desc')
    .execute();
}

/** Scoped by org: a key id from another tenant must not be revocable. */
export async function revokeApiKey(orgId: number, keyId: number): Promise<boolean> {
  const result = await db
    .updateTable('client.api_key')
    .set({ revoked_at: new Date() })
    .where('id', '=', keyId)
    .where('org_id', '=', orgId)
    .where('revoked_at', 'is', null)
    .executeTakeFirst();

  return Number(result.numUpdatedRows) > 0;
}
