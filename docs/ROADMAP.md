# Finally Roadmap

Single source of truth for what to build and in what order. Built from `PLAN.md` (milestones and open questions) and a gap analysis of the app against the features a mature personal finance app offers. Nested `- [ ]` checklists, so it pastes into any task tool.

**Last consolidated:** 2026-10-16 · statuses checked against the code on that date

## How to read this

- **Phases:** `0` = finish and harden what exists · `1` = transactions and rules foundations · `2` = reports and budgeting · `3` = recurring, net worth and goals · `4` = recap, dashboard, receipts, splits and scenarios.
- **Priority:** 🔴 P0 do now / blocks other work · 🟠 P1 high value, next · 🟡 P2 planned · ⚪ P3 idea / icebox.
- **Effort:** S (≤ 1 day) · M (2 to 5 days) · L (1+ week) · XL (multi-week, needs a plan first). A guess, not a promise.
- **`← depends: X`** = do not start before X. **`[BANK]`** = needs a real bank connection. **`[DECISION]`** = needs a choice from the owner first (see Open decisions).
- `[x]` = done, taken from the code on the consolidation date. **Verify in code before claiming something is done or missing**: this file can lag the repo.
- Work in the order given by "Suggested sequencing" at the bottom, not by section number. Section IDs are stable labels, not a queue.

## Ground rules (apply to every phase)

1. All finance maths is pure, tested code in `packages/finance-core`. Apps and services only call it. Money is `decimal.js`; JSON carries decimal strings.
2. Every request and response shape is a Zod schema in `packages/contracts`, validated on the server and parsed on the client.
3. Everything works with `BANK_PROVIDER=mock` and `MARKET_DATA_PROVIDER=mock` and no third-party keys. A feature that needs a third party sits behind an env flag that is off by default.
4. Store UTC, display Europe/Dublin. Dates in finance-core are Dublin `YYYY-MM-DD` strings.
5. Every table has row-level security on with no policies, and every query is scoped by `userId`. New migrations repeat the RLS block.
6. Transfers are never spending or income; refunds and rent shares net against the category they came from; pending transactions count.
7. Privacy mode must mask every new amount, including chart tooltips. The phone gets a working view of every feature, simplified where a chart is web-only.
8. Insights, signals and tax figures are information and estimates, never advice.

## Phase 0: finish and harden what exists

### 0.1 Built so far
- [x] Sync, categorise, ask once, remember (rules, answer scopes, evening digest, quiet hours)
- [x] Today, Money, Plan and Grow on web and phone; Ask as a search bar on every page
- [x] Safe to spend, budgets, bills, month, review, cash flow (Sankey)
- [x] Rent you front (splits, shares, rounds, reminders)
- [x] Pots, people, payday plan, bonus planner, Irish tax and pay estimates
- [x] Investing signals, practice account, freedom number, holdings
- [x] Design tokens from one source, with a Figma export
- [x] Mock bank (real statement export plus generated transactions) and mock market data

### 0.2 Real bank connection (Enable Banking) 🟠 M `[BANK]`
- [ ] Run the AIB and Revolut flow end to end against the linked accounts in restricted production
- [ ] Confirm the bank names in `ASPSP` against the Control Panel
- [ ] Check the consent-expiry warning and the four-refreshes-a-day limit on real data

### 0.3 Market data provider 🟡 S `[DECISION]`
- [ ] Choose Finnhub or Twelve Data (open decision 1) and run it with real quotes
- [ ] Show provider errors and stale quotes honestly on Holdings

### 0.4 Push on a real iPhone 🟡 M
- [ ] EAS development build with APNs credentials
- [ ] Verify the per-ask-group notification buttons answer without opening the app

### 0.5 Continuous integration 🟠 S
- [ ] A workflow that runs `pnpm turbo run typecheck lint test build` on every pull request to `main`
- [ ] A separate job for `pnpm --filter api test:e2e` against a throwaway database
- [ ] Dependency audit, report-only

### 0.6 Staging and backups 🟡 M
- [ ] A second Supabase project for staging; migrations promoted from there
- [ ] Confirm backup retention on the current plan

### 0.7 Phone: rent shares, splits, overdraft and spending 🟠 L ← depends: the web build of the same items
- [ ] Settings: rent amounts per person with effective-from months; overdraft limit and keep-free amount per account
- [ ] Transaction detail: split editor (parts, non-cash part), mark a credit as a rent share (just this once or every time, month picker)
- [ ] To sort and Today: the credit ask ("whose rent share is this?"), the overdraft note, the short-credit item
- [ ] Spending view with category and date totals; Budgets totals row with spending outside budgets
- [ ] Privacy mode masks every new amount

## Phase 1: transactions and rules foundations

### 1.1 Transactions foundation 🔴 L
- [ ] Activity log: who or what changed a transaction, shown on the transaction
- [ ] Edits survive a pending transaction becoming a booked one
- [ ] Fix dedupe so two identical transactions on one day are kept on CSV import
- [ ] Multi-select, bulk edit, hideable columns on the Transactions page
- [ ] Phone: bulk edit is simplified to a single list action

### 1.2 Rules engine 🟠 L ← depends: 1.1
- [ ] Rule conditions beyond the merchant: amount range, account, direction
- [ ] Several actions per rule, ordered priority, preview, apply to past transactions
- [ ] Pure functions in finance-core with table-driven tests; rules stay deterministic

### 1.3 Merchants and rules screens 🟠 M ← depends: 1.2
- [ ] Rules screen and merchants screen
- [ ] Rename and merge merchants; a local logo map (no third-party calls)
- [ ] "Every time" in the ask flow writes a rule

## Phase 2: reports and budgeting

### 2.1 Owner on accounts and transactions 🟡 S `[DECISION]` ← depends: 1.1
- [ ] Mine, partner or shared as a label; owner filter on everything that aggregates
- [ ] Data model ready for a second login later; nothing about it ships now (open decision 2)

### 2.2 Reports engine 🟠 L ← depends: 2.1
- [ ] Group by category, merchant, account or owner; shared `resolvePeriod` (month, quarter, year, custom, payday period)
- [ ] Saved reports; filtered CSV export with euro and original-currency columns

### 2.3 Reports screens 🟠 L ← depends: 2.2
- [ ] Sankey, treemap and stacked bars on web; simplified views on the phone
- [ ] Route `/money/reports`

### 2.4 Flexible budgeting core 🟠 L
- [ ] Fixed, flexible and non-monthly classification per category (replace the ten hard-coded budget slugs)
- [ ] Flex number; non-monthly funds backed by pots; group-level budgets alongside category budgets
- [ ] Safe to spend stays correct over any flexible set

### 2.5 Flexible budgeting screens 🟠 M ← depends: 2.4
- [ ] Budgets page with groups, thresholds and alerts, web and phone

## Phase 3: recurring, net worth and goals

### 3.1 Recurring engine 🟠 L ← depends: 1.3
- [ ] One detector (weekly, monthly, quarterly, yearly) with a persisted item model, replacing the two detectors
- [ ] Manual items, "not recurring", matching to transactions, bounced and re-presented transactions

### 3.2 Recurring calendar 🟡 M ← depends: 3.1
- [ ] Calendar and list views, reminders, income (payday, rent shares) in the calendar

### 3.3 Net worth 🟡 M
- [ ] Manual assets and liabilities with history; credit-limit and overdraft use
- [ ] One definition of net worth shared by Month and Today

### 3.4 Goals 🟡 M ← depends: 3.3, 2.4
- [ ] One goals view over pots and liabilities; allocation lines in the budget
- [ ] Interest-aware snowball and avalanche calculator (rates entered by hand)

## Phase 4: recap, dashboard, receipts, splits, scenarios

### 4.1 Weekly recap 🟡 M ← depends: 2.2, 2.5, 3.1, 3.3
- [ ] Deterministic recap generator, dashboard card, richer push
- [ ] Optional email behind a flag, off by default, amount-free by default (open decision 3)

### 4.2 Customisable dashboard 🟡 M ← depends: 2.3, 3.2, 3.3, 3.4, 4.1
- [ ] Widget registry; layout stored in `User.prefs`; add, hide and reorder on web and phone
- [ ] Tidy navigation: Money gets a "More" group (open decision 6)

### 4.3 Receipts 🟡 M `[DECISION]` ← depends: 1.1
- [ ] Private storage bucket with signed URLs issued by the API (open decision 4)
- [ ] Attach to a transaction on web and phone

### 4.4 Split transactions 🟡 L ← depends: 2.2, 2.4, 3.1, 4.3
- [ ] Split one transaction into items; splits expand into lines wherever totals are loaded
- [ ] Golden tests over reports, budgets and recurring before it ships (it changes every spending total)

### 4.5 Forecast scenarios 🟡 L ← depends: 3.3, 3.4
- [ ] Life events (raise, bonus, move out, start investing) and side-by-side comparison
- [ ] Saved scenarios, reusing the freedom and tax maths

## Open decisions

1. Market data provider: Finnhub or Twelve Data. Default: undecided; mock until chosen.
2. Does anyone else get a login? Default: no. Model the data so it can happen; ship a label only.
3. Weekly recap by email? Default: push and in-app card now; email behind a flag, off.
4. Receipt storage. Default: private Supabase Storage bucket, 5 MB, JPEG, PNG, WebP or PDF.
5. Debt interest rates. Default: entered by hand per liability; nothing fetched.
6. Navigation once Money has many pages. Default: six main pages plus a "More" group, done with the dashboard.

## Suggested sequencing

1. 0.5 CI first, so every later slice has a gate.
2. 1.1, then 1.2 and 1.3.
3. 2.1, then 2.2 and 2.3 in parallel with 2.4 and 2.5 (separate branches; never two branches editing `schema.prisma` at once).
4. 3.1 and 3.2, 3.3 and 3.4.
5. 4.1, 4.2, then 4.3 to 4.5 as wanted.
6. 0.2, 0.3 and 0.4 whenever the accounts and credentials are available; they do not block the build.

## Icebox

- ⚪ Joint login and household sharing beyond a label
- ⚪ Open-banking providers beyond Enable Banking
- ⚪ Automated investment execution (the app reads and signals only)
