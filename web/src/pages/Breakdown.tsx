import { motion } from 'framer-motion';
import { useState } from 'react';
import { BreakdownDetailList, type BreakdownMode } from '../components/BreakdownDetailList';
import { CategoryBreakdownChart } from '../components/CategoryBreakdownChart';
import { useMotionPrefs } from '../motion/useMotionPrefs';

const TABS: { mode: BreakdownMode; label: string; hint: string }[] = [
  { mode: 'category', label: 'Category', hint: 'What the spend is for' },
  { mode: 'service', label: 'Service', hint: 'Who is charging for it' },
];

/**
 * The same month's spend, from either end.
 *
 * Category-first answers "what are we buying, and from whom"; service-first
 * answers "who are we paying, and for what". Both are built from the same line
 * items and total identically — the tabs change the nesting, not the figures.
 */
export function Breakdown() {
  const [mode, setMode] = useState<BreakdownMode>('category');
  const prefs = useMotionPrefs();

  return (
    <div className="space-y-6">
      {/*
        A tablist, not two buttons: this switches between two views of one
        thing, so arrow-key semantics and the selected state have to be real to
        a screen reader rather than implied by styling.
      */}
      <div
        role="tablist"
        aria-label="Breakdown dimension"
        className="inline-flex gap-1 rounded-xl border border-line bg-surface p-1 shadow-card"
      >
        {TABS.map((tab) => {
          const selected = tab.mode === mode;
          return (
            <button
              key={tab.mode}
              type="button"
              role="tab"
              aria-selected={selected}
              title={tab.hint}
              onClick={() => setMode(tab.mode)}
              className={`press tap relative rounded-lg px-3.5 py-1.5 text-footnote font-medium transition-colors ${
                selected ? 'text-accent-strong' : 'text-ink-500 hover:text-ink-900'
              }`}
            >
              {/* Same shared-layout trick as the sidebar rail, so the two
                  selected states in the app move the same way. */}
              {selected && (
                <motion.span
                  {...(prefs.reduced ? {} : { layoutId: 'breakdown-tab' })}
                  className="absolute inset-0 rounded-lg bg-accent-soft"
                  transition={prefs.spring('quick')}
                />
              )}
              <span className="relative">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Keyed on mode so the accordion's open rows reset: a category key left
          open means nothing once the rows are services. */}
      <BreakdownDetailList key={mode} mode={mode} />

      {/*
        Category-only. The chart plots categories, so it belongs to the tab that
        is about them — carrying it onto the Service tab would put a category
        chart under a heading that just said "by service" and quietly undo the
        distinction the tabs exist to make.
      */}
      {mode === 'category' && <CategoryBreakdownChart />}
    </div>
  );
}
