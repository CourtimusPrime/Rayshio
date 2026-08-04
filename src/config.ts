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
  DEFAULT_ORG_ID: z.coerce.number().int().default(1),

  SYNC_CRON: z.string().default('0 6 1 * *'),
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
