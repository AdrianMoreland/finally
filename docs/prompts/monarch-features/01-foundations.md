# 01 · Foundations: repair, shared filter, activity log, flags, owner groundwork, preferences, AI opt-in

You are working in the Finally repo (personal finance, Ireland, EUR, AIB + Revolut read-only via open banking).
This is the first of a series of prompts that add Monarch-inspired features. It lays the plumbing every later prompt
reuses. **Do not build any user-visible feature beyond what is listed here.**

## Ground rules (this repo)

- pnpm 10 + Turborepo monorepo. Read `docs/ENGINEERING.md`, `README.md`, `PLAN.md` and `docs/prompts/monarch-features/00-plan.md` first.
- Full check: `pnpm turbo run typecheck lint test build`. Also `pnpm --filter @finally/finance-core test`, `pnpm --filter api test`, `pnpm --filter api test:e2e` (needs `DATABASE_URL`; uses a throwaway user), `pnpm --filter @finally/db db:generate`, `pnpm --filter @finally/db db:deploy`.
- Every request/response shape is a Zod 4 schema in `packages/contracts/src` (re-exported from `index.ts`). API controllers use `createZodDto` classes registered in `apps/api/src/common/dto.ts` with `@ZodSerializerDto`. Clients parse with the same schemas via `packages/api-client/src/client.ts` + `hooks.ts`. Never redefine a shape locally.
- All finance maths is pure functions in `packages/finance-core/src` on `decimal.js` (`D`, `m2`), with Vitest tests. Money in JSON is a decimal string (`"12.50"`). No floats for money. Dates in finance-core are Dublin `YYYY-MM-DD` strings (`dates.ts`).
- Prisma 7 schema `packages/db/prisma/schema.prisma`; SQL migrations in `packages/db/prisma/migrations/<timestamp>_<name>/migration.sql` (newest today: `20261014000100_security`). **Every new table needs `ENABLE ROW LEVEL SECURITY` + `REVOKE ALL ... FROM anon, authenticated` in its own migration** (the DO-loop in the security migration ran once). Every table has `userId` with `onDelete: Cascade`; every query is scoped by `userId`.
- Add every new user-owned table to `MeService.exportJson` and `MeService.deleteAllData` (`apps/api/src/me/me.service.ts`).
- Must work with `BANK_PROVIDER=mock` and no third-party keys. Privacy is a hard requirement: no transaction data to third-party services unless a per-user opt-in is part of this prompt.
- Web: `apps/web` (React 19, Vite, Tailwind v4, shadcn in `src/components/ui`, TanStack Router file routes in `src/routes/_app`, shared primitives in `src/components/common.tsx`, nav in `src/components/app-shell.tsx`). Mobile: `apps/mobile` (Expo Router `app/`, NativeWind). Both use `@finally/api-client`.

## Goal

1. Restore the missing `apps/api/src/tools` module so the API compiles and boots.
2. Add a shared transaction filter, a transaction activity log, transaction flags (tags, exclude-from-budgets,
   rent share, reviewed, goal link, source), owner groundwork (`Person`), and a generic per-user preferences store.
3. Make the existing Anthropic merchant suggestion an opt-in, off by default, that never sends the raw descriptor.

User-visible result: the Tools page works again; Settings gets an "AI help for unknown merchants" switch (off); the
API gains `/me/preferences/:key` and `/transactions/:id/events`. Existing screens behave as before.

## Read first

- `apps/api/src/app.module.ts` (imports `./tools/tools.module`, which does not exist), `apps/api/src/common/dto.ts`
  (`CompoundDto`, `FireDto`, `LoanDto`, `WhereDto`, `ConvertQueryDto`, `EmergencyFundDto`…),
  `packages/contracts/src/tools.ts`, `packages/api-client/src/client.ts` (tools section), `apps/web/src/routes/_app/tools.tsx`,
  `apps/mobile/app/tools.tsx`, `packages/finance-core/src/calculators.ts`, `tax.ts` (`whereShouldItGo`, `ruleOn`),
  `apps/api/src/market-data/fx.service.ts`, `apps/api/src/investments/investments.service.ts` (tax rules loading).
- `packages/db/prisma/schema.prisma`, both migrations, `packages/db/src/provision.ts`.
- `apps/api/src/transactions/{transactions.service,transactions.controller}.ts`, `packages/contracts/src/core.ts`
  (`listTransactionsQuery`, `transactionSchema`), `apps/api/src/data/finance-data.service.ts`, `packages/finance-core/src/types.ts` (`CoreTx`).
- `apps/api/src/categorisation/categorisation.service.ts`, `apps/api/src/banking/ingest.service.ts`, `apps/api/src/categorisation/ai-suggest.service.ts`.
- `apps/api/src/me/me.service.ts`, `me.controller.ts`, `packages/contracts/src/core.ts` (`meSchema`, `updateMeBody`).
- Tests to copy the style of: `packages/finance-core/src/insights.test.ts`, `apps/api/test/pipeline.e2e-spec.ts`, `apps/api/src/common/crypto.spec.ts`.

## Part A: restore `apps/api/src/tools`

Create `tools.module.ts`, `tools.controller.ts`, `tools.service.ts` (match the folder style of `budgets/`, `goals/`).
Endpoints (paths are fixed by `packages/api-client/src/client.ts`), all `@ApiBearerAuth`, `@ZodSerializerDto`:

| Route | Body/query DTO | Response DTO | Implementation |
|-------|----------------|--------------|----------------|
| `POST /tools/compound` | `CompoundDto` | `CompoundResponseDto` | `compoundGrowth` |
| `GET /tools/emergency-fund` | none | `EmergencyFundDto` | mean of the last 3 **completed** months of ESSENTIALS-group spend via `FinanceDataService.coreTxs` + `spendByCategory` (exclude TRANSFER/INCOME), `saved` = sum of EUR balances of `SAVINGS`/`VAULT` accounts; `emergencyFund()` |
| `POST /tools/fire` | `FireDto` | `FireResponseDto` | `fireNumber` |
| `POST /tools/loan` | `LoanDto` | `LoanResponseDto` | `loanPayoff` |
| `POST /tools/where-should-it-go` | `WhereDto` | `WhereResponseDto` | `whereShouldItGo` with the user's `TaxRule` rows (look at how `InvestmentsService` maps them to `CoreTaxRule`) and `TAX_DISCLAIMER` |
| `GET /tools/convert` | `ConvertQueryDto` | `ConvertResponseDto` | `FxService.convert` |

Convert Prisma account balances to EUR with `FxService.toEur` (balances are in the account's own currency). Register
`ToolsModule` dependencies (`DataModule`, `MarketDataModule`). Add a unit test per endpoint's service method with
stubbed deps (Jest, `*.spec.ts`) plus one supertest assertion in the e2e file that `/tools/loan` returns a schema-valid body.

## Part B: schema changes (one migration `20261015000000_foundations`)

```prisma
enum TxSource { BANK CSV MANUAL }
enum PersonKind { SELF PARTNER }
enum TxActor { USER RULE SYSTEM IMPORT BANK }
enum TxEventKind { CREATED STATUS CATEGORY MERCHANT NOTE TAGS FLAGS OWNER GOAL REVIEWED TRANSFER SPLIT ATTACHMENT }

model Person {
  id String @id @default(cuid())
  userId String
  name String
  kind PersonKind
  colour String @default("#4B5B8F")
  linkedUserId String? @unique   // reserved for a future partner login; never set in this prompt
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  accounts Account[]
  transactions Transaction[]
  @@index([userId])
}

model TransactionEvent {
  id String @id @default(cuid())
  userId String
  transactionId String
  at DateTime @default(now())
  actor TxActor
  ruleId String?        // plain string, no FK: a deleted rule must not erase history
  kind TxEventKind
  summary String        // "Category: Coffee → Fuel (rule: Maxol over €20)"
  before Json @default("{}")
  after Json @default("{}")
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  transaction Transaction @relation(fields: [transactionId], references: [id], onDelete: Cascade)
  @@index([transactionId, at])
  @@index([userId, at])
}

model UserPreference {
  id String @id @default(cuid())
  userId String
  key String
  value Json
  updatedAt DateTime @updatedAt
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, key])
}
```

Add to existing models:

- `Transaction`: `tags String[] @default([])`, `excludeFromBudgets Boolean @default(false)`, `rentShare Boolean @default(false)`,
  `reviewedAt DateTime?`, `goalId String?` (FK `Goal`, `onDelete: SetNull`), `ownerPersonId String?` (FK `Person`, SetNull),
  `sharedOverride Boolean?`, `source TxSource @default(BANK)`. Raw SQL in the migration: backfill
  `source = 'CSV'` where `providerTxId IS NULL`; `CREATE INDEX "Transaction_tags_gin" ON "Transaction" USING GIN ("tags")`;
  index `(userId, reviewedAt)`.
- `Account`: `ownerPersonId String?` (FK `Person`, SetNull), `shared Boolean @default(false)`.
- `User`: `aiAssistEnabled Boolean @default(false)`; add relation fields for `Person`, `TransactionEvent`, `UserPreference`.
- `Goal`: `transactions Transaction[]`.
- Migration SQL also: insert one `Person(kind='SELF', name = User.displayName)` per existing user, set every account's
  `ownerPersonId` to it, enable RLS and revoke grants on the three new tables.
- `provisionDefaults` (`packages/db/src/provision.ts`) must idempotently create the SELF person for a new user and
  assign unowned accounts to it. `BankingService.completeConnection` / `accountForImport` set `ownerPersonId` on new accounts.

`pnpm --filter @finally/db db:generate` after editing the schema.

## Part C: contracts

In `packages/contracts/src/core.ts` (additive, nothing breaks):

- `transactionFilter` (and `TransactionFilter` type): `accountIds[]`, `categoryIds[]` (a parent id includes its children),
  `categoryGroups[]`, `merchantIds[]`, `tags[]`, `kinds[]` (default: all), `statuses[]`, `ownership[]` (`MINE|PARTNER|SHARED`),
  `from`/`to` (`dateOnly`), `minAmount`/`maxAmount` (on `amountEur`, signed), `q`, `reviewed` (`yes|no`), `needsReview`,
  `includeExcluded` (boolean, default false: hide `excludeFromBudgets`), `includeTransfers` (default true for the list, false for reports).
  Arrays arrive on the query string as comma-separated values; add a `csvArray` helper in `common.ts`.
- `listTransactionsQuery` = `pageQuery.merge(transactionFilter)`, **keeping every existing param name** (`accountId`,
  `categoryId`, `kind`, `needsReview`, `minAmount`, `maxAmount`, `from`, `to`, `q`) as aliases so web and mobile keep working.
- `transactionSchema` gains: `tags: string[]`, `excludeFromBudgets`, `rentShare`, `reviewedAt: instant|null`, `goalId`,
  `source`, `ownership: 'MINE'|'PARTNER'|'SHARED'`, `ownerName: string|null`.
- `transactionEventSchema`, `transactionEventsResponse`; `userPreferenceKeys` registry mapping key → Zod schema
  (start with `transactions.columns`, `scope.ownership`); `GET/PUT /me/preferences/:key` body/response schemas.
- `meSchema`/`updateMeBody`: `aiAssistEnabled`.
- Add the matching client methods and hooks (`useTransactionEvents(id)`, `usePreference(key)`, `useSetPreference(key)`).

## Part D: API

1. `apps/api/src/transactions/transaction-filter.ts`: `buildTransactionWhere(db, userId, filter): Promise<Prisma.TransactionWhereInput>`
   with the category-children expansion currently inline in `TransactionsService.list`, plus tags (`hasSome`), ownership
   (effective owner = `sharedOverride ?? account.shared` → SHARED, else person of `ownerPersonId ?? account.ownerPersonId`
   → `kind`), and the `includeExcluded` rule. Refactor `TransactionsService.list` to use it. Same ordering and cursor.
2. `apps/api/src/transactions/transaction-events.service.ts`: `record(userId, txId, event)` and
   `recordMany(userId, events[])` (single `createMany`). `GET /transactions/:id/events` newest first.
   Wire it (no behaviour change otherwise) into: `CategorisationService.applyOnce/applyToMerchant/categoriseUser`
   (`CATEGORY`, actor USER/RULE/SYSTEM), `TransactionsService.setNote` (`NOTE`), `IngestService.ingest` (`CREATED` for new
   rows with actor BANK or IMPORT; `STATUS` when PENDING→BOOKED), `linkTransfers` (`TRANSFER`).
   Events for bulk operations must be batched; do not issue one INSERT per row in a loop.
3. `FinanceDataService.coreTxs`: also return `tags`, `excludeFromBudgets`, `rentShare`, `pending`, `ownership`, `currency`.
   Add the optional fields to `CoreTx` in `finance-core/src/types.ts`. Update `spendByCategory` to skip
   `excludeFromBudgets` rows; add a `includeExcluded` option. **Rent share convention:** a credit with `rentShare=true`
   is stored as `kind = REFUND` in the Rent category, so existing netting makes Rent a net figure everywhere and it is
   never counted as income. Write the helper `markRentShare` in finance-core and document it in `docs/ENGINEERING.md`.
4. Preferences: `MeController` routes `GET/PUT /me/preferences/:key` validated against the registry; unknown key → 400.
5. AI opt-in: `AiSuggestService.suggest` returns `null` unless env is configured **and** `user.aiAssistEnabled`.
   Change its prompt input to the normalised `displayName` only (drop `rawDescriptor`, which can carry personal names,
   references and account fragments); add a comment saying why the descriptor is excluded.
   Add a unit test with a stubbed `fetch` proving no request is made when the flag is off and that the body never
   contains the raw descriptor when on.
6. Extend `exportJson`/`deleteAllData` for `Person`, `TransactionEvent`, `UserPreference` (order the deletes so FKs hold).

## Part E: web and mobile (minimum)

- Web Settings (`apps/web/src/routes/_app/settings.tsx`): a Switch "Use AI to suggest a category for unknown merchants"
  with plain text: "Sends only the merchant's name to Anthropic. Never amounts, accounts or bank text. Off by default."
  Disabled with an explanation when the server has no `ANTHROPIC_API_KEY` (expose `aiAvailable` on `/me`).
- Mobile Settings (`apps/mobile/app/settings.tsx`): the same switch.
- The existing transactions screens must still render with the extended `transactionSchema` (no UI change otherwise).
- Empty/loading/error states: reuse `LoadingBlock`, `ErrorNote` from `common.tsx`.

## Edge cases to handle

- Pending vs posted: events are recorded on the same row when PENDING upgrades to BOOKED; filters default to both statuses.
- Transfers: `includeTransfers=false` removes `kind=TRANSFER`; unpaired transfers marked later still obey it.
- Refunds net spend; rent-share credits are REFUNDs in Rent.
- Multi-currency: every amount in the filter is `amountEur`; native `amount` is untouched.
- Payday periods are not part of this prompt, but `from`/`to` are inclusive Dublin dates (reuse the existing `lt next-day` pattern).
- Existing users: the migration backfills `Person` and `source`; `provisionDefaults` stays idempotent.
- A user with no SELF person (race on first login) must not 500: create it lazily in the filter's ownership code path.

## Acceptance criteria (hand-checkable)

1. `pnpm turbo run typecheck lint test build` passes; `pnpm dev` boots the API with no "Cannot find module ./tools/tools.module".
2. Web Tools page: all calculators return numbers; mobile Tools too.
3. `GET /transactions?categoryId=<parent>&tags=a,b&ownership=MINE&includeExcluded=true` returns the right subset; the old query names still work.
4. Re-categorise a transaction in the UI, then `GET /transactions/:id/events` shows a `CATEGORY` event with before/after.
5. `PUT /me/preferences/transactions.columns` round-trips; an unknown key returns 400.
6. With `ANTHROPIC_API_KEY` set and the switch off, a new unknown merchant makes **no** outbound request to anthropic.com.
7. Export JSON contains `people`, `transactionEvents`, `preferences`; "Delete all data" leaves no rows in the new tables.
8. After the migration, `SELECT relrowsecurity FROM pg_class WHERE relname IN ('Person','TransactionEvent','UserPreference')` is true.

## Tests to write

- finance-core: `spendByCategory` with `excludeFromBudgets`; rent-share netting (income not inflated, Rent net); effective ownership helper.
- contracts: `transactionFilter` parsing of comma arrays, alias params, defaults; `userPreferenceKeys` validation.
- API unit: filter builder (table-driven over the Prisma where it returns), events service batching, AI gating, tools service methods.
- e2e (`pipeline.e2e-spec.ts`): events written on recategorise; ownership filter; preferences; tools endpoint.

## Out of scope

Any new screen (rules, reports, bulk edit, owner UI), partner login, receipts, real rule engine changes, email.

## Finish

1. Explore (files above) and post a short plan before editing.
2. Implement; keep every package building after each part.
3. Run `pnpm install` if needed, `pnpm --filter @finally/db db:generate`, then `pnpm turbo run typecheck lint test build`. API e2e needs a reachable `DATABASE_URL`; if it is not available, say so, do not claim it passed.
4. Report: what changed, the migration name, anything deferred, and the results of the acceptance list.
