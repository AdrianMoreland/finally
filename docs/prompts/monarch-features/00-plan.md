# Monarch-inspired features: plan, gap analysis and build order

Written from a read-only study of the repo at commit `05491d0`. No application code was changed. Each file in this
folder is a stand-alone prompt for a later Claude Code session. Run them in numeric order unless the dependency map
below says a prompt can run in parallel.

## 1. What the codebase actually is (verified)

| Area | Reality |
|------|---------|
| Monorepo | pnpm 10 + Turborepo. `apps/api` (NestJS 11), `apps/web` (React 19, Vite 8, Tailwind v4, shadcn/Radix, TanStack Router/Query/Table/Virtual, recharts 3), `apps/mobile` (Expo SDK 57, Expo Router, NativeWind, victory-native + skia), `packages/{contracts,finance-core,api-client,db,tokens,config}` |
| DB | Prisma 7 on Supabase Postgres, one schema `packages/db/prisma/schema.prisma`, SQL migrations in `packages/db/prisma/migrations` (`20261014000000_init`, `20261014000100_security`). Supabase is used for **auth only**. Every table has RLS on with no policies; the DO-loop that enables RLS in the security migration ran once, so **every new table needs its own `ENABLE ROW LEVEL SECURITY` + `REVOKE`** |
| Validation | Zod 4 schemas in `packages/contracts/src` (`core.ts`, `money.ts`, `tools.ts`, `enums.ts`, `common.ts`). API uses `nestjs-zod` DTO classes registered in `apps/api/src/common/dto.ts` + `@ZodSerializerDto`. Clients parse responses with the same schemas (`packages/api-client/src/client.ts`, hooks in `hooks.ts`) |
| Maths | `packages/finance-core/src/*` pure functions on `decimal.js`, Vitest tests (`*.test.ts`). Money is `"12.50"` strings in JSON, `Decimal(14,2)` in Postgres. Dates are Dublin `YYYY-MM-DD` strings (`dates.ts`) |
| Jobs | pg-boss via `apps/api/src/jobs/jobs.service.ts` (`JobName` union, `register`, `enqueue`; inline when `DISABLE_JOBS=true`), `@nestjs/schedule` crons in services |
| Tests | finance-core + contracts + api-client: Vitest. API unit: Jest `src/**/*.spec.ts`. API e2e: `apps/api/test/pipeline.e2e-spec.ts` against a real `DATABASE_URL` with a throwaway user. Web and mobile have **no tests** (`--passWithNoTests`) |
| Conventions | Commands and rules in `docs/ENGINEERING.md`. Check: `pnpm turbo run typecheck lint test build` |

## 2. Where the brief and the code disagree (the code wins)

These matter because several features lean on things the brief says already exist.

1. **`apps/api/src/tools/` is missing from the repository.** `apps/api/src/app.module.ts:25` imports
   `./tools/tools.module`, `common/dto.ts` has the DTOs, `packages/api-client/src/client.ts` calls `/tools/*`, and the
   web and mobile Tools screens use them, but the directory is not in git history. The API cannot compile as
   committed. Fixed first, in `01-foundations.md`.
2. **Safe to spend does not check the real balance.** `safeToSpend` (`packages/finance-core/src/insights.ts`) is
   `(income − fixed paid − fixed remaining − savings target − flexible spent) ÷ days`. Balances are only used by the
   `cashflow_negative/tight` insight. Account balances are also summed in their **native currency** in
   `insights.service.ts` and `overview.service.ts`. Fixed in `02-safe-to-spend-balance-guard.md`.
3. **Not in the repo, though the brief lists them as existing:** pots, the standing-order checklist, roommates' rent
   shares netted against rent, a "Needs you" action list (closest thing: the To-sort queue plus a `YOU` severity row
   in `apps/web/src/components/insight-list.tsx`), **double-charge detection** (only `price_change`,
   `anomaly_merchant` (>2× usual), `new_subscription`, `renewal_soon` exist), and the **Irish pay/tax checks**
   (PAYE, USC, PRSI, Rent Tax Credit). The tax code in `finance-core/src/tax.ts` is investment tax only (exit tax,
   CGT, investment account). These prompts do not assume the missing ones exist. Where a feature needs a minimal
   version, the prompt builds it (rent-share flag in 01/03, `Pot` in 13). The rest is listed under open question 12.
4. **No prototype HTML file.** `apps/web/index.html` is only the Vite entry. README/PLAN mention a design prototype
   ("Kitty") that is not committed. UX reference = the existing web app, `packages/tokens`, and
   `apps/web/src/components/common.tsx` (Panel, PanelTitle, Track, CategoryChip, EmptyState, ErrorNote).
5. **Privacy hole:** `apps/api/src/categorisation/ai-suggest.service.ts` sends the merchant name and the **raw bank
   descriptor** to `api.anthropic.com` whenever `ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL` are set. That conflicts with
   "no transaction data to third-party AI". `01-foundations.md` makes it a per-user opt-in that defaults off.
6. **CSV re-import can lose real rows.** `dedupeSeed` (`finance-core/src/csv.ts`) is `account|date|amount|descriptor`,
   so two identical coffees on one day collapse into one, and a CSV row never matches the same payment synced
   through the bank (different hash). Fixed in `05-transaction-tooling-a`.
7. **Edits can be lost when a pending payment posts.** `IngestService.ingest` updates PENDING rows in place only when
   amount and descriptor are identical; otherwise the pending row is deleted as stale and a new row is created.
   Fixed in `05-transaction-tooling-a`.
8. **Budgets are calendar-month**, not payday-period (`Budget.month` = `YYYY-MM`). Payday-based logic exists only in
   safe-to-spend, `nextPayday`/`lastPayday`, `effectivePayday` (weekend-adjusted, `signals.ts`) and the DCA reminder.
9. The weekly digest push already exists (`InsightsService.weeklyDigest`, Sunday 19:00) but has no stored recap or UI.

## 3. Gap analysis

Status: ✅ exists, 🟡 partly exists, ❌ missing.

| # | Feature | Status | What exists (paths) | What is missing | Depends on |
|---|---------|--------|---------------------|-----------------|------------|
| 1 | Reports | ❌ | `FinanceDataService.coreTxs/spendByCategory` (`apps/api/src/data/finance-data.service.ts`), recharts wrappers (`apps/web/src/components/charts/charts.tsx`), `/transactions` filters, CSV export of all transactions (`me.service.ts exportCsv`) | Sankey, treemap, stacked bars, group-by, timeframes incl. payday periods, saved reports, filtered CSV export, a shared filter | 01 (filter, owner), 03 (clean categories), 16 optional |
| 2 | Flex budgeting | 🟡 | Category budgets with rollover and pacing (`budgets.service.ts`), `FIXED_CATEGORY_SLUGS`, `pacing()` | Fixed/Flexible/Non-monthly classes, flex number, group budgets, thresholds, alerts, sinking funds/pots, balance guard | 02, 09 (goal allocations), 10 (recurring) |
| 3 | Rules & merchants | 🟡 | `MerchantRule` + `applyRules` (`finance-core/src/rules.ts`), `answer` → USER rule (`categorisation.service.ts`), Settings `RulesCard`, `Merchant` (has unused `logoUrl`) | Multi-condition rules, actions beyond category, ordering, preview, apply-to-past, merchants screen, merge/rename, local logos | 01 |
| 4 | Customisable dashboard | ❌ | Fixed layout in `apps/web/src/routes/_app/index.tsx` from one `/overview` payload; `lib/grid.ts` | Widget registry, saved layout, edit mode, mobile | 01 (preferences), most widgets exist |
| 5 | Recurring calendar | 🟡 | `detectRecurring` (`insights.ts`), `RecurringSeries` (one per merchant), `/recurring`, renewal/price insights | Calendar, paid ticks, manual items, reminders, multi-amount merchants (Apple), bounced/late DDs, "not recurring" | 03, 05 |
| 6 | Transaction tooling | 🟡 | Virtualised table, inline category picker, notes, CSV import (`banking.service.ts importCsv`), pending→booked upgrade | Multi-select, bulk edit, columns, activity log, safer pending carry-over, import preview/undo, receipts | 01 |
| 7 | Goals in budget | 🟡 | `Goal` (target, date, linked account, `monthlyNeeded`), `loanPayoff` | Save-up vs Pay-down, allocations, on-track status, spend-reduces-progress, snowball/avalanche | 08 (liabilities), 01 |
| 8 | Net worth | 🟡 | Bank accounts + investments, 12-month series (`netWorthSeries`), `includeInNetWorth` | Manual assets/liabilities, credit/overdraft limits and usage bar, EUR conversion of balances | 01 |
| 9 | Weekly recap | 🟡 | Sunday push (`weeklyDigest`) | Structured deterministic recap, stored history, dashboard card | 10, 12 nice-to-have |
| 10 | Shared views | ❌ | Nothing | Owner on account/transaction, Person model, filters, UI | 01 |
| 11 | Forecasting | 🟡 | `fireNumber`, `compoundGrowth`, `loanPayoff`, `cashflowForecast`, Tools page | Scenario engine, life events, side-by-side compare, saved scenarios | 08, 09, 12 |

## 4. Build order

Principles: ship useful slices early; fix what is broken before building on it; put the engine before the screens
that need it; keep each prompt to one session; every prompt leaves `main` green.

| Slice | Prompt | Why here |
|-------|--------|----------|
| **A. Make the base safe** | `01-foundations` | Restores the missing `tools` module, adds the shared `TransactionFilter`, activity log, tags/flags, owner groundwork, preferences store, AI opt-in. Everything else reuses these |
| | `02-safe-to-spend-balance-guard` | Small, user-visible, fixes a correctness hole now |
| **B. Better categorisation** | `03-rules-engine-a-core` → `04-rules-engine-b-ui-merchants` | Cleaner categories and merchants make every later report, budget and recurring match better. Engine first, UI second |
| **C. Transaction power** | `05-transaction-tooling-a` | Bulk edit makes cleanup of the first rules run painless; fixes import and pending bugs before recurring matching relies on them |
| **D. See the data** | `06-reports-a` → `07-reports-b` | Read-only, high value, low risk |
| **E. Money model** | `08-net-worth-manual-accounts` → `09-goals-v2-debt-payoff` | Liabilities are needed by pay-down goals and by forecasting |
| **F. Plan ahead** | `10-recurring-calendar-a` → `11-recurring-calendar-b` | Recurring items feed budgets, the recap and the forecast |
| | `12-flex-budgeting-a` → `13-flex-budgeting-b` | Needs goal allocations (09) and recurring (10) |
| **G. Engage** | `14-weekly-recap`, `15-dashboard-widgets` | Widgets exist by now; the dashboard is last so it can host all of them |
| **H. Households and records** | `16-shared-views-owner`, `17-receipts` | 16 only needs the UI because the data model is in 01. 17 waits on open question 2 |
| **I. Look further** | `18-forecasting-life-events` | Uses everything above |

### Dependency map

```
01 foundations ──┬─► 02 safe-to-spend guard ──────────────────────────────┐
                 ├─► 03 rules A ─► 04 rules B ─┬─► 10 recurring A ─► 11 B ─┤
                 ├─► 05 tx tooling A ──────────┤                           │
                 │        └──────────────────► 17 receipts                 │
                 ├─► 06 reports A ─► 07 reports B ──────────────┐          │
                 ├─► 08 net worth ─► 09 goals v2 ─► 12 flex A ─► 13 flex B ┤
                 │          └────────────────────────────────────────► 18 forecast
                 ├─► 16 shared views (UI)                                  │
                 └─► 14 recap ──► 15 dashboard (needs 07, 11, 13, 14)  ◄──┘
```

Can run in parallel after 01: {03/04}, {06/07}, {08/09}. Do **not** parallelise anything that adds a Prisma
migration without agreeing the order, because the migration folder names are timestamps.

## 5. Cross-cutting decisions (so each prompt does not re-argue them)

- **One filter.** `TransactionFilter` (contracts) + `buildTransactionWhere` (API) back the transactions list, bulk
  edit, rule preview, reports, saved reports and CSV export. Defined in 01.
- **Effective fields.** `Transaction` gains `tags`, `excludeFromBudgets`, `rentShare`, `reviewedAt`, `goalId`,
  `source`, owner override. `CoreTx` gets matching optional fields. `excludeFromBudgets` also hides a payment from
  reports unless the report asks for `includeExcluded`.
- **Rent share** = a credit marked `rentShare` is stored as `kind=REFUND` in the Rent category so existing netting
  (`spendByCategory` subtracts REFUND) shows net rent everywhere and it never counts as income.
- **Activity log.** Every automated or manual change to a transaction writes a `TransactionEvent` through
  `TransactionEventsService`. Rules, imports, bulk edits and the pending→posted carry-over all use it.
- **Preferences.** `UserPreference(key → Json)` with a Zod registry; used for table columns, dashboard layout,
  owner scope, reminder defaults.
- **Notifications.** All pushes go through `PushService` (quiet hours respected). New `pushPayload.kind` values are
  added in `packages/contracts/src/core.ts`, handled in `apps/web/src/sw/sw.ts` and
  `apps/mobile/src/lib/notifications.ts`.
- **No LLMs, no remote assets.** Recaps, rules suggestions, merge suggestions and logos are deterministic and local.
- **Money in reports and budgets** uses `amountEur` (converted once at ingest by `FxService.toEur`). Reports say so.
- **Every new table** is added to `MeService.exportJson` and `MeService.deleteAllData`
  (`apps/api/src/me/me.service.ts`) and gets RLS in its migration.

## 6. Open questions (my recommended default is what the prompts assume)

| # | Question | Recommended default |
|---|----------|--------------------|
| 1 | Does the partner get their own login? | **No login now.** `Person` rows (SELF, PARTNER) carry ownership; `Person.linkedUserId` is reserved. A later `Household` + membership table is sketched in `16-shared-views-owner` as a design note only |
| 2 | Where do receipt files live? | **Supabase Storage**, private bucket in the EU project, uploaded through the API (never from the client), short-lived signed URLs. A `local` driver is used in dev/e2e so nothing needs keys. This relaxes the "Supabase is for auth only" rule for storage only |
| 3 | Keep the Anthropic call in `ai-suggest.service.ts`? | **Keep the code, gate it behind a per-user opt-in (`User.aiAssistEnabled`, default off)** and send only the normalised merchant name, never the raw descriptor. Rules and keyword hints stay the primary path |
| 4 | Budget period: calendar month or payday period? | **Calendar month** for budgets and the flex number; payday periods for reports and safe-to-spend. Revisit after using it for a month |
| 5 | Group budgets: built-in `CategoryGroup` or user-defined groups? | **Built-in `CategoryGroup`** (Essentials, Lifestyle) for now; the Fixed/Flexible/Non-monthly class is the more useful grouping |
| 6 | Is `User.monthlySavingsTarget` kept next to goal allocations? | **Kept.** Reserved savings = `max(monthlySavingsTarget, Σ goal allocations)`, shown as goals plus a "General savings" remainder, so nothing is double counted |
| 7 | Are pots virtual envelopes or real Revolut vaults? | **Virtual envelope**, optionally linked to a vault/savings account for reconciliation. Finally never moves money |
| 8 | Reminder and recap channel | **Push + in-app only.** Email needs an SMTP provider that does not exist yet; the recap code has a delivery interface so email can be added later |
| 9 | Merchant logos | **Generated monogram avatars** by default. A local mapping file lets you drop your own SVGs into `apps/web/public/merchant-logos/`. No third-party fetches and no bundled trademarked logos |
| 10 | Sankey and treemap on mobile? | **Web only.** Mobile gets stacked bars and a drillable ranked list |
| 11 | Payday period boundaries | **Nominal payday** from `User.paydayDayOfMonth`, weekend-adjusted with `effectivePayday`. Using the date the salary actually landed is a later option |
| 12 | The features described as existing but absent (pots beyond sinking funds, standing-order checklist, Needs-you list, double-charge detection, PAYE/USC/PRSI/Rent Tax Credit checks): are they on another branch, or should they get prompts? | **Assume not on this branch.** Add prompts `19+` once you confirm. Forecasting (18) takes **take-home** amounts, with an editable take-home percentage, so it does not wait for a tax engine |
| 13 | Which accounts count as "spendable" for safe to spend? | `CURRENT` accounts with `includeInNetWorth`. Overdraft headroom is **never** counted as spendable |
| 14 | Saved reports and scenarios: server-side or device-local? | **Server-side**, so web and mobile share them |
| 15 | Can the prototype HTML ("Kitty") be added to the repo for the design pass? | Not blocking. Prompts follow the existing components |

## 7. How to run a prompt

Paste the whole file into a fresh Claude Code session at the repo root. Each prompt tells the session to explore,
plan, implement, then run `pnpm turbo run typecheck lint test build`. Run `pnpm install` first on a clean checkout.
`pnpm --filter api test:e2e` needs a reachable `DATABASE_URL` (it uses a throwaway user); if it is not available the
session must say so rather than claim a pass.
