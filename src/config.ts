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

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url().default('http://localhost:8787/oauth/callback'),

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
   * R1 only, and down to a single reader: the legacy-cookie branch in
   * `src/auth/context.ts`. It is no longer a process-wide tenant — every
   * handler takes its org from the session — so R2 deletes this along with
   * that branch and `src/api/session.ts`.
   */
  DEFAULT_ORG_ID: z.coerce.number().int().default(1),
  /**
   * Org that the legacy `MCP_API_KEY` env fallback maps to. Exists so a deploy
   * landing before the adopt-key step does not 401 every published client
   * config; deleted in R3 once every key lives in `client.api_key`.
   */
  MCP_LEGACY_KEY_ORG_ID: z.coerce.number().int().default(1),

  SYNC_CRON: z.string().default('0 6 1 * *'),

  DASHBOARD_PASSWORD: z.string().min(8).optional(),
  DASHBOARD_SESSION_SECRET: z
    .string()
    .refine((s) => Buffer.from(s, 'base64').length === 32, 'must be 32 bytes, base64-encoded')
    .optional(),
  DASHBOARD_SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),

  /*
   * Better Auth. Sign-in runs on its own Google OAuth client, separate from the
   * Gmail one above: that one carries `gmail.readonly`, a *restricted* scope, so
   * sharing it would show a mailbox-access consent screen for a plain login.
   */
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  AUTH_GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  AUTH_GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  /** Origin the app is served from — Better Auth's baseURL and the OAuth callback host. */
  PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  /**
   * Comma-separated sign-up allowlist. An address outside it can still get in
   * by holding a pending `client.org_invitation`.
   *
   * Empty, or the single entry `*`, means **open registration**. Both spellings
   * exist because Railway will not store an empty string — it keeps the
   * previous value — and deleting the variable there has no `--skip-deploys`,
   * so it would force a deploy just to change a setting.
   *
   * Open is safe by construction: registering creates an account with no
   * `client.org_member` row, which every /api route still refuses.
   */
  ALLOWED_SIGNUP_EMAILS: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e !== ''),
    ),
  /** ECB-backed rate source used for query-time currency conversion. */
  FX_BASE_URL: z.string().url().default('https://api.frankfurter.dev/v1'),
  /** Endpoint the dashboard's MCP page tells users to point their client at. */
  PUBLIC_MCP_URL: z.string().url().default('http://localhost:3000/mcp'),
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
 * Origins allowed to make state-changing requests: Better Auth's own
 * `trustedOrigins`, and the same-origin check on the rest of `/api`.
 *
 * The dev entries are why this exists. `pnpm dev:web` serves the SPA from
 * :5173 and proxies `/api` to :3000, and while that proxy rewrites the `Host`
 * header it forwards `Origin: http://localhost:5173` unchanged — correctly, as
 * the request really does originate there. With only `PUBLIC_APP_URL` trusted,
 * every sign-in and every PATCH from the dev server is rejected with
 * "Invalid origin".
 *
 * Empty in production, where the SPA and the API are one origin, so the dev
 * ports are never trusted on a deployed instance.
 */
export const trustedOrigins: string[] = [
  ...new Set([
    config.PUBLIC_APP_URL,
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
