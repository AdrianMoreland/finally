# 03 · Rules engine, part A: conditions, actions, ordering, preview, apply-to-past

You are working in the Finally repo (personal finance, Ireland, EUR, AIB + Revolut read-only). Prerequisite:
`01-foundations.md` merged (activity log, tags, flags, filter). Part B (`04-rules-engine-b-ui-merchants.md`) builds
the screens; this part builds the engine, data model, API, migration and tests, and keeps the current UI working.

## Ground rules (this repo)

- pnpm 10 + Turborepo. Read `docs/ENGINEERING.md`, `PLAN.md`, `docs/prompts/monarch-features/00-plan.md` first. Full check: `pnpm turbo run typecheck lint test build`; `pnpm --filter @finally/finance-core test`; `pnpm --filter api test`; `pnpm --filter api test:e2e` (needs `DATABASE_URL`, throwaway user); `pnpm --filter @finally/db db:generate`.
- Zod 4 schemas in `packages/contracts/src`; DTOs in `apps/api/src/common/dto.ts`; clients in `packages/api-client` parse with the same schemas. Maths = pure functions in `packages/finance-core` (decimal.js, Vitest). Money = decimal strings. Dates = Dublin `YYYY-MM-DD`.
- Prisma 7: `packages/db/prisma/schema.prisma`, migrations in `packages/db/prisma/migrations/<timestamp>_<name>/`. New tables need RLS + REVOKE in their own migration; add them to `MeService.exportJson`/`deleteAllData`. Every query scoped by `userId`.
- Works with `BANK_PROVIDER=mock`, no keys. No transaction data to third parties; rules are deterministic.
- Jobs: `apps/api/src/jobs/jobs.service.ts` (`JobName` union, `register`, `enqueue`).

## Goal and behaviour

Today a rule is `(matchType, pattern) → category`: EXACT on the merchant key, CONTAINS/REGEX on the raw descriptor
(`finance-core/src/rules.ts`, model `MerchantRule`). The "every time" answer to an unknown merchant creates an EXACT USER
rule directly. Replace the USER side with a real rules engine; keep SEED rules as the lowest layer.

A rule has a name, **conditions** (all must match) and **actions**:

| Conditions | Actions |
|------------|---------|
| merchant equals / contains | set category |
| description (raw bank text) contains / regex | rename merchant |
| amount (absolute EUR): `<`, `≤`, `>`, `≥`, between | add tags |
| account is one of | mark as transfer |
| direction: debit / credit | mark as rent share |
| currency is one of | link to a goal |
| | leave out of budgets |
| | mark reviewed |

Rules are an ordered list. They run top to bottom. **For each field the first rule that sets it wins** (so rules higher
up beat rules lower down); tags from all matching rules are unioned; flags are OR-ed; a rule with `stopProcessing`
ends evaluation. After user rules, the existing SEED merchant rules are the fallback for the category only. Unknown
merchants still become a categorisation request exactly as today.

The test case that must pass: **Maxol payments under €5 are Coffee; over €20 are Fuel; €5–€20 fall through to the seed
rule (Fuel).** (`maxol` is in `SEED_MERCHANTS.fuel`.) Build it as two user rules on `merchant equals maxol` +
`amount < 5 → Coffee` and `amount > 20 → Fuel`.

Editing a rule shows a **preview** (how many past payments it matches, which would change, examples) and can be
**applied to past transactions**. The "every time" answer becomes a rule (origin `ANSWER`) placed at the bottom, so
hand-written specific rules above it keep winning.

## Read first

- `packages/finance-core/src/rules.ts` and `rules.test.ts` (keep `applyRules` for the SEED layer), `normalise.ts` (`normaliseMerchant`), `types.ts`.
- `apps/api/src/categorisation/categorisation.service.ts` (all of it: `categoriseUser`, `applyToMerchant`, `applyOnce`, `answer`, `closeResolvedRequests`).
- `apps/api/src/categories/categories.service.ts` + `categories.controller.ts` (the current `/rules` routes and `reapply`), `packages/contracts/src/core.ts` (`ruleSchema`, `createRuleBody`, `updateRuleBody`), `packages/api-client/src/{client,hooks}.ts` (rules section).
- `apps/web/src/routes/_app/settings.tsx` (`RulesCard`, ~line 347), `apps/api/src/banking/ingest.service.ts`, `apps/api/src/jobs/jobs.service.ts`.
- `packages/db/src/provision.ts` and `seed-data.ts` (`SEED_MERCHANTS`, `SEED_PATTERN_RULES`), `apps/api/test/pipeline.e2e-spec.ts`.
- From prompt 01: `transaction-events.service.ts`, `transaction-filter.ts`, `Transaction` flag columns.
- `grep -rn "useRules\|api.rules\|createRule\|RuleDto" apps packages` to find every consumer before changing the contract.

## Data model (migration `<next timestamp>_rules_engine`)

```prisma
enum RuleOrigin { MANUAL ANSWER MIGRATED }

model Rule {
  id String @id @default(cuid())
  userId String
  name String
  position Int                       // 0 = top = highest precedence
  active Boolean @default(true)
  stopProcessing Boolean @default(false)
  conditions Json                    // validated with ruleConditionSchema[] on every read/write
  actions Json                       // validated with ruleActionSchema[]
  schemaVersion Int @default(1)
  origin RuleOrigin @default(MANUAL)
  autoMerchantKey String?            // set for origin ANSWER: one auto rule per merchant
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, autoMerchantKey])
  @@index([userId, active, position])
}
```

- RLS + REVOKE on `Rule`; add to export/delete-all.
- **Data migration in the same SQL:** copy every `MerchantRule` with `source = 'USER'` into `Rule`
  (`EXACT → merchant equals`, `CONTAINS → description contains`, `REGEX → description regex`, action `setCategory`;
  `position` from `row_number() OVER (ORDER BY priority DESC, pattern)`; name `"<pattern> → <category name>"`;
  `origin = ANSWER` with `autoMerchantKey = pattern` for EXACT rules, `MIGRATED` otherwise), then delete those USER rows.
  `MerchantRule` remains and now holds **SEED rules only** (add a comment in the schema). Keep the `source` column.
- A guard in the service: max 200 rules, 8 conditions and 8 actions per rule, regex length ≤ 200.

## finance-core: `packages/finance-core/src/ruleset.ts` (+ `ruleset.test.ts`)

Pure, no I/O. Export from `index.ts`.

```ts
type RuleCondition =
  | { type: 'merchant'; op: 'equals' | 'contains'; value: string }          // equals: any of facts.merchantKeys; contains: name or key
  | { type: 'description'; op: 'contains' | 'regex'; value: string }
  | { type: 'amount'; op: 'lt'|'lte'|'gt'|'gte'|'between'; value: string; value2?: string } // |amountEur|, inclusive for lte/gte/between
  | { type: 'account'; accountIds: string[] }
  | { type: 'direction'; value: 'debit' | 'credit' }
  | { type: 'currency'; currencies: string[] };
type RuleAction =
  | { type: 'setCategory'; categoryId: string } | { type: 'renameMerchant'; name: string }
  | { type: 'addTags'; tags: string[] } | { type: 'markTransfer' } | { type: 'markRentShare' }
  | { type: 'linkGoal'; goalId: string } | { type: 'excludeFromBudgets' } | { type: 'markReviewed' };

interface RuleFacts { merchantKey: string; merchantKeys: string[]; merchantName: string; rawDescriptor: string;
  amountEur: string /* signed */; currency: string; accountId: string; kind: TxKind; status: 'PENDING'|'BOOKED'; }
interface Outcome { category?: {id: string; ruleId: string}; merchantName?: {name: string; ruleId: string};
  treatment?: {type: 'TRANSFER'|'RENT_SHARE'; ruleId: string}; goal?: {id: string; ruleId: string};
  tags: string[]; excludeFromBudgets: boolean; reviewed: boolean; matched: string[]; }
function evaluateRules(facts: RuleFacts, rules: readonly UserRuleCore[]): Outcome;
```

Precedence rules (write them as comments and tests): per-field first-wins; `tags` union (sorted, unique, lowercase,
max 20); `treatment` is exclusive and first-wins, and when present it decides the category (TRANSFER → the Transfers
category and `kind = TRANSFER`; RENT_SHARE → the Rent category and `kind = REFUND`, `rentShare = true`, per
prompt 01) regardless of `setCategory`; `stopProcessing` halts after that rule's actions; inactive rules are skipped.
`merchantKeys` is `[merchantKey]` now; prompt 04 adds merchant aliases. Unknown/invalid regex never matches and never throws.
Reject catastrophic-backtracking shapes (nested quantifiers such as `(a+)+`) at write time, and cap the tested input at 300 chars.

Also export `describeRule(rule, lookups)` that returns a human sentence ("When the merchant is Maxol and the amount is
under €5, set the category to Coffee"). The UI and activity log use it.

## API

New `apps/api/src/rules/` module (`rules.module.ts`, `rules.controller.ts`, `rules.service.ts`); remove the user-rule
code from `CategoriesService`/`CategoriesController` (keep category CRUD there). Contracts: `ruleConditionSchema`,
`ruleActionSchema`, `ruleSchema` (id, name, position, active, stopProcessing, conditions, actions, origin, description),
`createRuleBody`, `updateRuleBody`, `reorderRulesBody`, `rulePreviewBody`, `rulePreviewResponse`, `applyRuleBody`,
`applyRuleResponse`, `seedRuleSchema`. Update `api-client` methods and hooks.

| Route | Purpose |
|-------|---------|
| `GET /rules` | user rules ordered by `position` |
| `POST /rules` | create; optional `position` (default: top for MANUAL); runs `rules-apply` for **new** transactions only unless `applyToPast` is true |
| `PATCH /rules/:id`, `DELETE /rules/:id` | edit/delete; either schedules `rules-apply` (mode `rerun`) so rows previously set by this rule are re-evaluated |
| `PUT /rules/order` | body `{ids: string[]}` (must be the full set) |
| `POST /rules/preview` | body `{rule: draft, ruleId?: string, position?: number}` → `{matched, wouldChange, protectedManual, shadowed, examples[≤20: transactionId, date, merchant, amount, before{category,tags}, after{category,tags}]}`. Does not write. With `ruleId` the stored version is replaced by the draft in the same slot |
| `POST /rules/:id/apply` | body `{includeManual: boolean}` → `{updated, skippedManual, skippedProtected}`; writes events |
| `GET /rules/seed`, `PATCH /rules/seed/:id` | list/toggle SEED rules (this is what Settings `RulesCard` showed under the "Built-in" filter) |

`RulesService.run(userId, {transactionIds? | filter?, includeManual})`:

1. Load active user rules, categories, SEED `MerchantRule`s, goals, and the target transactions with merchant + account in two queries (no N+1).
2. Build `RuleFacts` per transaction, `evaluateRules`, then SEED `applyRules` for the category if no user rule set one.
3. Compute the diff against the stored row; group identical diffs and write with `updateMany`; write `TransactionEvent`s with
   `recordMany` (actor `RULE`, `ruleId`, summary from `describeRule`).
4. **Protections:** never change the category of a row with `categorisedBy = 'USER'` unless `includeManual`; never change the
   category of a row with `transferPairId` (auto-paired transfers stay Transfers) but tags/flags may apply; never touch `amount*`.
5. Set `categorisedBy = 'RULE'` (user rule) or `'SEED'`, `needsReview = false` when a category is assigned; call
   `closeResolvedRequests`. `renameMerchant` re-points `merchantId` to the merchant with key
   `normaliseMerchant(name).merchantKey` (find or create) and never edits the old merchant.
6. Add `rules-apply` to `JobName`; register it in `RulesService.onModuleInit`; enqueue with a singleton key per user.

Refactor `CategorisationService`:

- `categoriseUser` delegates to `RulesService.run` for rows with `categoryId = null` (new data), then keeps the unknown-merchant
  flow, the `INCOME → income` fallback, and the AI/keyword suggestion for the request unchanged. Behaviour for users with no
  user rules must be identical to today (cover with the existing e2e test).
- `applyToMerchant` upserts the ANSWER rule (`autoMerchantKey = merchantKey`, name `"<Merchant> → <Category>"`, condition
  `merchant equals key`, action `setCategory`, appended at the bottom), updates `Merchant.defaultCategoryId`, then runs the engine
  for that merchant's payments **with `includeManual = true`** (today's "every time" overrides earlier one-offs) so a higher
  amount-based rule still wins for the payments it matches. Return the same `{updatedCount}` shape.
- `applyOnce` keeps `categorisedBy = 'USER'`.

## Web and mobile (keep working, minimal)

- Web `settings.tsx` `RulesCard`: switch to the new `useRules`/`useSeedRules` hooks, show `rule.description`, keep toggle and
  delete, add up/down move buttons calling `PUT /rules/order`. No editor yet (part B).
- Mobile: no rules UI exists; only make the typecheck pass if shared hooks changed.
- Loading/empty/error states: `LoadingBlock`, `EmptyState`, `ErrorNote` from `common.tsx`.

## Edge cases

- **Pending vs posted:** rules apply to pending rows too; when a pending row posts, prompt 05 carries its edits; the engine
  must be idempotent so re-running on the posted row yields the same result and writes no duplicate events.
- **Refunds:** `direction` is by sign, so a refund is `credit`; a category rule on the merchant applies to it as well. An
  `amount` condition uses the absolute value.
- **Transfers between own accounts:** auto-paired rows are protected (above). `markTransfer` on an unpaired row sets
  `kind = TRANSFER` with no `transferPairId`; `linkTransfers` must leave it alone.
- **Rent shares:** `markRentShare` is only valid on a credit; on a debit it is a no-op that the preview reports as
  "ignored (not a credit)".
- **Multi-currency (Revolut):** amounts compare on `amountEur`; use the `currency` condition when you need the original currency.
- **Payday periods:** not involved; dates are untouched.
- Conflicting rules (A sets Coffee, B sets Fuel for the same payment): the higher one wins; the preview reports `shadowed`.
- Deleting a category used by a rule: category delete/archive must be blocked or the rule deactivated with a visible reason
  (rule actions reference `categoryId`; validate on read and mark the rule `invalid` in the DTO instead of throwing).
- Deleting a goal: `linkGoal` actions referencing it become invalid the same way.
- Huge regex or bad input: 400 with a clear message; never crash the sync job.

## Acceptance criteria

1. Create the two Maxol rules. Import a CSV with Maxol rows of €3.20, €45.00 and €12.00: they become Coffee, Fuel, Fuel (the last from the seed rule).
2. Move the "Maxol under €5" rule below a generic "Maxol → Fuel" rule: the €3.20 payment preview now shows it as `shadowed`.
3. Answer an unknown merchant with "every time": a new rule named "<Merchant> → <Category>" appears at the bottom of `GET /rules`; answering again with another category updates it in place (no second rule).
4. Preview of an edited rule changes no data; "apply to past" updates rows and each gets a `CATEGORY` activity event naming the rule.
5. A payment you categorised "once" is not changed by apply-to-past unless `includeManual` is true.
6. Migration: a database with user rules before the migration has identical categorisation after it (compare counts per category).
7. The existing e2e flow (sync → categorise → answer → re-categorise) still passes.

## Tests

- finance-core `ruleset.test.ts`: every condition/op; AND semantics; per-field first-wins; tag union; stopProcessing; inactive; treatment precedence; the Maxol table (3.20, 5.00, 12.00, 20.00, 45.00); invalid and catastrophic regexes; absolute amount for refunds; `describeRule` text.
- API unit: `RulesService` protections (USER-set, paired transfer), idempotency (second run writes nothing), diff grouping, `renameMerchant` find-or-create, limits.
- e2e: Maxol scenario via CSV import; ANSWER rule upsert; preview does not mutate; migration data copy (run the migration SQL logic against seeded legacy rows in a test helper if feasible, otherwise document the manual SQL check you performed).
- contracts: `ruleConditionSchema`/`ruleActionSchema` accept valid and reject malformed JSON.

## Out of scope

Rule editor UI, merchants screen, merge/aliases, logos (prompt 04); bulk edit (05); recurring (10); owner action (16); any AI.

## Finish

1. Explore the files above, post a short plan, then implement.
2. Run `pnpm install`, `pnpm --filter @finally/db db:generate`, `pnpm turbo run typecheck lint test build`; run e2e if `DATABASE_URL` is reachable, otherwise say so.
3. Report: migration name, API changes, anything deferred, acceptance results.
