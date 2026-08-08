import { sql } from 'kysely';

/**
 * The name to *show* for a vendor: the org's correction if it has one, the
 * discovered name otherwise.
 *
 * A correlated subquery rather than a LEFT JOIN threaded through six query
 * builders. The join would have to be added to every one of them, kept in the
 * right position relative to the existing joins, and mirrored in each
 * `groupBy` — six places to get subtly wrong, where an omission silently falls
 * back to the global name and the correction appears to have been ignored on
 * exactly one screen. The subquery travels with the expression instead, so a
 * site either uses it or does not.
 *
 * `org_id` is bound, never interpolated, and there is no call path that reaches
 * this without one: `server.service` is global, so leaving it out would show
 * another tenant's correction rather than returning nothing, which is the
 * failure mode that does not announce itself.
 *
 * Deliberately *not* used by ingestion. `attachUploadedInvoiceVendor` matches
 * against `server.service.name`, and must keep doing so — two orgs renaming the
 * same vendor differently must not make the pipeline treat them as two vendors.
 */
export function displayName(orgId: number) {
  return sql<string>`coalesce(
    (
      select so.display_name
      from client.service_override so
      where so.service_id = server.service.id
        and so.org_id = ${orgId}
    ),
    server.service.name
  )`;
}
