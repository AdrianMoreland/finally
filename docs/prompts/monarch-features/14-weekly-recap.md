# 14 · Weekly recap: deterministic dashboard card plus optional push

You are working in the Finally repo (personal finance, Ireland, EUR, AIB + Revolut read-only). Prerequisites: `01-foundations.md`. It reads better
with `10` (upcoming bills), `12/13` (budgets), `09` (goals) merged; each section degrades gracefully when its data source is absent. **No LLM, no
third-party calls: every sentence comes from rules and templates.**

## Ground rules (this repo)

- pnpm 10 + Turborepo. Read `docs/ENGINEERING.md`, `PLAN.md`, `docs/prompts/monarch-features/00-plan.md`. Full check: `pnpm turbo run typecheck lint test build`; `pnpm --filter @finally/finance-core test`; `pnpm --filter api test`; `pnpm --filter api test:e2e` (needs `DATABASE_URL`).
- Zod 4 schemas in `packages/contracts/src`; DTOs in `apps/api/src/common/dto.ts`; `packages/api-client` parses with the same schemas. Pure logic in `packages/finance-core` (decimal.js, Vitest). Money = decimal strings; dates Dublin `YYYY-MM-DD`.
- Prisma migrations; new tables get RLS + REVOKE and join `exportJson`/`deleteAllData`. Queries scoped by `userId`.
- Pushes only through `PushService` (quiet hours). Jobs through `JobsService`. Mock bank, no keys.
- Web: React 19, Tailwind v4, shadcn, TanStack Router. Mobile: Expo Router + NativeWind + `expo-notifications`.

## Goal and behaviour

Every Sunday evening (and on demand) Finally writes a short, honest summary of the week:

- a **headline** chosen by rules ("A quiet week: €96 spent, 38 % under your usual", "Groceries ran hot", "Payday week", "You're ahead on your Holiday goal");
- **key numbers**: spent, vs last week, vs your 4-week average, income, top three categories, biggest payment, new merchants;
- **budget callouts** (categories near/over their budget, flex number remaining) and **safe to spend** line;
- **coming up** (bills and payday in the next 7 days) and **goals** (status changes);
- **housekeeping** ("3 merchants still need a category").

It shows as a **dashboard card** ("Your week") and, if enabled, as a **push** (and an in-app history). Email is **not** built now (decision 8 in the plan); the code has a delivery interface so it can be added.

## Read first

- `apps/api/src/insights/insights.service.ts` (`weeklyDigest`, `weekly` cron `0 0 19 * * 0`, `pushPending`), `packages/finance-core/src/insights.ts` (`savingsRate`, `Draft`, `eur`, `eur0` in `types.ts`), `dates.ts`.
- `apps/api/src/notifications/push.service.ts`, `quiet-hours.ts`, `packages/contracts/src/core.ts#pushPayload`, `apps/web/src/sw/sw.ts`, `apps/mobile/src/lib/notifications.ts`.
- `apps/api/src/overview/overview.service.ts` (what the dashboard already shows), `apps/web/src/routes/_app/index.tsx`, `components/insight-list.tsx`, `apps/mobile/app/(tabs)/index.tsx`.
- If merged: `RecurringService` occurrences (10), budgets `flex`/bands (12), `GoalsService` status (09), `UserPreference` registry (01).

## Data model (migration `<next timestamp>_weekly_recaps`)

```prisma
model WeeklyRecap {
  id String @id @default(cuid())
  userId String
  weekStart DateTime @db.Date          // Monday, Dublin
  weekEnd DateTime @db.Date            // Sunday
  payload Json                         // validated with weeklyRecapSchema (versioned)
  schemaVersion Int @default(1)
  generatedAt DateTime @default(now())
  pushedAt DateTime?
  seenAt DateTime?
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, weekStart])
}
```
RLS + REVOKE; export; delete-all. Preference registry key `notifications.weeklyRecap` = `{ push: boolean (default true), pushTime: 'HH:mm' (default '19:00'), weekday: 0..6 (default 0 = Sunday) }`.
(If you want to keep an `email` boolean for the future, keep it `false` and disabled in the UI with the text "Email needs a mail provider and is not set up".)

## finance-core: `recap.ts` (+ `recap.test.ts`)

`buildWeeklyRecap(input): WeeklyRecap` is pure. Input: `today`, `weekStart/weekEnd`, `txs` for the last 8 weeks (`CoreTx` with flags), categories, `budgetRows` (optional), `flex` (optional), `upcoming` (optional list of occurrences in the next 7 days), `goals` (optional statuses and last week's statuses), `toSortCount`, `safeToSpend` (optional).

- **Numbers** (all net of refunds, excluding transfers and `excludeFromBudgets`, rent shares netting Rent): `spent`, `lastWeekSpent`, `fourWeekAvg` (the previous 4 full weeks), `deltaVsLast`, `deltaVsAvg`, `income`, `topCategories[3]` with share, `biggestPayment` (amount, merchant, date), `newMerchants` (first-ever payment this week, max 3), `paymentCount`.
- **Headline selector**: ordered list of rules, first match wins, each with a template and a `tone` (`GOOD|NEUTRAL|WATCH`):
  1. a goal reached/overdue this week → "You've reached your {goal}"/"{goal} is overdue";
  2. `deltaVsAvg ≤ −25 %` and `spent ≥ €30` → "A quiet week: {spent} spent, {pct} under your usual";
  3. `deltaVsAvg ≥ +25 %` and the excess ≥ €40 → "{Category} pushed this week up: {spent}, {pct} over your usual" (category = largest positive contributor);
  4. budget category crossed 100 % this week → "{Category} went over its budget";
  5. payday landed this week → "Payday week: {income} in, {spent} out";
  6. otherwise → "{spent} spent this week" with the neutral comparison.
  All strings in one `TEMPLATES` constant for easy editing; euro formatting via `eur`/`eur0`.
- **Sections** each optional with `visible` booleans so empty ones disappear: budgets (max 3 callouts, ≥ 80 % used and ≤ 10 days left, or crossed 100 % this week), upcoming (≤ 5 items), goals (status changes since last week), housekeeping.
- **Quiet weeks:** zero spending → headline "No spending recorded" and a note if the last sync is older than 3 days ("Your accounts haven't synced since {date}").
- **Partial history:** fewer than 4 prior weeks → omit `deltaVsAvg` and say nothing about "usual".
- Deterministic: same inputs ⇒ same output (sorted ties by name). No `Date.now()` inside.
- `recapPushText(recap)` → `{title, body}` ≤ 120 chars body, e.g. "Your week in money" / "€212 spent, €38 less than last week. Biggest: Groceries. 3 bills due this week."

## API

`apps/api/src/recaps/` (`recaps.module.ts`, `.controller.ts`, `.service.ts`):

- `RecapsService.generate(userId, weekStart?)`: loads the inputs (reusing services; every optional source wrapped so a failure in one section drops only that section, logged), calls `buildWeeklyRecap`, upserts by `(userId, weekStart)`.
- Move the Sunday job: the existing `weekly-digest` job now calls `generate` for the week that just ended (week = Monday–Sunday in Dublin), stores it, and sends the push **only if** `prefs.push` and it hasn't been pushed (`pushedAt`), via `PushService.send(…, {respectQuietHours: true})`; if deferred, retry on the next half-hour run (reuse the `flush-notifications` cadence or add a cron) up to Monday noon, then give up. Keep `InsightsService.weeklyDigest` as a thin delegator or delete it and update the cron.
- Routes: `GET /recaps/latest` (generates a **provisional** "week so far" recap on demand when none exists for the current week, flagged `provisional: true`, not stored), `GET /recaps?limit=` (history), `GET /recaps/:id`, `POST /recaps/:id/seen`, `POST /recaps/refresh` (regenerate the current provisional one).
- Contracts: `weeklyRecapSchema` (versioned; strings pre-rendered plus structured numbers so clients can lay them out), `recapListResponse`; hooks `useLatestRecap`, `useRecaps`, `useMarkRecapSeen`.
- Push payload: `kind: 'digest'`, `data: { screen: 'recap' }`. Web `sw.ts` routes `screen` to `/${screen}` already; add a `/recap` route (below). Mobile `handleNotificationResponse`: `data.screen === 'recap'` → recap screen.
- Settings: `GET/PUT /me/preferences/notifications.weeklyRecap`.

## Web UI

- **Dashboard card** "Your week" on `apps/web/src/routes/_app/index.tsx` (a `Panel`, `SPAN[5]`): headline, three stat tiles (Spent, vs last week, Top category), up to two callouts, "Coming up" list, link "See the full recap". Tone colouring uses text + icon. Skeleton while loading; if the request fails the card shows a compact `ErrorNote` and the rest of the dashboard is unaffected. (Prompt 15 will turn this into a widget; build it as a standalone component `components/recap/RecapCard.tsx` so it moves cleanly.)
- **`/recap` page** (not in the sidebar; reachable from the card and from notifications): the full recap, a week picker (history list), "Refresh" for the provisional week. Print-friendly layout is not required.
- Settings → Notifications: weekly recap push Switch, weekday + time selects, disabled "Email" row with the explanation.
- Mark seen when opened; unseen recap shows a small dot on the card.

## Mobile

- Home screen card (same content, compact) + a **Recap** screen (stack route, not a tab) with the full recap and history list; Settings toggle. Notification tap opens the Recap screen.

## Edge cases

- **Pending vs posted:** included, and the recap says "includes €x pending" when pending > 0 (the final Sunday run may include pending Saturday card payments that later change; the stored recap is a snapshot and the dashboard shows "as at Sunday 19:00").
- **Refunds:** netted into categories; a week where refunds exceed spend reads "Net refunds of €x this week" and never shows negative spend as "spent".
- **Transfers between own accounts:** excluded from all numbers, never mentioned as spending.
- **Rent shares:** Rent net of roommates' shares; income excludes them.
- **Multi-currency:** EUR; mention "(includes N foreign-currency payments converted to EUR)" only when N > 0.
- **Payday periods:** the week is Monday–Sunday, independent of payday; the "payday week" headline checks that an INCOME ≥ €1,000 landed in the week or that `effectivePayday` falls inside it.
- **DST weeks** (29 Mar and 25 Oct 2026): week boundaries by Dublin date, not 7×24 h arithmetic; test both.
- First week of use / mock-only data with short history; accounts not synced for days; a week with a single huge payment (biggest payment callout, headline rule 3 should name the category, not call it a "trend").
- Double generation (job retried): upsert is idempotent; the push is sent once (`pushedAt` set in the same step as the send result; a crash between send and write may send twice at most once: accept and document).
- The user turned off push but not the card: generation continues, push is skipped.
- Privacy: push text contains amounts and category names, never raw bank text, merchant names only for "biggest payment" if the user sets `showMerchantInPush` (default **false**: say "your biggest payment was €120" without the name on the lock screen).

## Acceptance criteria

1. Hitting `GET /recaps/latest` on the mock data returns a headline, numbers consistent with the Transactions page for the same Monday–Sunday filter, and no section with empty content.
2. Forcing the Sunday job for a past week stores one recap; running it again changes nothing; one push is sent (stubbed device).
3. With quiet hours active at 19:00, the push is deferred and delivered at 08:00 Monday; after Monday noon it is dropped.
4. Dashboard card shows the recap; disabling push in Settings keeps the card.
5. Headline rules: construct fixtures for each of the six rules and see the right template; ties and missing optional inputs behave.
6. Opening the notification (web push or mobile) lands on the recap page/screen.

## Tests

- finance-core: every headline rule, order precedence, sections visibility, partial history, quiet week, refunds-exceed-spend, rent share netting, DST weeks, determinism, push text length and privacy (no merchant name by default).
- API: generation upsert idempotency, section failure isolation (stub a failing budgets source), push once/deferral/cut-off, preferences validation, provisional recap not stored, ownership scoping.
- contracts: `weeklyRecapSchema` round trip.

## Out of scope

Email delivery, monthly recap, LLM-written text, per-merchant narratives, sharing the recap with a partner (prompt 16 may extend later), image/graph rendering in push.

## Finish

1. Explore the files above, post a short plan, then implement.
2. Run `pnpm install`, `pnpm --filter @finally/db db:generate`, `pnpm turbo run typecheck lint test build`; e2e if `DATABASE_URL` is reachable, else say so.
3. Report what changed, migration name, deferred items, acceptance results.
