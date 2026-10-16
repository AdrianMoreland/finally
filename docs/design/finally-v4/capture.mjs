// Captures the v4 prototype as JPEG screenshots (web at 1440 and 400, phone screens) and writes
// golden.json with the prototype's own numbers, for side-by-side comparison and for tests.
//
//   PLAYWRIGHT_PATH=/path/to/node_modules node docs/design/finally-v4/capture.mjs <prototype.html> [outDir]
//
// Personal names in the prototype (user, flatmates, employer) are replaced with neutral samples before capturing, so the
// images can live in the repo. Layout, spacing, colours and numbers are untouched.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(process.argv[2] ?? join(here, 'Finally_Prototype_v4.html'));
const out = resolve(process.argv[3] ?? here);
const require = createRequire((process.env.PLAYWRIGHT_PATH ?? '/opt/node22/lib/node_modules') + '/');
const { chromium } = require('playwright');

const SWAPS = [
  ['Adrian', 'Alex'], ['ADRIAN', 'ALEX'], ['adrian', 'alex'],
  ['Ciara', 'Robin'], ['CIARA', 'ROBIN'], ['ciara', 'robin'], ['BYRNE', 'LEE'],
  ['Tomás', 'Marta'], ['Tomas', 'Marta'], ['TOMAS', 'MARTA'], ['tomas', 'marta'], ['REYES', 'KOWAL'],
  ['Jules', 'Sam'], ['JULES', 'SAM'], ['jules', 'sam'], ['MARTIN', 'FOX'],
  ['CCX SERVICES', 'ACME PAYROLL'],
];
let html = readFileSync(src, 'utf8');
for (const [from, to] of SWAPS) html = html.split(from).join(to);
const tmp = join(out, '.proto.tmp.html');
mkdirSync(out, { recursive: true });
writeFileSync(tmp, html);

const WEB_VIEWS = ['today', 'cashflow', 'ask', 'transactions', 'sort', 'budgets', 'bills', 'month', 'review', 'plan', 'pots', 'people', 'bonus', 'tax', 'investing', 'freedom', 'settings'];
/** [name, view, setup(F, S) run before render, both modes at 400?] */
const WEB_STATES = [
  ['today--customize', 'today', (S) => { S.layout.editing = true; }, true],
  ['today--maths', 'today', (S) => { S.showMaths = true; }, false],
  ['today--spend-usual', 'today', (S) => { S.spCmp = 'usual'; }, false],
  ['cashflow--sincepay', 'cashflow', (S) => { S.cf.per = 'sincepay'; }, true],
  ['cashflow--thismonth', 'cashflow', (S) => { S.cf.per = 'thismonth'; }, false],
  ['cashflow--last3', 'cashflow', (S) => { S.cf.per = 'last3'; }, false],
  ['cashflow--ytd', 'cashflow', (S) => { S.cf.per = 'ytd'; }, false],
  ['cashflow--last12', 'cashflow', (S) => { S.cf.per = 'last12'; }, false],
  ['cashflow--by-group', 'cashflow', (S) => { S.cf.by = 'group'; }, true],
  ['cashflow--pass-through', 'cashflow', (S) => { S.cf.pass = true; }, true],
  ['cashflow--selected-food', 'cashflow', (S) => { S.cf.sel = 'g:food'; }, true],
  ['transactions--rent-open', 'transactions', (S, F) => { const t = F.TX().find((x) => x.grp && !x.sub); S.openTx = t.id; }, true],
  ['transactions--rent-filter', 'transactions', (S) => { S.txf.cat = 'front'; }, true],
  ['month--vs-last', 'month', (S) => { S.cmp = 'last'; }, false],
];
const WEB_400 = new Set(['today', 'cashflow', 'transactions', 'month', 'people', 'pots', 'freedom', 'settings', 'budgets', 'bills', 'sort']);
const PHONE_KEYS = ['welcome', 'signup', 'login', 'today', 'ask', 'acts', 'ladder', 'tx', 'sort', 'flow', 'bud', 'bills', 'month', 'review', 'payday', 'pots', 'people', 'bonus', 'tax', 'investing', 'freedom', 'settings'];
const PHONE_BOTH = new Set(['today', 'flow', 'tx', 'people', 'pots', 'freedom', 'ladder', 'acts', 'settings', 'month']);
const Q = { type: 'jpeg', quality: 82 };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

async function open(width, scheme, hash) {
  const ctx = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: scheme, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await ctx.clock.install({ time: new Date('2026-10-16T09:41:00') });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto('file://' + tmp + '#' + hash);
  await page.waitForFunction(() => window.__finally && document.fonts.status === 'loaded');
  await page.waitForTimeout(400);
  return { ctx, page };
}

async function webShot(file, width, scheme, view, setup) {
  const { ctx, page } = await open(width, scheme, view);
  if (setup) { await page.evaluate(`(${setup.toString()})(window.__finally.S(), window.__finally)`); await page.evaluate('window.__finally.render()'); await page.waitForTimeout(150); }
  mkdirSync(dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: true, ...Q });
  await ctx.close();
}

for (const scheme of ['dark', 'light']) {
  for (const v of WEB_VIEWS) {
    await webShot(join(out, 'web-1440', scheme, `${v}.jpg`), 1440, scheme, v);
    if (WEB_400.has(v)) await webShot(join(out, 'web-400', scheme, `${v}.jpg`), 400, scheme, v);
  }
  for (const [name, view, setup, at400] of WEB_STATES) {
    await webShot(join(out, 'web-1440', scheme, `${name}.jpg`), 1440, scheme, view, setup);
    if (at400) await webShot(join(out, 'web-400', scheme, `${name}.jpg`), 400, scheme, view, setup);
  }
  // Setup flow (web), five steps.
  for (let step = 0; step < 5; step++) {
    const { ctx, page } = await open(1440, scheme, 'today');
    await page.evaluate((n) => { const F = window.__finally, S = F.S(); S.onb = { open: true, step: n, banks: { aib: true, rev: true }, conf: {}, bud: null, plan: null }; }, step);
    await page.evaluate(() => { const F = window.__finally, S = F.S(); S.onb.bud = Object.fromEntries(['groceries', 'eating', 'coffee', 'transport', 'shopping', 'fun', 'other'].map((k) => [k, S.bud[k]])); S.onb.plan = Object.fromEntries(S.pots.map((p) => [p.id, p.monthly]).concat([['debt', S.debtMonthly]])); F.render(); });
    await page.waitForTimeout(150);
    mkdirSync(join(out, 'web-1440', scheme), { recursive: true });
    await page.screenshot({ path: join(out, 'web-1440', scheme, `setup-step-${step + 1}.jpg`), ...Q });
    await ctx.close();
  }
  // Phone: the screen content only (no device frame), full scroll height.
  for (const k of PHONE_KEYS) {
    if (scheme === 'light' && !PHONE_BOTH.has(k)) continue;
    const { ctx, page } = await open(1440, scheme, 'phone');
    await page.evaluate((key) => window.__finally.mJump(key), k);
    await page.addStyleTag({ content: '.pdevice{height:auto!important;min-height:0!important}.pscreen{height:auto!important}.m-body{overflow:visible!important;flex:none!important}' });
    await page.waitForTimeout(250);
    mkdirSync(join(out, 'phone', scheme), { recursive: true });
    await page.locator('#pscreen').screenshot({ path: join(out, 'phone', scheme, `${k}.jpg`), ...Q });
    await ctx.close();
  }
}
// Phone cash flow period chips and detail screens.
for (const scheme of ['dark']) {
  for (const per of ['lastmonth', 'ytd']) {
    const { ctx, page } = await open(1440, scheme, 'phone');
    await page.evaluate((p) => { window.__finally.S().m.cfPer = p; window.__finally.mJump('flow'); }, per);
    await page.addStyleTag({ content: '.pdevice{height:auto!important}.pscreen{height:auto!important}.m-body{overflow:visible!important;flex:none!important}' });
    await page.waitForTimeout(250);
    await page.locator('#pscreen').screenshot({ path: join(out, 'phone', scheme, `flow--${per}.jpg`), ...Q });
    await ctx.close();
  }
  const { ctx, page } = await open(1440, scheme, 'phone');
  await page.evaluate(() => { const F = window.__finally, S = F.S(), t = F.TX().find((x) => x.grp && !x.sub); S.m.stack = [{ s: 'tx', p: t.id }]; S.m.tab = 'money'; F.render(); });
  await page.addStyleTag({ content: '.pdevice{height:auto!important}.pscreen{height:auto!important}.m-body{overflow:visible!important;flex:none!important}' });
  await page.waitForTimeout(250);
  await page.locator('#pscreen').screenshot({ path: join(out, 'phone', scheme, 'tx-rent-detail.jpg'), ...Q });
  await ctx.close();
}

// Golden numbers from the prototype's own model.
const { ctx, page } = await open(1440, 'dark', 'today');
const golden = await page.evaluate(() => {
  const F = window.__finally, r2 = (n) => Math.round(n * 100) / 100;
  const cf = (per, pass) => { const c = F.cashflow(per, { pass }); const slim = (n) => ({ id: n.id, name: n.n, value: r2(n.v), ...(n.cats ? { cats: n.cats.map((x) => ({ id: x.id, name: x.n, value: r2(x.v) })) } : {}) }); return { from: c.from, to: c.to, income: r2(c.income), spent: r2(c.spent), saved: r2(c.saved), paidBack: r2(c.paidBack), fromPots: r2(c.fromPots), fronted: r2(c.fronted), back: r2(c.back), out: r2(c.out), inn: r2(c.inn), sources: c.sources.map(slim), groups: c.groups.map(slim) }; };
  const sts = (d) => { const c = F.stsCalc(d); return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, typeof v === 'number' ? r2(v) : v])); };
  return {
    today: '2026-10-16',
    note: 'Numbers computed by the v4 prototype itself (window.__finally). Names are neutral samples. Use as worked examples in tests.',
    rentRounds: F.rentRounds().slice(0, 6).map((r) => ({ rentDate: r.d, month: r.ym, matchFrom: r.from, matchTo: r.to, fronted: r.fronted, backFromFlatmates: r.back, flatmates: r.mates.map((m) => ({ name: m.n, got: m.got, left: m.left, paidOn: m.paid, onOrAfterRentDay: m.late })) })),
    cashflow: Object.fromEntries(['sincepay', 'thismonth', 'lastmonth', 'last3', 'ytd', 'last12'].map((p) => [p, cf(p, false)])),
    cashflowLastMonthWithPassThrough: cf('lastmonth', true),
    safeToSpendToday: sts(),
    safeToSpendYesterday: sts('2026-10-15'),
    aibLowestThisMonth: F.aibLow(),
    netWorth: r2(F.netWorth()),
    actions: F.actions().map((a) => ({ id: a.id, severity: a.sev, title: a.t, body: a.b, money: r2(a.eur), button: a.btn[0], pinned: !!a.pin })),
    ladder: F.ladder().L.map((l) => ({ key: l.k, title: l.t, done: l.done, when: l.when })),
    recurring: F.detectRecurring().map((r) => ({ name: r.n, cadence: r.cad, amount: r2(r.amt), next: r.next })),
  };
});
writeFileSync(join(out, 'golden.json'), JSON.stringify(golden, null, 2));

// Computed styles of the main building blocks, so values are exact rather than read from the CSS cascade.
const styles = {};
for (const scheme of ['dark', 'light']) {
  const { ctx: c2, page: p2 } = await open(1440, scheme, 'today');
  styles[scheme] = await p2.evaluate(() => {
    const pick = ['backgroundColor', 'color', 'borderTopWidth', 'borderTopColor', 'borderTopStyle', 'borderRadius', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'boxShadow', 'gap', 'height', 'minHeight', 'width'];
    const sels = {
      page: '.page', appFrame: '.app', sidebar: '.side', sidebarBrand: '.side-head b', navItem: '.nav button', navItemActive: '.nav button[aria-current="page"]', navGroupLabel: '.nav .grp', sideAsk: '.side-ask', sideSync: '.side-sync', main: '.main',
      askBar: '.gask', privacyButton: '#priv-btn', viewEyebrow: '.vh .eyebrow', viewTitle: '.vh h2', card: '.card', cardTitle: '.card h3', cardTitleNote: '.card h3 .h3note', kpiTile: '.kpi', kpiLabel: '.kpi .l', kpiValue: '.kpi .v', kpiSub: '.kpi .s',
      heroNumber: '.hero-n', heroSub: '.hero-sub', pace: '.pace', paceNeedle: '.pace b', link: '.lnk', btnPrimary: '.btn:not(.sec)', btnSecondary: '.btn.sec', chip: '.chip', chipOk: '.chip.ok', chipMark: '.chip.mark', severityTag: '.sev', actionRow: '.act-row', actionTitle: '.act-t h4', actionBody: '.act-t p',
      dropdown: '.hsel', monogram: '.av', txTableHeader: '.tx th', txTableCell: '.tx td', txAmount: '.tx .amt', kvRow: '.kv', note: '.note', pinTile: '.pin-tile', ladderMini: '.ladder-mini i', syncDot: '.dot',
    };
    const res = {};
    for (const [name, sel] of Object.entries(sels)) { const el = document.querySelector(sel); if (!el) { res[name] = null; continue; } const cs = getComputedStyle(el); res[name] = Object.fromEntries(pick.map((k) => [k, cs[k]])); }
    const root = getComputedStyle(document.documentElement), vars = {};
    for (const n of ['--paper', '--well', '--surface', '--raised', '--rule', '--hair', '--ink', '--ink-2', '--ink-3', '--brand', '--fill', '--on-fill', '--brand-soft', '--pink', '--marker', '--marker-ink', '--pink-soft', '--good', '--warn', '--bad', '--good-soft', '--warn-soft', '--bad-soft', '--track', '--needle', '--c-transport', '--c-eating', '--c-groceries', '--c-coffee', '--c-shopping', '--c-subs', '--c-bills', '--c-fun', '--c-rent', '--c-other', '--c-travel', '--toast-bg', '--toast-ink', '--toast-act', '--shadow', '--r', '--r-s']) vars[n] = root.getPropertyValue(n).trim();
    return { vars, elements: res };
  });
  await c2.close();
}
// Switch, slider thumb and stepper need their own pages.
{
  const { ctx: c3, page: p3 } = await open(1440, 'dark', 'settings');
  styles.controls = await p3.evaluate(() => { const g = (sel, ks) => { const el = document.querySelector(sel); if (!el) return null; const cs = getComputedStyle(el); return Object.fromEntries(ks.map((k) => [k, cs[k]])); }; const after = (sel, ks) => { const el = document.querySelector(sel); if (!el) return null; const cs = getComputedStyle(el, '::after'); return Object.fromEntries(ks.map((k) => [k, cs[k]])); }; return { switch: g('.switch', ['width', 'height', 'borderRadius', 'backgroundColor']), switchThumb: after('.switch', ['width', 'height', 'borderRadius', 'backgroundColor', 'top', 'left']), switchOff: g('.switch[aria-checked="false"]', ['backgroundColor', 'boxShadow']) }; });
  await c3.close();
}
{
  const { ctx: c4, page: p4 } = await open(1440, 'dark', 'budgets');
  styles.controls = { ...styles.controls, ...(await p4.evaluate(() => { const g = (sel, ks) => { const el = document.querySelector(sel); if (!el) return null; const cs = getComputedStyle(el); return Object.fromEntries(ks.map((k) => [k, cs[k]])); }; return { stepper: g('.stp', ['borderRadius', 'backgroundColor', 'borderTopColor', 'height']), stepperButton: g('.stp button', ['width', 'fontSize', 'color']), stepperInput: g('.stp-in input', ['width', 'fontSize']), budgetTrack: g('.track', ['height', 'borderRadius', 'backgroundColor']), budgetTrackFill: g('.track i', ['borderRadius']), budgetRow: g('.bud .brow', ['gap', 'paddingTop', 'borderTopColor']) }; })) };
  await c4.close();
}
{
  const { ctx: c5, page: p5 } = await open(1440, 'dark', 'cashflow');
  styles.sankey = await p5.evaluate(() => { const g = (sel, ks) => { const el = document.querySelector(sel); if (!el) return null; const cs = getComputedStyle(el); return Object.fromEntries(ks.map((k) => [k, cs[k]])); }; return { link: g('.cf-link', ['opacity']), l1: g('.cf-l1', ['fill', 'fontSize', 'fontWeight']), l2: g('.cf-l2', ['fill', 'fontSize', 'fontWeight']), l3: g('.cf-l3', ['fill', 'fontWeight']), nodeRect: g('.cf-node rect', ['rx']), svgViewBox: document.querySelector('.cf-svg')?.getAttribute('viewBox') }; });
  await c5.close();
}
writeFileSync(join(out, 'computed-styles.json'), JSON.stringify(styles, null, 2));
rmSync(tmp);
await browser.close();
console.log('done');
