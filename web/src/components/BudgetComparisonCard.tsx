import { motion } from 'framer-motion';
import { AlertTriangleIcon, CheckIcon, PencilIcon, TrendingUpIcon } from 'lucide-react';
import { useState } from 'react';
import { useSetBudget, useSummary } from '../api/hooks';
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
    bar: 'bg-amber-500',
    chip: 'bg-amber-50 text-amber-700',
    icon: TrendingUpIcon,
  },
  over: {
    label: 'Over budget',
    bar: 'bg-rose-500',
    chip: 'bg-rose-50 text-rose-700',
    icon: AlertTriangleIcon,
  },
};

export function BudgetComparisonCard() {
  const { currency, month } = useWorkspace();
  const { data, isPending, error } = useSummary(currency, month);
  const setBudget = useSetBudget();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  if (error) {
    return (
      <section className="rounded-xl border border-line bg-white p-5 shadow-card md:p-6">
        <ErrorNote message={error.message} />
      </section>
    );
  }
  if (isPending || !data || !currency) {
    return (
      <section className="rounded-xl border border-line bg-white p-5 shadow-card md:p-6">
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
        <span className="text-[13px] text-ink-500">Monthly budget ({currency})</span>
        <input
          type="number"
          min={0}
          step="0.01"
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="none"
          className="tnum h-9 w-32 rounded-lg border border-line bg-canvas px-3 text-sm text-ink-900 focus:border-line-strong focus:bg-white"
        />
      </label>
      <button
        type="submit"
        className="rounded-lg bg-accent px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent-strong"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="rounded-lg border border-line px-3 py-2 text-[13px] font-medium text-ink-700 transition-colors hover:bg-canvas"
      >
        Cancel
      </button>
    </form>
  );

  if (!budgetApplies) {
    return (
      <section
        aria-labelledby="budget-heading"
        className="rounded-xl border border-line bg-white p-5 shadow-card md:p-6"
      >
        <h2 id="budget-heading" className="text-sm font-medium text-ink-500">
          Last month vs budget · {data.previous_month_label}
        </h2>
        <p className="tnum mt-2 text-[32px] font-semibold leading-none tracking-tight text-ink-900">
          <AnimatedCurrency value={lastMonth} currency={currency} />
        </p>
        <p className="mt-2 text-[13px] text-ink-500">No monthly budget set.</p>
        {editing ? (
          editor
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[13px] font-medium text-ink-700 transition-colors hover:bg-canvas"
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
      className="rounded-xl border border-line bg-white p-5 shadow-card md:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="budget-heading" className="text-sm font-medium text-ink-500">
            Last month vs budget · {data.previous_month_label}
          </h2>
          <p className="tnum mt-2 text-[32px] font-semibold leading-none tracking-tight text-ink-900">
            <AnimatedCurrency value={lastMonth} currency={currency} />
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${style.chip}`}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={2} />
          {style.label}
        </span>
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-x-1 text-[13px] text-ink-500">
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
          className="rounded-md p-1 text-ink-400 transition-colors hover:bg-canvas hover:text-ink-900"
        >
          <PencilIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      </p>

      {editing && editor}

      <div className="mt-6">
        <div
          className="relative h-2.5 w-full overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={budget}
          aria-valuenow={Math.round(lastMonth)}
          aria-label={`${data.previous_month_label} spend against budget`}
        >
          <motion.div
            className={`h-full rounded-full ${style.bar}`}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(ratio, 1) * 100}%` }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-ink-400">
          <span className="tnum">
            <AnimatedCount value={Math.round(ratio * 100)} suffix="% of budget used" />
          </span>
          <span className="tnum">{formatCurrency(budget, currency, true)}</span>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-ink-400">This month so far</dt>
          <dd className="tnum mt-1 text-sm font-medium text-ink-900">
            <AnimatedCurrency value={data.current_total_minor} currency={currency} />
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-ink-400">Budget pace</dt>
          <dd className="tnum mt-1 text-sm font-medium text-ink-900">
            <AnimatedCount value={Math.round((data.current_total_minor / budget) * 100)} suffix="%" />
          </dd>
        </div>
      </dl>
    </section>
  );
}
