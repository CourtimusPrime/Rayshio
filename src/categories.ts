/**
 * Normalized line-item categories (SPEC.md).
 *
 * The point of a shared taxonomy is same-category comparison *across* vendors:
 * "Storage (root branches), GB-month" on a Neon invoice and "Volume storage" on
 * a Railway invoice must both resolve to `storage`, or you cannot compare what
 * the two charge for the same thing. That is why compute, storage and network
 * are separate rather than collapsed into a per-vendor notion like "databases".
 *
 * Keep this list small and stable — widening it means re-classifying every
 * historical line item.
 */
export const CATEGORIES = [
  'compute',
  'storage',
  'api_usage',
  'ai_invocations',
  'network',
  'subscription',
  'other',
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Line items are classified lazily; anything unclassified reads as 'other'. */
export function normalizeCategory(value: string | null | undefined): Category {
  return (CATEGORIES as readonly string[]).includes(value ?? '') ? (value as Category) : 'other';
}

const LABELS: Record<Category, string> = {
  compute: 'Compute',
  storage: 'Storage',
  api_usage: 'API usage',
  ai_invocations: 'AI invocations',
  network: 'Network',
  subscription: 'Subscriptions',
  other: 'Other',
};

/** Human-facing label; the stored value stays snake_case. */
export function categoryLabel(category: string): string {
  return LABELS[normalizeCategory(category)];
}
