import { Loader2Icon } from 'lucide-react';
import { type FocusEvent, useRef } from 'react';
import { useUploads } from '../state/uploads';
import { UploadAnimated } from './icons/UploadAnimated';
import type { AnimatedIconHandle } from './icons/handle';

/**
 * Upload invoice PDFs the mailbox never received — a vendor that bills through
 * a portal, or a bill forwarded on paper.
 *
 * Just the control. Everything about what happens next — the requests, the
 * per-file outcomes, the polling — lives in `UploadsProvider`, and the progress
 * is reported by `UploadToast`. This component used to own all of it, which
 * meant navigating away from the invoices page silently discarded a running
 * batch's progress while the server carried on working.
 */
export function UploadInvoices({ buttonClassName = '' }: { buttonClassName?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const iconRef = useRef<AnimatedIconHandle>(null);
  const { startUpload, batch } = useUploads();
  const busy = batch?.uploading ?? false;

  /*
   * Hover plays the arrow; clicking must not. Clicking focuses the button and
   * opens the file dialog, and replaying the icon underneath a modal the user
   * is now looking at is motion nobody asked for. `:focus-visible` is false for
   * a pointer click and true for Tab, so keyboard users keep the feedback.
   */
  const playOnKeyboardFocus = (event: FocusEvent<HTMLButtonElement>) => {
    if (event.target.matches(':focus-visible')) iconRef.current?.play();
  };

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
          if (files.length > 0) startUpload(files);
        }}
      />

      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onMouseEnter={() => iconRef.current?.play()}
        onFocus={playOnKeyboardFocus}
        className={`press flex h-9 shrink-0 items-center gap-2 rounded-lg border border-line bg-surface px-3.5 text-footnote font-medium text-ink-900 transition-colors hover:bg-canvas disabled:opacity-60 ${buttonClassName}`}
      >
        {busy ? (
          <Loader2Icon className="h-4 w-4 animate-spin text-ink-400" strokeWidth={1.75} />
        ) : (
          <UploadAnimated ref={iconRef} className="h-4 w-4 text-ink-400" strokeWidth={1.75} />
        )}
        {busy ? 'Uploading…' : 'Upload invoices'}
      </button>
    </>
  );
}
