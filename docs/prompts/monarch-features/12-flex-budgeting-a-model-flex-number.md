# 12 · Flex budgeting, part A: Fixed / Flexible / Non-monthly, the flex number, group budgets, colour thresholds

You are working in the Finally repo (personal finance, Ireland, EUR, AIB + Revolut read-only). Prerequisites: `02` (safe to spend guard),
`09` (goal allocations), `10` (recurring items); `01` for flags. Part B (`13-flex-budgeting-b-sinking-funds-alerts.md`) adds sinking funds, pots, alerts and the final safe-to-spend wiring.

## Ground rules (this repo)

- pnpm 10 + Turborepo. Read `docs/ENGINEERING.md`, `PLAN.md`, `docs/prompts/monarch-features/00-plan.md`. Full check: `pnpm turbo run typecheck lint test build`; `pnpm --filter @finally/finance-core test`; `pnpm --filter api test`; `pnpm --filter api test:e2e` (needs `DATABASE_URL`).
- Zod 4 schemas in `packages/contracts/src`; DTOs in `apps/api/src/common/dto.ts`; `packages/api-client` parses with the same schemas. Pure maths in `packages/finance-core` (decimal.js, Vitest). Money = decimal strings; dates Dublin `YYYY-MM-DD`.
- Prisma migrations; new tables get RLS + REVOKE and join `exportJson`/`deleteAllData`. Queries scoped by `userId`.
- Mock bank, no keys, no third-party calls. Finally never moves money.
- Web: React 19, Tailwind v4, shadcn, recharts, TanStack Router. Mobile: Expo Router + NativeWind.

## Goal and behaviour

Move from "one budget per category" to Monarch-style **flex budgeting**, adapted to Finally:

1. Every budget category is **Fixed** (rent, bills, subscriptions: paid on a schedule), **Flexible** (groceries, eating out, coffee, transport, shopping, fun…) or **Non-monthly** (travel, gifts, annual fees: money set aside monthly for a lumpy cost).
2. A single **flex number** = **income − fixed − non-monthly − goal allocations**: what is left to spend freely this month. The budget page leads with it, showing the arithmetic.
3. Optional **budgets at category-group level** (Essentials, Lifestyle) that cap the sum of their categories.
4. **Colour thresholds** on every budget bar: under 50 %, 50–99 %, 100 % and over.
5. The existing per-category budgets, rollover and pacing keep working (users can switch between "Flex number" and "Category budgets" views).
6. Safe to spend (prompt 02) is unchanged here. Part B wires the new reserved amounts into it, and **must keep checking the real balance**.

## Read first

- `apps/api/src/budgets/*` (service: `rows`, `ensureMonth`, `carriedIn` (depth-capped at 6), `lines`, `history`), `packages/contracts/src/money.ts` (`budgetRowSchema`, `budgetsResponse`, `upsertBudgetBody`), `apps/web/src/routes/_app/budgets.tsx`, `apps/mobile/app/(tabs)/budgets.tsx`.
- `packages/finance-core/src/insights.ts` (`pacing`, `budgetPacing`, `BudgetLine`, `slipping`, `safeToSpend`), `packages/contracts/src/enums.ts` (`FIXED_CATEGORY_SLUGS`), `apps/api/src/data/finance-data.service.ts` (`CategoryInfo.fixed`, `spendByCategory`), `packages/finance-core/src/types.ts` (`CoreCategory`).
- `apps/api/src/overview/overview.service.ts` (`safeToSpendFor`, flexible card), `apps/api/src/insights/insights.service.ts` (`budgetPacing`, `slipping` usage), `apps/api/src/auth/onboarding.service.ts` (`DEMO_BUDGETS`).
- `packages/db/src/seed-data.ts` (`SEED_CATEGORIES`), `provision.ts`, `packages/db/prisma/schema.prisma` (`Budget`, `Category`, `Goal`, `User.monthlySavingsTarget`).
- Prompt 09 `GoalsService.allocationsForMonth`; prompt 10 `RecurringService` (expected income and fixed occurrences in a month).

## Data model (migration `<next timestamp>_flex_budgeting`)

```prisma
enum BudgetClass { FIXED FLEXIBLE NON_MONTHLY }

// Category
budgetClass BudgetClass @default(FLEXIBLE)

model GroupBudget {
  id String @id @default(cuid())
  userId String
  group CategoryGroup           // only ESSENTIALS and LIFESTYLE are budgetable
  month String                  // YYYY-MM
  amount Decimal @db.Decimal(14,2)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, group, month])
}
```
Migration SQL: backfill `budgetClass` — `FIXED` for slugs `rent`, `bills`, `subscriptions` (and their children); `NON_MONTHLY` for `travel`, `gifts`; `FLEXIBLE` for the rest; INCOME/TRANSFER/SAVINGS groups stay FLEXIBLE and are never budgetable.
Update `provisionDefaults`/`SEED_CATEGORIES` (add `budgetClass` to `SeedCategory`) so new users get the same defaults. `FIXED_CATEGORY_SLUGS` stays as the **default** for the backfill, but `FinanceDataService.categories` must derive `fixed` from `budgetClass === 'FIXED'` so every existing caller (`safeToSpend`, insights, overview) keeps working. RLS + REVOKE on `GroupBudget`; export; delete-all.
`PATCH /categories/:id` (and `updateCategoryBody`) accept `budgetClass`.

## finance-core: `flex.ts` (+ `flex.test.ts`)

```ts
flexNumber({ income, fixed, nonMonthly, goalAllocations, generalSavings }): {
  income, fixed, nonMonthly, goals, generalSavings, flex: string,       // flex = income − fixed − nonMonthly − (goals + generalSavings)
  plannedFlexible: string, unallocated: string,                         // unallocated = flex − Σ flexible budgets (negative = over-planned)
  lines: Array<{label, amount, sign}> }                                 // for the UI arithmetic
reservedSavings(monthlySavingsTarget, goalAllocations): { goals, generalSavings, total }   // generalSavings = max(0, target − Σ goals)
budgetStatus(spent, budget): { pct, band: 'UNDER'|'WATCH'|'OVER' }      // <50, 50–99.99, ≥100 ; budget 0 and spent>0 => OVER ; budget 0 and spent 0 => UNDER
```
Income for the month: the actual `INCOME` total so far if salary has landed this month, else the usual salary (median of the last 3 months' `INCOME` ≥ €1,000, the rule safe-to-spend already uses), plus expected IN occurrences from prompt 10 that haven't landed (exclude one-offs). Expose which one was used (`incomeBasis: 'ACTUAL'|'EXPECTED'`).
Fixed = Σ budgeted amounts of FIXED categories (top-level to avoid double counting children); if a fixed category has no budget but has recurring items, use the month's expected amounts. Non-monthly = Σ monthly contributions of NON_MONTHLY budgets. Goals = `allocationsForMonth`. General savings per decision 6 in the plan.
Calendar month only (decision 4 in the plan); document the difference from the payday-cycle safe-to-spend in `docs/ENGINEERING.md`.

## API

Extend `BudgetsService.rows`:

- `BudgetRow` adds `budgetClass`, `pctUsed`, `band`, `isGroupMember`; `BudgetsResponse` adds
  `classes: { fixed, flexible, nonMonthly }` (each `{budget, spent, rows count}`), `flex` (the `flexNumber` result + `incomeBasis`),
  `goals: [{goalId, name, type, amount}]`, `groups: [{group, label, budget|null, spent, pctUsed, band, categoryBudgetSum}]`.
  Existing fields stay; old clients keep working. `totalBudget/totalSpent` unchanged (counted without double counting children).
- Group budgets: `PUT /budgets/groups` `{group, month, amount}` and `DELETE /budgets/groups/:group?month=`. Warn (in the response `warnings[]`) when category budgets in a group exceed the group cap. A group cap never blocks category budgets.
- `ensureMonth` also copies group budgets and goal-independent items forward.
- Rollover: keep existing semantics for FLEXIBLE/FIXED. **For NON_MONTHLY categories rollover is forced on** and uses cumulative carry (part B replaces the 6-month cap for those). Reject `rollover=false` for NON_MONTHLY with a clear message, or ignore it and document (choose reject).
- `spent` must respect flags: exclude `excludeFromBudgets`, net refunds and rent shares (already how `spendByCategory` works after prompt 01), include pending.
- Keep `lines()`/`history()` shapes for the insights; make `budgetPacing` skip NON_MONTHLY categories (they are funds, not pace-able) and keep skipping FIXED.
- `OverviewService`: the "Flexible spend" card uses the **flex number** as the denominator when category budgets are present: `flexible.budget = flex.flex` (fall back to Σ flexible budgets when income is unknown), and adds `flexible.numberBasis`. Contract change is additive.

Contracts/hook updates in `packages/contracts/src/money.ts`, `packages/api-client` (`useBudgets` returns the richer shape; `useUpsertGroupBudget`).

## Web UI (`apps/web/src/routes/_app/budgets.tsx`)

- **Header card "Your flex number"**: big number for the month and the arithmetic as a list: `Income  +€3,150`, `Fixed bills  −€1,455`, `Non-monthly  −€200`, `Goals  −€300`, `General savings  −€330`, `= Flex €865` (use `lines` from the API; each line links/scrolls to its section). Below: planned flexible vs flex ("You've planned €820 of €865. €45 unallocated" or "Over-planned by €60" in the warn colour), and spent-so-far `Track` with the even-pace tick. Income basis note ("Using your usual salary until this month's lands").
- **View switch** (ToggleGroup): *Flex* (default) and *Categories*. Flex view = three sections **Fixed**, **Flexible**, **Non-monthly**, each with its total and a collapsible list of rows; Categories view = the existing list. Persist the choice in `UserPreference('budgets.view')`.
- **Rows:** category chip, `Track` bar coloured by `band` (UNDER → `good`, WATCH → `warn`, OVER → `bad`; fixed rows show "paid / due" wording instead of colours when spent < budget, since an unpaid bill is not "under budget" in a good way), amount spent / budget, remaining, inline editable budget (existing upsert), a menu to change the class (Fixed/Flexible/Non-monthly) with a confirm explaining the effect on the flex number, rollover Switch (locked on for Non-monthly with tooltip).
- **Group budgets:** collapsed "Group budgets (optional)" card with Essentials and Lifestyle rows: cap input, spent, band, warning when children exceed the cap.
- **Goals section:** a read-only list "Goals this month" with each allocation and a link to `/goals` (editing happens there).
- **Legend** under the header: dot + text for the three bands ("Under 50 %", "50–99 %", "100 % or over") so colour is never the only cue. Bars expose `role="progressbar"` with `aria-valuenow` and text like "78 % used".
- Month navigation as today. States: skeleton, empty ("Set a few budgets to see your flex number"), errors with retry.

## Mobile (`apps/mobile/app/(tabs)/budgets.tsx`)

Flex header card with the arithmetic, then sections Fixed / Flexible / Non-monthly with the same band colours (+ text), month switcher unchanged. Editing a budget amount via a simple sheet; changing class via a menu. Group budgets read-only on mobile.

## Edge cases

- **Pending vs posted:** pending counts toward spent (existing); the flex number's "spent so far" shows a "(includes €x pending)" hint.
- **Refunds:** net down the category; a category can show negative spent (displayed as "−€12 net refunds"), its bar at 0 %.
- **Transfers between own accounts:** excluded from spend and from income. Moving money to a savings vault is not spending; savings-group categories are not budgetable (unchanged).
- **Rent shares:** Rent spent is net of roommates' shares; **Fixed total uses the budgeted rent (your share) the user entered**; if the user budgets gross rent, the flex number would be understated, so the UI hint on the Rent row says "Enter your share after roommates' contributions" when any `rentShare` credits exist this or last month.
- **Multi-currency:** budgets and spent use `amountEur`.
- **Payday periods:** budgets are calendar months; the header shows "Payday 28 Nov" for orientation only; the flex number is not prorated.
- Income unknown (new user, no salary yet): flex number is `null` and the card says "Add an income or wait for your first salary"; sections still work.
- Negative flex number: show it (red, "−€120: your plan spends more than you earn"), never hide.
- Child categories: budgets on children roll up to parents as today; the class is inherited from the parent and cannot differ (validate).
- Changing a class mid-month recomputes the whole month; no history rewriting. Past months keep showing their stored budgets with the class **as of now** (document this simplification).
- Group cap lower than the sum of its category budgets: warning only.
- Deleting/archiving a goal removes its allocation from the arithmetic immediately.

## Acceptance criteria

1. After migration, existing budgets show: Rent/Bills/Subscriptions under Fixed, Travel/Gifts under Non-monthly, the rest Flexible.
2. With salary €3,150, fixed €1,455, non-monthly €200, goals €300 and savings target €630 (so general savings €330), the header shows Flex = €865 and the lines add up exactly.
3. Changing Groceries from Flexible to Non-monthly changes the flex number by the budget amount and forces rollover on.
4. Bars colour: 40 % → under, 50 % → watch, 99 % → watch, 100 % → over; verified with text labels as well.
5. A group cap of €1,000 for Lifestyle with €1,150 of category budgets shows the warning.
6. The Overview "Flexible spend" card now uses the flex number and still shows the pace tick.
7. The `slipping`/`budget_over` insights still fire as before for FLEXIBLE categories and not for NON_MONTHLY.
8. Safe to spend on Overview is unchanged and still turns "Overdrawn" with a negative balance (prompt 02 regression).

## Tests

- finance-core: `flexNumber` (basic, negative, unknown income, general savings maths, fixed from recurring when no budget, rounding), `reservedSavings`, `budgetStatus` boundaries (49.99, 50, 99.99, 100, zero budget).
- API: backfill classes; `rows` with classes/groups/flags/refunds/rent share; group budget CRUD and warnings; non-monthly rollover enforcement; `ensureMonth` copying; overview card basis; ownership scoping.
- contracts: additive response schemas still parse old fixtures.
- e2e: budgets endpoint for the mock user reconciles with `/overview` and the sum of categories.

## Out of scope

Sinking-fund balances beyond the monthly amount, pots, alerts, changes to safe-to-spend (part B), payday-period budgets, user-defined category groups, editing goals in the budget.

## Finish

1. Explore the files above, post a short plan, then implement.
2. Run `pnpm install`, `pnpm --filter @finally/db db:generate`, `pnpm turbo run typecheck lint test build`; e2e if `DATABASE_URL` is reachable, else say so.
3. Report what changed, migration name, deferred items, acceptance results.
