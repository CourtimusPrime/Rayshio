import { exec } from 'node:child_process';
import express from 'express';
import { google } from 'googleapis';
import { config } from '../../config.js';
import { encryptToken } from '../../crypto/tokens.js';
import { db, pool } from '../../db/client.js';
import { GMAIL_SCOPE, createOAuthClient } from '../../gmail/oauth.js';

export async function auth(orgId: number): Promise<void> {
  const org = await db
    .selectFrom('client.org')
    .selectAll()
    .where('id', '=', orgId)
    .executeTakeFirst();
  if (!org) {
    throw new Error(`org ${orgId} not found — run \`cli seed-org --name <name>\` first`);
  }

  const client = createOAuthClient();
  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [GMAIL_SCOPE],
  });

  const port = Number(new URL(config.GOOGLE_REDIRECT_URI).port || 80);

  await new Promise<void>((resolve, reject) => {
    const app = express();

    app.get('/oauth/callback', (req, res) => {
      void (async () => {
        try {
          const code = String(req.query.code ?? '');
          if (!code) throw new Error(`no code in callback: ${JSON.stringify(req.query)}`);

          const { tokens } = await client.getToken(code);
          const refreshToken = tokens.refresh_token;
          if (!refreshToken) {
            throw new Error('Google did not return a refresh token — revoke prior grant and retry');
          }
          client.setCredentials(tokens);

          const gmail = google.gmail({ version: 'v1', auth: client });
          const profile = await gmail.users.getProfile({ userId: 'me' });
          const emailAddress = profile.data.emailAddress;
          if (!emailAddress) throw new Error('could not resolve mailbox address');

          const account = await db
            .insertInto('client.account')
            .values({
              org_id: orgId,
              provider: 'google',
              email_address: emailAddress,
              refresh_token_encrypted: encryptToken(refreshToken),
              connected_at: new Date(),
              status: 'active',
            })
            .onConflict((oc) =>
              oc.columns(['org_id', 'email_address']).doUpdateSet({
                refresh_token_encrypted: encryptToken(refreshToken),
                connected_at: new Date(),
                status: 'active',
              }),
            )
            .returningAll()
            .executeTakeFirstOrThrow();

          await db
            .insertInto('client.billing_address')
            .values({ org_id: orgId, address: emailAddress })
            .onConflict((oc) => oc.columns(['org_id', 'address']).doNothing())
            .execute();

          res.send('InvoiceMCP: mailbox connected. You can close this tab.');
          console.log(`connected account id=${account.id} ${emailAddress} (org ${orgId})`);
          server.close();
          resolve();
        } catch (err) {
          res.status(500).send(String(err));
          server.close();
          reject(err as Error);
        }
      })();
    });

    const server = app.listen(port, () => {
      console.log(`Waiting for OAuth callback on port ${port}...`);
      console.log(`\nOpen this URL to authorize:\n\n${authUrl}\n`);
      exec(`open "${authUrl}"`);
    });
    server.on('error', reject);
  });

  await pool.end();
}
