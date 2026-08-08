import type { Category, CategoryParent } from './types';
import { CATEGORY_META, CATEGORY_PARENTS } from './types';

type Rgb = [number, number, number];

/**
 * One stable colour per category, derived from its parent group rather than
 * hand-picked twenty-one times.
 *
 * With seven categories a hand-tuned list was readable. With twenty-one it
 * would be a wall of near-identical hexes that nobody could keep coherent, and
 * a chart legend where "Flights" and "Furniture" sit two shades apart tells the
 * reader nothing. Ramping within a parent means a glance at a breakdown shows
 * the *shape* of the spend — mostly Technology, some Employee Expenses —
 * before any label is read.
 *
 * The Technology ramp starts at the brand accent, because that is where this
 * product's spend actually concentrates.
 */
const PARENT_RAMPS: Record<CategoryParent, { from: Rgb; to: Rgb }> = {
  // violet — the accent family
  technology: { from: [109, 40, 217], to: [221, 214, 254] },
  // teal — clearly not violet at a glance, still cool
  employee: { from: [13, 148, 136], to: [178, 232, 226] },
  // amber — warm, so physical goods read as a different kind of thing
  goods: { from: [180, 83, 9], to: [253, 224, 176] },
  // neutral — Other should never draw the eye
  other: { from: [82, 82, 91], to: [212, 212, 216] },
};

function mix(from: Rgb, to: Rgb, t: number): string {
  // Destructured rather than indexed: `noUncheckedIndexedAccess` types a tuple
  // read as possibly-undefined, and widening each channel with `?? 0` would
  // hide a genuine mistake behind black.
  const [fr, fg, fb] = from;
  const [tr, tg, tb] = to;
  const hex = (a: number, b: number) =>
    Math.round(a + (b - a) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(fr, tr)}${hex(fg, tg)}${hex(fb, tb)}`;
}

function buildColors(): Record<Category, string> {
  const out = {} as Record<Category, string>;
  for (const parent of CATEGORY_PARENTS) {
    const members = (Object.keys(CATEGORY_META) as Category[]).filter(
      (c) => CATEGORY_META[c].parent === parent,
    );
    const ramp = PARENT_RAMPS[parent];
    members.forEach((category, index) => {
      // A single-member group sits at the start of its ramp, not the midpoint —
      // the saturated end is the one that reads as a real colour.
      const t = members.length <= 1 ? 0 : index / (members.length - 1);
      out[category] = mix(ramp.from, ramp.to, t);
    });
  }
  return out;
}

export const categoryColors: Record<Category, string> = buildColors();

/** Stored values are snake_case; screens show these. */
export function categoryLabel(category: Category | string | null | undefined): string {
  const key = category as Category;
  return CATEGORY_META[key]?.label ?? 'Other';
}

export function categoryIcon(category: Category | string | null | undefined): string {
  const key = category as Category;
  return CATEGORY_META[key]?.icon ?? 'CircleDashed';
}
