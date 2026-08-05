import { db } from '../db/client.js';

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
      'server.service.name',
      'server.service.sender_address',
      fn.count('billing.invoices.id').as('invoice_count'),
      fn.min('billing.invoices.invoice_date').as('first_invoice'),
      fn.max('billing.invoices.invoice_date').as('last_invoice'),
    ])
    .where('billing.invoices.org_id', '=', orgId)
    .groupBy(['server.service.id', 'server.service.name', 'server.service.sender_address'])
    .orderBy('server.service.name')
    .execute();
  return rows as unknown as ServiceRow[];
}

/**
 * Every sender address filed under a vendor name. A vendor can have several —
 * Neon mails from both `neon.tech` and `ar.neon.tech`, and a vendor that moved
 * to a payment processor keeps its old direct sender — so callers that need a
 * domain should try each rather than assuming one row.
 */
export async function senderAddressesFor(orgId: number, name: string): Promise<string[]> {
  const rows = await db
    .selectFrom('server.service')
    .innerJoin('billing.email', 'billing.email.server_id', 'server.service.id')
    .innerJoin('billing.invoices', 'billing.invoices.email_id', 'billing.email.id')
    .select('server.service.sender_address')
    .where('billing.invoices.org_id', '=', orgId)
    .where('server.service.name', '=', name)
    .groupBy('server.service.sender_address')
    .execute();
  return rows.map((r) => r.sender_address);
}
