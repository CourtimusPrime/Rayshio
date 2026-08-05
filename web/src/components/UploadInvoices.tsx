import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangleIcon, CheckIcon, Loader2Icon, UploadIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { apiUploadPdf } from '../api/client';

/**
 * Upload invoice PDFs the mailbox never received — a vendor that bills through
 * a portal, or a bill forwarded on paper.
 *
 * Files upload one request each, sequentially. Sequentially because a dropped
 * folder can be forty PDFs, and forty parallel uploads would compete with the
 * dashboard's own queries for connections while making the failure of any one
 * of them hard to attribute.
 *
 * Parsing happens on the worker, so a successful upload means "queued", not
 * "parsed". That is the honest word to show, and the list below refreshes on a
 * timer so rows fill in as extraction finishes.
 */

type FileState = 'uploading' | 'queued' | 'failed';

interface Upload {
  name: string;
  state: FileState;
  error?: string;
}

/** How long to keep refreshing after the last upload, and how often. */
const POLL_INTERVAL_MS = 5000;
const POLL_WINDOW_MS = 3 * 60 * 1000;

export function UploadInvoices({ buttonClassName = '' }: { buttonClassName?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [busy, setBusy] = useState(false);
  const [pollUntil, setPollUntil] = useState(0);

  /*
   * Extraction finishes on the worker with nothing to push the result here, so
   * the table is refreshed on a timer instead — bounded, because a tab left
   * open overnight should not poll until the heat death of the universe.
   */
  useEffect(() => {
    if (pollUntil === 0) return;
    const timer = setInterval(() => {
      if (Date.now() > pollUntil) {
        setPollUntil(0);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void queryClient.invalidateQueries({ queryKey: ['summary'] });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [pollUntil, queryClient]);

  async function upload(files: File[]) {
    setBusy(true);
    setUploads(files.map((f) => ({ name: f.name, state: 'uploading' as const })));

    for (const [index, file] of files.entries()) {
      try {
        await apiUploadPdf<{ invoice_id: number }>(file);
        setUploads((prev) =>
          prev.map((u, i) => (i === index ? { ...u, state: 'queued' as const } : u)),
        );
      } catch (err) {
        setUploads((prev) =>
          prev.map((u, i) =>
            i === index
              ? { ...u, state: 'failed' as const, error: (err as Error).message }
              : u,
          ),
        );
      }
    }

    setBusy(false);
    void queryClient.invalidateQueries({ queryKey: ['invoices'] });
    setPollUntil(Date.now() + POLL_WINDOW_MS);
  }

  const queued = uploads.filter((u) => u.state === 'queued').length;
  const failed = uploads.filter((u) => u.state === 'failed');

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="sr-only"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          // reset, or picking the same file twice in a row fires no change event
          event.target.value = '';
          if (files.length > 0) void upload(files);
        }}
      />

      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className={`press flex h-9 shrink-0 items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-footnote font-medium text-ink-900 transition-colors hover:bg-canvas disabled:opacity-60 ${buttonClassName}`}
      >
        {busy ? (
          <Loader2Icon className="h-4 w-4 animate-spin text-ink-400" strokeWidth={1.75} />
        ) : (
          <UploadIcon className="h-4 w-4 text-ink-400" strokeWidth={1.75} />
        )}
        {busy ? 'Uploading…' : 'Upload invoices'}
      </button>

      {uploads.length > 0 && (
        <div
          role="status"
          className="w-full rounded-lg border border-line bg-canvas px-3.5 py-3 text-footnote"
        >
          <p className="text-ink-700">
            {busy
              ? `Uploading ${uploads.length} file${uploads.length === 1 ? '' : 's'}…`
              : `${queued} queued for parsing${failed.length > 0 ? `, ${failed.length} failed` : ''}`}
          </p>

          {!busy && queued > 0 && (
            <p className="mt-1 text-caption text-ink-500">
              Parsing runs in the background; rows appear as each invoice is read. This list
              refreshes on its own.
            </p>
          )}

          {failed.length > 0 && (
            <ul className="mt-2 space-y-1">
              {failed.map((u) => (
                <li key={u.name} className="flex items-start gap-2 text-danger-text">
                  <AlertTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                  <span className="min-w-0">
                    <span className="font-medium">{u.name}</span> — {u.error}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {!busy && queued > 0 && failed.length === 0 && (
            <p className="mt-1.5 flex items-center gap-1.5 text-caption text-ink-500">
              <CheckIcon className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
              All files accepted.
            </p>
          )}
        </div>
      )}
    </>
  );
}
