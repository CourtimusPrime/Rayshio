import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import pg from 'pg';
import { config, requireConfig } from '../config.js';
import { acceptInvitation, pendingInvitationFor } from './memberships.js';

/**
 * Better Auth owns *identity only* — who is signing in. Tenancy is ours:
 * `client.org` remains the one tenant identity (a `bigint` FK-referenced from
 * `client.account`, `client.billing_address` and `billing.invoices`), and the
 * membership layer in `./memberships.ts` keys `bigint org_id` to `text user_id`.
 *
 * This is why the `organization` plugin is deliberately not used: it types
 * `organization.id` as `string`, which would put every comparison against our
 * `bigint` through an implicit cast, and it exposes `deleteOrganization` —
 * a `DELETE FROM client.org` against a row live invoices reference.
 *
 * The four tables are `auth_`-prefixed and live in the `client` schema, where
 * they cannot collide with the existing `client.account` (a Gmail mailbox
 * connection, not a login).
 */

const auth_secret = requireConfig('BETTER_AUTH_SECRET').BETTER_AUTH_SECRET;

/**
 * A pool of its own, not `db/client.ts`'s: Better Auth issues unqualified
 * table names, so the connection has to carry `search_path=client`. Small,
 * because auth traffic is a fraction of query traffic.
 */
const authPool = new pg.Pool({
  connectionString: config.PGSQL_DATABASE_URL,
  max: 4,
  options: '-c search_path=client',
});

const googleCreds =
  config.AUTH_GOOGLE_CLIENT_ID && config.AUTH_GOOGLE_CLIENT_SECRET
    ? {
        clientId: config.AUTH_GOOGLE_CLIENT_ID,
        clientSecret: config.AUTH_GOOGLE_CLIENT_SECRET,
      }
    : undefined;

if (!googleCreds) {
  console.warn(
    'AUTH_GOOGLE_CLIENT_ID/SECRET unset — Google sign-in is unavailable on this process',
  );
}

export const auth = betterAuth({
  appName: 'Rayshio',
  baseURL: config.PUBLIC_APP_URL,
  secret: auth_secret,
  database: authPool,
  trustedOrigins: [config.PUBLIC_APP_URL],

  // `imcp`, not `rayshio`: the cookie prefix is a published contract, same as
  // the /mcp endpoint and MCP_API_KEY. Renaming it signs everyone out.
  advanced: { cookiePrefix: 'imcp' },

  ...(googleCreds ? { socialProviders: { google: googleCreds } } : {}),

  /*
   * Password sign-in exists so the Playwright harness has something it can
   * drive — Google OAuth cannot be automated headlessly. `enabled` is false in
   * production rather than merely guarded, so it is structurally impossible
   * there, and `disableSignUp` means the only accounts are seeded ones
   * (`pnpm cli seed-dev-user`).
   */
  emailAndPassword: {
    enabled: process.env.NODE_ENV !== 'production',
    disableSignUp: true,
  },

  /*
   * Sign-up is allowlisted at launch. The whole multi-tenancy machinery is
   * built behind this gate, so opening the product later is deleting the
   * `create.before` hook — not building an onboarding flow.
   *
   * Rejection *throws* rather than returning false: throwing an APIError is
   * what Better Auth turns into a clean error redirect back to the sign-in
   * page. Returning false aborts the write further down, after the OAuth
   * callback has already committed to succeeding.
   */
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const email = user.email.trim().toLowerCase();
          if (config.ALLOWED_SIGNUP_EMAILS.includes(email)) return;
          if (await pendingInvitationFor(email)) return;

          throw new APIError('FORBIDDEN', {
            message: 'This email is not allowed to sign up yet.',
          });
        },
        after: async (user) => {
          // An invited user joins the org that invited them. An allowlisted one
          // joins nothing: membership in an existing tenant is granted
          // deliberately, by `pnpm cli grant-membership`, never inherited by
          // being first through the door.
          const invitation = await pendingInvitationFor(user.email);
          if (invitation) await acceptInvitation(Number(invitation.id), user.id);
        },
      },
    },
  },

  user: {
    modelName: 'auth_user',
    fields: {
      emailVerified: 'email_verified',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
  session: {
    modelName: 'auth_session',
    fields: {
      expiresAt: 'expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      ipAddress: 'ip_address',
      userAgent: 'user_agent',
      userId: 'user_id',
    },
  },
  account: {
    modelName: 'auth_account',
    fields: {
      accountId: 'account_id',
      providerId: 'provider_id',
      userId: 'user_id',
      accessToken: 'access_token',
      refreshToken: 'refresh_token',
      idToken: 'id_token',
      accessTokenExpiresAt: 'access_token_expires_at',
      refreshTokenExpiresAt: 'refresh_token_expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
  verification: {
    modelName: 'auth_verification',
    fields: {
      expiresAt: 'expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },
});

export type Auth = typeof auth;
