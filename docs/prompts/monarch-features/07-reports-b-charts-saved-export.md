# 07 · Reports, part B: Reports screen (Sankey, treemap, stacked bars), saved reports, filtered CSV export

You are working in the Finally repo (personal finance, Ireland, EUR, AIB + Revolut read-only). Prerequisite: `06-reports-a-engine-api.md`
merged (`/reports/*`, `reportQuery`, hooks). Prompt 05's filter bar helps if it exists.

## Ground rules (this repo)

- pnpm 10 + Turborepo. Read `docs/ENGINEERING.md`, `PLAN.md`, `docs/prompts/monarch-features/00-plan.md`. Full check: `pnpm turbo run typecheck lint test build`; `pnpm --filter api test`; `pnpm --filter api test:e2e` (needs `DATABASE_URL`).
- Zod 4 schemas in `packages/contracts/src`; DTOs in `apps/api/src/common/dto.ts`; `packages/api-client` parses with the same schemas. Money = decimal strings. Dates = Dublin `YYYY-MM-DD`. Maths stays in `packages/finance-core`.
- New tables: RLS + REVOKE in their migration, added to `MeService.exportJson`/`deleteAllData`. Queries scoped by `userId`.
- Mock bank, no keys, no third-party calls. Chart colours come from the design tokens (`packages/tokens`, `apps/web/src/lib/category.ts#categoryVar`), never hard-coded hex; support light and dark.
- Web: React 19, Tailwind v4, shadcn, **recharts 3** (already used in `apps/web/src/components/charts/charts.tsx` with the shadcn `ChartContainer`), TanStack Router file routes. Mobile: Expo Router, NativeWind, victory-native + skia (no Sankey/treemap).

## Goal and behaviour

A **Reports** page where I can:

1. See a **cash-flow Sankey**: income sources → pool → category groups → categories.
2. Explore a **treemap**: click a category to drill into merchants; click a merchant to see its transactions.
3. See **spending and income over time** as stacked bars (by category / group / merchant / account / owner / tag).
4. Choose the **time frame** (this month, last month, quarter, year, all time, custom range, **by payday period**) and **group by**, filter by account/owner/category/tag, compare with the previous period.
5. **Save** the current setup as a named report, reopen it later, and **export CSV** that respects the current filters.

## Read first

- Prompt 06 output: `packages/contracts/src/reports.ts`, `apps/api/src/reports/*`, `packages/finance-core/src/{reports,periods}.ts`, api-client report hooks.
- `apps/web/src/components/charts/charts.tsx`, `components/ui/chart.tsx`, `components/ui/{tabs,select,toggle-group,popover,dialog,drawer,skeleton}.tsx`, `components/common.tsx`, `lib/category.ts`, `lib/grid.ts`, `routes/_app/transactions.tsx` (search-param pattern with `validateSearch` and filter toolbar), `components/app-shell.tsx`.
- `apps/api/src/me/me.service.ts` (`csvCell`, `exportCsv`), `apps/web/src/lib/push.ts#downloadBlob`, `packages/api-client/src/client.ts#exportData`.
- `apps/mobile/src/components/charts/charts.tsx`, `apps/mobile/app/insights.tsx`, `apps/mobile/app/(tabs)/more.tsx`, `src/components/ui/primitives.tsx`.
- Check recharts 3's `Sankey` and `Treemap` exports and their custom-node props before building; keep wrappers thin.

## Data model (migration `<next timestamp>_saved_reports`)

```prisma
model SavedReport {
  id String @id @default(cuid())
  userId String
  name String
  query Json                 // reportQuery, validated on read AND write; unknown future fields rejected
  view String @default("cashflow")   // 'cashflow' | 'treemap' | 'overtime'
  position Int @default(0)
  pinned Boolean @default(false)     // used by the dashboard in prompt 15
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, position])
}
```
RLS + REVOKE; export; delete-all. Max 50 saved reports per user.

## API

- `GET /reports/saved`, `POST /reports/saved`, `PATCH /reports/saved/:id` (rename, replace query, pin, reorder), `DELETE /reports/saved/:id`.
  A saved "this month" must keep meaning "this month" when reopened next month, so add relative variants to `reportTimeframe`: `{kind:'thisMonth'}`, `{kind:'lastMonth'}`, `{kind:'thisQuarter'}`, `{kind:'thisYear'}`, `{kind:'rolling', days}` (the UI stores these, not the resolved month).
  Update `resolveTimeframe` and its tests accordingly.
- `POST /reports/export` body `{query: reportQuery, format: 'summary' | 'transactions'}` → `text/csv; charset=utf-8` with `content-disposition: attachment; filename="finally-report-<label>-<date>.csv"`.
  - `summary`: one row per group (`group, total_eur, share_pct, count, previous_total_eur, delta_eur`) plus one row per bucket × group for the series (second section after a blank line, or a `section` column: choose the single-table `section` column so the file loads cleanly in Excel).
  - `transactions`: the exact rows behind the report (same filter, same netting rules, same period): `date, account, merchant, raw_descriptor, category, parent_category, tags, owner, status, kind, amount, currency, amount_eur, note`. Stream in chunks of 2,000 rows (don't build a 200k-row string).
  - **CSV safety:** prefix any cell beginning with `=`, `+`, `-`, `@`, tab or CR with `'` (Excel formula injection; bank text is attacker-influenced). Use RFC-4180 quoting. Add a UTF-8 BOM. Put the shared helper in `apps/api/src/common/csv.ts` and use it from `MeService.exportCsv` as well (fix the existing unsafe `csvCell`).
  - Filters respected: anything in `query` including `includeExcluded`, `includePending`, owner scope. The file header comment row is **not** added (breaks imports); instead the filename carries the label.

## Web UI: `apps/web/src/routes/_app/reports.tsx` (+ components in `apps/web/src/components/reports/`)

- Nav: add "Reports" (lucide `ChartPie` or `ChartSankey` if available, else `BarChart3`) after Budgets.
- URL search params hold the whole query (zod `validateSearch`, compact encoding) so views are linkable and Back works; `saved=<id>` loads a saved report.
- **Controls bar:** timeframe Select (+ date inputs for custom, + "Payday periods" shows a period stepper "28 Sep – 27 Oct" with prev/next), group-by ToggleGroup, filters Popover (accounts, owners, categories, tags, "include pending", "include left-out payments"), compare switch, "Save report", "Export CSV" menu (summary / transactions).
- **Tabs:** Cash flow · Spending · Over time (shadcn `Tabs`, roving focus).
  - *Cash flow:* recharts `Sankey` with custom node/link renderers using `categoryVar` colours at 0.35 link opacity; labels hidden below a height threshold with tooltip fallback; node click on a category → switches to Spending tab drilled to that category. Header stats: income, spending, net, savings rate. Includes the "Left over" / "From savings" node.
  - *Spending:* recharts `Treemap` (custom content with name + € + %); breadcrumb "All spending › Groceries › Tesco"; clicking a merchant opens a side Sheet listing its transactions via `useTransactions` with the same filter (virtualised list reuse from the Transactions page if practical); right column shows the ranked legend with share bars (`Track`).
  - *Over time:* stacked `BarChart` by bucket (`stackId`), top N groups + Other, legend toggle to isolate a series, income line overlay on a `ComposedChart` when groupBy is category/group, tooltip shows bucket total + top 5.
- **Accessibility:** every chart has a "Table view" toggle that renders the same data as a real `<table>` (Sankey links as "From → To: €x"); charts have `role="img"` + `aria-label` summarising the headline; colour is never the only signal (labels, values); keyboard can reach legend items and drill buttons.
- **States:** skeletons per tab; empty ("No spending in this period. Try a wider range."); error with retry; "includes €84 pending" and "N foreign-currency payments converted at booking-day rates" notes under the header.
- **Saved reports:** a Select/Command list of saved reports with rename, delete (confirm), pin toggle (shows "Pinned to dashboard" once prompt 15 lands, until then just stores it), and "Update saved report with these settings".
- Mobile-width layout: controls collapse into a Drawer ("Filters"), tabs scroll horizontally, Sankey is replaced by the ranked list with a note ("Open on a larger screen for the flow diagram").

## Mobile (`apps/mobile`)

Add a **Reports** screen under More: period chips (This month, Last month, Quarter, Year, Payday), group-by chips, stacked bars with victory-native
(`CartesianChart` + `Bar` stacked, top 6 + Other), and a ranked category list with share bars; tap a row to drill to merchants (list), tap a merchant to open the filtered Activity screen.
Saved reports are selectable (read-only on mobile). CSV export and Sankey/treemap are **web only**. Include loading/empty/error cards using `LoadingCard`/`ErrorCard` from `src/components/screen.tsx`.

## Edge cases

- **Pending vs posted:** the include toggle changes every number consistently, including the CSV.
- **Refunds / rent shares:** shown as net in category breakdowns and exports (`kind` column makes it auditable in the transactions CSV; `amount_eur` is the original signed value).
- **Transfers between own accounts:** excluded from all views and from the exports unless the caller explicitly asks (`includeTransfers` is exposed only in the transactions export as "Include transfers").
- **Multi-currency:** amounts in EUR; transactions CSV carries `currency` + `amount` too.
- **Payday periods:** the stepper and the series use `effectivePayday`; the label shows real dates; a partial current period shows "so far".
- A saved report whose filters reference a deleted account/category: load it, drop the missing ids, and show a notice "2 filters no longer exist".
- URL too long: compress the query (base64url of a minimal JSON) when over 1,500 chars.
- Large exports: respond with streaming, honour a 60 s request limit, and return 413 with a clear message above 200,000 rows.
- Sankey with a single node/link: render a graceful empty-ish state rather than crash (recharts throws on empty `links`).

## Acceptance criteria

1. `/reports` shows the three tabs for "This month" with sensible numbers; switching to "Payday period" shows 28 Sep–27 Oct style labels.
2. Click Groceries in the treemap → merchants; click Tesco → a panel lists its transactions and the total matches the tile.
3. Change group-by to Account and Owner: totals are unchanged, segments change.
4. Save as "Monthly overview", reload, pick it from the list: same view and filters. Rename and delete work.
5. Export "transactions" with filter *Groceries + Revolut + pending off*: the CSV row count matches the Transactions page count for the same filter, opens in Excel/LibreOffice with accents intact, and a merchant text starting with `=` is neutralised.
6. Keyboard-only: tab through controls, switch tabs, reach the table view; screen-reader names exist for all icon buttons.
7. Dark mode and a 375 px wide viewport both render without horizontal scroll.
8. Mobile Reports screen shows stacked bars and the ranked list; tapping drills correctly.

## Tests

- API: saved-report CRUD with validation and the 50-report cap; relative timeframe resolution (finance-core `periods.test.ts`); CSV helper (formula-injection prefixing, quotes, BOM, newlines, unicode); export row parity with `/transactions` using the same filter; streaming chunk boundaries.
- Web: unit-test pure helpers (query ↔ URL encode/decode, table-view data mappers); add Testing Library tests for the controls only if the dependency is cheap, otherwise explain what was verified by hand.
- contracts: new timeframe variants.

## Out of scope

Dashboard widgets (prompt 15), scheduled/emailed reports, budgets vs actual reports, PDF export, mobile CSV export, Sankey on mobile.

## Finish

1. Explore the files above, post a short plan, then implement.
2. Run `pnpm install`, `pnpm --filter @finally/db db:generate`, `pnpm turbo run typecheck lint test build`; e2e if `DATABASE_URL` is reachable, else say so.
3. Report what changed, migration name, deferred items, acceptance results.
