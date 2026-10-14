# Finally: build plan

Personal finance app for one user (Ireland, EUR, en-IE). Pulls AIB and Revolut payments, categorises them, asks
when a merchant is unknown and remembers the answer, turns the data into budgets and insights, and tracks
investments with rule-based signals and Irish tax estimates. Web (PWA) plus iOS and Android.

## Milestones

| # | Milestone | Done when |
|---|-----------|-----------|
| 1 | Scaffold | Turborepo + pnpm monorepo; `pnpm dev` starts api, web and mobile on an empty screen |
| 2 | Foundations | tokens, config, contracts, Prisma schema, migrations, seed against the Supabase project |
| 3 | finance-core | normaliser, transfers, rules, insights, signals, tax, tools, all tested and green |
| 4 | API | modules and jobs on mock providers; e2e: sync → categorise → answer → re-categorise |
| 5 | Web | every screen against the real API |
| 6 | Mobile | every tab, notifications with category buttons, test-notification button |
| 7 | Real providers | Enable Banking and market-data adapters behind env flags; README setup guides |
| 8 | Handover | contributor notes in `docs/ENGINEERING.md` |

## Assumptions

- **Node 22.12** is installed, not 24. `engines` allows `>=22.12`; nothing used needs 24.
- **NestJS 11, Prisma 7.10.** nestjs-zod 5.5 supports Nest 10/11 only; Prisma 8 is still a release candidate.
- **Supabase project `Finally` (eu-west-1)** is the database from the start. Docker is not running on this
  machine, so no local `supabase start`; the CLI config in `supabase/` is kept for later. The direct host
  `db.<ref>.supabase.co` is IPv6-only, so runtime and migrations use the Supavisor pooler (transaction mode on
  6543 for the app, session mode on 5432 for migrations).
- **Row-level security** is enabled on every table with no policies, and `anon`/`authenticated` grants are
  revoked. Only the API (the `postgres` role) reads or writes data.
- **Workspace packages build to dual ESM + CJS with tsup.** Source is ESM TypeScript. Nest 11 compiles to CJS
  and consumes the CJS build; Vite and Metro consume ESM.
- **Prices and unit costs** use `Decimal(18,8)` (crypto and fractional units need more than 2 dp). Money
  amounts stay `Decimal(14,2)`.
- **Priority:** for rules, a higher `priority` number wins; USER rules always beat SEED rules.
- **Safe to spend** = (income − fixed bills paid − fixed bills remaining − savings target − flexible spend so
  far) ÷ days to payday. Fixed bills already paid are subtracted too; the brief's formula only lists the
  remaining ones, which would overstate the number after rent has gone out.
- **Mock bank data** is deterministic for six months up to "today" and each sync appends 0–3 new payments.
- **Auth:** Supabase email magic link. The API accepts a token only if its email is in `ALLOWED_EMAILS`.
- **The prototype is branded "Kitty"**; the product name is **Finally** and that is what the UI says.

## Open questions

1. Push on a real iPhone needs an EAS development build and APNs credentials (Expo Go cannot show custom
   notification buttons). The in-app "Send a test notification" button works in a dev build without a push server.
2. Enable Banking in restricted mode only returns the accounts you linked in their Control Panel; the app ID and
   private key are needed for that step (follow-up session).
3. Market data provider for real quotes is undecided (Finnhub vs Twelve Data); mock data is used until then.
