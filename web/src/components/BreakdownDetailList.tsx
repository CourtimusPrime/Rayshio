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
  /** The colour rail or vendor logo that identifies the row. */
  mark: ReactNode;
  total_minor: number;
  note?: string;
}

interface Group extends Row {
  children: Row[];
}

function categoryMark(category: Category) {
  return (
    <span
      className="h-8 w-1.5 shrink-0 rounded-full"
      style={{ backgroundColor: categoryColors[category] }}
      aria-hidden="true"
    />
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
          })),
        }));

  const total = groups.reduce((sum, item) => sum + item.total_minor, 0);
  const [open, setOpen] = useState<string[]>([]);

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
                  <button
                    type="button"
                    onClick={() => toggle(group.key)}
                    aria-expanded={isOpen}
                    className="press-row flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-canvas md:px-6"
                  >
                    {group.mark}
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
                        <AnimatedCurrency value={group.total_minor} currency={currency ?? 'USD'} />
                      </span>
                      <ChevronDownIcon
                        className={`h-4 w-4 text-ink-400 transition-transform ${
                          isOpen ? 'rotate-180' : ''
                        }`}
                        strokeWidth={1.75}
                      />
                    </span>
                  </button>

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
                            <li key={child.key} className="flex items-center gap-3 py-2.5">
                              {child.mark}
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
