import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

// hashKey is pure, but the module imports the db client at load time.
vi.mock('../../src/db/client.js', () => ({ db: {}, pool: {} }));

const { hashKey } = await import('../../src/auth/api-keys.js');

describe('hashKey', () => {
  it('is sha256 hex — only the digest is ever stored', () => {
    const raw = 'imcp_example';
    expect(hashKey(raw)).toBe(createHash('sha256').update(raw).digest('hex'));
    expect(hashKey(raw)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable, so a key keeps resolving across restarts', () => {
    expect(hashKey('imcp_a')).toBe(hashKey('imcp_a'));
  });

  it('separates keys that differ by one character', () => {
    expect(hashKey('imcp_a')).not.toBe(hashKey('imcp_b'));
  });

  it('does not contain the raw key', () => {
    // The point of storing a digest: a leaked database yields no usable key.
    const raw = 'imcp_super-secret-value';
    expect(hashKey(raw)).not.toContain('super-secret');
  });
});
