import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCalendar } from '../api/hooks';
import { useWorkspace } from '../state/workspace';
import { formatCurrency, monthKey } from '../utils/format';
import { AnimatedCurrency } from './AnimatedNumber';
import { ServiceLogo } from './ServiceLogo';
import { ErrorNote, LoadingBlock } from './states';

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface DayEntry {
  id: string;
  service: string;
  value: number;
  projected: boolean;
}

export function InvoiceCalendar() {
  const { currency } = useWorkspace();
  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(() => startOfMonth(today));

  const { data, isPending, error } = useCalendar(currency, monthKey(month));

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  const entriesByDay = useMemo(() => {
    const map = new Map<string, DayEntry[]>();
    const push = (date: string, entry: DayEntry) => {
      map.set(date, [...(map.get(date) ?? []), entry]);
    };
    for (const invoice of data?.received ?? []) {
      push(invoice.invoice_date, {
        id: invoice.id,
        service: invoice.service,
        value: invoice.value,
        projected: false,
      });
    }
    for (const invoice of data?.projected ?? []) {
      push(invoice.invoice_date, {
        id: invoice.id,
        service: invoice.service,
        value: invoice.value,
        projected: true,
      });
    }
    return map;
  }, [data]);

  const confirmedTotal = (data?.received ?? []).reduce((sum, entry) => sum + entry.value, 0);
  const projectedTotal = (data?.projected ?? []).reduce((sum, entry) => sum + entry.value, 0);

  return (
    <section
      aria-labelledby="calendar-heading"
      className="overflow-hidden rounded-xl border border-line bg-surface shadow-card"
    >
      <div className="flex flex-wrap items-center gap-4 px-5 py-4 md:px-6">
        <div>
          <h2 id="calendar-heading" className="text-body font-medium text-ink-900">
            {format(month, 'MMMM yyyy')}
          </h2>
          <p className="tnum mt-1 text-caption text-ink-500">
            <AnimatedCurrency value={confirmedTotal} currency={currency ?? 'USD'} /> received ·{' '}
            <AnimatedCurrency value={projectedTotal} currency={currency ?? 'USD'} /> anticipated
          </p>
        </div>

        <div className="ml-auto flex items-center gap-4">
          <ul className="hidden items-center gap-4 text-caption text-ink-500 sm:flex">
            <li className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden="true" />
              Received
            </li>
            <li className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full border border-dashed border-ink-400"
                aria-hidden="true"
              />
              Anticipated
            </li>
          </ul>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMonth(addMonths(month, -1))}
              aria-label="Previous month"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-500 transition-colors hover:bg-canvas hover:text-ink-900"
            >
              <ChevronLeftIcon className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => setMonth(addMonths(month, 1))}
              aria-label="Next month"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-500 transition-colors hover:bg-canvas hover:text-ink-900"
            >
              <ChevronRightIcon className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="px-5 pb-5 md:px-6">
          <ErrorNote message={error.message} />
        </div>
      )}
      {!error && isPending && (
        <div className="px-5 pb-5 md:px-6">
          <LoadingBlock className="h-64" />
        </div>
      )}

      {!error && !isPending && (
        <>
          <div className="grid grid-cols-7 border-y border-line bg-canvas">
            {weekdays.map((day) => (
              <div
                key={day}
                className="px-2 py-2 text-center text-micro font-medium uppercase tracking-wide text-ink-400"
              >
                <span className="hidden sm:inline">{day}</span>
                <span className="sm:hidden">{day[0]}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const entries = entriesByDay.get(key) ?? [];
              const outside = !isSameMonth(day, month);
              const isToday = isSameDay(day, today);

              return (
                <div
                  key={key}
                  className={`min-h-[92px] border-b border-r border-line p-2 last:border-r-0 [&:nth-child(7n)]:border-r-0 ${
                    outside ? 'bg-canvas/60' : 'bg-surface'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`tnum flex h-6 w-6 items-center justify-center rounded-full text-caption ${
                        isToday
                          ? 'bg-ink-900 font-medium text-canvas'
                          : outside
                            ? 'text-ink-400'
                            : 'text-ink-700'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                    {entries.length > 2 && (
                      <span className="tnum text-micro text-ink-400">{entries.length}</span>
                    )}
                  </div>

                  <ul className="mt-1.5 space-y-1">
                    {entries.slice(0, 2).map((entry) => (
                      <li
                        key={entry.id}
                        title={`${entry.service} · ${formatCurrency(
                          entry.value,
                          currency ?? 'USD',
                        )}${entry.projected ? ' (anticipated)' : ''}`}
                        className={`flex items-center gap-1.5 rounded-md px-1 py-0.5 ${
                          entry.projected
                            ? 'border border-dashed border-line-strong opacity-70'
                            : 'bg-canvas'
                        }`}
                      >
                        <ServiceLogo name={entry.service} />
                        <span className="tnum hidden min-w-0 truncate text-micro text-ink-700 lg:block">
                          {formatCurrency(entry.value, currency ?? 'USD', true)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <p className="px-5 py-3 text-caption text-ink-400 md:px-6">
            Anticipated entries are projected from each vendor's observed monthly billing cadence.
            Vendors without a consistent cadence are not projected.
          </p>
        </>
      )}
    </section>
  );
}
