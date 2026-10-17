/**
 * Components: the shared pieces in apps/web/src/components (app shell, panel, chips, tags, track). They compose the
 * same maker functions as the molecules and are imported as components so blocks and layouts can place instances.
 * The make* functions are shared with blocks.js, which does not need these components to have been imported.
 */

const deliverComponent = (title, desc, content, o) => place(wrapper('Components', title, desc, content, o));

// ── shared makers ───────────────────────────────────────────────────────────

const NAV = [
    ['house', 'Overview', 'overview'],
    ['list-ordered', 'Transactions', 'transactions'],
    ['inbox', 'To sort', 'sort'],
    ['chart-column', 'Budgets', 'budgets'],
    ['lightbulb', 'Insights', 'insights'],
    ['trending-up', 'Investments', 'investments'],
    ['target', 'Goals', 'goals'],
    ['calculator', 'Tools', 'tools'],
    ['settings', 'Settings', 'settings'],
];

const money = (text, o = {}) => T(text, { weight: 600, size: 14, c: 'foreground', name: 'amount', ...o });

/** The eyebrow-sized caps label used for panel titles and the sidebar's Accounts heading. */
const caps = (text, o = {}) => T(String(text).toUpperCase(), { s: 'section-label', c: 'ink-3', ...o });

function makeNavItem(icon, label, active, badge) {
    return F({ name: label, dir: 'H', gap: 10, pad: [9, 10], align: 'center', fill: active ? 'brand-soft' : undefined, radius: 8, fillW: true }, [
        I(icon, 18, active ? 'brand' : 'ink-2'),
        T(label, { weight: active ? 600 : 500, c: active ? 'brand' : 'ink-2', name: 'label', fillW: !!badge }),
        badge ? F({ name: 'badge', dir: 'H', pad: [2, 7], fill: 'marker', radius: 'full' }, [T(String(badge), { size: 11, weight: 700, lh: 14, c: 'marker-ink' })]) : null,
    ]);
}

function makePill(icon, label) {
    return F({ name: label, dir: 'H', gap: 6, pad: [6, 12], align: 'center', fill: 'surface', stroke: 'rule', radius: 'full' }, [I(icon, 16, 'ink-2'), T(label, { size: 13, weight: 600, lh: 18, c: 'ink-2' })]);
}

function makeSidebar({ page, kind }) {
    const accounts = [['AIB Current', '€2,418.60'], ['Revolut', '€640.12'], ['AIB Saver', '€9,300.00']];
    return F({ kind, name: 'AppSidebar', w: 228, gap: 16, pad: [18, 12], fill: 'surface', stroke: 'rule', sides: 'r' }, [
        F({ name: 'brand', dir: 'H', gap: 10, pad: [0, 6], align: 'center', fillW: true }, [Logo(26), T('Finally', { s: 'h4' })]),
        F({ name: 'nav', gap: 2, fillW: true }, NAV.map(([icon, label, key]) => makeNavItem(icon, label, key === page, key === 'sort' ? 3 : 0))),
        F({ name: 'accounts', gap: 8, pad: [14, 6, 0, 6], fillW: true, stroke: 'rule', sides: 't' }, [
            caps('Accounts'),
            ...accounts.map(([name, amount]) => F({ name, dir: 'H', justify: 'between', gap: 8, fillW: true }, [T(name, { size: 12.5, c: 'ink-2', name: 'name' }), money(amount, { size: 12.5 })])),
            F({ name: 'actions', dir: 'H', gap: 6, pad: [8, 0, 0, 0] }, [makePill('refresh-cw', 'Sync'), makePill('sun-moon', 'Auto')]),
        ]),
    ]);
}

function makePanel({ title, action, body, w = 360, kind, name, fillW }) {
    return F({ kind, name: name ?? 'Panel', w: fillW ? undefined : w, fillW, pad: [18, 20], fill: 'surface', stroke: 'hair', radius: 'card' }, [
        F({ name: 'PanelTitle', dir: 'H', justify: 'between', align: 'center', gap: 8, pad: [0, 0, 12, 0], fillW: true }, [
            caps(title, { name: 'title' }),
            action ? T(action, { size: 12.5, weight: 600, lh: 16, c: 'brand', name: 'action' }) : null,
        ]),
        ...body,
    ]);
}

const CHIP = {
    groceries: ['Groceries', 'c-groceries'],
    'eating-out': ['Eating out', 'c-eating-out'],
    transport: ['Transport', 'c-transport'],
    bills: ['Bills', 'c-bills'],
    subscriptions: ['Subscriptions', 'c-subscriptions'],
    income: ['Income', 'c-groceries'],
};

function makeChip({ slug, kind }) {
    if (slug === 'to-sort') {
        return F({ kind, name: 'CategoryChip', dir: 'H', pad: [3, 9], align: 'center', fill: 'marker', radius: 'full' }, [T('To sort', { size: 12, weight: 700, lh: 16, c: 'marker-ink', name: 'label' })]);
    }
    const [label, colour] = CHIP[slug] ?? [slug, 'c-other'];
    return F({ kind, name: 'CategoryChip', dir: 'H', gap: 6, pad: [3, 9, 3, 7], align: 'center', fill: 'raised', stroke: 'rule', radius: 'full' }, [
        Dot(8, colour, { name: 'dot' }),
        T(label, { size: 12, weight: 500, lh: 16, c: 'foreground', name: 'label' }),
    ]);
}

const SEVERITY = { ACT: ['Act', 'bad-soft', 'bad'], WATCH: ['Watch', 'warn-soft', 'warn'], INFO: ['Info', 'brand-soft', 'brand'], YOU: ['You', 'marker', 'marker-ink'] };

function makeSeverity({ severity, kind }) {
    const [label, fill, text] = SEVERITY[severity];
    return F({ kind, name: 'SeverityTag', dir: 'H', pad: [3, 7], align: 'center', fill, radius: 4 }, [T(label.toUpperCase(), { size: 10.5, weight: 700, lh: 14, ls: 6, c: text, name: 'label' })]);
}

/** Progress track with an optional tick for where an even pace would put you today. */
function makeTrack({ value, tick, colour = 'brand', w = 240, h = 12, kind }) {
    return F({ kind, name: 'Track', abs: true, w, h, fill: 'raised', stroke: 'rule', radius: 'full' }, [
        Rect({ name: 'bar', w: Math.max(Math.round((w * value) / 100), 2), h: h - 2, x: 0, y: 0, fill: colour, radius: 'full' }),
        tick != null ? Rect({ name: 'pace tick', w: 2, h: h + 10, x: Math.round((w * tick) / 100), y: -5, fill: 'ink', opacity: 0.7 }) : null,
    ]);
}

// ── builders ────────────────────────────────────────────────────────────────

reg('components/logo', async () => {
    const set = await variantSet('components/logo', 'Logo', [{ name: 'size', values: ['sm', 'default', 'lg'] }], (c) =>
        F({ kind: 'component', name: 'Logo', dir: 'H' }, [Logo({ sm: 24, default: 26, lg: 40 }[c.size])]),
    );
    deliverComponent('Logo', 'components/app-shell.tsx and routes/login.tsx · brand tile with the coin mark', [set]);
});

reg('components/app-sidebar', async () => {
    const set = await variantSet('components/app-sidebar', 'App sidebar', [{ name: 'page', values: NAV.map(([, , key]) => key) }], (c) => makeSidebar({ page: c.page, kind: 'component' }));
    deliverComponent('App sidebar', 'components/app-shell.tsx · logo, nine sections, the To sort count, accounts, Sync and theme', [set]);
});

reg('components/panel', async () => {
    const c = makePanel({ kind: 'component', title: 'Flexible spend this month', action: 'Budgets', body: [T('Panel content goes here.', { c: 'ink-2', fillW: true, name: 'content' })] });
    masterize('components/panel', c);
    deliverComponent('Panel', 'components/common.tsx · Panel and PanelTitle, 10px radius with a hairline border', [c]);
});

reg('components/page-header', async () => {
    const c = F({ kind: 'component', name: 'PageHeader', gap: 4, w: 640 }, [
        caps('Thursday 15 October', { name: 'eyebrow' }),
        T('Overview', { s: 'h1', name: 'title' }),
        T('Everything that moved since your last sync, in one place.', { c: 'ink-2', fillW: true, name: 'lead' }),
    ]);
    masterize('components/page-header', c);
    deliverComponent('Page header', 'components/common.tsx · eyebrow, display title and lead', [c]);
});

reg('components/category-chip', async () => {
    const set = await variantSet('components/category-chip', 'Category chip', [{ name: 'category', values: ['groceries', 'eating-out', 'transport', 'bills', 'subscriptions', 'to-sort'] }], (c) =>
        makeChip({ slug: c.category, kind: 'component' }),
    );
    deliverComponent('Category chip', 'components/common.tsx · a category with its colour dot; the marker chip is for unsorted payments only', [set]);
});

reg('components/severity-tag', async () => {
    const set = await variantSet('components/severity-tag', 'Severity tag', [{ name: 'severity', values: ['ACT', 'WATCH', 'INFO', 'YOU'] }], (c) => makeSeverity({ severity: c.severity, kind: 'component' }));
    deliverComponent('Severity tag', 'components/common.tsx · SeverityTag', [set]);
});

reg('components/track', async () => {
    const set = await variantSet('components/track', 'Track', [{ name: 'value', values: ['25', '60', '100'] }], (c) => makeTrack({ value: Number(c.value), tick: 50, kind: 'component' }));
    deliverComponent('Track', 'components/common.tsx · progress track; the tick is where an even pace would put you today', [set]);
});
