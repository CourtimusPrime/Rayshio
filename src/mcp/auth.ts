import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { requireConfig } from '../config.js';

function keysMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Bearer/x-api-key auth against MCP_API_KEY. Constant-time compare. */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const { MCP_API_KEY } = requireConfig('MCP_API_KEY');
  const header = req.headers.authorization;
  const provided =
    (header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined) ??
    (typeof req.headers['x-api-key'] === 'string' ? req.headers['x-api-key'] : undefined);

  if (!provided || !keysMatch(provided, MCP_API_KEY)) {
    res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'unauthorized: missing or invalid API key' },
      id: null,
    });
    return;
  }
  next();
}
