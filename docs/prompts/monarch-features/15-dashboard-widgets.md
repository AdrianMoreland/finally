# 15 · Customisable dashboard: add, hide and reorder widgets, saved per user, web and mobile

You are working in the Finally repo (personal finance, Ireland, EUR, AIB + Revolut read-only). Prerequisites: `01-foundations.md` (`UserPreference`).
Best after `07` (saved reports), `11` (upcoming bills), `13` (flex/budgets), `14` (recap card) so there are widgets worth arranging; the registry works with whatever exists.

## Ground rules (this repo)

- pnpm 10 + Turborepo. Read `docs/ENGINEERING.md`, `PLAN.md`, `docs/prompts/monarch-features/00-plan.md`. Full check: `pnpm turbo run typecheck lint test build`; `pnpm --filter @finally/finance-core test`; `pnpm --filter api test`; `pnpm --filter api test:e2e` (needs `DATABASE_URL`).
- Zod 4 schemas in `packages/contracts/src`; `packages/api-client` parses with the same schemas. Pure logic in `packages/finance-core` or `packages/contracts` (the default layout and the merge function are pure and tested). Money = decimal strings.
- Prisma migrations; new tables get RLS + REVOKE and join `exportJson`/`deleteAllData`. This prompt needs **no new table**: it uses `UserPreference`.
- Mock bank, no keys, no third-party calls. No drag-and-drop library is mandatory.
- Web: React 19, Tailwind v4, shadcn, TanStack Query/Router. Mobile: Expo Router + NativeWind; avoid new native dependencies (no gesture-heavy drag lib).

## Goal and behaviour

The Overview page becomes a set of **widgets**. I can click **Customise**, then:

- **hide** a widget, **add** a hidden one back (from a gallery with a small description), **reorder** widgets,
- pick a **size** per widget on web (Small, Medium, Large), and
- **reset** to the default layout.

The layout is **saved per user** and applies on **web and mobile** (same order and visibility; sizes apply to web only; on a phone everything is one column). New widgets that ship later appear for existing users without wiping their layout.

## Read first

- `apps/web/src/routes/_app/index.tsx` (today's fixed layout and its cards), `lib/grid.ts` (`GRID`, `SPAN`), `components/common.tsx` (`Panel`, `PanelTitle`, `ErrorNote`, `LoadingBlock`, `EmptyState`), `components/charts/charts.tsx`, `components/insight-list.tsx`.
- `apps/api/src/overview/overview.service.ts` and `packages/contracts/src/money.ts#overviewSchema` (one payload feeds the whole page today).
- `apps/mobile/app/(tabs)/index.tsx`, `apps/mobile/src/components/{screen,payments}.tsx`, `ui/primitives.tsx`.
- Prompt 01's preference registry (`packages/contracts/src/core.ts`, `usePreference`/`useSetPreference`), prompt 14 `RecapCard`, prompt 07 `SavedReport.pinned`, prompt 11 recurring list, prompt 13 budgets/flex, prompt 09 goals, prompt 08 net worth.

## Design

### Widget registry (shared: `packages/contracts/src/dashboard.ts`)

```ts
export const WIDGETS = {
  'net-worth':        { title: 'Net worth',           sizes: ['M','L'], default: { visible: true,  size: 'L' }, platforms: ['web','mobile'] },
  'safe-to-spend':    { title: 'Safe to spend today', sizes: ['S','M'], default: { visible: true,  size: 'S' } },
  'flexible-spend':   { title: 'Flexible spend',      ... },
  'flex-number':      { title: 'Your flex number',    ..., default: { visible: false } },
  'where-it-went':    ..., 'spend-by-day': ..., 'latest-insights': ..., 'recent-payments': ...,
  'weekly-recap':     ..., 'upcoming-bills': ..., 'goals': ..., 'to-sort': ..., 'pots': ...,
  // dynamic: `report:<savedReportId>` — a pinned saved report rendered as a small chart + total
} as const;
```
The block above is illustrative: write out every entry in full (the `...` placeholders are not code). Each entry has: id, title, description (shown in the gallery), allowed sizes, default visibility/size/order, `requires?: 'recurring'|'budgets'|…` (hidden from the gallery if the feature isn't available).
`dashboardLayout = { version: 1, items: [{ id, visible, size?, }] }` — array order **is** the order. Stored in `UserPreference('dashboard.layout')` (add to the registry). A max of 24 items.
`resolveLayout(stored | null, registry, availableReportIds)` (pure, tested): drops unknown ids, appends registry widgets missing from the stored layout using their default visibility (so shipping a new widget shows up once, in its default slot), validates sizes against allowed sizes, adds `report:<id>` entries for pinned saved reports that are missing and removes ones whose report was deleted, never throws on garbage input.
`defaultLayout()` reproduces today's Overview exactly: net worth, safe to spend, flexible spend, where it went, spend by day, latest insights, recent payments (spans as today: 5/3/4/5/7/5/7), with new widgets hidden by default except `weekly-recap` and `upcoming-bills` (visible if their features exist).

### Data loading

Keep `/overview` for the existing seven widgets (one request). New widgets fetch their own data with their own hooks (`useLatestRecap`, `useRecurringCalendar`, `useGoals`, `useBudgets`, `useReportSummary`…), and **only when visible** (`enabled: visible`). Each widget is wrapped in `WidgetFrame` which gives it: its own `Suspense`/loading skeleton, an error boundary with a compact `ErrorNote` + retry, and an empty state. **One failing widget never blanks the page.**
Split the Overview card JSX out of `routes/_app/index.tsx` into `apps/web/src/components/widgets/*.tsx` (one file per widget, props = data it needs) without changing how they look.

## API

No new endpoints beyond the preference ones. Add `GET /dashboard/layout` and `PUT /dashboard/layout` as thin wrappers over the preference (so the server validates with `dashboardLayout` and returns the **resolved** layout, including the list of `availableWidgets` with their metadata). PUT is last-write-wins with `updatedAt` returned; the client sends `If-Unmodified-Since`-style `baseUpdatedAt` and the server returns 409 with the current layout when stale (the client merges: the user's latest edit wins for the items they touched).
Contracts: `dashboardLayout`, `dashboardLayoutResponse`; hooks `useDashboardLayout`, `useSaveDashboardLayout` (optimistic update with rollback and a toast on failure).

## Web UI

- `routes/_app/index.tsx` renders the resolved layout: iterate items, skip hidden, render `WidgetFrame` + widget with `SPAN` classes from the size map (S = 3 cols at xl, M = 4–5, L = 7; map in `lib/grid.ts`; below `md` all are full width).
- **Customise** button in the page header toggles **edit mode**:
  - Each widget shows a toolbar: drag handle (optional `@dnd-kit/sortable` enhancement), **Move up / Move down** buttons (required, keyboard accessible), size ToggleGroup (only allowed sizes), **Hide**.
  - A bottom/side bar: **Add widget** (opens a Sheet gallery: title, description, a static preview thumbnail or icon, "Add"), **Reset to default** (confirm Dialog), **Done**.
  - Changes are held locally while editing and saved once on **Done**; **Cancel** (and Esc) reverts to the layout at the start of the session. A "Saved" toast confirms.
  - `aria-live="polite"` announcements: "Net worth moved to position 2", "Goals added".
  - In edit mode data loading continues, but widgets render a **placeholder of their real size** if their data isn't ready, so the layout does not jump.
- Pinned saved reports: a widget `report:<id>` shows the report title, total and a small bar/area using the report summary endpoint; clicking opens `/reports?saved=<id>`. A "Pin to dashboard" toggle in the Reports page (prompt 07) writes `SavedReport.pinned`.
- Empty layout (everything hidden): show an `EmptyState` "Nothing on your dashboard. Add a widget." with the Add button.

## Mobile

- Home screen (`(tabs)/index.tsx`) renders the same ordered, visible widgets as stacked `Card`s, each with its own loading/error state. A "Customise" button opens a screen (modal route) with the list: switch to show/hide, **up/down arrow buttons** to reorder (no drag library), "Add widget" list for hidden ones, "Reset". Sizes are ignored.
- Widgets not implemented on mobile yet (e.g. a report widget needing charts) render a compact summary card (title + big number) so the layout stays valid. Use `LoadingCard`/`ErrorCard` from `src/components/screen.tsx`.
- Layout loads with the other Home data; cache it (`react-query`) so the Home screen renders instantly offline with the last layout.

## Edge cases

- **Pending vs posted / refunds / transfers / rent shares / multi-currency:** widgets show the same numbers the underlying screens show (they reuse the same endpoints); do not re-implement any maths in widgets. Net worth and safe-to-spend remain in EUR (prompts 02 and 08).
- **Payday periods:** safe to spend and upcoming bills already speak in payday terms; do not add new payday logic.
- First load before the layout arrives: render the **default layout** immediately (no flash), then swap if different; never show a blank page.
- A widget removed in a later release: stored id unknown ⇒ dropped silently by `resolveLayout`.
- Feature not available (no recurring items, no budgets): widget hidden from the gallery; if already in the layout it renders an empty state with a link to set it up.
- Two devices editing: 409 handling above; the second device sees the merged result next fetch.
- Very small screens (320 px): widgets don't overflow; the customise toolbar wraps.
- Reduced motion: no animations on reorder.
- Large `report:<id>` count: max 24 items; the gallery disables Add with a message.
- Accessibility: every control has an accessible name; edit mode is fully operable by keyboard; hidden widgets are not in the tab order.

## Acceptance criteria

1. Fresh user: the dashboard looks like today's Overview (same cards, same order).
2. Customise → hide "Spend by day", add "Weekly recap" and "Upcoming bills", move "Goals" to the top, resize "Net worth" to Medium → Done → reload: layout persists. Open the mobile app: same order and visibility.
3. Reset to default restores today's layout.
4. A new widget added to the registry in code appears (hidden or visible per its default) for an existing user with a saved layout, without altering their other choices.
5. Making `/recaps/latest` fail (stop the endpoint) shows an error card in that widget only.
6. Pin a saved report from Reports → it appears as a widget; delete the saved report → the widget disappears after reload.
7. Keyboard-only: reach Customise, move a widget with the buttons, change size, hide, add, done.
8. Dark mode and 375 px width OK.

## Tests

- contracts/finance-core: `resolveLayout` (null, valid, unknown ids, missing new widgets, invalid sizes, duplicates, > 24 items, deleted report ids, garbage JSON), `defaultLayout` equals the documented order, registry sanity (every widget has a title/description/allowed size that includes its default size).
- API: layout GET/PUT validation, 409 on stale base, ownership scoping, "available widgets" list respects feature flags.
- Web: unit-test pure helpers (size → class map, move up/down array helpers). If Testing Library is available add a render test for edit-mode keyboard moves; otherwise describe the manual check.

## Out of scope

Per-device different layouts, widget-level settings (e.g. choose the account for a widget), multi-page dashboards, sharing a layout with a partner, drag-and-drop on mobile, new chart types.

## Finish

1. Explore the files above, post a short plan, then implement.
2. Run `pnpm install`, `pnpm turbo run typecheck lint test build`; e2e if `DATABASE_URL` is reachable, else say so.
3. Report what changed, deferred items, acceptance results.
