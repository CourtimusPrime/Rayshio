import { describe, expect, it } from 'vitest';
import {
  isMonthKey,
  longMonthLabel,
  monthRange,
  shiftMonth,
  shortMonthLabel,
  trailingMonths,
} from '../../src/queries/months.js';

describe('isMonthKey', () => {
  it('accepts valid keys', () => {
    expect(isMonthKey('2026-01')).toBe(true);
    expect(isMonthKey('2026-12')).toBe(true);
  });

  it('rejects out-of-range and malformed months', () => {
    expect(isMonthKey('2026-00')).toBe(false);
    expect(isMonthKey('2026-13')).toBe(false);
    expect(isMonthKey('2026-1')).toBe(false);
    expect(isMonthKey('2026-01-01')).toBe(false);
  });
});

describe('shiftMonth', () => {
  it('wraps backwards across a year boundary', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-01', -13)).toBe('2024-12');
  });

  it('wraps forwards across a year boundary', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-08', 6)).toBe('2027-02');
  });
});

describe('monthRange', () => {
  it('ends on the real last day of the month', () => {
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange('2026-04')).toEqual({ from: '2026-04-01', to: '2026-04-30' });
    expect(monthRange('2026-08')).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('handles a leap year February', () => {
    expect(monthRange('2028-02').to).toBe('2028-02-29');
  });
});

describe('trailingMonths', () => {
  it('returns the window oldest-first, inclusive of the anchor', () => {
    expect(trailingMonths('2026-03', 4)).toEqual(['2025-12', '2026-01', '2026-02', '2026-03']);
  });
});

describe('labels', () => {
  it('formats short and long month labels', () => {
    expect(shortMonthLabel('2026-08')).toBe('Aug');
    expect(longMonthLabel('2026-08')).toBe('August 2026');
    // rendered in UTC so the label never slips a month in a negative-offset tz
    expect(longMonthLabel('2026-01')).toBe('January 2026');
  });
});
