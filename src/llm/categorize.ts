import { z } from 'zod';
import type { Category } from '../categories.js';
import { config } from '../config.js';
import { completeJson } from './openrouter.js';
import { CATEGORY_VALUES } from './schemas.js';

/**
 * Standalone classification for line items that already exist.
 *
 * New invoices are classified during extraction (see src/llm/extract.ts), which
 * is the cheaper path. This exists to backfill rows parsed before a taxonomy
 * change, without re-extracting the invoice.
 */

const lineItemCategorySchema = z.object({
  categories: z.array(
    z.object({
      index: z.number().int(),
      category: z.enum(CATEGORY_VALUES),
    }),
  ),
});

const CATEGORY_SYSTEM = `You assign a normalized category to each line item on a software vendor's invoice.
Return exactly one entry per input line item, echoing its index.

Categories:
- "compute": CPU/memory/instance/container/serverless execution time.
- "storage": disks, volumes, object storage, databases, backups, snapshots.
- "network": bandwidth, egress, data transfer, CDN, load balancing.
- "api_usage": metered requests, calls, events, observability ingest — consumption that is not compute, storage, network, or model inference.
- "ai_invocations": LLM/model inference, tokens, embeddings, GPU inference.
- "subscription": flat recurring plan or per-seat licence fees.
- "other": tax and VAT, discounts, refunds, adjustments, and nothing else fitting.

Category rules that matter:
- Categorize what the LINE describes, not what the vendor mainly sells. The point is
  comparing the same cost type across vendors, so a storage line on a compute vendor's
  invoice is still "storage".
- Prepaid credits and account top-ups take the category of what the vendor sells:
  "OpenRouter Credits" is "ai_invocations", not "other". Only genuine tax, discount,
  refund and adjustment lines are "other".
- For an opaque total ("Payment received", "Amount"), infer from the vendor when you
  can and fall back to "other" only when you cannot.`;

export interface LineItemToCategorize {
  index: number;
  description: string;
  amount_minor: number;
}

/**
 * One call per invoice, all line items batched. Returns index → category for
 * whatever the model classified; callers must tolerate missing entries.
 */
export async function categorizeLineItems(input: {
  service: string;
  currency: string;
  items: LineItemToCategorize[];
}): Promise<Map<number, Category>> {
  const content = await completeJson({
    model: config.OPENROUTER_CLASSIFY_MODEL,
    system: CATEGORY_SYSTEM,
    user: JSON.stringify(input),
    schemaName: 'line_item_categories',
    schema: lineItemCategorySchema,
  });
  const parsed = lineItemCategorySchema.parse(JSON.parse(content));
  return new Map(parsed.categories.map((c) => [c.index, c.category as Category]));
}
