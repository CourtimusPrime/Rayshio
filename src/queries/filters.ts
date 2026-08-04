import { type Expression, type SqlBool, sql } from 'kysely';

/**
 * Date bounds are compared as explicit `::date` casts rather than by passing a
 * JS Date. node-postgres serializes a Date with the *local* UTC offset, so in a
 * negative-offset timezone `invoice_date <= '2026-08-31'` silently excludes
 * invoices dated 2026-08-31. Casting the literal keeps both bounds inclusive
 * regardless of where the process runs.
 */
export function dateAtLeast(column: string, value: string): Expression<SqlBool> {
  return sql<SqlBool>`${sql.ref(column)} >= ${value}::date`;
}

export function dateAtMost(column: string, value: string): Expression<SqlBool> {
  return sql<SqlBool>`${sql.ref(column)} <= ${value}::date`;
}

export interface DateRange {
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
}
