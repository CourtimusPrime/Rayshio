import type { NextFunction, Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `orgForApiKey` is a database lookup; everything interesting about this
 * middleware is the part around it — how a key is read off the request, that an
 * unknown key is refused rather than defaulted, and that the legacy env
 * fallback only matches exactly. So the lookup is mocked and the rest is real.
 */
const lookup = vi.hoisted(() => vi.fn<(raw: string) => Promise<number | undefined>>());

vi.mock('../../src/auth/api-keys.js', () => ({ orgForApiKey: lookup }));

const REQUIRED = {
  PGSQL_DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  MONGODB_DATABASE_URL: 'mongodb://localhost:27017/db',
  REDIS_DATABASE_URL: 'redis://localhost:6379',
  GOOGLE_CLIENT_ID: 'id',
  GOOGLE_CLIENT_SECRET: 'secret',
};

let saved: NodeJS.ProcessEnv;

beforeEach(() => {
  saved = { ...process.env };
  Object.assign(process.env, REQUIRED);
  lookup.mockReset();
  lookup.mockResolvedValue(undefined);
  vi.resetModules();
});

afterEach(() => {
  process.env = saved;
});

function mockReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function mockRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Response & typeof res;
}

/** Runs the middleware and resolves once it has either called next() or replied. */
async function run(headers: Record<string, string>) {
  const { apiKeyAuth } = await import('../../src/mcp/auth.js');
  const req = mockReq(headers);
  const res = mockRes();
  let nexted = false;
  let nextErr: unknown;
  const next: NextFunction = (err?: unknown) => {
    nexted = true;
    nextErr = err;
  };

  apiKeyAuth(req, res, next);
  // the middleware body is an async IIFE
  await vi.waitFor(() => {
    if (!nexted && res.statusCode === 0) throw new Error('pending');
  });
  return { req, res, nexted, nextErr };
}

describe('apiKeyAuth', () => {
  it('accepts a Bearer token and attaches the org it resolved to', async () => {
    lookup.mockResolvedValue(42);
    const { req, res, nexted } = await run({ authorization: 'Bearer imcp_abc' });
    expect(lookup).toHaveBeenCalledWith('imcp_abc');
    expect(nexted).toBe(true);
    expect(res.statusCode).toBe(0);
    expect(req.mcpOrgId).toBe(42);
  });

  it('accepts x-api-key, because published client configs use it', async () => {
    lookup.mockResolvedValue(7);
    const { req, nexted } = await run({ 'x-api-key': 'imcp_xyz' });
    expect(nexted).toBe(true);
    expect(req.mcpOrgId).toBe(7);
  });

  it('refuses a request with no key', async () => {
    const { res, nexted } = await run({});
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('refuses an unknown key rather than falling back to an org', async () => {
    lookup.mockResolvedValue(undefined);
    const { req, res, nexted } = await run({ authorization: 'Bearer nope' });
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(req.mcpOrgId).toBeUndefined();
  });

  it('answers 401 in JSON-RPC shape, since the caller is an MCP client', async () => {
    const { res } = await run({});
    expect(res.body).toMatchObject({
      jsonrpc: '2.0',
      error: { code: -32001 },
      id: null,
    });
  });

  it('does not treat a malformed Authorization header as a key', async () => {
    // "Basic ..." is not ours, and slicing it blindly would send garbage to the
    // lookup — or worse, match a legacy key by accident.
    const { res, nexted } = await run({ authorization: 'Basic aGk6dGhlcmU=' });
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('prefers a database key over the legacy env fallback', async () => {
    process.env.MCP_API_KEY = 'k'.repeat(24);
    process.env.MCP_LEGACY_KEY_ORG_ID = '1';
    lookup.mockResolvedValue(99);
    const { req } = await run({ authorization: `Bearer ${'k'.repeat(24)}` });
    expect(req.mcpOrgId).toBe(99);
  });

  it('accepts the legacy env key only on an exact match', async () => {
    process.env.MCP_API_KEY = 'k'.repeat(24);
    process.env.MCP_LEGACY_KEY_ORG_ID = '5';
    lookup.mockResolvedValue(undefined);

    const ok = await run({ authorization: `Bearer ${'k'.repeat(24)}` });
    expect(ok.req.mcpOrgId).toBe(5);

    // A prefix of the real key must not pass. The length check in keysMatch is
    // what stops timingSafeEqual throwing on mismatched buffers, so this also
    // guards against a 500-instead-of-401.
    vi.resetModules();
    const short = await run({ authorization: `Bearer ${'k'.repeat(23)}` });
    expect(short.res.statusCode).toBe(401);
    expect(short.nextErr).toBeUndefined();
  });
});

describe('orgForRequest', () => {
  it('returns the org apiKeyAuth resolved', async () => {
    const { orgForRequest } = await import('../../src/mcp/auth.js');
    expect(orgForRequest({ mcpOrgId: 3 } as unknown as Request)).toBe(3);
  });

  it('throws rather than degrading into org 1', async () => {
    // A tool server built for "no particular org" would read across tenants.
    const { orgForRequest } = await import('../../src/mcp/auth.js');
    expect(() => orgForRequest({} as unknown as Request)).toThrow(/apiKeyAuth did not run/);
  });
});
