import {
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LogOutIcon,
  SearchIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogout } from '../api/hooks';
import { useWorkspace } from '../state/workspace';
import { longMonthLabel } from '../utils/format';

export function TopBar({ title }: { title: string }) {
  const { meta, currency, setCurrency, currencies, month, setMonth, months } = useWorkspace();
  const [term, setTerm] = useState('');
  const navigate = useNavigate();
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
    <header className="flex flex-wrap items-center gap-4 border-b border-line bg-white/90 px-5 py-4 backdrop-blur md:px-8">
      <div className="min-w-0">
        <h1 className="truncate text-[17px] font-semibold tracking-tight text-ink-900">{title}</h1>
        <p className="mt-0.5 text-xs text-ink-500">{meta?.org.name ?? '—'} · workspace</p>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <form
          className="relative hidden lg:block"
          onSubmit={(event) => {
            event.preventDefault();
            navigate(term.trim() ? `/invoices?q=${encodeURIComponent(term.trim())}` : '/invoices');
          }}
        >
          <label>
            <span className="sr-only">Search invoices</span>
            <SearchIcon
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
              strokeWidth={1.75}
            />
            <input
              type="search"
              placeholder="Search invoices"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              className="h-9 w-56 rounded-lg border border-line bg-canvas pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-line-strong focus:bg-white"
            />
          </label>
        </form>

        {months.length > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => previousMonth && setMonth(previousMonth)}
              disabled={!previousMonth}
              aria-label="Previous month"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink-500 transition-colors hover:bg-canvas hover:text-ink-900 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronLeftIcon className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <span
              aria-live="polite"
              className="min-w-[8.5rem] text-center text-[13px] font-medium text-ink-900"
            >
              {longMonthLabel(month)}
            </span>
            <button
              type="button"
              onClick={() => nextMonth && setMonth(nextMonth)}
              disabled={!nextMonth}
              aria-label="Next month"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink-500 transition-colors hover:bg-canvas hover:text-ink-900 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronRightIcon className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        )}

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
              className="h-9 rounded-lg border border-line bg-white px-2.5 text-[13px] font-medium text-ink-900 hover:bg-canvas"
            >
              {currencies.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex items-center gap-2.5 rounded-lg border border-line bg-white px-2.5 py-1.5 text-left">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-md bg-canvas text-[11px] font-semibold text-ink-700"
            aria-hidden="true"
          >
            {meta?.account?.provider === 'google' ? 'G' : '@'}
          </span>
          <span className="hidden min-w-0 sm:block">
            <span className="flex items-center gap-1 text-[13px] font-medium leading-tight text-ink-900">
              <span className="truncate">{accountEmail ?? 'No account connected'}</span>
              {connected && (
                <CheckCircle2Icon className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={2} />
              )}
            </span>
            <span className="text-[11px] leading-tight text-ink-500">
              {connected ? 'Gmail connected' : (meta?.account?.status ?? 'Run pnpm cli auth')}
            </span>
          </span>
          <button
            type="button"
            onClick={() => logout.mutate()}
            aria-label="Sign out"
            className="rounded-md p-1 text-ink-400 transition-colors hover:bg-canvas hover:text-ink-900"
          >
            <LogOutIcon className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </header>
  );
}
