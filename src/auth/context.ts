import { fromNodeHeaders } from 'better-auth/node';
import type { NextFunction, Request, Response } from 'express';
import { trustedOrigins } from '../config.js';
import { auth } from './index.js';
import { type OrgRole, resolveActiveOrg, roleSatisfies } from './memberships.js';

/**
 * Who is asking, and which tenant they are asking about.
 *
 * `orgId` is deliberately non-optional. A handler holding a context has an org,
 * which is what lets every query take `orgId` as a required argument — there is
 * no `orgId ?? default` anywhere, and no process-wide default org to fall back
 * to.
 */
export interface AuthContext {
  userId: string;
  orgId: number;
  role: OrgRole;
}

export async function resolveAuthContext(req: Request): Promise<AuthContext | undefined> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session?.user) return undefined;

  const membership = await resolveActiveOrg(session.user.id);
  // A signed-in user with no membership is authenticated but has no tenant to
  // read. That is not an error state — it is the pre-onboarding state — and
  // it must not fall back to some default org.
  if (!membership) return undefined;
  return { userId: session.user.id, orgId: membership.orgId, role: membership.role };
}

/**
 * Whether someone is signed in at all, regardless of whether they can see a
 * tenant.
 *
 * `resolveAuthContext` deliberately returns nothing for a user with no
 * membership, which is right for authorizing a request and wrong for describing
 * one. Without this distinction a signed-in user with no workspace is
 * indistinguishable from a stranger, so the SPA renders the marketing page at
 * them — they sign in with Google, succeed, and land back where they started,
 * apparently signed out, forever.
 */
export async function isSignedIn(req: Request): Promise<boolean> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  return session?.user !== undefined;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const context = await resolveAuthContext(req);
    if (!context) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    req.authContext = context;
    next();
  } catch (err) {
    next(err);
  }
}

/** Mounted after `requireAuth`, which is what puts `req.authContext` there. */
export function requireOrgRole(required: OrgRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const context = req.authContext;
    if (!context) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    if (!roleSatisfies(context.role, required)) {
      res.status(403).json({ error: `requires ${required} access to this workspace` });
      return;
    }
    next();
  };
}

/**
 * A same-origin check for state-changing requests, in place of a CSRF token
 * scheme. `SameSite=Lax` already blocks the classic cross-site form post, and
 * Better Auth validates Origin on its own routes; this covers ours.
 *
 * A missing Origin is allowed because non-browser clients (curl, the CLI) omit
 * it entirely, and browsers always send it on cross-origin state-changing
 * requests — which is the case this exists to reject.
 *
 * POST /mcp is not covered by this and must not be: it authenticates by header
 * and must never accept a cookie, so there is no cross-site request to forge.
 */
export function requireSameOrigin(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }

  const origin = req.headers.origin;
  if (origin === undefined) {
    next();
    return;
  }

  const allowed = new Set([...trustedOrigins, `${req.protocol}://${req.get('host') ?? ''}`]);
  if (!allowed.has(origin)) {
    res.status(403).json({ error: 'cross-origin request rejected' });
    return;
  }
  next();
}
