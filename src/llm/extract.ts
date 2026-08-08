import { config } from '../config.js';
import { CATEGORY_INSTRUCTIONS } from './category-prompt.js';
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
- Credits are NEGATIVE line items, and a credit is often written without a visible minus
  sign — extracting a PDF to text frequently loses it. Decide by meaning, not by the
  character: an "applied balance", "account credit", "amount already paid", a discount
  ("$20.00 off"), or proration for time you are giving back ("Unused time on <plan>",
  "Credit for unused time") all REDUCE what is owed, so emit them negative even when the
  document shows a bare "$5.00".
- When a document shows both a "Total" and a lower "Amount due" (or "Balance due"),
  total_minor is the AMOUNT DUE, and whatever closed the gap — usually an applied
  balance or credit — must appear as its own negative line item. Worked example:
  Pro plan $19.90, Unused time on Hobby plan $4.98, Subtotal $14.92, Applied balance
  $5.00, Amount due $9.92 -> total_minor 992 with line items 1990, -498 and -500,
  which sum to 992.
- rate_minor is the per-unit rate in minor units; null when the line has no unit rate.
- Dates in YYYY-MM-DD. currency is the 3-letter ISO code shown on the invoice.
- period_start/period_end: the billing period (invoice-level, and per-line when shown).
- vendor_name is the company that ISSUED the invoice (the "from"/"bill from" party),
  never the customer being billed. Use the vendor's plain trading name — "Anthropic",
  not "Anthropic, PBC" or "ANTHROPIC PBC INVOICE". Null if you cannot tell.

${CATEGORY_INSTRUCTIONS}`;

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
    schema: extractionSchema,
  });
  return extractionSchema.parse(JSON.parse(content));
}
