import type { Extraction } from '../llm/schemas.js';

export interface ReconcileResult {
  ok: boolean;
  sum: number;
  total: number;
  tolerance: number;
}

/**
 * Line-item amounts must sum to the invoice total within rounding tolerance:
 * 1 cent per line item, minimum 2 cents.
 */
export function reconcile(
  extraction: Pick<Extraction, 'total_minor' | 'line_items'>,
): ReconcileResult {
  const sum = extraction.line_items.reduce((acc, li) => acc + li.amount_minor, 0);
  const tolerance = Math.max(2, extraction.line_items.length);
  return {
    ok: Math.abs(sum - extraction.total_minor) <= tolerance,
    sum,
    total: extraction.total_minor,
    tolerance,
  };
}

/**
 * A zero total that had real charges in it.
 *
 * `reconcile` cannot catch the failure this exists for, because that failure is
 * self-consistent: asked to extract a paid receipt, the model emitted the
 * settlement line ("Paid via Mastercard ending in 4149", -£42.93) as a credit
 * and set the total to the £0.00 balance left afterwards. Sum and total agree
 * perfectly. They are simply both wrong, and £42.93 of real spend reads as zero.
 *
 * Nothing in the numbers separates that from a genuine zero — a 100% free-trial
 * discount produces exactly the same shape (charge, equal-and-opposite negative,
 * total 0). Only the description of the negative line says which it is, and that
 * is a judgement for the model, not for arithmetic here.
 *
 * So this does not reject anything. It only marks the shape as worth a second,
 * stronger look, and the caller escalates. A genuine zero survives the second
 * pass unchanged; the cost of being wrong is one extra LLM call on a document
 * that charged nothing, which is rare.
 */
export function suspiciousZeroTotal(
  extraction: Pick<Extraction, 'total_minor' | 'line_items'>,
): boolean {
  return extraction.total_minor === 0 && extraction.line_items.some((li) => li.amount_minor > 0);
}
