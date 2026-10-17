import { describe, expect, it } from 'vitest';
import { overdraftSpendable, overdraftState } from './overdraft';
import { computeSafeToSpend, weekLeft } from './safe';

const base = {
  today: '2026-10-15',
  nextPayday: '2026-10-23',
  budgets: { groceries: '300', 'eating-out': '200', coffee: '50', transport: '60', shopping: '100', fun: '100', other: '50' },
  spentBySlug: { groceries: '100', 'eating-out': '50', coffee: '10', transport: '10', shopping: '0', fun: '20', other: '0' },
  unsorted: '0',
  balance: '1000',
  billsBeforePayday: '100',
  buffer: '150',
};

describe('computeSafeToSpend', () => {
  it('is held to the budget when the budget is the lower number', () => {
    const r = computeSafeToSpend({ ...base, balance: '5000' });
    expect(r.flexBudget).toBe('860.00');
    expect(r.budgetLeft).toBe('670.00'); // 860 - 190 spent
    expect(r.binds).toBe('budget');
    expect(r.perDay).toBe('83.75'); // 670 / 8 days
  });

  it('is held to the balance when money is tighter than the budgets', () => {
    const r = computeSafeToSpend({ ...base, balance: '400' });
    expect(r.balanceLeft).toBe('150.00'); // 400 - 100 bills - 150 buffer
    expect(r.binds).toBe('balance');
    expect(r.perDay).toBe('18.75');
  });

  it('counts unsorted payments against the budget', () => {
    const r = computeSafeToSpend({ ...base, balance: '5000', unsorted: '60' });
    expect(r.budgetLeft).toBe('610.00');
  });

  it('does not hide overspending on one line behind slack on another', () => {
    const r = computeSafeToSpend({ ...base, balance: '5000', spentBySlug: { ...base.spentBySlug, 'eating-out': '260' } });
    expect(r.over).toBe('60.00');
    expect(r.budgetLeft).toBe('460.00'); // the overspend comes straight off the pool
  });

  it('never goes below zero a day, even when overdrawn', () => {
    const r = computeSafeToSpend({ ...base, balance: '-760.17' });
    expect(Number(r.pool)).toBeLessThan(0);
    expect(r.perDay).toBe('0.00');
  });
});

describe('overdraft room', () => {
  const tight = { ...base, billsBeforePayday: '0', buffer: '0', budgets: { groceries: '5000' }, spentBySlug: {} };
  it('counts the room: at -300 with a 1000 overdraft you can spend 700', () => {
    const r = computeSafeToSpend({ ...tight, balance: '-300', overdraft: '1000' });
    expect(r.balanceLeft).toBe('700.00');
    expect(r.overdraft).toBe('1000.00');
    expect(r.binds).toBe('balance');
  });
  it('keeps back what you want free', () => {
    expect(computeSafeToSpend({ ...tight, balance: '-300', overdraft: overdraftSpendable('1000', '200') }).balanceLeft).toBe('500.00');
  });
  it('ignores the overdraft when none is set', () => {
    expect(computeSafeToSpend({ ...tight, balance: '-300' }).balanceLeft).toBe('-300.00');
  });
});

describe('overdraftState', () => {
  it('splits a limit into used and room', () => {
    expect(overdraftState('-300', '1000')).toEqual({ limit: '1000.00', used: '300.00', room: '700.00', inOverdraft: true });
    expect(overdraftState('500', '1000')).toEqual({ limit: '1000.00', used: '0.00', room: '1000.00', inOverdraft: false });
    expect(overdraftState('-1200', '1000')).toEqual({ limit: '1000.00', used: '1200.00', room: '0.00', inOverdraft: true });
  });
  it('is empty without a limit', () => {
    expect(overdraftState('-50', '0')).toEqual({ limit: '0.00', used: '50.00', room: '0.00', inOverdraft: true });
  });
  it('spendable is the limit less what you keep free, never negative', () => {
    expect(overdraftSpendable('1000', '0')).toBe('1000.00');
    expect(overdraftSpendable('1000', '1500')).toBe('0.00');
  });
});

describe('weekLeft', () => {
  it('turns a monthly flexible budget into a weekly one', () => {
    const w = weekLeft({ flexBudget: '620', daysInMonth: 31, spentThisWeek: '90', weekdayMon0: 3 });
    expect(w.weekBudget).toBe('140.00');
    expect(w.left).toBe('50.00');
    expect(w.daysLeft).toBe(4);
  });
});
