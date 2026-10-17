import { describe, expect, it } from 'vitest';
import { incomeIn, isSpendish } from './ledger';
import { creditAsks, expandRentSplits, shortCredits, houseMessage, matchShare, rentOwed, rentRounds, rentShareDebts, shareDues, shareReminder, type RentConfig } from './rent';
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

describe('shares that differ per person', () => {
  // Until September two flatmates pay 614 and the other two split the rest; from October the third pays 766.
  const diff: RentConfig = {
    ...cfg,
    flatmates: [
      { id: 'a', name: 'Flatmate A', matchers: ['zoe'], amounts: [{ from: '2026-01', amount: '614' }] },
      { id: 'b', name: 'Flatmate B', matchers: ['bram'], amounts: [{ from: '2026-01', amount: '614' }] },
      {
        id: 'c',
        name: 'Flatmate C',
        matchers: ['cleo'],
        amounts: [
          { from: '2026-01', amount: '636' },
          { from: '2026-10', amount: '766' },
        ],
      },
    ],
  };

  it('dues follow the month, and yours is what is left', () => {
    expect(shareDues(diff, '2026-09-08')).toEqual({ own: '636.00', mates: { a: '614.00', b: '614.00', c: '636.00' } });
    expect(shareDues(diff, '2026-10-08')).toEqual({ own: '506.00', mates: { a: '614.00', b: '614.00', c: '766.00' } });
  });
  it('the first amount applies to months before it', () => {
    expect(shareDues(diff, '2025-12-08').mates.c).toBe('636.00');
  });
  it('people with no amount pay an equal share; untracked housemates do too', () => {
    const legacy = shareDues({ ...cfg, household: 5 }, '2026-10-08');
    expect(legacy).toEqual({ own: '500.00', mates: { a: '500.00', b: '500.00', c: '500.00' } });
  });
  it('your share never goes below zero', () => {
    const over = { ...diff, flatmates: diff.flatmates.map((f) => ({ ...f, amounts: [{ from: '2026-01', amount: '1000' }] })) };
    expect(shareDues(over, '2026-10-08').own).toBe('0.00');
  });
  it('splits the rent debit into your remainder and the rest fronted', () => {
    const rows = expandRentSplits([rent('2026-10-08'), rent('2026-09-08')], diff);
    expect(rows.map((r) => [r.date, r.kind, r.amount])).toEqual([
      ['2026-10-08', 'SPEND', '-506.00'],
      ['2026-10-08', 'FRONT', '-1994.00'],
      ['2026-09-08', 'SPEND', '-636.00'],
      ['2026-09-08', 'FRONT', '-1864.00'],
    ]);
  });
  it('rounds judge each person against their own amount', () => {
    const l = expandRentSplits([rent('2026-10-08'), share('2026-10-07', '614.00', 'ZOE'), share('2026-10-09', '700.00', 'CLEO'), share('2026-10-10', '700.00', 'BRAM')], diff);
    const [oct] = rentRounds(l, diff);
    expect(oct).toMatchObject({ own: '506.00', fronted: '1994.00', back: '1928.00' });
    expect(oct!.mates.map((m) => [m.id, m.due, m.left, m.back])).toEqual([
      ['a', '614.00', '0.00', '614.00'],
      ['b', '614.00', '0.00', '614.00'],
      ['c', '766.00', '66.00', '700.00'],
    ]);
  });
});

describe('marked shares', () => {
  const self = (date: string, amount: string, extra: Partial<Parameters<typeof tx>[0]> = {}) =>
    tx({ date, amount, kind: 'SHARE', slug: 'rent', rawDescriptor: 'TRANSFER FROM ADRIAN MORELAND', accountId: 'aib', ...extra });

  it('a mark names the person even when no text matches', () => {
    expect(matchShare(self('2026-10-12', '614.00', { shareOf: 'a' }), cfg)).toBe('a');
    expect(matchShare(self('2026-10-12', '614.00'), cfg)).toBeNull();
  });
  it('a mark beats a text match', () => {
    const t = tx({ date: '2026-10-07', amount: '614.00', kind: 'SHARE', rawDescriptor: 'PAYMENT FROM ZOE', accountId: 'aib', shareOf: 'b' });
    expect(matchShare(t, cfg)).toBe('b');
  });
  it('a mark ignores the account filter and still needs a credit', () => {
    expect(matchShare(self('2026-10-12', '614.00', { shareOf: 'a', accountId: 'rev' }), cfg)).toBe('a');
    expect(matchShare(self('2026-10-12', '-614.00', { shareOf: 'a' }), cfg)).toBeNull();
  });
  it('a month pick moves a late transfer into that round, not the one its date falls in', () => {
    // 3 Nov is in the October round window (28 Sep to 28 Oct)? No: it is in November's. Marked for October it counts there.
    const l = expandRentSplits([rent('2026-11-08'), rent('2026-10-08'), self('2026-11-03', '614.00', { shareOf: 'a', shareMonth: '2026-10' })], cfg);
    const [nov, oct] = rentRounds(l, cfg);
    expect(oct!.mates[0]).toMatchObject({ got: '614.00', paid: ['2026-11-03'] });
    expect(nov!.mates[0]).toMatchObject({ got: '0.00' });
  });
  it('without a month the date window decides', () => {
    const l = expandRentSplits([rent('2026-10-08'), self('2026-10-12', '614.00', { shareOf: 'a' })], cfg);
    expect(rentRounds(l, cfg)[0]!.mates[0]!.got).toBe('614.00');
  });
});

describe('creditAsks', () => {
  const salary = tx({ id: 's1', date: '2026-09-25', amount: '2419.77', kind: 'INCOME', rawDescriptor: 'WAGES ACME', accountId: 'aib' });
  const salary2 = tx({ id: 's2', date: '2026-08-25', amount: '2419.77', kind: 'INCOME', rawDescriptor: 'WAGES ACME', accountId: 'aib' });
  const own = (id: string, date: string, amount: string) => tx({ id, date, amount, kind: 'INCOME', rawDescriptor: 'TRANSFER FROM ADRIAN MORELAND', accountId: 'aib' });

  it('asks about an unmarked credit inside the latest rent window, not the salary or small amounts', () => {
    const l = expandRentSplits([rent('2026-10-08'), salary, salary2, own('x', '2026-10-12', '614.00'), own('y', '2026-10-13', '12.00')], cfg);
    expect(creditAsks(l, cfg, '2026-10-14', []).map((a) => [a.txId, a.amount])).toEqual([['x', '614.00']]);
  });
  it('is quiet when the credit was handled or no rent round exists', () => {
    const l = expandRentSplits([rent('2026-10-08'), own('x', '2026-10-12', '614.00')], cfg);
    expect(creditAsks(l, cfg, '2026-10-14', ['x'])).toEqual([]);
    expect(creditAsks([own('x', '2026-10-12', '614.00')], cfg, '2026-10-14', [])).toEqual([]);
  });
});

describe('shortCredits', () => {
  const diff: RentConfig = { ...cfg, flatmates: cfg.flatmates.map((f) => ({ ...f, amounts: [{ from: '2026-01', amount: '614' }] })) };
  const victor = (id: string, date: string, amount: string) => tx({ id, date, amount, kind: 'SHARE', slug: 'rent', rawDescriptor: 'PAYMENT FROM ZOE', accountId: 'aib' });

  it('finds one transfer a little under the share, with what is missing', () => {
    const l = expandRentSplits([rent('2026-10-08'), victor('v1', '2026-10-10', '556.00')], diff);
    expect(shortCredits(l, diff, '2026-10-14', [])).toEqual([{ txId: 'v1', personId: 'a', name: 'Flatmate A', due: '614.00', got: '556.00', left: '58.00' }]);
  });
  it('is quiet when paid in full, far short, paid twice, already split or dismissed', () => {
    const run = (rows: ReturnType<typeof victor>[], handled: string[] = []) => shortCredits(expandRentSplits([rent('2026-10-08'), ...rows], diff), diff, '2026-10-14', handled);
    expect(run([victor('v1', '2026-10-10', '614.00')])).toEqual([]);
    expect(run([victor('v1', '2026-10-10', '300.00')])).toEqual([]);
    expect(run([victor('v1', '2026-10-10', '500.00'), victor('v2', '2026-10-11', '50.00')])).toEqual([]);
    expect(run([{ ...victor('v1:p0', '2026-10-10', '556.00'), splitOf: 'v1' }])).toEqual([]);
    expect(run([victor('v1', '2026-10-10', '556.00')], ['v1'])).toEqual([]);
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
