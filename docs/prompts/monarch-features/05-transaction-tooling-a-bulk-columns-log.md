# 05 · Transaction tooling, part A: multi-select, bulk edit, columns, activity log, safer pending and import

You are working in the Finally repo (personal finance, Ireland, EUR, AIB + Revolut read-only). Prerequisites: `01-foundations.md`
(filter, activity log, flags, preferences) and `03/04` (rules) merged. Receipts are a separate prompt (`17-receipts.md`).

## Ground rules (this repo)

- pnpm 10 + Turborepo. Read `docs/ENGINEERING.md`, `PLAN.md`, `docs/prompts/monarch-features/00-plan.md`. Full check: `pnpm turbo run typecheck lint test build`; `pnpm --filter @finally/finance-core test`; `pnpm --filter api test`; `pnpm --filter api test:e2e` (needs `DATABASE_URL`).
- Zod 4 schemas in `packages/contracts/src`; DTOs in `apps/api/src/common/dto.ts`; `packages/api-client` parses with the same schemas. Maths in `packages/finance-core` (pure, decimal.js, Vitest). Money = decimal strings; dates Dublin `YYYY-MM-DD`.
- Prisma 7 migrations in `packages/db/prisma/migrations`; new tables get RLS + REVOKE and join `exportJson`/`deleteAllData`. Queries scoped by `userId`.
- Mock bank, no keys, nothing sent to third parties.
- Web: React 19, Tailwind v4, shadcn, TanStack Router/Query/Table/Virtual, `components/common.tsx`. Mobile: Expo Router + NativeWind.

## Goal and behaviour

1. **Multi-select** in the web Transactions table: checkbox column, click-drag-free **shift-click range selection**, select-all
   on the loaded rows, and "Select all N matching this filter" for server-side bulk actions.
2. **Bulk edit** bar: set category, rename merchant, add/remove tags, mark reviewed/unreviewed, leave out of budgets (on/off),
   mark as transfer, mark as rent share (credits only). One undo toast for the last bulk action.
3. **Hideable columns** (date, merchant, raw bank text, category, account, tags, status, reviewed, amount, note), saved per
   user in `UserPreference('transactions.columns')`.
4. **Activity log** per transaction in a detail drawer: who/what changed what and when (rules, imports, you, the bank).
5. **Edits carry over when a pending payment posts**, including when the posted amount or text differs (tips, fuel pre-auths).
6. **CSV import that never duplicates on re-import**, never drops genuine repeats, and does not duplicate payments already
   synced from the bank. With a preview step and "Undo import".

## Read first

- `apps/web/src/routes/_app/transactions.tsx` (virtualised grid built with `@tanstack/react-table` + `react-virtual`; `CategoryPicker`), `components/ui/{checkbox,dropdown-menu,drawer,sheet,popover}.tsx`, `lib/utils.ts`.
- `apps/api/src/transactions/*`, `transaction-filter.ts`, `transaction-events.service.ts` (prompt 01), `apps/api/src/categorisation/categorisation.service.ts` (`applyOnce`, `applyToMerchant`).
- `apps/api/src/banking/ingest.service.ts` (the whole file: dedupe, pending upgrade, stale-pending delete, `linkTransfers`), `banking.service.ts` (`importCsv`, `accountForImport`), `banking.controller.ts`.
- `packages/finance-core/src/csv.ts` (`parseAibCsv`, `parseRevolutCsv`, `dedupeSeed`) and `csv.test.ts`; `packages/finance-core/src/transfers.ts`.
- `packages/contracts/src/core.ts` (`importCsvBody/Response`), `apps/web/src/routes/_app/settings.tsx` (import card, `useImportCsv`), `apps/mobile/app/(tabs)/activity.tsx`, `apps/mobile/src/components/payments.tsx`.
- `docs/prompts/monarch-features/03-rules-engine-a-core.md` for the rule engine's protections (`categorisedBy = 'USER'`).

## Data model (migration `<next timestamp>_transaction_tooling`)

```prisma
model ImportBatch {
  id String @id @default(cuid())
  userId String
  accountId String
  filename String?
  institution Institution
  rowCount Int
  createdAt DateTime @default(now())
  undoneAt DateTime?
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  account Account @relation(fields: [accountId], references: [id], onDelete: Cascade)
  transactions Transaction[]
  @@index([userId, createdAt])
}
```
`Transaction.importBatchId String?` (FK, `SetNull`) + relation. Add `occurrence Int @default(0)` to `Transaction` (see dedupe).
RLS + REVOKE; export; delete-all. Add `transactions.columns` to the preference registry from prompt 01. Bulk undo is not persisted; it uses a signed token (below).

## API

### Bulk

`POST /transactions/bulk` body:

```ts
{ target: { ids: string[] } | { filter: TransactionFilter; expectedCount: number },
  changes: { categoryId?, merchantName?, addTags?[], removeTags?[], reviewed?: boolean, excludeFromBudgets?: boolean,
             treatment?: 'TRANSFER' | 'RENT_SHARE' | null },
  scope: 'once' }                       // bulk never creates rules
```
Response: `{updated, skipped: {reason, count}[], undoToken}`. Rules:

- `filter` target: resolve with `buildTransactionWhere`; if the live count differs from `expectedCount` return 409 so the UI re-confirms. Max 5,000 rows per call.
- Category changes set `categorisedBy = 'USER'`, `needsReview = false`, close resolved requests (reuse the helper from `CategorisationService`). Paired transfers are skipped (`skipped: PAIRED_TRANSFER`).
- `treatment = RENT_SHARE` only on credits (others reported in `skipped`); apply the convention from prompt 01 (`kind = REFUND`, Rent category, `rentShare = true`). `treatment = null` reverses it using the last event's `before` to restore kind and category.
- One `TransactionEvent` per changed row via `recordMany` (actor USER), all with the same `batchId` in `after`.
- `undoToken`: server stores nothing new; it is a signed (HMAC with `FINALLY_ENCRYPTION_KEY`-derived key), 10-minute token containing the list of row ids and their `before` snapshots (cap 5,000). `POST /transactions/bulk/undo {token}` restores them and writes `REVERTED`-style events (kind of the original, summary "Undid bulk edit"). Reject if a row changed since (compare `updatedAt`) and report which rows were skipped.

### Detail and log

`GET /transactions/:id/events` (prompt 01). `PATCH /transactions/:id` extended: `note`, `tags`, `excludeFromBudgets`, `reviewed`, with events.

### Pending → posted carry-over

In `IngestService.ingest`, after exact-hash and exact amount+descriptor matching and before inserting `fresh` rows, add a
third pass using a new pure function in `finance-core/src/pending.ts`:

```ts
matchPendingToBooked(pending: PendingRow[], booked: BookedRow[], opts?: {days?: number; tolerancePct?: number}): Array<{pendingId: string; bookedKey: string}>
```
Rules: same account and same merchantKey; booked date within 7 days after the pending date (or on it); amount equal, **or** within
`tolerancePct` (default 25 %) for tip/pre-authorisation cases only when the merchant category is Fuel/Eating out/Coffee/Taxi/Travel
(pass `tolerant: boolean` per row; the caller computes it from the category slug); one-to-one, closest date then closest amount wins.
For each match, **update the pending row in place** into the booked row (status, amount, amountEur, bookingDate, new
`dedupeHash`/`providerTxId`, descriptor) so category, tags, note, flags, goal link and owner survive, and write a `STATUS`
event "Posted: edits carried over (amount changed from X to Y)". Only unmatched stale pending rows are deleted, as today.
Keep the existing re-read window logic.

### CSV import

- **Occurrence-indexed hash.** `dedupeSeed` stays unchanged for occurrence 0 (so old rows keep their hashes). For the n-th identical row
  (same date, amount, descriptor) in one file, use `…|#n` (n ≥ 1). Store `occurrence` on the row. Re-importing the same file produces
  the same hashes, so nothing duplicates, and two genuine identical coffees both import.
- **Cross-source dedupe.** Before inserting a CSV row, look for an existing non-CSV row in the same account with the same amount,
  booking date ±1 day, and `normaliseMerchant` key equal; if found, count it as `possibleDuplicate` and **skip** it (the bank-synced row is
  the source of truth). Return those counts.
- `POST /banking/import/preview` (same body as import, plus nothing else) → `{parsed, new, duplicates, possibleDuplicates, skipped, errors[], sample[10]}`; no writes.
- `POST /banking/import` unchanged shape + `batchId`, `possibleDuplicates`; creates an `ImportBatch`, sets `source = 'CSV'` and `importBatchId`.
- `POST /banking/import/:batchId/undo` deletes the batch's rows that you have not edited (no events other than CREATED) and reports how many it kept; sets `undoneAt`.
- Keep `importCsvResponse` backward compatible (additive fields).
- Parser hardening: reject files over 5 MB (existing `max`), strip BOM (exists), handle `;`-separated files from locale exports by detecting the delimiter on the header line, and report `errors[]` with line numbers instead of silent skips.

## Web UI

### Transactions page (`transactions.tsx`)

- Add a leading checkbox column. Selection state is a `Set<string>` plus `lastClickedIndex`; shift-click selects the range
  between `lastClickedIndex` and the clicked row **in the currently rendered order**, even for rows scrolled out of the virtual window (index into the
  full `rows` array, not DOM nodes). Clicking the header checkbox toggles all loaded rows and shows a banner
  "49 selected on this page. Select all 1,284 matching this filter" (uses the `filter` target + `expectedCount`).
- Selection clears when the filter changes (the banner says so).
- Bulk bar docks at the bottom (sticky): count, **Category**, **Tags**, **Merchant name**, **Reviewed**, **Leave out of budgets**, **More** (mark transfer / rent share). Each opens a
  Popover. After success a toast "Updated 12 payments" with **Undo** (calls the undo endpoint). Disable the bar while a request is pending.
- Keyboard: Space toggles the focused row's checkbox, Shift+Space extends; `Esc` clears selection; roles/aria for a grid with `aria-multiselectable`.
- **Columns** menu (button in the toolbar): checkboxes for each column, "Reset". Persist with `usePreference('transactions.columns')`; default = today's five
  columns. The grid template (`COLS`) must be derived from visible columns.
- Row click opens a **detail drawer** (shadcn `Sheet`; right side on desktop, bottom on mobile width) showing: merchant, raw text, amount (with original currency if not EUR), account,
  status, category picker, tags editor, note, flags (reviewed, leave out of budgets, rent share, transfer), a "Create rule from this payment" button (prompt 04) and the **Activity** list
  (icon per kind, "Rule: Maxol under €5" or "You" or "Bank sync", relative time with exact time in a tooltip, before → after). Loading skeleton, empty ("No changes yet"), error.
- Tags: free-text with suggestions from existing tags; lowercase, max 30 chars, max 20 per payment.
- A "Reviewed" filter chip and "Unreviewed" quick filter in the toolbar (`reviewed=no`).

### Import UI

Move the CSV import from Settings to a button on Transactions ("Import CSV"), keeping a link in Settings. Dialog: choose bank + account + file → **preview** counts and sample rows →
"Import N new payments". Result shows `imported / duplicates / possibleDuplicates / skipped` and an **Undo import** button for the session.

## Mobile notes

- `apps/mobile`: no multi-select. Add a payment detail screen/sheet from `PaymentRow` (tap) with category change, note, tags, reviewed, and the activity list (read-only). CSV import stays web-only.
- The existing To-sort flow is unchanged.

## Edge cases

- **Pending vs posted:** bulk edits apply to pending rows too; posting carries them over (above). A pending row that never posts (cancelled) disappears as before; its events go with it.
- **Refunds:** a bulk category change on a mixed selection of debits and refunds applies to all; tags/flags too. Rent share only touches credits.
- **Transfers between own accounts:** paired transfers are never recategorised or flagged by bulk edit; they can still receive tags and notes.
- **Rent shares:** bulk `RENT_SHARE` on a salary credit is allowed by the system; show a confirm dialog when the selected amount is over €1,000 or the merchant has a user-set Income category.
- **Multi-currency (Revolut):** all bulk amounts are shown in EUR; pending→booked matching compares the **native** `amount` and `currency` (FX rates drift between pending and posting), and the carried-over row recomputes `amountEur` through `FxService.toEur`.
- **Payday periods:** `from`/`to` filters are calendar dates; no payday logic here.
- Selection across pages with a changed live count → 409 → re-confirm dialog.
- Rate limit: the global throttle (180/min) must not break bulk; the endpoint is one request.
- Undo after a sync changed some of the rows: skip those and tell the user how many were skipped.
- Two tabs editing at once: last write wins; the log shows both.

## Acceptance criteria

1. Click row 3, shift-click row 40 (rows 10–30 virtualised out): exactly 38 rows are selected; Space/Shift+Space work from the keyboard.
2. Select 15 Tesco payments, tag them `weekly shop`, then Undo: tags are gone and the activity log shows both steps.
3. Hide the Account and Status columns, reload: they stay hidden; "Reset" restores them.
4. Create a pending fuel payment of €20 (mock/test), categorise it Fuel with a note; post it at €22.40 (different amount): same row, Fuel + note preserved, log says "Posted: edits carried over".
5. Import the same Revolut CSV twice: second run reports N duplicates, 0 imported. A CSV containing two identical €3.50 coffees on one day imports both the first time and still dedupes the second time.
6. Import a CSV for a period the bank sync already covers: rows are skipped as `possibleDuplicates`; "Undo import" removes only the batch's untouched rows.
7. "Select all 1,284 matching" + set tag works in one request; the count mismatch case shows the re-confirm dialog.

## Tests

- finance-core: `matchPendingToBooked` (exact, tip tolerance, outside window, two candidates, non-tolerant categories, currency mismatch); `dedupeSeed` occurrence behaviour via the parse→hash path; delimiter detection and error line numbers in `csv.test.ts`.
- API unit/e2e: bulk with ids and with filter, 409 on count mismatch, skipped reasons, undo token tamper/expiry/changed rows; ingest carry-over keeps category/note; import preview vs commit parity; cross-source skip; undo import; events batched (assert one INSERT statement or use a spy on `createMany`).
- contracts: bulk body/response schemas.

## Out of scope

Receipts and splits (`17-receipts.md`), manual transaction creation, deleting bank transactions, rule creation from bulk, mobile multi-select, OFX/QIF import.

## Finish

1. Explore the files above, post a short plan, then implement.
2. Run `pnpm install`, `pnpm --filter @finally/db db:generate`, `pnpm turbo run typecheck lint test build`; e2e if `DATABASE_URL` is reachable, else say so.
3. Report what changed, migration name, deferred items, acceptance results.
