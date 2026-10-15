import { describe, expect, it } from 'vitest';
import { detectRepeating, doubleCharges, upcomingBills } from './repeating';
import { tx } from './testkit';

const sub = (date: string, amount: string, key = 'spotify', name = 'Spotify') =>
  tx({ date, amount, merchantKey: key, merchantName: name, slug: 'subscriptions', parentSlug: null });

describe('detectRepeating', () => {
  const today = '2026-09-08';
  const last3 = ['2026-06', '2026-07', '2026-08'];

  it('finds a monthly subscription and its next date', () => {
    const txs = ['2026-05-03', '2026-06-03', '2026-07-03', '2026-08-03'].map((d) => sub(d, '-12.99'));
    const [r] = detectRepeating(txs, today, last3);
    expect(r?.cadence).toBe('monthly');
    expect(r?.amount).toBe('12.99');
    expect(r?.nextDate).toBe('2026-09-03');
    expect(r?.usualDay).toBe(3);
  });

  it('flags a price rise that stuck', () => {
    const txs = [sub('2026-05-03', '-11.99'), sub('2026-06-03', '-11.99'), sub('2026-07-03', '-12.99'), sub('2026-08-03', '-12.99')];
    const [r] = detectRepeating(txs, today, last3);
    expect(r?.rise).toEqual({ from: '11.99', to: '12.99', since: '2026-07-03' });
    expect(r?.varies).toBe(false);
  });

  it('splits one merchant that bills several things by amount', () => {
    const apple = (d: string, a: string) => tx({ date: d, amount: a, merchantKey: 'apple', merchantName: 'Apple', slug: 'subscriptions' });
    const txs = ['05', '06', '07', '08'].flatMap((m) => [apple(`2026-${m}-02`, '-9.99'), apple(`2026-${m}-18`, '-13.99')]);
    const found = detectRepeating(txs, today, last3);
    expect(found.map((f) => f.amount).sort()).toEqual(['13.99', '9.99']);
  });

  it('ignores one-offs and anything that has not paid for months', () => {
    const stale = ['2026-01-03', '2026-02-03', '2026-03-03'].map((d) => sub(d, '-5', 'old', 'Old'));
    const once = [sub('2026-08-03', '-30', 'once', 'Once')];
    expect(detectRepeating([...stale, ...once], today, last3)).toEqual([]);
  });

  it('skips bounced payments', () => {
    const txs = [sub('2026-06-03', '-10'), sub('2026-07-03', '-10'), { ...sub('2026-08-03', '-10'), flag: 'bounced' }];
    expect(detectRepeating(txs, today, last3)).toEqual([]);
  });
});

describe('rent', () => {
  it('is one repeating payment even when the payee text changes', () => {
    const rent = (date: string, key: string) => tx({ date, amount: '-2500', merchantKey: key, merchantName: key, slug: 'rent' });
    const txs = [rent('2026-06-15', 'mobi-rent'), rent('2026-07-20', 'mobi-rent'), rent('2026-08-17', 'mobi-rent'), rent('2026-09-08', 'rent'), rent('2026-10-08', 'rent')];
    const [r] = detectRepeating(txs, '2026-10-15', ['2026-07', '2026-08', '2026-09']);
    expect(r).toMatchObject({ id: 'rent', name: 'Rent', count: 5, usualDay: 8, nextDate: '2026-11-08' });
  });
});

describe('upcomingBills', () => {
  it('rolls each bill forward past today and drops cancelled ones', () => {
    const txs = ['2026-06-21', '2026-07-21', '2026-08-21'].map((d) => tx({ date: d, amount: '-72.50', merchantKey: 'virgin', merchantName: 'Virgin Media', slug: 'bills' }));
    const rep = detectRepeating(txs, '2026-09-08', ['2026-06', '2026-07', '2026-08']);
    expect(upcomingBills(rep, '2026-09-08')[0]).toMatchObject({ name: 'Virgin Media', date: '2026-09-21', amount: '72.50' });
    expect(upcomingBills(rep, '2026-09-08', new Set(['virgin']))).toEqual([]);
  });
});

describe('doubleCharges', () => {
  it('finds the same amount at the same merchant on the same day, but not rounds of coffee', () => {
    const e = (slug: string) => [
      tx({ date: '2026-09-02', amount: '-40.37', merchantKey: 'europcar', merchantName: 'Europcar', slug }),
      tx({ date: '2026-09-02', amount: '-40.37', merchantKey: 'europcar', merchantName: 'Europcar', slug }),
    ];
    expect(doubleCharges(e('travel'), '2026-09-08')).toHaveLength(1);
    expect(doubleCharges(e('coffee'), '2026-09-08')).toHaveLength(0);
  });
});
