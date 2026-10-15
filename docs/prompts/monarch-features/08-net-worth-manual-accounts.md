# 08 · Net worth with manual assets and liabilities, and credit / overdraft usage

You are working in the Finally repo (personal finance, Ireland, EUR, AIB + Revolut read-only). Prerequisite: `01-foundations.md` merged.
This prompt also prepares liabilities for pay-down goals (`09-goals-v2-debt-payoff.md`) and the forecast (`18-forecasting-life-events.md`).

## Ground rules (this repo)

- pnpm 10 + Turborepo. Read `docs/ENGINEERING.md`, `PLAN.md`, `docs/prompts/monarch-features/00-plan.md`. Full check: `pnpm turbo run typecheck lint test build`; `pnpm --filter @finally/finance-core test`; `pnpm --filter api test`; `pnpm --filter api test:e2e` (needs `DATABASE_URL`).
- Zod 4 schemas in `packages/contracts/src`; DTOs in `apps/api/src/common/dto.ts`; `packages/api-client` parses with the same schemas. Maths = pure functions in `packages/finance-core` (decimal.js, Vitest). Money = decimal strings (`"12.50"`); dates Dublin `YYYY-MM-DD`.
- Prisma 7 migrations in `packages/db/prisma/migrations`; new tables get RLS + REVOKE and join `MeService.exportJson`/`deleteAllData` (`apps/api/src/me/me.service.ts`). Queries scoped by `userId`.
- Mock bank, no keys, no third-party calls. Finally never moves money.
- Web: React 19, Tailwind v4, shadcn, recharts, TanStack Router (file routes in `apps/web/src/routes/_app`, nav in `components/app-shell.tsx`). Mobile: Expo Router + NativeWind.

## Goal and behaviour

1. Add **manual assets** (property, car, pension I track by hand, cash in a drawer, other) and **manual liabilities** (mortgage, car loan,
   credit card not connected, student loan, other) with a balance I update by hand and a history of balances.
2. Show a real **net worth** page: assets, liabilities, net, a 12-month (or longer) series, and a breakdown by type.
3. Add a **credit limit / overdraft limit** to bank accounts and show a **usage bar** (used vs limit, % used) on the account list and the net-worth page.
4. Fix the latent bug that bank balances in a non-EUR currency are summed as if they were EUR.

## Read first

- `apps/api/src/overview/overview.service.ts` (`get`: net worth block, `netWorthSeries`), `packages/finance-core/src/insights.ts` (`netWorth`, `netWorthSeries`), `apps/api/src/investments/investments.service.ts` (`totalValue`, `monthEndValues`).
- `apps/api/src/banking/banking.service.ts` (`listAccounts`, `updateAccount`), `packages/contracts/src/core.ts` (`accountSchema`, `updateAccountBody`), `packages/contracts/src/money.ts` (`overviewSchema.netWorth`).
- `apps/api/src/market-data/fx.service.ts`, `packages/db/prisma/schema.prisma` (`Account`, `AssetClass`, `Instrument` includes `PENSION`).
- `apps/web/src/routes/_app/index.tsx` (net worth card), `components/app-shell.tsx` (account list in the sidebar), `components/charts/charts.tsx#NetWorthChart`, `components/common.tsx#Track`, `components/ui/progress.tsx`.
- `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/app/(tabs)/more.tsx`.

## Data model (migration `<next timestamp>_net_worth`)

```prisma
enum ManualKind { ASSET LIABILITY }
enum ManualType { PROPERTY VEHICLE PENSION CASH OTHER_ASSET MORTGAGE CAR_LOAN CREDIT_CARD STUDENT_LOAN PERSONAL_LOAN OTHER_LIABILITY }

model ManualAccount {
  id String @id @default(cuid())
  userId String
  name String
  kind ManualKind
  type ManualType
  currency String @default("EUR")
  balance Decimal @db.Decimal(14, 2)      // always a positive magnitude; `kind` gives the sign
  balanceAt DateTime
  includeInNetWorth Boolean @default(true)
  interestRatePct Decimal? @db.Decimal(6, 3)   // liabilities: APR
  minimumPayment Decimal? @db.Decimal(14, 2)
  creditLimit Decimal? @db.Decimal(14, 2)      // credit cards
  ownerPersonId String?                        // FK Person, SetNull (prompt 01)
  archived Boolean @default(false)
  notes String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  history ManualBalance[]
  @@index([userId, archived])
}

model ManualBalance {
  id String @id @default(cuid())
  manualAccountId String
  userId String
  date DateTime @db.Date
  balance Decimal @db.Decimal(14, 2)
  manualAccount ManualAccount @relation(fields: [manualAccountId], references: [id], onDelete: Cascade)
  @@unique([manualAccountId, date])
  @@index([userId])
}
```
Add to `Account`: `creditLimit Decimal? @db.Decimal(14,2)` (overdraft limit for CURRENT accounts, card limit for CARD accounts).
RLS + REVOKE for both new tables; export; delete-all (delete `ManualBalance` before `ManualAccount`).
Updating a manual balance upserts today's `ManualBalance` row and updates `ManualAccount.balance/balanceAt`; deleting history rows is not exposed.

## finance-core: `networth.ts` (+ tests)

- `utilisation(balance, limit, kind)`: for a CURRENT account used = `max(0, −balance)`; for CARD used = `max(0, −balance)` (credit cards often report negative balances) or, when the provider reports available credit, limit − available; returns `{used, limit, available, pct, band: 'LOW'|'MID'|'HIGH'|'OVER'}` with bands `<30`, `30–74`, `75–99`, `≥100` (state the thresholds in a constant).
- `manualSeries(history[], months, currentMonth)`: month-end balances, forward-filling the last known value, back-filling with the earliest known value only when `includeEarlier` is set (default off, so a car added in March does not appear in January).
- `netWorthBreakdown({cashAccountsEur, investmentsEur, manual: {kind,type,valueEur}[]})` → `{assets, liabilities, net, byType[{type,label,value}]}`.
- Extend `netWorthSeries` (or add `netWorthSeriesV2`) to take manual asset/liability series and return `{month, assets, liabilities, net}`; keep the old function working for the Overview payload until it migrates.

## API

- **EUR conversion everywhere.** Add `BankingService.balancesEur(userId)` (per account `balanceEur` via `FxService.toEur`) and use it in `OverviewService.get` (replacing the raw `a.balance` sums at `cashNow`) and anywhere else balances are summed (grep `balance`). Keep `accountSchema.balance` in the account's currency and add `balanceEur`.
- `accountSchema`/`updateAccountBody`: add `creditLimit` (nullable money), `utilisation` (nullable object above, computed server side). `PATCH /accounts/:id` accepts `creditLimit`.
- New module `apps/api/src/net-worth/`: 
  - `GET /manual-accounts`, `POST /manual-accounts`, `PATCH /manual-accounts/:id`, `DELETE /manual-accounts/:id` (archive when it has history that a goal links to, else delete), `POST /manual-accounts/:id/balance` (`{balance, date?}`; `date` not in the future).
  - `GET /net-worth?months=12|24|60|all` → `{asOf, assets, liabilities, net, byType[], accounts[]` (bank, investments, manual lines with `stale` boolean when a manual balance is older than 90 days), `series[{month, assets, liabilities, net}]`, `change {1m, 12m}}`.
- Contracts: `manualAccountSchema`, `createManualAccountBody`, `updateManualAccountBody`, `setManualBalanceBody`, `netWorthResponse`. `overviewSchema.netWorth` keeps its shape but now includes manual items and EUR conversion. Add hooks (`useNetWorth(months)`, `useManualAccounts`, mutations that invalidate `overview`, `net-worth`).
- Investments: PENSION-class instruments already count in `totalValue`; `ManualType.PENSION` is for pensions tracked by hand. The create dialog warns if you already have PENSION instruments ("make sure you're not counting it twice") and offers no automatic merge.
- Manual liabilities **must not** change safe to spend (prompt 02) or budgets by themselves.

## Web UI

- New route `/net-worth` (nav "Net worth" after Overview). Layout (`GRID`/`SPAN` from `lib/grid.ts`):
  - Header card: net worth big number, change 1m/12m, range ToggleGroup (12m / 24m / 5y / All).
  - Stacked area chart (recharts `AreaChart`): assets positive, liabilities negative (plotted below zero), net line on top; tooltips with all three; screen-reader "Table view" toggle.
  - Breakdown card: grouped list (Cash · Investments · Property & vehicles · Pensions · Other assets · Loans & cards) with totals and share bars.
  - Accounts table: rows for bank accounts (with the **usage bar** when a limit exists), investments (link to /investments), and manual items (edit, update balance, history sparkline, stale badge, archive).
- **Add/edit dialog** (react-hook-form + contracts schema): kind, type (filtered by kind), name, balance, currency (EUR default; non-EUR converted for display, stored in native), APR + minimum payment for liabilities, credit limit for cards, include in net worth, notes.
- **Update balance** quick action: inline input + date, `Enter` saves, toast with the new net worth.
- **Usage bar** component `LimitBar` in `components/common.tsx`: label "€420 of €1,500 overdraft used (28%)", `Track`-based, colour by band using tokens (`good`/`warn`/`bad`), `aria-valuenow/max`, plus text so colour is not the only signal. Used in the sidebar account list (compact) and on the net-worth table.
- Settings → Accounts: field "Overdraft / credit limit" per bank account.
- Overview net worth card gets a "Details →" link. States: skeletons, empty ("Add a house, car or loan to see your full picture"), errors with retry.

## Mobile notes

- New **Net worth** screen under More: headline, 12-month area chart (victory-native), breakdown list, accounts with usage bars (`Track`), and "Update balance" sheet for manual items. Adding/editing manual accounts is allowed with a simple form; history charts are out of scope on mobile.
- Home screen net worth card links to it.

## Edge cases

- **Currencies:** a USD manual asset or GBP Revolut pocket converts at the current ECB rate for "now" and at the rate on `balanceAt` is **not** reconstructed historically; the series uses today's rate for all months and the page says "foreign balances use today's exchange rate". Unknown currency → keep the figure and show a warning chip.
- **Transfers between own accounts** cancel out in cash history (existing `netByMonth` logic) and between a bank account and a manual account never create phantom net worth; do not auto-link them.
- **Pending vs posted:** bank balances are as reported (booked); pending is not subtracted from net worth.
- **Refunds / rent shares:** irrelevant here.
- **Payday periods:** the series is by calendar month-end.
- Manual balance entered in the past with a later entry present: insert in history, current balance stays the latest dated row.
- Liabilities entered as negatives: the validator rejects negative balances with the message "Enter the amount you owe as a positive number".
- Overdraft: a CURRENT account with a negative balance and no limit shows "Overdrawn" with no bar (do not invent a limit). A limit smaller than the current overdraft shows the OVER band.
- Net worth with zero accounts: zeros, not NaN.
- Archived items drop out of totals but stay in history charts only if they had balances then (document the choice and test it).

## Acceptance criteria

1. Add a €300,000 property and a €240,000 mortgage (APR 4%, payment €1,350): net worth changes by €60,000 and both appear in the breakdown.
2. Update the mortgage balance twice on different dates: the series reflects both, and "12m change" updates.
3. Set an AIB overdraft limit of €500 and make the balance −€140: the bar shows 28% in the "LOW/MID" band with the text; remove the limit and the bar disappears but "Overdrawn" remains.
4. A GBP pocket of £100 contributes about €117 (current ECB/fallback rate), not 100.
5. The Overview net worth card and `/net-worth` show the same current number.
6. `GET /me/export?format=json` includes manual accounts and balances; "Delete all data" removes them.
7. Dark mode, keyboard operation and 375 px width are fine.

## Tests

- finance-core: `utilisation` bands and edge values (0, exactly at limit, over, no limit); `manualSeries` forward-fill and `includeEarlier`; breakdown signs; series with liabilities and mixed currencies (inputs already converted).
- API: manual account CRUD and ownership scoping (another user's id → 404), balance upsert idempotency per date, future date rejected, `balancesEur` with stubbed `FxService`; e2e net-worth totals vs Overview.
- contracts: schema validation (negative balance rejected, non-EUR currency code format).

## Out of scope

Automatic valuation (property/car prices), importing mortgage statements, amortisation schedules (prompt 09), investments valuation changes, linking manual accounts to bank transactions.

## Finish

1. Explore the files above, post a short plan, then implement.
2. Run `pnpm install`, `pnpm --filter @finally/db db:generate`, `pnpm turbo run typecheck lint test build`; e2e if `DATABASE_URL` is reachable, else say so.
3. Report what changed, migration name, deferred items, acceptance results.
