import { describe, expect, it } from 'vitest';
import { extractionSchema } from '../../src/llm/schemas.js';

const valid = {
  invoice_number: 'INV-2026-001',
  currency: 'USD',
  total_minor: 4217,
  invoice_date: '2026-03-01',
  due_date: null,
  period_start: '2026-02-01',
  period_end: '2026-02-28',
  line_items: [
    {
      description: 'Compute, CU-hour',
      quantity: 102.5,
      unit: 'CU-hour',
      rate_minor: 41,
      amount_minor: 4217,
      period_start: null,
      period_end: null,
    },
  ],
};

describe('extractionSchema', () => {
  it('accepts a valid extraction', () => {
    expect(extractionSchema.parse(valid)).toEqual(valid);
  });

  it('rejects float money', () => {
    const bad = { ...valid, total_minor: 42.17 };
    expect(extractionSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects string money', () => {
    const bad = { ...valid, total_minor: '4217' };
    expect(extractionSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects missing line items', () => {
    const bad = { ...valid, line_items: [] };
    expect(extractionSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects malformed dates', () => {
    const bad = { ...valid, invoice_date: '03/01/2026' };
    expect(extractionSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects non-ISO currency', () => {
    const bad = { ...valid, currency: 'US' };
    expect(extractionSchema.safeParse(bad).success).toBe(false);
  });
});
