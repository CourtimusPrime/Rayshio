import { db } from '../db/client.js';

/**
 * The tenancy layer. Better Auth knows who someone is; this knows which orgs
 * they may look at, and it is the only place that answers that question.
 *
 * `org_id` is a bigint and `user_id` is Better Auth's text id. They are never
 * compared to each other and never cast — the join table is what relates them.
 */

export type OrgRole = 'owner' | 'admin' | 'member';

/** Ranked, so `requireOrgRole('admin')` admits an owner too. */
const ROLE_RANK: Record<OrgRole, number> = { member: 0, admin: 1, owner: 2 };

export function roleSatisfies(held: OrgRole, required: OrgRole): boolean {
  return ROLE_RANK[held] >= ROLE_RANK[required];
}

export interface Membership {
  orgId: number;
  orgName: string;
  role: OrgRole;
}

export async function listMemberships(userId: string): Promise<Membership[]> {
  const rows = await db
    .selectFrom('client.org_member as m')
    .innerJoin('client.org as o', 'o.id', 'm.org_id')
    .select(['m.org_id as org_id', 'o.name as org_name', 'm.role as role'])
    .where('m.user_id', '=', userId)
    .orderBy('o.name')
    .execute();

  return rows.map((r) => ({
    orgId: Number(r.org_id),
    orgName: r.org_name,
    role: r.role as OrgRole,
  }));
}

export async function getMembership(
  userId: string,
  orgId: number,
): Promise<Membership | undefined> {
  const row = await db
    .selectFrom('client.org_member as m')
    .innerJoin('client.org as o', 'o.id', 'm.org_id')
    .select(['m.org_id as org_id', 'o.name as org_name', 'm.role as role'])
    .where('m.user_id', '=', userId)
    .where('m.org_id', '=', orgId)
    .executeTakeFirst();

  if (!row) return undefined;
  return { orgId: Number(row.org_id), orgName: row.org_name, role: row.role as OrgRole };
}

/**
 * The org a request acts on: the user's explicitly chosen one when it is still
 * a membership they hold, otherwise their first.
 *
 * The membership re-check is the point — without it, a user removed from an org
 * would keep reading it for as long as their `user_active_org` row survived.
 */
export async function resolveActiveOrg(userId: string): Promise<Membership | undefined> {
  const chosen = await db
    .selectFrom('client.user_active_org')
    .select('org_id')
    .where('user_id', '=', userId)
    .executeTakeFirst();

  if (chosen) {
    const membership = await getMembership(userId, Number(chosen.org_id));
    if (membership) return membership;
  }

  const [first] = await listMemberships(userId);
  return first;
}

export async function setActiveOrg(userId: string, orgId: number): Promise<boolean> {
  // never trust the id from the request — it selects an org, it does not grant one
  const membership = await getMembership(userId, orgId);
  if (!membership) return false;

  await db
    .insertInto('client.user_active_org')
    .values({ user_id: userId, org_id: orgId, updated_at: new Date() })
    .onConflict((oc) => oc.column('user_id').doUpdateSet({ org_id: orgId, updated_at: new Date() }))
    .execute();
  return true;
}

export async function grantMembership(userId: string, orgId: number, role: OrgRole): Promise<void> {
  await db
    .insertInto('client.org_member')
    .values({ user_id: userId, org_id: orgId, role })
    .onConflict((oc) => oc.columns(['org_id', 'user_id']).doUpdateSet({ role }))
    .execute();
}

export async function revokeMembership(userId: string, orgId: number): Promise<void> {
  await db
    .deleteFrom('client.org_member')
    .where('user_id', '=', userId)
    .where('org_id', '=', orgId)
    .execute();
}

/**
 * A live invitation for this address, if any. Case-insensitive to match the
 * partial unique index, and expiry is checked in SQL so a stale row never
 * counts as an invitation.
 */
export async function pendingInvitationFor(email: string) {
  return db
    .selectFrom('client.org_invitation')
    .select(['id', 'org_id', 'role'])
    .where((eb) => eb(eb.fn('lower', ['email']), '=', email.trim().toLowerCase()))
    .where('status', '=', 'pending')
    .where('expires_at', '>', new Date())
    .orderBy('created_at')
    .executeTakeFirst();
}

export async function acceptInvitation(invitationId: number, userId: string): Promise<void> {
  await db
    .updateTable('client.org_invitation')
    .set({ status: 'accepted' })
    .where('id', '=', invitationId)
    .execute();

  const invite = await db
    .selectFrom('client.org_invitation')
    .select(['org_id', 'role'])
    .where('id', '=', invitationId)
    .executeTakeFirst();

  if (invite) await grantMembership(userId, Number(invite.org_id), invite.role as OrgRole);
}

export async function inviteToOrg(
  orgId: number,
  email: string,
  role: OrgRole,
  invitedBy: string | null,
): Promise<void> {
  await db
    .insertInto('client.org_invitation')
    .values({ org_id: orgId, email: email.trim().toLowerCase(), role, invited_by: invitedBy })
    .execute();
}
