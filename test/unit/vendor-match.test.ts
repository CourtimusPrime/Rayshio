import { describe, expect, it } from 'vitest';
import { vendorMatchKey } from '../../src/pipeline/uploads.js';

/**
 * The failure this guards against is not cosmetic. An uploaded PDF says
 * "Neon Inc." while the service created from the sending address is "Neon";
 * without normalization the upload creates a second vendor row and that
 * vendor's spend is split across two entries in every breakdown.
 */
describe('vendorMatchKey', () => {
  it('matches a legal suffix against the plain trading name', () => {
    expect(vendorMatchKey('Neon Inc.')).toBe(vendorMatchKey('Neon'));
  });

  it('is case- and punctuation-insensitive', () => {
    expect(vendorMatchKey('ANTHROPIC, PBC')).toBe(vendorMatchKey('Anthropic'));
  });

  it.each([
    ['Vercel Inc', 'Vercel'],
    ['Supabase, Inc.', 'supabase'],
    ['Cloudflare, Inc.', 'CLOUDFLARE'],
    ['Railway Corporation', 'Railway'],
    ['Something Ltd', 'Something'],
    ['Example GmbH', 'example'],
  ])('reduces %s to %s', (full, plain) => {
    expect(vendorMatchKey(full)).toBe(vendorMatchKey(plain));
  });

  it('keeps distinct vendors distinct', () => {
    expect(vendorMatchKey('Neon')).not.toBe(vendorMatchKey('Notion'));
    expect(vendorMatchKey('Google Cloud')).not.toBe(vendorMatchKey('Google Workspace'));
  });

  /** A suffix is only a suffix when something precedes it. */
  it('does not strip a name that is only a suffix word', () => {
    expect(vendorMatchKey('Co')).toBe('co');
    expect(vendorMatchKey('Limited')).toBe('limited');
  });

  it('collapses whitespace', () => {
    expect(vendorMatchKey('  Amazon   Web  Services  ')).toBe('amazon web services');
  });
});
