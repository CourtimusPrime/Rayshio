import { Router } from 'express';
import { resolveAuthContext } from '../auth/context.js';
import { login, logout } from './session.js';

/**
 * The only ungated router. It exists so that "public" is a property of *where a
 * route is declared* rather than of where it happens to sit relative to a
 * `router.use(requireSession)` line — the previous arrangement made anything
 * declared above that line silently public, which is a mistake a reviewer has
 * to notice rather than one the compiler catches.
 *
 * Adding a route here is a deliberate act. `apiRouter()` gates everything else.
 */
export function publicRouter(): Router {
  const router = Router();

  /*
   * The SPA calls this before rendering to decide between the landing page and
   * the dashboard, so it cannot itself require a session. It reports only a
   * boolean — never who the user is, or which org — because it answers to
   * unauthenticated callers.
   */
  router.get('/session', (req, res) => {
    void (async () => {
      const context = await resolveAuthContext(req);
      res.json({ authenticated: context !== undefined });
    })().catch((err: unknown) => {
      console.error('session probe failed:', err);
      res.json({ authenticated: false });
    });
  });

  // Legacy shared-password sign-in. Both of these, and session.ts with them,
  // are deleted in R2 — Google sign-in replaces them. They stay for R1 so a
  // deploy does not invalidate a session someone is mid-way through using.
  router.post('/session', login);
  router.delete('/session', logout);

  return router;
}
