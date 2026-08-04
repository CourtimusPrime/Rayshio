import { config } from '../../config.js';
import { db, pool } from '../../db/client.js';
import { categorizeInvoice } from '../../pipeline/categorize.js';

/**
 * Backfills usage categories for invoices that have uncategorized line items.
 * Resumable: re-running only picks up what is still NULL, so an interrupted run
 * costs nothing but the invoices it had already finished.
 */
export async function categorize(opts: {
  orgId: number;
  limit: number;
  force: boolean;
}): Promise<void> {
  let q = db
    .selectFrom('billing.invoices')
    .select('billing.invoices.id')
    .where('billing.invoices.org_id', '=', opts.orgId)
    .where('billing.invoices.status', '=', 'parsed');

  if (!opts.force) {
    q = q.where(({ exists, selectFrom }) =>
      exists(
        selectFrom('billing.invoice_line_items')
          .select('billing.invoice_line_items.id')
          .whereRef('billing.invoice_line_items.invoice_id', '=', 'billing.invoices.id')
          .where('billing.invoice_line_items.category', 'is', null),
      ),
    );
  }

  const invoices = await q.orderBy('billing.invoices.id').limit(opts.limit).execute();

  if (invoices.length === 0) {
    console.log('nothing to categorize');
    await pool.end();
    return;
  }

  console.log(
    `categorizing ${invoices.length} invoice(s) with ${config.OPENROUTER_CLASSIFY_MODEL}`,
  );

  let done = 0;
  let failed = 0;
  let lines = 0;
  for (const invoice of invoices) {
    const id = Number(invoice.id);
    try {
      lines += await categorizeInvoice(id, { onlyUncategorized: !opts.force });
      done++;
    } catch (err) {
      failed++;
      console.warn(`  invoice ${id}: ${(err as Error).message}`);
    }
  }

  console.log(`categorized ${lines} line item(s) across ${done} invoice(s), ${failed} failed`);
  await pool.end();
}
