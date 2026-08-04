import type { DisplayStatus } from '../types';

const styles: Record<DisplayStatus, { label: string; className: string; dot: string }> = {
  parsed: {
    label: 'Parsed',
    className: 'bg-accent-soft text-accent-strong',
    dot: 'bg-accent',
  },
  pending: {
    label: 'Pending',
    className: 'bg-amber-50 text-amber-700',
    dot: 'bg-amber-500',
  },
  failed: {
    label: 'Failed',
    className: 'bg-rose-50 text-rose-700',
    dot: 'bg-rose-500',
  },
};

export function StatusBadge({ status }: { status: DisplayStatus }) {
  const style = styles[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${style.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {style.label}
    </span>
  );
}
