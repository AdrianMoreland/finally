import { describe, expect, it } from 'vitest';
import { incomeIn, isSpendish } from './ledger';
import { expandRentSplits, houseMessage, matchShare, rentOwed, rentRounds, rentShareDebts, shareReminder, type RentConfig } from './rent';
import { tx } from './testkit';

const cfg: RentConfig = {
  total: '2500',
  day: 8,
  household: 4,
  flatmates: [
    { id: 'a', name: 'Flatmate A', matchers: ['zoe'], accountId: 'aib' },
    { id: 'b', name: 'Flatmate B', matchers: ['bram'], accountId: 'aib' },
    { id: 'c', name: 'Flatmate C', matchers: ['cleo'], accountId: 'aib' },
  ],
  overdraftPatterns: ['INTEREST CHARGED'],
};

const rent = (date: string) => tx({ date, amount: '-2500.00', slug: 'rent', rawDescriptor: 'LANDLORD RENT', accountId: 'aib' });
const share = (date: string, amount: string, who: string) =>
  tx({ date, amount, kind: 'SHARE', slug: 'rent', rawDescriptor: `PAYMENT FROM ${who}`, accountId: 'aib' });

describe('expandRentSplits', () => {
  it('turns the debit into your quarter and a fronted row', () => {
    const rows = expandRentSplits([rent('2026-10-08')], cfg);
    expect(rows.map((r) => [r.kind, r.amount])).toEqual([
      ['SPEND', '-625.00'],
      ['FRONT', '-1875.00'],
    ]);
    expect(rows[0]!.bankAmount).toBe('-2500.00');
    expect(rows[1]!.slug).toBeNull();
  });
  it('leaves other debits and a disabled config alone', () => {
    const other = tx({ date: '2026-10-09', amount: '-40.00', slug: 'rent' });
    expect(expandRentSplits([other], cfg)).toHaveLength(1);
    expect(expandRentSplits([rent('2026-10-08')], { ...cfg, household: 1 })).toHaveLength(1);
  });
  it('FRONT and SHARE are not spending', () => {
    const rows = expandRentSplits([rent('2026-10-08'), share('2026-10-07', '625.00', 'ZOE')], cfg);
    expect(rows.filter(isSpendish)).toHaveLength(1);
  });
});

describe('matchShare', () => {
  it('ignores case and accents', () => {
    const t = tx({ date: '2026-10-07', amount: '625.00', rawDescriptor: 'PAYMENT FROM ZOË SAMPLE', accountId: 'aib' });
    expect(matchShare(t, cfg)).toBe('a');
  });
  it('needs a credit on the configured account', () => {
    expect(matchShare(tx({ date: '2026-10-07', amount: '-625.00', rawDescriptor: 'zoe' }), cfg)).toBeNull();
    expect(matchShare(tx({ date: '2026-10-07', amount: '625.00', rawDescriptor: 'zoe', accountId: 'rev' }), cfg)).toBeNull();
  });
});

describe('rentRounds', () => {
  const ledger = expandRentSplits(
    [
      rent('2026-10-08'),
      share('2026-10-07', '625.00', 'ZOE'),
      share('2026-10-10', '625.00', 'BRAM'),
      share('2026-10-10', '300.00', 'CLEO'),
      rent('2026-09-08'),
      share('2026-09-19', '625.00', 'CLEO'),
      share('2026-09-27', '625.00', 'ZOE'),
      share('2026-09-28', '625.00', 'BRAM'),
    ],
    cfg,
  );

  it('October round', () => {
    const [oct] = rentRounds(ledger, cfg);
    expect(oct).toMatchObject({ date: '2026-10-08', from: '2026-09-28', to: '2026-10-28', own: '625.00', fronted: '1875.00', back: '1550.00' });
    expect(oct!.mates.map((m) => [m.id, m.late, m.left])).toEqual([
      ['a', false, '0.00'],
      ['b', true, '0.00'],
      ['c', true, '325.00'],
    ]);
    expect(oct!.mates[2]!.got).toBe('300.00');
  });
  it('boundaries: 27 Sep is September, 28 Sep is October', () => {
    const [oct, sep] = rentRounds(ledger, cfg);
    expect(sep).toMatchObject({ from: '2026-08-29', to: '2026-09-27' });
    expect(sep!.mates[0]!.paid).toEqual(['2026-09-27']);
    expect(sep!.mates[1]!.paid).toEqual([]);
    expect(oct!.mates[1]!.paid).toEqual(['2026-09-28', '2026-10-10']);
  });
  it('several payments in one round, and an overpayment', () => {
    const l = expandRentSplits([rent('2026-08-08'), share('2026-08-12', '300.00', 'CLEO'), share('2026-08-20', '325.00', 'CLEO'), share('2026-08-09', '700.00', 'ZOE')], cfg);
    const [aug] = rentRounds(l, cfg);
    expect(aug!.mates[2]).toMatchObject({ paid: ['2026-08-12', '2026-08-20'], left: '0.00', late: true });
    expect(aug!.mates[0]).toMatchObject({ left: '0.00', back: '625.00' });
  });
  it('owed to you is what is left', () => {
    expect(rentOwed(rentRounds(ledger, cfg).slice(0, 1))).toBe('325.00');
  });
  it('is off when the household is one person', () => {
    expect(rentRounds(ledger, { ...cfg, household: 1 })).toEqual([]);
  });
});

describe('income', () => {
  it('a flatmate credit is never income', () => {
    const salary = tx({ date: '2026-09-25', amount: '2419.77', kind: 'INCOME', rawDescriptor: 'WAGES' });
    const l = expandRentSplits([salary, share('2026-09-19', '625.00', 'CLEO')], cfg);
    expect(incomeIn(l, '2026-09-01', '2026-09-30').toFixed(2)).toBe('2419.77');
  });
});

describe('messages', () => {
  it('house message', () => {
    expect(houseMessage(cfg)).toBe(
      'Hi all! Could we send our rent shares (€625) by the 6th each month? I pay the landlord the full €2,500 on the 8th, and my bank charges me overdraft interest while I wait for transfers. A standing order on the 6th would sort it. Thanks!',
    );
  });
  it('reminder', () => {
    expect(shareReminder({ name: 'Cleo', monthName: 'October', total: '2500', day: 8, got: '300', own: '625', left: '325' })).toContain(
      'I have €300 from you of your €625 share, so €325 is still to come.',
    );
  });
});

describe('rentShareDebts', () => {
  it('older rounds only count for people who have paid at least once', () => {
    const l = expandRentSplits(
      [
        rent('2026-10-08'),
        rent('2026-09-08'),
        rent('2026-08-08'),
        share('2026-09-09', '625.00', 'ZOE'),
      ],
      cfg,
    );
    const debts = rentShareDebts(rentRounds(l, cfg));
    // October: everyone owes (newest round). September: A paid, so B and C owe nothing old; August: A owes.
    expect(debts.map((d) => `${d.round.month}:${d.mate.id}`).sort()).toEqual(['2026-08:a', '2026-10:a', '2026-10:b', '2026-10:c']);
  });
});
