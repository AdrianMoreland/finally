/**
 * What the plugin panel lists. Each entry points at the source it was drawn from (paths from the repo root),
 * so build.mjs can flag an entry whose source file has gone and list files that have no entry yet.
 *
 *   id        group/name; the matching builder is registered in src/<group>.js with reg('<id>', ...)
 *   covers    source files this entry is drawn from (checked to exist at build time)
 *   needs     other entries it is built on (they are created first when missing)
 */
const UI = 'apps/web/src/components/ui';
const WEB = 'apps/web/src';
const ROUTES = 'apps/web/src/routes';
const TOKENS = 'packages/tokens/src/index.ts';
const CHARTS = `${WEB}/components/charts/charts.tsx`;
const SHELL = `${WEB}/components/app-shell.tsx`;
const COMMON = `${WEB}/components/common.tsx`;
const HOME = `${ROUTES}/_app/index.tsx`;

export const GROUPS = [
    { key: 'variables', label: 'Variables', blurb: 'Colour, type, radius and spacing from packages/tokens. Variables and text styles are always kept up to date; the ticks choose which reference frames are drawn.' },
    { key: 'components', label: 'Components', blurb: 'Shared pieces: app sidebar, panel, page header, category chip, severity tag, progress track.' },
    { key: 'blocks', label: 'Blocks', blurb: 'Feature compositions with placeholder data: overview panels, sort card, budget row, sign-in form.' },
    { key: 'layouts', label: 'Layouts', blurb: 'Whole pages assembled from instances of the components and blocks (built first when missing).' },
];

export const CATALOGUE = [
    // ── Variables ────────────────────────────────────────────────────────────
    { id: 'variables/colors', group: 'variables', label: 'Colors', desc: 'Primitives, light and dark roles, categories', covers: [TOKENS] },
    { id: 'variables/typography', group: 'variables', label: 'Typography', desc: 'Text styles and specimens', covers: [TOKENS, `${WEB}/index.css`] },
    { id: 'variables/radius', group: 'variables', label: 'Radius', desc: 'Control, card and chip radii', covers: [TOKENS] },
    { id: 'variables/spacing', group: 'variables', label: 'Spacing', desc: '4-point spacing scale', covers: [TOKENS] },


    // ── Components ───────────────────────────────────────────────────────────
    { id: 'components/logo', group: 'components', label: 'Logo', desc: 'Brand tile, 3 sizes', covers: [SHELL, `${ROUTES}/login.tsx`] },
    { id: 'components/app-sidebar', group: 'components', label: 'App sidebar', desc: 'nine sections, accounts, sync and theme', covers: [SHELL], needs: ['components/logo'] },
    { id: 'components/panel', group: 'components', label: 'Panel', desc: 'titled surface with an action', covers: [COMMON] },
    { id: 'components/page-header', group: 'components', label: 'Page header', desc: 'eyebrow, title, lead', covers: [COMMON] },
    { id: 'components/category-chip', group: 'components', label: 'Category chip', desc: 'six categories and the marker chip', covers: [COMMON] },
    { id: 'components/severity-tag', group: 'components', label: 'Severity tag', desc: 'Act, Watch, Info, You', covers: [COMMON] },
    { id: 'components/track', group: 'components', label: 'Track', desc: 'progress with an even-pace tick', covers: [COMMON] },

    // ── Blocks ───────────────────────────────────────────────────────────────
    { id: 'blocks/net-worth', group: 'blocks', label: 'Net worth', desc: 'figure, 12-month change, area chart', covers: [HOME, CHARTS, `${UI}/chart.tsx`] },
    { id: 'blocks/safe-to-spend', group: 'blocks', label: 'Safe to spend', desc: 'per-day figure', covers: [HOME] },
    { id: 'blocks/flexible-spend', group: 'blocks', label: 'Flexible spend', desc: 'under and ahead of pace', covers: [HOME] },
    { id: 'blocks/spend-breakdown', group: 'blocks', label: 'Spend breakdown', desc: 'donut and category legend', covers: [HOME, CHARTS, `${UI}/chart.tsx`] },
    { id: 'blocks/insight-list', group: 'blocks', label: 'Insight list', desc: 'severity tag, title, body', covers: [`${WEB}/components/insight-list.tsx`] },
    { id: 'blocks/recent-payments', group: 'blocks', label: 'Recent payments', desc: 'date, merchant, chip, amount', covers: [HOME, `${ROUTES}/_app/transactions.tsx`] },
    { id: 'blocks/to-sort-banner', group: 'blocks', label: 'To sort banner', desc: 'marker count and link', covers: [HOME] },
    { id: 'blocks/sort-card', group: 'blocks', label: 'Sort card', desc: 'suggestions, all categories, just this once', covers: [`${ROUTES}/_app/sort.tsx`] },
    { id: 'blocks/budget-row', group: 'blocks', label: 'Budget row', desc: 'on pace, spare, fixed', covers: [`${ROUTES}/_app/budgets.tsx`] },
    { id: 'blocks/sign-in-form', group: 'blocks', label: 'Sign-in form', desc: 'default, error, link sent', covers: [`${ROUTES}/login.tsx`] },

    // ── Layouts ──────────────────────────────────────────────────────────────
    { id: 'layouts/sign-in', group: 'layouts', label: 'Sign-in page', desc: '/login', covers: [`${ROUTES}/login.tsx`], needs: ['components/logo', 'blocks/sign-in-form'] },
    { id: 'layouts/overview', group: 'layouts', label: 'Overview', desc: '/ with the sidebar', covers: [HOME], needs: ['components/app-sidebar', 'components/page-header', 'blocks/to-sort-banner', 'blocks/net-worth', 'blocks/safe-to-spend', 'blocks/flexible-spend', 'blocks/spend-breakdown', 'blocks/insight-list', 'blocks/recent-payments'] },
    { id: 'layouts/to-sort', group: 'layouts', label: 'To sort', desc: '/sort', covers: [`${ROUTES}/_app/sort.tsx`], needs: ['components/app-sidebar', 'blocks/sort-card'] },
    { id: 'layouts/budgets', group: 'layouts', label: 'Budgets', desc: '/budgets', covers: [`${ROUTES}/_app/budgets.tsx`], needs: ['components/app-sidebar', 'blocks/budget-row'] },
];
