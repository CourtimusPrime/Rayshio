import { AnimatePresence, motion } from 'framer-motion';
import { DownloadIcon, XIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useInvoice } from '../api/hooks';
import { categoryColors, categoryLabel } from '../categoryColors';
import { formatCurrency, formatDate } from '../utils/format';
import { ServiceLogo } from './ServiceLogo';
import { StatusBadge } from './StatusBadge';
import { ErrorNote, LoadingLines } from './states';

/**
 * Line items are where categorisation actually lives, so the detail view is the
 * only place the split within a single invoice is visible.
 */
export function InvoiceDrawer({
  invoiceId,
  onClose,
}: {
  invoiceId: number | null;
  onClose: () => void;
}) {
  const { data, isPending, error } = useInvoice(invoiceId);

  useEffect(() => {
    if (invoiceId === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [invoiceId, onClose]);

  return (
    <AnimatePresence>
      {invoiceId !== null && (
        <motion.div
          className="scrim fixed inset-0 z-40 flex justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Invoice detail"
            className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-surface shadow-pop"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-3 border-b border-line px-5 py-4 md:px-6">
              {data && <ServiceLogo name={data.service} size="md" />}
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold tracking-tight text-ink-900">
                  {data?.service ?? 'Invoice'}
                </p>
                <p className="truncate font-mono text-[11px] text-ink-400">
                  {data?.invoice_number ?? `#${invoiceId}`}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-canvas hover:text-ink-900"
              >
                <XIcon className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>

            <div className="flex-1 space-y-6 px-5 py-5 md:px-6">
              {error && <ErrorNote message={error.message} />}
              {isPending && !error && <LoadingLines rows={5} />}

              {data && (
                <>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="tnum text-[28px] font-semibold leading-none tracking-tight text-ink-900">
                        {formatCurrency(data.value, data.currency)}
                      </p>
                      <p className="mt-2 text-[13px] text-ink-500">
                        {data.invoice_date ? formatDate(data.invoice_date) : 'No invoice date'}
                        {data.period_start && data.period_end
                          ? ` · ${data.period_start} → ${data.period_end}`
                          : ''}
                      </p>
                    </div>
                    <StatusBadge status={data.status} />
                  </div>

                  {data.failure_reason && <ErrorNote message={data.failure_reason} />}

                  <div>
                    <h3 className="text-sm font-medium text-ink-900">Line items</h3>
                    <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
                      {data.line_items.map((item) => (
                        <li key={item.id} className="flex items-start gap-3 px-3.5 py-3">
                          <span
                            className="mt-0.5 h-8 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: categoryColors[item.category] }}
                            aria-hidden="true"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] text-ink-900">
                              {item.description}
                            </span>
                            <span className="block text-xs text-ink-400">
                              {categoryLabel(item.category)}
                              {item.quantity ? ` · ${item.quantity} ${item.unit ?? ''}` : ''}
                            </span>
                          </span>
                          <span className="tnum text-[13px] font-medium text-ink-700">
                            {formatCurrency(item.amount, data.currency)}
                          </span>
                        </li>
                      ))}
                      {data.line_items.length === 0 && (
                        <li className="px-3.5 py-3 text-[13px] text-ink-500">
                          No line items extracted.
                        </li>
                      )}
                    </ul>
                  </div>

                  <dl className="grid grid-cols-2 gap-4 border-t border-line pt-4 text-[13px]">
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-ink-400">
                        Email subject
                      </dt>
                      <dd className="mt-1 text-ink-700">{data.email_subject ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-ink-400">
                        Pipeline status
                      </dt>
                      <dd className="mt-1 font-mono text-ink-700">{data.raw_status}</dd>
                    </div>
                  </dl>

                  {data.has_pdf ? (
                    <a
                      href={`/api/invoices/${data.invoice_id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-[13px] font-medium text-ink-700 transition-colors hover:bg-canvas"
                    >
                      <DownloadIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Open PDF
                    </a>
                  ) : (
                    <p className="text-xs text-ink-400">
                      No PDF — this invoice was extracted from the email body.
                    </p>
                  )}
                </>
              )}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
