import { describe, expect, it } from 'vitest';
import { reconcile } from '../../src/pipeline/reconcile.js';

const li = (amount_minor: number) => ({
  description: 'x',
  quantity: null,
  unit: null,
  rate_minor: null,
  amount_minor,
  period_start: null,
  period_end: null,
});

describe('reconcile', () => {
  it('passes on exact match', () => {
    const r = reconcile({ total_minor: 4217, line_items: [li(4000), li(217)] });
    expect(r.ok).toBe(true);
    expect(r.sum).toBe(4217);
  });

  it('passes within tolerance (2 cents min)', () => {
    expect(reconcile({ total_minor: 100, line_items: [li(102)] }).ok).toBe(true);
    expect(reconcile({ total_minor: 100, line_items: [li(98)] }).ok).toBe(true);
  });

  it('fails outside tolerance', () => {
    expect(reconcile({ total_minor: 100, line_items: [li(103)] }).ok).toBe(false);
    expect(reconcile({ total_minor: 5000, line_items: [li(1000), li(1000)] }).ok).toBe(false);
  });

  it('scales tolerance with line count (1 cent per line, min 2)', () => {
    const items = [li(100), li(100), li(100), li(101)];
    expect(reconcile({ total_minor: 397, line_items: items }).ok).toBe(true);
    expect(reconcile({ total_minor: 396, line_items: items }).ok).toBe(false);
  });

  it('handles negative lines (credits/discounts)', () => {
    const r = reconcile({ total_minor: 900, line_items: [li(1000), li(-100)] });
    expect(r.ok).toBe(true);
  });
});
