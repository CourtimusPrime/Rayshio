import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { serviceLines, subjectFor, textBody } from '../../src/accountant/message.js';
import {
  archiveFilename,
  buildPackage,
  invoiceFilename,
  summarize,
  uniqueFilenames,
} from '../../src/accountant/package.js';
import type { PackagedInvoice } from '../../src/accountant/package.js';
import type { UntrackedInvoice } from '../../src/queries/accountant.js';

const inv = (
  o: Partial<UntrackedInvoice> = {},
): UntrackedInvoice & { converted_value: number } => ({
  invoice_id: 1,
  service: 'Acme',
  invoice_number: 'INV-1',
  currency: 'USD',
  value: 1000,
  effective_date: '2026-03-15',
  pdf_id: 'pdf-1',
  ...o,
  converted_value: (o as { converted_value?: number }).converted_value ?? o.value ?? 1000,
});

const packaged = (o: Partial<PackagedInvoice> = {}): PackagedInvoice => ({
  ...inv(o as Partial<UntrackedInvoice>),
  filename: 'x.pdf',
  ...o,
});

/** Every invoice's PDF is one byte per unit of `size`, so limits are exact. */
function loader(size = 10): (id: string) => Promise<Buffer> {
  return async (id) => {
    if (id === 'missing') throw new Error('gone from GridFS');
    return Buffer.alloc(size, 1);
  };
}

describe('invoiceFilename', () => {
  it('leads with the date so lexical order is chronological order', () => {
    expect(invoiceFilename(inv({ effective_date: '2026-03-15' }))).toBe(
      '2026-03-15_Acme_INV-1.pdf',
    );
  });

  it('collapses characters that would become directories or break tooling', () => {
    const name = invoiceFilename(inv({ service: 'Acme / Widgets & Co', invoice_number: 'A/B 12' }));
    expect(name).not.toContain('/');
    expect(name).toBe('2026-03-15_Acme-Widgets-Co_A-B-12.pdf');
  });

  it('degrades to the date when the vendor name does not survive sanitising', () => {
    // A name written entirely in characters we strip must not leave the
    // separator behind as `2026-03-15_.pdf`.
    expect(invoiceFilename(inv({ invoice_id: 42, service: '///', invoice_number: null }))).toBe(
      '2026-03-15.pdf',
    );
  });
});

describe('uniqueFilenames', () => {
  /*
   * The failure this prevents is silent: a zip with two identical entry names
   * extracts as one file in most tools, so an invoice disappears between
   * Rayshio and the accountant with nothing anywhere reporting a problem.
   */
  it('disambiguates same-vendor, same-day invoices with no invoice number', () => {
    const names = uniqueFilenames([
      inv({ invoice_id: 1, invoice_number: null }),
      inv({ invoice_id: 2, invoice_number: null }),
    ]);
    expect(names.get(1)).not.toBe(names.get(2));
    expect(names.get(2)).toContain('_2.pdf');
  });
});

describe('summarize', () => {
  it('reports the range, the vendor count and the converted total', () => {
    const summary = summarize(
      [
        packaged({ invoice_id: 1, service: 'Acme', effective_date: '2026-01-05', value: 1000 }),
        packaged({ invoice_id: 2, service: 'Beta', effective_date: '2026-03-20', value: 2500 }),
        packaged({ invoice_id: 3, service: 'Acme', effective_date: '2026-02-10', value: 500 }),
      ],
      'GBP',
    );
    expect(summary).toEqual({
      invoice_count: 3,
      service_count: 2,
      period_start: '2026-01-05',
      period_end: '2026-03-20',
      total_minor: 4000,
      currency: 'GBP',
    });
  });

  it('counts a credit note into the total rather than dropping it', () => {
    const summary = summarize(
      [packaged({ invoice_id: 1, value: 5000 }), packaged({ invoice_id: 2, value: -2000 })],
      'USD',
    );
    expect(summary.total_minor).toBe(3000);
    expect(summary.invoice_count).toBe(2);
  });
});

describe('buildPackage', () => {
  it('puts one entry per invoice in the archive, named as the manifest says', async () => {
    const pkg = await buildPackage({
      invoices: [
        inv({ invoice_id: 1, invoice_number: 'A-1' }),
        inv({ invoice_id: 2, invoice_number: 'A-2', pdf_id: 'pdf-2' }),
      ],
      currency: 'USD',
      loadPdf: loader(),
    });

    const zip = await JSZip.loadAsync(pkg.zip);
    expect(Object.keys(zip.files).sort()).toEqual(pkg.included.map((i) => i.filename).sort());
    expect(pkg.deferred).toHaveLength(0);
  });

  it('includes a body-text invoice in the totals but not the archive', async () => {
    const pkg = await buildPackage({
      invoices: [inv({ invoice_id: 1, pdf_id: null })],
      currency: 'USD',
      loadPdf: loader(),
    });

    const zip = await JSZip.loadAsync(pkg.zip);
    expect(Object.keys(zip.files)).toHaveLength(0);
    expect(pkg.withoutPdf).toHaveLength(1);
    // still counted, so the outstanding figure can reach zero
    expect(pkg.summary.invoice_count).toBe(1);
  });

  it('treats a blob missing from storage as an invoice without a PDF', async () => {
    const pkg = await buildPackage({
      invoices: [inv({ invoice_id: 1, pdf_id: 'missing' })],
      currency: 'USD',
      loadPdf: loader(),
    });
    expect(pkg.withoutPdf).toHaveLength(1);
    expect(pkg.included).toHaveLength(1);
  });

  it('defers the overflow oldest-first and keeps date order intact', async () => {
    /*
     * The second invoice fills the archive. The third is small enough to fit in
     * the remaining space, and must still be deferred — slipping it in would
     * hand the accountant a batch that skips a date and then doubles back.
     */
    const pkg = await buildPackage({
      invoices: [
        inv({ invoice_id: 1, effective_date: '2026-01-01' }),
        inv({ invoice_id: 2, effective_date: '2026-02-01' }),
        inv({ invoice_id: 3, effective_date: '2026-03-01' }),
      ],
      currency: 'USD',
      loadPdf: loader(10),
      maxBytes: 15,
    });

    expect(pkg.included.map((i) => i.invoice_id)).toEqual([1]);
    expect(pkg.deferred.map((i) => i.invoice_id)).toEqual([2, 3]);
    expect(pkg.summary.invoice_count).toBe(1);
  });

  it('caps a first send from a long history, deferring the rest in order', async () => {
    // The byte ceiling alone would let ~800 invoices into one request; the
    // count ceiling is what keeps a first send from a years-old mailbox inside
    // an HTTP request's lifetime.
    const pkg = await buildPackage({
      invoices: Array.from({ length: 10 }, (_, i) =>
        inv({ invoice_id: i + 1, effective_date: `2026-01-0${(i % 9) + 1}` }),
      ),
      currency: 'USD',
      loadPdf: loader(1),
      maxInvoices: 4,
    });

    expect(pkg.included.map((i) => i.invoice_id)).toEqual([1, 2, 3, 4]);
    expect(pkg.deferred).toHaveLength(6);
    // nothing is dropped: included + deferred is the whole batch
    expect(pkg.included.length + pkg.deferred.length).toBe(10);
  });

  it('sends one oversized invoice rather than nothing at all', async () => {
    const pkg = await buildPackage({
      invoices: [inv({ invoice_id: 1 })],
      currency: 'USD',
      loadPdf: loader(100),
      maxBytes: 10,
    });
    expect(pkg.included.map((i) => i.invoice_id)).toEqual([1]);
    expect(pkg.deferred).toHaveLength(0);
  });
});

describe('archiveFilename', () => {
  it('names the archive after the range it covers', () => {
    expect(
      archiveFilename({
        invoice_count: 2,
        service_count: 1,
        period_start: '2026-01-05',
        period_end: '2026-03-20',
        total_minor: 0,
        currency: 'USD',
      }),
    ).toBe('rayshio-invoices_2026-01-05_2026-03-20.zip');
  });

  it('does not repeat a single-day range', () => {
    expect(
      archiveFilename({
        invoice_count: 1,
        service_count: 1,
        period_start: '2026-01-05',
        period_end: '2026-01-05',
        total_minor: 0,
        currency: 'USD',
      }),
    ).toBe('rayshio-invoices_2026-01-05.zip');
  });
});

describe('covering note', () => {
  const message = {
    summary: {
      invoice_count: 3,
      service_count: 2,
      period_start: '2026-01-05',
      period_end: '2026-03-20',
      total_minor: 12345,
      currency: 'GBP',
    },
    invoices: [
      packaged({ invoice_id: 1, service: 'Acme', value: 10000 }),
      packaged({ invoice_id: 2, service: 'Beta', value: 2000 }),
      packaged({ invoice_id: 3, service: 'Acme', value: 345 }),
    ],
    archiveName: 'rayshio-invoices_2026-01-05_2026-03-20.zip',
    deferredCount: 0,
    withoutPdf: [],
  };

  it('states the three headline facts', () => {
    const body = textBody(message);
    expect(body).toContain('2026-01-05 to 2026-03-20');
    expect(body).toContain('Services:  2');
    expect(body).toContain('123.45 GBP');
  });

  it('rolls vendors up biggest first', () => {
    expect(serviceLines(message.invoices).map((l) => l.service)).toEqual(['Acme', 'Beta']);
    expect(serviceLines(message.invoices)[0]?.count).toBe(2);
  });

  it('says so when totals were converted', () => {
    expect(textBody({ ...message, sourceCurrencies: ['GBP', 'USD'] })).toContain(
      'billed in USD were converted',
    );
  });

  it('accounts for invoices the recipient will not find in the archive', () => {
    const body = textBody({
      ...message,
      withoutPdf: [packaged({ invoice_id: 9, service: 'Gamma', value: 500 })],
      deferredCount: 4,
    });
    expect(body).toContain('had no PDF to attach');
    expect(body).toContain('4 further invoices');
  });

  it('puts the count and the period in the subject', () => {
    expect(subjectFor({ ...message, workspaceName: 'NCZ' })).toBe(
      'NCZ — 3 invoices, 2026-01-05 to 2026-03-20',
    );
  });
});
