import { describe, expect, it } from 'vitest';
import { cleanDisplayName, resolveSender } from '../../src/gmail/messages.js';

describe('cleanDisplayName', () => {
  it("strips the Google Group 'via' suffix and quoting", () => {
    expect(cleanDisplayName("'OpenRouter, Inc' via Tech Team")).toBe('OpenRouter, Inc');
    expect(cleanDisplayName("'Railway' via Tech Team")).toBe('Railway');
  });

  it('leaves ordinary display names alone', () => {
    expect(cleanDisplayName('Railway Corporation')).toBe('Railway Corporation');
    expect(cleanDisplayName(null)).toBeNull();
  });

  it('does not mangle a vendor name that merely contains "via"', () => {
    expect(cleanDisplayName('Viacom')).toBe('Viacom');
  });
});

describe('resolveSender', () => {
  it('attributes group-forwarded mail to the original vendor, not the alias', () => {
    const sender = resolveSender(
      `"'OpenRouter, Inc' via Tech Team" <techteam@nczgroup.com>`,
      'receipts@openrouter.ai',
    );
    expect(sender.address).toBe('receipts@openrouter.ai');
    expect(sender.name).toBe('OpenRouter, Inc');
    expect(sender.deliveredVia).toBe('techteam@nczgroup.com');
  });

  it('leaves directly delivered mail untouched', () => {
    const sender = resolveSender('Railway Corporation <invoice+statements@stripe.com>', null);
    expect(sender.address).toBe('invoice+statements@stripe.com');
    expect(sender.name).toBe('Railway Corporation');
    expect(sender.deliveredVia).toBeNull();
  });

  it('ignores X-Original-Sender when it matches From', () => {
    const sender = resolveSender('Neon <invoices@neon.tech>', 'invoices@neon.tech');
    expect(sender.address).toBe('invoices@neon.tech');
    expect(sender.deliveredVia).toBeNull();
  });

  it('falls back to From when X-Original-Sender is not an address', () => {
    const sender = resolveSender('Neon <invoices@neon.tech>', 'not-an-address');
    expect(sender.address).toBe('invoices@neon.tech');
    expect(sender.deliveredVia).toBeNull();
  });

  it('uses the original sender name when the alias carries no display name', () => {
    const sender = resolveSender(
      '<techteam@nczgroup.com>',
      'Cloudflare <noreply@notify.cloudflare.com>',
    );
    expect(sender.address).toBe('noreply@notify.cloudflare.com');
    expect(sender.name).toBe('Cloudflare');
  });
});
