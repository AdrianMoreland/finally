/**
 * Layouts: whole pages assembled from instances of the components and blocks. Anything a layout needs that
 * has not been imported yet is built first (see master() in core.js), so a layout works on an empty file.
 */

function layoutFrame(name, w, h, kids, o = {}) {
    const f = F({ name: `${PREFIX}Layouts / ${name}`, dir: o.dir ?? 'H', w, h, fill: o.fill ?? 'background', clip: true, align: o.align, justify: o.justify }, kids);
    applyMode(f);
    return place(f);
}

/** The app shell: sidebar on the left, a padded main column (px-7 pt-6 on desktop). */
async function shellPage(name, page, mainKids, h = 1100) {
    const sidebar = await use('components/app-sidebar', { page }, { fillH: true });
    const main = F({ name: 'main', gap: 18, pad: [24, 28, 40, 28], fillW: true, fillH: true }, mainKids);
    return layoutFrame(name, 1440, h, [sidebar, main]);
}

reg('layouts/sign-in', async () => {
    const logo = await use('components/logo', { size: 'lg' });
    const form = await use('blocks/sign-in-form', { state: 'default' });
    const page = F({ name: 'sign-in', gap: 24, w: 380 }, [
        F({ name: 'brand', dir: 'H', gap: 12, align: 'center' }, [
            logo,
            F({ name: 'text', gap: 4 }, [T('Finally', { size: 26, weight: 700, lh: 26, ls: -2 }), T('Your money, in one calm place.', { size: 13, lh: 18, c: 'ink-2' })]),
        ]),
        form,
    ]);
    layoutFrame('Sign-in page', 1440, 900, [page], { align: 'center', justify: 'center' });
});

reg('layouts/overview', async () => {
    const header = await use('components/page-header', {}, { fillW: true });
    const banner = await use('blocks/to-sort-banner', {}, { fillW: true });
    const net = await use('blocks/net-worth', {});
    const safe = await use('blocks/safe-to-spend', {});
    const flex = await use('blocks/flexible-spend', { pace: 'ahead' });
    const breakdown = await use('blocks/spend-breakdown', {});
    const insights = await use('blocks/insight-list', {});
    const payments = await use('blocks/recent-payments', {});
    await shellPage('Overview', 'overview', [
        header,
        banner,
        F({ name: 'row 1', dir: 'H', gap: 16, fillW: true, align: 'start' }, [net, safe, flex]),
        F({ name: 'row 2', dir: 'H', gap: 16, fillW: true, align: 'start' }, [breakdown, insights]),
        payments,
    ], 1280);
});

reg('layouts/to-sort', async () => {
    const header = F({ name: 'header', gap: 4, fillW: true }, [
        caps('Inbox · 3 merchants'),
        T('To sort', { s: 'h1' }),
        T('Pick a category once per merchant. Finally saves it as a rule and re-sorts every payment from that merchant, past and future.', { c: 'ink-2', w: 620 }),
    ]);
    const cards = [];
    for (const scope of ['merchant', 'merchant', 'once']) cards.push(await use('blocks/sort-card', { scope }));
    await shellPage('To sort', 'sort', [header, F({ name: 'cards', dir: 'H', gap: 14, wrap: true, rowGap: 14, fillW: true }, cards)], 800);
});

reg('layouts/budgets', async () => {
    const header = F({ name: 'header', gap: 4, fillW: true }, [
        caps('October 2026 · day 15 of 31'),
        T('Budgets', { s: 'h1' }),
        T('The tick on each bar is where an even pace would put you today. Edit any amount to change the budget.', { c: 'ink-2', w: 620 }),
    ]);
    const rows = [];
    for (const state of ['on-pace', 'spare', 'fixed']) rows.push(await use('blocks/budget-row', { state }, { fillW: true }));
    const panel = makePanel({ name: 'Budgets', title: 'This month', fillW: true, body: rows });
    await shellPage('Budgets', 'budgets', [header, panel], 760);
});
