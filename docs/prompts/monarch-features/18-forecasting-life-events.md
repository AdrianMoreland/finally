# 18 · Forecasting with life events: raises, bonuses, moving out, starting to invest, side-by-side scenarios

You are working in the Finally repo (personal finance, Ireland, EUR, AIB + Revolut read-only). Prerequisites: `01`, `08` (net worth, liabilities), `09` (goals), `12` (flex number / budget classes);
`10` (recurring income) helps. **Build on the existing FIRE / compound / loan code in `finance-core` and the Tools page; do not duplicate it.**

## Ground rules (this repo)

- pnpm 10 + Turborepo. Read `docs/ENGINEERING.md`, `PLAN.md`, `docs/prompts/monarch-features/00-plan.md`. Full check: `pnpm turbo run typecheck lint test build`; `pnpm --filter @finally/finance-core test`; `pnpm --filter api test`; `pnpm --filter api test:e2e` (needs `DATABASE_URL`).
- Zod 4 schemas in `packages/contracts/src`; DTOs in `apps/api/src/common/dto.ts`; `packages/api-client` parses with the same schemas. All maths is pure in `packages/finance-core` (decimal.js, Vitest). Money = decimal strings; dates Dublin `YYYY-MM-DD`.
- Prisma migrations; new tables get RLS + REVOKE and join `exportJson`/`deleteAllData`. Queries scoped by `userId`.
- Mock bank, no keys. No transaction data to third parties; deterministic maths only (no LLM, no Monte Carlo in this prompt).
- Tax figures are estimates: show `TAX_DISCLAIMER` (`packages/contracts/src/common.ts`). **The PAYE/USC/PRSI engine described in the brief does not exist in this repo** (see the plan), so income inputs are **take-home** with an editable take-home percentage; rates for investment tax come from the `TaxRule` table (`ruleOn`), never hard-coded.
- Web: React 19, Tailwind v4, shadcn, recharts, TanStack Router. Mobile: Expo Router + NativeWind + victory-native.

## Goal and behaviour

A **Forecast** page where I:

1. See a **baseline** projection built from my real data (take-home pay, spending by Fixed/Flexible/Non-monthly, savings, investments, loans) with every assumption visible and editable.
2. Add **life events** to a scenario: *Raise*, *Bonus*, *Move out* (rent and bills change, deposit), *Start investing* (monthly amount, expected return, wrapper), plus *Custom* (one-off or recurring ± amount).
3. Compare **up to four scenarios side by side** (baseline + 3): net worth over time, cash low points, savings rate, when I reach financial independence (the existing FIRE number), with deltas against the baseline.
4. Save, rename and delete scenarios.

## Read first

- `packages/finance-core/src/calculators.ts` (`compoundGrowth`, `fireNumber`, `loanPayoff`, `monthlyRate`), `calculators.test.ts`, `insights.ts` (`cashflowForecast`, `netWorthSeries`, `savingsRate`), `tax.ts` (`ruleOn`, `exitTaxOn`, `whereShouldItGo`, `CoreTaxRule`), `holdings.ts`.
- `packages/contracts/src/tools.ts` (`fireBody/Response`, `compoundBody`, `loanBody`), `apps/api/src/tools/*` (restored in prompt 01), `apps/web/src/routes/_app/tools.tsx` (FIRE and compound tabs, `Range`, `Field`), `apps/mobile/app/tools.tsx`.
- `apps/api/src/investments/investments.service.ts` (current value, tax rules loading), `apps/api/src/net-worth/*` (08), `GoalsService` (09), `BudgetsService` flex/classes (12), `RecurringService` (10), `OverviewService.safeToSpendFor` (median salary logic).
- `apps/web/src/components/charts/charts.tsx#GrowthChart`, `components/common.tsx`.

## Data model (migration `<next timestamp>_forecast_scenarios`)

```prisma
model Scenario {
  id String @id @default(cuid())
  userId String
  name String
  isBaseline Boolean @default(false)         // at most one per user (partial unique index in SQL)
  assumptions Json                           // scenarioAssumptions, versioned
  events Json                                // lifeEvent[], versioned
  schemaVersion Int @default(1)
  position Int @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, position])
}
```
RLS + REVOKE; export; delete-all. Max 10 scenarios per user. SQL: `CREATE UNIQUE INDEX ... ON "Scenario"("userId") WHERE "isBaseline"`.

## finance-core: `forecast.ts` (+ `forecast.test.ts`)

```ts
interface Assumptions {
  startMonth: string; horizonYears: number /* 1..50, default 30 */;
  monthlyTakeHome: string;            // net pay
  monthlyFixed: string; monthlyFlexible: string; monthlyNonMonthly: string;
  cash: string;                       // spendable + savings cash
  investments: string; investmentReturnPct: number /* default 5 */; cashReturnPct: number /* default 1.5 */;
  monthlyInvesting: string;           // existing regular investing
  liabilities: Array<{ id; name; balance; aprPct; payment }>;   // from manual liabilities
  inflationPct: number /* default 2.5 */; realTerms: boolean;
  takeHomeSharePct: number /* default 52: share of a GROSS raise/bonus that reaches the bank; editable, labelled an estimate */;
  fireAnnualSpend?: string; fireWithdrawalPct: number /* default 4 */;
  investmentTax: { regime: 'EXIT_TAX'|'CGT'|'INVESTMENT_ACCOUNT'|'NONE'; rulesInForce: CoreTaxRule[] };
}
type LifeEvent =
 | { id; type: 'RAISE'; from: string; mode: 'TAKE_HOME'|'GROSS'; amountPerYear: string }
 | { id; type: 'BONUS'; date: string; mode: 'TAKE_HOME'|'GROSS'; amount: string; repeatYearly?: boolean }
 | { id; type: 'MOVE_OUT'; date: string; newMonthlyRent: string; oldMonthlyRent: string; extraMonthlyBills: string; oneOffCosts: string; deposit: string }
 | { id; type: 'START_INVESTING'; from: string; monthlyAmount: string; expectedReturnPct?: number; fundedBy: 'CASHFLOW' }
 | { id; type: 'CUSTOM'; from: string; to?: string; monthlyAmount: string /* signed */; oneOff?: boolean; label: string };
simulate(assumptions, events, today): { months: MonthRow[]; summary: Summary }
```
Monthly engine (deterministic, decimal.js): each month = take-home (+ raises, bonuses) − fixed − flexible − non-monthly (± move-out changes, ± custom) − liability payments − monthly investing (starting-investing events add to it); surplus goes to cash; **shortfall reduces cash and may go negative: it is never auto-liquidated from investments** (flag `cashNegativeFrom`). Investments compound monthly at `monthlyRate(investmentReturnPct)` (share the existing helper), cash at the cash rate; liabilities amortise (reuse the `amortise` logic; export it) and drop off when paid; deposits/one-offs come out of cash in their month. Raises: `TAKE_HOME` adds the amount; `GROSS` adds `amount × takeHomeSharePct/100`. Bonuses likewise. Investment tax: **reported, not deducted from the series**: `summary.exitTaxEstimateAtHorizon` uses `exitTaxOn(gain)` for EXIT_TAX (and deemed-disposal note), CGT with the annual exemption (`cgtOn`), INVESTMENT_ACCOUNT charge — all through the `rulesInForce` for the relevant date; and a toggle `afterTax` that applies it to the final figure only.
`MonthRow`: `{month, takeHome, spending, surplus, cash, investments, liabilities, netWorth, savingsRatePct}`. Real terms: deflate by `(1+inflation)^(years)`. `Summary`: net worth at 1/5/10/20 years and horizon, lowest cash (value + month), `cashNegativeFrom`, average savings rate, `freedomMonth` (first month `investments ≥ fireNumber(annualSpend, withdrawalPct)`, using the existing `fireNumber` target maths; annual spend = (fixed+flexible+non-monthly)×12 after events, evaluated at that month), `debtFreeMonth`.
`compareScenarios(results[]) ` → per-metric deltas vs the baseline and a `winnerBy` map. Pure and tested.
Refactor: `fireNumber` and `compoundGrowth` keep their signatures and tests; extract and export `monthlyRate`/`amortise` for reuse. Add a regression test that `simulate` with no events and zero spending equals `compoundGrowth` for the same inputs.

## API

`apps/api/src/forecast/`:

- `GET /forecast/baseline` → `{assumptions, provenance}` where `provenance` explains each number ("take-home = median of the last 3 salaries: €2,610", "fixed = Σ FIXED budgets this month", "investments = current portfolio value", "liabilities = your manual loans"). Sources: median `INCOME ≥ €1,000` as in `safeToSpendFor` (or recurring income item if present), budget classes from prompt 12 (fall back to last-3-month average spend by `FIXED_CATEGORY_SLUGS` when no budgets), `InvestmentsService.totalValue`, EUR balances (`balancesEur`) for cash (CURRENT+SAVINGS+VAULT), manual liabilities with APR/min payment, tax rules from `TaxRule`.
- `POST /forecast/run` body `{assumptions, events}` or `{scenarioId}` → `{months, summary}` (stateless, not saved). `POST /forecast/compare` body `{scenarioIds: string[2..4]}` → results + deltas.
- `GET/POST/PATCH/DELETE /forecast/scenarios` (+ duplicate: `POST /forecast/scenarios/:id/duplicate`). Validation: dates within horizon, amounts sane (|amount| ≤ €10M), max 20 events per scenario, MOVE_OUT `date` ≥ today − 1 month, no two baselines.
- Contracts in `packages/contracts/src/forecast.ts`; hooks `useBaseline`, `useScenarios`, `useRunScenario`, `useCompare` (debounced run for the editor).
- Tools page "FIRE" tab gets a "Use my numbers → Forecast" link. Keep `/tools/fire` unchanged.

## Web UI: `/forecast` (nav "Forecast", lucide `TrendingUp` is taken: use `Telescope`/`LineChart`)

- **Header:** scenario tabs (Baseline + saved scenarios, "+ New scenario", duplicate, rename, delete), horizon select, nominal/real toggle, after-tax toggle, `TAX_DISCLAIMER`.
- **Assumptions panel** (collapsible, shadcn `Accordion`-style via `Collapsible` or a Sheet): every field of `Assumptions` with its provenance text and a "Reset to my data" per field; sliders for return and inflation (reuse `Range` from the Tools page — move it into `components/` first).
- **Life events timeline:** list/cards ordered by date with icon per type; "Add event" menu (Raise, Bonus, Move out, Start investing, Custom) opens a Dialog with a type-specific form and a plain-language preview ("From 1 Mar 2027, +€4,800 a year take-home"). Edit/delete/disable-toggle per event (disabled events are kept but ignored — handy for "what if").
- **Results:** line chart of net worth over time for the selected scenarios (up to four, distinct colours + dash styles + direct labels, legend toggle), a secondary chart for cash with the zero line, a **comparison table** (net worth at 1/5/10/20 years, horizon, lowest cash and when, cash negative from, avg savings rate, freedom month/date, debt-free date) with deltas vs baseline (green/red plus ▲▼ text), and key warnings ("Cash goes negative in Jun 2028 in Move out").
- **Compare mode:** pick 2–4 scenarios via checkboxes; URL holds the selection `?compare=a,b,c`.
- States: skeleton; empty ("Your baseline is ready. Add a life event to see what changes."); error with retry; validation inline; keyboard accessible; chart "Table view" toggle; mobile width stacks panels.
- Performance: `simulate` for 50 years is 600 rows; run server-side (single request); debounce inputs 300 ms; keep the previous result visible while recomputing.

## Mobile

Forecast screen under More: baseline summary, saved scenarios list, tap two to compare (summary table + a victory-native line chart), toggle events on/off, edit amounts of existing events; creating new event types and the assumptions editor are web-first (show "Edit on the web" for deep assumptions).

## Edge cases

- **Pending vs posted / refunds / transfers / rent shares:** the baseline uses completed months and the same netting rules as budgets and reports (refunds net, transfers excluded, rent shares net Rent); say "based on your last 3 full months".
- **Multi-currency:** cash and liabilities are converted to EUR at today's rate; the forecast is in EUR only.
- **Payday periods:** the forecast is monthly; the first month is the current calendar month and uses a prorated remainder when `startMonth` is today's month (state the rule: remaining fraction of the month for income and spending).
- **Moving out:** `oldMonthlyRent` defaults from the Rent budget/actuals and, when rent shares exist, the **net** rent; the new rent is gross (no roommates) unless the user enters otherwise.
- Salary only 2 months of history or none (new user / mock): fall back to the `User` default and a clearly marked "estimated" provenance; never crash on missing data.
- Negative surplus from month 1: allowed; `cashNegativeFrom` set; the page leads with that warning.
- Events dated before `startMonth` apply from the start; after the horizon are ignored with a notice.
- Overlapping raises compound additively (document); two bonuses same month sum.
- Real vs nominal toggling must not change the underlying months, only the displayed values.
- Liability with payment < interest: never pays off, warn and stop amortising growth at 3× original balance.
- Very long horizon with zero return: linear, no division by zero.
- Investment events when cash is negative: the contribution still happens (shortfall shown) and a warning appears ("this plan invests money you don't have in month x").
- Tax: if no `TaxRule` is in force for a date, skip the tax estimate and say why.
- Scenario JSON from a future schema version: reject with a clear message, don't crash.

## Acceptance criteria

1. Baseline loads from the mock data with provenance on every field; its 10-year net worth equals a hand calculation using the same assumptions (documented in a test).
2. Add "Raise €6,000/yr gross from 1 Jan 2027" (52 % take-home): monthly surplus increases by €260; net worth at 10 years increases accordingly; the delta table shows it.
3. "Move out" with new rent €1,500 vs old €1,100 + deposit €3,000: cash drops by the deposit in that month and surplus falls by €400 + extra bills; the plan flags if cash goes negative.
4. "Start investing €300/mo at 6 %": investments grow, surplus falls by €300, freedom month moves earlier/later as the maths dictate; exit tax estimate appears in the summary using the rule in force for the horizon date.
5. Compare baseline + 3 scenarios: chart, table, deltas, and URL state work; a fifth is rejected.
6. `fireNumber` and `compoundGrowth` unit tests still pass unchanged; `simulate` with no events/spending equals `compoundGrowth`.
7. Real-terms toggle changes values by the inflation factor only.
8. Deleting a scenario and "Delete all data" behave; export includes scenarios.

## Tests

- finance-core: `simulate` (no-op equals compoundGrowth; each event type; combinations; first-month proration; negative cash; liabilities payoff and never-pays-off; real vs nominal; horizon edges; rounding stability), `compareScenarios`, tax summary with rules changing on a date, freedom month with changing spend.
- API: baseline provenance with/without budgets, missing data fallbacks; scenario CRUD validations and limits; compare input limits; unique baseline index; schema-version rejection.
- contracts: `lifeEvent` discriminated union validation.

## Out of scope

Monte Carlo / market-return distributions, a PAYE/USC/PRSI calculator (open question 12), pensions tax relief modelling, property purchase/mortgage modelling beyond the existing loan maths, inflation by category, sharing scenarios, LLM narration.

## Finish

1. Explore the files above, post a short plan, then implement.
2. Run `pnpm install`, `pnpm --filter @finally/db db:generate`, `pnpm turbo run typecheck lint test build`; e2e if `DATABASE_URL` is reachable, else say so.
3. Report what changed, migration name, deferred items, acceptance results.
