import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { apiGet, apiUploadPdf } from '../api/client';
import type { Outcome, OutcomesResponse } from '../types';

/**
 * One upload batch, and what became of every file in it.
 *
 * Lives above the router rather than inside `UploadInvoices` because the
 * component that starts an upload is not the one that should own its lifetime.
 * Cataloguing thirteen files outlasts a user's interest in the invoices page,
 * and unmounting that page used to take the progress with it — the upload kept
 * running on the server with nothing left to report it.
 */

/** How often to ask what happened, and how long to keep asking. */
const POLL_INTERVAL_MS = 2500;
const POLL_WINDOW_MS = 3 * 60 * 1000;

export interface UploadFile {
  name: string;
  /** Set once the server accepted the file. Absent when the upload itself failed. */
  invoiceId?: number;
  outcome: Outcome;
  /** Why it failed, when the failure has something worth showing. */
  error?: string;
}

export interface UploadBatch {
  /**
   * Increments per batch. Used as the toast's React key, so starting a second
   * batch remounts it rather than animating counts from the previous one.
   */
  id: number;
  files: UploadFile[];
  /** True until the last POST has returned. */
  uploading: boolean;
  /**
   * True when polling gave up with files still parsing. Not a failure — the
   * worker is still going — but it ends the batch as far as the UI is
   * concerned, so the toast can retire instead of spinning forever.
   */
  pollExhausted: boolean;
}

interface UploadsValue {
  batch: UploadBatch | null;
  startUpload: (files: File[]) => void;
  dismiss: () => void;
  /** Nothing left to wait for — the toast may start its dismiss timer. */
  settled: boolean;
}

const UploadsContext = createContext<UploadsValue | null>(null);

function isPending(file: UploadFile): boolean {
  return file.outcome === 'pending';
}

export function UploadsProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [batch, setBatch] = useState<UploadBatch | null>(null);
  const nextId = useRef(1);

  /*
   * The batch is read inside an interval that must not be torn down and rebuilt
   * on every tick, so the timer reads it through a ref while React renders from
   * the state. Depending the effect on `batch` directly would restart the clock
   * each time a single file resolved, and with enough files the interval would
   * never actually fire.
   */
  const batchRef = useRef<UploadBatch | null>(null);
  batchRef.current = batch;

  const startUpload = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;

      const id = nextId.current++;
      setBatch({
        id,
        files: files.map((f) => ({ name: f.name, outcome: 'pending' as const })),
        uploading: true,
        pollExhausted: false,
      });

      void (async () => {
        /*
         * Sequential, not parallel. A dropped folder can be forty PDFs, and
         * forty concurrent uploads would compete with the dashboard's own
         * queries for connections while making any single failure hard to
         * attribute.
         */
        for (const [index, file] of files.entries()) {
          try {
            const res = await apiUploadPdf(file);
            setBatch((prev) =>
              prev?.id !== id
                ? prev
                : {
                    ...prev,
                    files: prev.files.map((f, i) =>
                      i === index
                        ? {
                            ...f,
                            invoiceId: res.invoice_id,
                            // A duplicate is already terminal: nothing was
                            // written, so there is no worker outcome coming.
                            outcome: res.duplicate ? 'duplicate' : 'pending',
                          }
                        : f,
                    ),
                  },
            );
          } catch (err) {
            setBatch((prev) =>
              prev?.id !== id
                ? prev
                : {
                    ...prev,
                    files: prev.files.map((f, i) =>
                      i === index
                        ? { ...f, outcome: 'error' as const, error: (err as Error).message }
                        : f,
                    ),
                  },
            );
          }
        }

        setBatch((prev) => (prev?.id !== id ? prev : { ...prev, uploading: false }));
        void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      })();
    },
    [queryClient],
  );

  const dismiss = useCallback(() => setBatch(null), []);

  /*
   * Extraction finishes on the worker with nothing to push the result here, so
   * outcomes are polled. Bounded, because a tab left open overnight should not
   * poll until the heat death of the universe — and stopped early the moment
   * nothing is pending, which is the usual way it ends.
   */
  useEffect(() => {
    if (!batch || batch.uploading || batch.pollExhausted) return;
    if (!batch.files.some(isPending)) return;

    const id = batch.id;
    const deadline = Date.now() + POLL_WINDOW_MS;

    const timer = setInterval(() => {
      const current = batchRef.current;
      if (current?.id !== id) return;

      const waiting = current.files.filter((f) => isPending(f) && f.invoiceId !== undefined);
      if (waiting.length === 0) return;

      if (Date.now() > deadline) {
        setBatch((prev) => (prev?.id !== id ? prev : { ...prev, pollExhausted: true }));
        return;
      }

      const ids = waiting.map((f) => f.invoiceId as number);
      void apiGet<OutcomesResponse>('/invoices/outcomes', { ids: ids.join(',') })
        .then((res) => {
          const byId = new Map(res.outcomes.map((o) => [o.invoice_id, o]));
          setBatch((prev) =>
            prev?.id !== id
              ? prev
              : {
                  ...prev,
                  files: prev.files.map((f) => {
                    /*
                     * Only ever resolve a file that is still waiting.
                     *
                     * A duplicate carries the invoice id of the row the org
                     * already had, so two files in one batch can point at the
                     * same invoice — upload a PDF and its byte-identical twin
                     * and both hold that id. Without this guard the poll about
                     * the original ("added") overwrote the twin's already-final
                     * "duplicate", and a batch that correctly wrote one row
                     * reported two invoices added.
                     */
                    if (f.outcome !== 'pending') return f;
                    const found = f.invoiceId === undefined ? undefined : byId.get(f.invoiceId);
                    if (!found || found.outcome === 'pending') return f;
                    return {
                      ...f,
                      outcome: found.outcome,
                      ...(found.failure_reason ? { error: found.failure_reason } : {}),
                    };
                  }),
                },
          );
          // rows land in the table behind the toast as they finish
          void queryClient.invalidateQueries({ queryKey: ['invoices'] });
          void queryClient.invalidateQueries({ queryKey: ['summary'] });
        })
        .catch(() => {
          // a failed poll is not a failed upload — try again on the next tick
        });
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
    // `batch.files` deliberately absent: the interval reads them through the
    // ref, and depending on them here would restart the clock on every update.
  }, [batch?.id, batch?.uploading, batch?.pollExhausted, batch, queryClient]);

  const settled = Boolean(
    batch && !batch.uploading && (batch.pollExhausted || !batch.files.some(isPending)),
  );

  const value = useMemo<UploadsValue>(
    () => ({ batch, startUpload, dismiss, settled }),
    [batch, startUpload, dismiss, settled],
  );

  return <UploadsContext.Provider value={value}>{children}</UploadsContext.Provider>;
}

export function useUploads(): UploadsValue {
  const value = useContext(UploadsContext);
  if (!value) throw new Error('useUploads must be used inside UploadsProvider');
  return value;
}

/** Counts per terminal outcome, in the order the toast displays them. */
export function tallyOutcomes(files: UploadFile[]): Record<Outcome, number> {
  const tally: Record<Outcome, number> = {
    pending: 0,
    added: 0,
    duplicate: 0,
    not_invoice: 0,
    error: 0,
  };
  for (const file of files) tally[file.outcome] += 1;
  return tally;
}
