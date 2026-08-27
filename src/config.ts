import { z } from 'zod';

try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on process env (Railway injects vars directly)
}

const envSchema = z.object({
  PGSQL_DATABASE_URL: z.string().url(),
  MONGODB_DATABASE_URL: z.string().url(),
  REDIS_DATABASE_URL: z.string().url(),

  /*
   * One Google OAuth client for both jobs: Gmail ingestion (`gmail.readonly`)
   * and sign-in (`openid email profile`).
   *
   * These were two clients, because sharing one would show a mailbox-access
   * consent screen for a plain login. That reasoning does not survive the app
   * being an *internal* Google Workspace app: scopes are requested per
   * authorization call, not per client, so the sign-in flow asks for its three
   * and never mentions Gmail. Two clients bought nothing and cost a second pair
   * of secrets to rotate, plus the failure mode where the wrong pair is edited
   * and sign-in dies with `deleted_client`.
   */
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),

  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_CLASSIFY_MODEL: z.string().default('google/gemini-2.5-flash-lite'),
  OPENROUTER_EXTRACT_MODEL: z.string().default('google/gemini-2.5-flash'),
  OPENROUTER_ESCALATE_MODEL: z.string().default('openai/gpt-4.1'),

  TOKEN_ENCRYPTION_KEY: z
    .string()
    .refine((s) => Buffer.from(s, 'base64').length === 32, 'must be 32 bytes, base64-encoded')
    .optional(),

  MCP_API_KEY: z.string().min(16).optional(),
  MCP_PORT: z.coerce.number().int().default(3000),
  /**
   * Org that the legacy `MCP_API_KEY` env fallback maps to. Exists so a deploy
   * landing before the adopt-key step does not 401 every published client
   * config; deleted in R3 once every key lives in `client.api_key`.
   */
  MCP_LEGACY_KEY_ORG_ID: z.coerce.number().int().default(1),

  SYNC_CRON: z.string().default('0 6 1 * *'),

  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  /**
   * The single origin the app is served from, and the root every other public
   * URL is derived from — Better Auth's `baseURL`, the Gmail OAuth callback,
   * and the MCP endpoint shown on the dashboard.
   *
   * Named `VITE_` because the SPA already had this variable: `web/vite.config.ts`
   * bakes it into index.html, robots.txt and sitemap.xml at build time, since
   * crawlers do not run our JavaScript and `<loc>` has no relative form. The
   * server used to call the same value `PUBLIC_APP_URL`, so one origin was
   * configured twice under two names and could disagree with itself.
   */
  VITE_PUBLIC_ORIGIN: z.string().url().default('http://localhost:3000'),
  /** ECB-backed rate source used for query-time currency conversion. */
  FX_BASE_URL: z.string().url().default('https://api.frankfurter.dev/v1'),
});

export type Config = z.infer<typeof envSchema>;

export const config: Config = (() => {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment configuration:');
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
})();

/**
 * Every public URL the app hands out, derived from the one origin.
 *
 * These were three separate environment variables (`GOOGLE_REDIRECT_URI`,
 * `PUBLIC_MCP_URL`, `PUBLIC_APP_URL`) that had to be kept consistent by hand.
 * Nothing enforced that, so a deploy to a new host meant remembering to change
 * all three, and forgetting one produced a failure a long way from its cause —
 * an OAuth callback pointing at the previous host, or an MCP page telling users
 * to connect to localhost.
 */
export const publicOrigin = config.VITE_PUBLIC_ORIGIN.replace(/\/+$/, '');

/**
 * Where Google returns the Gmail authorization code.
 *
 * Served by the Express app (`GET /oauth/callback`), not by the CLI. It used to
 * be a localhost-only URL because `cli auth` stood up a throwaway server on its
 * port — which meant the Gmail connect flow could only ever be completed from
 * an operator's laptop, never on the deployed instance.
 */
export const googleRedirectUri = `${publicOrigin}/oauth/callback`;

/** Endpoint the dashboard's MCP page tells users to point their client at. */
export const publicMcpUrl = `${publicOrigin}/mcp`;

/**
 * Origins allowed to make state-changing requests: Better Auth's own
 * `trustedOrigins`, and the same-origin check on the rest of `/api`.
 *
 * The dev entries are why this exists. `pnpm dev:web` serves the SPA from
 * :5173 and proxies `/api` to :3000, and while that proxy rewrites the `Host`
 * header it forwards `Origin: http://localhost:5173` unchanged — correctly, as
 * the request really does originate there. With only the app origin trusted,
 * every sign-in and every PATCH from the dev server is rejected with
 * "Invalid origin".
 *
 * Empty in production, where the SPA and the API are one origin, so the dev
 * ports are never trusted on a deployed instance.
 */
export const trustedOrigins: string[] = [
  ...new Set([
    publicOrigin,
    ...(process.env.NODE_ENV === 'production'
      ? []
      : ['http://localhost:5173', 'http://localhost:3000']),
  ]),
];

/** Throws unless the named optional vars are present; returns them non-nullable. */
export function requireConfig<K extends keyof Config>(
  ...keys: K[]
): { [P in K]-?: NonNullable<Config[P]> } {
  const missing = keys.filter((k) => config[k] === undefined);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
  return config as unknown as { [P in K]-?: NonNullable<Config[P]> };
}
