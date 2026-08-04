import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInvoices } from '../api/hooks';
import { InvoiceDrawer } from '../components/InvoiceDrawer';
import { InvoiceTable } from '../components/InvoiceTable';
import { EmptyNote, ErrorNote, LoadingLines } from '../components/states';
import { useWorkspace } from '../state/workspace';

const PAGE_SIZE = 25;
const statuses = ['all', 'parsed', 'pending', 'failed'] as const;

/**
 * The full invoice list behind the dashboard's "View all". Not in the original
 * design, which only ever showed six rows with no way to reach the rest.
 */
export function Invoices() {
  const { currency } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [term, setTerm] = useState(params.get('q') ?? '');
  const [status, setStatus] = useState<string>('all');
  const [page, setPage] = useState(0);

  const query = params.get('q') ?? undefined;

  // a new search from the top bar lands here with ?q= already set
  useEffect(() => {
    setTerm(params.get('q') ?? '');
    setPage(0);
  }, [params]);

  const { data, isPending, error } = useInvoices({
    currency,
    q: query,
    status: status === 'all' ? undefined : status,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const rows = data?.invoices ?? [];
  const total = data?.total ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4 md:px-6">
        <div>
          <h2 className="text-sm font-medium text-ink-900">All invoices</h2>
          <p className="tnum mt-1 text-xs text-ink-500">
            {total} invoice{total === 1 ? '' : 's'}
            {query ? ` matching "${query}"` : ''}
          </p>
        </div>

        <form
          className="relative ml-auto"
          onSubmit={(event) => {
            event.preventDefault();
            setParams(term.trim() ? { q: term.trim() } : {});
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
              className="h-9 w-56 rounded-lg border border-line bg-canvas pl-9 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-line-strong focus:bg-surface"
            />
          </label>
        </form>

        <label className="flex items-center gap-2">
          <span className="sr-only">Status</span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(0);
            }}
            className="h-9 rounded-lg border border-line bg-surface px-2.5 text-[13px] text-ink-900 hover:bg-canvas"
          >
            {statuses.map((value) => (
              <option key={value} value={value}>
                {value === 'all' ? 'All statuses' : value}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="px-5 pb-5 md:px-6">
          <ErrorNote message={error.message} />
        </div>
      )}
      {!error && (isPending || !currency) && (
        <div className="px-5 pb-5 md:px-6">
          <LoadingLines rows={8} />
        </div>
      )}
      {!error && !isPending && rows.length === 0 && (
        <div className="px-5 pb-5 md:px-6">
          <EmptyNote message="No invoices match these filters." />
        </div>
      )}
      {!error && rows.length > 0 && <InvoiceTable rows={rows} onSelect={setSelected} />}

      {!error && total > PAGE_SIZE && (
        <div className="flex items-center justify-between px-5 py-3 text-xs text-ink-500 md:px-6">
          <span className="tnum">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              aria-label="Previous page"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-500 transition-colors hover:bg-canvas hover:text-ink-900 disabled:opacity-40"
            >
              <ChevronLeftIcon className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              disabled={page >= lastPage}
              onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
              aria-label="Next page"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-ink-500 transition-colors hover:bg-canvas hover:text-ink-900 disabled:opacity-40"
            >
              <ChevronRightIcon className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </span>
        </div>
      )}

      <InvoiceDrawer invoiceId={selected} onClose={() => setSelected(null)} />
    </section>
  );
}
