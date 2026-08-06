import { Router } from 'express';
import { isSignedIn, resolveAuthContext } from '../auth/context.js';

/**
 * The only ungated router. It exists so that "public" is a property of *where a
 * route is declared* rather than of where it happens to sit relative to a
 * `router.use(requireAuth)` line — the previous arrangement made anything
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
      if (context) {
        res.json({ authenticated: true, pending: false });
        return;
      }
      /*
       * `pending` is "signed in, but belongs to no workspace yet" — the state
       * every new account starts in now that registration is open. It is not
       * the same as signed out, and conflating the two sends the user back to
       * the marketing page after a successful sign-in.
       *
       * Still only booleans: this route answers unauthenticated callers, so it
       * reveals nothing about who the user is or which org they might join.
       */
      res.json({ authenticated: false, pending: await isSignedIn(req) });
    })().catch((err: unknown) => {
      console.error('session probe failed:', err);
      res.json({ authenticated: false, pending: false });
    });
  });

  return router;
}
