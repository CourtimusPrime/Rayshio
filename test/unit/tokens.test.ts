import { describe, expect, it } from 'vitest';

process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

const { encryptToken, decryptToken } = await import('../../src/crypto/tokens.js');

describe('token crypto', () => {
  it('round-trips', () => {
    const secret = '1//0abc-refresh-token-value';
    const stored = encryptToken(secret);
    expect(stored).toMatch(/^v1:/);
    expect(stored).not.toContain(secret);
    expect(decryptToken(stored)).toBe(secret);
  });

  it('produces distinct ciphertexts per call (random IV)', () => {
    expect(encryptToken('same')).not.toBe(encryptToken('same'));
  });

  it('rejects tampered ciphertext (GCM auth)', () => {
    const stored = encryptToken('secret');
    const parts = stored.split(':');
    const data = Buffer.from(parts[3] as string, 'base64');
    if (data[0] !== undefined) data[0] ^= 0xff;
    parts[3] = data.toString('base64');
    expect(() => decryptToken(parts.join(':'))).toThrow();
  });

  it('rejects unknown version', () => {
    expect(() => decryptToken('v9:a:b:c')).toThrow(/unsupported/);
  });
});
