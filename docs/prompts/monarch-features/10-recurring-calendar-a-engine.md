# 10 · Recurring calendar, part A: recurring items, detection v2, occurrences, matching (late, bounced, multi-amount merchants)

You are working in the Finally repo (personal finance, Ireland, EUR, AIB + Revolut read-only). Prerequisites: `01-foundations.md`;
`03/04` (rules, merchants and aliases) and `05` (import and pending fixes) strongly recommended. Part B (`11-recurring-calendar-b-ui-reminders.md`) builds the screens and reminders.

## Ground rules (this repo)

- pnpm 10 + Turborepo. Read `docs/ENGINEERING.md`, `PLAN.md`, `docs/prompts/monarch-features/00-plan.md`. Full check: `pnpm turbo run typecheck lint test build`; `pnpm --filter @finally/finance-core test`; `pnpm --filter api test`; `pnpm --filter api test:e2e` (needs `DATABASE_URL`).
- Zod 4 schemas in `packages/contracts/src`; DTOs in `apps/api/src/common/dto.ts`; `packages/api-client` parses with the same schemas. Pure maths in `packages/finance-core` (decimal.js, Vitest). Money = decimal strings; dates Dublin `YYYY-MM-DD`.
- Prisma 7 migrations; new tables get RLS + REVOKE and join `exportJson`/`deleteAllData`. Queries scoped by `userId`.
- Jobs: `apps/api/src/jobs/jobs.service.ts` (`JobName` union, `register`, `enqueue`).
- Mock bank, no keys, no third-party calls.

## Goal and behaviour

Replace the one-series-per-merchant `RecurringSeries` with first-class **recurring items** that can be detected or created by hand, and generate
dated **occurrences** that are matched to real transactions so each one can show "paid".

- Items: bills, subscriptions, rent, **income (payday)**, and other regular money in/out.
- Detected automatically; I can also create one **from a transaction** or **manually**, and mark something **"not recurring"** so it is never suggested again.
- A merchant can carry **several items at different amounts** (Apple: €12.99 iCloud+, €2.99 Music…).
- Matching copes with **late payments**, and with **bounced and re-presented direct debits**.
- Engine only here: no calendar UI, no reminders (part B). The existing `/recurring` endpoint and the Insights page keep working.

## Read first

- `packages/finance-core/src/insights.ts`: `detectRecurring`, `CADENCES`, `RecurringSeriesCore`, `cashflowForecast`, `UpcomingItem`; `insights.test.ts`.
- `apps/api/src/insights/insights.service.ts` (`runForUser`, `saveRecurring`, `recurring`), `packages/contracts/src/money.ts` (`recurringSchema`), `enums.ts` (`cadence`), schema `RecurringSeries`, `Cadence`.
- `apps/api/src/banking/ingest.service.ts` (`REFUND_RE`, kinds), `finance-core/src/normalise.ts`, `transfers.ts`.
- `apps/api/src/banking/providers/mock-data.ts` (monthly bills: `SO LANDLORD`, `D/D …`, the `APPLE.COM/BILL` line) for realistic fixtures.
- Prompts 03/04 (`Rule`, `MerchantAlias`), prompt 02's `upcoming` input, `apps/api/src/jobs/jobs.service.ts`, `apps/api/src/banking/banking.service.ts#syncConnection` (where jobs are enqueued).
- `grep -rn "recurring\|Recurring" apps packages` to find every consumer (web/mobile Insights call `useRecurring`).

## Data model (migration `<next timestamp>_recurring_items`)

```prisma
// extend enum Cadence with FORTNIGHTLY and QUARTERLY (ALTER TYPE ... ADD VALUE in its own statement)
enum RecurringFlow { OUT IN }
enum RecurringOrigin { DETECTED MANUAL FROM_TRANSACTION SYSTEM }
enum RecurringStatus { ACTIVE PAUSED ENDED REJECTED }     // REJECTED = "not recurring"
enum OccurrenceStatus { UPCOMING PAID LATE MISSED SKIPPED }
enum DueRule { DAY_OF_MONTH LAST_WORKING_DAY EVERY_N_DAYS }

model RecurringItem {
  id String @id @default(cuid())
  userId String
  name String
  flow RecurringFlow
  origin RecurringOrigin
  status RecurringStatus @default(ACTIVE)
  cadence Cadence
  dueRule DueRule @default(DAY_OF_MONTH)
  anchorDate DateTime @db.Date            // a known due date; later dates derive from cadence + dueRule
  dayOfMonth Int?
  expectedAmount Decimal @db.Decimal(14,2)        // positive magnitude
  amountTolerancePct Int @default(15)
  merchantId String?                      // FK Merchant, SetNull
  categoryId String?                      // FK Category, SetNull
  accountId String?                       // FK Account, SetNull
  matchMerchantKey String?                // key used for matching (survives merchant merges via aliases)
  matchDescriptor String?                 // optional case-insensitive substring of the raw text (e.g. "ICLOUD")
  matchMinAmount Decimal? @db.Decimal(14,2)
  matchMaxAmount Decimal? @db.Decimal(14,2)
  graceDays Int @default(5)
  reminderDays Int?                       // null = use the user default (prompt 11)
  lastPaidDate DateTime? @db.Date
  legacySeriesId String?                  // RecurringSeries.id this was migrated from
  notes String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  occurrences RecurringOccurrence[]
  @@index([userId, status])
}

model RecurringOccurrence {
  id String @id @default(cuid())
  userId String
  itemId String
  dueDate DateTime @db.Date
  expectedAmount Decimal @db.Decimal(14,2)
  status OccurrenceStatus @default(UPCOMING)
  transactionId String?                   // matched payment (no FK constraint cascade surprises: SetNull)
  paidDate DateTime? @db.Date
  paidAmount Decimal? @db.Decimal(14,2)
  lateDays Int?
  note String?                            // "re-presented after a bounce"
  remindedAt DateTime?                    // used by prompt 11
  item RecurringItem @relation(fields: [itemId], references: [id], onDelete: Cascade)
  @@unique([itemId, dueDate])
  @@index([userId, dueDate])
}
```
RLS + REVOKE on both; export; delete-all.
**Data migration:** each active `RecurringSeries` → a `RecurringItem` (`origin DETECTED`, `legacySeriesId`, `matchMerchantKey` = merchant key, `matchMin/Max` = expected ±15 %, cadence and next date → `anchorDate`).
Keep the `RecurringSeries` table (read by nothing new) for one release; `GET /recurring` is re-implemented over items and keeps its response shape. Add a comment in the schema marking it deprecated.

## finance-core (`recurring.ts`, + `recurring.test.ts`; keep exported names from `insights.ts` working or re-export)

1. **`detectRecurringV2(txs, today, existingItems, rejected)`**
   - Candidate groups by `merchantKey`; within each, **cluster by amount** (1-D: sort, split where gap > max(€0.50, 12 % of the cluster median); recompute) so Apple's several subscriptions
     become separate candidates. A cluster needs ≥ 3 payments and regular gaps (reuse cadence windows; add FORTNIGHTLY 13–15 d and QUARTERLY 88–95 d).
   - Treat **INCOME** the same way as spend (salary cluster, rent-share credits are *not* recurring income; skip `rentShare`), and TRANSFER/REFUND excluded.
   - Price changes: a new payment within 40 % of the cluster median and at the expected time belongs to the cluster (so a price rise is a price change, not a new subscription).
   - Skip candidates equal to a `REJECTED` item (same merchant key and overlapping amount band) and ones already covered by an ACTIVE item.
   - Ignore payments that are part of a **reversed pair** (below).
   - Output candidates with `confidence` (regularity × amount stability × count) and the data needed to create an item.
2. **`pairReversals(txs)`**: a debit followed within 10 days by a credit of the **same amount** from the same merchant key, or whose text matches `/\b(unpaid|returned|rtn|reversal|reversed|bounced|dishonour|refd?)\b/i`, is a **reversed pair**; return pairs so both are ignored for "paid" matching and detection.
3. **`expandSchedule(item, from, to)`**: due dates for MONTHLY (`DAY_OF_MONTH` clamped to month length, or `LAST_WORKING_DAY` using `isWeekend`/`addDays`), WEEKLY, FORTNIGHTLY, QUARTERLY, YEARLY, `EVERY_N_DAYS`. Weekend due dates for **outgoing direct debits** stay as is (banks debit on the next working day; matching uses the grace window), for **income** use the preceding working day (as `effectivePayday` does).
4. **`matchOccurrences(item, occurrences, txs, opts)`** → per occurrence `{status, transactionId, paidDate, paidAmount, lateDays, note}`:
   - A candidate tx matches the item when: same flow (debit/credit), (`matchMerchantKey` ∈ tx merchant keys incl. aliases **or** descriptor substring), amount within tolerance (or within `matchMin/Max`), account if set, not already claimed, not in a reversed pair, and `status` is BOOKED or PENDING.
   - Window: `[dueDate − 3, dueDate + graceDays]` → `PAID`; later than that but before the next due date − 3 → `LATE` match (`PAID` with `lateDays`); nothing by `dueDate + graceDays` and today past it → `MISSED` (soft, can flip to PAID later); future → `UPCOMING`.
   - One-to-one: closest date wins; a tx never satisfies two occurrences; two identical charges in one window → the second stays **unmatched** (a possible double charge; return it in `unmatched`).
   - **Bounced then re-presented:** if the first debit is in a reversed pair, the occurrence is not paid by it; a later same-amount debit from the same merchant within 30 days after the due date satisfies it with `note: 're-presented after a bounce'`. If no re-presentation yet, status `LATE` with note `'bounced'` (not `MISSED`) until 30 days pass.
   - Income items use the same logic mirrored.
5. **`monthlyEquivalent(item)`** (weekly ×52/12, fortnightly ×26/12, quarterly ÷3, yearly ÷12) for totals.

## API

New `apps/api/src/recurring/` module (move recurring code out of `InsightsService`, which keeps calling a `RecurringService` for the drafts it needs):

- `RecurringService.sync(userId, now)`: load last 14 months of `CoreTx` (with aliases), run `detectRecurringV2`, **upsert items for new candidates** (origin `DETECTED`, status ACTIVE), expand occurrences for `[today − 60 d, today + 120 d]` idempotently (`createMany skipDuplicates` on `(itemId, dueDate)`; never overwrite a PAID occurrence's data), match, update statuses, set `lastPaidDate`.
  Add `recurring-sync` to `JobName`; enqueue after `categorise`/`insights` in `BankingService.syncConnection` and `importCsv`, plus a nightly cron at 03:15 Dublin and after merchant merges / rule applies (cheap, idempotent, singleton-keyed per user).
- Routes: `POST /recurring/sync` (runs `RecurringService.sync` for the caller and returns counts; also what the job calls) · `GET /recurring/items?status=&flow=` · `POST /recurring/items` (manual) · `POST /recurring/from-transaction/:txId` (`{cadence?, name?}`; derives amount, merchant, account, anchor from the tx; origin `FROM_TRANSACTION`) · `PATCH /recurring/items/:id` (edit, pause, end) · `POST /recurring/items/:id/not-recurring` (status `REJECTED`, remembers merchant key + amount band) · `DELETE /recurring/items/:id` (only MANUAL/REJECTED; others → ENDED) ·
  `GET /recurring/occurrences?from=&to=` (joined with item summary + matched transaction summary) · `POST /recurring/occurrences/:id/link` (`{transactionId}`) and `/unlink` (manual override, survives re-sync via `note: 'manual'`) · `POST /recurring/occurrences/:id/skip`.
  `GET /recurring` (legacy) returns ACTIVE OUT items in the old `recurringSchema` shape.
- Contracts in `packages/contracts/src/recurring.ts`; add hooks to api-client (`useRecurringItems`, `useOccurrences(from,to)`, mutations that invalidate `recurring`, `overview`, `insights`).
- Insights: `renewal_soon`, `price_change`, `new_subscription` keep their fingerprints and text but are generated from items/clusters. Add `recurring_missed` (WATCH, fingerprint `recurring_missed:<itemId>:<dueDate>`) when an occurrence turns `MISSED`, and `recurring_bounced` (WATCH) for a bounce. `InsightsService.runForUser` passes `upcoming` for `cashflowForecast` (and prompt 02's guard) from UPCOMING/LATE OUT occurrences and expected IN occurrences before payday, instead of the old series filter.
- Rules (prompt 03): no new action. A "make recurring" rule action is out of scope.
- `ensure payday item`: create a `SYSTEM` income item "Payday" from `User.paydayDayOfMonth` (LAST_WORKING_DAY/DAY_OF_MONTH using `effectivePayday`) only when no detected salary item exists; retire it when one appears. Rent: no special handling, it is detected like any other cluster.

## Web and mobile

None here except the typed client/hook additions. The Insights pages keep rendering via `GET /recurring`.

## Edge cases

- **Pending vs posted:** a pending match marks the occurrence `PAID` with `pending` noted; when the pending row vanishes the next sync flips it back. When it posts (prompt 05 keeps the row), nothing changes.
- **Refunds:** a refund credit from a subscription merchant is never a payment; it cancels the matching debit only when it is the same amount within 10 days (that's a reversed pair) otherwise it is ignored for matching.
- **Transfers between own accounts:** never recurring candidates unless the user creates a manual item ("Move €300 to Revolut every 7th"); matching excludes `kind = TRANSFER` unless the item says `flow` OUT and `matchDescriptor` explicitly targets it (allow, but default exclude).
- **Rent shares:** rent-share credits are excluded from income candidates; a manual IN item may match them (e.g. "Roommate rent €500") because the user asked.
- **Multi-currency (Revolut):** match on native `amount` + `currency` when the item's account is non-EUR, otherwise on `amountEur` within tolerance (FX drift); store `expectedAmount` in EUR.
- **Payday periods:** items are on calendar dates; nothing payday-specific except the SYSTEM payday item.
- **Late & bounced DDs** (above); **re-presented** after the due date by up to 30 days; AIB/Revolut text variants (`UNPAID D/D`, `RTN D/D`, `REVERSAL`).
- **Apple-style merchants:** two clusters 6 months apart with a price rise inside one cluster are still two items; a one-off €0.99 purchase does not create an item.
- **Annual items:** a yearly item needs ≥ 2 payments ~12 months apart; with only one payment in the window, suggest it as `new_subscription` but do not create an item.
- Merchant merges (prompt 04): items match on `matchMerchantKey` through aliases, so merging does not orphan them.
- Duplicate item creation races: unique guard on `(userId, matchMerchantKey, round(expectedAmount), cadence)` for DETECTED items via a deterministic `legacySeriesId`/hash column or a pre-check inside a transaction.
- Time zones/DST: all comparisons are Dublin dates.
- Deleting a category/account referenced by an item: FKs `SetNull`.

## Acceptance criteria

1. With mock data, `POST /recurring/sync` (or the job) creates items for rent, Three, Electric Ireland, Aviva, VHI, Netflix/Spotify, Apple and the salary; the number of ACTIVE items is sensible (log them in your report).
2. Add synthetic Apple payments (12.99, 2.99, 0.99 monthly): three separate items, not one.
3. A DD that is debited, returned (credit, same amount, "UNPAID D/D") and re-presented 6 days later: one occurrence, `PAID`, `lateDays: 6`, note "re-presented after a bounce"; before re-presentation it is `LATE` with note "bounced".
4. A payment 2 days late is `PAID` with `lateDays: 2`; one 12 days late with a 5-day grace is `LATE` then matches; with nothing by +5 days it is `MISSED` and an insight appears.
5. "Not recurring" on a detected item makes it vanish and not come back after the next sync.
6. Creating an item from a transaction fills amount, merchant, account and the next due date correctly.
7. `GET /recurring` (legacy) still returns the old shape and the Insights pages still render.
8. Idempotency: running `sync` three times changes nothing after the first run.

## Tests

- finance-core: clustering (Apple fixture), cadence detection incl. fortnightly/quarterly, price-change within cluster, income salary detection, rent-share exclusion, reversed pairs, `expandSchedule` (clamps 29–31, leap years, last working day, weekend rules, DST dates), `matchOccurrences` matrix (on time, early, late, missed, bounced, re-presented, double charge → unmatched, manual link wins), `monthlyEquivalent`.
- API: sync idempotency; never overwrites a PAID occurrence; migration from `RecurringSeries`; reject/not-recurring persistence; ownership scoping; the legacy endpoint shape.
- e2e: sync the mock banks → items exist → import a CSV with a bounced and re-presented DD → occurrence states as above.

## Out of scope

Calendar/list UI and reminders (prompt 11), budget changes (prompt 12), double-charge insight, standing-order checklist (see open question 12 in the plan), forecasting changes beyond feeding `upcoming`.

## Finish

1. Explore the files above, post a short plan, then implement.
2. Run `pnpm install`, `pnpm --filter @finally/db db:generate`, `pnpm turbo run typecheck lint test build`; e2e if `DATABASE_URL` is reachable, else say so.
3. Report what changed, migration name, deferred items, acceptance results.
