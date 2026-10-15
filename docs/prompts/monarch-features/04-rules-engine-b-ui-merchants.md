# 04 · Rules engine, part B: rules screen, rule editor with preview, merchants screen

You are working in the Finally repo (personal finance, Ireland, EUR, AIB + Revolut read-only). Prerequisites:
`01-foundations.md` and `03-rules-engine-a-core.md` merged (`Rule` model, `/rules*` API, `ruleset.ts`).

## Ground rules (this repo)

- pnpm 10 + Turborepo. Read `docs/ENGINEERING.md`, `PLAN.md`, `docs/prompts/monarch-features/00-plan.md` first. Full check: `pnpm turbo run typecheck lint test build`; `pnpm --filter @finally/finance-core test`; `pnpm --filter api test`; `pnpm --filter api test:e2e` (needs `DATABASE_URL`); `pnpm --filter @finally/db db:generate`.
- Zod 4 schemas in `packages/contracts/src`; DTOs in `apps/api/src/common/dto.ts`; `packages/api-client` parses with the same schemas. Maths in `packages/finance-core` (pure, decimal.js, Vitest). Money = decimal strings. Dates = Dublin `YYYY-MM-DD`.
- Prisma 7 migrations in `packages/db/prisma/migrations/<timestamp>_<name>/`; every new table gets RLS + REVOKE in its migration and is added to `MeService.exportJson`/`deleteAllData`. Queries scoped by `userId`.
- Mock bank, no keys. No remote assets or third-party calls (that includes logos and fonts for logos).
- Web: React 19, Vite, Tailwind v4, shadcn (`apps/web/src/components/ui`), TanStack Router file routes in `apps/web/src/routes/_app` (the generated `routeTree.gen.ts` is committed; running `pnpm --filter web dev` or `build` regenerates it), primitives in `components/common.tsx`, nav array `NAV` in `components/app-shell.tsx`. Mobile: Expo Router `apps/mobile/app`, NativeWind primitives in `src/components/ui/primitives.tsx`.

## Goal and behaviour

1. A **Rules** page where I see my rules in order, reorder them, turn them on/off, delete them, and create or edit one
   with a live **preview**: "matches 14 payments, 9 would change, 2 are protected because you categorised them by hand",
   with examples. Saving offers "Also apply to the 9 past payments".
2. Create a rule from a payment: a "Create rule from this payment" action in the Transactions table prefilled with that
   merchant and amount.
3. The To-sort "every time" wording now says what actually happens: it makes a rule, with a link to see/edit it.
4. A **Merchants** page: find duplicates and truncated bank names, merge them, rename them, see totals, and show logos
   from a **local** mapping (monogram fallback). No third-party calls.

## Read first

- Prompt 03's output: `apps/api/src/rules/*`, `packages/finance-core/src/ruleset.ts` (`describeRule`, types), contracts for rules, `api-client` rule hooks.
- `apps/web/src/routes/_app/transactions.tsx` (row rendering, `CategoryPicker`), `sort.tsx`, `settings.tsx` (`RulesCard`, which this replaces with a link), `components/app-shell.tsx`, `components/common.tsx`, `components/ui/{dialog,sheet,select,switch,popover,table}.tsx`.
- `apps/api/src/banking/ingest.service.ts` (merchant creation), `finance-core/src/normalise.ts`, schema `Merchant`, `RecurringSeries` (unique on `userId, merchantId`), `CategorisationRequest`.
- `apps/mobile/app/settings.tsx`, `apps/mobile/app/(tabs)/more.tsx`, `apps/mobile/src/components/payments.tsx`.

## Data model (migration `<next timestamp>_merchant_aliases`)

```prisma
model MerchantAlias {
  id String @id @default(cuid())
  userId String
  aliasKey String          // a merchantKey that now resolves to merchantId
  merchantId String
  createdAt DateTime @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  merchant Merchant @relation(fields: [merchantId], references: [id], onDelete: Cascade)
  @@unique([userId, aliasKey])
  @@index([merchantId])
}
```
Add to `Merchant`: `aliases MerchantAlias[]`, `logoKey String?` (a slug into the local logo map; keep the existing unused `logoUrl` null).
RLS + REVOKE, export, delete-all as usual.

## API

Merchants module `apps/api/src/merchants/` (contracts: `merchantSummarySchema`, `mergeMerchantsBody`, `renameMerchantBody`, `mergeSuggestionSchema`):

| Route | Behaviour |
|-------|-----------|
| `GET /merchants?q=&sort=` | list with `paymentCount`, `totalSpendEur` (12 months), `lastSeen`, `category` (default), `ruleCount`, `aliasCount`, `logoKey` |
| `GET /merchants/suggestions` | pure `suggestMerges` result (below) |
| `POST /merchants/merge` | `{targetId, sourceIds[]}` |
| `PATCH /merchants/:id` | rename (`displayName`), set `defaultCategoryId`, set `logoKey` |

**Merge** (one DB transaction): re-point `Transaction.merchantId` from sources to the target; insert `MerchantAlias`
rows for each source `merchantKey` (and for the source's own aliases); for `RecurringSeries` keep the one with more
occurrences (delete the other, unique constraint); close/re-point any OPEN `CategorisationRequest` for a source key;
rewrite user-rule `merchant equals` conditions that name a source key to the target key (keep the alias too, see below);
write a `MERCHANT` `TransactionEvent` (batched) for every moved payment; never delete the source `Merchant` row until all
references are gone, then delete it. Refuse to merge a merchant into itself or across users.

**Ingest must honour aliases:** in `IngestService.ingest` resolve `normaliseMerchant(raw).merchantKey` through
`MerchantAlias` before `createMany`/lookup so a future "TESCO EXPRESS 123" goes to the merged merchant. Add the same
resolution anywhere else a key becomes a merchant (grep `merchantKey`). Rule facts get
`merchantKeys = [merchant.merchantKey, ...aliases.aliasKey]` so `merchant equals <old key>` still matches, and
SEED `applyRules` is called once per key until one matches.

### finance-core `merchants.ts` (+ tests)

`suggestMerges(merchants: {id, merchantKey, displayName, paymentCount, lastSeen}[])` → groups
`{targetId, sourceIds[], reason: 'PREFIX'|'SAME_FIRST_TOKEN'|'SIMILAR', confidence: 0..1}`:

- `PREFIX`: one key is a token-prefix of another (`bewleys` ⊂ `bewleys-grafton-st`).
- `SAME_FIRST_TOKEN`: same first token (≥ 4 chars) and the remaining tokens are only locations/generic words from `normalise.ts`'s lists (export them).
- `SIMILAR`: normalised Levenshtein ≥ 0.85 on keys of length ≥ 6.
- Target = the one with most payments; ties → shortest key. Never suggest merging two merchants that have **different** user-set default categories without lowering confidence and saying so.
- Deterministic, no network, no ML.

`logos.ts` in finance-core (or `packages/tokens`): `logoKeyFor(merchantKey)` from a plain map
(`{ tesco: 'tesco', 'tesco-express': 'tesco', … }`, ~60 Irish merchants) and `monogram(name)` → `{ initials, hue }` with a
deterministic hue from the key. The **map holds slugs only**. Do not add third-party logo files to the repo. Web serves
`/merchant-logos/<slug>.svg` if the file exists in `apps/web/public/merchant-logos/` (add a README there explaining that
the user can drop their own SVGs in); otherwise the monogram renders. A `<MerchantAvatar>` component in
`apps/web/src/components/` handles both, with `alt=""` (decorative) and a stable size.

## Web UI

### `/rules` (`apps/web/src/routes/_app/rules.tsx`, add "Rules" to `NAV` with a `Workflow`/`ListChecks` lucide icon)

- Header: title, "New rule", a note explaining "Rules higher in the list win".
- List: each row shows `describeRule` text, origin chip (Manual / From an answer / Migrated), match count (from preview or
  cached), active Switch, move up / move down buttons (keyboard accessible, `aria-live` announcement "Moved to position 3"),
  edit, delete (confirm Dialog). Filter chips: All / Active / Inactive / From answers. Search by text.
- A collapsed "Built-in rules" section lists SEED rules with toggles only (read-only otherwise), as the old Settings card did.
- Empty state: "No rules yet. Answer a To-sort merchant or create one." Loading: `LoadingBlock`. Error: `ErrorNote` with retry.
- Optional: `@dnd-kit/sortable` drag handles on top of the buttons. Buttons are mandatory, drag is optional.

### Rule editor (Sheet on desktop, full-screen Drawer on narrow screens)

- Name (auto-suggested from conditions/actions, editable).
- Conditions builder: add/remove rows; each row = type select + operator + value input; amount rows validate decimals;
  account/currency use multi-selects; merchant rows autocomplete from `/merchants`. A visible "ALL of these must match".
- Actions builder: add/remove rows; category select (excludes archived/INCOME-mismatch is not enforced), tag input,
  rename merchant, goal select (disabled with a hint until goals v2 if none), checkboxes for the flag actions, "Stop processing more rules".
- **Preview panel** (debounced 400 ms `POST /rules/preview`): counts (matched / would change / protected / shadowed), a table of ≤ 20
  examples with before → after, a plain-language sentence from `describeRule`, and skeleton while loading. Errors show inline, not a toast.
- Footer: "Save", "Save and apply to N past payments", "Cancel". After applying, toast with updated count and a link to the Transactions page
  filtered to that rule's results (add an optional `ruleId` to the transactions search schema only if cheap; otherwise skip).
- Validation with `react-hook-form` + the contracts' Zod schemas. Regex field has a "Test against sample text" input.

### Transactions and To-sort integration

- `transactions.tsx`: row action menu (⋯) with "Create rule from this payment" → opens the editor prefilled
  (`merchant equals <key>`, and `amount` prefilled as a suggestion chip, not applied). Keep the inline category picker.
- `sort.tsx` and `CategoryPicker` copy: replace "future ones sort themselves" language with "Creates a rule: {Merchant} → {Category}".
  After answering, the toast has an "Edit rule" action linking to `/rules` with the rule open.
- `settings.tsx`: replace `RulesCard` with a short card linking to `/rules`.

### `/merchants` (nav item "Merchants")

- Table (virtualised if > 300): avatar, name, key (monospace, muted), payments, 12-month total, default category, rules count.
  Search, sort, multi-select checkboxes.
- "Possible duplicates" panel from `/merchants/suggestions`: each card shows the group, reason and confidence, with
  "Merge into {target}" and "Not the same" (dismiss persisted via `UserPreference` key `merchants.dismissedSuggestions`, add it to the registry).
- Merge dialog: pick target, shows consequences ("12 payments move, 1 recurring series is kept, 2 rules are updated"), confirm.
- Rename inline (Enter saves, Esc cancels). Logo picker: choose a local slug from the map, or "Initials".
- States: loading skeleton rows, empty ("No merchants yet. Sync your accounts"), error with retry.

## Mobile notes

- `apps/mobile`: add a read-only **Rules** screen under More (list with `describeRule` text, active toggle only) and a
  Merchants screen is out of scope. Mobile keeps answering To-sort items exactly as now, and the confirmation copy mentions "rule".
- `MerchantAvatar` for mobile uses monograms only (`PaymentRow` in `src/components/payments.tsx`).
- Editing rules on the phone is out of scope for now.

## Edge cases

- Pending vs posted: previews include pending rows; wording marks them "pending".
- Refunds: a `merchant equals` rule matches the refund too; the preview example shows the sign.
- Transfers between own accounts: paired transfers are listed as "protected" in previews.
- Rent shares: a rule with "mark as rent share" shows a warning if any matched row is a debit ("ignored for debits").
- Multi-currency: example amounts show EUR with the original currency in muted text.
- Payday periods: not involved.
- Merge safety: merging two merchants with different default categories asks which category the target keeps; undo is not
  supported, so the dialog says so. Provide a `MERCHANT` event so the history shows what moved.
- A rule that becomes invalid (category archived) shows a red "Needs attention" chip and the reason; it never silently stops.
- Two rules identical except order: the editor warns "A rule above already matches everything this one does".

## Acceptance criteria

1. Build the Maxol rules in the editor; the preview shows counts and examples before saving; saving + applying updates past rows.
2. Reorder rules with the buttons using only the keyboard; the new order persists after reload and changes which rule wins.
3. Right-click equivalent (⋯) "Create rule from this payment" opens a prefilled editor.
4. Answering a To-sort card shows "Creates a rule" copy and the toast links to the rule.
5. Merchants page suggests merging `Bewleys` / `Bewleys Grafton St` (from the mock data); after merging, a new sync of
   "BEWLEYS GRAFTON ST" lands on the merged merchant and a `merchant equals bewleys-grafton-st` rule still matches.
6. No network request leaves the app for logos (check the browser network panel); monograms render offline.
7. Dark mode and mobile width both look right; every icon-only button has an accessible name.

## Tests

- finance-core: `suggestMerges` (prefix, location-only tails, similarity threshold, different-category penalty, determinism); `logoKeyFor`/`monogram`.
- API: merge transaction (moves payments, aliases, recurring conflict, rule rewrite, events, rollback on failure); ingest alias resolution; `GET /merchants` aggregates.
- e2e: merge then sync a new payment for the alias key; preview endpoint untouched by merge.
- Web has no test runner configured beyond `vitest --passWithNoTests`; add Vitest + Testing Library only if cheap, otherwise unit-test pure helpers (rule-form ↔ API mapping) in `apps/web/src/lib/*.test.ts`.

## Out of scope

AI-suggested rules, importing rules, owner action (16), mobile rule editor, merchant "unmerge", bulk edit (05).

## Finish

1. Explore the files above, post a short plan, then implement.
2. Run `pnpm install`, `pnpm --filter @finally/db db:generate`, `pnpm turbo run typecheck lint test build`; e2e if `DATABASE_URL` is reachable, else say so.
3. Report what changed, migration name, deferred items, acceptance results.
