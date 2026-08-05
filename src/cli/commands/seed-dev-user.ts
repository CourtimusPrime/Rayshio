import { auth } from '../../auth/index.js';
import { grantMembership } from '../../auth/memberships.js';
import { db, pool } from '../../db/client.js';

/**
 * Creates an email/password user so the Playwright harness has something it can
 * drive. Google OAuth cannot be automated headlessly, and the alternative —
 * keeping a shared password in production — is what this whole change removes.
 *
 * Safe by construction rather than by guard: `emailAndPassword.enabled` is
 * false when NODE_ENV is production, so even if one of these rows reached the
 * production database, the production server would refuse to authenticate it.
 * The check below is a second line, not the only one.
 *
 * Hashing goes through Better Auth's own `password.hash` rather than a
 * reimplementation, so what this writes is exactly what sign-in verifies.
 */
export async function seedDevUser(email: string, password: string, orgId: number): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('refusing to seed a password user with NODE_ENV=production');
  }

  const ctx = await auth.$context;
  const normalized = email.trim().toLowerCase();

  const existing = await db
    .selectFrom('client.auth_user')
    .select('id')
    .where('email', '=', normalized)
    .executeTakeFirst();

  let userId: string;
  if (existing) {
    userId = existing.id;
    console.log(`user already exists: ${normalized}`);
  } else {
    const user = await ctx.internalAdapter.createUser({
      email: normalized,
      name: 'Dev User',
      emailVerified: true,
    });
    userId = user.id;
    console.log(`created user: ${normalized}`);
  }

  const hash = await ctx.password.hash(password);
  const credential = await db
    .selectFrom('client.auth_account')
    .select('id')
    .where('user_id', '=', userId)
    .where('provider_id', '=', 'credential')
    .executeTakeFirst();

  if (credential) {
    await db
      .updateTable('client.auth_account')
      .set({ password: hash, updated_at: new Date() })
      .where('id', '=', credential.id)
      .execute();
    console.log('updated password');
  } else {
    await ctx.internalAdapter.linkAccount({
      userId,
      providerId: 'credential',
      accountId: userId,
      password: hash,
    });
    console.log('set password');
  }

  await grantMembership(userId, orgId, 'owner');
  console.log(`granted owner on org ${orgId}`);

  await pool.end();
}
