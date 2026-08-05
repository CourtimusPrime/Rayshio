/**
 * The app's route table, in one place.
 *
 * `APP_PATHS` is derived from `APP_TITLES` rather than written out beside it,
 * so the two cannot drift: adding a page to the titles map automatically makes
 * it a known app path, and a known app path is what decides whether an unknown
 * URL redirects to sign-in or 404s.
 */
export const APP_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/breakdown': 'Breakdown',
  '/invoices': 'Invoices',
  '/reports': 'Reports',
  '/calendar': 'Calendar',
  '/connect': 'MCP',
};

export const APP_PATHS = Object.keys(APP_TITLES);

/** Public pages, which render the same signed in or out. */
export const PUBLIC_PATHS = ['/signin', '/privacy', '/terms'];

export function isAppPath(pathname: string): boolean {
  return APP_PATHS.includes(pathname);
}

/**
 * Sanitises a `?next=` value before it is used as a redirect target.
 *
 * The check that matters is the second one. A path beginning `//` is
 * protocol-relative — the browser reads `//evil.example` as a *host*, not a
 * path — so a bare "starts with /" test is an open redirect.
 */
export function safeNext(next: string | null): string {
  if (!next) return '/';
  if (!next.startsWith('/')) return '/';
  if (next.startsWith('//')) return '/';
  return next;
}
