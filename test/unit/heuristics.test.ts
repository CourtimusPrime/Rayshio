import { describe, expect, it } from 'vitest';
import { scoreEmail } from '../../src/pipeline/heuristics.js';

const from = (address: string) => ({ name: null, address });

describe('scoreEmail', () => {
  it('accepts a classic invoice email (strong subject + pdf + billing sender)', () => {
    const r = scoreEmail({
      from: from('invoices@neon.tech'),
      subject: 'Your Neon invoice for March 2026',
      hasPdfAttachment: true,
    });
    expect(r.isCandidate).toBe(true);
    expect(r.reasons).toContain('subject:strong');
  });

  it('accepts strong subject alone', () => {
    const r = scoreEmail({
      from: from('someone@corp.com'),
      subject: 'Receipt for your purchase',
      hasPdfAttachment: false,
    });
    expect(r.isCandidate).toBe(true);
  });

  it('rejects a newsletter mentioning invoices', () => {
    const r = scoreEmail({
      from: from('hello@productweekly.io'),
      subject: 'Newsletter: how we cut our invoice processing time',
      hasPdfAttachment: false,
    });
    expect(r.isCandidate).toBe(false);
  });

  it('rejects plain correspondence', () => {
    const r = scoreEmail({
      from: from('colleague@corp.com'),
      subject: 'Meeting notes',
      hasPdfAttachment: false,
      bodyText: 'see you tomorrow',
    });
    expect(r.isCandidate).toBe(false);
    expect(r.score).toBe(0);
  });

  it('accepts weak subject + pdf attachment', () => {
    const r = scoreEmail({
      from: from('team@vendor.com'),
      subject: 'Your subscription renewal',
      hasPdfAttachment: true,
    });
    expect(r.isCandidate).toBe(true);
  });

  it('accepts billing-pattern sender with body hints', () => {
    const r = scoreEmail({
      from: from('billing@stripe.com'),
      subject: 'Stripe',
      hasPdfAttachment: false,
      bodyText: 'Amount paid: $10.00 — thanks for your payment',
    });
    expect(r.isCandidate).toBe(true);
  });
});
