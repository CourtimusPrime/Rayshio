import { describe, expect, it } from 'vitest';
import {
  fiscalQuarterOf,
  fiscalQuarterPeriod,
  fiscalYearOf,
  fiscalYearPeriod,
  fiscalYearStart,
  parsePeriodKey,
  periodsForMonths,
  previousPeriod,
} from '../../src/queries/fiscal.js';

const JAN = 1;
const APR = 4;
const OCT = 10;

describe('fiscalYearOf', () => {
  it('is the calendar year when the fiscal year starts in January', () => {
    expect(fiscalYearOf('2026-01', JAN)).toBe(2026);
    expect(fiscalYearOf('2026-12', JAN)).toBe(2026);
  });

  it('names the year the fiscal year ends in', () => {
    // April start: Apr 2025 – Mar 2026 is FY2026
    expect(fiscalYearOf('2025-04', APR)).toBe(2026);
    expect(fiscalYearOf('2025-12', APR)).toBe(2026);
    expect(fiscalYearOf('2026-03', APR)).toBe(2026);
    // the month before the start belongs to the prior fiscal year
    expect(fiscalYearOf('2025-03', APR)).toBe(2025);
  });
});

describe('fiscalYearStart', () => {
  it('resolves the first calendar month of the fiscal year', () => {
    expect(fiscalYearStart(2026, JAN)).toBe('2026-01');
    expect(fiscalYearStart(2026, APR)).toBe('2025-04');
    expect(fiscalYearStart(2026, OCT)).toBe('2025-10');
  });
});

describe('fiscalYearPeriod', () => {
  it('spans twelve months and labels the real range', () => {
    const fy = fiscalYearPeriod(2026, APR);
    expect(fy.key).toBe('FY2026');
    expect(fy.months).toHaveLength(12);
    expect(fy.months[0]).toBe('2025-04');
    expect(fy.months[11]).toBe('2026-03');
    expect(fy.from).toBe('2025-04-01');
    expect(fy.to).toBe('2026-03-31');
    expect(fy.rangeLabel).toBe('Apr 2025 – Mar 2026');
  });

  it('matches the calendar year for a January start', () => {
    const fy = fiscalYearPeriod(2026, JAN);
    expect(fy.from).toBe('2026-01-01');
    expect(fy.to).toBe('2026-12-31');
  });
});

describe('fiscalQuarterPeriod', () => {
  it('splits the fiscal year into three-month quarters', () => {
    expect(fiscalQuarterPeriod(2026, 1, APR).months).toEqual(['2025-04', '2025-05', '2025-06']);
    expect(fiscalQuarterPeriod(2026, 4, APR).months).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('ends a quarter on the real last day of its final month', () => {
    // Q4 of a January-start FY ends 31 December; Q1 ends 31 March
    expect(fiscalQuarterPeriod(2026, 1, JAN).to).toBe('2026-03-31');
    expect(fiscalQuarterPeriod(2026, 4, JAN).to).toBe('2026-12-31');
    // February in a leap fiscal year
    expect(fiscalQuarterPeriod(2028, 1, JAN).to).toBe('2028-03-31');
  });
});

describe('fiscalQuarterOf', () => {
  it('places months in the right fiscal quarter', () => {
    expect(fiscalQuarterOf('2025-04', APR)).toBe(1);
    expect(fiscalQuarterOf('2025-06', APR)).toBe(1);
    expect(fiscalQuarterOf('2025-07', APR)).toBe(2);
    expect(fiscalQuarterOf('2026-03', APR)).toBe(4);
    expect(fiscalQuarterOf('2026-08', JAN)).toBe(3);
  });
});

describe('parsePeriodKey', () => {
  it('round-trips year and quarter keys', () => {
    expect(parsePeriodKey('FY2026', APR)?.months[0]).toBe('2025-04');
    expect(parsePeriodKey('FY2026-Q2', APR)?.months).toEqual(['2025-07', '2025-08', '2025-09']);
  });

  it('rejects malformed keys', () => {
    expect(parsePeriodKey('2026', APR)).toBeNull();
    expect(parsePeriodKey('FY2026-Q5', APR)).toBeNull();
    expect(parsePeriodKey('nonsense', APR)).toBeNull();
  });
});

describe('periodsForMonths', () => {
  it('returns only periods that contain data, newest first', () => {
    const periods = periodsForMonths(['2026-08', '2026-07', '2026-02'], JAN, 'quarter');
    expect(periods.map((p) => p.key)).toEqual(['FY2026-Q3', 'FY2026-Q1']);
  });

  it('collapses months into their fiscal year', () => {
    const periods = periodsForMonths(['2026-03', '2025-12', '2025-04'], APR, 'year');
    expect(periods.map((p) => p.key)).toEqual(['FY2026']);
  });
});

describe('previousPeriod', () => {
  it('steps back a quarter, wrapping across the fiscal year', () => {
    expect(previousPeriod(fiscalQuarterPeriod(2026, 3, APR), APR).key).toBe('FY2026-Q2');
    expect(previousPeriod(fiscalQuarterPeriod(2026, 1, APR), APR).key).toBe('FY2025-Q4');
  });

  it('steps back a year', () => {
    expect(previousPeriod(fiscalYearPeriod(2026, APR), APR).key).toBe('FY2025');
  });
});
