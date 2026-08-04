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
