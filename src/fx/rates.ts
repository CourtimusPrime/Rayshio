import { config } from '../config.js';

/**
 * Query-time FX conversion (SPEC.md:190-196): rates are looked up and applied
 * when a query runs, and converted amounts are never written back to the
 * database. Each invoice converts at the rate on its *own* invoice date, so a
 * past month's total does not move when today's rate does.
 *
 * Rates come from the ECB via Frankfurter (free, no key, full history). The ECB
 * publishes ~30 currencies, so hard-pegged currencies outside that set are
 * handled by an explicit peg table below.
 */

export interface Rate {
  /** Units of `to` per 1 unit of `from`. */
  rate: number;
  /** The date the rate is actually from — ECB skips weekends and holidays. */
  rateDate: string;
  source: 'ecb' | 'peg' | 'identity';
}

/**
 * Currencies the ECB does not publish that are hard-pegged to another currency.
 * The AED peg has been 3.6725/USD since November 1997, so it is accurate for any
 * invoice date we can encounter. Anything added here must be a genuine fixed
 * peg — a floating rate belongs in the ECB feed, not this table.
 */
const PEGS: Record<string, { base: string; perBase: number; since: string }> = {
  AED: { base: 'USD', perBase: 3.6725, since: '1997-11-01' },
};

/** ECB quotes are fetched with USD as the base and pivoted through it. */
const PIVOT = 'USD';

type RatesByDate = Map<string, Record<string, number>>;

let cache: { key: string; dates: string[]; rates: RatesByDate } | undefined;

function ecbSymbols(currencies: Set<string>): string[] {
  return [...currencies].filter((c) => c !== PIVOT && !PEGS[c]).sort();
}

export class FxUnavailableError extends Error {}

/**
 * Loads the full daily series for every needed currency in one request and
 * memoises it. Historical ECB rates are immutable, so the only reason to refetch
 * is a widened date range or a new currency.
 */
async function loadSeries(currencies: Set<string>, from: string, to: string): Promise<void> {
  const symbols = ecbSymbols(currencies);
  const key = `${from}..${to}|${symbols.join(',')}`;
  if (cache?.key === key) return;
  if (symbols.length === 0) {
    cache = { key, dates: [], rates: new Map() };
    return;
  }

  const url = `${config.FX_BASE_URL}/${from}..${to}?base=${PIVOT}&symbols=${symbols.join(',')}`;
  let payload: { rates?: Record<string, Record<string, number>> };
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    payload = (await res.json()) as typeof payload;
  } catch (err) {
    throw new FxUnavailableError(`FX rate lookup failed: ${(err as Error).message}`);
  }

  const rates: RatesByDate = new Map(Object.entries(payload.rates ?? {}));
  cache = { key, dates: [...rates.keys()].sort(), rates };
}

/** Most recent published date on or before `date` — ECB has no weekend quotes. */
function rateOnOrBefore(date: string): { date: string; rates: Record<string, number> } | null {
  if (!cache || cache.dates.length === 0) return null;
  let candidate: string | null = null;
  for (const d of cache.dates) {
    if (d <= date) candidate = d;
    else break;
  }
  // an invoice predating the series falls back to the earliest quote we have
  const chosen = candidate ?? cache.dates[0];
  if (!chosen) return null;
  const rates = cache.rates.get(chosen);
  return rates ? { date: chosen, rates } : null;
}

/** Units of `currency` per 1 PIVOT on `date`. */
function perPivot(
  currency: string,
  date: string,
): { rate: number; rateDate: string; source: Rate['source'] } {
  if (currency === PIVOT) return { rate: 1, rateDate: date, source: 'identity' };

  const peg = PEGS[currency];
  if (peg) {
    if (peg.base !== PIVOT) throw new Error(`peg for ${currency} is not against ${PIVOT}`);
    return { rate: peg.perBase, rateDate: date, source: 'peg' };
  }

  const day = rateOnOrBefore(date);
  const rate = day?.rates[currency];
  if (!day || rate === undefined) {
    throw new FxUnavailableError(`no ${PIVOT}->${currency} rate available for ${date}`);
  }
  return { rate, rateDate: day.date, source: 'ecb' };
}

export interface ConversionInput {
  currency: string;
  /** 'YYYY-MM-DD'; the invoice's own date. */
  date: string;
}

/**
 * Prepares a converter for a set of invoices. Fetching is batched: call once per
 * request with every currency/date you are about to convert.
 */
export async function makeConverter(
  inputs: ConversionInput[],
  displayCurrency: string,
): Promise<(amountMinor: number, currency: string, date: string) => { minor: number; rate: Rate }> {
  const currencies = new Set<string>([displayCurrency, ...inputs.map((i) => i.currency)]);
  const dates = inputs
    .map((i) => i.date)
    .filter(Boolean)
    .sort();

  if (ecbSymbols(currencies).length > 0) {
    const from = dates[0] ?? new Date().toISOString().slice(0, 10);
    const to = dates[dates.length - 1] ?? from;
    await loadSeries(currencies, from, to);
  }

  return (amountMinor, currency, date) => {
    if (currency === displayCurrency) {
      return { minor: amountMinor, rate: { rate: 1, rateDate: date, source: 'identity' } };
    }
    const fromLeg = perPivot(currency, date);
    const toLeg = perPivot(displayCurrency, date);
    const rate = toLeg.rate / fromLeg.rate;
    return {
      minor: Math.round(amountMinor * rate),
      rate: {
        rate,
        rateDate: fromLeg.source === 'ecb' ? fromLeg.rateDate : toLeg.rateDate,
        // a conversion that touches a pegged leg is only as good as the peg
        source: fromLeg.source === 'peg' || toLeg.source === 'peg' ? 'peg' : 'ecb',
      },
    };
  };
}

/** Currencies we can convert without a network call. */
export function peggedCurrencies(): string[] {
  return Object.keys(PEGS);
}
