import { describe, expect, it } from 'vitest';
import { changePercent, displayStatus } from '../../src/api/serializers.js';
import { normalizeCategory } from '../../src/categories.js';

describe('displayStatus', () => {
  it('collapses every in-flight pipeline state to pending', () => {
    expect(displayStatus('pending')).toBe('pending');
    expect(displayStatus('classified')).toBe('pending');
    expect(displayStatus('pdf_fetched')).toBe('pending');
  });

  it('passes through terminal states', () => {
    expect(displayStatus('parsed')).toBe('parsed');
    expect(displayStatus('failed')).toBe('failed');
  });
});

describe('changePercent', () => {
  it('returns null when there is no prior figure', () => {
    expect(changePercent(100, 0)).toBeNull();
  });

  it('computes signed change', () => {
    expect(changePercent(150, 100)).toBeCloseTo(50);
    expect(changePercent(50, 100)).toBeCloseTo(-50);
  });
});

describe('normalizeCategory', () => {
  it('maps unclassified line items to other', () => {
    expect(normalizeCategory(null)).toBe('other');
    expect(normalizeCategory(undefined)).toBe('other');
    expect(normalizeCategory('Nonsense')).toBe('other');
  });

  it('preserves known categories', () => {
    expect(normalizeCategory('storage')).toBe('storage');
    expect(normalizeCategory('ai_invocations')).toBe('ai_invocations');
  });

  it('rejects the superseded title-case taxonomy', () => {
    // migration 0003 remapped these; anything still using them is stale
    expect(normalizeCategory('Databases')).toBe('other');
    expect(normalizeCategory('AI invocations')).toBe('other');
  });
});
