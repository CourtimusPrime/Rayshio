import { describe, expect, it } from 'vitest';
import { claimableDomain, emailDomain, isPublicEmailDomain } from '../../src/auth/domain.js';

describe('emailDomain', () => {
  it('lowercases and trims', () => {
    expect(emailDomain('Alice@Acme.COM')).toBe('acme.com');
    expect(emailDomain('  alice@acme.com  ')).toBe('acme.com');
  });

  it.each([
    '',
    'no-at-sign',
    '@acme.com',
    'a@',
    'a@b@acme.com',
    'a@localhost',
    'a@acme..com',
    'a@.acme.com',
    'a@acme.com.',
    'a b@acme.com',
  ])('rejects %j', (value) => {
    expect(emailDomain(value)).toBeUndefined();
  });
});

describe('isPublicEmailDomain', () => {
  it.each([
    'gmail.com',
    'googlemail.com',
    'outlook.com',
    'hotmail.com',
    'live.com',
    'yahoo.com',
    'icloud.com',
    'me.com',
    'proton.me',
    'protonmail.com',
    'aol.com',
    'gmx.de',
    'gmx.net',
    'yahoo.co.uk',
    'hotmail.fr',
  ])('treats %s as public', (domain) => {
    expect(isPublicEmailDomain(domain)).toBe(true);
  });

  it.each(['acme.com', 'gmx-consulting.com', 'mail.acme.com'])('treats %s as private', (domain) => {
    expect(isPublicEmailDomain(domain)).toBe(false);
  });
});

describe('claimableDomain', () => {
  it('accepts a verified company address', () => {
    expect(claimableDomain('ops@acme.com', true)).toEqual({ ok: true, domain: 'acme.com' });
  });

  it('refuses an unverified address', () => {
    expect(claimableDomain('ops@acme.com', false)).toEqual({
      ok: false,
      reason: 'unverified',
      domain: 'acme.com',
    });
  });

  it('refuses a public provider', () => {
    expect(claimableDomain('x@gmail.com', true)).toEqual({
      ok: false,
      reason: 'public-provider',
      domain: 'gmail.com',
    });
  });

  it('refuses a malformed address', () => {
    expect(claimableDomain('broken', true)).toEqual({
      ok: false,
      reason: 'malformed',
      domain: null,
    });
  });

  it('reports a public provider ahead of unverified', () => {
    expect(claimableDomain('x@gmail.com', false)).toMatchObject({
      ok: false,
      reason: 'public-provider',
    });
  });
});
