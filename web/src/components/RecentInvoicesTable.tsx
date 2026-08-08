import { ArrowRightIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useInvoices } from '../api/hooks';
import { useWorkspace } from '../state/workspace';
import { formatRelativeTime } from '../utils/format';
import { InvoiceDrawer } from './InvoiceDrawer';
import { InvoiceTable } from './InvoiceTable';
import { EmptyNote, ErrorNote, LoadingLines } from './states';

export function RecentInvoicesTable({ title = 'Recent invoices', limit = 6 }) {
  const { currency, meta } = useWorkspace();
  const { data, isPending, error } = useInvoices({ currency, limit });
  const [selected, setSelected] = useState<number | null>(null);

  const rows = data?.invoices ?? [];

  /*
   * The states and the table itself, shared by every variant below.
   *
   * An element rather than an inner component: a component declared inside the
   * render is a new type on every pass, so React would unmount and remount the
   * table — losing scroll position and the drawer's selection — each time this
   * re-renders.
   */
  const body = (
    <>
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
      {!error && !isPending && rows.length === 0 && (
        <div className="px-5 pb-5 md:px-6">
          <EmptyNote message="No invoices ingested yet." />
        </div>
      )}
      {!error && rows.length > 0 && (
        <InvoiceTable rows={rows} onSelect={setSelected} selectedId={selected} />
      )}
    </>
  );

  return (
    <section
      aria-labelledby="recent-invoices-heading"
      className="clip-card rounded-xl border border-line bg-surface shadow-card"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3.5 md:px-6">
        <h2 id="recent-invoices-heading" className="text-body font-medium text-ink-900">
          {title}
        </h2>
        <span className="text-caption text-ink-500">
          {meta?.last_ingest_at
            ? `synced ${formatRelativeTime(meta.last_ingest_at)}`
            : 'never synced'}
        </span>
        <Link
          to="/invoices"
          className="press ml-auto hidden items-center gap-1.5 text-footnote font-medium text-accent transition-colors hover:text-accent-strong sm:inline-flex"
        >
          View all
          <ArrowRightIcon className="h-3.5 w-3.5" strokeWidth={2} />
        </Link>
      </div>
      {body}
      <InvoiceDrawer invoiceId={selected} onClose={() => setSelected(null)} />
    </section>
  );
}
