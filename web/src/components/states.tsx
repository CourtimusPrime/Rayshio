import { AlertTriangleIcon, InboxIcon } from 'lucide-react';

/**
 * The design assumes data is always present. Real invoice data is routinely
 * empty — a fresh mailbox, a currency with no invoices this month — so every
 * data-backed section renders one of these instead of an empty chart.
 */

export function LoadingBlock({ className = 'h-24' }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={`animate-pulse rounded-lg bg-canvas ring-1 ring-line ${className}`}
    />
  );
}

export function LoadingLines({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-2.5">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-9 animate-pulse rounded-lg bg-canvas ring-1 ring-line"
          style={{ opacity: 1 - i * 0.12 }}
        />
      ))}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-rose-50 px-3.5 py-3 text-[13px] text-rose-700">
      <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} />
      <span>{message}</span>
    </div>
  );
}

export function EmptyNote({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-canvas px-3.5 py-6 text-[13px] text-ink-500 ring-1 ring-line">
      <InboxIcon className="h-4 w-4 shrink-0 text-ink-400" strokeWidth={1.75} />
      <span>{message}</span>
    </div>
  );
}
