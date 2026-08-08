import { z } from 'zod';
import { CATEGORIES, type Category } from '../categories.js';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

/**
 * Derived from the taxonomy rather than restated.
 *
 * These two lists drifting apart is a silent failure: the model would return a
 * category the schema rejects, or — worse — one the schema accepts and the
 * database CHECK constraint does not, failing the whole extraction at write
 * time on an invoice that parsed perfectly.
 *
 * `z.enum` needs a non-empty tuple, hence the cast; `CATEGORIES` is a literal
 * object's keys and is never empty.
 */
export const CATEGORY_VALUES = CATEGORIES as unknown as [Category, ...Category[]];

export const lineItemSchema = z.object({
  description: z.string().min(1),
  /** Normalized category — classified in the same call as extraction (SPEC.md). */
  category: z.enum(CATEGORY_VALUES),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  rate_minor: z.number().int().nullable(),
  amount_minor: z.number().int(),
  period_start: isoDate,
  period_end: isoDate,
});

export const extractionSchema = z.object({
  /**
   * The company that issued the invoice.
   *
   * Only uploaded PDFs use it: a Gmail-ingested invoice already knows its
   * vendor from the sending address, which is more reliable than anything read
   * off the page. Nullable because plenty of invoices bury the issuer in a
   * logo, and a guess is worse than an honest absence.
   *
   * Defaulted rather than required, so a model that omits the field cannot fail
   * an extraction outright. The Gmail path does not need this value at all, and
   * regressing that path to add a field only uploads use would be a poor trade.
   */
  vendor_name: z.string().nullable().default(null),
  invoice_number: z.string().nullable(),
  currency: z.string().length(3),
  total_minor: z.number().int(),
  invoice_date: isoDate,
  due_date: isoDate,
  period_start: isoDate,
  period_end: isoDate,
  line_items: z.array(lineItemSchema).min(1),
});

export type Extraction = z.infer<typeof extractionSchema>;
export type ExtractedLineItem = z.infer<typeof lineItemSchema>;

export const senderClassificationSchema = z.object({
  is_billing_sender: z.boolean(),
  service_name: z.string().nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
});

export type SenderClassification = z.infer<typeof senderClassificationSchema>;

export const emailClassificationSchema = z.object({
  is_invoice: z.boolean(),
});

export type EmailClassification = z.infer<typeof emailClassificationSchema>;
