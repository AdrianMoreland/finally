/**
 * Blocks: the feature compositions in apps/web/src/routes, drawn with placeholder data (one month of payments,
 * three accounts, a handful of insights). Each is a Figma component so the layouts can place instances of it.
 */

const deliverBlock = (title, desc, content, o) => place(wrapper('Blocks', title, desc, content, o));

const big = (text, o = {}) => T(text, { s: 'big', name: 'value', ...o });
const sub = (text, o = {}) => T(text, { size: 13, lh: 18, c: 'ink-2', fillW: true, ...o });
const body = (kids) => kids.filter(Boolean);

// ── overview panels ─────────────────────────────────────────────────────────

reg('blocks/net-worth', async () => {
    const w = 400;
    const h = 96;
    const line = 'M0 78 C40 74 60 60 100 62 C140 64 160 40 200 44 C240 48 260 30 300 24 C340 18 360 14 400 8';
    const c = makePanel({
        kind: 'component',
        name: 'NetWorthPanel',
        title: 'Net worth',
        w: w + 36,
        body: body([
            F({ name: 'figure', dir: 'H', justify: 'between', align: 'end', fillW: true }, [big('€48,215.30'), T('+€3,120 in 12 months', { size: 12.5, weight: 600, lh: 16, c: 'good', name: 'change' })]),
            F({ name: 'chart', abs: true, w, h, fillW: false }, [
                Path(`${line} L400 ${h} L0 ${h} Z`, { name: 'area', fill: { mix: ['brand', 14, 'surface'] }, x: 0, y: 0 }),
                Path(line, { name: 'line', stroke: 'brand', sw: 2, x: 0, y: 0 }),
            ]),
        ]),
    });
    masterize('blocks/net-worth', c);
    deliverBlock('Net worth', 'routes/_app/index.tsx · Panel, Big, NetWorthChart', [c]);
});

reg('blocks/safe-to-spend', async () => {
    const c = makePanel({
        kind: 'component',
        name: 'SafeToSpendPanel',
        title: 'Safe to spend today',
        w: 300,
        body: body([big('€42.10'), sub('€463.10 left for the 11 days to payday (26 Oct), after €214.00 of bills still to come.')]),
    });
    masterize('blocks/safe-to-spend', c);
    deliverBlock('Safe to spend', 'routes/_app/index.tsx · per-day figure with the bills still to come', [c]);
});

reg('blocks/flexible-spend', async () => {
    const set = await variantSet('blocks/flexible-spend', 'Flexible spend', [{ name: 'pace', values: ['under', 'ahead'] }], (c) => {
        const ahead = c.pace === 'ahead';
        return makePanel({
            kind: 'component',
            name: 'FlexibleSpendPanel',
            title: 'Flexible spend this month',
            action: 'Budgets',
            w: 380,
            body: body([
                F({ name: 'figure', dir: 'H', gap: 6, align: 'end' }, [big(ahead ? '€812.40' : '€604.20'), T('of €1,000', { size: 14, weight: 500, c: 'ink-2' })]),
                F({ name: 'track', pad: [14, 0], fillW: true }, [makeTrack({ value: ahead ? 81 : 60, tick: 48, w: 344, h: 10 })]),
                F({ name: 'stats', dir: 'H', justify: 'between', fillW: true }, [T(ahead ? '81% used' : '60% used', { size: 12, lh: 16, c: 'ink-2' }), T('day 15 of 31 · 48% of the month', { size: 12, lh: 16, c: 'ink-2' })]),
                sub(ahead ? 'Ahead of pace by €315.60' : 'Under pace by €109.80', { c: ahead ? 'warn' : 'good', weight: 600 }),
            ]),
        });
    });
    deliverBlock('Flexible spend', 'routes/_app/index.tsx · budget used against an even pace', [set]);
});

const SHARES = [['c-groceries', 34], ['c-eating-out', 19], ['c-transport', 13], ['c-subscriptions', 7], ['c-shopping', 6], ['c-other', 21]];

/** Ring segments for the donut: one ellipse per share, drawn with arcData so each takes a bound colour. */
function donutArcs(size) {
    let from = -Math.PI / 2;
    return SHARES.map(([colour, pct]) => {
        const to = from + (pct / 100) * 2 * Math.PI;
        const arc = Dot(size, colour, { name: colour, x: 0, y: 0 });
        arc.arcData = { startingAngle: from, endingAngle: to - 0.02, innerRadius: 0.72 };
        from = to;
        return arc;
    });
}

const SPEND = [
    ['Groceries', 'c-groceries', '€312.40', '34%'],
    ['Eating out', 'c-eating-out', '€178.20', '19%'],
    ['Transport', 'c-transport', '€121.50', '13%'],
    ['Subscriptions', 'c-subscriptions', '€64.97', '7%'],
    ['Shopping', 'c-shopping', '€58.00', '6%'],
];

reg('blocks/spend-breakdown', async () => {
    const c = makePanel({
        kind: 'component',
        name: 'SpendBreakdownPanel',
        title: 'Where it went this month',
        w: 460,
        body: body([
            F({ name: 'content', dir: 'H', gap: 18, align: 'center', fillW: true }, [
                F({ name: 'donut', abs: true, w: 130, h: 130 }, [
                    ...donutArcs(130),
                    T('€933', { s: 'h4', name: 'centre', x: 40, y: 46 }),
                ]),
                F({ name: 'legend', gap: 7, fillW: true }, SPEND.map(([name, colour, amount, share]) =>
                    F({ name, dir: 'H', gap: 10, align: 'center', fillW: true }, [
                        Rect({ name: 'swatch', w: 10, h: 10, fill: colour, radius: 3 }),
                        T(name, { size: 13, lh: 18, fillW: true }),
                        money(amount, { size: 13, lh: 18 }),
                        T(share, { size: 13, lh: 18, c: 'ink-3', w: 40, align: 'RIGHT' }),
                    ]),
                )),
            ]),
        ]),
    });
    masterize('blocks/spend-breakdown', c);
    deliverBlock('Spend breakdown', 'routes/_app/index.tsx · SpendDonut and the category legend', [c]);
});

const INSIGHTS = [
    ['YOU', '3 merchants need a category', 'Answer once per merchant and every past and future payment follows.'],
    ['ACT', 'Eating out is 40% over its usual month', 'You are at €178 with 16 days to go; the three-month average is €127.'],
    ['WATCH', 'Netflix went up by €2.00', 'The next charge on 3 Nov will be €15.99.'],
    ['INFO', 'You spent €87 less on transport than in September', 'Mostly fewer taxis and a cheaper Leap card top-up.'],
];

reg('blocks/insight-list', async () => {
    const rows = INSIGHTS.map(([severity, title, text], i) =>
        F({ name: title, dir: 'H', gap: 12, align: 'start', pad: i === 0 ? [0, 0, 12, 0] : [12, 0], stroke: i === 0 ? undefined : 'rule', sides: 't', fillW: true }, [
            makeSeverity({ severity }),
            F({ name: 'text', gap: 4, fillW: true }, [T(title, { weight: 600, lh: 19, fillW: true, name: 'title' }), sub(text, { size: 13, name: 'body' })]),
        ]),
    );
    const c = makePanel({ kind: 'component', name: 'InsightListPanel', title: 'Latest insights', action: 'All insights', w: 460, body: rows });
    masterize('blocks/insight-list', c);
    deliverBlock('Insight list', 'components/insight-list.tsx · severity tag, title and body per row', [c]);
});

const PAYMENTS = [
    ['12 Oct', 'Tesco', 'TESCO STORES 3412 DUBLIN', 'groceries', '-€86.40'],
    ['11 Oct', 'Luas', 'LUAS TICKET MACHINE', 'transport', '-€2.50'],
    ['11 Oct', 'Bewley’s Café', 'SUMUP *BEWLEYS GRAFTON', 'to-sort', '-€6.80'],
    ['10 Oct', 'Salary', 'IE PAYROLL ACME LTD', 'groceries', '+€3,150.00'],
];

reg('blocks/recent-payments', async () => {
    const rows = PAYMENTS.map(([date, name, raw, slug, amount], i) => {
        const unsorted = slug === 'to-sort';
        const income = amount.startsWith('+');
        const chip = income ? makeChip({ slug: 'income' }) : makeChip({ slug });
        return F({ name, dir: 'H', gap: 12, pad: [8, 6], align: 'center', fill: unsorted ? { mix: ['marker', 14, 'surface'] } : undefined, stroke: i ? 'rule' : undefined, sides: 't', fillW: true }, [
            T(date, { size: 13.5, lh: 19, c: 'ink-2', w: 52, name: 'date' }),
            F({ name: 'merchant', gap: 1, fillW: true }, [T(name, { weight: 600, size: 13.5, lh: 19, name: 'merchant' }), T(raw, { s: 'mono', c: 'ink-3', name: 'descriptor' })]),
            chip,
            T(amount, { weight: 600, size: 13.5, lh: 19, c: income ? 'good' : 'foreground', w: 84, align: 'RIGHT', name: 'amount' }),
        ]);
    });
    const c = makePanel({ kind: 'component', name: 'RecentPaymentsPanel', title: 'Recent payments', action: 'All payments', w: 620, body: rows });
    masterize('blocks/recent-payments', c);
    deliverBlock('Recent payments', 'routes/_app/index.tsx and transactions.tsx · date, merchant over raw descriptor, category chip, amount', [c]);
});

reg('blocks/to-sort-banner', async () => {
    const c = F({ kind: 'component', name: 'ToSortBanner', dir: 'H', gap: 12, pad: [12, 16], w: 760, align: 'center', fill: 'surface', stroke: 'rule', radius: 'card' }, [
        F({ name: 'marker', dir: 'H', pad: [1, 6], fill: 'marker', radius: 3 }, [T('3 merchants', { weight: 700, c: 'marker-ink' })]),
        T('need a category. Each answer sorts every payment from that merchant.', { fillW: true }),
        T('Sort them →', { weight: 600, c: 'brand' }),
    ]);
    masterize('blocks/to-sort-banner', c);
    deliverBlock('To sort banner', 'routes/_app/index.tsx · the only place the marker colour is used on the overview', [c]);
});

// ── to sort ─────────────────────────────────────────────────────────────────

reg('blocks/sort-card', async () => {
    const set = await variantSet('blocks/sort-card', 'Sort card', [{ name: 'scope', values: ['merchant', 'once'] }], (c) => {
        const once = c.scope === 'once';
        const suggestion = (label, colour) =>
            F({ name: label, dir: 'H', gap: 7, pad: [7, 12], align: 'center', fill: 'raised', stroke: 'rule', radius: 'full' }, [Dot(8, colour, { name: 'dot' }), T(label, { size: 13, weight: 600, lh: 18 })]);
        return F({ kind: 'component', name: 'SortCard', w: 340, gap: 12, pad: 16, fill: 'surface', stroke: 'rule', radius: 'card' }, [
            F({ name: 'head', dir: 'H', justify: 'between', align: 'start', gap: 12, fillW: true }, [
                F({ name: 'who', gap: 6, fillW: true }, [
                    T('Bewley’s Café', { size: 16, weight: 600, lh: 22, name: 'name' }),
                    F({ name: 'raw', dir: 'H', pad: [2, 6], fill: { mix: ['marker', 55, 'surface'] }, radius: 3 }, [T('SUMUP *BEWLEYS GRAFTON', { s: 'mono', c: 'ink', name: 'descriptor' })]),
                ]),
                T('€6.80', { s: 'h4', name: 'amount' }),
            ]),
            T('11 Oct · AIB Current · 4 payments from this merchant', { size: 12.5, lh: 17, c: 'ink-2', fillW: true }),
            F({ name: 'suggestions', dir: 'H', gap: 8, wrap: true, rowGap: 8, fillW: true }, [suggestion('Coffee', 'c-coffee'), suggestion('Eating out', 'c-eating-out'), suggestion('Groceries', 'c-groceries')]),
            F({ name: 'footer', dir: 'H', justify: 'between', align: 'center', fillW: true }, [
                F({ name: 'select', dir: 'H', gap: 8, w: 170, h: 32, pad: [0, 12], align: 'center', justify: 'between', fill: 'background', stroke: 'border', radius: 'md', shadow: 'xs' }, [
                    T('All categories…', { size: 12.5, c: 'muted-foreground' }),
                    I('chevron-down', 16, 'muted-foreground'),
                ]),
                F({ name: 'once', dir: 'H', gap: 6, align: 'center' }, [makeCheckbox(once), T('Just this once', { size: 12.5, lh: 17, c: 'ink-2' })]),
            ]),
        ]);
    });
    deliverBlock('Sort card', 'routes/_app/sort.tsx · SortCard with its suggested categories and the "just this once" choice', [set]);
});

// ── budgets ─────────────────────────────────────────────────────────────────

reg('blocks/budget-row', async () => {
    const ROWS = {
        'on-pace': { name: 'Groceries', colour: 'c-groceries', amount: '400', value: 78, tick: 52, status: 'On pace for €412, €12 over', tone: 'warn' },
        spare: { name: 'Eating out', colour: 'c-eating-out', amount: '250', value: 38, tick: 52, status: 'On pace for €182, €68 spare', tone: 'good' },
        fixed: { name: 'Rent', colour: 'c-rent', amount: '1,450', value: 100, tick: null, status: 'Paid for the month', tone: 'ink-2' },
    };
    const set = await variantSet('blocks/budget-row', 'Budget row', [{ name: 'state', values: Object.keys(ROWS) }], (c) => {
        const r = ROWS[c.state];
        return F({ kind: 'component', name: 'BudgetRow', dir: 'H', gap: 16, w: 760, pad: [12, 0], align: 'center', fill: 'surface' }, [
            F({ name: 'category', dir: 'H', gap: 9, align: 'center', w: 150 }, [Rect({ name: 'swatch', w: 10, h: 10, fill: r.colour, radius: 3 }), T(r.name, { weight: 600, name: 'name' })]),
            F({ name: 'track', fillW: true, h: 12 }, [makeTrack({ value: r.value, tick: r.tick, colour: r.colour, w: 300 })]),
            F({ name: 'amount', dir: 'H', w: 72, h: 30, pad: [0, 6], align: 'center', justify: 'end', fill: 'surface', stroke: 'rule', radius: 'control' }, [money(`€${r.amount}`, { size: 13, weight: 500 })]),
            F({ name: 'status', w: 190 }, [
                T(r.status, { size: 12.5, lh: 17, weight: c.state === 'fixed' ? 400 : 600, c: r.tone, fillW: true, name: 'status' }),
            ]),
        ]);
    });
    deliverBlock('Budget row', 'routes/_app/budgets.tsx · category, track with pace tick, editable amount, status line', [set]);
});

// ── sign-in ─────────────────────────────────────────────────────────────────

reg('blocks/sign-in-form', async () => {
    const set = await variantSet('blocks/sign-in-form', 'Sign-in form', [{ name: 'state', values: ['default', 'error', 'sent'] }], (c) => {
        const sent = c.state === 'sent';
        const kids = sent
            ? [
                  I('mail-check', 24, 'brand'),
                  T('Check your email', { s: 'h4' }),
                  T('We sent a sign-in link to you@example.com. Open it on this device to continue.', { size: 13.5, lh: 19, c: 'ink-2', fillW: true }),
                  T('Use a different email', { size: 13, weight: 600, lh: 18, c: 'brand' }),
              ]
            : [
                  F({ name: 'field', gap: 6, fillW: true }, [makeLabel('Email'), makeInput({ fillW: true, placeholder: 'you@example.com', state: c.state === 'error' ? 'invalid' : 'default' }), c.state === 'error' ? T('Enter a valid email address', { size: 12.5, lh: 17, c: 'bad' }) : null]),
                  makeButton({ label: 'Email me a sign-in link', fillW: true }),
                  T('Only approved email addresses can use this app.', { size: 12, lh: 16, c: 'ink-3' }),
              ];
        return F({ kind: 'component', name: 'SignInForm', w: 380, gap: 12, pad: 20, fill: 'surface', stroke: 'rule', radius: 'card' }, kids);
    });
    deliverBlock('Sign-in form', 'routes/login.tsx · email field, magic-link button, and the "check your email" state', [set]);
});
