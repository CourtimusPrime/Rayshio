import { sql } from 'kysely';
import { db } from '../db/client.js';

export async function getOrg(orgId: number) {
  return db
    .selectFrom('client.org')
    .select([
      'id',
      'name',
      'monthly_budget_minor',
      'budget_currency',
      'fiscal_year_start_month',
      'default_currency',
      'department_mode',
    ])
    .where('id', '=', orgId)
    .executeTakeFirst();
}

/**
 * Currencies this org actually has invoices in, busiest first. The dashboard
 * renders one currency at a time — totals are never summed across them.
 */
export async function listCurrencies(orgId: number): Promise<string[]> {
  const rows = await db
    .selectFrom('billing.invoices')
    .select(({ fn }) => ['currency', fn.count('id').as('n')])
    .where('org_id', '=', orgId)
    .groupBy('currency')
    .orderBy('n', 'desc')
    .orderBy('currency')
    .execute();
  return rows.map((r) => r.currency);
}

/**
 * Months that actually contain invoices, newest first. The dashboard defaults to
 * the newest of these rather than today's calendar month, which is empty for
 * most of any given month.
 */
export async function listMonthsWithData(
  orgId: number,
): Promise<{ month: string; invoice_count: number }[]> {
  const monthExpr = sql<string>`to_char(coalesce(billing.invoices.invoice_date, billing.email.delivered_at::date), 'YYYY-MM')`;
  const rows = await db
    .selectFrom('billing.invoices')
    .innerJoin('billing.email', 'billing.email.id', 'billing.invoices.email_id')
    .select(({ fn }) => [monthExpr.as('month'), fn.count('billing.invoices.id').as('n')])
    .where('billing.invoices.org_id', '=', orgId)
    .where('billing.invoices.status', '=', 'parsed')
    .groupBy(monthExpr)
    .orderBy(monthExpr, 'desc')
    .execute();
  return rows.map((r) => ({ month: r.month, invoice_count: Number(r.n) }));
}

export async function listConnectedAccounts(orgId: number) {
  return db
    .selectFrom('client.account')
    .select(['email_address', 'provider', 'status', 'connected_at'])
    .where('org_id', '=', orgId)
    .orderBy('connected_at')
    .execute();
}

export async function setFiscalYearStart(orgId: number, startMonth: number): Promise<void> {
  await db
    .updateTable('client.org')
    .set({ fiscal_year_start_month: startMonth })
    .where('id', '=', orgId)
    .execute();
}

export type DepartmentMode = 'single' | 'multi';

export interface OrgSettings {
  default_currency?: string | null;
  fiscal_year_start_month?: number;
  department_mode?: DepartmentMode;
}

/**
 * Applies whichever org settings were supplied, leaving the rest alone.
 *
 * A partial update rather than a whole-object write: the settings modal sends
 * only what changed, and a full write would let a stale form clobber a field
 * someone else had just edited.
 */
export async function setOrgSettings(orgId: number, settings: OrgSettings): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (settings.default_currency !== undefined) {
    patch.default_currency = settings.default_currency;
  }
  if (settings.fiscal_year_start_month !== undefined) {
    patch.fiscal_year_start_month = settings.fiscal_year_start_month;
  }
  if (settings.department_mode !== undefined) {
    patch.department_mode = settings.department_mode;
  }
  if (Object.keys(patch).length === 0) return;

  await db.updateTable('client.org').set(patch).where('id', '=', orgId).execute();
}

export async function setBudget(
  orgId: number,
  monthlyBudgetMinor: number | null,
  budgetCurrency: string | null,
): Promise<void> {
  await db
    .updateTable('client.org')
    .set({ monthly_budget_minor: monthlyBudgetMinor, budget_currency: budgetCurrency })
    .where('id', '=', orgId)
    .execute();
}
