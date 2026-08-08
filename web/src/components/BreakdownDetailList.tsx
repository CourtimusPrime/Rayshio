import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDownIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useCategories, useServiceCategories } from '../api/hooks';
import { categoryColors, categoryLabel } from '../categoryColors';
import { useMotionPrefs } from '../motion/useMotionPrefs';
import { useWorkspace } from '../state/workspace';
import type { Category, ConversionMeta } from '../types';
import { formatCurrency } from '../utils/format';
import { AnimatedCurrency } from './AnimatedNumber';
import { ConversionNote } from './ConversionNote';
import { CategoryIcon } from './CategoryIcon';
import { CategoryPicker } from './CategoryPicker';
import { ServiceLogo } from './ServiceLogo';
import { EmptyNote, ErrorNote, LoadingLines } from './states';

/**
 * The month's line items as an expandable two-level list, either way up.
 *
 * `category` nests services under categories — "what is this spend for, and who
 * are we paying for it". `service` pivots the same rows — "who are we paying,
 * and what are they charging us for". The totals are identical either way
 * because both come from the same line items converted once on the server; only
 * the nesting differs.
 *
 * One component rather than two because everything structural is shared — the
 * accordion, the height animation, the share-of-parent bars, the footer. What
 * actually differs is which dimension supplies the row's mark and label, so
 * that is all `mode` selects.
 */

export type BreakdownMode = 'category' | 'service';

/** A level of the tree, flattened to what the list needs to draw it. */
interface Row {
  key: string;
  label: string;
  /** The tinted category icon or vendor logo that identifies the row. */
  mark: ReactNode;
  total_minor: number;
  note?: string;
  /**
   * What a child row needs to be re-filed: the vendor it belongs to, the
   * category it currently sits in, and every line text it covers.
   *
   * Carried on the row because which of the two is the vendor depends on the
   * nesting — the Category tab puts services underneath, the Service tab puts
   * categories — and the picker should not have to know which tab it is in.
   */
  cell?: { service: string; category: Category; descriptions: string[] };
}

interface Group extends Row {
  children: Row[];
}

/**
 * A category's mark: its Lucide icon, tinted by the category colour on a wash of
 * the same hue.
 *
 * Replaces a bare colour rail. The rail carried the colour and nothing else, so
 * every row looked identical until you read its label — and with twenty-one
 * categories ramped within four parent groups, neighbouring shades are close
 * enough that the rail stopped distinguishing them at all. The icon is the part
 * a reader recognises before the text; the tint still carries the grouping.
 *
 * Same treatment as the invoice drawer's line items, so a category looks the
 * same wherever it appears.
 */
function categoryMark(category: Category) {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
      style={{
        // 0x26 ~ 15% — enough to read as a tint of the icon's own colour
        // without competing with the surface behind it.
        backgroundColor: `${categoryColors[category]}26`,
        color: categoryColors[category],
      }}
    >
      <CategoryIcon category={category} className="h-4 w-4" />
    </span>
  );
}

export function BreakdownDetailList({ mode }: { mode: BreakdownMode }) {
  const { currency, month } = useWorkspace();
  const categoryQuery = useCategories(currency, month);
  const serviceQuery = useServiceCategories(currency, month);
  const prefs = useMotionPrefs();

  // Both hooks always run — hooks cannot be called conditionally — but only the
  // active one's data is read. The idle tab's request is a warmed cache for the
  // moment the user switches, not waste.
  const active = mode === 'category' ? categoryQuery : serviceQuery;
  const { isPending, error } = active;
  const conversion: ConversionMeta | undefined = active.data?.conversion;

  const groups: Group[] =
    mode === 'category'
      ? (categoryQuery.data?.categories ?? []).map((c) => ({
          key: c.category,
          label: categoryLabel(c.category),
          mark: categoryMark(c.category),
          total_minor: c.total_minor,
          children: c.services.map((s) => ({
            key: s.service,
            label: s.service,
            mark: <ServiceLogo name={s.service} />,
            total_minor: s.total_minor,
            note: s.note,
            cell: { service: s.service, category: c.category, descriptions: s.descriptions },
          })),
        }))
      : (serviceQuery.data?.services ?? []).map((s) => ({
          key: s.service,
          label: s.service,
          mark: <ServiceLogo name={s.service} />,
          total_minor: s.total_minor,
          children: s.categories.map((c) => ({
            key: c.category,
            label: categoryLabel(c.category),
            mark: categoryMark(c.category),
            total_minor: c.total_minor,
            note: c.note,
            cell: { service: s.service, category: c.category, descriptions: c.descriptions },
          })),
        }));

  const total = groups.reduce((sum, item) => sum + item.total_minor, 0);
  const [open, setOpen] = useState<string[]>([]);
  /** Which sub-item's category picker is open, keyed `group/child`. */
  const [picking, setPicking] = useState<{ key: string; anchor: DOMRect } | null>(null);

  const toggle = (key: string) =>
    setOpen((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );

  // the largest group starts expanded, as in the design
  const first = groups[0]?.key;
  const isOpenFor = (key: string) => open.includes(key) || (open.length === 0 && key === first);

  const noun = mode === 'category' ? 'category' : 'service';
  const childNoun = mode === 'category' ? 'services' : 'categories';

  return (
    <section
      aria-labelledby="breakdown-detail-heading"
      className="clip-card rounded-xl border border-line bg-surface shadow-card"
    >
      <div className="px-5 py-4 md:px-6">
        <h2 id="breakdown-detail-heading" className="text-body font-medium text-ink-900">
          {mode === 'category' ? 'Itemized costs by category' : 'Itemized costs by service'}
        </h2>
        <p className="mt-1 text-caption text-ink-500">
          {mode === 'category'
            ? 'Expand a category to see which services contribute to it'
            : 'Expand a service to see what it is charging you for'}
        </p>
      </div>

      {error && (
        <div className="px-5 pb-5 md:px-6">
          <ErrorNote message={error.message} />
        </div>
      )}
      {!error && (isPending || !currency) && (
        <div className="px-5 pb-5 md:px-6">
          <LoadingLines rows={4} />
        </div>
      )}
      {!error && !isPending && groups.length === 0 && (
        <div className="px-5 pb-5 md:px-6">
          <EmptyNote message="No categorized spend this month." />
        </div>
      )}

      {groups.length > 0 && (
        <>
          <ul className="border-t border-line">
            {groups.map((group) => {
              const isOpen = isOpenFor(group.key);
              const share = total === 0 ? 0 : Math.round((group.total_minor / total) * 100);

              return (
                <li key={group.key} className="border-b border-line last:border-b-0">
                  {/*
                    The mark sits beside the toggle, not inside it.

                    A vendor logo is a button now — it opens that vendor's
                    editor — and a button inside a button is invalid markup that
                    browsers resolve by dropping one of them, taking its
                    keyboard behaviour with it. So the row is a flex container
                    holding the mark and the toggle as siblings, and the toggle
                    stretches to fill what is left.
                  */}
                  <div className="press-row flex w-full items-center gap-3 px-5 py-4 transition-colors hover:bg-canvas md:px-6">
                    {group.mark}
                    <button
                      type="button"
                      onClick={() => toggle(group.key)}
                      aria-expanded={isOpen}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span className="min-w-0">
                        <span className="block text-footnote font-medium text-ink-900">
                          {group.label}
                        </span>
                        <span className="tnum mt-0.5 block text-caption text-ink-500">
                          {group.children.length} {childNoun} · {share}% of spend
                        </span>
                      </span>

                      <span className="ml-auto flex items-center gap-3">
                        <span className="tnum text-body font-medium text-ink-900">
                          <AnimatedCurrency
                            value={group.total_minor}
                            currency={currency ?? 'USD'}
                          />
                        </span>
                        <ChevronDownIcon
                          className={`h-4 w-4 text-ink-400 transition-transform ${
                            isOpen ? 'rotate-180' : ''
                          }`}
                          strokeWidth={1.75}
                        />
                      </span>
                    </button>
                  </div>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        // critically damped on purpose: an overshoot on
                        // height:'auto' pushes past the measured height and
                        // clips against the wrapper, snapping at the end
                        transition={prefs.spring('quick')}
                        className="overflow-hidden"
                      >
                        <ul className="border-t border-line bg-canvas px-5 py-2 md:px-6">
                          {group.children.map((child) => (
                            <li key={child.key} className="relative flex items-center gap-3 py-2.5">
                              {child.mark}
                              {/*
                                The whole sub-item is the target, minus its mark.
                                On the Category tab that mark is a vendor logo —
                                already a button that opens the vendor editor —
                                so it stays a sibling rather than being nested
                                inside this one.
                              */}
                              <button
                                type="button"
                                aria-haspopup="dialog"
                                aria-expanded={picking?.key === `${group.key}/${child.key}`}
                                onClick={(event) => {
                                  // the picker closes on any outside click, and
                                  // this click would otherwise count as one
                                  event.stopPropagation();
                                  const key = `${group.key}/${child.key}`;
                                  const anchor = event.currentTarget.getBoundingClientRect();
                                  setPicking(picking?.key === key ? null : { key, anchor });
                                }}
                                className="press-row flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left transition-colors hover:bg-surface"
                              >
                              <span className="min-w-0">
                                <span className="block text-footnote text-ink-900">
                                  {child.label}
                                </span>
                                <span className="block text-caption text-ink-400">
                                  {child.note}
                                </span>
                              </span>
                              <span className="ml-auto flex items-center gap-3">
                                <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-line sm:block">
                                  <span
                                    className="block h-full rounded-full"
                                    style={{
                                      width: `${
                                        group.total_minor === 0
                                          ? 0
                                          : Math.max(
                                              0,
                                              (child.total_minor / group.total_minor) * 100,
                                            )
                                      }%`,
                                      /* The bar is always tinted by the
                                         category, whichever level that is —
                                         colour means category throughout the
                                         app, and re-using it for a vendor here
                                         would make the palette mean two
                                         different things on one page. */
                                      backgroundColor:
                                        mode === 'category'
                                          ? categoryColors[group.key as Category]
                                          : categoryColors[child.key as Category],
                                    }}
                                  />
                                </span>
                                <span className="tnum text-footnote font-medium text-ink-700">
                                  {formatCurrency(child.total_minor, currency ?? 'USD')}
                                </span>
                              </span>
                              </button>

                              <AnimatePresence>
                                {picking?.key === `${group.key}/${child.key}` && child.cell && (
                                  <CategoryPicker
                                    service={child.cell.service}
                                    descriptions={child.cell.descriptions}
                                    description={child.note || child.label}
                                    current={child.cell.category}
                                    anchor={picking.anchor}
                                    onClose={() => setPicking(null)}
                                  />
                                )}
                              </AnimatePresence>
                            </li>
                          ))}
                        </ul>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-between px-5 py-3.5 text-caption text-ink-500 md:px-6">
            <span>
              {groups.length}{' '}
              {groups.length === 1 ? noun : mode === 'category' ? 'categories' : 'services'}
            </span>
            <span className="tnum">
              Total <AnimatedCurrency value={total} currency={currency ?? 'USD'} />
            </span>
          </div>
          <div className="px-5 pb-3 md:px-6">
            <ConversionNote meta={conversion} />
          </div>
        </>
      )}
    </section>
  );
}
