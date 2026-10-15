# 13 · Flex budgeting, part B: non-monthly sinking funds and pots, budget alerts, safe-to-spend wiring

You are working in the Finally repo (personal finance, Ireland, EUR, AIB + Revolut read-only). Prerequisite: `12-flex-budgeting-a-model-flex-number.md` merged (budget classes, flex number, group budgets), plus `02`, `09`, `10`.

## Ground rules (this repo)

- pnpm 10 + Turborepo. Read `docs/ENGINEERING.md`, `PLAN.md`, `docs/prompts/monarch-features/00-plan.md`. Full check: `pnpm turbo run typecheck lint test build`; `pnpm --filter @finally/finance-core test`; `pnpm --filter api test`; `pnpm --filter api test:e2e` (needs `DATABASE_URL`).
- Zod 4 schemas in `packages/contracts/src`; DTOs in `apps/api/src/common/dto.ts`; `packages/api-client` parses with the same schemas. Pure maths in `packages/finance-core` (decimal.js, Vitest). Money = decimal strings; dates Dublin `YYYY-MM-DD`.
- Prisma migrations; new tables get RLS + REVOKE and join `exportJson`/`deleteAllData`. Queries scoped by `userId`.
- Pushes only through `PushService` (quiet hours respected). Mock bank, no keys, no third-party calls. **Finally never moves money**: a pot is a plan and a ledger, not a transfer.
- Web: React 19, Tailwind v4, shadcn, TanStack Router. Mobile: Expo Router + NativeWind.

## Goal and behaviour

1. **Non-monthly categories work as sinking funds** (travel, gifts, annual fees, car insurance): I set money aside each month; the unspent balance **rolls over without limit**; a big payment draws the balance down; a fund can be negative (under-saved) and says so.
2. A sinking fund can be backed by a **pot**: a virtual envelope with an optional target and due date, optionally linked to a real Revolut vault or savings account so I can compare "the pot says €X, the vault holds €Y".
3. **Alerts** at thresholds I choose (for example 80 % and 100 %) per category, per group, or for the flex number, delivered as an insight and optionally a push.
4. **Safe to spend** now reserves goal allocations and sinking-fund contributions, **and still checks the real balance**: budgets alone must never say "fine" while the account is overdrawn.

## Read first

- Prompt 12's `BudgetsService`, `flex.ts`, contracts, web `budgets.tsx`; prompt 09 `allocationsForMonth`; prompt 02's `safeToSpendGuarded` and tests.
- `apps/api/src/budgets/budgets.service.ts#carriedIn` (depth capped at 6, and overspend is not carried) and its use in `rows`.
- `apps/api/src/insights/insights.service.ts` (`runForUser`, `persist`, `pushPending`, `PRODUCED_TYPES`), `packages/finance-core/src/insights.ts` (`budgetPacing` creates `budget_over` ACT and `budget_pace` WATCH).
- `apps/api/src/overview/overview.service.ts#safeToSpendFor`, `packages/contracts/src/money.ts` (`overviewSchema`), `apps/api/src/notifications/push.service.ts`, `packages/contracts/src/core.ts#pushPayload`, `apps/web/src/sw/sw.ts`.
- `packages/db/prisma/schema.prisma` (`Account` type `VAULT|SAVINGS`, `Goal`), `apps/api/src/banking/banking.service.ts#balancesEur` (prompt 08).

## Data model (migration `<next timestamp>_pots_and_alerts`)

```prisma
enum PotKind { SINKING_FUND SAVINGS }

model Pot {
  id String @id @default(cuid())
  userId String
  name String
  kind PotKind @default(SINKING_FUND)
  categoryId String?                  // the NON_MONTHLY category this fund pays for (unique per user when set)
  accountId String?                   // optional real vault/savings account for reconciliation (SetNull)
  startMonth String                   // YYYY-MM: contributions accrue from here
  openingBalance Decimal @default(0) @db.Decimal(14,2)
  targetAmount Decimal? @db.Decimal(14,2)
  dueDate DateTime? @db.Date
  colour String?
  archived Boolean @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, categoryId])
  @@index([userId, archived])
}

enum AlertScope { CATEGORY GROUP FLEX_TOTAL }

model BudgetAlert {
  id String @id @default(cuid())
  userId String
  scope AlertScope
  categoryId String?                  // scope CATEGORY
  group CategoryGroup?                // scope GROUP
  thresholdPct Int                    // 1..200
  push Boolean @default(false)
  enabled Boolean @default(true)
  createdAt DateTime @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, scope, categoryId, group, thresholdPct])
  @@index([userId, enabled])
}
```
RLS + REVOKE on both; export; delete-all. Migration data step: for each NON_MONTHLY category that has budget rows, create a `SINKING_FUND` pot with `startMonth` = earliest budget month and opening balance 0; and do **not** create alert rows per category. Instead keep one user-level default in the preference registry, `budgets.alerts.defaults = {thresholds: [100], pushAtOrAbove: 100}`, and let explicit `BudgetAlert` rows override it per category, group or flex total. That preserves today's behaviour (`budget_over` pushes at 100 %) without creating dozens of rows.

## finance-core: `sinking.ts` (+ tests) and alert logic

- `fundBalance({openingBalance, startMonth, contributions: Record<month,string>, spendByMonth: Record<month,string>, throughMonth})` → `{balance, contributedToDate, spentToDate, series[{month, contributed, spent, balance}]}`. Unlimited carry-over, no depth cap, **negative balances carry** (an overspent fund starts the next month negative). Contributions = the monthly `Budget.amount` of the pot's category; months without a budget row contribute 0; the current month's contribution counts in full from day 1.
- `fundPlan({balance, targetAmount, dueDate, today, currentContribution})` → `{monthsLeft, suggestedMonthly, onTrack: boolean, projectedAtDue, shortfall}`; `suggestedMonthly = max(0, target − balance) ÷ monthsLeft` (monthsLeft ≥ 1).
- `reconcile(potBalance, linkedAccountBalanceEur)` → `{difference, state: 'MATCHED'|'POT_HIGHER'|'ACCOUNT_HIGHER', tolerance: '1.00'}`.
- `evaluateAlerts(rows, alerts, defaults, month, today)` → `Draft[]` with fingerprint `budget_alert:<scope>:<id>:<month>:<threshold>`; severity `ACT` when `threshold ≥ 100`, else `WATCH`; text is deterministic ("Groceries has reached 80 % of its budget with 12 days left"); one draft per crossed threshold; thresholds already crossed in earlier months do not repeat.
- `safeToSpendGuarded` (prompt 02) input changes in the API: `savingsTarget` is replaced by `reserved = reservedSavings(...).total + nonMonthlyContributions` (month amounts, see edge cases for prorating), **and the balance leg is unchanged**.

## API

- Pots: `GET /pots` (each with `balance`, `series` (last 12 months), `plan`, `reconcile`, `category`), `POST /pots`, `PATCH /pots/:id`, `DELETE /pots/:id` (archives if it has history), `GET /pots/:id`. Creating a pot for a category that has none switches the category to NON_MONTHLY after confirmation (`confirmReclassify: true`).
  `BudgetsService.rows`: for NON_MONTHLY rows, `carriedIn` comes from `fundBalance` (no cap), `BudgetRow` adds `fund: {balance, target, due, onTrack, suggestedMonthly}`.
- Alerts: `GET/POST/PATCH/DELETE /budgets/alerts`; `GET/PUT` for the defaults preference. Validation: a category alert must reference a budgeted FLEXIBLE/FIXED category; thresholds 1–200; at most 50 alerts.
- `InsightsService.runForUser`: replace `budgetPacing`'s `budget_over` with `evaluateAlerts` driven by the defaults + explicit alerts, keeping the **same fingerprint format for the default 100 % case** (`budget_over:<categoryId>:<month>`) so existing insight rows and pushes do not duplicate; keep `budget_pace` (WATCH) as is. Push only when the alert has `push`. Add all new types to `PRODUCED_TYPES`.
- Safe to spend: `OverviewService.safeToSpendFor` computes `reserved` from `reservedSavings` + Σ NON_MONTHLY monthly contributions (prorated to the payday cycle: `monthlyAmount × daysInCycle ÷ daysInMonth`), passes it as `savingsTarget`, and calls `safeToSpendGuarded` (from prompt 02). Overview payload keeps all prompt-02 fields. **Regression test: balance negative ⇒ status `OVERDRAWN` regardless of how generous the budgets are.**
- Contracts and hooks: `potSchema`, `createPotBody`, `budgetAlertSchema`, etc.; `usePots`, `useBudgetAlerts`.

## Web UI

- Budgets page, **Non-monthly** section: each row becomes a fund card: category, balance (can be negative, red with "under-saved by €x"), monthly contribution (editable), target + due date progress (`Track` with expected-today tick), "On track / Behind" chip (icon + text), a 12-month mini bar (contributed vs spent), and "Edit pot". "New pot" button (name, category (or create), start month, opening balance, target, due date, optional linked account).
- Pot reconcile line when linked: "Pot says €420 · Revolut vault holds €400 · €20 difference". No transfer buttons.
- **Alerts** card on the Budgets page: defaults editor (chips 50/80/100/120 + custom, "Push at 100 %" switch) and an "Add alert" dialog (scope, category/group, threshold, push). List with enable Switches and delete.
- Goals page link: the Goals section in Budgets shows pots and goals together under "Money set aside".
- Overview Safe-to-spend card tooltip lists what is reserved ("Goals €300, funds €200, savings €330").
- States: skeletons, empty ("Make a pot for something big and annual, like car insurance"), error retry; keyboard and screen-reader labels for bars.

## Mobile notes

- Budgets screen: fund cards in the Non-monthly section (balance, monthly, target, status); create/edit pot via a sheet; alerts defaults screen under Settings. Push taps (`kind: 'insight'` as today) open Insights.
- Push copy for alerts: "Groceries is at 80 % of its budget" with the deep link `data.screen = 'budgets'`.

## Edge cases

- **Pending vs posted:** pending counts toward fund draws and alert thresholds; an alert fired by a pending row that later disappears remains as an insight but the next run updates it (fingerprint stable) and deletes it if unseen and unpushed (existing `persist` behaviour).
- **Refunds:** a refund raises the fund balance (net spend lower), including refunds in a later month than the original spend.
- **Transfers between own accounts:** moving money into the linked vault is not spend and not a contribution; the ledger is the budget, the vault is only a reconciliation target.
- **Rent shares:** n/a for funds; for alerts, Rent's spent is net.
- **Multi-currency:** fund spend uses `amountEur`; the linked account balance is converted to EUR (`balancesEur`).
- **Payday periods:** safe-to-spend prorates monthly reservations over the payday cycle (above); alerts and funds are calendar-month. Document it.
- A fund's first month: contributes immediately; opening balance covers money I already set aside.
- Category switched out of NON_MONTHLY: the pot is archived, its balance stays visible in history, and the category returns to FLEXIBLE with rollover as the user set.
- Deleting a budget row for a month inside a fund's history: the contribution for that month becomes 0 (warn in the UI).
- Alert thresholds above 100 % (e.g. 120 %) fire once when crossed; changing a budget amount re-evaluates; lowering a budget so the threshold is already exceeded fires immediately next run.
- Quiet hours defer alert pushes to the next run (existing `pushPending` behaviour).
- Many alerts at once: the push step sends at most 3 individual pushes per run, then one digest push "4 more budgets need attention".

## Acceptance criteria

1. Create "Car insurance" pot: category Car insurance (Non-monthly), contribution €50/month from Jan, target €600 due 1 Dec 2026, with 11 months of budgets. In December, a €620 payment leaves the fund at −€20 (red "under-saved by €20") and January starts at −€20 + €50.
2. A fund that had 18 months of contributions shows the full balance (the old 6-month cap is gone for NON_MONTHLY rows).
3. Link the pot to a Revolut vault: the reconcile line shows the difference and no money-moving UI exists anywhere.
4. Set Groceries alerts at 80 % (no push) and 100 % (push): crossing 80 % creates a WATCH insight only; crossing 100 % creates an ACT insight and one push, once.
5. The default 100 % behaviour is unchanged for users who configure nothing (same fingerprints, no duplicate pushes after upgrade).
6. Safe to spend subtracts goal allocations and fund contributions; with `AIB Current` at −€50 it still shows "Overdrawn €50.00" and no positive figure.
7. Deleting all data removes pots and alerts; export includes them.

## Tests

- finance-core: `fundBalance` (long history, negative carry, missing months, opening balance, refunds), `fundPlan` (zero months left, already funded, overdue), `reconcile` tolerance, `evaluateAlerts` (threshold crossing, no repeat across months, severity, fingerprint compatibility with `budget_over`), prorating helper.
- API: pot CRUD and reclassification confirmation, unique pot per category, alert validation, insight persistence/dedupe, push digest limit, safe-to-spend reserved wiring, **regression: overdrawn account ⇒ OVERDRAWN**.
- e2e: create pot → budgets response has `fund` → alert crossing → insight → push stub called once.

## Out of scope

Moving money to vaults, auto-contributions, bill pay, split pots across several categories, email alerts, payday-period budgets, shared pots between people.

## Finish

1. Explore the files above, post a short plan, then implement.
2. Run `pnpm install`, `pnpm --filter @finally/db db:generate`, `pnpm turbo run typecheck lint test build`; e2e if `DATABASE_URL` is reachable, else say so.
3. Report what changed, migration name, deferred items, acceptance results.
