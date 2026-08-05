import type { AuthContext } from '../auth/context.js';

/**
 * `req.authContext` is set by `requireAuth` and by nothing else. Declaring it
 * optional is what forces every handler to prove it ran behind the gate — a
 * handler that reads `req.authContext.orgId` without the middleware fails to
 * compile.
 *
 * Not `req.auth`: the MCP SDK's `transport.handleRequest` types its request as
 * `IncomingMessage & { auth?: AuthInfo }`, and an Express `Request` carrying a
 * differently-shaped `auth` no longer satisfies it.
 */
declare global {
  namespace Express {
    interface Request {
      authContext?: AuthContext;
      /**
       * The org the presented MCP API key belongs to, set by `apiKeyAuth`.
       * Separate from `authContext` because /mcp authenticates by header and
       * has no user — only a tenant.
       */
      mcpOrgId?: number;
    }
  }
}
