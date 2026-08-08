import { describe, expect, it } from 'vitest';
import {
  DUPLICATE_PREFIX,
  INBOUND_MONEY_REASON,
  NOT_AN_INVOICE_PREFIX,
  NOT_AN_INVOICE_REASON,
  classifyOutcome,
} from '../../src/pipeline/failure-reasons.js';

describe('classifyOutcome', () => {
  it('treats every non-terminal pipeline status as pending', () => {
    for (const status of ['pending', 'classified', 'pdf_fetched']) {
      expect(classifyOutcome(status, null)).toBe('pending');
    }
  });

  it('reports a parsed invoice as added, whatever stale reason it carries', () => {
    // extract-invoice clears failure_reason on success, but a row that failed
    // and was later retried must not be reported by its old reason.
    expect(classifyOutcome('parsed', null)).toBe('added');
    expect(classifyOutcome('parsed', NOT_AN_INVOICE_REASON)).toBe('added');
  });

  it('recognises both of the not-an-invoice reasons the pipeline writes', () => {
    expect(classifyOutcome('failed', NOT_AN_INVOICE_REASON)).toBe('not_invoice');
    expect(classifyOutcome('failed', INBOUND_MONEY_REASON)).toBe('not_invoice');
  });

  it('keeps both not-an-invoice reasons under the prefix the classifier tests', () => {
    // The classifier matches on the prefix, so a reworded reason that drops it
    // would silently start reporting as an unexplained error.
    expect(NOT_AN_INVOICE_REASON.startsWith(NOT_AN_INVOICE_PREFIX)).toBe(true);
    expect(INBOUND_MONEY_REASON.startsWith(NOT_AN_INVOICE_PREFIX)).toBe(true);
  });

  it('recognises a duplicate', () => {
    expect(
      classifyOutcome('failed', `${DUPLICATE_PREFIX}invoice G170490715 already recorded as #3228`),
    ).toBe('duplicate');
  });

  it('falls back to error for pipeline failures and for reasons it does not know', () => {
    expect(classifyOutcome('failed', 'extraction: no usable text (scanned/image-only pdf?)')).toBe(
      'error',
    );
    expect(classifyOutcome('failed', 'reconciliation: sum=100 value=200 tolerance=1')).toBe(
      'error',
    );
    expect(classifyOutcome('failed', 'fetch-pdf: socket hang up')).toBe('error');
    // a crash before the reason was written is still a fault, not a soft outcome
    expect(classifyOutcome('failed', null)).toBe('error');
  });

  it('does not match a reason that merely contains a prefix later in the string', () => {
    expect(classifyOutcome('failed', 'extraction: this is not an invoice: nope')).toBe('error');
  });
});
