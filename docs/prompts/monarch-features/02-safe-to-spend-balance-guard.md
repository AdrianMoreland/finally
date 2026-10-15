# 02 · Safe to spend must check the real balance

You are working in the Finally repo (personal finance, Ireland, EUR). Prerequisite: `01-foundations.md` is merged.

## Ground rules (this repo)

- pnpm 10 + Turborepo. Read `docs/ENGINEERING.md`, `PLAN.md`, `docs/prompts/monarch-features/00-plan.md` first. Full check: `pnpm turbo run typecheck lint test build`; maths tests `pnpm --filter @finally/finance-core test`; API e2e `pnpm --filter api test:e2e` (needs `DATABASE_URL`).
- Request/response shapes are Zod schemas in `packages/contracts/src`; DTO classes in `apps/api/src/common/dto.ts`; clients parse with the same schemas (`packages/api-client`). All maths is pure and tested in `packages/finance-core` on `decimal.js`; money is a decimal string in JSON. Dates are Dublin `YYYY-MM-DD` strings.
- New tables need RLS in their migration and must be added to `MeService.exportJson`/`deleteAllData`. (This prompt needs no new table.)
- Works with `BANK_PROVIDER=mock`, no third-party keys. No transaction data leaves the system.
- Web: React 19 + Tailwind v4 + shadcn, primitives in `apps/web/src/components/common.tsx`. Mobile: Expo Router + NativeWind.

## Goal and behaviour

Safe to spend is today a pure budget calculation: `(income − fixed paid − fixed remaining − savings target − flexible
spent) ÷ days to payday`. It never looks at the money actually in the account, so it can say "fine, €38 a day" while
the current account is overdrawn. Fix that. **Budgets alone must never say "fine" while the account is overdrawn.**

New behaviour:

- Safe to spend = the **smaller** of the budget-based figure and the balance-based figure.
- A status: `OK`, `TIGHT` (balance is positive today but the projected low point before payday is under the buffer), or
  `OVERDRAWN` (spendable balance is negative now, or the projected low point before payday is negative).
- The card names what is limiting you ("Your balance, not your budget, is the limit").
- When `OVERDRAWN`, the big number is the overdrawn amount in the warning colour and the budget figure appears only
  as secondary text. It never shows a positive "safe" figure.

## Read first

- `packages/finance-core/src/insights.ts`: `safeToSpend` (lines ~84–130), `cashflowForecast` (~501–570), `UpcomingItem`; tests in `insights.test.ts`.
- `apps/api/src/overview/overview.service.ts`: `safeToSpendFor`, `get`.
- `apps/api/src/insights/insights.service.ts`: `runForUser` cash-flow section (`spendingBalance` sums native-currency `Account.balance`).
- `apps/api/src/banking/banking.service.ts` (`listAccounts`), `apps/api/src/market-data/fx.service.ts` (`toEur`).
- `packages/contracts/src/money.ts` (`overviewSchema.safeToSpend`), `apps/web/src/routes/_app/index.tsx` (the Safe to spend card), `apps/mobile/app/(tabs)/index.tsx`.

## Design

### finance-core

Add `safeToSpendGuarded(input, today)` next to `safeToSpend` (keep the old function; the new one calls it for the budget leg):

```ts
interface GuardInput extends SafeToSpendInput {
  spendableBalance: string;                 // EUR, sum of spendable accounts
  upcoming: readonly UpcomingItem[];        // signed, dated, before payday (bills, recurring)
  buffer?: string;                          // default '0.00'
  avgDailyFlexible?: string;                // used for the projected low point
}
interface GuardResult {
  perDay: string; leftToPayday: string;     // min of the two legs
  budgetLeft: string; balanceLeft: string;  // both legs shown for transparency
  limitedBy: 'BUDGET' | 'BALANCE';
  status: 'OK' | 'TIGHT' | 'OVERDRAWN';
  lowest: { date: string; balance: string };
  overdrawnBy: string | null;
  draft: Draft;
}
```

- `balanceLeft = spendableBalance − Σ upcoming outflows dated (today, payday)`; inflows other than a salary that has
  already landed are ignored (conservative). Overdraft headroom is **never** added.
- `left = min(budgetLeft, balanceLeft − buffer)`; `perDay = left ÷ days` (days ≥ 1; allow negative).
- `status`: `OVERDRAWN` if `spendableBalance < 0` or the projected low (reuse `cashflowForecast` day loop with
  `avgDailyFlexible = max(perDay, 0)`) is `< 0`; `TIGHT` if low `< buffer`; else `OK`.
- The `draft` insight text follows the status; severity `ACT` for `OVERDRAWN`, `WATCH` for `TIGHT`.

### API

- Spendable balance = accounts with `type = CURRENT` and `includeInNetWorth`, each converted with `FxService.toEur`
  (balances are in the account currency; today they are summed raw, which is wrong for a GBP/USD Revolut pocket).
  Put this in one place, e.g. `BankingService.spendableBalanceEur(userId)`, and use it in `OverviewService.safeToSpendFor`
  **and** in `InsightsService.runForUser` (replace `spendingBalance`), so both agree.
- `upcoming` comes from the existing recurring series (`RecurringSeries` rows with `nextDate` in `(today, payday]`) until
  prompt 10 replaces it with occurrences. Include the fixed-category budget remainders that are not covered by a series
  so rent due before payday is not missed.
- Contracts: extend `overviewSchema.safeToSpend` with `limitedBy`, `status`, `balanceLeft`, `budgetLeft`, `lowestBalance`,
  `lowestDate`, `overdrawnBy` (nullable). Additive only; keep `perDay`, `leftToPayday`, `billsToCome`.

### Web (`apps/web/src/routes/_app/index.tsx`)

The card keeps its place. Variants: OK (as today, plus a small "Limited by your balance" line when `limitedBy=BALANCE`);
TIGHT (warn colour, "Cash gets tight on {date}: lowest {amount}"); OVERDRAWN (bad colour, big number
"Overdrawn {amount}", line "Your budget says {budgetLeft}, but the account does not have it"). Add `role="status"`
for the text. No new route. Loading and error states are the existing page skeleton / `ErrorNote`.

### Mobile (`apps/mobile/app/(tabs)/index.tsx`)

Same three variants using `Card`/`Text` primitives from `apps/mobile/src/components/ui/primitives.tsx`.

## Edge cases

- Pending payments: `Account.balance` already reflects the bank's booked balance; pending debits are not in it. Subtract
  pending SPEND rows from `balanceLeft` (they will clear before payday).
- Transfers between own accounts (AIB → Revolut) must not appear in `upcoming` or change the total spendable balance beyond
  the balances themselves.
- Refunds/rent shares are already inside the balance; do not add them again.
- Salary not yet landed: income for the budget leg still falls back to the usual salary (existing behaviour), but the
  balance leg ignores unlanded income, so a payday-eve overdraft is flagged, not hidden.
- Payday today: `daysToPayday` is at least 1 (existing); on payday itself, if salary has landed the balance leg recovers.
- Multi-currency: convert each account separately; if a rate is unknown `toEur` keeps the figure (existing behaviour) and the
  card should not crash.
- Payday periods: the cycle start/end still come from `lastPayday`/`nextPayday`; do not change them here.
- Only one CURRENT account included: fine. Zero CURRENT accounts: skip the balance leg, `limitedBy = BUDGET`, `status = OK`.

## Acceptance criteria

1. With the mock data, set `AIB Current` balance to `-120` (edit the row in the DB): the card shows "Overdrawn €120.00" in
   the warning colour and never a positive per-day figure.
2. Budgets fine (lots of flexible budget left) but balance €150 and €400 of bills due before payday: `limitedBy=BALANCE`,
   per-day is negative or zero, status `OVERDRAWN` or `TIGHT` as the projected low dictates.
3. Healthy account, healthy budget: the card looks exactly as before and `status=OK`.
4. A GBP Revolut pocket is converted to EUR in the total.
5. The `cashflow_negative` insight and the card agree on the lowest balance and date.

## Tests

- finance-core table-driven tests in `insights.test.ts`: budget-ok/balance-ok; budget-ok/balance-short; overdrawn now;
  negative budget leg; buffer; days = 1; outflows dated after payday ignored; pending debits; no spendable accounts.
- API unit test for `spendableBalanceEur` with a stubbed `FxService` (GBP, USD, unknown currency).
- e2e: set a negative balance on the AIB account and assert `/overview` returns `status: 'OVERDRAWN'`.

## Out of scope

Rewriting the budget leg (that is prompt 12/13), recurring occurrences (prompt 10), payday-period budgets.

## Finish

1. Explore the files above, post a short plan, then implement.
2. Run `pnpm turbo run typecheck lint test build` (and e2e if `DATABASE_URL` is reachable; otherwise say so).
3. Report what changed and the acceptance results.
