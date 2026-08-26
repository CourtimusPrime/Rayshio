import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `rates.ts` memoises the fetched series in a module-level variable, so every
 * case resets the registry to get a clean cache. The ECB feed itself is stubbed:
 * these tests are about pivoting, peg handling and the weekend fallback, none of
 * which should depend on the network.
 */
const REQUIRED = {
  PGSQL_DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  MONGODB_DATABASE_URL: 'mongodb://localhost:27017/db',
  REDIS_DATABASE_URL: 'redis://localhost:6379',
  GOOGLE_CLIENT_ID: 'id',
  GOOGLE_CLIENT_SECRET: 'secret',
};

let saved: NodeJS.ProcessEnv;

beforeEach(() => {
  saved = { ...process.env };
  Object.assign(process.env, REQUIRED);
  vi.resetModules();
});

afterEach(() => {
  process.env = saved;
  vi.unstubAllGlobals();
});

/** ECB-shaped payload: base USD, `rates[date][symbol]` = symbol per 1 USD. */
function stubEcb(rates: Record<string, Record<string, number>>) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({ rates }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function load() {
  return import('../../src/fx/rates.js');
}

describe('makeConverter', () => {
  it('is an identity when the invoice is already in the display currency', async () => {
    stubEcb({});
    const { makeConverter } = await load();
    const convert = await makeConverter([{ currency: 'USD', date: '2026-03-16' }], 'USD');
    const { minor, rate } = convert(12345, 'USD', '2026-03-16');
    expect(minor).toBe(12345);
    expect(rate.source).toBe('identity');
  });

  it('converts through the USD pivot using the published rate', async () => {
    stubEcb({ '2026-03-16': { GBP: 0.5 } });
    const { makeConverter } = await load();
    const convert = await makeConverter([{ currency: 'GBP', date: '2026-03-16' }], 'USD');
    // 0.5 GBP per USD, so £50.00 is $100.00
    const { minor, rate } = convert(5000, 'GBP', '2026-03-16');
    expect(minor).toBe(10000);
    expect(rate.source).toBe('ecb');
    expect(rate.rateDate).toBe('2026-03-16');
  });

  it('cross-converts two non-pivot currencies', async () => {
    stubEcb({ '2026-03-16': { GBP: 0.5, EUR: 2 } });
    const { makeConverter } = await load();
    const convert = await makeConverter([{ currency: 'GBP', date: '2026-03-16' }], 'EUR');
    // £50 -> $100 -> €200
    expect(convert(5000, 'GBP', '2026-03-16').minor).toBe(20000);
  });

  it('uses the hard peg for AED and never calls the network for it', async () => {
    const fetchMock = stubEcb({});
    const { makeConverter } = await load();
    const convert = await makeConverter([{ currency: 'AED', date: '2026-03-16' }], 'USD');
    const { minor, rate } = convert(367250, 'AED', '2026-03-16');
    // 3.6725 AED per USD since 1997
    expect(minor).toBe(100000);
    expect(rate.source).toBe('peg');
    // Nothing to ask the ECB for: both legs are pivot or pegged.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('marks a conversion pegged when either leg is pegged', async () => {
    stubEcb({ '2026-03-16': { GBP: 0.5 } });
    const { makeConverter } = await load();
    const convert = await makeConverter([{ currency: 'GBP', date: '2026-03-16' }], 'AED');
    // A result is only as trustworthy as its weakest leg.
    expect(convert(5000, 'GBP', '2026-03-16').rate.source).toBe('peg');
  });

  it('falls back to the last published quote on a weekend', async () => {
    // 2026-03-14 is a Saturday; the ECB publishes nothing.
    stubEcb({ '2026-03-13': { GBP: 0.5 }, '2026-03-16': { GBP: 0.25 } });
    const { makeConverter } = await load();
    const convert = await makeConverter(
      [
        { currency: 'GBP', date: '2026-03-13' },
        { currency: 'GBP', date: '2026-03-16' },
      ],
      'USD',
    );
    const sat = convert(5000, 'GBP', '2026-03-14');
    expect(sat.rate.rateDate).toBe('2026-03-13');
    expect(sat.minor).toBe(10000);
  });

  it('falls back to the earliest quote for an invoice predating the series', async () => {
    stubEcb({ '2026-03-16': { GBP: 0.5 } });
    const { makeConverter } = await load();
    const convert = await makeConverter([{ currency: 'GBP', date: '2026-03-16' }], 'USD');
    const old = convert(5000, 'GBP', '1999-01-01');
    expect(old.rate.rateDate).toBe('2026-03-16');
    expect(old.minor).toBe(10000);
  });

  it('rounds to whole minor units', async () => {
    stubEcb({ '2026-03-16': { GBP: 0.3 } });
    const { makeConverter } = await load();
    const convert = await makeConverter([{ currency: 'GBP', date: '2026-03-16' }], 'USD');
    // 1 / 0.3 = 3.333…, so 100 minor units -> 333.33… -> 333
    expect(convert(100, 'GBP', '2026-03-16').minor).toBe(333);
    expect(Number.isInteger(convert(100, 'GBP', '2026-03-16').minor)).toBe(true);
  });

  it('preserves the sign of a credit', async () => {
    stubEcb({ '2026-03-16': { GBP: 0.5 } });
    const { makeConverter } = await load();
    const convert = await makeConverter([{ currency: 'GBP', date: '2026-03-16' }], 'USD');
    expect(convert(-5000, 'GBP', '2026-03-16').minor).toBe(-10000);
  });
});

describe('FxUnavailableError', () => {
  it('is thrown when the rate feed is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );
    const { makeConverter, FxUnavailableError } = await load();
    await expect(makeConverter([{ currency: 'GBP', date: '2026-03-16' }], 'USD')).rejects.toThrow(
      FxUnavailableError,
    );
  });

  it('is thrown on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, statusText: 'Service Unavailable' })),
    );
    const { makeConverter, FxUnavailableError } = await load();
    await expect(makeConverter([{ currency: 'GBP', date: '2026-03-16' }], 'USD')).rejects.toThrow(
      FxUnavailableError,
    );
  });

  it('is thrown, rather than a wrong number returned, for a missing currency', async () => {
    // The feed answered but has no quote for this symbol. Silently treating a
    // missing rate as 1 would report a plausible, wrong total.
    stubEcb({ '2026-03-16': { GBP: 0.5 } });
    const { makeConverter, FxUnavailableError } = await load();
    const convert = await makeConverter([{ currency: 'GBP', date: '2026-03-16' }], 'USD');
    expect(() => convert(100, 'ZWL', '2026-03-16')).toThrow(FxUnavailableError);
  });
});

describe('peggedCurrencies', () => {
  it('lists what can be converted without a network call', async () => {
    const { peggedCurrencies } = await load();
    expect(peggedCurrencies()).toContain('AED');
  });
});
