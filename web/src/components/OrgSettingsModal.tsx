import { AnimatePresence, motion } from 'framer-motion';
import { XIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSetBudget, useSetOrgSettings } from '../api/hooks';
import { useBackgroundInert } from '../hooks/useBackgroundInert';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useScrollLock } from '../hooks/useScrollLock';
import { useMotionPrefs } from '../motion/useMotionPrefs';
import { useWorkspace } from '../state/workspace';
import type { DepartmentMode } from '../types';
import { ErrorNote } from './states';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Org-level configuration, per `SPEC.md`'s Settings surface.
 *
 * A modal rather than a tab because these are four settings, not a page, and a
 * seventh sidebar entry for them would cost more than it returns. The spec's
 * fuller Settings tab — the service category list — can take this over when it
 * exists; the API it calls is already a partial update, so nothing here has to
 * change to grow.
 *
 * Budget lives here rather than on the Dashboard. It was a card beside the
 * spend summary, which spent half a row on a number the summary already
 * reported; the setting itself is org configuration, which is what this is.
 * It writes through a second endpoint, so a save can touch two mutations.
 */
export function OrgSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { meta, currencies, currency: displayCurrency } = useWorkspace();
  const save = useSetOrgSettings();
  const saveBudget = useSetBudget();
  const panelRef = useRef<HTMLDivElement>(null);
  const { pick, spring } = useMotionPrefs();

  const [currency, setCurrency] = useState<string>('');
  const [fiscalMonth, setFiscalMonth] = useState<number>(1);
  const [mode, setMode] = useState<DepartmentMode>('single');
  const [budget, setBudget] = useState<string>('');

  /*
   * Re-seeded from the server every time the modal opens, not once on mount.
   * A modal that keeps stale form state across opens will happily write back a
   * value the user never looked at.
   */
  useEffect(() => {
    if (!open || !meta) return;
    setCurrency(meta.org.default_currency ?? '');
    setFiscalMonth(meta.fiscal_year_start_month);
    setMode(meta.org.department_mode);
    setBudget(meta.budget ? (meta.budget.monthly_budget_minor / 100).toFixed(2) : '');
    save.reset();
    saveBudget.reset();
  }, [open, meta, save.reset, saveBudget.reset]);

  useBackgroundInert(open);
  useScrollLock(open);
  useFocusTrap(open, panelRef);

  // Escape closes; the focus trap owns Tab, not this
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const host = typeof document === 'undefined' ? null : document.getElementById('overlay-root');
  if (!host) return null;

  /*
   * The budget is stored in the currency it was entered in, not the display
   * currency — `meta.budget` is deliberately unconverted, unlike the
   * `budget_minor` the summary endpoint returns. So the field edits the stored
   * figure and keeps its own currency; a workspace that budgets in EUR does not
   * silently start budgeting in GBP because someone changed the display target.
   */
  const budgetCurrency = meta?.budget?.currency ?? displayCurrency ?? '';
  const seededBudget = meta?.budget ? (meta.budget.monthly_budget_minor / 100).toFixed(2) : '';
  const budgetParsed = Number(budget);
  const budgetValid = budget.trim() === '' || (Number.isFinite(budgetParsed) && budgetParsed >= 0);
  const budgetChanged = budget.trim() !== seededBudget;

  const dirty =
    meta !== undefined &&
    (currency !== (meta.org.default_currency ?? '') ||
      fiscalMonth !== meta.fiscal_year_start_month ||
      mode !== meta.org.department_mode ||
      budgetChanged);

  const saving = save.isPending || saveBudget.isPending;

  /*
   * Two endpoints, so the close is gated on both settling rather than on
   * whichever returns first — closing early would hide a failure on the other.
   */
  async function submit() {
    if (!meta || !budgetValid) return;

    const orgPatch = {
      // '' clears it, restoring the fallback to the busiest billed currency
      ...(currency !== (meta.org.default_currency ?? '')
        ? { default_currency: currency === '' ? null : currency }
        : {}),
      ...(fiscalMonth !== meta.fiscal_year_start_month
        ? { fiscal_year_start_month: fiscalMonth }
        : {}),
      ...(mode !== meta.org.department_mode ? { department_mode: mode } : {}),
    };

    const pending: Promise<unknown>[] = [];
    if (Object.keys(orgPatch).length > 0) pending.push(save.mutateAsync(orgPatch));
    if (budgetChanged) {
      pending.push(
        saveBudget.mutateAsync(
          budget.trim() === ''
            ? { monthly_budget_minor: null, currency: null }
            : {
                monthly_budget_minor: Math.round(budgetParsed * 100),
                currency: budgetCurrency === '' ? null : budgetCurrency,
              },
        ),
      );
    }

    try {
      await Promise.all(pending);
      onClose();
    } catch {
      // both mutations surface their own error below; the modal stays open
    }
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-sheet flex items-center justify-center p-4">
          <motion.div
            /* `material-scrim`, not a flat black: it carries the theme-aware
               opacity (0.32 light, 0.55 dark) and the reduced-transparency,
               forced-contrast and no-backdrop-filter fallbacks that a literal
               bg-black/30 silently skips. The drawer already uses it. */
            className="material-scrim absolute inset-0"
            initial={pick({ opacity: 0 }, false)}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={spring('quick')}
            onClick={onClose}
            aria-hidden="true"
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="org-settings-title"
            /*
             * Capped and scrollable: five settings clear a short laptop
             * viewport, and an uncapped panel puts Save below the fold with
             * nothing to scroll — the page behind is scroll-locked.
             */
            className="relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-6 shadow-e4"
            initial={pick({ opacity: 0, y: 12 }, false)}
            animate={{ opacity: 1, y: 0 }}
            exit={pick({ opacity: 0, y: 8 }, { opacity: 0 })}
            transition={spring('surface')}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="org-settings-title" className="text-title3 font-semibold text-ink-900">
                  Workspace settings
                </h2>
                <p className="mt-1 text-caption text-ink-500">
                  {meta?.org.name ?? 'Workspace'}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close settings"
                className="press tap -mr-1 -mt-1 flex h-8 w-8 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-canvas hover:text-ink-900"
              >
                <XIcon className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>

            <div className="mt-6 space-y-5">
              <label className="block">
                <span className="text-footnote font-medium text-ink-900">Default currency</span>
                <p className="mt-0.5 text-caption text-ink-500">
                  What this workspace opens on. Every invoice is still shown whatever it was
                  billed in.
                </p>
                <select
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                  className="mt-2 h-10 w-full rounded-lg border border-line bg-canvas px-3 text-body text-ink-900 transition-colors hover:bg-surface focus:border-line-strong"
                >
                  <option value="">Busiest currency in the data</option>
                  {currencies.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-footnote font-medium text-ink-900">Monthly budget</span>
                <p id="budget-hint" className="mt-0.5 text-caption text-ink-500">
                  {budgetCurrency
                    ? `Held in ${budgetCurrency}, whatever the display currency is. Leave empty for no budget.`
                    : 'Leave empty for no budget.'}
                </p>
                <span className="relative mt-2 block">
                  {budgetCurrency && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-footnote font-medium text-ink-400"
                    >
                      {budgetCurrency}
                    </span>
                  )}
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={budget}
                    onChange={(event) => setBudget(event.target.value)}
                    placeholder="No budget"
                    aria-invalid={!budgetValid}
                    /*
                     * The hint is always described; the error joins it only when
                     * it exists. Without this the field announces as invalid and
                     * never says why — `aria-invalid` marks the state, it does
                     * not carry the message.
                     */
                    aria-describedby={
                      budgetValid ? 'budget-hint' : 'budget-hint budget-error'
                    }
                    className={`tnum h-10 w-full rounded-lg border bg-canvas pr-3 text-body text-ink-900 transition-colors placeholder:text-ink-400 hover:bg-surface focus:bg-surface ${
                      budgetValid ? 'border-line focus:border-line-strong' : 'border-danger-solid'
                    } ${budgetCurrency ? 'pl-14' : 'pl-3'}`}
                  />
                </span>
                {!budgetValid && (
                  <span
                    id="budget-error"
                    role="alert"
                    className="mt-1.5 block text-caption text-danger-text"
                  >
                    Enter an amount of zero or more, or leave it empty.
                  </span>
                )}
              </label>

              <label className="block">
                <span className="text-footnote font-medium text-ink-900">Fiscal year starts</span>
                <p className="mt-0.5 text-caption text-ink-500">
                  Fiscal years are named for the year they end in.
                </p>
                <select
                  value={fiscalMonth}
                  onChange={(event) => setFiscalMonth(Number(event.target.value))}
                  className="mt-2 h-10 w-full rounded-lg border border-line bg-canvas px-3 text-body text-ink-900 transition-colors hover:bg-surface focus:border-line-strong"
                >
                  {MONTHS.map((name, i) => (
                    <option key={name} value={i + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset>
                <legend className="text-footnote font-medium text-ink-900">Departments</legend>
                <p className="mt-0.5 text-caption text-ink-500">
                  Switching is a view decision — teams and their service assignments are kept
                  either way.
                </p>
                <div className="mt-2 space-y-2">
                  {(
                    [
                      ['single', 'Single department', 'The workspace is one budget unit.'],
                      [
                        'multi',
                        'Multi-department',
                        'Spend is attributable to teams. Teams tab and team filter appear.',
                      ],
                    ] as const
                  ).map(([value, label, hint]) => (
                    <label
                      key={value}
                      className={`press-row flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                        mode === value
                          ? 'border-accent bg-accent-soft'
                          : 'border-line hover:bg-canvas'
                      }`}
                    >
                      <input
                        type="radio"
                        name="department-mode"
                        value={value}
                        checked={mode === value}
                        onChange={() => setMode(value)}
                        className="mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="block text-body text-ink-900">{label}</span>
                        <span className="mt-0.5 block text-caption text-ink-500">{hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {mode === 'multi' && meta?.org.department_mode === 'single' && (
                <p className="rounded-lg bg-canvas px-3.5 py-3 text-caption text-ink-500 ring-1 ring-line">
                  Teams, service assignment and the Teams tab are not built yet — this records
                  the mode so nothing is lost when they land.
                </p>
              )}

              {save.error && <ErrorNote message={(save.error as Error).message} />}
              {saveBudget.error && <ErrorNote message={(saveBudget.error as Error).message} />}
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="press h-10 rounded-lg border border-line px-4 text-footnote font-medium text-ink-700 transition-colors hover:bg-canvas"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!dirty || !budgetValid || saving}
                className="press h-10 rounded-lg bg-accent px-4 text-footnote font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    host,
  );
}
