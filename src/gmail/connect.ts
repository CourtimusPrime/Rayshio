import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { google } from 'googleapis';
import { requireConfig } from '../config.js';
import { encryptToken } from '../crypto/tokens.js';
import { db } from '../db/client.js';
import { GMAIL_SCOPE, GMAIL_SEND_SCOPE, createOAuthClient } from './oauth.js';

/**
 * Connecting a mailbox, as a two-process flow.
 *
 * `cli auth` used to own all of this: it stood up a throwaway Express server on
 * the port parsed out of `GOOGLE_REDIRECT_URI`, waited for Google to call back,
 * and did the token exchange in-process. That works exactly once — on a laptop.
 * The deployed instance could never complete it, because Google will not
 * redirect to a port nothing is listening on and the operator's machine is not
 * reachable from Google's servers.
 *
 * So the callback now belongs to the app (`GET /oauth/callback`), which is
 * already publicly routable at the one origin everything else derives from, and
 * the CLI's job shrinks to minting a URL and waiting for the row to appear.
 */

/** How long a mint-to-callback round trip may take before the state is stale. */
const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * `GET /oauth/callback` is necessarily unauthenticated — Google follows the
 * redirect with no cookie of ours — and it writes a `client.account` row. Left
 * open, anyone who reached it with their own authorization code could attach
 * their mailbox to an arbitrary org, and the ingestion pipeline would treat it
 * as a real source.
 *
 * The state parameter is therefore signed rather than merely carried. Only a
 * process holding `BETTER_AUTH_SECRET` can mint one, which means the operator
 * running the CLI — a stateless check, so the CLI and the server need no shared
 * store between them.
 */
function stateSecret(): string {
  return requireConfig('BETTER_AUTH_SECRET').BETTER_AUTH_SECRET;
}

function sign(payload: string): string {
  return createHmac('sha256', stateSecret()).update(payload).digest('base64url');
}

export function mintConnectState(orgId: number): string {
  const payload = Buffer.from(
    JSON.stringify({ orgId, exp: Date.now() + STATE_TTL_MS, n: randomBytes(8).toString('hex') }),
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

/** The org a state belongs to, or undefined if it is forged, tampered with or expired. */
export function verifyConnectState(state: string): number | undefined {
  const [payload, mac] = state.split('.');
  if (!payload || !mac) return undefined;

  // Constant-time, and length-checked first: timingSafeEqual throws on a length
  // mismatch rather than returning false, which would turn a forged state into
  // a 500 instead of a refusal.
  const expected = Buffer.from(sign(payload));
  const got = Buffer.from(mac);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return undefined;

  try {
    const { orgId, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      orgId: number;
      exp: number;
    };
    if (typeof orgId !== 'number' || typeof exp !== 'number' || Date.now() > exp) return undefined;
    return orgId;
  } catch {
    return undefined;
  }
}

/** The consent URL to open, carrying a signed state so the callback knows the org. */
export function gmailConsentUrl(orgId: number): string {
  return createOAuthClient().generateAuthUrl({
    access_type: 'offline',
    // Forces a refresh token even when the user has already granted this scope.
    // Without it a re-connect returns an access token only, and the stored
    // account cannot outlive the hour.
    prompt: 'consent',
    /*
     * Both scopes in one consent screen. Asking for `send` later, at the moment
     * someone presses the send button, would mean a second round-trip to Google
     * from inside a page that was about to do work — and a user who declines it
     * there has a connected mailbox that silently cannot do the thing the tab
     * exists for.
     */
    scope: [GMAIL_SCOPE, GMAIL_SEND_SCOPE],
    state: mintConnectState(orgId),
  });
}

export interface ConnectedMailbox {
  accountId: number;
  emailAddress: string;
}

/**
 * Exchanges the authorization code and records the mailbox.
 *
 * Upserts on `(org_id, email_address)` so re-connecting the same mailbox
 * refreshes the stored grant rather than accumulating duplicate accounts, and
 * registers the address as a billing address so discovery recognises mail
 * addressed to it.
 */
export async function completeGmailConnect(code: string, orgId: number): Promise<ConnectedMailbox> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);

  /*
   * What Google actually granted, which is not necessarily what was asked for:
   * the consent screen lets a user untick individual permissions. Recording the
   * response means the Accountant tab can say "reconnect to enable sending"
   * before building a zip, rather than discovering it in a 403 afterwards.
   */
  const grantedScopes = tokens.scope ?? '';

  const refreshToken = tokens.refresh_token;
  if (!refreshToken) {
    throw new Error('Google did not return a refresh token — revoke the prior grant and retry');
  }
  client.setCredentials(tokens);

  const profile = await google.gmail({ version: 'v1', auth: client }).users.getProfile({
    userId: 'me',
  });
  const emailAddress = profile.data.emailAddress;
  if (!emailAddress) throw new Error('could not resolve mailbox address');

  const encrypted = encryptToken(refreshToken);
  const account = await db
    .insertInto('client.account')
    .values({
      org_id: orgId,
      provider: 'google',
      email_address: emailAddress,
      refresh_token_encrypted: encrypted,
      connected_at: new Date(),
      status: 'active',
      scopes: grantedScopes,
    })
    .onConflict((oc) =>
      oc.columns(['org_id', 'email_address']).doUpdateSet({
        refresh_token_encrypted: encrypted,
        connected_at: new Date(),
        status: 'active',
        scopes: grantedScopes,
      }),
    )
    .returningAll()
    .executeTakeFirstOrThrow();

  await db
    .insertInto('client.billing_address')
    .values({ org_id: orgId, address: emailAddress })
    .onConflict((oc) => oc.columns(['org_id', 'address']).doNothing())
    .execute();

  return { accountId: Number(account.id), emailAddress };
}
