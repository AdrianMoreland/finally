import { describe, expect, it } from 'vitest';
import {
  ASK_GROUP_BUTTONS,
  answerCategoriseBody,
  askCategoryId,
  budgetsQuery,
  createPotBody,
  resolvePrefs,
  completeSetupBody,
  createRuleBody,
  listTransactionsQuery,
  money,
  moneyInput,
  monthKey,
  startConnectionBody,
  upsertBudgetBody,
} from './index';

describe('money schemas', () => {
  it('output money is always 2dp, input accepts 0-2dp', () => {
    expect(money.safeParse('12.50').success).toBe(true);
    expect(money.safeParse('-4.20').success).toBe(true);
    expect(money.safeParse('12.5').success).toBe(false);
    expect(money.safeParse(12.5).success).toBe(false);
    for (const ok of ['12', '12.5', '-0.01', '1234567.89']) expect(moneyInput.safeParse(ok).success).toBe(true);
    for (const bad of ['12.345', '1e3', '', 'abc', '--1', '12,50']) expect(moneyInput.safeParse(bad).success).toBe(false);
  });

  it('month keys are YYYY-MM', () => {
    expect(monthKey.safeParse('2026-10').success).toBe(true);
    expect(monthKey.safeParse('2026-13').success).toBe(false);
    expect(monthKey.safeParse('2026-1').success).toBe(false);
  });
});

describe('request bodies', () => {
  it('answering a request needs a scope of merchant or once', () => {
    expect(answerCategoriseBody.parse({ categoryId: 'c1', scope: 'merchant' })).toEqual({ categoryId: 'c1', scope: 'merchant' });
    expect(answerCategoriseBody.safeParse({ categoryId: 'c1', scope: 'always' }).success).toBe(false);
    expect(answerCategoriseBody.safeParse({ scope: 'once' }).success).toBe(false);
  });

  it('applies defaults', () => {
    expect(createRuleBody.parse({ matchType: 'EXACT', pattern: 'tesco', categoryId: 'c' }).priority).toBe(100);
    expect(startConnectionBody.parse({ institution: 'AIB' }).returnTo).toBe('web');
    expect(createPotBody.parse({ name: 'Trip', type: 'PLANNED', target: '1500', targetDate: '2027-06-01' })).toMatchObject({ accountId: null, monthly: '0.00', balance: '0.00' });
    expect(upsertBudgetBody.parse({ categoryId: 'c', month: '2026-10', amount: '50' }).rollover).toBe(false);
  });

  it('coerces and bounds query strings', () => {
    expect(listTransactionsQuery.parse({ limit: '25' }).limit).toBe(25);
    expect(listTransactionsQuery.parse({}).limit).toBe(50);
    expect(listTransactionsQuery.safeParse({ limit: '1000' }).success).toBe(false);
    expect(budgetsQuery.safeParse({ month: 'October' }).success).toBe(false);
  });
});

describe('notification buttons', () => {
  it('has three buttons for every group except OTHER', () => {
    for (const [group, slugs] of Object.entries(ASK_GROUP_BUTTONS)) expect(slugs).toHaveLength(group === 'OTHER' ? 0 : 3);
    expect(askCategoryId('FOOD')).toBe('ask_food');
    expect(ASK_GROUP_BUTTONS.FOOD).toEqual(['coffee', 'eating-out', 'groceries']);
  });
});

describe('user prefs', () => {
  it('fills every default when nothing is stored', () => {
    const p = resolvePrefs(null);
    expect(p.notif).toEqual({ weekly: true, quiet: true, ask: true });
    expect(p.tax.gross).toBe(40000);
    expect(p.bonus.allocation.rainy).toBe(4000);
    expect(p.investing.mix['world']).toBe(60);
    expect(p.payback.order).toBe('smallest');
    expect(p.paper.cash).toBe(5000);
  });

  it('keeps what is stored and repairs what is damaged', () => {
    const p = resolvePrefs({ tax: { gross: 52000, year: 'soon' }, bonus: 'oops', payback: { monthly: 120 } });
    expect(p.tax.gross).toBe(52000);
    expect(p.tax.year).toBe(2026);
    expect(p.bonus.pct).toBe(100);
    expect(p.payback.monthly).toBe(120);
  });
});

describe('setup', () => {
  it('needs a payday and a buffer, and defaults the lists', () => {
    const r = completeSetupBody.parse({ paydayDayOfMonth: 25, buffer: '150', budgets: { groceries: '300' } });
    expect(r.people).toEqual([]);
    expect(r.pots).toEqual([]);
    expect(completeSetupBody.safeParse({ buffer: '150', budgets: {} }).success).toBe(false);
  });
});
