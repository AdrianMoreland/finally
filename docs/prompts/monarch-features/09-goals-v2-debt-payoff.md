# 09 · Goals inside the budget: Save-up and Pay-down goals, allocations, on-track status, debt payoff calculator

You are working in the Finally repo (personal finance, Ireland, EUR, AIB + Revolut read-only). Prerequisites: `01-foundations.md`
(`Transaction.goalId`) and `08-net-worth-manual-accounts.md` (liabilities as `ManualAccount`). Flex budgeting (`12`/`13`) consumes the
allocations this prompt exposes; the budget screens themselves are **not** changed here.

## Ground rules (this repo)

- pnpm 10 + Turborepo. Read `docs/ENGINEERING.md`, `PLAN.md`, `docs/prompts/monarch-features/00-plan.md`. Full check: `pnpm turbo run typecheck lint test build`; `pnpm --filter @finally/finance-core test`; `pnpm --filter api test`; `pnpm --filter api test:e2e` (needs `DATABASE_URL`).
- Zod 4 schemas in `packages/contracts/src`; DTOs in `apps/api/src/common/dto.ts`; `packages/api-client` parses with the same schemas. Pure maths in `packages/finance-core` (decimal.js, Vitest). Money = decimal strings; dates Dublin `YYYY-MM-DD`.
- Prisma 7 migrations; new tables get RLS + REVOKE and join `exportJson`/`deleteAllData`. Queries scoped by `userId`.
- Mock bank, no keys, no third-party calls. Finally never moves money: "allocation" is a plan, not a transfer.
- Web: React 19, Tailwind v4, shadcn, recharts, TanStack Router. Mobile: Expo Router + NativeWind.

## Goal and behaviour

1. Two goal types: **Save up** (grow a balance to a target by a date) and **Pay down** (reduce a liability to zero or to a target by a date).
2. Every goal has an optional **monthly allocation** (what I plan to put in each month). It is exposed so the budget can show it (prompt 12).
3. Every goal shows an **on-track status**: Ahead, On track, Behind, Done, Overdue, with a plain explanation ("€80 short of where you planned to be").
4. **Spending out of a goal can reduce its progress**, configurable per goal (e.g. a Holiday fund drops when I pay for the flights; a Rainy-day fund does too; an Emergency fund might not count one-offs).
5. A **debt payoff calculator** compares **snowball** (smallest balance first) and **avalanche** (highest interest first) with an extra monthly amount.

## Read first

- `apps/api/src/goals/{goals.service,goals.controller,goals.module}.ts`, `packages/contracts/src/money.ts` (`goalSchema`, `createGoalBody`), `apps/web/src/routes/_app/goals.tsx`, `apps/mobile/app/goals.tsx`.
- `packages/finance-core/src/calculators.ts` (`loanPayoff`, `amortise`, `fireNumber`), `calculators.test.ts`, `dates.ts`.
- Prompt 08's `ManualAccount` model/endpoints; prompt 01's `Transaction.goalId` and the rules action `linkGoal` (prompt 03).
- `apps/api/src/auth/onboarding.service.ts` (`seedGoals`, which links goals to the Rainy/Summer vaults), `apps/api/src/overview/overview.service.ts`, `packages/db/prisma/schema.prisma` (`Goal`, `Account.type = VAULT`).

## Data model (migration `<next timestamp>_goals_v2`)

```prisma
enum GoalType { SAVE_UP PAY_DOWN }
enum GoalTrack { ACCOUNT MANUAL TRANSACTIONS LIABILITY }

// extend Goal
type GoalType @default(SAVE_UP)
trackBy GoalTrack @default(MANUAL)       // existing rows with accountId set => ACCOUNT, else MANUAL
startAmount Decimal @default(0) @db.Decimal(14,2)   // balance when the goal started (pay-down: the debt then)
startDate DateTime @default(now()) @db.Date
monthlyAllocation Decimal? @db.Decimal(14,2)
spendingReducesProgress Boolean @default(false)
liabilityId String?                         // FK ManualAccount, SetNull (PAY_DOWN + trackBy LIABILITY)
archivedAt DateTime?
completedAt DateTime?
entries GoalEntry[]

model GoalEntry {
  id String @id @default(cuid())
  userId String
  goalId String
  date DateTime @db.Date
  amount Decimal @db.Decimal(14,2)       // signed: + contribution, - withdrawal
  note String?
  createdAt DateTime @default(now())
  goal Goal @relation(fields: [goalId], references: [id], onDelete: Cascade)
  @@index([goalId, date])
  @@index([userId])
}
```
Migration SQL: set `trackBy='ACCOUNT'` where `accountId IS NOT NULL`; set `startAmount` = current `saved` for MANUAL goals; set `startDate = createdAt::date`; RLS + REVOKE on `GoalEntry`; export; delete-all.
`Goal.target` for PAY_DOWN is the **target remaining balance** (default 0).

### How progress is computed (`packages/finance-core/src/goals.ts`)

`goalProgress(input)` → `{current, progressPct, remaining}`:

- SAVE_UP, `ACCOUNT`: current = linked account balance in EUR (clamped ≥ 0). Spending already lowers the balance, so `spendingReducesProgress` has no effect here (hide the toggle).
- SAVE_UP, `MANUAL`: current = `startAmount + Σ entries`.
- SAVE_UP, `TRANSACTIONS`: current = `startAmount + Σ entries + Σ credits linked via goalId − (spendingReducesProgress ? Σ debits linked via goalId : 0)`. Linked debits when the flag is off are ignored for progress (they remain ordinary spending in budgets).
- PAY_DOWN, `LIABILITY`: current balance owed = liability balance (EUR); progress = `(startAmount − current) ÷ (startAmount − target)`.
- PAY_DOWN, `MANUAL`: owed = `startAmount − Σ entries(payments)`.

### On-track status (`goalStatus`)

Inputs: type, target, startAmount, startDate, targetDate, current, today, `monthlyAllocation`.
`expected = startAmount + (target − startAmount) × clamp(daysElapsed ÷ totalDays, 0, 1)` (linear).
`gap = current − expected` for SAVE_UP, `expected − current` for PAY_DOWN (positive = ahead).
Status: `DONE` if goal reached; `OVERDUE` if today > targetDate and not reached; `AHEAD` if gap ≥ 5 % of |target − start| **and** ≥ €50; `BEHIND` if gap ≤ −5 % **and** ≤ −€25 (thresholds as named constants); else `ON_TRACK`. Also return `projectedDate` (current pace from the last 90 days of change, falling back to `monthlyAllocation`), `monthlyNeeded`, `shortfallThisMonth` and a one-line explanation string built by templates (no LLM).
For PAY_DOWN with an APR on the liability, `monthlyNeeded` uses amortisation (`loanPayoff` maths) rather than linear division.

### Debt payoff (`packages/finance-core/src/debt.ts`)

```ts
debtPayoff(debts: {id,name,balance,aprPct,minPayment}[], extraMonthly: string, strategy: 'SNOWBALL'|'AVALANCHE'|'MIN_ONLY', opts?: {maxMonths?: number}): {
  order: string[]; months: number; totalInterest: string; totalPaid: string; debtFreeDate(from: today) ; 
  perDebt: {id, paidOffMonth, interest}[]; schedule: {month, balances: Record<id,string>, total: string}[]; neverPaysOff: string[] }
```
Rules: monthly interest = balance × apr/12/100; each month pay every debt's minimum (capped at balance + interest), then put `extraMonthly` plus freed-up minimums from cleared debts on the target debt (SNOWBALL: lowest balance; AVALANCHE: highest APR; ties by lower balance then name); stop at 600 months; if a minimum does not cover interest and there is no extra, list it in `neverPaysOff`; zero APR works; last payment is the remaining balance (no overpay, no negative); money rounded half-up to cents each month.
`compareStrategies` returns both plus `interestSaved`, `monthsSaved` of avalanche vs snowball vs minimum-only.

## API

- Goals: extend `goalSchema`, `createGoalBody`, `updateGoalBody` (all new fields optional with defaults so old clients keep working), add `status`, `statusText`, `projectedDate`, `current`, `monthlyNeeded` (kept), `allocation`.
  `POST /goals/:id/entries` (`{date, amount, note}`), `DELETE /goals/:id/entries/:entryId`, `POST /goals/:id/archive`.
  `GoalsService.allocationsForMonth(userId, month)` → `[{goalId, name, type, amount}]` (active goals with an allocation; archived/completed excluded; pay-down allocations included) — **this is what prompt 12 calls**. Also `GET /goals/allocations?month=`.
- Rule action `linkGoal` (prompt 03) and bulk edit already write `Transaction.goalId`; add `PATCH /transactions/:id` `goalId` support if not present. Linking validates the goal belongs to the user.
- Debt: `POST /tools/debt-payoff` body `{debts?: [...], extraMonthly, source: 'liabilities' | 'custom'}` → `{snowball, avalanche, minOnly, interestSaved…}`; with `source: 'liabilities'` the API reads `ManualAccount` liabilities that have `interestRatePct` and `minimumPayment` (warn about those missing them in `skipped[]`).
- Goal completion: when `current` reaches target, set `completedAt` once, create an `INFO` insight `goal_done`, and push? **No push** (celebration only in-app).
- Keep `OnboardingService.seedGoals` working (demo goals become SAVE_UP, trackBy ACCOUNT).

## Web UI (`apps/web/src/routes/_app/goals.tsx`)

- Tabs: **Save up** · **Pay down** · **Debt payoff**.
- Goal cards: name, current/target, `Track` progress with an expected-today tick, status chip (Ahead/On track/Behind/Done/Overdue, with icon + text), status sentence, monthly allocation (inline editable, "Use suggested €X"), target date, projected date, linked account/liability/transactions badge, "Add contribution" (entries), archive. Pay-down cards show "owed" instead of "saved".
- New/edit dialog: type segmented control; track-by select (account / manual / linked payments / liability); fields change with the type; the "Spending reduces progress" Switch appears only for `TRANSACTIONS` tracking, with helper text.
- Debt payoff tab: choose liabilities (checkboxes from manual accounts, or "enter debts manually"), extra monthly slider, strategy compare: two cards (Snowball vs Avalanche) with debt-free date, total interest, months, order; a line chart of total balance over time for both plus minimum-only; "Interest saved by avalanche: €X". Empty state links to `/net-worth` to add liabilities.
- States: skeleton cards, empty states per tab, error with retry. Keyboard accessible; chart has a table toggle.

## Mobile notes

- `apps/mobile/app/goals.tsx`: segmented Save up / Pay down, goal cards with status chip and allocation (edit allocation in a sheet), add contribution. The debt calculator is a simple screen under Tools (inputs + results, no chart).

## Edge cases

- **Pending vs posted:** linked pending debits/credits count toward progress as soon as they exist; if a pending row disappears the progress drops (acceptable, note in the tooltip "includes pending").
- **Refunds:** a refund linked to a goal is a credit and raises progress; with `spendingReducesProgress` it offsets the earlier debit.
- **Transfers between own accounts:** moving money into a goal's vault is a transfer and is excluded from spending; the vault balance (ACCOUNT tracking) captures it. Do not also count the transfer as a contribution for ACCOUNT goals (guard against double counting).
- **Rent shares:** n/a.
- **Multi-currency (Revolut vaults in GBP/USD):** convert the linked account balance to EUR (`FxService.toEur`); the card notes "converted".
- **Payday periods:** allocations are monthly (calendar month) in the budget; nothing payday-specific here.
- Target date in the past or before start date: validation error; `targetDate - startDate` of 0 days: status uses `DONE`/`OVERDUE` only.
- Over-funded goal: progress capped at 100 % but `current` shows the true number; status `DONE`.
- Pay-down with a liability balance that increases (new borrowing): progress can go negative; clamp the bar at 0, show "balance grew by €X".
- Archiving a goal removes its allocation from budgets; deleting a liability unlinks (`SetNull`) and flips the goal to MANUAL tracking with a banner.
- Debt calculator: minimum payment below interest; zero extra; single debt; all debts at 0 % APR; balance 0 (excluded); extremely long payoff (cap, message "more than 50 years").

## Acceptance criteria

1. Create a Save-up goal "Holiday" €1,500 by 1 June tracking linked payments, allocation €125; link two flight payments (debits) with the toggle off: progress unchanged; turn the toggle on: progress drops by the total.
2. Create a Pay-down goal for a €12,000 car loan at 6.5 %; status explains how far ahead/behind the planned pace you are; update the loan balance and status changes.
3. Debt payoff with three debts (card €2,000 at 22 %, loan €8,000 at 7 %, store card €400 at 0 %), extra €200: avalanche has lower total interest; snowball clears the store card first; both match hand-computed figures for a 2-debt case in the tests.
4. `GET /goals/allocations?month=2026-11` returns only active goals with allocations.
5. Existing goals (linked to the Rainy day and Summer trip vaults) still work and show a status.
6. Mobile goals screen shows type, status and allocation.

## Tests

- finance-core: `goalProgress` per track mode; `goalStatus` matrix (ahead/on track/behind/done/overdue, thresholds, zero-length period); `debtPayoff` (hand-computed 2-debt case to the cent, rollover of freed minimums, 0 % APR, never-pays-off, 600-month cap, rounding on last payment); `compareStrategies` ordering invariants (avalanche interest ≤ snowball ≤ min-only).
- API: allocation endpoint; entries add/remove; linkGoal ownership checks; migration defaults for existing goals; completion insight idempotency.
- contracts: goal body variations (backwards-compatible create without new fields).

## Out of scope

Putting allocations into budget screens (prompt 12), sinking funds/pots (prompt 13), automatic transfers, debt consolidation advice, credit scores, mobile debt chart.

## Finish

1. Explore the files above, post a short plan, then implement.
2. Run `pnpm install`, `pnpm --filter @finally/db db:generate`, `pnpm turbo run typecheck lint test build`; e2e if `DATABASE_URL` is reachable, else say so.
3. Report what changed, migration name, deferred items, acceptance results.
