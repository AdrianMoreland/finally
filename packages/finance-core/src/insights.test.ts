import { describe, expect, it } from 'vitest';
import {
  anomalies,
  budgetPacing,
  cashflowForecast,
  detectRecurring,
  leaks,
  netWorth,
  netWorthSeries,
  pacing,
  safeToSpend,
  savingsRate,
  slipping,
  trends,
} from './insights';
import type { CoreTx } from './types';

let n = 0;
const tx = (o: Partial<CoreTx> & Pick<CoreTx, 'date' | 'amountEur'>): CoreTx => ({
  id: `t${++n}`,
  accountId: 'a',
  kind: 'SPEND',
  categoryId: null,
  merchantKey: null,
  merchantName: null,
  ...o,
});

describe('pacing / budgetPacing', () => {
  it('computes expected-by-today and projection', () => {
    expect(pacing('60.00', '46.20', 14, 31)).toEqual({ expectedByToday: '27.10', projected: '102.30', usedPct: 77 });
  });

  it('flags ACT when over budget, WATCH when projected over by >10%, ignores fixed and on-track lines', () => {
    const drafts = budgetPacing('2026-10-14', [
      { categoryId: 'coffee', name: 'Coffee', amount: '40.00', spent: '46.20', fixed: false },
      { categoryId: 'eat', name: 'Eating out', amount: '180.00', spent: '142.75', fixed: false },
      { categoryId: 'groc', name: 'Groceries', amount: '320.00', spent: '100.00', fixed: false },
      { categoryId: 'rent', name: 'Rent', amount: '1100.00', spent: '1100.00', fixed: true },
    ]);
    expect(drafts.map((d) => [d.fingerprint, d.severity])).toEqual([
      ['budget_over:coffee:2026-10', 'ACT'],
      ['budget_pace:eat:2026-10', 'WATCH'],
    ]);
  });

  it('stays quiet in the first days of the month', () => {
    expect(budgetPacing('2026-10-02', [{ categoryId: 'x', name: 'X', amount: '100.00', spent: '30.00', fixed: false }])).toEqual([]);
  });
});

describe('safeToSpend', () => {
  it('follows (income − bills − savings − flexible spend) ÷ days', () => {
    const r = safeToSpend(
      { income: '3150.00', fixedBillsPaid: '1196.00', remainingFixedBills: '15.60', savingsTarget: '630.00', flexibleSpent: '500.00', daysToPayday: 14 },
      '2026-10-14',
    );
    expect(r.leftToPayday).toBe('808.40');
    expect(r.perDay).toBe('57.74');
    expect(r.draft.severity).toBe('INFO');
  });

  it('goes ACT when negative and never divides by zero', () => {
    const r = safeToSpend({ income: '100.00', remainingFixedBills: '200.00', savingsTarget: '0', flexibleSpent: '0', daysToPayday: 0 }, '2026-10-27');
    expect(r.perDay).toBe('-100.00');
    expect(r.draft.severity).toBe('ACT');
  });
});

describe('detectRecurring', () => {
  const monthly = (key: string, name: string, amounts: string[], start = '2026-06-08') =>
    amounts.map((a, i) =>
      tx({ date: `2026-${String(6 + i).padStart(2, '0')}-${start.slice(8)}`, amountEur: `-${a}`, merchantKey: key, merchantName: name }),
    );

  it('finds a monthly subscription, its next date, and a price rise', () => {
    const txs = monthly('spotify', 'Spotify', ['11.99', '11.99', '11.99', '12.99']);
    const { series, drafts } = detectRecurring(txs, '2026-10-12');
    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({ cadence: 'MONTHLY', expectedAmount: '11.99', lastAmount: '12.99', nextDate: '2026-10-08' });
    expect(drafts.map((d) => d.type)).toEqual(['price_change']);
    expect(drafts[0]!.title).toContain('went up €1.00');
  });

  it('warns about a renewal within three days', () => {
    const txs = monthly('netflix', 'Netflix', ['14.99', '14.99', '14.99', '14.99']);
    const { drafts } = detectRecurring(txs, '2026-10-06');
    expect(drafts.map((d) => d.type)).toContain('renewal_soon');
  });

  it('ignores irregular, variable merchants', () => {
    const txs = [
      tx({ date: '2026-09-01', amountEur: '-12.00', merchantKey: 'tesco', merchantName: 'Tesco' }),
      tx({ date: '2026-09-09', amountEur: '-54.00', merchantKey: 'tesco', merchantName: 'Tesco' }),
      tx({ date: '2026-09-30', amountEur: '-8.00', merchantKey: 'tesco', merchantName: 'Tesco' }),
    ];
    expect(detectRecurring(txs, '2026-10-12').series).toEqual([]);
  });

  it('flags a brand-new subscription', () => {
    const { drafts } = detectRecurring(
      [tx({ date: '2026-10-09', amountEur: '-10.99', merchantKey: 'disneyplus', merchantName: 'Disney+', categoryId: 'subs' })],
      '2026-10-14',
      { subscriptionCategoryId: 'subs' },
    );
    expect(drafts[0]?.type).toBe('new_subscription');
  });
});

describe('leaks', () => {
  it('projects a yearly cost for frequent small spends in a category', () => {
    const txs = Array.from({ length: 10 }, (_, i) =>
      tx({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, amountEur: '-4.20', categoryId: 'coffee', merchantKey: 'bewleys', merchantName: "Bewley's" }),
    );
    const [d] = leaks(txs, '2026-10-14', { coffee: 'Coffee' });
    expect(d?.title).toContain('Coffee: 10 small payments');
    expect(d?.payload['yearly']).toBe('511.00');
    expect(d?.severity).toBe('WATCH');
  });

  it('needs enough payments and ignores big ones', () => {
    const txs = [tx({ date: '2026-10-01', amountEur: '-4.20', categoryId: 'coffee' }), tx({ date: '2026-10-02', amountEur: '-50.00', categoryId: 'coffee' })];
    expect(leaks(txs, '2026-10-14', { coffee: 'Coffee' })).toEqual([]);
  });
});

describe('anomalies', () => {
  it('flags a payment more than 2× the merchant median', () => {
    const history = ['2026-06-08', '2026-07-08', '2026-08-08', '2026-09-08'].map((date) =>
      tx({ date, amountEur: '-37.00', merchantKey: 'electric-ireland', merchantName: 'Electric Ireland' }),
    );
    const now = tx({ date: '2026-10-08', amountEur: '-78.00', merchantKey: 'electric-ireland', merchantName: 'Electric Ireland' });
    const out = anomalies([...history, now], '2026-10-14');
    expect(out).toHaveLength(1);
    expect(out[0]!.title).toBe('Electric Ireland €78.00 is 2.1× your usual €37');
  });

  it('flags a category at more than 2× its monthly average', () => {
    const rows: CoreTx[] = [];
    for (const m of ['07', '08', '09']) rows.push(tx({ date: `2026-${m}-10`, amountEur: '-60.00', categoryId: 'fun' }));
    rows.push(tx({ date: '2026-10-05', amountEur: '-200.00', categoryId: 'fun' }));
    const out = anomalies(rows, '2026-10-14', { fun: 'Fun' });
    expect(out.map((d) => d.type)).toEqual(['anomaly_category']);
  });
});

describe('trends', () => {
  it('flags categories >25% above the 3-month average', () => {
    const rows: CoreTx[] = [];
    for (const m of ['07', '08', '09']) rows.push(tx({ date: `2026-${m}-10`, amountEur: '-100.00', categoryId: 'eat' }));
    rows.push(tx({ date: '2026-10-05', amountEur: '-100.00', categoryId: 'eat' }));
    const out = trends(rows, '2026-10-14', { eat: 'Eating out' });
    expect(out[0]).toMatchObject({ type: 'trend_up', severity: 'WATCH' });
    expect(out[0]!.title).toContain('above your 3-month average');
  });

  it('notes good news when well under, and ignores fixed categories', () => {
    const rows: CoreTx[] = [];
    for (const m of ['07', '08', '09']) rows.push(tx({ date: `2026-${m}-10`, amountEur: '-100.00', categoryId: 'eat' }));
    expect(trends(rows, '2026-10-14', { eat: 'Eating out' })[0]?.type).toBe('trend_down');
    expect(trends(rows, '2026-10-14', { eat: 'Eating out' }, { fixedCategoryIds: ['eat'] })).toEqual([]);
  });
});

describe('slipping', () => {
  const row = (month: string, spent: string) => ({ categoryId: 'g', name: 'Groceries', month, budget: '300.00', spent });
  it('needs 2+ consecutive over-budget months, ACT at 3+', () => {
    expect(slipping([row('2026-09', '350.00'), row('2026-08', '310.00')], '2026-10-14')[0]?.severity).toBe('WATCH');
    expect(slipping([row('2026-09', '350.00'), row('2026-08', '310.00'), row('2026-07', '400.00')], '2026-10-14')[0]?.severity).toBe('ACT');
  });
  it('breaks the streak on a month under budget', () => {
    expect(slipping([row('2026-09', '350.00'), row('2026-08', '200.00'), row('2026-07', '400.00')], '2026-10-14')).toEqual([]);
  });
});

describe('savingsRate', () => {
  it('matches the September example', () => {
    const r = savingsRate({ month: '2026-09', income: '3150.00', spend: '2583.00', target: '630.00' });
    expect(r.ratePct).toBe(18);
    expect(r.targetPct).toBe(20);
    expect(r.shortfall).toBe('63.00');
    expect(r.draft.title).toBe('September savings rate: 18% (target 20%)');
    expect(r.draft.severity).toBe('WATCH');
  });
  it('is ACT when spending exceeds income', () => {
    expect(savingsRate({ month: '2026-09', income: '1000.00', spend: '1200.00', target: '100.00' }).draft.severity).toBe('ACT');
  });
});

describe('cashflowForecast', () => {
  it('projects the balance to payday and warns when negative', () => {
    const f = cashflowForecast({
      today: '2026-10-14',
      nextPayday: '2026-10-28',
      balance: '300.00',
      upcoming: [{ date: '2026-10-20', amount: '-200.00', label: 'Electric Ireland' }],
      avgDailyFlexible: '20.00',
    });
    expect(f.days).toHaveLength(14);
    expect(f.endBalance).toBe('-180.00');
    expect(f.draft?.type).toBe('cashflow_negative');
    expect(f.draft?.severity).toBe('ACT');
  });
  it('is quiet when comfortable and credits income on payday', () => {
    const f = cashflowForecast({
      today: '2026-10-14', nextPayday: '2026-10-16', balance: '1000.00', upcoming: [], avgDailyFlexible: '10.00', expectedIncome: '3000.00',
    });
    expect(f.draft).toBeNull();
    expect(f.endBalance).toBe('3980.00');
  });
});

describe('netWorth', () => {
  it('sums included accounts plus investments', () => {
    expect(
      netWorth(
        [
          { balance: '2184.36', includeInNetWorth: true },
          { balance: '412.80', includeInNetWorth: true },
          { balance: '5000.00', includeInNetWorth: false },
        ],
        '9836.40',
      ),
    ).toBe('12433.56');
  });

  it('rebuilds a monthly series backwards from today', () => {
    const s = netWorthSeries({
      currentMonth: '2026-10',
      months: 3,
      cashNow: '1000.00',
      netByMonth: { '2026-10': '100.00', '2026-09': '-50.00' },
      investmentNow: '500.00',
    });
    expect(s).toEqual([
      { month: '2026-08', value: '1450.00' },
      { month: '2026-09', value: '1400.00' },
      { month: '2026-10', value: '1500.00' },
    ]);
  });
});
