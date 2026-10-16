# Finally

Personal finance for one person in Ireland (EUR, en-IE). It pulls payments from AIB and Revolut, categorises them,
asks you (by push notification or in the inbox) when a merchant is unknown and remembers the answer, turns the data
into budgets and insights, and tracks investments with rule-based signals and Irish tax estimates.
Runs in the browser (PWA) and as iOS and Android apps.

Everything works end to end with **mock bank data and mock market data and no third-party keys**. Real providers
switch on with environment variables.

## What is in the repo

| Path | What |
|------|------|
| `apps/api` | NestJS 11 API: Zod validation and serialisation, Swagger at `/docs`, Prisma 7 on Supabase Postgres, pg-boss jobs |
| `apps/web` | React 19 + Vite 8 + Tailwind v4 + shadcn/ui, TanStack Router/Query/Table, PWA with Web Push |
| `apps/mobile` | Expo SDK 57 + Expo Router + NativeWind, victory-native charts, notifications with category buttons |
| `packages/contracts` | Every request and response shape as a Zod 4 schema. API, web and mobile import from here |
| `packages/finance-core` | All finance maths as pure functions with Vitest tests (money is `decimal.js`, never floats) |
| `packages/api-client` | Typed fetch client and TanStack Query hooks shared by web and mobile |
| `packages/db` | Prisma schema, migrations, seed data |
| `packages/tokens` | Design tokens from one TypeScript source: CSS variables + shadcn theme (web), a NativeWind preset (mobile) and a Tokens Studio JSON export |
| `packages/config` | tsconfig, ESLint flat config and tsup presets |
| `supabase/` | Supabase CLI config |

## Quick start

Requirements: Node 22.12+, pnpm 10.

```bash
pnpm install
cp .env.example .env      # then fill it in (see below)
pnpm db:seed              # categories, ~200 Irish merchant rules, tax rates, demo investments
pnpm dev                  # api :3000, web :5173, Expo
```

- API: <http://localhost:3000> (Swagger UI at `/docs`, health at `/health`)
- Web: <http://localhost:5173>
- Mobile: scan the Expo QR code, or press `i` / `a` for a simulator

The first sign-in links the mock AIB account, runs the whole pipeline once and adds starting budgets, pots and people,
so every screen has real numbers. The mock AIB account serves a real statement export (1 May 2025 to 8 Sep 2026, in
`packages/db/src/demo-statement.ts`) followed by generated payments up to today. Revolut can still be linked from
Settings and serves six generated months. To start over, use Settings, Your data, Delete everything, then sign in again.

`pnpm turbo run typecheck lint test build` runs the full check. API end-to-end tests (sync → categorise → answer →
re-categorise) run with `pnpm --filter api test:e2e`; they use a throwaway user in the configured database.

## Environment

See `.env.example` for every name. The important ones:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Pooled Supabase connection (Supavisor, port 6543) used at runtime |
| `DIRECT_URL` | Session-mode connection (port 5432) used for migrations |
| `DATABASE_SSL` | `verify` (default in production), `require` (encrypt without verifying; default in development, needed behind a TLS-inspecting proxy), `off` |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWKS_URL` | Auth. The API verifies access tokens against the project JWKS |
| `ALLOWED_EMAILS` | Comma-separated list. Only these emails can use the API |
| `FINALLY_ENCRYPTION_KEY` | 32 random bytes, base64. AES-256-GCM key for bank session ids (`openssl rand -base64 32`) |
| `BANK_PROVIDER` | `mock` (default) or `enable_banking` |
| `MARKET_DATA_PROVIDER` | `mock` (default), `finnhub` or `twelvedata` |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Optional. Used only to suggest which quick-answer group an unknown merchant belongs to |

Times are stored in UTC and shown in Europe/Dublin. Money is `Decimal(14,2)` in Postgres and a decimal string
(`"12.50"`) in JSON.

## Setup guides

### Supabase

1. Create a project in an EU region. Copy the project URL, the publishable (anon) key and the JWKS URL
   (`<project>/auth/v1/.well-known/jwks.json`).
2. Database: use the pooler hosts (`aws-0-<region>.pooler.supabase.com`). The direct host is IPv6-only.
   Port 6543 is `DATABASE_URL`, port 5432 is `DIRECT_URL`.
3. `pnpm --filter @finally/db db:deploy` applies the migrations. Row-level security is enabled on every table with
   no policies and the Data API roles have no grants, so clients can only reach data through this API.
4. Authentication → URL configuration:
   - Site URL: `http://localhost:5173` (your deployed web URL in production)
   - Redirect URLs: `http://localhost:5173/**`, `finally://**` (mobile) and, for Expo Go, `exp://**`
5. Authentication → Providers → Email: keep magic links on. After your first sign-in, switch off "Allow new users to
   sign up" so nobody else can create an account (the API also rejects any email not in `ALLOWED_EMAILS`).
6. Supabase's built-in email is rate limited; add your own SMTP provider if you send more than a few links an hour.

### Enable Banking (AIB and Revolut)

1. Create an application in the [Enable Banking Control Panel](https://enablebanking.com/cp/applications), in
   **restricted production** mode, and link your own AIB and Revolut accounts there.
2. Download the private key (PEM). Set `ENABLE_BANKING_APP_ID` to the application id and
   `ENABLE_BANKING_PRIVATE_KEY` to the PEM (literal `\n` is accepted).
3. Set the application's redirect URL to `${API_URL}/banking/callback` (must be reachable from your browser; use the
   deployed API URL or a tunnel for phones).
4. Set `BANK_PROVIDER=enable_banking`, restart, then Settings → Link AIB / Link Revolut.
5. Bank names are in `apps/api/src/banking/providers/enable-banking.provider.ts` (`ASPSP`). Change them if the
   Control Panel lists a bank differently.

Consent lasts up to 180 days; Finally warns a week before expiry. PSD2 allows four unattended refreshes a day: syncs run
at 06:00, 12:00, 18:00 and 23:00 Dublin time, plus on demand when you open or pull to refresh.

### Expo and EAS (phone)

Custom notification buttons need a development build, not Expo Go on Android (remote push) and are best tried on a
real device.

```bash
pnpm dlx eas-cli login
cd apps/mobile
pnpm dlx eas-cli init                                  # links an EAS project id
pnpm dlx eas-cli build --profile development --platform ios     # or android
```

- iOS push: EAS manages the APNs key for you (`eas credentials`). Android push: add an FCM v1 service account key.
- Set `EXPO_ACCESS_TOKEN` on the API if you enable enhanced push security.
- Mobile reads `EXPO_PUBLIC_API_URL` (use your machine's LAN IP or the deployed API on a phone) and the Supabase keys.
- Settings → "Send a test notification" shows the three-button ask-me notification locally, no push server needed.

### Web Push

Generate VAPID keys once (`npx web-push generate-vapid-keys`), set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`, build the
web app (`pnpm --filter web build && pnpm --filter web preview`) and use Settings → "Enable on this browser". The
service worker is not registered by the dev server.

### Railway (API) and static web

1. New project → deploy `apps/api` from this repo with the root as the build context. Build:
   `pnpm install --frozen-lockfile && pnpm --filter api... build`; start: `node apps/api/dist/main.js`.
2. Set the variables from `.env.example` (production `DATABASE_SSL=verify`, `NODE_ENV=production`, `API_URL` = the
   Railway URL, `WEB_URL` = the web URL). Run `pnpm --filter @finally/db db:deploy` once against `DIRECT_URL`.
3. Deploy `apps/web` as a static site (`pnpm --filter web build`, serve `apps/web/dist`) with `VITE_API_URL`,
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Add the production URLs to Supabase's redirect list and to the Enable Banking application.

## Notes

- Insights and signals are rule-based information, not financial advice. Tax figures are estimates; rates live in the
  `TaxRule` table and are never hard-coded in the maths.
- Developer notes (conventions, where things live, how to add a category, insight or signal): `docs/ENGINEERING.md`.
