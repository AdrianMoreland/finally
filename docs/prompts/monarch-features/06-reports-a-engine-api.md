# 06 · Reports, part A: report engine and API (cash-flow graph, treemap tree, time series, payday periods)

You are working in the Finally repo (personal finance, Ireland, EUR, AIB + Revolut read-only). Prerequisite: `01-foundations.md`
merged (shared `TransactionFilter`, flags, ownership). Prompts 03–05 improve data quality but are not required. Part B
(`07-reports-b-charts-saved-export.md`) builds the screens.

## Ground rules (this repo)

- pnpm 10 + Turborepo. Read `docs/ENGINEERING.md`, `PLAN.md`, `docs/prompts/monarch-features/00-plan.md`. Full check: `pnpm turbo run typecheck lint test build`; `pnpm --filter @finally/finance-core test`; `pnpm --filter api test`; `pnpm --filter api test:e2e` (needs `DATABASE_URL`).
- Zod 4 schemas in `packages/contracts/src` (add `reports.ts` and export it from `index.ts`); DTOs in `apps/api/src/common/dto.ts`; `packages/api-client` parses with the same schemas. All maths is pure in `packages/finance-core` (decimal.js, Vitest); money = decimal strings; dates = Dublin `YYYY-MM-DD`.
- Prisma migrations in `packages/db/prisma/migrations`; new tables get RLS + REVOKE and join `exportJson`/`deleteAllData`.
- Mock bank, no keys, no third-party calls.

## Goal and behaviour

An engine that answers "where did the money come from and go" for any slice of my data:

- **Time frames:** month, quarter, year, all time, custom range, and **by payday period** (a period runs from one payday to the day before the next).
- **Group by:** category, category group, merchant, account, owner (mine / partner / shared), or tag.
- **Outputs:** (1) totals and a **stacked time series** of spending and income, (2) a **cash-flow graph** for a Sankey (income sources → one pool → category groups → categories, plus a "saved" or "from savings" node), (3) a **hierarchical tree** for a treemap that drills category → merchant (→ transactions via the normal list endpoint).
- Respects the shared `TransactionFilter` (accounts, owners, categories, tags, status, `includeExcluded`).
- Compare with the previous period.

## Read first

- `apps/api/src/data/finance-data.service.ts` (`coreTxs`, `spendByCategory`, `CategoryInfo`), `packages/finance-core/src/types.ts` (`CoreTx`, `CoreCategory`), `dates.ts` (`nextPayday`, `lastPayday`, `monthRange`, `addMonths`), `signals.ts` (`effectivePayday`), `decimal.ts`.
- `apps/api/src/transactions/transaction-filter.ts` and `packages/contracts/src/core.ts` (`transactionFilter`) from prompt 01.
- `apps/api/src/overview/overview.service.ts` (how income and spend are totalled; `topCategories`, rent exclusion), `apps/api/src/budgets/budgets.service.ts`.
- `packages/finance-core/src/insights.ts` (`savingsRate`, `isSpend`), `insights.test.ts` for test style.
- `apps/api/src/me/me.service.ts` (`csvCell`, `exportCsv`), `packages/db/prisma/schema.prisma`.

## Semantics (write them into `docs/ENGINEERING.md` under "Reports")

- **Spending** = `SPEND` minus `REFUND` per category (rent shares are REFUNDs in Rent, so Rent is net). **Income** = `INCOME` only.
  `TRANSFER` is excluded always (a flag `includeTransfers` exists for completeness and is false by default for reports).
  `excludeFromBudgets` payments are excluded unless `includeExcluded`.
- **Net** = income − spending. **Savings rate** = net ÷ income (null when income is 0).
- A category whose net for the period is negative (refunds exceed spending) is shown as an income-side node "Refunds and reimbursements" in the cash-flow graph and as 0 in breakdowns, with a note in the response.
- Amounts are `amountEur` (converted once at ingest). The response has `currencyNote: 'Amounts are converted to EUR at the rate on the booking date'` and a count of non-EUR payments in the range.
- Pending payments are included by default (`includePending: true`), because budgets and the dashboard already do.
- Children roll up into parents for the treemap and cash-flow graph (`parentId`); the stacked series and breakdown let the caller pick `depth: 1 | 2`.

## Contracts (`packages/contracts/src/reports.ts`)

```ts
reportTimeframe = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('month'), month: monthKey }),
  z.object({ kind: z.literal('quarter'), year: z.number().int(), quarter: z.number().int().min(1).max(4) }),
  z.object({ kind: z.literal('year'), year: z.number().int() }),
  z.object({ kind: z.literal('all') }),
  z.object({ kind: z.literal('custom'), from: dateOnly, to: dateOnly }),
  z.object({ kind: z.literal('payday'), anchor: dateOnly.optional(), count: z.number().int().min(1).max(24).default(1) }), // the period containing `anchor` (default today) and the previous count-1
]);
reportGroupBy = z.enum(['category', 'categoryGroup', 'merchant', 'account', 'owner', 'tag']);
reportQuery = z.object({
  timeframe: reportTimeframe,
  groupBy: reportGroupBy.default('category'),
  depth: z.union([z.literal(1), z.literal(2)]).default(1),
  granularity: z.enum(['auto', 'day', 'week', 'month', 'payday']).default('auto'),
  filter: transactionFilter.omit({ from: true, to: true, kinds: true }).partial().default({}),
  includePending: z.boolean().default(true),
  includeExcluded: z.boolean().default(false),
  compare: z.boolean().default(false),
  topN: z.number().int().min(3).max(30).default(12),   // the rest become "Other"
});
```
Responses: `reportSummary` (resolved `period {from,to,label}`, `previousPeriod`, `totals {income, spending, net, savingsRate}`,
`groups[{key,label,colour,total,share,count,previousTotal?,delta?}]`, `series {buckets[{key,label,from,to,total,byGroup{}}], groupKeys[]}`, `incomeSeries`, notes),
`cashflowGraph` (`nodes[{id,label,colour,side:'income'|'pool'|'group'|'category'|'saved'|'deficit'}]`, `links[{source,target,value}]`, `totals`),
`treemapNode` (recursive: `{id,label,colour,value,count,kind:'group'|'category'|'merchant', children?}` plus `path[]`; depth-limited and lazy via `node` + `depth` params),
`paydayPeriods`.

## finance-core: `reports.ts`, `periods.ts` (+ tests)

- `periods.ts`: `resolveTimeframe(tf, today, paydayDay)` → `{from,to,label}`; `previousPeriod(period)`; `paydayPeriods(from, to, paydayDay)` →
  `[{start,end,label}]` using `effectivePayday(month, paydayDay)` for each start (weekend paydays move to the preceding Friday; a short month clamps the day);
  `periodFor(date, paydayDay)`; `buckets(period, granularity)` (`auto`: ≤ 45 days → day, ≤ 190 → week, else month; payday timeframe → payday periods).
  All inclusive Dublin dates; no `Date` local-time arithmetic (use `addDays`/`diffDays`).
- `reports.ts`: `summarise(txs, categories, query-derived options)`, `buildCashflowGraph(txs, categories, opts)`, `buildTree(txs, categories, opts, node?)`, `groupKeyOf(tx, groupBy, lookups)`.
  Cash-flow graph rules: income nodes by merchant (salary, etc.; small ones below `topN` roll into "Other income"); pool node "Cash flow";
  group nodes = `CategoryGroup` (Essentials / Lifestyle / Savings); category nodes = top categories in each group, rest "Other"; if spending > income add a source "From savings and balance" for the gap,
  if income > spending add a sink "Left over"; **conservation:** Σ links into each node equals Σ links out (test it). Savings-group category spend is a normal sink (money moved to savings).
- Owner grouping uses the effective ownership of each `CoreTx` (prompt 01).

## API

`apps/api/src/reports/` (`reports.module.ts`, `.controller.ts`, `.service.ts`). All `POST` with a JSON body because the query is nested, all read-only, all
`@ApiBearerAuth` + `@ZodSerializerDto`:

| Route | Returns |
|-------|---------|
| `POST /reports/summary` | `reportSummary` |
| `POST /reports/cashflow` | `cashflowGraph` |
| `POST /reports/treemap` | `treemapNode` (body adds `node?: string` path id and `depth?: 1..3`, default 2) |
| `POST /reports/periods` | `{ current, previous, list: paydayPeriods for the last 12 }` |

`ReportsService` resolves the timeframe with the user's `paydayDayOfMonth`, builds the Prisma where with `buildTransactionWhere` (kinds default to
SPEND, REFUND, INCOME; transfers excluded), loads rows with a narrow `select` (no `rawDescriptor` unless grouping by merchant needs the name), maps to `CoreTx`
via `FinanceDataService`, then calls the pure functions. The `previousPeriod` summary re-runs with the same filter. Cap: ranges over 10 years or 200,000 rows → 400 with a clear message. Add an index
`@@index([userId, kind, bookingDate])` if the plan shows a seq scan on the 12-month case.

## Web and mobile

None in this prompt except typed client methods and hooks in `packages/api-client` (`useReportSummary(query)`, `useCashflow(query)`, `useTreemap(query, node)`, with `keepPreviousData`).

## Edge cases

- **Pending vs posted:** included by default; the response flags `pendingCount` and `pendingTotal` so the UI can say "includes €84 pending".
- **Refunds:** netted into the original category; negative nets handled as above.
- **Transfers between own accounts:** excluded. An unpaired transfer to a friend marked as TRANSFER is excluded too; mention this in `notes` when unpaired transfers exist in the range ("3 unpaired transfers excluded").
- **Rent shares:** Rent is net; roommates' credits never show as income.
- **Multi-currency:** EUR only; count of foreign-currency payments in `notes`.
- **Payday periods:** the first and last period may be partial in the range; label them "(partial)". Paydays on a weekend use `effectivePayday`. A `payday` timeframe with `count: 3` returns three bars. An invalid `paydayDayOfMonth` (31) clamps per month.
- **Time zones:** bucketing uses Dublin dates (`dublinDate`), including around DST changes at 01:00 UTC; test 2026-03-29 and 2026-10-25.
- Empty ranges return zero totals and empty arrays (not 404, not NaN). Savings rate with zero income is `null`.
- Group by tag: a payment with several tags counts once per tag in groups, but totals count it once (`notes` says so). Untagged → "Untagged".
- Group by owner when no PARTNER exists: only "Mine" (and "Shared" if used).
- Large merchants lists: `topN` + "Other"; "Other" is never clickable-to-drill but exposes `otherKeys`.

## Acceptance criteria

1. `POST /reports/summary` with `{timeframe:{kind:'month',month:'2026-09'}, groupBy:'category'}` totals match the sum of September rows in the DB (check by SQL) and `/budgets?month=2026-09` `totalSpent` for budgeted categories.
2. Switching `groupBy` to `merchant`, `account`, `categoryGroup`, `owner`, `tag` all return totals equal to the `category` run.
3. `payday` timeframe returns periods that start on the effective payday and end the day before the next; Sept 28 2026 → Oct 27 2026 with payday 28.
4. `cashflow` graph conserves flow at every node and includes "Left over" or "From savings and balance".
5. `treemap` drill: root → group → category → merchant values add up at each level.
6. Rent share credits reduce Rent and do not appear in income.
7. 5 years of synthetic data (generate in a test) returns in under 1 s on the dev machine (log the measured time in your report).

## Tests

- finance-core: periods (month/quarter/year/custom/payday, weekend payday, 29/30/31-day clamps, DST dates, partial first/last periods); `summarise` (refunds, rent share, excluded, pending toggle, negative category nets, savings rate null); cash-flow conservation (property-style: random transaction sets keep Σin = Σout); tree sums; tag multi-count; owner grouping.
- API unit: query → where mapping, caps, `previousPeriod`; e2e: summary/cashflow/treemap against the mock data with invariants (sum of groups = total; graph conservation).
- contracts: `reportQuery` defaults and rejection of bad timeframes.

## Out of scope

Charts/UI, saved reports, CSV export (prompt 07); budgets in reports; forecasting; shared household login.

## Finish

1. Explore the files above, post a short plan, then implement.
2. Run `pnpm install`, `pnpm --filter @finally/db db:generate` (if schema touched), `pnpm turbo run typecheck lint test build`; e2e if `DATABASE_URL` is reachable, else say so.
3. Report what changed, migration (if any), measured performance, acceptance results.
