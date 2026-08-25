import { describe, expect, it } from 'vitest';
import { reconcile, suspiciousZeroTotal } from '../../src/pipeline/reconcile.js';

const li = (amount_minor: number) => ({
  description: 'x',
  category: 'other' as const,
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

  it('still passes the paid-receipt shape it cannot detect', () => {
    // The regression this guard exists for. Standard plan 3577 + VAT 715, with
    // the card payment mis-extracted as a -4293 credit, sums to exactly the
    // reported total of 0. Arithmetic has nothing to object to — which is the
    // whole reason `suspiciousZeroTotal` is a separate check.
    const r = reconcile({ total_minor: 0, line_items: [li(3577), li(715), li(-4293)] });
    expect(r.ok).toBe(true);
  });
});

describe('suspiciousZeroTotal', () => {
  it('flags a zero total that had positive charges in it', () => {
    expect(
      suspiciousZeroTotal({ total_minor: 0, line_items: [li(3577), li(715), li(-4293)] }),
    ).toBe(true);
  });

  it('flags the genuine-zero shape too, because the numbers are identical', () => {
    // A 100% free-trial discount produces the same arithmetic as a mis-read
    // payment line. This is knowingly a false positive: the cost is one extra
    // escalation call, and the escalated pass returns 0 again.
    expect(suspiciousZeroTotal({ total_minor: 0, line_items: [li(3557), li(-3557)] })).toBe(true);
  });

  it('ignores a zero total with no positive lines', () => {
    expect(suspiciousZeroTotal({ total_minor: 0, line_items: [] })).toBe(false);
    expect(suspiciousZeroTotal({ total_minor: 0, line_items: [li(0)] })).toBe(false);
  });

  it('ignores any non-zero total', () => {
    expect(suspiciousZeroTotal({ total_minor: 4293, line_items: [li(3577), li(715)] })).toBe(false);
    // A credit note is a real document with a real (negative) effect on spend.
    expect(suspiciousZeroTotal({ total_minor: -500, line_items: [li(-500)] })).toBe(false);
  });
});
