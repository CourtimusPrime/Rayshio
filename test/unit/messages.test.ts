import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAddress, parseMessage } from '../../src/gmail/messages.js';

function fixture(name: string) {
  return JSON.parse(
    readFileSync(join(import.meta.dirname, '../fixtures/emails', `${name}.json`), 'utf8'),
  );
}

describe('parseAddress', () => {
  it('parses display-name form', () => {
    expect(parseAddress('Neon <invoices@neon.tech>')).toEqual({
      name: 'Neon',
      address: 'invoices@neon.tech',
    });
  });
  it('parses bare address and lowercases', () => {
    expect(parseAddress('Billing@Stripe.com')).toEqual({
      name: null,
      address: 'billing@stripe.com',
    });
  });
  it('parses quoted display name', () => {
    expect(parseAddress('"AWS Billing" <no-reply@aws.amazon.com>')).toEqual({
      name: 'AWS Billing',
      address: 'no-reply@aws.amazon.com',
    });
  });
});

describe('parseMessage', () => {
  it('extracts headers, body, and PDF attachment from invoice fixture', () => {
    const parsed = parseMessage(fixture('neon-invoice'));
    expect(parsed.messageId).toBe('18f2a3b4c5d6e7f8');
    expect(parsed.from).toEqual({ name: 'Neon', address: 'invoices@neon.tech' });
    expect(parsed.recipients).toEqual(['techteam@nczgroup.com']);
    expect(parsed.subject).toBe('Your Neon invoice for March 2026');
    expect(parsed.hasPdfAttachment).toBe(true);
    expect(parsed.pdfAttachments).toEqual([
      { attachmentId: 'ANGjdJ8w_attachment_id', filename: 'neon-invoice-2026-03.pdf' },
    ]);
    expect(parsed.bodyText).toContain('Amount due: $42.17');
    expect(parsed.deliveredAt.getTime()).toBe(1743500000000);
  });

  it('falls back to stripped html body when no text/plain part', () => {
    const parsed = parseMessage(fixture('newsletter'));
    expect(parsed.hasPdfAttachment).toBe(false);
    expect(parsed.bodyText).toContain('A story about invoices');
    expect(parsed.bodyText).not.toContain('<a');
  });
});
