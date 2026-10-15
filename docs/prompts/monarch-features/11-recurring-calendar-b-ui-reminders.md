# 11 · Recurring calendar, part B: calendar, list view, add/edit, "paid" ticks, reminders

You are working in the Finally repo (personal finance, Ireland, EUR, AIB + Revolut read-only). Prerequisite: `10-recurring-calendar-a-engine.md`
merged (`RecurringItem`, `RecurringOccurrence`, `/recurring/*`, hooks). Transaction drawer from `05` is needed for the "make recurring" entry point.

## Ground rules (this repo)

- pnpm 10 + Turborepo. Read `docs/ENGINEERING.md`, `PLAN.md`, `docs/prompts/monarch-features/00-plan.md`. Full check: `pnpm turbo run typecheck lint test build`; `pnpm --filter @finally/finance-core test`; `pnpm --filter api test`; `pnpm --filter api test:e2e` (needs `DATABASE_URL`).
- Zod 4 schemas in `packages/contracts/src`; DTOs in `apps/api/src/common/dto.ts`; `packages/api-client` parses with the same schemas. Maths in `packages/finance-core`. Money = decimal strings; dates Dublin `YYYY-MM-DD`.
- Prisma migrations; new tables get RLS + REVOKE and join `exportJson`/`deleteAllData`. Queries scoped by `userId`.
- All pushes go through `PushService` (`apps/api/src/notifications/push.service.ts`), which respects quiet hours. Mock bank, no keys, no third-party calls. No email.
- Web: React 19, Tailwind v4, shadcn, TanStack Router. Mobile: Expo Router + NativeWind + `expo-notifications`.

## Goal and behaviour

1. A **month calendar** of expected bills and income (payday, rent, subscriptions…) with a **paid tick** when the matching transaction lands; late, missed and bounced states are visible.
2. A **list view** grouped by frequency, category or account, with monthly-equivalent totals.
3. **Add** a recurring item from a transaction or manually; **edit**, pause, end, **mark as not recurring**; link/unlink a payment by hand.
4. **Reminders** N days before each payment (push), configurable per item with a user default.

## Read first

- Prompt 10 output: `apps/api/src/recurring/*`, `packages/contracts/src/recurring.ts`, `packages/finance-core/src/recurring.ts`, api-client hooks.
- `apps/web/src/routes/_app/insights.tsx` (current recurring list), `components/app-shell.tsx`, `components/common.tsx`, `components/ui/{popover,sheet,dialog,tabs,select,switch,badge,toggle-group}.tsx`, `lib/grid.ts`.
- `apps/api/src/notifications/{push.service,notifications.controller,quiet-hours}.ts`, `packages/contracts/src/core.ts` (`pushPayload`), `apps/web/src/sw/sw.ts` (`notificationclick` routing), `apps/mobile/src/lib/notifications.ts` (`handleNotificationResponse`), `apps/mobile/app/_layout.tsx`.
- `apps/api/src/categorisation/categorisation.service.ts` (cron + `flush-notifications` pattern), `jobs.service.ts`.
- `apps/mobile/app/insights.tsx`, `(tabs)/more.tsx`.

## Data model

No new tables. One small migration adds `confirmedAt DateTime?` to `RecurringItem` (set when I press Keep on a detected suggestion, or automatically for MANUAL / FROM_TRANSACTION items). Add to the preference registry (prompt 01): `recurring.reminders` = `{ defaultDays: number|null, includeIncome: boolean, time: 'HH:mm' }`
(defaults `{2, false, '08:30'}`), `recurring.view` = `{ tab, groupBy }`. `RecurringOccurrence.remindedAt` already exists.

## API

- `GET /recurring/calendar?month=YYYY-MM` → `{month, days[{date, items[occurrence summaries]}], totals {expectedOut, paidOut, expectedIn, receivedIn, lateCount, missedCount}, firstWeekday: 1}` (Monday-first, Irish convention). Includes the days of the adjacent months shown in the grid.
- `GET /recurring/list?groupBy=frequency|category|account&status=` → groups with `monthlyEquivalent` totals, next due, last paid, and a status chip source field.
- Pushes: add `'reminder'` to `pushPayload.kind` in contracts; handle it in `apps/web/src/sw/sw.ts` (tag `reminder-<occurrenceId>`, click → `/recurring?month=…&item=<id>`) and `apps/mobile/src/lib/notifications.ts` (tap → recurring screen).
- Job `recurring-reminders` (add to `JobName`): cron every 30 minutes (`0 */30 * * * *`, Dublin) enqueues per user; the handler finds occurrences with `status UPCOMING|LATE`, `remindedAt IS NULL`, `dueDate − today ≤ N` where `N = item.reminderDays ?? prefs.defaultDays` (skip when null), flow OUT (or IN when `includeIncome`), not before `prefs.time`. One push per occurrence, **batched into a single digest push when more than 3 are due the same day**. Uses `PushService.send(…, {respectQuietHours: true})`; when `deferred` leave `remindedAt` null so the next run retries; on success set `remindedAt`. Copy examples:
  - "Netflix €12.99 is due tomorrow" · "Rent €1,100 is due in 2 days (Mon 1 Dec)" · "3 bills due this week: Three €18, Electric Ireland €78, VHI €74.50".
  - Late: "Aviva €62.10 was due 3 days ago and hasn't gone out yet" (once, via the `recurring_missed` insight from prompt 10, not a second push path).
  - Never include account numbers or the raw bank text.
- Reminder settings: `PATCH /recurring/items/:id` `reminderDays` (`null` = default, `0` = on the day, `-1` = off) and the preference endpoint.
- Contracts + hooks: `calendarResponse`, `recurringListResponse`, `useRecurringCalendar(month)`, `useRecurringList(groupBy)`.

## Web UI: `apps/web/src/routes/_app/recurring.tsx`

Nav "Recurring" (lucide `CalendarClock`) after Budgets; search params `{tab: 'calendar'|'list', month, groupBy, item}`.

- **Header:** month stepper (‹ Today ›), totals chips ("Due this month €1,942 · Paid €1,310 · In €3,150"), "Add recurring" button, Suggestions badge (detected items awaiting a glance).
- **Calendar tab:** 7-column grid (Mon–Sun), 5–6 rows. Each day cell shows up to 3 compact chips (icon by category or income arrow, name, amount) and "+N more" opening a Popover list. Chip states, each with **icon + text-level label**, not colour alone: ✓ Paid (green), Upcoming (neutral), Due today (marker), Late n days (amber), Missed (red), Skipped (muted strike). Income chips show ↓ and a positive amount. Today is outlined. Payday and rent get their own icons. Click a chip → **item drawer** (Sheet): name, amount (expected vs paid), cadence, next dates, matched transaction (link to the transactions page), history strip of the last 12 occurrences with states, actions: *Edit*, *Pause/Resume*, *Skip this one*, *Link a payment…* (searchable list of candidate transactions ±15 days), *Unlink*, *Not recurring*, reminder select (Default / On the day / 1, 2, 3, 7 days / Off), notes.
  Keyboard: grid is `role="grid"` with arrow-key navigation between days and Enter to open; live region announces month changes. On narrow screens the grid becomes an **agenda list** grouped by week.
- **List tab:** group selector (Frequency · Category · Account); each group has a header with the monthly-equivalent total; rows show name, cadence, expected amount, next due (relative), last paid, status chip, origin badge (Detected / Manual); inline Pause/Resume Switch; sortable by next due or amount.
- **Add/edit dialog** (react-hook-form + contracts schema): flow (Bill / Income), name, amount, cadence, due rule (day of month / last working day / every N days), first due date, category, account, matching (merchant autocomplete + optional text contains + amount band), reminder, notes. A live "Next 3 dates" preview from `expandSchedule`.
- **Entry points:** in the transaction drawer and row menu (prompt 05): "Make this recurring" (opens the dialog prefilled from the transaction: cadence guess from history if the merchant has ≥ 2 previous payments, else MONTHLY) and "Not recurring" when the merchant has a detected item.
- **Suggestions:** detected items with `origin DETECTED` created in the last 14 days and not yet confirmed show in a "New: {name} €x monthly" strip with Keep / Not recurring. Keep calls `PATCH /recurring/items/:id {confirmed: true}`, which sets `confirmedAt`; items with `origin DETECTED` and `confirmedAt IS NULL` created in the last 14 days are the "new" ones.
- **States:** skeleton grid; empty ("No recurring items yet. Sync your accounts or add one."); error with retry; paid ticks update after sync without a page reload (`invalidate` on sync).
- Insights page: replace the old recurring list with a small "Upcoming bills" list (next 7 days) linking to `/recurring`.

## Mobile (`apps/mobile`)

New **Recurring** screen (under More, and linked from the Home safe-to-spend card): week-grouped agenda for the next 30 days + a compact month strip with dots on days that have items; tap an item → sheet with status, paid transaction, skip/pause/not recurring and reminder choice. Add item form (simple). Notification tap routes here. Calendar grid view is web only.
Settings → Reminders: default days, include income, time (reuses the preference).

## Edge cases

- **Pending vs posted:** pending-matched occurrences show ✓ with a "pending" caption and may flip back on the next sync.
- **Refunds:** a refund from a bill merchant does not show a paid tick; the drawer shows the refund as related activity.
- **Transfers:** manual "move to savings" items are allowed; their ticks use transfer matching (descriptor-based).
- **Rent shares:** a manual "Roommate rent" income item is allowed; ✓ when the credit lands.
- **Multi-currency:** items on a GBP/USD account show the EUR expected amount with the native amount in muted text.
- **Payday periods:** payday is an income chip; the header optionally offers "Show by payday period" (list tab only) that groups items between paydays.
- **Weekends:** DD due on Saturday: chip sits on Saturday, tick appears when the Monday debit lands; no "late" until after grace.
- **Month with 5 weeks / leap February / DST weekend (29 Mar, 25 Oct 2026):** grid and dates correct (test with fixed dates).
- Reminder spam: no reminder for items paused/ended/skipped/already paid early; edits to an item's due date reset `remindedAt` on affected occurrences.
- Quiet hours (22:00–08:00): reminders deferred, then sent at the next run after 08:00; never in the middle of the night.
- Users with no push devices: nothing is sent and `remindedAt` stays null (so enabling push later does not flood: only send for occurrences due within the next N days at the time of sending).

## Acceptance criteria

1. `/recurring` shows the current month with ticks on bills already paid in the mock data, upcoming chips for later days, and the salary on payday.
2. "Make this recurring" on a Netflix payment creates (or links to) an item; the calendar shows next month's chip.
3. A bounced-and-re-presented DD shows Late/bounced, then ✓ with the "re-presented" note.
4. List view groups by Frequency, Category, Account with monthly totals that add up to the same total.
5. Setting reminder "2 days" for Rent and running the reminder job on 29 Nov sends one push "Rent €1,100 is due in 2 days"; running it again sends nothing; with quiet hours active it is deferred and then sent.
6. Mark "Not recurring" on a detected item: gone from calendar and list, still listed under a "Not recurring" filter chip where it can be restored.
7. Keyboard: arrow keys move between days, Enter opens, Esc closes; screen reader announces state words.
8. Narrow screen shows the agenda list; dark mode OK.

## Tests

- API: calendar endpoint shape for months starting on each weekday and for Feb; list grouping totals; reminder job (due-window selection, batching >3, deferral leaves `remindedAt` null, no re-send, skip paused/paid/early-paid, income opt-in, per-item override, `-1` off); pushPayload contract accepts `reminder`.
- finance-core: reuse tests for `expandSchedule`; add a helper test for calendar grid construction if it lives in finance-core (`calendarGrid(month, firstWeekday)`: Monday-first, 5/6 rows, leap Feb).
- Web: pure helper tests (grid, chip state mapping); document manual verification for the UI.

## Out of scope

Email reminders, calendar (ICS) export, standing-order checklist, bill pay (Finally never moves money), changing budgets or safe-to-spend (prompts 12/13), widgets (prompt 15).

## Finish

1. Explore the files above, post a short plan, then implement.
2. Run `pnpm install`, `pnpm --filter @finally/db db:generate` (if schema touched), `pnpm turbo run typecheck lint test build`; e2e if `DATABASE_URL` is reachable, else say so.
3. Report what changed, deferred items, acceptance results.
