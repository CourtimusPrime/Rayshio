import { motion } from 'framer-motion';
import { AlertTriangleIcon, CheckIcon, PencilIcon, TrendingUpIcon } from 'lucide-react';
import { useState } from 'react';
import { useSetBudget, useSummary } from '../api/hooks';
import { useMotionPrefs } from '../motion/useMotionPrefs';
import { useWorkspace } from '../state/workspace';
import { formatCurrency } from '../utils/format';
import { AnimatedCount, AnimatedCurrency } from './AnimatedNumber';
import { ErrorNote, LoadingBlock } from './states';

type BudgetState = 'under' | 'near' | 'over';

const states: Record<
  BudgetState,
  { label: string; bar: string; chip: string; icon: typeof CheckIcon }
> = {
  under: {
    label: 'Under budget',
    bar: 'bg-accent',
    chip: 'bg-accent-soft text-accent-strong',
    icon: CheckIcon,
  },
  near: {
    label: 'Nearing budget',
    bar: 'bg-warn-solid',
    chip: 'bg-warn-soft text-warn-text',
    icon: TrendingUpIcon,
  },
  over: {
    label: 'Over budget',
    bar: 'bg-danger-solid',
    chip: 'bg-danger-soft text-danger-text',
    icon: AlertTriangleIcon,
  },
};

export function BudgetComparisonCard() {
  const { currency, month } = useWorkspace();
  const { data, isPending, error } = useSummary(currency, month);
  const setBudget = useSetBudget();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const prefs = useMotionPrefs();

  if (error) {
    return (
      <section className="rounded-xl border border-line bg-surface p-5 shadow-card md:p-6">
        <ErrorNote message={error.message} />
      </section>
    );
  }
  if (isPending || !data || !currency) {
    return (
      <section className="rounded-xl border border-line bg-surface p-5 shadow-card md:p-6">
        <LoadingBlock className="h-56" />
      </section>
    );
  }

  const lastMonth = data.previous_total_minor;
  // already converted into the display currency by the API, like every other
  // figure on the page
  const budget = data.budget_minor;
  const budgetApplies = budget !== null;

  const startEditing = () => {
    setDraft(budgetApplies && budget !== null ? (budget / 100).toFixed(2) : '');
    setEditing(true);
  };

  const save = () => {
    const parsed = Number(draft);
    if (draft.trim() === '') {
      setBudget.mutate({ monthly_budget_minor: null, currency: null });
    } else if (Number.isFinite(parsed) && parsed >= 0) {
      setBudget.mutate({ monthly_budget_minor: Math.round(parsed * 100), currency });
    }
    setEditing(false);
  };

  const editor = (
    <form
      className="mt-4 flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <label className="flex items-center gap-2">
        <span className="text-footnote text-ink-500">Monthly budget ({currency})</span>
        <input
          type="number"
          min={0}
          step="0.01"
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="none"
          className="tnum h-9 w-32 rounded-lg border border-line bg-canvas px-3 text-body text-ink-900 focus:border-line-strong focus:bg-surface"
        />
      </label>
      <button
        type="submit"
        className="press rounded-lg bg-accent px-3 py-2 text-footnote font-medium text-white transition-colors hover:bg-accent-strong"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="press rounded-lg border border-line px-3 py-2 text-footnote font-medium text-ink-700 transition-colors hover:bg-canvas"
      >
        Cancel
      </button>
    </form>
  );

  if (!budgetApplies) {
    return (
      <section
        aria-labelledby="budget-heading"
        className="rounded-xl border border-line bg-surface p-5 shadow-card md:p-6"
      >
        <h2 id="budget-heading" className="text-body font-medium text-ink-500">
          Last month vs budget · {data.previous_month_label}
        </h2>
        <p className="tnum mt-2 text-display font-semibold text-ink-900">
          <AnimatedCurrency value={lastMonth} currency={currency} />
        </p>
        <p className="mt-2 text-footnote text-ink-500">No monthly budget set.</p>
        {editing ? (
          editor
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className="press mt-4 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-footnote font-medium text-ink-700 transition-colors hover:bg-canvas"
          >
            <PencilIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
            Set a {currency} budget
          </button>
        )}
      </section>
    );
  }

  const ratio = lastMonth / budget;
  const state: BudgetState = ratio > 1 ? 'over' : ratio >= 0.9 ? 'near' : 'under';
  const style = states[state];
  const Icon = style.icon;
  const difference = Math.abs(budget - lastMonth);

  return (
    <section
      aria-labelledby="budget-heading"
      className="rounded-xl border border-line bg-surface p-5 shadow-card md:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="budget-heading" className="text-body font-medium text-ink-500">
            Last month vs budget · {data.previous_month_label}
          </h2>
          <p className="tnum mt-2 text-display font-semibold text-ink-900">
            <AnimatedCurrency value={lastMonth} currency={currency} />
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-medium ${style.chip}`}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={2} />
          {style.label}
        </span>
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-x-1 text-footnote text-ink-500">
        {state === 'over' ? 'Exceeded by ' : 'Remaining '}
        <span className="tnum text-ink-700">
          <AnimatedCurrency value={difference} currency={currency} />
        </span>{' '}
        of a{' '}
        <span className="tnum text-ink-700">
          <AnimatedCurrency value={budget} currency={currency} />
        </span>{' '}
        budget
        <button
          type="button"
          onClick={startEditing}
          aria-label="Edit monthly budget"
          className="press tap rounded-md p-1 text-ink-400 transition-colors hover:bg-canvas hover:text-ink-900"
        >
          <PencilIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </p>

      {editing && editor}

      <div className="mt-6">
        {/*
          `contain` rather than a scaleX transform. The fill is 10px tall with
          fully rounded caps, and scaleX squashes the right cap from a
          semicircle into a narrow ellipse — visibly wrong at this size. The
          usual objection to animating width is layout invalidation, and
          containment answers it directly: the track has a fixed height in a
          settled grid, so the animation cannot dirty an ancestor's layout.
        */}
        <div
          className="relative h-2.5 w-full overflow-hidden rounded-full bg-line [contain:layout_paint]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={budget}
          aria-valuenow={Math.round(lastMonth)}
          aria-label={`${data.previous_month_label} spend against budget`}
        >
          <motion.div
            className={`h-full rounded-full ${style.bar}`}
            // no sweep at all under reduced motion: initial={false} starts at
            // the animate value rather than travelling to it
            initial={prefs.pick({ width: 0 }, false)}
            animate={{ width: `${Math.min(ratio, 1) * 100}%` }}
            transition={prefs.spring('ui')}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-micro text-ink-400">
          <span className="tnum">
            <AnimatedCount value={Math.round(ratio * 100)} suffix="% of budget used" />
          </span>
          <span className="tnum">{formatCurrency(budget, currency, true)}</span>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4">
        <div>
          <dt className="text-micro uppercase tracking-wide text-ink-400">This month so far</dt>
          <dd className="tnum mt-1 text-body font-medium text-ink-900">
            <AnimatedCurrency value={data.current_total_minor} currency={currency} />
          </dd>
        </div>
        <div>
          <dt className="text-micro uppercase tracking-wide text-ink-400">Budget pace</dt>
          <dd className="tnum mt-1 text-body font-medium text-ink-900">
            <AnimatedCount
              value={Math.round((data.current_total_minor / budget) * 100)}
              suffix="%"
            />
          </dd>
        </div>
      </dl>
    </section>
  );
}
