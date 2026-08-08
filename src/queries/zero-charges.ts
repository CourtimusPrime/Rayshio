import { sql } from 'kysely';

/**
 * Keeps a row unless it charges exactly nothing and the org asked not to see
 * those.
 *
 * The org's `zero_charge_mode` is read inside the predicate rather than fetched
 * by the caller and threaded through. Every screen in the app is built from a
 * handful of these queries, and a flag passed by hand would have to reach a
 * dozen call sites in `routes.ts` — where the failure mode is one screen still
 * showing the zeros, which reads as the setting not working rather than as a
 * missed argument. Consulting it here means a query either honours the setting
 * or does not exist.
 *
 * The subquery is a primary-key lookup against a single row, in a query that is
 * already scanning invoices; it costs nothing worth measuring.
 *
 * **Exactly zero, never `<= 0`.** A negative line is a credit note or a
 * refund — a real document with a real effect on spend, and the one kind of row
 * that would be most alarming to lose. Hiding it would also make totals stop
 * reconciling against the vendor's own statement.
 */
export function keepsZeroCharges(orgId: number, amountColumn: string) {
  const amount = sql.ref(amountColumn);
  return sql<boolean>`(
    ${amount} <> 0
    or (select o.zero_charge_mode from client.org o where o.id = ${orgId}) = 'show'
  )`;
}
