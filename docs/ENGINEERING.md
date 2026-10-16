# Engineering notes

## Commands

```bash
pnpm install
pnpm dev                                   # api :3000, web :5173, Expo (turbo, persistent)
pnpm turbo run typecheck lint test build   # the full check
pnpm --filter @finally/finance-core test   # pure maths, fast
pnpm --filter api test                     # unit tests
pnpm --filter api test:e2e                 # sync -> categorise -> answer -> re-categorise (uses DATABASE_URL, throwaway user)
pnpm db:seed                               # categories, seed rules, tax rules, demo investments for ALLOWED_EMAILS[0]
pnpm --filter @finally/db db:generate      # prisma generate
pnpm --filter @finally/db db:deploy        # apply migrations (DIRECT_URL)
pnpm --filter @finally/tokens generate     # regenerate CSS variables and the NativeWind preset
```

Workspace packages build to dual ESM + CJS with tsup (`dist/`). Turbo builds them before `dev`, so after editing a
package restart or let `tsup --watch` run (`pnpm --filter <pkg> dev`).

## Rules that hold everywhere

1. TypeScript strict, no `any`, ESM source.
2. Every request and response shape is a Zod 4 schema in `packages/contracts`. Controllers use
   `createZodDto(schema)` (`apps/api/src/common/dto.ts`) and `@ZodSerializerDto`, so responses are validated too. The
   web and mobile clients parse responses with the same schemas (`packages/api-client`). Never redefine a shape locally.
3. All finance maths lives in `packages/finance-core` as pure functions with tests. Apps only call it. Amounts are
   `decimal.js`; JSON carries decimal strings (`"12.50"`). Display conversion to `number` happens only in formatting.
4. Store UTC, display Europe/Dublin. finance-core works on `YYYY-MM-DD` Dublin dates (see `dates.ts`).
5. Everything must work with `BANK_PROVIDER=mock` and `MARKET_DATA_PROVIDER=mock` and no third-party keys.
6. Clients never touch Postgres. Every table has RLS on with no policies. Supabase is used for auth only.
7. Bank session ids are encrypted at rest (AES-256-GCM, `FINALLY_ENCRYPTION_KEY`). Logs redact IBANs, tokens,
   descriptors and request bodies (`apps/api/src/common/redact.ts`).

## Where things live

- `apps/api/src/banking`: provider interface (`providers/bank-provider.ts`), mock and Enable Banking providers, sync
  and CSV import (`banking.service.ts`), dedupe/pending handling and transfer linking (`ingest.service.ts`).
- `apps/api/src/categorisation`: the core loop. `categoriseUser` applies rules, flags unknown merchants and opens one
  request per `merchantKey`; `answer` writes a USER rule and re-categorises; pushes and the evening digest.
- `apps/api/src/snapshot`: `SnapshotService` loads fourteen months of payments, budgets, pots, people and prefs once, so
  Today, Plan, Ask and Review agree. `data/ledger.service.ts` turns rows into `LedgerTx` and stores per-user prefs
  (`User.prefs`, validated by `userPrefs` in contracts, defaults filled on read).
- `apps/api/src/today`, `actions`, `ask`, `money` (bills, month, review), `plan` (payday, standing orders), `pots`,
  `people`, `tax` (+ bonus), `grow` (investing, freedom, practice account, vault), `setup`: thin services over
  finance-core. Today ranks `buildActions` by money involved; Ask parses with `parseQuestion` and answers spending
  questions with `answerSpend`, on the server.
- `apps/api/src/insights`, `budgets`, `overview`, `investments`, `tools`: older services, still used by pushes and the
  Holdings and Tools pages.
- `apps/api/src/jobs`: pg-boss. `JobsService.enqueue` runs inline when `DISABLE_JOBS=true` (tests).
- `packages/db/src/seed-data.ts` and `provision.ts`: categories, merchant seed rules, tax rules. `provisionDefaults` is
  idempotent and runs on first login.
- `apps/web/src/routes`: TanStack Router file routes (`_app/*` are behind the auth guard).
- `apps/mobile/app`: Expo Router screens; `src/lib/notifications.ts` registers the per-askGroup notification categories.

## Navigation

Four sections on web and phone: Today, Money (Transactions, To sort, Cash flow, Budgets, Bills & subscriptions, This month, Review), Plan (Payday plan,
Pots, People, Bonus, Tax & pay) and Grow (Investing, Freedom, Holdings, Tools). Ask is a search bar on every page
(⌘K), not a page. Privacy mode is a switch on the amount formatter in `packages/api-client/src/format.ts`.

## Safe to spend

`computeSafeToSpend` (finance-core `safe.ts`): the lower of what the flexible budgets still allow (unsorted payments
count as spent, overspending is not hidden) and what the balance allows after bills before payday and the buffer,
divided by days to payday. Pending payments count; refunds net against the category they came from. Housemates'
rent shares are not spending and not income (see Rent you front). Paydays that fall on a weekend move to the Friday before (`weekendShift`).

## Rent you front

Some people pay the landlord in full and are repaid by the people they live with. `User.prefs.rent` holds the landlord
`total`, the `day`, the `household` size (yourself included; below 2 turns the feature off) and the other people, each
with text matchers (`matchers: [{ kind: 'text', value }]`, optionally an `account`). It is edited under Settings, *Rent
you front*, and patched through `PATCH /me/prefs` (arrays replace). Nothing about rent is hard-coded.

- `expandRentSplits` (finance-core `rent.ts`) runs where the ledger is loaded (`LedgerService.txs`). A rent debit
  (category `rent`, within EUR 1 of the total) becomes your share (`total / household`, kind SPEND) and a virtual
  `FRONT` row for the rest. The database keeps one row, the real bank line. Budgets, safe to spend, Today, Month, Ask
  and Cash flow therefore all see rent as your share. `FinanceDataService.coreTxs` applies the same rule to the older
  insight and budget services.
- `matchShare` finds which person sent a credit (case, accents and spacing ignored). Matched credits are kind `SHARE`
  in the rent category, never income and never netted against rent. `CategorisationService.reclassifyShares` re-runs
  when the rent settings change. With no rent settings, a credit in the Rent category is still treated as a share.
- `rentRounds` makes one round per rent payment. A credit counts for the round whose window is
  `[date - 10 days, date + 1 month - 11 days]` (inclusive), so each transfer belongs to exactly one round. What is
  left of a share is owed to you: it appears under People and in net worth, and is not spending until it arrives.
- Two Today items come from this: overdraft while you fronted the rent (only when a round exists this month and the
  month's lowest end-of-day balance of the account is below zero) and a reminder per person who still owes part of
  this month's share.

To add a person: Settings, *Rent you front*, *Add a person*, then the text their transfers show in the bank (a
surname, a reference, or part of an IBAN if it appears in the descriptor).

## Cash flow

`buildCashflow` (finance-core `cashflow.ts`) turns the ledger into sources (pay, pots, balance), groups and
categories for a period (`cfRange`: since payday, this month, last month, last 3 months, this year, last 12 months).
Everything is included, even payments left out of budgets. Money moved into pots and paid back to people have their
own groups; rent you front only appears when the pass-through toggle is on, in grey, and is never counted.
`layoutSankey` (`sankey.ts`) is the geometry (ribbons never cross); web draws it in SVG and the phone with
`react-native-svg`. `GET /money/cashflow` returns the nodes and every payment with the node keys it belongs to, so the
client only filters. "Your usual pace" skips trip months (`prefs.trips`, `detectTrips` suggests them).

## Design tokens and the design tool export

`packages/tokens/src/index.ts` is the only source. `pnpm --filter @finally/tokens generate` writes the CSS variables,
the phone preset and `figma/tokens.json` (Tokens Studio single-file format: `core`, `dark`, `light`, themes). A test
fails when a palette key, radius or category colour is missing from the JSON. Web radii come from the tokens (card 12,
control 8, chip 6); the phone keeps its own (card 14, buttons 12, pills round) in `apps/mobile/tailwind.config.js`.

## Demo data

`packages/db/src/demo-statement.ts` is generated from an AIB statement export, with people and employer names replaced by neutral labels (Flatmate A to E, an employer called Acme Ltd). `SetupService.applyDemoDefaults` adds starting budgets, pots and the payday; rent is entered by the user in setup (Settings, *Rent you front*), as for anyone else. Deleting all data resets onboarding (`OnboardingService.reset`), so the next request re-links the demo bank like a new sign-up. `provisionDemoStatement` creates a
merchant name and a SEED rule per raw descriptor, so the mock bank categorises like the real account.
`apps/api/src/banking/providers/aib-statement.ts` appends generated payments up to today using the same descriptors.

## How to add a category

1. Add it to `SEED_CATEGORIES` in `packages/db/src/seed-data.ts` (slug, group, askGroup, icon, colour). Put it in
   `ASK_GROUP_BUTTONS` (`packages/contracts/src/enums.ts`) if it should be a quick-answer button.
2. Add merchants to `SEED_MERCHANTS` (they are normalised to merchant keys at seed time).
3. Run `pnpm db:seed` (existing users pick it up; `provisionDefaults` only adds what is missing).
4. If it is a fixed bill (paid on a schedule), add its slug to `FIXED_CATEGORY_SLUGS`.
5. Colours: add the slug to `categoryColours` in `packages/tokens/src/index.ts` and run `pnpm --filter @finally/tokens generate`.

## How to add an insight

1. Write a pure function in `packages/finance-core/src/insights.ts` returning `Draft[]`
   (`{ type, severity, title, body, payload, fingerprint }`). The fingerprint must be stable for the same fact in the
   same period so reruns update instead of duplicating.
2. Add table-driven tests in `insights.test.ts`.
3. Call it from `InsightsService.runForUser` (`apps/api/src/insights/insights.service.ts`) and add its `type` to
   `PRODUCED_TYPES` so stale unpushed rows are cleaned up. `ACT` severity sends a push.

## How to add a signal

1. Add the rule to `packages/finance-core/src/signals.ts` returning `SignalOut[]` (include the numbers in `payload`)
   and wire it into `runSignals`. Add tests in `signals.test.ts`.
2. If it should push, add its `rule` to `PUSH_RULES` in `apps/api/src/investments/investments.service.ts`.
3. The UI lists whatever `GET /investments` returns; severity mapping for the phone is `severityOf` in
   `apps/mobile/app/(tabs)/invest.tsx`.

## Tax rules

Rates, thresholds and caps are `TaxRule` rows (`SEED_TAX_RULES`). finance-core selects the rule in force on a date
(`ruleOn`) and never hard-codes a rate. To change a rate, add a row with a new `effectiveFrom` and close the old one
with `effectiveTo`.

## Categorisation semantics

- Rules: USER rules beat SEED rules; within a source a higher `priority` wins, then EXACT > CONTAINS > REGEX.
  `EXACT` matches the merchant key; `CONTAINS` and `REGEX` match the raw descriptor.
- `categorisedBy`: `SEED` = built-in rule, `RULE` = your rule, `USER` = you chose it for one payment, `NONE` = unsorted.
- Answer scope `merchant` upserts an EXACT USER rule and re-categorises every payment from that merchant; `once`
  changes only that payment.
- More than five open requests: no individual pushes, one evening digest (19:00). Quiet hours (default 22:00-08:00)
  defer pushes.

## Notification buttons

iOS fixes button titles when a category is registered, so the phone registers one category per ask group
(`ask_food`, `ask_transport`, `ask_shopping`, `ask_bills`, `ask_fun`; `ask_other` has no buttons) and re-registers when
categories change. Button identifiers are category slugs; the response handler answers with scope `merchant` without
opening the app. The same push payload drives Web Push (the browser shows up to two buttons).
