import { ChevronLeftIcon, ChevronRightIcon, LogOutIcon } from 'lucide-react';
import { useLogout } from '../api/hooks';
import { useWorkspace } from '../state/workspace';
import { longMonthLabel } from '../utils/format';

export function TopBar({
  title,
  scrolled = false,
  showMonthNav = true,
}: {
  title: string;
  scrolled?: boolean;
  /**
   * Whether the month stepper belongs on this page.
   *
   * False on Reports, which selects its own fiscal quarter or year. Two period
   * controls disagreeing in the same header is worse than none: the month in
   * the chrome would keep changing figures the page is not reporting on, and
   * there is no reading of the screen that makes both of them right.
   */
  showMonthNav?: boolean;
}) {
  const { meta, currency, setCurrency, currencies, month, setMonth, months } = useWorkspace();
  const logout = useLogout();

  const accountEmail = meta?.account?.email_address;
  const connected = meta?.account?.status === 'active';

  // `months` is newest-first and only contains months that have invoices, so
  // stepping through it skips empty stretches rather than making the user click
  // through them one at a time
  const index = months.findIndex((m) => m.month === month);
  const previousMonth = index >= 0 ? months[index + 1]?.month : months[0]?.month;
  const nextMonth = index > 0 ? months[index - 1]?.month : undefined;

  return (
    <header
      data-scrolled={scrolled ? 'true' : 'false'}
      className="material-chrome sticky top-0 z-chrome flex flex-wrap items-center gap-4 px-5 py-4 md:px-8"
    >
      {/*
        The visible page title is gone — the month navigation took this slot.
        It survives as the document's heading rather than being deleted: every
        page still needs one h1, and it is what a screen reader announces on
        arrival and what heading navigation jumps to.
      */}
      <h1 className="sr-only">{title}</h1>

      {/* The period being read, at the far left: it qualifies every figure on
          the page, so it belongs where the eye starts rather than in the
          right-hand cluster of controls. */}
      {showMonthNav && months.length > 1 && (
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => previousMonth && setMonth(previousMonth)}
            disabled={!previousMonth}
            aria-label="Previous month"
            className="press tap flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink-500 transition-colors hover:bg-canvas hover:text-ink-900 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronLeftIcon className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <span
            aria-live="polite"
            className="min-w-[7rem] text-center text-subhead font-semibold text-ink-900 sm:min-w-[8.5rem]"
          >
            {longMonthLabel(month)}
          </span>
          <button
            type="button"
            onClick={() => nextMonth && setMonth(nextMonth)}
            disabled={!nextMonth}
            aria-label="Next month"
            className="press tap flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink-500 transition-colors hover:bg-canvas hover:text-ink-900 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronRightIcon className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      )}

      {/* wraps as a group: currency + account exceed a phone width on one line */}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
        {/*
          Display currency: every invoice is shown whatever it was billed in,
          converted to this at the rate on its own date.
        */}
        {currencies.length > 1 && (
          <label className="flex items-center gap-2">
            <span className="sr-only">Display currency</span>
            <select
              value={currency ?? ''}
              onChange={(event) => setCurrency(event.target.value)}
              className="h-9 rounded-lg border border-line bg-surface px-2.5 text-footnote font-medium text-ink-900 transition-colors hover:bg-canvas"
            >
              {currencies.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`hidden h-1.5 w-1.5 shrink-0 rounded-full sm:block ${
              connected ? 'bg-accent' : 'bg-ink-400'
            }`}
          />
          <span className="hidden min-w-0 truncate text-footnote text-ink-700 sm:block">
            {accountEmail ?? 'No account connected'}
          </span>
          {/* the state was a visible subtitle; it stays readable to a
              screen reader rather than becoming colour-only */}
          <span className="sr-only">
            {connected ? 'Gmail connected' : (meta?.account?.status ?? 'Run pnpm cli auth')}
          </span>
          <button
            type="button"
            onClick={() => logout.mutate()}
            aria-label="Sign out"
            className="press tap rounded-md p-1 text-ink-400 transition-colors hover:bg-canvas hover:text-ink-900"
          >
            <LogOutIcon className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </header>
  );
}
