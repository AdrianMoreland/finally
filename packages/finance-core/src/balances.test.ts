import { describe, expect, it } from 'vitest';
import { balanceAt, lowestBalance, netWorthAt, vaultBalanceAt } from './balances';
import { paceMonths, paceShare, FLEX_BUDGET_SLUGS, spent } from './ledger';
import { expandRentSplits, type RentConfig } from './rent';
import { detectTrips, tripMonths } from './trips';
import { tx } from './testkit';

const cfg: RentConfig = { total: '2500', day: 8, household: 4, flatmates: [], overdraftPatterns: [] };

describe('balances', () => {
  const rows = expandRentSplits(
    [
      tx({ date: '2026-10-07', amount: '625.00', kind: 'SHARE', accountId: 'aib' }),
      tx({ date: '2026-10-08', amount: '-2500.00', slug: 'rent', accountId: 'aib' }),
      tx({ date: '2026-10-10', amount: '-30.00', accountId: 'aib' }),
    ],
    cfg,
  );
  // balance today (after the 10th) is 300
  it('uses the bank amount of the rent payment, not your share', () => {
    expect(balanceAt('300.00', rows, 'aib', '2026-10-07')).toBe('2830.00');
    expect(balanceAt('300.00', rows, 'aib', '2026-10-08')).toBe('330.00');
  });
  it('finds the lowest day', () => {
    expect(lowestBalance('300.00', rows, 'aib', '2026-10-01', '2026-10-10')).toEqual({ lo: '300.00', day: '2026-10-10' });
  });
  it('lowest balance goes below zero when the rent leaves first', () => {
    expect(lowestBalance('-270.00', rows, 'aib', '2026-10-01', '2026-10-10')).toEqual({ lo: '-270.00', day: '2026-10-10' });
  });
  it('vault balance from transfers', () => {
    const t = [tx({ date: '2026-09-25', amount: '-150.00', rawDescriptor: 'TO RAINY DAY' }), tx({ date: '2026-10-02', amount: '40.00', rawDescriptor: 'FROM RAINY DAY' })];
    expect(vaultBalanceAt(t, 'rainy day', '2026-10-30')).toBe('110.00');
    expect(vaultBalanceAt(t, 'rainy day', '2026-09-30')).toBe('150.00');
  });
  it('net worth at a date', () => {
    expect(netWorthAt({ accounts: [{ id: 'aib', balance: '300.00' }], potsAt: () => '100.00' }, rows, '2026-10-08')).toBe('430.00');
  });
});

describe('trips and pace', () => {
  it('skips trip months when learning the usual pace', () => {
    expect(paceMonths('2026-10-16')).toEqual(['2026-06', '2026-07', '2026-08', '2026-09']);
    expect(paceMonths('2026-10-16', { tripMonths: new Set(['2026-08']) })).toEqual(['2026-05', '2026-06', '2026-07', '2026-09']);
  });
  it('a trip month changes the pace', () => {
    const txs = [
      tx({ date: '2026-09-02', amount: '-50', slug: 'groceries' }),
      tx({ date: '2026-09-20', amount: '-50', slug: 'groceries' }),
      tx({ date: '2026-08-20', amount: '-100', slug: 'groceries' }),
    ];
    const plain = paceShare(txs, 'groceries', 10, '2026-10-16', { history: 2 });
    const skip = paceShare(txs, 'groceries', 10, '2026-10-16', { history: 2, tripMonths: new Set(['2026-08']) });
    expect(plain).toBe(0.25);
    expect(skip).toBe(0.5);
  });
  it('tripMonths covers every month a trip touches', () => {
    expect([...tripMonths([{ from: '2026-07-28', to: '2026-08-03' }])]).toEqual(['2026-07', '2026-08']);
  });
  it('detects a run spent only on the other account', () => {
    const home = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => tx({ date: `2026-07-${String(d).padStart(2, '0')}`, amount: '-5', accountId: 'aib' }));
    const away = [12, 13, 14, 15].map((d) => tx({ date: `2026-07-${d}`, amount: '-9', accountId: 'rev' }));
    const back = tx({ date: '2026-07-18', amount: '-5', accountId: 'aib' });
    expect(detectTrips([...home, ...away, back])).toEqual([{ from: '2026-07-12', to: '2026-07-15' }]);
  });
});

describe('travel has no budget', () => {
  it('is not part of the flexible lines and a root category', () => {
    expect(FLEX_BUDGET_SLUGS).not.toContain('travel');
    const t = tx({ date: '2026-10-05', amount: '-300', slug: 'travel', parentSlug: null });
    const flex = FLEX_BUDGET_SLUGS.map((s) => spent([t], { slug: s, from: '2026-10-01', to: '2026-10-31' }).toNumber());
    expect(flex.every((n) => n === 0)).toBe(true);
  });
});
