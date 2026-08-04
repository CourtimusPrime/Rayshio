import { db } from '../db/client.js';
import { categorizeLineItems } from '../llm/categorize.js';

/**
 * Classifies an invoice's line items into usage categories and writes them back.
 *
 * Categorisation is a view on top of the parsed invoice, not part of it — every
 * caller treats a failure here as non-fatal and leaves `category` NULL, which
 * reads as 'Other' in the dashboard until a backfill retries it.
 *
 * @param onlyUncategorized skip line items that already have a category
 * @returns how many line items were updated
 */
export async function categorizeInvoice(
  invoiceId: number,
  { onlyUncategorized = true }: { onlyUncategorized?: boolean } = {},
): Promise<number> {
  const invoice = await db
    .selectFrom('billing.invoices')
    .innerJoin('billing.email', 'billing.email.id', 'billing.invoices.email_id')
    .innerJoin('server.service', 'server.service.id', 'billing.email.server_id')
    .select(['billing.invoices.currency', 'server.service.name as service'])
    .where('billing.invoices.id', '=', invoiceId)
    .executeTakeFirst();
  if (!invoice) return 0;

  let q = db
    .selectFrom('billing.invoice_line_items')
    .select(['id', 'description', 'amount'])
    .where('invoice_id', '=', invoiceId);
  if (onlyUncategorized) q = q.where('category', 'is', null);
  const lineItems = await q.orderBy('id').execute();
  if (lineItems.length === 0) return 0;

  // positional indexes keep the prompt small and stop the model from having to
  // echo back large row ids accurately
  const categories = await categorizeLineItems({
    service: invoice.service,
    currency: invoice.currency,
    items: lineItems.map((li, index) => ({
      index,
      description: li.description,
      amount_minor: Number(li.amount),
    })),
  });

  let updated = 0;
  await db.transaction().execute(async (trx) => {
    for (const [index, category] of categories) {
      const lineItem = lineItems[index];
      if (!lineItem) continue;
      await trx
        .updateTable('billing.invoice_line_items')
        .set({ category })
        .where('id', '=', lineItem.id)
        .execute();
      updated++;
    }
  });
  return updated;
}
