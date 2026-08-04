import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { config } from '../../config.js';
import { getPdf } from '../../mongo/pdfs.js';
import { formatMinor } from '../../queries/format.js';
import {
  getInvoice,
  getInvoicePdfRef,
  getLineItems,
  listInvoices,
} from '../../queries/invoices.js';
import { listServices } from '../../queries/services.js';
import {
  spendByCategory,
  spendByLineItemDescription,
  spendByService,
} from '../../queries/spend.js';

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

/**
 * `sum()` over a bigint column returns pg `numeric`, which the driver hands back
 * as a string. The query layer coerces it to a number; these tools have always
 * emitted the string, so keep that on the wire rather than changing a shape
 * existing MCP clients are configured against.
 */
function legacyTotal(total: number): string {
  return String(total);
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
    async () => text(await listServices(orgId)),
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
      const rows = await listInvoices(orgId, {
        service,
        dateFrom: date_from,
        dateTo: date_to,
        limit: 500,
      });
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
      const invoice = await getInvoice(orgId, invoice_id);
      if (!invoice) return text({ error: `invoice ${invoice_id} not found` });

      const lineItems = await getLineItems(invoice_id);
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
      const invoice = await getInvoicePdfRef(orgId, invoice_id);
      if (!invoice) return text({ error: `invoice ${invoice_id} not found` });
      if (!invoice.pdf_id) {
        return text({ error: `invoice ${invoice_id} has no PDF (body-text extraction)` });
      }
      let pdf: Buffer;
      try {
        pdf = await getPdf(invoice.pdf_id);
      } catch {
        // the invoice row points at a GridFS file that is gone
        return text({ error: `invoice ${invoice_id} PDF is missing from storage` });
      }
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
        'Aggregated spend grouped by service, by normalized usage category ("what is my storage costing me across every vendor"), or by raw line-item description. Sums are per-currency, no conversion. Only parsed invoices are included.',
      inputSchema: {
        group_by: z.enum(['service', 'category', 'line_item_description']),
        ...dateRange,
      },
    },
    async ({ group_by, date_from, date_to }) => {
      const range = { dateFrom: date_from, dateTo: date_to };

      if (group_by === 'service') {
        const rows = await spendByService(orgId, range);
        return text(
          rows.map((r) => ({
            currency: r.currency,
            service: r.service,
            total_minor: legacyTotal(r.total_minor),
            invoice_count: r.invoice_count,
            total_formatted: formatMinor(r.total_minor, r.currency),
          })),
        );
      }

      if (group_by === 'category') {
        const rows = await spendByCategory(orgId, range);
        return text(
          rows.map((r) => ({
            currency: r.currency,
            category: r.category,
            total_minor: legacyTotal(r.total_minor),
            line_count: r.line_count,
            total_formatted: formatMinor(r.total_minor, r.currency),
          })),
        );
      }

      const rows = await spendByLineItemDescription(orgId, range);
      return text(
        rows.map((r) => ({
          currency: r.currency,
          description: r.description,
          total_minor: legacyTotal(r.total_minor),
          line_count: r.line_count,
          total_formatted: formatMinor(r.total_minor, r.currency),
        })),
      );
    },
  );
}
