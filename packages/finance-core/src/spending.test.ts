import { describe, expect, it } from 'vitest';
import { budgetTotals, spendingSummary } from './spending';
import { tx } from './testkit';

const rows = [
  tx({ id: '1', date: '2026-10-02', amount: '-45.00', slug: 'groceries' }),
  tx({ id: '2', date: '2026-10-05', amount: '-20.00', slug: 'coffee', parentSlug: 'eating-out' }),
  tx({ id: '3', date: '2026-10-06', amount: '-30.00', slug: 'eating-out' }),
  tx({ id: '4', date: '2026-10-07', amount: '5.00', kind: 'REFUND', slug: 'groceries' }),
  tx({ id: '5', date: '2026-10-08', amount: '-10.00' }),
  tx({ id: '6', date: '2026-10-09', amount: '-99.00', slug: 'fun', excluded: true }),
  tx({ id: '7', date: '2026-09-30', amount: '-70.00', slug: 'groceries' }),
  tx({ id: '8', date: '2026-10-03', amount: '2000.00', kind: 'INCOME' }),
];

describe('spendingSummary', () => {
  const s = spendingSummary(rows, { from: '2026-10-01', to: '2026-10-10' });
  it('totals what was spent in the period, nets refunds, leaves out income and left-out payments', () => {
    expect(s.total).toBe('100.00'); // 45 + 20 + 30 + 10 - 5
    expect(s.count).toBe(4);
    expect(s.average).toBe('25.00');
    expect(s.perDay).toBe('10.00'); // 10 days
  });
  it('groups by parent category, biggest first, with children and unsorted', () => {
    expect(s.groups.map((g) => [g.slug, g.spent, g.count])).toEqual([
      ['eating-out', '50.00', 2],
      ['groceries', '40.00', 1],
      [null, '10.00', 1],
    ]);
    expect(s.groups[0]!.children).toEqual([{ slug: 'coffee', spent: '20.00', count: 1 }]);
    expect(s.groups[0]!.share).toBe(0.5);
  });
  it('can be narrowed to one category, children included', () => {
    const e = spendingSummary(rows, { from: '2026-10-01', to: '2026-10-10', slug: 'eating-out' });
    expect([e.total, e.count]).toEqual(['50.00', 2]);
  });
  it('is zero over nothing', () => {
    expect(spendingSummary([], { from: '2026-10-01', to: '2026-10-10' })).toMatchObject({ total: '0.00', count: 0, average: '0.00', groups: [] });
  });
});

describe('budgetTotals', () => {
  it('reconciles budgets with all spending: in budgets, outside them, and not yet sorted', () => {
    expect(budgetTotals({ budgeted: '1200', spentInBudgets: '900', categorisedSpend: '1000', unsorted: '50' })).toEqual({
      budgeted: '1200.00',
      spentInBudgets: '900.00',
      left: '300.00',
      outside: '100.00',
      unsorted: '50.00',
      allSpending: '1050.00',
    });
  });
  it('shows overspending as a negative left, not zero', () => {
    expect(budgetTotals({ budgeted: '500', spentInBudgets: '620', categorisedSpend: '620', unsorted: '0' }).left).toBe('-120.00');
  });
});
