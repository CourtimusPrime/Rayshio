import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { config } from '../../config.js';
import { db } from '../../db/client.js';
import { getPdf } from '../../mongo/pdfs.js';

const dateRange = {
  date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('inclusive, YYYY-MM-DD'),
  date_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe('inclusive, YYYY-MM-DD'),
};

function text(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

/** All queries filter by the API key's org first — account isolation per spec. */
export function registerTools(server: McpServer): void {
  const orgId = config.DEFAULT_ORG_ID;

  server.registerTool(
    'list_services',
    {
      description:
        'Distinct vendors/services this org has invoices from, with invoice counts and first/last invoice dates.',
      inputSchema: {},
    },
    async () => {
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
      return text(rows);
    },
  );

  server.registerTool(
    'list_invoices',
    {
      description: 'Invoices for the org, optionally filtered by service name and/or date range.',
      inputSchema: {
        service: z.string().optional().describe('service name, e.g. "Neon"'),
        ...dateRange,
      },
    },
    async ({ service, date_from, date_to }) => {
      let q = db
        .selectFrom('billing.invoices')
        .innerJoin('billing.email', 'billing.email.id', 'billing.invoices.email_id')
        .innerJoin('server.service', 'server.service.id', 'billing.email.server_id')
        .select([
          'billing.invoices.id as invoice_id',
          'server.service.name as service',
          'billing.invoices.invoice_number',
          'billing.invoices.value',
          'billing.invoices.currency',
          'billing.invoices.invoice_date',
          'billing.invoices.period_start',
          'billing.invoices.period_end',
          'billing.invoices.status',
          'billing.email.delivered_at',
        ])
        .where('billing.invoices.org_id', '=', orgId);
      if (service) q = q.where('server.service.name', 'ilike', service);
      if (date_from) q = q.where('billing.invoices.invoice_date', '>=', new Date(date_from));
      if (date_to) q = q.where('billing.invoices.invoice_date', '<=', new Date(date_to));
      const rows = await q.orderBy('billing.invoices.invoice_date', 'desc').limit(500).execute();
      return text(rows.map((r) => ({ ...r, value_formatted: formatMinor(r.value, r.currency) })));
    },
  );

  server.registerTool(
    'get_invoice',
    {
      description: 'Full invoice detail including line items.',
      inputSchema: { invoice_id: z.number().int() },
    },
    async ({ invoice_id }) => {
      const invoice = await db
        .selectFrom('billing.invoices')
        .innerJoin('billing.email', 'billing.email.id', 'billing.invoices.email_id')
        .innerJoin('server.service', 'server.service.id', 'billing.email.server_id')
        .selectAll('billing.invoices')
        .select([
          'server.service.name as service',
          'billing.email.subject as email_subject',
          'billing.email.delivered_at',
        ])
        .where('billing.invoices.id', '=', invoice_id)
        .where('billing.invoices.org_id', '=', orgId)
        .executeTakeFirst();
      if (!invoice) return text({ error: `invoice ${invoice_id} not found` });

      const lineItems = await db
        .selectFrom('billing.invoice_line_items')
        .selectAll()
        .where('invoice_id', '=', invoice_id)
        .orderBy('id')
        .execute();
      return text({
        ...invoice,
        value_formatted: formatMinor(invoice.value, invoice.currency),
        line_items: lineItems.map((li) => ({
          ...li,
          amount_formatted: formatMinor(li.amount, invoice.currency),
        })),
      });
    },
  );

  server.registerTool(
    'get_invoice_pdf',
    {
      description: 'The original invoice PDF (base64). Errors when the invoice has no PDF.',
      inputSchema: { invoice_id: z.number().int() },
    },
    async ({ invoice_id }) => {
      const invoice = await db
        .selectFrom('billing.invoices')
        .select(['pdf_id', 'invoice_number'])
        .where('id', '=', invoice_id)
        .where('org_id', '=', orgId)
        .executeTakeFirst();
      if (!invoice) return text({ error: `invoice ${invoice_id} not found` });
      if (!invoice.pdf_id) {
        return text({ error: `invoice ${invoice_id} has no PDF (body-text extraction)` });
      }
      const pdf = await getPdf(invoice.pdf_id);
      return {
        content: [
          {
            type: 'resource' as const,
            resource: {
              uri: `invoice-pdf://${invoice_id}`,
              mimeType: 'application/pdf',
              blob: pdf.toString('base64'),
            },
          },
        ],
      };
    },
  );

  server.registerTool(
    'spend_summary',
    {
      description:
        'Aggregated spend grouped by service or by line-item description ("what is driving my cost"). Sums are per-currency, no conversion. Only parsed invoices are included.',
      inputSchema: {
        group_by: z.enum(['service', 'line_item_description']),
        ...dateRange,
      },
    },
    async ({ group_by, date_from, date_to }) => {
      // grouping is always org first, currency second, dimension last (account isolation)
      if (group_by === 'service') {
        let q = db
          .selectFrom('billing.invoices')
          .innerJoin('billing.email', 'billing.email.id', 'billing.invoices.email_id')
          .innerJoin('server.service', 'server.service.id', 'billing.email.server_id')
          .select(({ fn }) => [
            'billing.invoices.currency',
            'server.service.name as service',
            fn.sum('billing.invoices.value').as('total_minor'),
            fn.count('billing.invoices.id').as('invoice_count'),
          ])
          .where('billing.invoices.org_id', '=', orgId)
          .where('billing.invoices.status', '=', 'parsed');
        if (date_from) q = q.where('billing.invoices.invoice_date', '>=', new Date(date_from));
        if (date_to) q = q.where('billing.invoices.invoice_date', '<=', new Date(date_to));
        const rows = await q
          .groupBy(['billing.invoices.currency', 'server.service.name'])
          .orderBy('total_minor', 'desc')
          .execute();
        return text(
          rows.map((r) => ({
            ...r,
            total_formatted: formatMinor(Number(r.total_minor), r.currency),
          })),
        );
      }

      let q = db
        .selectFrom('billing.invoice_line_items')
        .innerJoin(
          'billing.invoices',
          'billing.invoices.id',
          'billing.invoice_line_items.invoice_id',
        )
        .select(({ fn }) => [
          'billing.invoices.currency',
          'billing.invoice_line_items.description',
          fn.sum('billing.invoice_line_items.amount').as('total_minor'),
          fn.count('billing.invoice_line_items.id').as('line_count'),
        ])
        .where('billing.invoices.org_id', '=', orgId)
        .where('billing.invoices.status', '=', 'parsed');
      if (date_from) q = q.where('billing.invoices.invoice_date', '>=', new Date(date_from));
      if (date_to) q = q.where('billing.invoices.invoice_date', '<=', new Date(date_to));
      const rows = await q
        .groupBy(['billing.invoices.currency', 'billing.invoice_line_items.description'])
        .orderBy('total_minor', 'desc')
        .execute();
      return text(
        rows.map((r) => ({
          ...r,
          total_formatted: formatMinor(Number(r.total_minor), r.currency),
        })),
      );
    },
  );
}

function formatMinor(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}
