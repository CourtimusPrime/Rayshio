/**
 * The pipeline tracks five states; the dashboard only distinguishes three.
 * Everything still in flight reads as 'pending' — from the outside, an invoice
 * that is classified but not yet parsed is simply not ready.
 */
export type DisplayStatus = 'parsed' | 'pending' | 'failed';

export function displayStatus(status: string): DisplayStatus {
  if (status === 'parsed') return 'parsed';
  if (status === 'failed') return 'failed';
  return 'pending';
}

/** Percentage change, or null when there is no prior figure to compare against. */
export function changePercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
