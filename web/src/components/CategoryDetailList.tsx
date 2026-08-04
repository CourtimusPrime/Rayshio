import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDownIcon } from 'lucide-react';
import { useState } from 'react';
import { useCategories } from '../api/hooks';
import { categoryColors, categoryLabel } from '../categoryColors';
import { useWorkspace } from '../state/workspace';
import { formatCurrency } from '../utils/format';
import { ServiceLogo } from './ServiceLogo';
import { AnimatedCurrency } from './AnimatedNumber';
import { ConversionNote } from './ConversionNote';
import { EmptyNote, ErrorNote, LoadingLines } from './states';

export function CategoryDetailList() {
  const { currency, month } = useWorkspace();
  const { data, isPending, error } = useCategories(currency, month);
  const [open, setOpen] = useState<string[]>([]);

  const categories = data?.categories ?? [];
  const total = categories.reduce((sum, item) => sum + item.total_minor, 0);

  const toggle = (name: string) =>
    setOpen((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
    );

  // the largest category starts expanded, as in the design
  const first = categories[0]?.category;
  const isOpenFor = (name: string) => open.includes(name) || (open.length === 0 && name === first);

  return (
    <section
      aria-labelledby="category-detail-heading"
      className="overflow-hidden rounded-xl border border-line bg-surface shadow-card"
    >
      <div className="px-5 py-4 md:px-6">
        <h2 id="category-detail-heading" className="text-sm font-medium text-ink-900">
          Itemized costs by category
        </h2>
        <p className="mt-1 text-xs text-ink-500">
          Expand a category to see which services contribute to it
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
      {!error && !isPending && categories.length === 0 && (
        <div className="px-5 pb-5 md:px-6">
          <EmptyNote message="No categorized spend this month." />
        </div>
      )}

      {categories.length > 0 && (
        <>
          <ul className="border-t border-line">
            {categories.map((category) => {
              const isOpen = isOpenFor(category.category);
              const share = total === 0 ? 0 : Math.round((category.total_minor / total) * 100);

              return (
                <li key={category.category} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    onClick={() => toggle(category.category)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-canvas md:px-6"
                  >
                    <span
                      className="h-8 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: categoryColors[category.category] }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-ink-900">
                        {categoryLabel(category.category)}
                      </span>
                      <span className="tnum mt-0.5 block text-xs text-ink-500">
                        {category.services.length} services · {share}% of spend
                      </span>
                    </span>

                    <span className="ml-auto flex items-center gap-3">
                      <span className="tnum text-sm font-medium text-ink-900">
                        <AnimatedCurrency
                          value={category.total_minor}
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

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <ul className="border-t border-line bg-canvas px-5 py-2 md:px-6">
                          {category.services.map((contribution) => (
                            <li
                              key={contribution.service}
                              className="flex items-center gap-3 py-2.5"
                            >
                              <ServiceLogo name={contribution.service} />
                              <span className="min-w-0">
                                <span className="block text-[13px] text-ink-900">
                                  {contribution.service}
                                </span>
                                <span className="block text-xs text-ink-400">
                                  {contribution.note}
                                </span>
                              </span>
                              <span className="ml-auto flex items-center gap-3">
                                <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-line sm:block">
                                  <span
                                    className="block h-full rounded-full"
                                    style={{
                                      width: `${
                                        category.total_minor === 0
                                          ? 0
                                          : Math.max(
                                              0,
                                              (contribution.total_minor / category.total_minor) *
                                                100,
                                            )
                                      }%`,
                                      backgroundColor: categoryColors[category.category],
                                    }}
                                  />
                                </span>
                                <span className="tnum text-[13px] font-medium text-ink-700">
                                  {formatCurrency(contribution.total_minor, currency ?? 'USD')}
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

          <div className="flex items-center justify-between px-5 py-3.5 text-xs text-ink-500 md:px-6">
            <span>
              {categories.length} categor{categories.length === 1 ? 'y' : 'ies'}
            </span>
            <span className="tnum">
              Total <AnimatedCurrency value={total} currency={currency ?? 'USD'} />
            </span>
          </div>
          <div className="px-5 pb-3 md:px-6">
            <ConversionNote meta={data?.conversion} />
          </div>
        </>
      )}
    </section>
  );
}
