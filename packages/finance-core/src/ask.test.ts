import { describe, expect, it } from 'vitest';
import { answerSpend, followUpQuestion, norm, parseQuestion, previousPeriod, type AskContext, type ParsedQuery } from './ask';
import { budgetSuggestions, monthClose, reviewBudget, weeklyDecisions } from './review';
import { tx } from './testkit';

const ctx: AskContext = {
  today: '2026-10-15',
  lastPayday: '2026-09-25',
  dataStart: '2025-05-01',
  merchants: [
    { key: 'tesco', name: 'Tesco', aliases: ['tesco'] },
    { key: 'freenow', name: 'FreeNow', aliases: ['freenow', 'free now'] },
    { key: 'zed', name: 'Housemate · Zed', aliases: ['zed'], share: true },
  ],
  categories: [],
  people: [{ id: 'dan', name: 'Dan' }],
};
const q = (s: string): ParsedQuery => {
  const r = parseQuestion(s, ctx);
  if (!r || 'unknown' in r) throw new Error(`not understood: ${s}`);
  return r;
};

describe('norm', () => {
  it('drops accents, punctuation and apostrophes', () => {
    expect(norm("¿Cuánto gasté en bares este mes?")).toBe('cuanto gaste en bares este mes');
    expect(norm("What's my 1,234.50 balance?")).toBe('whats my 1234.50 balance');
  });
});

describe('parseQuestion', () => {
  it('reads category, intent and period', () => {
    const r = q('How much did I spend on eating out last month?');
    expect(r).toMatchObject({ intent: 'sum', slug: 'eating-out' });
    expect(r.period).toMatchObject({ from: '2026-09-01', to: '2026-09-30', key: 'lastmonth' });
  });

  it('understands merchants, thresholds and counts', () => {
    expect(q('How many times did I take a FreeNow in September?')).toMatchObject({ intent: 'count', merchantKey: 'freenow' });
    const over = q('coffee over 4 last month');
    expect(over).toMatchObject({ slug: 'coffee', min: 4 });
  });

  it('reads Spanish and French', () => {
    expect(q('¿Cuánto gasté en bares este mes?')).toMatchObject({ intent: 'sum', slug: 'bars', period: { key: 'thismonth' } });
    expect(q('combien en restaurants ce mois')).toMatchObject({ slug: 'eating-out' });
  });

  it('keeps January from last year when asked in October', () => {
    const r = q('how much did I spend in january');
    expect(r.period).toMatchObject({ from: '2026-01-01', to: '2026-01-31' });
    const dec = q('spending in december');
    expect(dec.period).toMatchObject({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('routes non-spending questions', () => {
    expect(q("What's safe to spend today?").intent).toBe('safe');
    expect(q('Who owes me money?').intent).toBe('owed');
    expect(q('what is deemed disposal').intent).toBe('gloss');
    expect(q('Can I afford €300 headphones?')).toMatchObject({ intent: 'afford', amount: 300 });
    expect(q('how much do I owe Dan')).toMatchObject({ intent: 'debt', personId: 'dan' });
    expect(q('compare coffee this month vs last month').intent).toBe('compare');
  });

  it('says it did not understand, with suggestions', () => {
    const r = parseQuestion('blue giraffes', ctx);
    expect(r && 'unknown' in r && r.suggestions.length).toBeGreaterThan(0);
  });

  it('applies a learned phrase', () => {
    const r = parseQuestion('my fix', ctx, { 'my fix': 'coffee this month' });
    expect(r && !('unknown' in r) && r.via).toBe('learned');
  });
});

describe('followUpQuestion', () => {
  it('reuses the last spending question with a new month or category', () => {
    const cur = q('How much did I spend on coffee in August?');
    const f = followUpQuestion('and September?', cur, ctx)!;
    expect(f).toMatchObject({ via: 'follow-up', slug: 'coffee' });
    expect(f.period).toMatchObject({ from: '2026-09-01' });
    expect(followUpQuestion('what about taxis?', cur, ctx)).toMatchObject({ slug: 'taxi', period: { from: '2026-08-01' } });
  });

  it('ignores a long new question', () => {
    expect(followUpQuestion('how much did I spend on rent in the last three months please', q('coffee'), ctx)).toBeNull();
  });
});

describe('previousPeriod', () => {
  it('compares this month with the same days last month', () => {
    const p = previousPeriod({ from: '2026-10-01', to: '2026-10-15', label: 'This month', key: 'thismonth' }, '2026-10-15');
    expect(p).toMatchObject({ from: '2026-09-01', to: '2026-09-15' });
  });
});

const names = { category: (s: string) => s, merchant: (k: string) => (k === 'zed' ? 'Housemate · Zed' : k), shareMerchants: new Set(['zed']) };
const none = (): string[] => [];

describe('answerSpend', () => {
  const txs = [
    tx({ date: '2026-10-02', amount: '-4.50', slug: 'coffee', merchantKey: 'nero', merchantName: 'Nero' }),
    tx({ date: '2026-10-09', amount: '-6.00', slug: 'coffee', merchantKey: 'nero', merchantName: 'Nero' }),
    tx({ date: '2026-09-09', amount: '-3.00', slug: 'coffee', merchantKey: 'nero', merchantName: 'Nero' }),
    tx({ date: '2026-10-08', amount: '-2500', slug: 'rent', merchantKey: 'rent', merchantName: 'Rent' }),
    tx({ date: '2026-10-06', amount: '614', kind: 'SHARE', slug: 'rent', merchantKey: 'zed', merchantName: 'Housemate · Zed' }),
  ];

  it('totals a category for a period and counts payments', () => {
    const a = answerSpend(q('coffee this month'), txs, names, none);
    expect(a.big).toBe('€10.50');
    expect(a.count).toBe(2);
  });

  it('applies the over-amount filter', () => {
    expect(answerSpend(q('coffee over 5 this month'), txs, names, none).big).toBe('€6.00');
  });

  it('compares two periods', () => {
    const a = answerSpend(q('coffee this month vs last month'), txs, names, none);
    expect(a.big).toBe('+€7.50');
    expect(a.text).toContain('€10.50');
  });

  it('leaves rent out of "where does my money go"', () => {
    const a = answerSpend(q('where does my money go'), txs, names, none);
    expect(a.rows?.map((r) => r.label)).toEqual(['coffee']);
  });

  it('answers what a housemate paid from their shares, never as income', () => {
    const a = answerSpend(q('how much has Zed paid me this month'), txs, names, none);
    expect(a.big).toBe('€614.00');
    expect(a.text).toContain("isn't income");
  });

  it('hints at unsorted payments that could change the answer', () => {
    const a = answerSpend(q('coffee this month'), txs, names, () => ['Maxol', 'Maxol', 'ORA']);
    expect(a.hint).toEqual({ count: 3, names: ['Maxol', 'ORA'], slug: 'coffee' });
  });
});

describe('review helpers', () => {
  const spend = (date: string, amount: string, slug: string) => tx({ date, amount, slug, merchantKey: slug, merchantName: slug });
  const history = ['07', '08', '09'].flatMap((m) => [spend(`2026-${m}-05`, '-40', 'coffee'), spend(`2026-${m}-20`, '-60', 'coffee'), spend(`2026-${m}-10`, '-200', 'groceries')]);

  it('suggests budgets from the middle of the last three months, rounded up to the next €5', () => {
    const s = budgetSuggestions([...history, spend('2026-08-12', '-10', 'coffee')], '2026-10-15');
    expect(s['coffee']).toBe('100');
    expect(s['groceries']).toBe('200');
    expect(s['fun']).toBe('5');
  });

  it('finds the line furthest ahead of its usual pace', () => {
    const txs = [...history, spend('2026-10-03', '-95', 'coffee')];
    const { worst } = reviewBudget(txs, { coffee: '100', groceries: '300' }, '2026-10-15');
    expect(worst?.slug).toBe('coffee');
    const d = weeklyDecisions(worst, { slug: 'groceries', spent: '0', budget: '300', projected: '100' }, { coffee: 'Coffee', groceries: 'Groceries' });
    expect(d.map((x) => x.value.split('|')[0])).toEqual(['move', 'ease', 'keep']);
  });

  it('summarises a month and offers one change', () => {
    const txs = [
      tx({ date: '2026-09-25', amount: '2400', kind: 'INCOME', slug: 'income' }),
      ...history.filter((t) => t.date.startsWith('2026-09')),
      spend('2026-09-15', '-80', 'coffee'),
    ];
    const m = monthClose(txs, '2026-09', { coffee: '100', groceries: '250' }, '0', { coffee: 'Coffee', groceries: 'Groceries' });
    expect(m.cameIn).toBe('2400.00');
    expect(m.spent).toBe('380.00');
    expect(m.kept).toBe('2020.00');
    expect(m.options.at(-1)?.value).toBe('none');
    expect(m.options[0]?.value).toBe('raise|coffee|80');
  });
});
