import { describe, expect, it } from 'vitest';
import { senderQuery } from '../../src/gmail/search.js';

describe('senderQuery', () => {
  it('matches the address alone when no vendor name is known', () => {
    expect(senderQuery('invoices@neon.tech')).toBe('from:invoices@neon.tech -in:spam -in:trash');
  });

  it('also matches the display name, which is all a group forward preserves', () => {
    // messages arriving via a Google Group have the group as From:, so the
    // address clause matches nothing and the name clause does the work
    expect(senderQuery('receipts@openrouter.ai', 'OpenRouter, Inc')).toBe(
      '(from:receipts@openrouter.ai OR from:"OpenRouter, Inc") -in:spam -in:trash',
    );
  });

  it('appends the incremental watermark', () => {
    expect(senderQuery('receipts@openrouter.ai', 'OpenRouter, Inc', 1750000000)).toBe(
      '(from:receipts@openrouter.ai OR from:"OpenRouter, Inc") -in:spam -in:trash after:1750000000',
    );
  });

  it('skips a name that would add nothing or break the query', () => {
    expect(senderQuery('a@b.com', 'a@b.com')).toBe('from:a@b.com -in:spam -in:trash');
    expect(senderQuery('a@b.com', '  ')).toBe('from:a@b.com -in:spam -in:trash');
    expect(senderQuery('a@b.com', null)).toBe('from:a@b.com -in:spam -in:trash');
    expect(senderQuery('a@b.com', 'Weird "Vendor"')).toBe('from:a@b.com -in:spam -in:trash');
  });
});
