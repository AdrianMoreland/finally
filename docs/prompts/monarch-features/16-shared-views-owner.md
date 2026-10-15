# 16 · Shared views: mine, partner's, shared, with owner filters (and a plan for a future partner login)

You are working in the Finally repo (personal finance, Ireland, EUR, AIB + Revolut read-only). Prerequisite: `01-foundations.md`, which already added the
data model (`Person`, `Account.ownerPersonId`, `Account.shared`, `Transaction.ownerPersonId`, `Transaction.sharedOverride`, the ownership filter, effective ownership on `CoreTx`).
This prompt adds the screens, the rules/bulk integration and the design note. **There is no partner login** (open question 1 in the plan, default: not now).

## Ground rules (this repo)

- pnpm 10 + Turborepo. Read `docs/ENGINEERING.md`, `PLAN.md`, `docs/prompts/monarch-features/00-plan.md`. Full check: `pnpm turbo run typecheck lint test build`; `pnpm --filter @finally/finance-core test`; `pnpm --filter api test`; `pnpm --filter api test:e2e` (needs `DATABASE_URL`).
- Zod 4 schemas in `packages/contracts/src`; DTOs in `apps/api/src/common/dto.ts`; `packages/api-client` parses with the same schemas. Pure logic in `packages/finance-core`. Money = decimal strings.
- Prisma migrations; new tables get RLS + REVOKE and join `exportJson`/`deleteAllData`. Every query is scoped by `userId`: **all data still belongs to one login**; a partner is a `Person` row, not a user.
- Mock bank, no keys, no third-party calls.
- Web: React 19, Tailwind v4, shadcn, TanStack Router. Mobile: Expo Router + NativeWind.

## Goal and behaviour

1. Mark each **account** as *mine*, *partner's* or *shared*, and override it per **transaction** (e.g. a shared dinner on my card).
2. A global **scope selector** (Everything · Mine · Partner's · Shared · custom combination) that filters Transactions, Reports, the Overview totals, Net worth and Recurring, with the choice remembered.
3. Everywhere a payment is listed, show an **owner chip** (Mine / Partner / Shared) when a partner exists.
4. Rules and bulk edit can **set the owner**.
5. A short **design note** describes exactly what a later partner login needs, so the data model does not have to change.

## Read first

- Prompt 01: schema (`Person`, ownership columns), `transaction-filter.ts` ownership clause, `effectiveOwnership` helper in `finance-core/src/types.ts` or `ownership.ts`, `transactionSchema.ownership/ownerName`, `UserPreference` registry (`scope.ownership`).
- `apps/web/src/routes/_app/{transactions,index,settings}.tsx`, `components/app-shell.tsx`, `routes/_app/reports.tsx` (prompt 07), `routes/_app/net-worth.tsx` (prompt 08), `routes/_app/recurring.tsx` (prompt 11), `components/common.tsx`.
- `apps/api/src/overview/overview.service.ts`, `data/finance-data.service.ts`, `apps/api/src/reports/*`, `apps/api/src/net-worth/*`, `apps/api/src/rules/*` (action list), bulk edit in `apps/api/src/transactions/*` (prompt 05), `banking.service.ts#listAccounts/updateAccount`.
- `apps/mobile/app/settings.tsx`, `(tabs)/index.tsx`, `(tabs)/activity.tsx`.

## Data model

Mostly done in prompt 01. This prompt may add (migration `<next timestamp>_owner_views` only if needed):

- `Person.archived Boolean @default(false)`; nothing else. If prompt 01 did not create `Person` for new users on all code paths, fix that here.
- Preference registry additions: `scope.ownership` (`{ values: ('MINE'|'PARTNER'|'SHARED')[] }`, default all three) — if not already registered.

## finance-core

`ownership.ts` (tests): `effectiveOwnership(tx, account, people)` → `'MINE'|'PARTNER'|'SHARED'`; precedence: `tx.sharedOverride` (true ⇒ SHARED, false ⇒ not shared, null ⇒ account) → then `tx.ownerPersonId ?? account.ownerPersonId` → person kind (`SELF` ⇒ MINE, `PARTNER` ⇒ PARTNER); no person ⇒ MINE. `scopeMatches(ownership, selected[])`. `presets`: Everything = all three; Mine = `MINE`; Partner's = `PARTNER`; Shared = `SHARED`; "Mine + shared" available as custom.
Document in `docs/ENGINEERING.md`: **Mine view shows only MINE** (shared is its own view), and totals in "Everything" count each payment once.

## API

- People: `GET /people`, `POST /people` (partner only; at most one PARTNER now), `PATCH /people/:id` (name, colour), `DELETE /people/:id` → archives; accounts/transactions owned by the archived person fall back to SELF with a warning count. Contracts `personSchema`, hooks `usePeople`.
- Accounts: `PATCH /accounts/:id` accepts `ownerPersonId`, `shared`; `accountSchema` returns `ownership`, `ownerName`.
- Transactions: `PATCH /transactions/:id` and bulk edit (prompt 05) accept `ownership: 'MINE'|'PARTNER'|'SHARED'|'INHERIT'` (INHERIT clears the overrides), writing `OWNER` events.
- Rules (prompt 03): add action `setOwner { ownership }` to `ruleActionSchema`, `evaluateRules` (per-field first-wins), `describeRule`, and the rule editor option (prompt 04 UI), with tests. Back-compat: stored rules without it are fine.
- Scope plumbing: every read that returns money accepts `ownership` (comma list) through the shared `TransactionFilter`: transactions, reports (already by filter), overview (new optional query `ownership`), net worth (filters accounts by effective account ownership; manual accounts use `ownerPersonId`), recurring calendar (item `accountId` ownership; items without an account count as the item's `ownerPersonId` if added, else MINE — add `RecurringItem.ownerPersonId` via migration if you implement this, otherwise skip recurring with a documented limitation), budgets **unchanged** (household-wide; the page shows a note "Budgets cover everyone"), safe to spend **unchanged** (it is the user's own cash: uses accounts owned by MINE or SHARED? **No**: unchanged, based on spendable CURRENT accounts as per prompt 02, and the note says so).
- The scope preference is applied **client-side** by passing `ownership` to each hook (a `useScope()` hook in api-client returning `{values, label}`), so the API stays stateless.

## Web UI

- **Settings → People & ownership:** card to add a partner (name, colour), table of accounts with an owner Select (Mine / Partner's) and a "Shared" Switch; explanation text "This only labels your data. Your partner can't sign in yet."
- **Scope selector** in the app header / sidebar (below the account list): ToggleGroup chips *Everything · Mine · Partner's · Shared* (hidden until a partner exists **or** any account/transaction is Shared); persists to `scope.ownership`. A visible badge "Showing: Mine" appears on filtered pages (Overview, Transactions, Reports, Net worth) so numbers are never silently partial; clicking it opens the selector.
- **Transactions:** owner chip in the row (small, colour from the person) and a column option ("Owner", prompt 05's column picker), owner filter in the toolbar, owner select in the detail drawer, owner action in the bulk bar and in the rule editor.
- **Reports:** group-by *Owner* works with the scope; the legend shows person colours.
- **Overview and Net worth:** respect the scope; a "Partner's accounts are included/excluded" caption.
- Empty states: when a scope has no data ("Nothing is marked as Shared yet. Mark an account or payment as shared.").
- Loading/error as elsewhere. Accessibility: chips are a `ToggleGroup type="multiple"`, labelled; colours are paired with text.

## Mobile

Settings screen: People & ownership (same fields), scope picker as a segmented control at the top of Home and Activity, owner chip in `PaymentRow`, owner change in the payment detail sheet (prompt 05).

## Design note (deliverable): `docs/partner-login-design.md`

Write ~1–2 pages, no code changes, covering: why the current model works (one `User` owns all data, `Person` labels it); what a login for the partner needs:
`Household` (id, name) and `HouseholdMember` (userId, personId, role OWNER|MEMBER|VIEWER); moving the data-ownership key from `userId` to `householdId` (list every table and the migration order); a `ScopeService` that turns the authenticated user into `{householdId, visiblePersonIds}` and is the only place `where: {userId}` becomes `where: {householdId}`; per-account sharing rules (a partner sees only accounts marked partner/shared, others hidden at the query layer, never just in the UI); `ALLOWED_EMAILS` and Supabase invites; push devices per user; budgets/goals owned by the household; audit (`TransactionEvent.actor` gets a `userId`); RLS stays "on with no policies" because the API is the only reader; privacy risks (partner seeing salary, private spending) and the "private account" flag; and rollout steps with a feature flag. Reference `Person.linkedUserId`.

## Edge cases

- **Pending vs posted:** ownership overrides carry over when a pending payment posts (prompt 05 copies all user-set fields, including `ownerPersonId` and `sharedOverride`).
- **Refunds:** inherit the original payment's owner only if the user sets it; default is the account's owner. Bulk edit can fix a set at once.
- **Transfers between own accounts:** a transfer from my account to my partner's account is detected as a transfer (excluded from spending) because both accounts are in this data set. In the "Mine" view such a transfer is shown as money leaving (labelled "To {partner}"), **not** hidden; in Reports it stays excluded in "Everything" and is surfaced in `notes` for single-owner scopes ("1 transfer to your partner's account is excluded").
- **Rent shares:** a roommate is not a partner; ownership is unrelated. Rent share credits keep the account's owner.
- **Multi-currency:** no impact; amounts in EUR.
- **Payday periods:** reports by payday period respect the scope; the payday is the user's.
- A shared payment on my card: counts once in Everything, once in Shared, zero times in Mine and in Partner's. Document this and show it in a tooltip on the Shared chip.
- Removing the partner: confirm dialog listing how many accounts/payments revert to Mine.
- A scope that yields zero rows must not divide by zero (savings rate, percentages).
- Scope persists across devices (server preference) but the Overview badge makes it obvious.
- Single-user mode (no partner, nothing shared): the selector and chips stay hidden; nothing changes visually.

## Acceptance criteria

1. Add a partner "Sam", set the Revolut account as Sam's: Transactions with scope *Mine* hides those payments, *Partner's* shows only them, *Everything* shows all.
2. Mark one AIB dinner as Shared: it appears only in *Shared* and *Everything*; the chip tooltip explains.
3. A rule "Merchant equals Lidl → set owner Shared" applied to past payments updates them and writes `OWNER` events.
4. Reports group-by Owner totals match Everything; switching scope changes totals correctly; Net worth honours the scope.
5. The scope choice survives reload and shows on mobile.
6. With no partner and nothing shared, the UI is unchanged.
7. `docs/partner-login-design.md` exists and lists every table that keys on `userId` today (check against `schema.prisma`).

## Tests

- finance-core: `effectiveOwnership` matrix (account/person/override combinations, no person, archived person), `scopeMatches`.
- API: filter by ownership (each value, combinations), people CRUD and the one-partner limit, archive fallback, `setOwner` rule action, bulk `INHERIT`, net-worth/overview scope parameter, ownership scoping across users.
- contracts: new schema variants.

## Out of scope

Partner login or invitations, splitting shared expenses/settling up, per-person budgets, separate dashboards per person, permissions/privacy flags (only designed in the note).

## Finish

1. Explore the files above, post a short plan, then implement.
2. Run `pnpm install`, `pnpm --filter @finally/db db:generate` (if schema touched), `pnpm turbo run typecheck lint test build`; e2e if `DATABASE_URL` is reachable, else say so.
3. Report what changed, deferred items, acceptance results.
