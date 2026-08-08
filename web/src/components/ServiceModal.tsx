import { AnimatePresence, motion } from 'framer-motion';
import { ImageUpIcon, Loader2Icon, RotateCcwIcon, XIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRenameService, useService, useSetServiceLogo } from '../api/hooks';
import { useBackgroundInert } from '../hooks/useBackgroundInert';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useScrollLock } from '../hooks/useScrollLock';
import { useMotionPrefs } from '../motion/useMotionPrefs';
import { ServiceLogo } from './ServiceLogo';
import { ErrorNote, LoadingLines } from './states';

/**
 * Rename a vendor and replace its logo, for this workspace only.
 *
 * Both edits are per-org. `server.service` is a global table — one row per
 * sending address, shared by every tenant that receives mail from it — so the
 * writes behind this modal land in `client.service_override` and reads coalesce
 * over them. Renaming "Microsoft Ireland Operations Limited" here does not
 * touch what another company sees.
 *
 * The vendor is addressed by its *displayed* name throughout, because that is
 * what every component rendering a logo actually holds. That has one
 * consequence worth knowing: a successful rename changes the key, so the modal
 * re-targets itself rather than continuing to ask about a name that no longer
 * resolves.
 */
export function ServiceModal({
  service,
  onClose,
}: {
  service: string | null;
  onClose: () => void;
}) {
  const host = typeof document === 'undefined' ? null : document.getElementById('overlay-root');

  if (!host) {
    if (import.meta.env.DEV) {
      console.error('ServiceModal: #overlay-root is missing from index.html');
    }
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {service !== null && <ServicePanel key={service} service={service} onClose={onClose} />}
    </AnimatePresence>,
    host,
  );
}

/** Vector only: the whole point is a mark that stays sharp at every size. */
const ACCEPT = 'image/svg+xml,.svg';

function ServicePanel({ service, onClose }: { service: string; onClose: () => void }) {
  const { data, isPending, error } = useService(service);
  const rename = useRenameService();
  const setLogo = useSetServiceLogo();
  const panelRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const prefs = useMotionPrefs();

  const [name, setName] = useState('');
  const [current, setCurrent] = useState(service);

  /*
   * Re-seeded from the server rather than from the prop. The two differ for a
   * vendor whose name is only a default — the field should show what the org
   * will be editing, which is the resolved display name.
   */
  useEffect(() => {
    if (data) setName(data.display_name);
  }, [data]);

  useBackgroundInert(true);
  useScrollLock(true);
  useFocusTrap(true, panelRef);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const trimmed = name.trim();
  const dirty = data !== undefined && trimmed !== data.display_name && trimmed !== '';
  const busy = rename.isPending || setLogo.isPending;
  const failure = (rename.error ?? setLogo.error) as Error | undefined;

  function submitName() {
    if (!dirty) return;
    rename.mutate(
      { name: current, displayName: trimmed },
      // The name is the key this modal is addressed by, so a rename moves the
      // target. Without this the next edit would ask about a name the server
      // can no longer resolve and 404.
      { onSuccess: (updated) => setCurrent(updated.display_name) },
    );
  }

  function revertName() {
    if (!data?.is_renamed) return;
    rename.mutate(
      { name: current, displayName: null },
      { onSuccess: (updated) => setCurrent(updated.display_name) },
    );
  }

  return (
    <div className="fixed inset-0 z-sheet flex items-center justify-center p-4">
      <motion.div
        className="material-scrim absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="service-modal-title"
        tabIndex={-1}
        initial={prefs.pick({ opacity: 0, scale: 0.97, y: 8 }, { opacity: 0 })}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={prefs.pick({ opacity: 0, scale: 0.97, y: 8 }, { opacity: 0 })}
        transition={prefs.spring('ui')}
        className="material-sheet relative w-full max-w-md overflow-hidden rounded-xl border border-line shadow-e3"
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          {/* Not interactive here: this modal *is* the vendor's editor, so a
              logo that opened it again would be a button onto itself. */}
          <ServiceLogo name={current} size="md" interactive={false} />
          <div className="min-w-0 flex-1">
            <h2 id="service-modal-title" className="text-subhead font-semibold text-ink-900">
              {data?.display_name ?? current}
            </h2>
            <p className="mt-0.5 text-caption text-ink-500">
              {data?.is_renamed ? `Renamed from ${data.canonical_name}` : 'Vendor'}
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

        <div className="space-y-5 px-5 py-5">
          {error && <ErrorNote message={error.message} />}
          {isPending && !error && <LoadingLines rows={3} />}
          {failure && <ErrorNote message={failure.message} />}

          {data && (
            <>
              <div>
                <label htmlFor="service-name" className="block text-footnote font-medium text-ink-900">
                  Name
                </label>
                <p className="mt-1 text-caption text-ink-500">
                  Only your workspace sees this. It does not change the vendor for anyone else.
                </p>
                <form
                  className="mt-2 flex items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitName();
                  }}
                >
                  <input
                    id="service-name"
                    value={name}
                    disabled={busy}
                    onChange={(event) => setName(event.target.value)}
                    className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 text-body text-ink-900 focus:border-line-strong focus:bg-surface disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={!dirty || busy}
                    className="press tap inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-footnote font-medium text-ink-900 transition-colors hover:bg-canvas disabled:opacity-50"
                  >
                    {rename.isPending && (
                      <Loader2Icon className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
                    )}
                    Save
                  </button>
                </form>
                {data.is_renamed && (
                  <button
                    type="button"
                    onClick={revertName}
                    disabled={busy}
                    className="press mt-2 inline-flex items-center gap-1.5 text-caption text-ink-500 transition-colors hover:text-ink-900 disabled:opacity-60"
                  >
                    <RotateCcwIcon className="h-3 w-3" strokeWidth={1.75} />
                    Use the discovered name, {data.canonical_name}
                  </button>
                )}
              </div>

              <div className="border-t border-line pt-5">
                <p className="text-footnote font-medium text-ink-900">Logo</p>
                <p className="mt-1 text-caption text-ink-500">
                  An SVG, up to 64kb. Replaces the icon we found for this vendor.
                </p>

                <input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPT}
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    // reset, or picking the same file twice fires no change event
                    event.target.value = '';
                    if (file) setLogo.mutate({ name: current, svg: file });
                  }}
                />

                <div className="mt-3 flex items-center gap-3">
                  <ServiceLogo name={current} size="md" interactive={false} />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                    className="press tap inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-footnote font-medium text-ink-900 transition-colors hover:bg-canvas disabled:opacity-60"
                  >
                    {setLogo.isPending ? (
                      <Loader2Icon className="h-4 w-4 animate-spin text-ink-400" strokeWidth={1.75} />
                    ) : (
                      <ImageUpIcon className="h-4 w-4 text-ink-400" strokeWidth={1.75} />
                    )}
                    {data.has_custom_logo ? 'Replace logo' : 'Upload logo'}
                  </button>
                  {data.has_custom_logo && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setLogo.mutate({ name: current, svg: null })}
                      className="press tap inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-caption text-ink-500 transition-colors hover:text-ink-900 disabled:opacity-60"
                    >
                      <RotateCcwIcon className="h-3 w-3" strokeWidth={1.75} />
                      Revert
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
