import type { DisplayStatus } from '../types';

const styles: Record<DisplayStatus, { label: string; className: string; dot: string }> = {
  parsed: {
    label: 'Parsed',
    className: 'bg-accent-soft text-accent-strong',
    dot: 'bg-accent',
  },
  pending: {
    label: 'Pending',
    className: 'bg-warn-soft text-warn-text',
    dot: 'bg-warn-solid',
  },
  failed: {
    label: 'Failed',
    className: 'bg-danger-soft text-danger-text',
    dot: 'bg-danger-solid',
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
