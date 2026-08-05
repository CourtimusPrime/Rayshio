import { fromNodeHeaders } from 'better-auth/node';
import type { NextFunction, Request, Response } from 'express';
import { hasSession } from '../api/session.js';
import { config, trustedOrigins } from '../config.js';
import { auth } from './index.js';
import { type OrgRole, resolveActiveOrg, roleSatisfies } from './memberships.js';

/**
 * Who is asking, and which tenant they are asking about.
 *
 * `orgId` is deliberately non-optional. A handler holding a context has an org,
 * which is what lets every query take `orgId` as a required argument and lets
 * `DEFAULT_ORG_ID` disappear — there is no `orgId ?? default` anywhere.
 */
export interface AuthContext {
  userId: string;
  orgId: number;
  role: OrgRole;
}

/**
 * R1 only. A valid legacy `imcp_session` cookie still authenticates, mapped to
 * the org the single-password dashboard always showed, so this release can land
 * without signing anyone out mid-deploy.
 *
 * Confined to this one branch on purpose: R2 deletes it, `src/api/session.ts`
 * and the password env vars in a single commit.
 */
function legacyContext(req: Request): AuthContext | undefined {
  if (config.DASHBOARD_SESSION_SECRET === undefined) return undefined;
  if (!hasSession(req)) return undefined;
  return { userId: 'legacy', orgId: config.DEFAULT_ORG_ID, role: 'owner' };
}

export async function resolveAuthContext(req: Request): Promise<AuthContext | undefined> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });

  if (session?.user) {
    const membership = await resolveActiveOrg(session.user.id);
    // A signed-in user with no membership is authenticated but has no tenant to
    // read. That is not an error state — it is the pre-onboarding state — and
    // it must not fall back to some default org.
    if (!membership) return undefined;
    return { userId: session.user.id, orgId: membership.orgId, role: membership.role };
  }

  return legacyContext(req);
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
