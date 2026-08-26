import { describe, expect, it } from 'vitest';
import { formatMinor } from '../../src/queries/format.js';

describe('formatMinor', () => {
  it('renders minor units as a two-decimal amount with its currency', () => {
    expect(formatMinor(4217, 'USD')).toBe('42.17 USD');
  });

  it('keeps trailing zeros, so amounts line up in a column', () => {
    expect(formatMinor(4200, 'USD')).toBe('42.00 USD');
    expect(formatMinor(0, 'GBP')).toBe('0.00 GBP');
  });

  it('renders a credit as negative rather than dropping the sign', () => {
    expect(formatMinor(-4217, 'EUR')).toBe('-42.17 EUR');
  });

  it('handles amounts below one unit', () => {
    expect(formatMinor(7, 'USD')).toBe('0.07 USD');
    expect(formatMinor(70, 'USD')).toBe('0.70 USD');
  });

  it('does not lose precision on large amounts', () => {
    expect(formatMinor(123456789, 'AED')).toBe('1234567.89 AED');
  });
});
