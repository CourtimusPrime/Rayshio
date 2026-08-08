import { z } from 'zod';
import type { Category } from '../categories.js';
import { config } from '../config.js';
import { CATEGORY_INSTRUCTIONS } from './category-prompt.js';
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

${CATEGORY_INSTRUCTIONS}`;

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
