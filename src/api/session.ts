import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config, requireConfig } from '../config.js';

const COOKIE_NAME = 'imcp_session';
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** `<expiryMs>.<hmac>` — stateless, so restarting the server does not sign users out. */
function sign(expiresAt: number, secret: string): string {
  const mac = createHmac('sha256', Buffer.from(secret, 'base64'))
    .update(String(expiresAt))
    .digest('hex');
  return `${expiresAt}.${mac}`;
}

function verify(token: string, secret: string): boolean {
  const [expiryPart, mac] = token.split('.');
  if (!expiryPart || !mac) return false;
  const expiresAt = Number(expiryPart);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
  return constantTimeEquals(token, sign(expiresAt, secret));
}

/** Express does not parse cookies without middleware, and we only need the one. */
function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

const attempts = new Map<string, { count: number; resetAt: number }>();

function throttled(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt <= now) return false;
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(ip: string): void {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return;
  }
  entry.count++;
}

export function hasSession(req: Request): boolean {
  const { DASHBOARD_SESSION_SECRET } = requireConfig('DASHBOARD_SESSION_SECRET');
  const token = readCookie(req, COOKIE_NAME);
  return token !== undefined && verify(token, DASHBOARD_SESSION_SECRET);
}

export function requireSession(req: Request, res: Response, next: NextFunction): void {
  if (!hasSession(req)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}

export function login(req: Request, res: Response): void {
  const { DASHBOARD_PASSWORD, DASHBOARD_SESSION_SECRET } = requireConfig(
    'DASHBOARD_PASSWORD',
    'DASHBOARD_SESSION_SECRET',
  );

  const ip = req.ip ?? 'unknown';
  if (throttled(ip)) {
    res.status(429).json({ error: 'too many attempts, try again later' });
    return;
  }

  const password = (req.body as { password?: unknown } | undefined)?.password;
  if (typeof password !== 'string' || !constantTimeEquals(password, DASHBOARD_PASSWORD)) {
    recordFailure(ip);
    res.status(401).json({ error: 'incorrect password' });
    return;
  }

  const expiresAt = Date.now() + config.DASHBOARD_SESSION_TTL_HOURS * 60 * 60 * 1000;
  res.cookie(COOKIE_NAME, sign(expiresAt, DASHBOARD_SESSION_SECRET), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: new Date(expiresAt),
    path: '/',
  });
  res.json({ authenticated: true });
}

export function logout(_req: Request, res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ authenticated: false });
}
