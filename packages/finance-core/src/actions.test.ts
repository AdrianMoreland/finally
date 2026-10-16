import { describe, expect, it } from 'vitest';
import { buildActions, type ActionInput } from './actions';
import { expandRentSplits, type RentConfig } from './rent';
import { frontOverdraftInput, overdraftFees, shareReminderInputs } from './rent-actions';
import { tx } from './testkit';

const cfg: RentConfig = {
  total: '2500',
  day: 8,
  household: 4,
  flatmates: [
    { id: 'a', name: 'Flatmate A', matchers: ['zoe'] },
    { id: 'c', name: 'Flatmate C', matchers: ['cleo'] },
  ],
  overdraftPatterns: ['INTEREST CHARGED'],
};

const ledger = expandRentSplits(
  [
    tx({ date: '2026-10-08', amount: '-2500.00', slug: 'rent', accountId: 'aib' }),
    tx({ date: '2026-10-07', amount: '625.00', kind: 'SHARE', rawDescriptor: 'ZOE', accountId: 'aib' }),
    tx({ date: '2026-10-10', amount: '300.00', kind: 'SHARE', rawDescriptor: 'CLEO', accountId: 'aib' }),
    tx({ date: '2026-08-20', amount: '-20.00', rawDescriptor: 'INTEREST CHARGED', slug: 'fees', accountId: 'aib' }),
  ],
  cfg,
);

const base: ActionInput = {
  today: '2026-10-16',
  nextPayday: '2026-10-23',
  toSort: { count: 0, total: '0.00' },
  orders: [],
  rentCredit: { state: 'NA', amount: 0, year: 2026 },
  prevRentCredit: { state: 'NA', amount: 0, sinceYear: '2025' },
  owed: [],
  pots: [],
  pace: [],
  overdrawn: null,
  frontOverdraft: null,
  shareReminders: [],
  doubles: [],
  rises: [],
  snoozed: new Set(),
};

describe('overdraft while fronting', () => {
  it('only when a round exists this month and the monthly low is below zero', () => {
    // balance now 400 after everything: before the 10th credit it was 100, before rent 2600... make it negative
    const below = frontOverdraftInput({ txs: ledger, cfg, accountId: 'aib', balance: '-200.00', today: '2026-10-16', fees12m: '68.33' });
    expect(below).toMatchObject({ day: '2026-10-08', fees12m: '68.33', rentDay: 8, payByDay: 6 });
    expect(Number(below!.low)).toBeLessThan(0);
    expect(frontOverdraftInput({ txs: ledger, cfg, accountId: 'aib', balance: '5000.00', today: '2026-10-16', fees12m: '0' })).toBeNull();
    expect(frontOverdraftInput({ txs: ledger, cfg, accountId: 'aib', balance: '-200.00', today: '2026-11-03', fees12m: '0' })).toBeNull();
    expect(frontOverdraftInput({ txs: ledger, cfg: { ...cfg, household: 1 }, accountId: 'aib', balance: '-200.00', today: '2026-10-16', fees12m: '0' })).toBeNull();
  });
  it('becomes a pinned action with a copy button', () => {
    const front = frontOverdraftInput({ txs: ledger, cfg, accountId: 'aib', balance: '-200.00', today: '2026-10-16', fees12m: '68.33' });
    const [a] = buildActions({ ...base, frontOverdraft: front });
    expect(a).toMatchObject({ id: 'front', severity: 'ACT', pinned: true, amount: '68.33', cta: { kind: 'copy', label: 'Copy message' } });
    expect(a!.body).toContain('Ask the house to pay by the 6th.');
  });
  it('sums fees from the fees category or patterns', () => {
    expect(overdraftFees(ledger, cfg, '2025-10-16', '2026-10-16')).toBe('20.00');
  });
});

describe('share reminders', () => {
  it('only while a flatmate still owes part of this month', () => {
    const r = shareReminderInputs(ledger, cfg, '2026-10-16');
    expect(r.map((x) => [x.id, x.left])).toEqual([['c', '325.00']]);
    expect(shareReminderInputs(ledger, cfg, '2026-11-20')).toEqual([]);
  });
  it('becomes a WATCH item with the reminder text', () => {
    const items = buildActions({ ...base, shareReminders: shareReminderInputs(ledger, cfg, '2026-10-16') });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'share-c', severity: 'WATCH', amount: '325.00' });
    expect(items[0]!.title).toBe('Flatmate C has sent €300 of €625 for October');
    expect(items[0]!.cta).toMatchObject({ kind: 'copy', label: 'Copy reminder' });
  });
});
