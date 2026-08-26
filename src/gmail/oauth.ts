import { type Auth, google } from 'googleapis';
import { config, googleRedirectUri } from '../config.js';
import { decryptToken } from '../crypto/tokens.js';
import { db } from '../db/client.js';

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

export function createOAuthClient(): Auth.OAuth2Client {
  return new google.auth.OAuth2(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    googleRedirectUri,
  );
}

/** Gmail API client authed as the stored account. Marks account revoked on invalid_grant. */
export async function gmailClientForAccount(accountId: number) {
  const account = await db
    .selectFrom('client.account')
    .selectAll()
    .where('id', '=', accountId)
    .executeTakeFirstOrThrow();

  if (account.status !== 'active') {
    throw new Error(`account ${accountId} is not active (status=${account.status})`);
  }

  const client = createOAuthClient();
  client.setCredentials({ refresh_token: decryptToken(account.refresh_token_encrypted) });

  client.on('tokens', () => {
    // access tokens are refreshed transparently; nothing to persist (refresh token is stable)
  });

  try {
    await client.getAccessToken();
  } catch (err) {
    const message = (err as Error).message ?? '';
    if (message.includes('invalid_grant')) {
      await db
        .updateTable('client.account')
        .set({ status: 'revoked' })
        .where('id', '=', accountId)
        .execute();
      throw new Error(`account ${accountId}: refresh token revoked — re-run \`cli auth\``);
    }
    throw err;
  }

  return { gmail: google.gmail({ version: 'v1', auth: client }), account };
}
