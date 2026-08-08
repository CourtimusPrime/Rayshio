import { sql } from 'kysely';
import { db } from '../db/client.js';

/**
 * The category a line item should be *shown* under: the org's learned rule if
 * one matches, the classifier's answer otherwise.
 *
 * Recategorising is a rule rather than an edit to one row, because the same
 * vendor bills the same thing every month. Correcting "Storage GB-month" on a
 * Neon invoice by hand and then having next month's arrive misfiled again would
 * make the feature a treadmill instead of a correction.
 *
 * Applied on read, which buys three properties at once. It is retroactive
 * without a backfill job; it applies to invoices ingested later without the
 * ingest pipeline having to know rules exist; and it destroys nothing, so
 * deleting a rule restores what the classifier originally said.
 *
 * Precedence is narrower-wins:
 *
 *   1. a rule for this vendor *and* this exact line-item text
 *   2. a rule for this vendor, whatever the line says
 *   3. the stored category
 *
 * `coalesce` gives that ordering for free — the first non-null subquery wins —
 * which is also why the two rules cannot be one query with an ORDER BY: a
 * vendor-wide rule must not shadow a more specific one just because it sorted
 * first.
 *
 * The aliases are parameters because the callers do not agree on them:
 * `lineItemFacts` selects from the schema-qualified tables while `getLineItems`
 * aliases them to `li` and `i`. Passing them in beats maintaining two copies of
 * the expression that could drift.
 */
export function effectiveCategory(orgId: number, aliases: { lineItems: string; service: string }) {
  const description = sql.ref(`${aliases.lineItems}.description`);
  const storedCategory = sql.ref(`${aliases.lineItems}.category`);
  const serviceId = sql.ref(`${aliases.service}.id`);

  return sql<string>`coalesce(
    (
      select r.category
      from client.category_rule r
      where r.org_id = ${orgId}
        and r.service_id = ${serviceId}
        and r.description = ${description}
    ),
    (
      select r.category
      from client.category_rule r
      where r.org_id = ${orgId}
        and r.service_id = ${serviceId}
        and r.description is null
    ),
    ${storedCategory}
  )`;
}

/**
 * The vendor and text a line item is filed under, scoped to the org.
 *
 * The join chain is the org filter. Line items carry no `org_id` of their own,
 * so an id alone would read another tenant's invoice — and this is a write
 * path, where that would mean setting a rule from someone else's data.
 */
export async function lineItemContext(orgId: number, lineItemId: number) {
  return db
    .selectFrom('billing.invoice_line_items as li')
    .innerJoin('billing.invoices as i', 'i.id', 'li.invoice_id')
    .innerJoin('billing.email as e', 'e.id', 'i.email_id')
    .innerJoin('server.service as s', 's.id', 'e.server_id')
    .select([
      'li.id as lineItemId',
      'li.description as description',
      'li.category as storedCategory',
      's.id as serviceId',
    ])
    .where('li.id', '=', lineItemId)
    .where('i.org_id', '=', orgId)
    .executeTakeFirst();
}

/**
 * Stores one rule, replacing any rule at the same level for the same vendor.
 *
 * Delete-then-insert in a transaction rather than an upsert. The uniqueness
 * this relies on comes from two *partial* indexes — one for the vendor-wide
 * rule, one for the per-description rules — and `ON CONFLICT` against a partial
 * index has to restate the index predicate exactly or it silently matches
 * nothing and inserts a duplicate. Deleting first needs no such agreement.
 */
export async function setCategoryRule(
  orgId: number,
  serviceId: number,
  description: string | null,
  category: string,
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    let del = trx
      .deleteFrom('client.category_rule')
      .where('org_id', '=', orgId)
      .where('service_id', '=', serviceId);
    del =
      description === null
        ? del.where('description', 'is', null)
        : del.where('description', '=', description);
    await del.execute();

    await trx
      .insertInto('client.category_rule')
      .values({
        org_id: orgId,
        service_id: serviceId,
        description,
        category,
        updated_at: new Date(),
      })
      .execute();
  });
}

/** Removes a rule, so the classifier's original category shows again. */
export async function deleteCategoryRule(
  orgId: number,
  serviceId: number,
  description: string | null,
): Promise<number> {
  let q = db
    .deleteFrom('client.category_rule')
    .where('org_id', '=', orgId)
    .where('service_id', '=', serviceId);
  q =
    description === null
      ? q.where('description', 'is', null)
      : q.where('description', '=', description);
  const result = await q.executeTakeFirst();
  return Number(result.numDeletedRows);
}

/** The rules that currently apply to one line item, narrower first. */
export async function rulesForLineItem(
  orgId: number,
  serviceId: number,
  description: string,
): Promise<{ scope: 'item' | 'vendor'; category: string }[]> {
  const rows = await db
    .selectFrom('client.category_rule')
    .select(['description', 'category'])
    .where('org_id', '=', orgId)
    .where('service_id', '=', serviceId)
    .where((eb) => eb.or([eb('description', '=', description), eb('description', 'is', null)]))
    .execute();

  return rows
    .map((r) => ({
      scope: (r.description === null ? 'vendor' : 'item') as 'item' | 'vendor',
      category: r.category,
    }))
    .sort((a, b) => (a.scope === 'item' ? -1 : b.scope === 'item' ? 1 : 0));
}
