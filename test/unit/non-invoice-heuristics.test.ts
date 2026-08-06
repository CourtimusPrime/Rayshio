import { describe, expect, it } from 'vitest';
import { scoreEmail } from '../../src/pipeline/heuristics.js';

/**
 * Regression cover for the sender-trust bug.
 *
 * The heuristic used to run only for mail from *unconfirmed* senders, so once a
 * vendor became a known billing sender every announcement it sent was ingested
 * as an invoice unread. That put 77 zero-value rows into 275 invoices and
 * phantom vendors into the breakdowns.
 *
 * Every subject below is real, taken from the production mailbox.
 */

function score(subject: string, from: string, opts?: { pdf?: boolean; body?: string }) {
  return scoreEmail({
    from: { address: from, name: null },
    subject,
    hasPdfAttachment: opts?.pdf ?? false,
    bodyText: opts?.body,
  });
}

describe('non-invoice rejection', () => {
  it.each([
    [
      '[Product Update] Google Cloud: Update to default resource-based CUD sharing',
      'cloudplatform-noreply@google.com',
    ],
    [
      '[Legal Update] Quarterly reminder about Google Cloud Platform Terms',
      'cloudplatform-noreply@google.com',
    ],
    [
      '[Action Advised] Review IAM new permissions for multiple Google Cloud services',
      'cloudplatform-noreply@google.com',
    ],
    [
      '[Reminder] Legacy SQL will no longer be available in BigQuery after June',
      'cloudplatform-noreply@google.com',
    ],
    ['Your Doppler workplace is ready to go!', 'hello@doppler.com'],
    ['Passkey authentication added to your Canva account', 'no-reply@account.canva.com'],
    ['Success: You’re in!', 'noreply@edgeimaging.ca'],
  ])('rejects %s', (subject, from) => {
    expect(score(subject, from).isCandidate).toBe(false);
  });

  /*
   * These mention billing but are configuration notices, not bills. They score
   * on the weak subject pattern alone, which is below the threshold — the
   * margin that keeps them out is one point, so this guards it.
   */
  it.each([
    ['Doppler Confirmation: Payment Method Successfully Added', 'hello@doppler.com'],
    ['Billing Email Change Initiated', 'hello@doppler.com'],
    ['Workplace billing email has been updated', 'hello@doppler.com'],
  ])('rejects the billing-adjacent notice %s', (subject, from) => {
    const result = score(subject, from);
    expect(result.isCandidate).toBe(false);
    expect(result.score).toBeLessThan(2);
  });

  it.each([
    ['Your OpenRouter, Inc receipt [#1076-5177]', 'receipts@openrouter.ai'],
    ['Your receipt from Railway Corporation #2496-3137', 'invoice+statements+acct_1@stripe.com'],
    ['Your Serper receipt', 'help@paddle.com'],
    ['Invoice INV-2026-001 from Neon', 'invoice@neon.tech'],
  ])('still accepts the real invoice %s', (subject, from) => {
    expect(score(subject, from).isCandidate).toBe(true);
  });

  /**
   * A PDF attachment from a billing-pattern sender clears the bar on its own.
   * Vendors whose subject is just "Your document" would otherwise be lost.
   */
  it('accepts a PDF from a billing sender with an unhelpful subject', () => {
    expect(score('Your document', 'billing@vendor.example', { pdf: true }).isCandidate).toBe(true);
  });
});
