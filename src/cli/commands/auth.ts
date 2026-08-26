import { exec } from 'node:child_process';
import { googleRedirectUri } from '../../config.js';
import { db, pool } from '../../db/client.js';
import { gmailConsentUrl } from '../../gmail/connect.js';

/** How long to wait for the browser half of the flow before giving up. */
const WAIT_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 2000;

/**
 * Connect a mailbox.
 *
 * This command used to run the whole OAuth flow itself, including a throwaway
 * Express server on the callback port. That made connecting a mailbox something
 * only an operator's laptop could do — the deployed instance had no way to
 * receive the redirect. The exchange now lives in the app at
 * `GET /oauth/callback`, so this waits for the row rather than writing it.
 *
 * The consequence worth knowing: the app must be running and reachable at
 * `VITE_PUBLIC_ORIGIN` for this to complete. Against production that is the
 * Railway host and nothing local is needed; against a dev origin, the local
 * server has to be up.
 */
export async function auth(orgId: number): Promise<void> {
  const org = await db
    .selectFrom('client.org')
    .selectAll()
    .where('id', '=', orgId)
    .executeTakeFirst();
  if (!org) {
    throw new Error(`org ${orgId} not found — run \`cli seed-org --name <name>\` first`);
  }

  // Compared against, not just counted: a re-connect of a mailbox the org
  // already has updates the existing row instead of inserting one, so waiting
  // for the count to rise would hang forever on exactly the case most likely to
  // be run twice.
  const startedAt = new Date();
  const authUrl = gmailConsentUrl(orgId);

  console.log(`\nOpen this URL to authorize:\n\n${authUrl}\n`);
  console.log(`Waiting for ${googleRedirectUri} to receive the callback...`);
  exec(`open "${authUrl}"`);

  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  for (;;) {
    const account = await db
      .selectFrom('client.account')
      .select(['id', 'email_address'])
      .where('org_id', '=', orgId)
      .where('status', '=', 'active')
      .where('connected_at', '>=', startedAt)
      .orderBy('connected_at', 'desc')
      .executeTakeFirst();

    if (account) {
      console.log(`connected account id=${account.id} ${account.email_address} (org ${orgId})`);
      break;
    }

    if (Date.now() > deadline) {
      throw new Error(
        `timed out after ${WAIT_TIMEOUT_MS / 60000} minutes — check the app is running and reachable at ${googleRedirectUri}`,
      );
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  await pool.end();
}
