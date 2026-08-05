import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { orgForApiKey } from '../auth/api-keys.js';
import { config } from '../config.js';

function keysMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Both header forms are accepted because both are already published in client
 * configs by the dashboard's MCP page. The wire format cannot change — those
 * configs live on user machines.
 */
function presentedKey(req: Request): string | undefined {
  const header = req.headers.authorization;
  return (
    (header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined) ??
    (typeof req.headers['x-api-key'] === 'string' ? req.headers['x-api-key'] : undefined)
  );
}

/**
 * Resolves the presented key to an org: a `sha256 → client.api_key` lookup,
 * falling back to the `MCP_API_KEY` env var.
 *
 * That fallback exists purely so a deploy landing before the adopt-key step
 * does not 401 every already-configured client. It is removed in R3, once every
 * key lives in the database.
 */
async function orgForKey(provided: string): Promise<number | undefined> {
  const fromDb = await orgForApiKey(provided);
  if (fromDb !== undefined) return fromDb;

  const legacy = config.MCP_API_KEY;
  if (legacy !== undefined && keysMatch(provided, legacy)) {
    return config.MCP_LEGACY_KEY_ORG_ID;
  }
  return undefined;
}

/** Bearer/x-api-key auth, resolving the key to the org it belongs to. */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const provided = presentedKey(req);
    const orgId = provided === undefined ? undefined : await orgForKey(provided);

    if (orgId === undefined) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'unauthorized: missing or invalid API key' },
        id: null,
      });
      return;
    }

    req.mcpOrgId = orgId;
    next();
  })().catch(next);
}

/**
 * The org `apiKeyAuth` resolved. Throws rather than defaulting: a tool server
 * built for "no particular org" would read across tenants, so this unreachable
 * state stays unreachable instead of degrading into org 1.
 */
export function orgForRequest(req: Request): number {
  const orgId = req.mcpOrgId;
  if (orgId === undefined) throw new Error('apiKeyAuth did not run for this request');
  return orgId;
}
