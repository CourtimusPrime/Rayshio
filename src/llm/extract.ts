import { zodToJsonSchema } from 'zod-to-json-schema';
import { config } from '../config.js';
import { completeJson } from './openrouter.js';
import { type Extraction, extractionSchema } from './schemas.js';

const EXTRACT_SYSTEM = `You extract structured invoice data from invoice text.

Rules:
- All money values are integers in MINOR units (cents): $42.17 -> 4217. Never use floats.
- total_minor is the invoice's final total (amount due / amount paid).
- Extract EVERY line item. Line items may continue across page markers ("--- page N of M ---");
  a table started on one page can finish on the next, and totals may appear on a later page.
- The sum of line_items[].amount_minor must equal total_minor. If the invoice shows tax,
  fees, credits, or discounts as separate lines, include them as line items so the sum matches.
- rate_minor is the per-unit rate in minor units; null when the line has no unit rate.
- Dates in YYYY-MM-DD. currency is the 3-letter ISO code shown on the invoice.
- period_start/period_end: the billing period (invoice-level, and per-line when shown).`;

export async function extractInvoice(
  invoiceText: string,
  opts?: { escalate?: boolean },
): Promise<Extraction> {
  const model = opts?.escalate ? config.OPENROUTER_ESCALATE_MODEL : config.OPENROUTER_EXTRACT_MODEL;
  const content = await completeJson({
    model,
    system: EXTRACT_SYSTEM,
    user: invoiceText,
    schemaName: 'invoice_extraction',
    jsonSchema: zodToJsonSchema(extractionSchema) as Record<string, unknown>,
  });
  return extractionSchema.parse(JSON.parse(content));
}
