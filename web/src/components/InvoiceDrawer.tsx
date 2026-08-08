import { AnimatePresence, motion } from 'framer-motion';
import { DownloadIcon, Loader2Icon, Trash2Icon, XIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDeleteInvoice, useInvoice } from '../api/hooks';
import { categoryColors, categoryLabel } from '../categoryColors';
import { useBackgroundInert } from '../hooks/useBackgroundInert';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useScrollLock } from '../hooks/useScrollLock';
import { useMotionPrefs } from '../motion/useMotionPrefs';
import { useSwipeDrawer } from '../motion/useSwipeDrawer';
import { formatCurrency, formatDate } from '../utils/format';
import { ServiceLogo } from './ServiceLogo';
import { StatusBadge } from './StatusBadge';
import { ErrorNote, LoadingLines } from './states';

/**
 * Line items are where categorisation actually lives, so the detail view is the
 * only place the split within a single invoice is visible.
 *
 * Portalled out of the page rather than rendered in place. Both call sites put
 * it inside a card that clips its overflow, so it only escaped visually via
 * `position: fixed`; and marking the page inert (below) is only safe if the
 * drawer is not inside the thing being made inert.
 */
export function InvoiceDrawer({
  invoiceId,
  onClose,
}: {
  invoiceId: number | null;
  onClose: () => void;
}) {
  const host = typeof document === 'undefined' ? null : document.getElementById('overlay-root');

  if (!host) {
    if (import.meta.env.DEV) {
      console.error('InvoiceDrawer: #overlay-root is missing from index.html');
    }
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {invoiceId !== null && <DrawerPanel invoiceId={invoiceId} onClose={onClose} />}
    </AnimatePresence>,
    host,
  );
}

/**
 * Delete, behind an in-place confirmation rather than `window.confirm`.
 *
 * A native dialog would be the shorter code, but it blocks the whole tab and
 * renders outside the drawer's focus trap — so the one destructive action in
 * the product would be the one place keyboard focus escapes the modal. The
 * two-step button keeps the decision inside the sheet, and the arming step is
 * what makes an accidental click cost nothing.
 *
 * The drawer closes on success, because the invoice it was describing no longer
 * exists — leaving it open would refetch a 404 and show an error where the
 * answer is simply "it worked".
 */
function DeleteInvoice({ invoiceId, onDeleted }: { invoiceId: number; onDeleted: () => void }) {
  const [armed, setArmed] = useState(false);
  const { mutate, isPending, error } = useDeleteInvoice();

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="press tap inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-footnote font-medium text-ink-500 transition-colors hover:border-danger-text/40 hover:bg-danger-soft hover:text-danger-text"
      >
        <Trash2Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
        Delete
      </button>
    );
  }

  return (
    <div className="w-full rounded-lg border border-danger-text/30 bg-danger-soft px-3.5 py-3">
      <p className="text-footnote text-ink-900">
        Delete this invoice and its PDF? Uploads have no other copy, so this cannot be undone.
      </p>
      {error && (
        <p role="alert" className="mt-1.5 text-caption text-danger-text">
          {error.message}
        </p>
      )}
      <div className="mt-2.5 flex items-center gap-2">
        {/* Bordered rather than a solid danger fill: --danger-solid is the same
            rose in both themes and only ever carries StatusBadge's 6px dot,
            where its contrast never has to hold up under text. --danger-text is
            the token tuned to be legible in both themes. */}
        <button
          type="button"
          disabled={isPending}
          onClick={() => mutate(invoiceId, { onSuccess: onDeleted })}
          className="press tap inline-flex items-center gap-1.5 rounded-lg border border-danger-text/40 bg-surface px-3 py-1.5 text-footnote font-medium text-danger-text transition-opacity hover:opacity-80 disabled:opacity-60"
        >
          {isPending && <Loader2Icon className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />}
          {isPending ? 'Deleting…' : 'Delete invoice'}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setArmed(false)}
          className="press tap rounded-lg px-3 py-1.5 text-footnote font-medium text-ink-700 transition-colors hover:bg-surface disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function DrawerPanel({ invoiceId, onClose }: { invoiceId: number; onClose: () => void }) {
  const { data, isPending, error } = useInvoice(invoiceId);
  const panelRef = useRef<HTMLElement>(null);
  const prefs = useMotionPrefs();

  const { x, opacity, scrimOpacity, dragging, isPresent, handlers } = useSwipeDrawer({
    panelRef,
    onDismiss: onClose,
    enabled: !prefs.reduced,
  });

  /*
   * Modality is released the moment a close is requested, not when the node
   * finally unmounts after its exit animation — otherwise the page stays inert
   * and focus sits nowhere for the length of the exit, long enough for a screen
   * reader to lose its place.
   *
   * Order matters. React runs effect cleanups in declaration order, and focus
   * cannot be moved into an inert subtree, so the page has to stop being inert
   * before the trap restores focus to whatever opened the drawer. Reversed, the
   * restore silently does nothing.
   */
  useBackgroundInert(isPresent);
  useScrollLock(isPresent);
  useFocusTrap(isPresent, panelRef);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-scrim flex justify-end">
      {/* a sibling of the panel, not its parent — which removes the
          stopPropagation that used to swallow clicks bubbling from inside */}
      {/* driven off the panel's own x, so it fades 1:1 with the finger rather
          than running on a second, unsynchronised clock */}
      <motion.div
        className="material-scrim absolute inset-0"
        style={{ opacity: prefs.reduced ? opacity : scrimOpacity }}
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-drawer-title"
        tabIndex={-1}
        data-dragging={dragging ? 'true' : 'false'}
        className="material-sheet relative flex h-full w-full max-w-lg flex-col overflow-y-auto [overscroll-behavior:contain] [touch-action:pan-y]"
        style={{ x, opacity }}
        {...handlers}
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4 md:px-6">
          {data && <ServiceLogo name={data.service} size="md" />}
          <div className="min-w-0 flex-1">
            {/* names the dialog after the actual invoice rather than a
                    generic "Invoice detail" */}
            <p id="invoice-drawer-title" className="text-subhead font-semibold text-ink-900">
              {data?.service ?? 'Invoice'}
            </p>
            <p className="truncate font-mono text-micro text-ink-400">
              {data?.invoice_number ?? `#${invoiceId}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="press tap rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-canvas hover:text-ink-900"
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
                  <p className="tnum text-title1 font-semibold text-ink-900">
                    {formatCurrency(data.value, data.currency)}
                  </p>
                  <p className="mt-2 text-footnote text-ink-500">
                    {data.invoice_date ? formatDate(data.invoice_date) : 'No invoice date'}
                    {data.period_start && data.period_end
                      ? ` · ${data.period_start} → ${data.period_end}`
                      : ''}
                  </p>
                </div>
                <StatusBadge status={data.status} />
              </div>

              {/* stored on the invoice, not something that just happened */}
              {data.failure_reason && <ErrorNote message={data.failure_reason} live="off" />}

              <div>
                <h3 className="text-body font-medium text-ink-900">Line items</h3>
                <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
                  {data.line_items.map((item) => (
                    <li key={item.id} className="flex items-start gap-3 px-3.5 py-3">
                      <span
                        className="mt-0.5 h-8 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: categoryColors[item.category] }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-footnote text-ink-900">{item.description}</span>
                        <span className="block text-caption text-ink-400">
                          {categoryLabel(item.category)}
                          {item.quantity ? ` · ${item.quantity} ${item.unit ?? ''}` : ''}
                        </span>
                      </span>
                      <span className="tnum text-footnote font-medium text-ink-700">
                        {formatCurrency(item.amount, data.currency)}
                      </span>
                    </li>
                  ))}
                  {data.line_items.length === 0 && (
                    <li className="px-3.5 py-3 text-footnote text-ink-500">
                      No line items extracted.
                    </li>
                  )}
                </ul>
              </div>

              <dl className="grid grid-cols-2 gap-4 border-t border-line pt-4 text-footnote">
                <div>
                  <dt className="text-micro uppercase tracking-wide text-ink-400">Email subject</dt>
                  <dd className="mt-1 text-ink-700">{data.email_subject ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-micro uppercase tracking-wide text-ink-400">
                    Pipeline status
                  </dt>
                  <dd className="mt-1 font-mono text-ink-700">{data.raw_status}</dd>
                </div>
              </dl>

              <div className="flex flex-wrap items-center gap-3">
                {data.has_pdf ? (
                  <a
                    href={`/api/invoices/${data.invoice_id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="press inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-footnote font-medium text-ink-700 transition-colors hover:bg-canvas"
                  >
                    <DownloadIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Open PDF
                  </a>
                ) : (
                  <p className="text-caption text-ink-400">
                    No PDF — this invoice was extracted from the email body.
                  </p>
                )}

                {/* Uploads only. A mailbox invoice would be re-ingested by the
                    next sync, so offering the action would be a lie. */}
                {data.is_upload && (
                  <DeleteInvoice invoiceId={data.invoice_id} onDeleted={onClose} />
                )}
              </div>
            </>
          )}
        </div>
      </motion.aside>
    </div>
  );
}
