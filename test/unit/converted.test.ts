import { describe, expect, it } from 'vitest';
import {
  ConversionTracker,
  convertInvoices,
  totalsByCategory,
  totalsByMonth,
  totalsByService,
  totalsByServiceCategory,
} from '../../src/queries/converted.js';
import type { InvoiceFact, LineItemFact } from '../../src/queries/facts.js';

/**
 * A stand-in for `makeConverter`. Real rates come off the network; the
 * aggregation being tested here does not care where a rate came from, only that
 * the same one is applied consistently — so the fake is a fixed table and the
 * tests can assert exact minor-unit totals.
 */
const RATES: Record<string, number> = { USD: 1, GBP: 2, EUR: 0.5, AED: 1 };
const SOURCE: Record<string, 'ecb' | 'peg' | 'identity'> = {
  USD: 'identity',
  GBP: 'ecb',
  EUR: 'ecb',
  AED: 'peg',
};

function convert(minor: number, currency: string, effective_date: string) {
  return {
    minor: Math.round(minor * (RATES[currency] ?? 1)),
    rate: { rateDate: effective_date, source: SOURCE[currency] ?? 'identity' },
  };
}

const inv = (o: Partial<InvoiceFact> = {}): InvoiceFact => ({
  invoice_id: 1,
  service: 'Acme',
  currency: 'USD',
  value: 1000,
  effective_date: '2026-03-15',
  invoice_date: '2026-03-15',
  status: 'parsed',
  ...o,
});

const li = (o: Partial<LineItemFact> = {}): LineItemFact => ({
  invoice_id: 1,
  service: 'Acme',
  category: 'ai',
  description: 'Tokens',
  amount: 1000,
  currency: 'USD',
  effective_date: '2026-03-15',
  ...o,
});

describe('ConversionTracker', () => {
  it('reports no conversion when everything is already the display currency', () => {
    const t = new ConversionTracker('USD');
    t.note('USD', { rateDate: '2026-03-15', source: 'identity' });
    const m = t.meta();
    expect(m.converted).toBe(false);
    expect(m.rate_source).toBe('none');
    // An identity "rate" is not a rate, so it must not date the conversion.
    expect(m.rate_date).toBeNull();
    expect(m.source_currencies).toEqual(['USD']);
  });

  it('flags conversion as soon as a foreign currency appears', () => {
    const t = new ConversionTracker('USD');
    t.note('USD', { rateDate: '2026-03-15', source: 'identity' });
    t.note('GBP', { rateDate: '2026-03-15', source: 'ecb' });
    const m = t.meta();
    expect(m.converted).toBe(true);
    expect(m.rate_source).toBe('ecb');
    expect(m.uses_pegged_rate).toBe(false);
    expect(m.source_currencies).toEqual(['GBP', 'USD']);
  });

  it("calls a peg a peg, and a mix of the two 'mixed'", () => {
    const peg = new ConversionTracker('USD');
    peg.note('AED', { rateDate: '2026-03-15', source: 'peg' });
    expect(peg.meta()).toMatchObject({ rate_source: 'peg', uses_pegged_rate: true });

    const mixed = new ConversionTracker('USD');
    mixed.note('AED', { rateDate: '2026-03-15', source: 'peg' });
    mixed.note('GBP', { rateDate: '2026-03-15', source: 'ecb' });
    expect(mixed.meta()).toMatchObject({ rate_source: 'mixed', uses_pegged_rate: true });
  });

  it('keeps the latest rate date, whatever order rates arrive in', () => {
    const t = new ConversionTracker('USD');
    t.note('GBP', { rateDate: '2026-03-20', source: 'ecb' });
    t.note('EUR', { rateDate: '2026-01-02', source: 'ecb' });
    expect(t.meta().rate_date).toBe('2026-03-20');
  });
});

describe('convertInvoices', () => {
  it('converts each invoice and marks which ones moved', () => {
    const t = new ConversionTracker('USD');
    const rows = convertInvoices(
      [inv({ currency: 'USD', value: 1000 }), inv({ invoice_id: 2, currency: 'GBP', value: 1000 })],
      convert,
      t,
      'USD',
    );
    expect(rows.map((r) => r.converted_value)).toEqual([1000, 2000]);
    expect(rows.map((r) => r.is_converted)).toEqual([false, true]);
  });

  it('leaves the native value untouched — conversion is read-only (SPEC.md:190-196)', () => {
    const t = new ConversionTracker('USD');
    const [row] = convertInvoices([inv({ currency: 'GBP', value: 1234 })], convert, t, 'USD');
    expect(row?.value).toBe(1234);
    expect(row?.currency).toBe('GBP');
    expect(row?.converted_value).toBe(2468);
  });
});

describe('totalsByService', () => {
  it('sums per vendor, biggest first', () => {
    const t = new ConversionTracker('USD');
    const rows = convertInvoices(
      [
        inv({ service: 'Acme', value: 1000 }),
        inv({ invoice_id: 2, service: 'Acme', value: 500 }),
        inv({ invoice_id: 3, service: 'Globex', value: 5000 }),
      ],
      convert,
      t,
      'USD',
    );
    expect(totalsByService(rows)).toEqual([
      { service: 'Globex', total_minor: 5000, invoice_count: 1 },
      { service: 'Acme', total_minor: 1500, invoice_count: 2 },
    ]);
  });

  it('keeps a vendor whose invoices cancel out unless asked to drop it', () => {
    const t = new ConversionTracker('USD');
    const rows = convertInvoices(
      [inv({ service: 'Acme', value: 500 }), inv({ invoice_id: 2, service: 'Acme', value: -500 })],
      convert,
      t,
      'USD',
    );
    expect(totalsByService(rows)).toHaveLength(1);
    expect(totalsByService(rows, { dropZeroTotals: true })).toHaveLength(0);
  });
});

describe('totalsByMonth', () => {
  it('buckets by effective date and counts distinct vendors', () => {
    const t = new ConversionTracker('USD');
    const rows = convertInvoices(
      [
        inv({ effective_date: '2026-03-01', service: 'Acme', value: 100 }),
        inv({ invoice_id: 2, effective_date: '2026-03-31', service: 'Acme', value: 100 }),
        inv({ invoice_id: 3, effective_date: '2026-03-15', service: 'Globex', value: 100 }),
        inv({ invoice_id: 4, effective_date: '2026-04-01', service: 'Acme', value: 100 }),
      ],
      convert,
      t,
      'USD',
    );
    const m = totalsByMonth(rows);
    expect(m.get('2026-03')).toEqual({
      month: '2026-03',
      total_minor: 300,
      invoice_count: 3,
      service_count: 2,
    });
    expect(m.get('2026-04')?.service_count).toBe(1);
  });
});

describe('totalsByCategory / totalsByServiceCategory', () => {
  const items = [
    li({ service: 'OpenAI', category: 'ai', description: 'GPT-4', amount: 900 }),
    li({ service: 'OpenAI', category: 'ai', description: 'Embeddings', amount: 100 }),
    li({ service: 'AWS', category: 'computing', description: 'EC2', amount: 500 }),
    li({ service: 'AWS', category: 'ai', description: 'Bedrock', amount: 200 }),
  ];

  it('groups into a two-level tree sorted by size at both levels', () => {
    const t = new ConversionTracker('USD');
    const cats = totalsByCategory(items, convert, t);
    expect(cats.map((c) => c.category)).toEqual(['ai', 'computing']);

    const ai = cats.find((c) => c.category === 'ai');
    expect(ai?.total_minor).toBe(1200);
    expect(ai?.services.map((s) => s.service)).toEqual(['OpenAI', 'AWS']);
  });

  it('pivots to the same totals the other way round', () => {
    const byCat = totalsByCategory(items, convert, new ConversionTracker('USD'));
    const bySvc = totalsByServiceCategory(items, convert, new ConversionTracker('USD'));
    const sum = (ns: { total_minor: number }[]) => ns.reduce((s, n) => s + n.total_minor, 0);
    // The module's own claim: "If the two ever disagree, the grouping is not
    // the thing that broke."
    expect(sum(byCat)).toBe(sum(bySvc));
    expect(sum(byCat)).toBe(1700);
  });

  it('notes the two biggest descriptions but lists every one', () => {
    const t = new ConversionTracker('USD');
    const ai = totalsByCategory(
      [
        li({ description: 'Big', amount: 900 }),
        li({ description: 'Middle', amount: 500 }),
        li({ description: 'Small', amount: 100 }),
      ],
      convert,
      t,
    ).find((c) => c.category === 'ai');

    expect(ai?.services[0]?.note).toBe('Big · Middle');
    // A categorisation rule is written per description, so a truncated list
    // would silently leave the rest behind.
    expect(ai?.services[0]?.descriptions).toEqual(['Big', 'Middle', 'Small']);
  });

  it('drops a group whose children cancel out, but only when asked', () => {
    const cancelling = [
      li({ category: 'ai', description: 'Charge', amount: 500 }),
      li({ category: 'ai', description: 'Credit', amount: -500 }),
    ];
    expect(totalsByCategory(cancelling, convert, new ConversionTracker('USD'))).toHaveLength(1);
    expect(
      totalsByCategory(cancelling, convert, new ConversionTracker('USD'), {
        dropZeroTotals: true,
      }),
    ).toHaveLength(0);
  });

  it('sums a parent over every child, including ones display would hide', () => {
    // The total must not depend on what is being shown.
    const mixed = [
      li({ service: 'Acme', category: 'ai', description: 'Real', amount: 700 }),
      li({ service: 'Zeta', category: 'ai', description: 'Charge', amount: 300 }),
      li({ service: 'Zeta', category: 'ai', description: 'Credit', amount: -300 }),
    ];
    const [cat] = totalsByCategory(mixed, convert, new ConversionTracker('USD'), {
      dropZeroTotals: true,
    });
    expect(cat?.total_minor).toBe(700);
    expect(cat?.services.map((s) => s.service)).toEqual(['Acme']);
  });

  it('folds an unknown or null category into the shared fallback', () => {
    const cats = totalsByCategory(
      [li({ category: null, amount: 100 }), li({ category: 'not-a-real-category', amount: 100 })],
      convert,
      new ConversionTracker('USD'),
    );
    expect(cats).toHaveLength(1);
    expect(cats[0]?.total_minor).toBe(200);
  });

  it('converts each line item at its own currency before summing', () => {
    const t = new ConversionTracker('USD');
    const cats = totalsByCategory(
      [
        li({ currency: 'USD', amount: 1000, description: 'usd' }),
        li({ currency: 'GBP', amount: 1000, description: 'gbp' }),
      ],
      convert,
      t,
    );
    expect(cats[0]?.total_minor).toBe(3000);
    expect(t.meta().source_currencies).toEqual(['GBP', 'USD']);
  });
});
