import { beforeAll, describe, expect, it } from 'vitest';

// The module reads BETTER_AUTH_SECRET through requireConfig at call time, and
// config.ts parses process.env at import time — so the secret has to exist
// before the import, not before the test.
process.env.BETTER_AUTH_SECRET ??= 'x'.repeat(40);

let mintConnectState: (orgId: number) => string;
let verifyConnectState: (state: string) => number | undefined;

beforeAll(async () => {
  const mod = await import('../../src/gmail/connect.js');
  mintConnectState = mod.mintConnectState;
  verifyConnectState = mod.verifyConnectState;
});

describe('connect state', () => {
  it('round-trips the org id', () => {
    expect(verifyConnectState(mintConnectState(7))).toBe(7);
  });

  it('is unguessable per call, so one state cannot be predicted from another', () => {
    expect(mintConnectState(1)).not.toBe(mintConnectState(1));
  });

  it('rejects a tampered org id', () => {
    // Re-encode the payload with a different org, keeping the original MAC —
    // the attack the signature exists to stop: attaching a mailbox to an org
    // the operator never authorised.
    const [payload, mac] = mintConnectState(1).split('.');
    const claims = JSON.parse(Buffer.from(payload as string, 'base64url').toString());
    claims.orgId = 999;
    const forged = Buffer.from(JSON.stringify(claims)).toString('base64url');
    expect(verifyConnectState(`${forged}.${mac}`)).toBeUndefined();
  });

  it('rejects a bad or absent signature', () => {
    const [payload] = mintConnectState(1).split('.');
    expect(verifyConnectState(`${payload}.not-the-mac`)).toBeUndefined();
    expect(verifyConnectState(payload as string)).toBeUndefined();
    expect(verifyConnectState('')).toBeUndefined();
    expect(verifyConnectState('...')).toBeUndefined();
  });

  it('rejects an expired state', () => {
    // Expiry is inside the signed payload, so a stale state cannot be revived
    // without the secret. Built by hand rather than by waiting out the TTL.
    const past = Buffer.from(JSON.stringify({ orgId: 1, exp: Date.now() - 1000 })).toString(
      'base64url',
    );
    expect(verifyConnectState(`${past}.anything`)).toBeUndefined();
  });

  it('rejects a payload that is not JSON', () => {
    expect(verifyConnectState(`${Buffer.from('nope').toString('base64url')}.x`)).toBeUndefined();
  });
});
