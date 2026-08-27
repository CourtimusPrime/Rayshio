import { describe, expect, it } from 'vitest';
import { classifyDocumentType } from '../../src/queries/document-type.js';

const of = (pdfId: string | null, subject: string | null) =>
  classifyDocumentType({ pdfId, subject });

describe('classifyDocumentType', () => {
  it('calls a row with no attachment an email', () => {
    // The distinction that matters most: there is no document to forward.
    expect(of(null, 'Your invoice from Serper')).toBe('email');
    expect(of(null, 'Google Cloud Platform & APIs: Payment received')).toBe('email');
  });

  it('reads a receipt from the subject when a PDF is attached', () => {
    expect(of('pdf-1', 'Your receipt from Cloudflare')).toBe('receipt');
    expect(of('pdf-1', 'Receipt #1043')).toBe('receipt');
    expect(of('pdf-1', 'Payment received — thank you')).toBe('receipt');
  });

  it('treats an explicit invoice subject as an invoice', () => {
    expect(of('pdf-1', 'Invoice XROFBRAV-0095 from OpenRouter')).toBe('invoice');
  });

  it('defaults an attached document with no signal to invoice', () => {
    // Manual uploads: the subject is the filename and says nothing at all.
    expect(of('pdf-1', '716305cf-ade5-588f-9d03-c1f5b79878cb.pdf')).toBe('invoice');
    expect(of('pdf-1', null)).toBe('invoice');
  });

  it('does not mistake an address for a receipt', () => {
    // `\b` treats `@` as a word boundary, so a naive \breceipts?\b matches the
    // address here and files a plain invoice as a receipt.
    expect(of('pdf-1', 'Invoice from receipts@vendor.com')).toBe('invoice');
  });

  it('prefers the missing attachment over the subject wording', () => {
    // A vendor can call it a receipt and still attach nothing, and "email" is
    // the more useful thing to say about that row.
    expect(of(null, 'Your receipt from Canva')).toBe('email');
  });
});
