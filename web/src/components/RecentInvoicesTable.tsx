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

  return (
    <section
      aria-labelledby="recent-invoices-heading"
      className="overflow-hidden rounded-xl border border-line bg-white shadow-card"
    >
      <div className="flex items-center justify-between gap-4 px-5 py-4 md:px-6">
        <div>
          <h2 id="recent-invoices-heading" className="text-sm font-medium text-ink-900">
            {title}
          </h2>
          <p className="mt-1 text-xs text-ink-500">Pulled from Gmail, parsed automatically</p>
        </div>
        <Link
          to="/invoices"
          className="hidden items-center gap-1.5 text-[13px] font-medium text-accent hover:text-accent-strong sm:inline-flex"
        >
          View all
          <ArrowRightIcon className="h-3.5 w-3.5" strokeWidth={2} />
        </Link>
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
      {!error && !isPending && rows.length === 0 && (
        <div className="px-5 pb-5 md:px-6">
          <EmptyNote message="No invoices ingested yet." />
        </div>
      )}
      {!error && rows.length > 0 && <InvoiceTable rows={rows} onSelect={setSelected} />}

      {!error && rows.length > 0 && (
        <div className="flex items-center justify-between px-5 py-3 text-xs text-ink-500 md:px-6">
          <span>
            Showing {rows.length} of {data?.total ?? rows.length} invoices
          </span>
          <span>
            {meta?.last_ingest_at
              ? `Last sync ${formatRelativeTime(meta.last_ingest_at)}`
              : 'Never synced'}
          </span>
        </div>
      )}

      <InvoiceDrawer invoiceId={selected} onClose={() => setSelected(null)} />
    </section>
  );
}
