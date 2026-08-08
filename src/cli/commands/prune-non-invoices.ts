import { sql } from 'kysely';
import { db, pool } from '../../db/client.js';
import { INBOUND_MONEY_REASON, NOT_AN_INVOICE_REASON } from '../../pipeline/failure-reasons.js';

/**
 * Retires invoices that were never invoices, and inbound money counted as spend.
 *
 * The reason strings live in `src/pipeline/failure-reasons.ts` alongside the
 * classifier that reads them — this command is one of two writers, and the two
 * have to agree on the wording or the API will report rows this command retired
 * as unexplained errors.
 *
 * The SQL patterns below are the twins of `INBOUND_MONEY` and `SIGNUP_NOTICE`
 * in `src/pipeline/heuristics.ts` and must stay narrow for the same reason:
 * "payment received" is a vendor confirming that you paid them, and for Google
 * Cloud those are the only record of that spend.
 */
const INBOUND_MONEY_SQL = '\\ypayouts?\\y|payment of .* from ';

/**
 * Signup confirmations that carried a figure — the Google Cloud trial mail and
 * its $300 of granted credit. The SQL twin of `SIGNUP_NOTICE` in the heuristic.
 */
const SIGNUP_NOTICE_SQL = '\\yaccount confirmation\\y|\\ywelcome to\\y';

export async function pruneNonInvoices(orgId: number, apply: boolean): Promise<void> {
  const inbound = await db
    .selectFrom('billing.invoices as i')
    .innerJoin('billing.email as e', 'e.id', 'i.email_id')
    .innerJoin('server.service as s', 's.id', 'e.server_id')
    .select(['i.id as id', 's.name as service', 'e.subject as subject', 'i.value', 'i.currency'])
    .where('i.org_id', '=', orgId)
    .where('i.status', '=', 'parsed')
    /*
     * The parentheses are load-bearing. Kysely ANDs a raw fragment onto the
     * chain verbatim, and AND binds tighter than OR, so an unparenthesised
     * `a OR b` here reads as `(... AND org_id AND status AND a) OR b` — the
     * second branch escaping both the status filter and the org filter, which
     * would reach across tenants.
     */
    .where(sql<boolean>`(e.subject ~* ${INBOUND_MONEY_SQL} OR e.subject ~* ${SIGNUP_NOTICE_SQL})`)
    .orderBy('s.name')
    .execute();

  const candidates = await db
    .selectFrom('billing.invoices as i')
    .innerJoin('billing.email as e', 'e.id', 'i.email_id')
    .innerJoin('server.service as s', 's.id', 'e.server_id')
    .select(['i.id as id', 's.name as service', 'e.subject as subject'])
    .where('i.org_id', '=', orgId)
    .where('i.status', '=', 'parsed')
    .where('i.value', '=', 0)
    .orderBy('s.name')
    .execute();

  if (inbound.length > 0) {
    console.log(`\n${inbound.length} row(s) counted as spend that were never bills:`);
    for (const row of inbound) {
      const amount = (Number(row.value) / 100).toFixed(2);
      console.log(
        `  [${row.service}] ${amount} ${row.currency} — ${row.subject ?? '(no subject)'}`,
      );
    }
    if (apply) {
      const result = await db
        .updateTable('billing.invoices')
        .set({ status: 'failed', failure_reason: INBOUND_MONEY_REASON })
        .where(
          'id',
          'in',
          inbound.map((c) => c.id),
        )
        .executeTakeFirst();
      console.log(`marked ${Number(result.numUpdatedRows)} as inbound, not a bill`);
    }
  }

  if (candidates.length === 0) {
    if (inbound.length === 0) console.log('nothing to prune — no zero-value parsed invoices');
    else if (!apply) console.log('\ndry run — re-run with --apply to mark these failed');
    await pool.end();
    return;
  }

  const byService = new Map<string, number>();
  for (const row of candidates) {
    byService.set(row.service, (byService.get(row.service) ?? 0) + 1);
  }

  console.log(`${candidates.length} zero-value invoice(s) in org ${orgId}:`);
  for (const [service, count] of [...byService].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count.toString().padStart(3)}  ${service}`);
  }

  if (!apply) {
    console.log('\ndry run — re-run with --apply to mark these failed');
    console.log('examples:');
    for (const row of candidates.slice(0, 5)) {
      console.log(`  [${row.service}] ${row.subject ?? '(no subject)'}`);
    }
    await pool.end();
    return;
  }

  const result = await db
    .updateTable('billing.invoices')
    .set({ status: 'failed', failure_reason: NOT_AN_INVOICE_REASON })
    .where(
      'id',
      'in',
      candidates.map((c) => c.id),
    )
    .executeTakeFirst();

  console.log(`\nmarked ${Number(result.numUpdatedRows)} invoice(s) as not-an-invoice`);
  console.log('they no longer count toward spend, invoice counts or vendor counts');
  await pool.end();
}
