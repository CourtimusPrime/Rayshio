import { normalizeCategory } from '../categories.js';
import { type ConversionInput, makeConverter } from '../fx/rates.js';
import type { InvoiceFact, LineItemFact } from './facts.js';

/**
 * Aggregation over FX-converted facts. Every amount is converted at the rate on
 * its own effective date before being summed, so a month's total is fixed once
 * that month is over. Converted values are returned to the caller and never
 * written back (SPEC.md:190-196).
 */

export interface ConversionMeta {
  display_currency: string;
  /** Currencies actually present in the data being summed. */
  source_currencies: string[];
  converted: boolean;
  /** Set when any leg relied on a hard peg rather than a published ECB quote. */
  uses_pegged_rate: boolean;
  /** Latest rate date used — what the UI dates the conversion with. */
  rate_date: string | null;
  rate_source: 'ecb' | 'peg' | 'mixed' | 'none';
}

export interface Converted<T> {
  rows: T[];
  meta: ConversionMeta;
}

type Converter = Awaited<ReturnType<typeof makeConverter>>;

export async function converterFor(
  facts: ConversionInput[],
  displayCurrency: string,
): Promise<Converter> {
  return makeConverter(facts, displayCurrency);
}

/** Tracks which rate sources were touched so the UI can label the result. */
export class ConversionTracker {
  private readonly currencies = new Set<string>();
  private pegged = false;
  private ecb = false;
  private latestRateDate: string | null = null;

  constructor(private readonly displayCurrency: string) {}

  note(currency: string, rate: { rateDate: string; source: 'ecb' | 'peg' | 'identity' }): void {
    this.currencies.add(currency);
    if (rate.source === 'peg') this.pegged = true;
    if (rate.source === 'ecb') this.ecb = true;
    if (rate.source !== 'identity') {
      if (!this.latestRateDate || rate.rateDate > this.latestRateDate) {
        this.latestRateDate = rate.rateDate;
      }
    }
  }

  meta(): ConversionMeta {
    const others = [...this.currencies].filter((c) => c !== this.displayCurrency);
    return {
      display_currency: this.displayCurrency,
      source_currencies: [...this.currencies].sort(),
      converted: others.length > 0,
      uses_pegged_rate: this.pegged,
      rate_date: this.latestRateDate,
      rate_source:
        this.pegged && this.ecb ? 'mixed' : this.pegged ? 'peg' : this.ecb ? 'ecb' : 'none',
    };
  }
}

export interface ConvertedInvoice extends InvoiceFact {
  /** Value in the display currency. */
  converted_value: number;
  /** True when the invoice's own currency differs from the display currency. */
  is_converted: boolean;
}

export function convertInvoices(
  facts: InvoiceFact[],
  convert: Converter,
  tracker: ConversionTracker,
  displayCurrency: string,
): ConvertedInvoice[] {
  return facts.map((f) => {
    const { minor, rate } = convert(f.value, f.currency, f.effective_date);
    tracker.note(f.currency, rate);
    return { ...f, converted_value: minor, is_converted: f.currency !== displayCurrency };
  });
}

export interface ServiceTotal {
  service: string;
  total_minor: number;
  invoice_count: number;
}

export function totalsByService(invoices: ConvertedInvoice[]): ServiceTotal[] {
  const map = new Map<string, ServiceTotal>();
  for (const inv of invoices) {
    const e = map.get(inv.service) ?? { service: inv.service, total_minor: 0, invoice_count: 0 };
    e.total_minor += inv.converted_value;
    e.invoice_count += 1;
    map.set(inv.service, e);
  }
  return [...map.values()].sort((a, b) => b.total_minor - a.total_minor);
}

export interface MonthTotal {
  month: string;
  total_minor: number;
  invoice_count: number;
  service_count: number;
}

export function totalsByMonth(invoices: ConvertedInvoice[]): Map<string, MonthTotal> {
  const map = new Map<string, MonthTotal>();
  const services = new Map<string, Set<string>>();
  for (const inv of invoices) {
    const month = inv.effective_date.slice(0, 7);
    const e = map.get(month) ?? { month, total_minor: 0, invoice_count: 0, service_count: 0 };
    e.total_minor += inv.converted_value;
    e.invoice_count += 1;
    map.set(month, e);

    const set = services.get(month) ?? new Set<string>();
    set.add(inv.service);
    services.set(month, set);
  }
  for (const [month, set] of services) {
    const e = map.get(month);
    if (e) e.service_count = set.size;
  }
  return map;
}

export interface CategoryContribution {
  service: string;
  total_minor: number;
  note: string;
}

export interface CategoryTotal {
  category: string;
  total_minor: number;
  services: CategoryContribution[];
}

export interface ServiceContribution {
  category: string;
  total_minor: number;
  note: string;
}

export interface ServiceCategoryTotal {
  service: string;
  total_minor: number;
  categories: ServiceContribution[];
}

interface GroupNode {
  key: string;
  total_minor: number;
  note: string;
}

/**
 * Line items summed into a two-level tree, both levels sorted by size.
 *
 * "Cost of each service within each category" and "cost of each category within
 * each service" are the same operation with the two keys exchanged, over the
 * same rows and the same conversion — so they are one function taking the key
 * extractors, not two implementations that have to be kept agreeing about
 * rounding, sort order and how notes are built. The dimension names are put
 * back on at the edges, where the wire shape wants them.
 */
function groupTwoLevel(
  lineItems: LineItemFact[],
  convert: Converter,
  tracker: ConversionTracker,
  outerOf: (li: LineItemFact) => string,
  innerOf: (li: LineItemFact) => string,
): { key: string; total_minor: number; children: GroupNode[] }[] {
  const tree = new Map<string, Map<string, { total: number; descriptions: string[] }>>();

  // biggest contributors first so the note names the descriptions that matter
  const sorted = [...lineItems].sort((a, b) => b.amount - a.amount);
  for (const li of sorted) {
    const { minor, rate } = convert(li.amount, li.currency, li.effective_date);
    tracker.note(li.currency, rate);

    const inner = tree.get(outerOf(li)) ?? new Map();
    tree.set(outerOf(li), inner);

    const entry = inner.get(innerOf(li)) ?? { total: 0, descriptions: [] };
    entry.total += minor;
    if (entry.descriptions.length < 2 && !entry.descriptions.includes(li.description)) {
      entry.descriptions.push(li.description);
    }
    inner.set(innerOf(li), entry);
  }

  return [...tree.entries()]
    .map(([key, inner]) => {
      const children = [...inner.entries()]
        .map(([childKey, e]) => ({
          key: childKey,
          total_minor: e.total,
          note: e.descriptions.join(' · '),
        }))
        .sort((a, b) => b.total_minor - a.total_minor);
      return {
        key,
        total_minor: children.reduce((s, c) => s + c.total_minor, 0),
        children,
      };
    })
    .sort((a, b) => b.total_minor - a.total_minor);
}

/** Categories, each broken down by the services that contribute to it. */
export function totalsByCategory(
  lineItems: LineItemFact[],
  convert: Converter,
  tracker: ConversionTracker,
): CategoryTotal[] {
  return groupTwoLevel(
    lineItems,
    convert,
    tracker,
    (li) => normalizeCategory(li.category),
    (li) => li.service,
  ).map((node) => ({
    category: node.key,
    total_minor: node.total_minor,
    services: node.children.map((c) => ({
      service: c.key,
      total_minor: c.total_minor,
      note: c.note,
    })),
  }));
}

/**
 * The same spend, pivoted: services, each broken down by category.
 *
 * Totals are identical to `totalsByCategory` summed the other way — the same
 * line items, converted once by the same converter. If the two ever disagree,
 * the grouping is not the thing that broke.
 */
export function totalsByServiceCategory(
  lineItems: LineItemFact[],
  convert: Converter,
  tracker: ConversionTracker,
): ServiceCategoryTotal[] {
  return groupTwoLevel(
    lineItems,
    convert,
    tracker,
    (li) => li.service,
    (li) => normalizeCategory(li.category),
  ).map((node) => ({
    service: node.key,
    total_minor: node.total_minor,
    categories: node.children.map((c) => ({
      category: c.key,
      total_minor: c.total_minor,
      note: c.note,
    })),
  }));
}
