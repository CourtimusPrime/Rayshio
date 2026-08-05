import { createAuthClient } from 'better-auth/react';

/**
 * Same-origin: the API and the SPA are served by one Express process in
 * production, and Vite proxies /api to it in development, so there is no base
 * URL to configure and no CORS to arrange.
 */
export const authClient = createAuthClient();

export const { signIn, signOut, useSession: useBetterAuthSession } = authClient;
