import { db } from '../db/client.js';
import { displayName } from './service-name.js';

/**
 * DATE columns are parsed as 'YYYY-MM-DD' strings (see src/db/client.ts), but
 * kysely-codegen types them as Date. Query results are cast to these shapes.
 */
export interface ServiceRow {
  service_id: number;
  name: string;
  sender_address: string;
  invoice_count: number | string;
  first_invoice: string | null;
  last_invoice: string | null;
}

/** Distinct vendors this org has invoices from. Services with no invoices are excluded. */
export async function listServices(orgId: number): Promise<ServiceRow[]> {
  const rows = await db
    .selectFrom('server.service')
    .innerJoin('billing.email', 'billing.email.server_id', 'server.service.id')
    .innerJoin('billing.invoices', 'billing.invoices.email_id', 'billing.email.id')
    .select(({ fn }) => [
      'server.service.id as service_id',
      displayName(orgId).as('name'),
      'server.service.sender_address',
      fn.count('billing.invoices.id').as('invoice_count'),
      fn.min('billing.invoices.invoice_date').as('first_invoice'),
      fn.max('billing.invoices.invoice_date').as('last_invoice'),
    ])
    .where('billing.invoices.org_id', '=', orgId)
    .groupBy(['server.service.id', displayName(orgId), 'server.service.sender_address'])
    .orderBy(displayName(orgId))
    .execute();
  return rows as unknown as ServiceRow[];
}

/**
 * Every sender address filed under a vendor name. A vendor can have several —
 * Neon mails from both `neon.tech` and `ar.neon.tech`, and a vendor that moved
 * to a payment processor keeps its old direct sender — so callers that need a
 * domain should try each rather than assuming one row.
 *
 * Matched against the *displayed* name. Callers pass a name they read off the
 * screen — `/api/logo/:service` takes it straight from the rendered row — so
 * once an org renames a vendor, matching the global name here would 404 the
 * logo for every vendor they had corrected.
 */
export async function senderAddressesFor(orgId: number, name: string): Promise<string[]> {
  const rows = await db
    .selectFrom('server.service')
    .innerJoin('billing.email', 'billing.email.server_id', 'server.service.id')
    .innerJoin('billing.invoices', 'billing.invoices.email_id', 'billing.email.id')
    .select('server.service.sender_address')
    .where('billing.invoices.org_id', '=', orgId)
    .where(displayName(orgId), '=', name)
    .groupBy('server.service.sender_address')
    .execute();
  return rows.map((r) => r.sender_address);
}

/**
 * The service a displayed name resolves to, for this org.
 *
 * The modal and every write route take a name rather than an id, because that
 * is what the components rendering a logo actually hold. Resolving it here — in
 * one org-filtered place — keeps the write routes from having to trust an id
 * off the wire.
 */
export async function serviceByDisplayName(orgId: number, name: string) {
  const row = await db
    .selectFrom('server.service')
    .innerJoin('billing.email', 'billing.email.server_id', 'server.service.id')
    .innerJoin('billing.invoices', 'billing.invoices.email_id', 'billing.email.id')
    .select([
      'server.service.id as service_id',
      'server.service.name as canonical_name',
      displayName(orgId).as('display_name'),
    ])
    .where('billing.invoices.org_id', '=', orgId)
    .where(displayName(orgId), '=', name)
    .groupBy(['server.service.id', 'server.service.name'])
    .executeTakeFirst();
  return row;
}

/**
 * Displayed names of the vendors this org has uploaded a logo for.
 *
 * Exists so the client can tell when to bypass `ServiceLogo`'s first tier. That
 * tier inlines a build-time brand mark and never asks the server, which is the
 * right default — but it would also mean uploading a logo for a vendor the icon
 * set happens to cover did nothing at all, with no error to explain why.
 *
 * A list of names rather than a per-render lookup: an org corrects a handful of
 * vendors at most, and this rides along on `/api/meta`, which every page
 * already holds.
 */
export async function customLogoServices(orgId: number): Promise<string[]> {
  const rows = await db
    .selectFrom('client.service_override as so')
    .innerJoin('server.service', 'server.service.id', 'so.service_id')
    .select(displayName(orgId).as('name'))
    .where('so.org_id', '=', orgId)
    .where('so.logo_id', 'is not', null)
    .execute();
  return rows.map((r) => r.name);
}

/** This org's stored corrections for one service, if any. */
export async function serviceOverrideFor(orgId: number, serviceId: number) {
  return db
    .selectFrom('client.service_override')
    .select(['display_name', 'logo_id'])
    .where('org_id', '=', orgId)
    .where('service_id', '=', serviceId)
    .executeTakeFirst();
}

/**
 * Writes one org's correction. Upsert, because "has this org corrected this
 * vendor before" is not a question any caller should have to ask.
 *
 * A field left `undefined` is untouched; passing `null` clears it back to the
 * discovered value. The two are deliberately different — the modal needs to
 * express "revert the logo" without also wiping a renamed title.
 */
export async function setServiceOverride(
  orgId: number,
  serviceId: number,
  patch: { display_name?: string | null; logo_id?: string | null },
): Promise<void> {
  const values = {
    org_id: orgId,
    service_id: serviceId,
    display_name: patch.display_name ?? null,
    logo_id: patch.logo_id ?? null,
    updated_at: new Date(),
  };
  await db
    .insertInto('client.service_override')
    .values(values)
    .onConflict((oc) =>
      oc.columns(['org_id', 'service_id']).doUpdateSet({
        ...(patch.display_name !== undefined ? { display_name: patch.display_name } : {}),
        ...(patch.logo_id !== undefined ? { logo_id: patch.logo_id } : {}),
        updated_at: new Date(),
      }),
    )
    .execute();
}
