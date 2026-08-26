import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `config.ts` parses `process.env` once at import and caches the result, so
 * each case has to reset the module registry and re-import rather than mutating
 * a live object. The env is restored afterwards because vitest shares one
 * process across files.
 */
const REQUIRED = {
  PGSQL_DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  MONGODB_DATABASE_URL: 'mongodb://localhost:27017/db',
  REDIS_DATABASE_URL: 'redis://localhost:6379',
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
};

let saved: NodeJS.ProcessEnv;

beforeEach(() => {
  saved = { ...process.env };
  vi.resetModules();
  // A stray .env on the developer's machine must not decide the outcome.
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('VITE_') || k.startsWith('GOOGLE_') || k.endsWith('_DATABASE_URL')) {
      delete process.env[k];
    }
  }
  Object.assign(process.env, REQUIRED);
});

afterEach(() => {
  process.env = saved;
});

async function load() {
  return import('../../src/config.js');
}

describe('derived public URLs', () => {
  it('derives the callback and MCP endpoint from the one origin', async () => {
    process.env.VITE_PUBLIC_ORIGIN = 'https://rayshio.example.com';
    const c = await load();
    expect(c.publicOrigin).toBe('https://rayshio.example.com');
    expect(c.googleRedirectUri).toBe('https://rayshio.example.com/oauth/callback');
    expect(c.publicMcpUrl).toBe('https://rayshio.example.com/mcp');
  });

  it('tolerates a trailing slash on the origin', async () => {
    // Pasting a URL out of a browser bar is the obvious way to set this, and a
    // browser shows the trailing slash. Without stripping it, every derived URL
    // gets a double slash and the OAuth redirect stops matching what Google has
    // registered — a failure a long way from its cause.
    process.env.VITE_PUBLIC_ORIGIN = 'https://rayshio.example.com/';
    const c = await load();
    expect(c.publicOrigin).toBe('https://rayshio.example.com');
    expect(c.googleRedirectUri).toBe('https://rayshio.example.com/oauth/callback');
  });

  it('defaults to localhost when the origin is unset', async () => {
    const c = await load();
    expect(c.publicOrigin).toBe('http://localhost:3000');
    expect(c.googleRedirectUri).toBe('http://localhost:3000/oauth/callback');
  });
});

describe('trustedOrigins', () => {
  it('trusts the dev server ports outside production', async () => {
    process.env.NODE_ENV = 'development';
    process.env.VITE_PUBLIC_ORIGIN = 'http://localhost:5173';
    const c = await load();
    expect(c.trustedOrigins).toContain('http://localhost:5173');
    expect(c.trustedOrigins).toContain('http://localhost:3000');
  });

  it('trusts only the app origin in production', async () => {
    // The SPA and API are one origin on a deployed instance, so a trusted
    // localhost there would be a standing hole for no benefit.
    process.env.NODE_ENV = 'production';
    process.env.VITE_PUBLIC_ORIGIN = 'https://rayshio.example.com';
    const c = await load();
    expect(c.trustedOrigins).toEqual(['https://rayshio.example.com']);
  });

  it('does not repeat the origin when it equals a dev port', async () => {
    process.env.NODE_ENV = 'development';
    process.env.VITE_PUBLIC_ORIGIN = 'http://localhost:3000';
    const c = await load();
    expect(c.trustedOrigins.filter((o) => o === 'http://localhost:3000')).toHaveLength(1);
  });
});

describe('requireConfig', () => {
  it('returns the value when the optional var is present', async () => {
    process.env.MCP_API_KEY = 'k'.repeat(24);
    const c = await load();
    expect(c.requireConfig('MCP_API_KEY').MCP_API_KEY).toBe('k'.repeat(24));
  });

  it('throws, rather than returning undefined, when it is missing', async () => {
    process.env.MCP_API_KEY = undefined;
    // biome-ignore lint/performance/noDelete: clearing the var is the point
    delete process.env.MCP_API_KEY;
    const c = await load();
    expect(() => c.requireConfig('MCP_API_KEY')).toThrow(/MCP_API_KEY/);
  });
});
