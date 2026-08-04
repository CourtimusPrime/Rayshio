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
