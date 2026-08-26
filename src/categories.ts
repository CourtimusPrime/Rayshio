/**
 * Normalized line-item categories (`dev/CATEGORIES.md`).
 *
 * The point of a shared taxonomy is same-category comparison *across* vendors:
 * "Storage (root branches), GB-month" on a Neon invoice and "Volume storage" on
 * a Railway invoice must both resolve to `storage`, or you cannot compare what
 * the two charge for the same thing. That is why compute, storage and network
 * stay separate rather than collapsing into a per-vendor notion like
 * "databases".
 *
 * Two values are not in `dev/CATEGORIES.md` and were added deliberately:
 *
 *  - `subscriptions` — the list had no home for a flat recurring plan or a
 *    per-seat licence, which is 91 of this database's line items. Filing those
 *    under `access` or `computing` would move real money between categories on
 *    the dashboard to no one's benefit.
 *  - `other` — the source list left "Other · 2" blank. Something has to catch
 *    discounts, refunds and adjustments, and a taxonomy with no escape hatch
 *    just pushes those into whichever category is nearest, quietly.
 *
 * Slugs are stable and snake_case; `storage`, `network` and `other` keep the
 * values they already had, so those rows needed no migration. Renaming a slug
 * later means migrating every historical line item *and* every stored rule, so
 * prefer adding to this list over re-spelling it.
 */

export const CATEGORY_PARENTS = ['technology', 'employee', 'goods', 'other'] as const;
export type CategoryParent = (typeof CATEGORY_PARENTS)[number];

export const PARENT_LABELS: Record<CategoryParent, string> = {
  technology: 'Technology',
  employee: 'Employee Expenses',
  goods: 'Physical Goods',
  other: 'Other',
};

interface CategoryMeta {
  label: string;
  parent: CategoryParent;
  /** Lucide icon name, resolved on the client. Kept here so the two agree. */
  icon: string;
}

/**
 * Declaration order is display order: within a parent, the order from
 * `dev/CATEGORIES.md`. The picker and every legend read it from here rather
 * than sorting alphabetically, which would scatter related categories.
 */
export const CATEGORY_META = {
  // -- Technology --
  computing: { label: 'Computing', parent: 'technology', icon: 'Cpu' },
  ai: { label: 'AI', parent: 'technology', icon: 'BrainCircuit' },
  web_search: { label: 'Web Search', parent: 'technology', icon: 'Globe' },
  storage: { label: 'Storage', parent: 'technology', icon: 'Database' },
  domains: { label: 'Domains', parent: 'technology', icon: 'Link' },
  network: { label: 'Network', parent: 'technology', icon: 'Share2' },
  access: { label: 'Access', parent: 'technology', icon: 'LockOpen' },
  authentication: { label: 'Authentication', parent: 'technology', icon: 'Shield' },
  subscriptions: { label: 'Subscriptions', parent: 'technology', icon: 'CalendarSync' },
  communications: { label: 'Communications', parent: 'technology', icon: 'Megaphone' },

  // -- Employee Expenses --
  food: { label: 'Food', parent: 'employee', icon: 'Utensils' },
  transportation: { label: 'Transportation', parent: 'employee', icon: 'CarFront' },
  flights: { label: 'Flights', parent: 'employee', icon: 'Plane' },
  accommodation: { label: 'Accommodation', parent: 'employee', icon: 'BedDouble' },
  reimbursement: { label: 'Reimbursement', parent: 'employee', icon: 'HandCoins' },
  training: { label: 'Training', parent: 'employee', icon: 'GraduationCap' },

  // -- Physical Goods --
  inventory: { label: 'Inventory', parent: 'goods', icon: 'Boxes' },
  office_supplies: { label: 'Office Supplies', parent: 'goods', icon: 'NotebookPen' },
  furniture: { label: 'Furniture', parent: 'goods', icon: 'LampDesk' },
  equipment: { label: 'Equipment', parent: 'goods', icon: 'Toolbox' },

  // -- Other --
  taxes_fees: { label: 'Taxes & Fees', parent: 'other', icon: 'Coins' },
  other: { label: 'Other', parent: 'other', icon: 'CircleDashed' },
} as const satisfies Record<string, CategoryMeta>;

export const CATEGORIES = Object.keys(CATEGORY_META) as (keyof typeof CATEGORY_META)[];

export type Category = keyof typeof CATEGORY_META;

/** Line items are classified lazily; anything unclassified reads as 'other'. */
export function normalizeCategory(value: string | null | undefined): Category {
  return (CATEGORIES as readonly string[]).includes(value ?? '') ? (value as Category) : 'other';
}

/** Human-facing label; the stored value stays snake_case. */
export function categoryLabel(value: string | null | undefined): string {
  return CATEGORY_META[normalizeCategory(value)].label;
}

export function categoryParent(value: string | null | undefined): CategoryParent {
  return CATEGORY_META[normalizeCategory(value)].parent;
}

/** Categories grouped for display, parents in declaration order. */
export function categoriesByParent(): { parent: CategoryParent; categories: Category[] }[] {
  return CATEGORY_PARENTS.map((parent) => ({
    parent,
    categories: CATEGORIES.filter((c) => CATEGORY_META[c].parent === parent),
  }));
}
