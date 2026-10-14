import { describe, expect, it } from 'vitest';
import {
  ASK_GROUP_BUTTONS,
  answerCategoriseBody,
  askCategoryId,
  budgetsQuery,
  createGoalBody,
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
    expect(createGoalBody.parse({ name: 'Trip', target: '1500', targetDate: '2027-06-01' })).toMatchObject({ accountId: null, saved: '0.00' });
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
