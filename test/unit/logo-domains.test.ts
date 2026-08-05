import { describe, expect, it } from 'vitest';
import { logoDomainFor, normalizeVendor, registrableDomain } from '../../src/logos/domains.js';

describe('registrableDomain', () => {
  it('strips subdomains', () => {
    expect(registrableDomain('ar.neon.tech')).toBe('neon.tech');
    expect(registrableDomain('notify.cloudflare.com')).toBe('cloudflare.com');
  });

  it('keeps three labels for a two-label public suffix', () => {
    // without this, 123-reg.co.uk collapses to the suffix itself
    expect(registrableDomain('123-reg.co.uk')).toBe('123-reg.co.uk');
    expect(registrableDomain('mail.example.com.au')).toBe('example.com.au');
  });

  it('rejects a bare suffix or hostless string', () => {
    expect(registrableDomain('co.uk')).toBeUndefined();
    expect(registrableDomain('localhost')).toBeUndefined();
  });
});

describe('logoDomainFor', () => {
  it('takes the domain from the sender when the vendor mails directly', () => {
    expect(logoDomainFor('Neon', 'noreply@ar.neon.tech')).toBe('neon.tech');
    expect(logoDomainFor('Telnyx', 'portal@telnyx.com')).toBe('telnyx.com');
    expect(logoDomainFor('Google Cloud', 'cloudplatform-noreply@google.com')).toBe('google.com');
  });

  it('ignores a plus-addressed local part', () => {
    expect(logoDomainFor('Anthropic', 'invoice+statements@mail.anthropic.com')).toBe(
      'anthropic.com',
    );
  });

  it('prefers an override over the sender for vendors that bill via a processor', () => {
    // the sender is Stripe; without the override this renders Stripe's logo
    expect(logoDomainFor('Railway Corporation', 'invoice+statements+acct_1hn@stripe.com')).toBe(
      'railway.app',
    );
    expect(logoDomainFor('Serper', 'help@paddle.com')).toBe('serper.dev');
  });

  it('refuses a processor sender with no override rather than guess', () => {
    expect(logoDomainFor('Some New Vendor', 'notifications@stripe.com')).toBeUndefined();
    expect(logoDomainFor('Another Vendor', 'billing@paddle.com')).toBeUndefined();
  });

  it('matches an override regardless of case and spacing', () => {
    expect(logoDomainFor('  VOLERO   AI ', 'notifications@stripe.com')).toBe('volero.ai');
  });

  it('returns nothing for a malformed sender', () => {
    expect(logoDomainFor('Nobody', 'not-an-address')).toBeUndefined();
  });
});

describe('normalizeVendor', () => {
  it('collapses case and whitespace so both sides key alike', () => {
    expect(normalizeVendor('  Google   Cloud  ')).toBe('google cloud');
  });
});
