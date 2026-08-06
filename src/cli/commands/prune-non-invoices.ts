import { sql } from 'kysely';
import { db, pool } from '../../db/client.js';

/**
 * Retires invoices that were never invoices.
 *
 * Trusting the sender rather than the message meant every announcement from a
 * known billing address landed as an invoice — product updates, "payment method
 * added", "your workspace is ready". They extract to a total of zero, so they
 * add nothing to spend, but they inflate the invoice count and put phantom
 * vendors in the breakdowns.
 *
 * They are marked `failed`, not deleted. Failed invoices are already excluded
 * from every spend query and every count, so the numbers correct themselves,
 * while the row stays visible under the Invoices page's "failed" filter — which
 * is what makes this reversible if the rule ever proves too broad. Deleting
 * would also re-open the door for the next sync to ingest them again.
 */
export const NOT_AN_INVOICE_REASON = 'not an invoice: no amount on the document';

/**
 * Retires the other kind of non-invoice: money coming *in*.
 *
 * A zero-value row adds nothing to spend, so it only distorts counts. These do
 * worse — they carry a real amount and are counted as cost the org never
 * incurred. The heuristic now rejects them at ingest; this retires the ones
 * already in the table.
 *
 * The pattern is the SQL twin of `INBOUND_MONEY` in `src/pipeline/heuristics.ts`
 * and must stay narrow for the same reason: "payment received" is a vendor
 * confirming that you paid them, and for Google Cloud those are the only record
 * of that spend.
 */
export const INBOUND_MONEY_REASON = 'not an invoice: inbound payment, not a bill';
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
