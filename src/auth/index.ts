import { betterAuth } from 'better-auth';
import pg from 'pg';
import { config, publicOrigin, requireConfig, trustedOrigins } from '../config.js';
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

/**
 * The same Google client the Gmail ingestion uses. Scopes are per authorization
 * request, not per client, so this flow asks for `openid email profile` and
 * never shows a mailbox-access screen. Both values are required by the config
 * schema, so sign-in cannot be half-configured.
 */
const googleCreds = {
  clientId: config.GOOGLE_CLIENT_ID,
  clientSecret: config.GOOGLE_CLIENT_SECRET,
};

export const auth = betterAuth({
  appName: 'Rayshio',
  baseURL: publicOrigin,
  secret: auth_secret,
  database: authPool,
  trustedOrigins,

  // `imcp`, not `rayshio`: the cookie prefix is a published contract, same as
  // the /mcp endpoint and MCP_API_KEY. Renaming it signs everyone out.
  advanced: { cookiePrefix: 'imcp' },

  /*
   * Send failures back to our own sign-in card. Better Auth otherwise renders
   * its generic "Something went wrong / CODE: UNKNOWN" page at
   * /api/auth/error, which is a dead end: it is unstyled, it does not say what
   * actually happened, and it offers no way back into the app. A rejected
   * allowlist is a *routine* outcome here, not an internal error, and has to
   * read like one.
   */
  onAPIError: {
    errorURL: '/signin',
    onError: (error) => {
      console.warn('auth error:', error instanceof Error ? error.message : String(error));
    },
  },

  socialProviders: { google: googleCreds },

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
   * No sign-up allowlist. Who may register is decided by Google, not by us:
   * the OAuth client is an *internal* Workspace app, so Google refuses anyone
   * outside the organisation before the callback ever reaches this process.
   * `ALLOWED_SIGNUP_EMAILS` restated that rule in a second place, where it
   * could only ever disagree with the first — and it was set to `*` anyway,
   * so it had been a no-op for as long as it existed.
   *
   * Registering still grants nothing on its own. A new user has no
   * `client.org_member` row, so `resolveAuthContext` yields no org and every
   * /api route refuses them; membership stays a deliberate act
   * (`pnpm cli grant-membership`).
   */
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // An invited user joins the org that invited them. Everyone else
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
  /*
   * Persistent sessions: signed in once, still signed in a month later.
   *
   * Better Auth's default is seven days, which for a dashboard someone opens
   * when an invoice lands — a few times a month — means being bounced to Google
   * for no reason a user can connect to anything they did. Thirty days with a
   * sliding window covers a normal billing rhythm; `updateAge` refreshes the
   * expiry at most once a day, so an active user is never signed out and the
   * refresh costs one write per day rather than one per request.
   *
   * The cookie stays httpOnly, so the token is never readable by JavaScript.
   * That is the whole reason not to keep it in localStorage: a single XSS
   * anywhere on the origin — including inside a dependency — would otherwise
   * hand over an account, and lengthening the session multiplies the value of
   * exactly that theft.
   *
   * `cookieCache` carries a short signed copy of the session in the cookie
   * itself, so most requests validate without a database round trip. Five
   * minutes is the staleness this buys the speed with: a session revoked
   * server-side keeps working for up to that long, which is the trade being
   * made deliberately rather than by omission.
   */
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
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
