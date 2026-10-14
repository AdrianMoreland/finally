import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { dirname, join } from 'node:path';
import { z } from 'zod';

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: optional,
  DATABASE_SSL: z.enum(['verify', 'require', 'off']).optional(),
  SUPABASE_URL: z.url(),
  SUPABASE_JWKS_URL: z.url(),
  ALLOWED_EMAILS: z
    .string()
    .min(1)
    .transform((v) =>
      v
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  API_URL: z.url().default('http://localhost:3000'),
  WEB_URL: z.url().default('http://localhost:5173'),
  /** Deep link for the mobile app after the bank callback. */
  MOBILE_SCHEME: z.string().default('finally'),
  FINALLY_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'FINALLY_ENCRYPTION_KEY must be 32 bytes, base64'),
  BANK_PROVIDER: z.enum(['mock', 'enable_banking']).default('mock'),
  ENABLE_BANKING_APP_ID: optional,
  ENABLE_BANKING_PRIVATE_KEY: optional,
  MARKET_DATA_PROVIDER: z.enum(['mock', 'finnhub', 'twelvedata']).default('mock'),
  FINNHUB_API_KEY: optional,
  TWELVE_DATA_API_KEY: optional,
  EXPO_ACCESS_TOKEN: optional,
  VAPID_PUBLIC_KEY: optional,
  VAPID_PRIVATE_KEY: optional,
  VAPID_SUBJECT: z.string().default('mailto:admin@example.com'),
  ANTHROPIC_API_KEY: optional,
  ANTHROPIC_MODEL: optional,
  SENTRY_DSN: optional,
  /** Disable pg-boss workers and crons (e2e tests drive the pipeline directly). */
  DISABLE_JOBS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof envSchema>;
export const ENV = Symbol('ENV');

/** Walk upwards from `start` to find the monorepo `.env`. */
export function findEnvFile(start: string = process.cwd()): string | null {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate) && existsSync(join(dir, 'pnpm-workspace.yaml'))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const file = findEnvFile();
  if (file) {
    // Variables already set in the environment win over the file.
    for (const [k, v] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
      if (source[k] === undefined) source[k] = v;
    }
  }
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }
  return parsed.data;
}
