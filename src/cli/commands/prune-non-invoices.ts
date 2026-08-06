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

export async function pruneNonInvoices(orgId: number, apply: boolean): Promise<void> {
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

  if (candidates.length === 0) {
    console.log('nothing to prune — no zero-value parsed invoices');
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
