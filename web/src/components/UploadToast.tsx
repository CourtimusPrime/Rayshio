import {
  AnimatePresence,
  type AnimationPlaybackControls,
  animate,
  motion,
  useMotionValue,
} from 'framer-motion';
import { CopyCheckIcon, FileCheck2Icon, FileX2Icon, ShredderIcon, XIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useMotionPrefs } from '../motion/useMotionPrefs';
import { type UploadBatch, tallyOutcomes, useUploads } from '../state/uploads';
import type { Outcome } from '../types';

/**
 * What happened to a batch of uploaded files, while it is happening.
 *
 * Replaces a static "N queued for parsing" box that was accurate and useless:
 * "queued" was the last thing it ever said, so a file that turned out to be a
 * duplicate, or was never an invoice, or crashed the extractor, all looked
 * identical to one that worked. The four outcomes here are the four things that
 * can actually happen to an uploaded PDF.
 *
 * Portalled out of the page rather than rendered in place, for the same reason
 * `InvoiceDrawer` is: it must not be clipped by whichever card happens to
 * contain the upload button, and it has to outlive that card.
 */

/** How long the finished toast lingers before retiring itself. */
const DISMISS_SECONDS = 6;

/** Geometry of the connector fan, in SVG user units. */
const FAN_WIDTH = 240;
const FAN_HEIGHT = 34;
const DOT_TRAVEL_SECONDS = 1.5;

/** One puff cycle. The two rings are half a cycle apart, so one is always mid-flight. */
const PUFF_SECONDS = 1.6;

interface Bucket {
  key: Exclude<Outcome, 'pending'>;
  icon: LucideIcon;
  tone: string;
  label: (n: number) => string;
}

/**
 * Display order, not severity order: added first because it is what the user
 * wanted, then the three ways a file can fail to become an invoice, ordered
 * from most-benign to most-alarming.
 */
const BUCKETS: Bucket[] = [
  {
    key: 'added',
    icon: FileCheck2Icon,
    tone: 'text-accent',
    label: (n) => `${n} invoice${n === 1 ? '' : 's'} added`,
  },
  {
    key: 'duplicate',
    icon: CopyCheckIcon,
    tone: 'text-ink-500',
    label: (n) => `${n} duplicate${n === 1 ? '' : 's'}`,
  },
  {
    key: 'not_invoice',
    icon: ShredderIcon,
    tone: 'text-ink-500',
    label: (n) => (n === 1 ? "1 wasn't an invoice" : `${n} weren't invoices`),
  },
  {
    key: 'error',
    icon: FileX2Icon,
    tone: 'text-danger-text',
    label: (n) => `${n} errored`,
  },
];

export function UploadToast() {
  const { batch, settled, dismiss } = useUploads();
  const host = typeof document === 'undefined' ? null : document.getElementById('overlay-root');

  if (!host) {
    if (import.meta.env.DEV) {
      console.error('UploadToast: #overlay-root is missing from index.html');
    }
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {batch && (
        // Keyed on the batch, so starting a second upload remounts rather than
        // animating this one's counts down into the next one's.
        <ToastPanel key={batch.id} batch={batch} settled={settled} onDismiss={dismiss} />
      )}
    </AnimatePresence>,
    host,
  );
}

function ToastPanel({
  batch,
  settled,
  onDismiss,
}: {
  batch: UploadBatch;
  settled: boolean;
  onDismiss: () => void;
}) {
  const prefs = useMotionPrefs();
  const tally = tallyOutcomes(batch.files);
  const shown = BUCKETS.filter((b) => tally[b.key] > 0);

  /*
   * The dismiss timer, as a motion value rather than a CSS transition.
   *
   * Pausing has to resume from where it stopped — a transition restarted on
   * mouseleave would give the user more time the more often they looked at it,
   * and a paused CSS transition cannot report how far it got. `animate()`
   * returns playback controls that pause and resume in place, and the same
   * value drives the bar's width, so what is on screen is the actual remaining
   * time rather than a second animation hopefully in step with it.
   */
  const remaining = useMotionValue(1);
  const playback = useRef<AnimationPlaybackControls | null>(null);

  useEffect(() => {
    if (!settled) return;

    remaining.set(1);
    const controls = animate(remaining, 0, {
      duration: DISMISS_SECONDS,
      ease: 'linear',
      onComplete: onDismiss,
    });
    playback.current = controls;
    return () => {
      controls.stop();
      playback.current = null;
    };
  }, [settled, remaining, onDismiss]);

  const pending = batch.files.filter((f) => f.outcome === 'pending').length;
  const heading = settled
    ? summaryFor(batch, pending)
    : `Cataloguing ${batch.files.length} file${batch.files.length === 1 ? '' : 's'}…`;

  return (
    <motion.div
      // Focus pauses as well as hover: a keyboard user tabbing to the close
      // button has exactly the same reason to stop the clock, and onFocus
      // bubbles in React, so this covers anything focusable inside.
      onMouseEnter={() => playback.current?.pause()}
      onMouseLeave={() => playback.current?.play()}
      onFocus={() => playback.current?.pause()}
      onBlur={() => playback.current?.play()}
      initial={prefs.pick({ opacity: 0, y: 12, scale: 0.98 }, { opacity: 0 })}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={prefs.pick({ opacity: 0, y: 12, scale: 0.98 }, { opacity: 0 })}
      transition={prefs.spring('surface')}
      className="material-sheet fixed bottom-4 right-4 z-toast w-[19.5rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-line shadow-card"
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="press tap absolute right-2 top-2 rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-canvas hover:text-ink-900"
      >
        <XIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
      </button>

      <div className="px-4 pb-5 pt-4">
        {/* One live region for the whole report. Announcing per-chip would read
            four fragments as four separate updates; `atomic` makes it one. */}
        <div role="status" aria-live="polite" aria-atomic="true">
          <p className="pr-6 text-center text-footnote text-ink-700">{heading}</p>
        </div>

        <div className="mt-3 flex justify-center">
          <PuffSpinner spinning={!settled} reduced={prefs.reduced} />
        </div>

        {shown.length > 0 && (
          <>
            <ConnectorFan count={shown.length} reduced={prefs.reduced} />
            <ul className="flex items-start justify-around gap-1">
              {shown.map((bucket) => (
                <li
                  key={bucket.key}
                  className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center"
                >
                  <bucket.icon className={`h-4 w-4 ${bucket.tone}`} strokeWidth={1.75} />
                  <span className="text-micro leading-tight text-ink-500">
                    {bucket.label(tally[bucket.key])}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Decorative twin of the dismiss timer — the heading already says what
          happened, so announcing a shrinking bar adds nothing. */}
      {settled && (
        <motion.div
          aria-hidden="true"
          style={{ scaleX: remaining, originX: 0 }}
          className={`absolute inset-x-0 bottom-0 h-0.5 ${
            tally.added === batch.files.length ? 'bg-accent' : 'bg-warn-solid'
          }`}
        />
      )}
    </motion.div>
  );
}

/**
 * The heading once nothing is left to wait for.
 *
 * `pollExhausted` is its own sentence rather than an error: the worker is still
 * going, this component simply stopped asking. Saying "done" would be a lie and
 * saying "failed" a worse one.
 */
function summaryFor(batch: UploadBatch, pending: number): string {
  if (pending > 0) return `${pending} still parsing — check back shortly`;
  const n = batch.files.length;
  return `${n} file${n === 1 ? '' : 's'} catalogued`;
}

/**
 * The puff: two rings expanding out of the centre and fading, half a cycle
 * apart, so there is always one mid-flight.
 *
 * Hand-rolled rather than pulled from a spinner library because the libraries
 * animate unconditionally — this one collapses to a still ring when the user
 * has asked for reduced motion, and stops entirely once there is nothing left
 * to wait for, which is the difference between a progress indicator and a
 * decoration that never learned the work had finished.
 */
function PuffSpinner({ spinning, reduced }: { spinning: boolean; reduced: boolean }) {
  if (reduced || !spinning) {
    return (
      <span
        aria-hidden="true"
        className={`block h-9 w-9 rounded-full border-2 ${
          spinning ? 'border-accent/40' : 'border-accent/20'
        }`}
      />
    );
  }

  return (
    <span aria-hidden="true" className="relative block h-9 w-9">
      {[0, 1].map((index) => (
        <motion.span
          key={index}
          className="absolute inset-0 rounded-full border-2 border-accent"
          /*
           * Opacity is a keyframe array starting *and* ending at 0, which is
           * what stops the border flickering once a cycle.
           *
           * Animating straight from 0.75 to 0 looks right in isolation and
           * wrong on repeat: the loop restarts by snapping the value back to
           * 0.75, so every cycle boundary paints one frame of a fully opaque
           * ring at its smallest — a hard blink at the centre. Ending where it
           * begins removes the discontinuity, so there is nothing to snap.
           *
           * `times` front-loads the fade-in: the ring reaches full strength a
           * quarter of the way out and spends the rest of the cycle fading,
           * which is what makes it read as a puff dissipating rather than a
           * circle pulsing.
           */
          animate={{ scale: [0.15, 1], opacity: [0, 0.75, 0] }}
          /*
           * Each property carries its own full transition, `repeat` included.
           *
           * A per-property override replaces the parent transition for that
           * property rather than extending it — so writing `duration`/`repeat`
           * once at the top and `ease` per property silently drops the repeat,
           * and both rings play a single cycle and stop invisible at opacity 0.
           * That failure looks identical to a working spinner in a screenshot,
           * which is why it is asserted on rather than eyeballed.
           */
          transition={{
            scale: {
              duration: PUFF_SECONDS,
              repeat: Number.POSITIVE_INFINITY,
              ease: 'easeOut',
              delay: index * (PUFF_SECONDS / 2),
            },
            opacity: {
              duration: PUFF_SECONDS,
              repeat: Number.POSITIVE_INFINITY,
              times: [0, 0.25, 1],
              ease: 'linear',
              delay: index * (PUFF_SECONDS / 2),
            },
          }}
        />
      ))}
    </span>
  );
}

/**
 * Dotted lines from the spinner down to each outcome, with dots travelling
 * along them.
 *
 * Drawn as one SVG rather than positioned elements because the lines are
 * diagonal whenever there is more than one outcome, and geometry is the thing
 * SVG is for — the alternative is rotated divs whose length has to be
 * recomputed by hand for every count.
 *
 * The fan generalises: one outcome puts the line straight down, two splay it
 * left and right, four spread evenly. Each line ends at the centre of the chip
 * it belongs to, which is why the x maths matches the `justify-around` list
 * below it.
 */
function ConnectorFan({ count, reduced }: { count: number; reduced: boolean }) {
  const dots = [0, 1, 2];

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${FAN_WIDTH} ${FAN_HEIGHT}`}
      preserveAspectRatio="none"
      className="my-1 h-8 w-full"
    >
      <title>Files being sorted into outcomes</title>
      {Array.from({ length: count }, (_, index) => {
        const x2 = ((index + 0.5) / count) * FAN_WIDTH;
        return (
          <g key={index}>
            <line
              x1={FAN_WIDTH / 2}
              y1={0}
              x2={x2}
              y2={FAN_HEIGHT}
              strokeDasharray="2 4"
              strokeWidth={1}
              strokeLinecap="round"
              className="stroke-line-strong"
            />
            {!reduced &&
              dots.map((dot) => (
                <motion.circle
                  key={dot}
                  r={1.8}
                  className="fill-accent"
                  initial={{ cx: FAN_WIDTH / 2, cy: 0, opacity: 0 }}
                  animate={{ cx: x2, cy: FAN_HEIGHT, opacity: [0, 1, 1, 0] }}
                  transition={{
                    duration: DOT_TRAVEL_SECONDS,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: 'linear',
                    delay: (dot * DOT_TRAVEL_SECONDS) / dots.length,
                  }}
                />
              ))}
          </g>
        );
      })}
    </svg>
  );
}
