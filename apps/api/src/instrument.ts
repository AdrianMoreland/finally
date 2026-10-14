import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import * as Sentry from '@sentry/nestjs';
import { findEnvFile } from './common/env';
import { scrub } from './common/redact';

const envFile = findEnvFile();
if (envFile) {
  for (const [k, v] of Object.entries(parseEnv(readFileSync(envFile, 'utf8')))) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

/** Loaded first in main.ts so Sentry can instrument everything else. A no-op without SENTRY_DSN. */
if (process.env['SENTRY_DSN']) {
  Sentry.init({
    dsn: process.env['SENTRY_DSN'],
    environment: process.env['NODE_ENV'] ?? 'development',
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    beforeSend: (event) => scrub(event),
  });
}
