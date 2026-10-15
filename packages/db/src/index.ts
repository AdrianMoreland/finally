import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client.ts';

export * from './generated/client.ts';
export * from './provision.ts';
export * from './seed-data.ts';
export * from './demo-statement.ts';

export type SslMode = 'verify' | 'require' | 'off';

/**
 * `verify` checks the server certificate (use in production). `require` encrypts but does not verify, which is
 * what you need behind a TLS-inspecting proxy in development. `off` is for local databases only.
 */
export function resolveSslMode(env: NodeJS.ProcessEnv = process.env): SslMode {
  const v = env['DATABASE_SSL'];
  if (v === 'verify' || v === 'require' || v === 'off') return v;
  return env['NODE_ENV'] === 'production' ? 'verify' : 'require';
}

/**
 * Create a Prisma client over node-postgres. Use the pooled `DATABASE_URL` at runtime; migrations use
 * `DIRECT_URL` through prisma.config.ts.
 */
export function createPrismaClient(connectionString: string, ssl: SslMode = resolveSslMode()): PrismaClient {
  const adapter = new PrismaPg({
    connectionString,
    max: 10,
    ssl: ssl === 'off' ? false : ssl === 'require' ? { rejectUnauthorized: false } : true,
  });
  return new PrismaClient({ adapter });
}

export type Db = PrismaClient;
