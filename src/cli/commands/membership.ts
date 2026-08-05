import { createApiKey, listApiKeys, revokeApiKey } from '../../auth/api-keys.js';
import {
  type OrgRole,
  grantMembership,
  inviteToOrg,
  listMemberships,
  revokeMembership,
} from '../../auth/memberships.js';
import { db, pool } from '../../db/client.js';

const ROLES: OrgRole[] = ['owner', 'admin', 'member'];

function parseRole(value: string): OrgRole {
  if (!ROLES.includes(value as OrgRole)) {
    throw new Error(`role must be one of ${ROLES.join(', ')}`);
  }
  return value as OrgRole;
}

/** Sign-in creates the user; this is what turns that user into a tenant member. */
async function userIdForEmail(email: string): Promise<string> {
  const user = await db
    .selectFrom('client.auth_user')
    .select(['id', 'email'])
    .where('email', '=', email.trim().toLowerCase())
    .executeTakeFirst();

  if (!user) {
    throw new Error(
      `no user with email ${email} — they must sign in with Google once before they can be granted access`,
    );
  }
  return user.id;
}

/**
 * Claiming an org is deliberately a manual step. A hook that auto-claimed the
 * first org would mean "the first allowlisted person to sign in silently
 * inherits the production tenant", which is not a property this system should
 * have.
 */
export async function grantMembershipCommand(
  orgId: number,
  email: string,
  role: string,
): Promise<void> {
  const userId = await userIdForEmail(email);
  await grantMembership(userId, orgId, parseRole(role));
  console.log(`granted ${role} on org ${orgId} to ${email}`);
  await pool.end();
}

export async function revokeMembershipCommand(orgId: number, email: string): Promise<void> {
  const userId = await userIdForEmail(email);
  await revokeMembership(userId, orgId);
  console.log(`revoked membership of org ${orgId} from ${email}`);
  await pool.end();
}

export async function listMembershipsCommand(email: string): Promise<void> {
  const userId = await userIdForEmail(email);
  const memberships = await listMemberships(userId);
  if (memberships.length === 0) {
    console.log(`${email} is a member of no orgs`);
  } else {
    for (const m of memberships) console.log(`org ${m.orgId} (${m.orgName}) — ${m.role}`);
  }
  await pool.end();
}

/**
 * There is no mailer in this repo, so an invitation is a database row and the
 * link has to be passed along by hand. It still does the useful half: it lets
 * an address outside ALLOWED_SIGNUP_EMAILS complete sign-up, and it joins them
 * to the right org automatically once they do.
 */
export async function inviteCommand(orgId: number, email: string, role: string): Promise<void> {
  await inviteToOrg(orgId, email, parseRole(role), null);
  console.log(`invited ${email} to org ${orgId} as ${role} (expires in 7 days)`);
  console.log('no mailer in this repo — tell them to sign in at the app themselves');
  await pool.end();
}

export async function createApiKeyCommand(orgId: number, name: string): Promise<void> {
  const key = await createApiKey(orgId, name, null);
  console.log(`created key "${key.name}" for org ${orgId}`);
  console.log('');
  console.log(`  ${key.raw}`);
  console.log('');
  console.log('This is the only time the key is shown. Only its sha256 is stored.');
  await pool.end();
}

export async function listApiKeysCommand(orgId: number): Promise<void> {
  const keys = await listApiKeys(orgId);
  if (keys.length === 0) {
    console.log(`org ${orgId} has no API keys`);
  } else {
    for (const k of keys) {
      const state = k.revoked_at ? 'revoked' : 'active';
      const used = k.last_used_at ? k.last_used_at.toISOString() : 'never used';
      console.log(`#${k.id} ${k.key_prefix}… "${k.name}" — ${state}, ${used}`);
    }
  }
  await pool.end();
}

export async function revokeApiKeyCommand(orgId: number, keyId: number): Promise<void> {
  const revoked = await revokeApiKey(orgId, keyId);
  console.log(revoked ? `revoked key #${keyId}` : `no active key #${keyId} in org ${orgId}`);
  await pool.end();
}
