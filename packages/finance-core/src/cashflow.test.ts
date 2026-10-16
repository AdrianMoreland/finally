import { describe, expect, it } from 'vitest';
import { buildCashflow, CF_PERIODS, cfPick, cfRange, keptRate, mergeSmallGroups, type Cashflow } from './cashflow';
import { D, sum } from './decimal';
import { expandRentSplits, type RentConfig } from './rent';
import { isNodeSelected, layoutSankey } from './sankey';
import { tx } from './testkit';

const cfg: RentConfig = {
  total: '2500',
  day: 8,
  household: 4,
  flatmates: [{ id: 'a', name: 'Flatmate A', matchers: ['zoe'] }],
  overdraftPatterns: [],
};
const names: Record<string, string> = { rent: 'Rent', household: 'Household', groceries: 'Groceries', 'eating-out': 'Eating out', transport: 'Transport', bills: 'Bills', travel: 'Travel', health: 'Health' };
const S = (d: string): string => `2026-09-${d}`;

const fixture = () =>
  expandRentSplits(
    [
      tx({ id: 'sal', date: S('25'), amount: '2400.00', kind: 'INCOME', merchantKey: 'acme', merchantName: 'Acme Ltd' }),
      tx({ id: 'rent', date: S('08'), amount: '-2500.00', slug: 'rent' }),
      tx({ id: 'sh1', date: S('07'), amount: '625.00', kind: 'SHARE', slug: 'rent', rawDescriptor: 'ZOE' }),
      tx({ id: 'house', date: S('10'), amount: '-89.00', slug: 'household', parentSlug: 'shopping' }),
      tx({ id: 'g1', date: S('11'), amount: '-300.00', slug: 'groceries' }),
      tx({ id: 'g2', date: S('18'), amount: '-100.00', slug: 'eating-out' }),
      tx({ id: 'ref', date: S('19'), amount: '20.00', kind: 'REFUND', slug: 'groceries' }),
      tx({ id: 'trip', date: S('20'), amount: '-60.00', slug: 'travel', excluded: true }),
      tx({ id: 'u', date: S('21'), amount: '-24.13' }),
      tx({ id: 'pot', date: S('26'), amount: '-340.00', rawDescriptor: 'TO POT' }),
      tx({ id: 'mum', date: S('27'), amount: '-100.00', rawDescriptor: 'MUM' }),
      tx({ id: 'own', date: S('15'), amount: '-500', kind: 'TRANSFER' }),
    ],
    cfg,
  );

const build = (pass: boolean): Cashflow =>
  buildCashflow(fixture(), { from: S('01'), to: S('30') }, {
    pass,
    names,
    potOf: (t) => (t.rawDescriptor === 'TO POT' ? { id: 'rainy', name: 'Rainy day' } : null),
    personOf: (t) => (t.rawDescriptor === 'MUM' ? 'Mum' : null),
  });

describe('buildCashflow', () => {
  const cf = build(false);

  it('counts rent as your share and income as pay only', () => {
    expect(cf.income).toBe('2400.00');
    expect(cf.groups.find((g) => g.id === 'home')!.cats.map((c) => [c.id, c.v])).toEqual([
      ['rent', '625.00'],
      ['household', '89.00'],
    ]);
    expect(cf.sources.map((s) => s.id)).not.toContain('pass');
  });
  it('nets refunds, keeps payments left out of budgets, and unsorted on its own', () => {
    expect(cf.groups.find((g) => g.id === 'food')!.v).toBe('380.00');
    expect(cf.groups.find((g) => g.id === 'fun')!.v).toBe('60.00');
    expect(cf.groups.find((g) => g.id === 'unsorted')!.v).toBe('24.13');
  });
  it('sets aside to pots, pays back people, and closes the gap from your balance', () => {
    expect(cf.saved).toBe('340.00');
    expect(cf.paidBack).toBe('100.00');
    expect(cf.groups.find((g) => g.id === 'saved')!.cats.map((c) => c.name)).toEqual(['Rainy day']);
    expect(cf.spent).toBe('1178.13');
    expect(cf.out).toBe('1618.13');
    expect(cf.sources.find((s) => s.id === 'balance')).toBeUndefined();
    expect(cf.groups.find((g) => g.id === 'left')!.v).toBe('781.87');
  });
  it('money out beats money in: From your balance', () => {
    const l = buildCashflow([tx({ date: S('02'), amount: '-100', slug: 'groceries' })], { from: S('01'), to: S('30') }, { names });
    expect(l.sources.map((s) => [s.id, s.v])).toEqual([['balance', '100.00']]);
  });
  it('balances: sources equal groups, categories equal their group', () => {
    for (const pass of [false, true]) {
      const c = build(pass);
      const mainIn = sum(c.sources.filter((s) => !s.pass).map((s) => s.v));
      const mainOut = sum(c.groups.filter((g) => !g.pass).map((g) => g.v));
      expect(mainIn.toFixed(2)).toBe(mainOut.toFixed(2));
      for (const g of c.groups.filter((x) => x.id !== 'left' && !x.pass)) expect(sum(g.cats.map((x) => x.v)).toFixed(2)).toBe(D(g.v).toFixed(2));
      expect(c.groups.every((g) => D(g.v).gte(0))).toBe(true);
    }
  });
  it('pass-through adds a grey band and changes no totals', () => {
    const a = build(false);
    const b = build(true);
    expect(b.sources.at(-1)).toMatchObject({ id: 'pass', v: '1875.00', pass: true });
    expect(b.groups.at(-1)).toMatchObject({ id: 'front', v: '1875.00', pass: true });
    for (const k of ['income', 'spent', 'saved', 'paidBack', 'out', 'inn'] as const) expect(b[k]).toBe(a[k]);
    expect(b.back).toBe('625.00');
    expect(b.fronted).toBe('1875.00');
  });
  it('per-payment keys drive the payments list', () => {
    expect([...cfPick(cf, 'g:food')!].sort()).toEqual(['g1', 'g2', 'ref']);
    expect([...cfPick(cf, 'c:pot:rainy')!]).toEqual(['pot']);
    expect([...cfPick(cf, 's:inc:acme')!]).toEqual(['sal']);
    expect(cfPick(cf, null)).toBeNull();
    expect(cf.items.find((i) => i.txId === 'own')).toBeUndefined();
  });
  it('kept before pots', () => {
    expect(keptRate(cf)).toEqual({ pct: '51', kept: '1221.87' });
    expect(keptRate({ income: '0.00', spent: '10.00' })).toBeNull();
  });
});

describe('mergeSmallGroups', () => {
  it('folds groups under the share into Everything else when at least two qualify', () => {
    const cf = build(false);
    const merged = mergeSmallGroups(cf, 0.06);
    expect(merged.groups.map((g) => g.id)).toContain('smallgroups');
    expect(sum(merged.groups.map((g) => g.v)).toFixed(2)).toBe(sum(cf.groups.map((g) => g.v)).toFixed(2));
    expect(merged.groups.find((g) => g.id === 'saved')).toBeDefined();
    expect(mergeSmallGroups(cf, 0.001)).toBe(cf);
  });
});

describe('periods', () => {
  it('has the six ranges', () => {
    const r = Object.fromEntries(CF_PERIODS.map((p) => [p, cfRange(p, '2026-10-16', 25)]));
    expect(r.lastmonth).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(r.thismonth).toEqual({ from: '2026-10-01', to: '2026-10-16' });
    expect(r.sincepay).toEqual({ from: '2026-09-25', to: '2026-10-16' });
    expect(r.last3).toEqual({ from: '2026-07-01', to: '2026-09-30' });
    expect(r.ytd).toEqual({ from: '2026-01-01', to: '2026-10-16' });
    expect(r.last12).toEqual({ from: '2025-10-17', to: '2026-10-16' });
  });
});

describe('layoutSankey', () => {
  const cf = build(true);
  const lay = layoutSankey(cf, { width: 1000, columns: 3 });
  const k = (id: string) => lay.nodes.find((n) => n.key === id)!;

  it('draws every node and ribbon heights equal their value times the scale', () => {
    expect(lay.empty).toBe(false);
    const scale = k('g:food').h / k('g:food').value;
    for (const l of lay.links) expect(l.h).toBeCloseTo(l.value * scale, 5);
  });
  it('stacks ribbons so they never cross', () => {
    const bySource = new Map<string, number[]>();
    for (const l of lay.links.filter((x) => x.from.startsWith('s:'))) {
      const to = k(l.to);
      bySource.set(l.from, [...(bySource.get(l.from) ?? []), to.y]);
    }
    for (const ys of bySource.values()) expect([...ys].sort((a, b) => a - b)).toEqual(ys);
  });
  it('labels by node height', () => {
    expect(k('g:home').label.mode).toBe('two');
    expect(lay.nodes.some((n) => n.label.mode === 'one' || n.label.mode === 'none')).toBe(true);
    const mini = layoutSankey(cf, { width: 330, columns: 2, mini: true, nodeWidth: 8, merge: 0.05, height: 190 });
    expect(mini.nodes.every((n) => n.label.mode !== 'two' || (n.label as { share: number | null }).share === null)).toBe(true);
  });
  it('selecting a node lights it, and a group lights its categories', () => {
    expect(isNodeSelected(k('c:groceries'), 'g:food')).toBe(true);
    expect(isNodeSelected(k('c:groceries'), 'c:groceries')).toBe(true);
    expect(isNodeSelected(k('c:rent'), 'g:food')).toBe(false);
  });
  it('is empty when nothing moved', () => {
    expect(layoutSankey(buildCashflow([], { from: S('01'), to: S('30') }, { names }), { width: 400, columns: 2 }).empty).toBe(true);
  });
});
