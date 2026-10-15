import { describe, expect, it } from 'vitest';
import { D } from './decimal';
import { freedomSim, moneyLadder, wrapperSim } from './grow';
import { orderState, payoffPlan, potReach, potStatus, type PayCalendar, type PotCore } from './pots';

const cal: PayCalendar = { today: '2026-10-15', paydayDay: 25, weekendShift: true };
const pot = (p: Partial<PotCore>): PotCore => ({ id: 'p', name: 'Pot', type: 'PLANNED', balance: '0', target: '1200', targetDate: '2027-06-30', monthly: '100', ...p });

describe('pots', () => {
  it('counts paydays to a target, with the weekend shift', () => {
    const r = potReach(pot({ balance: '200' }), D(1200), cal);
    expect(r).toEqual({ k: 10, date: '2027-07-23' }); // 25 Jul 2027 is a Sunday, so the Friday before
  });

  it('says reached, or that nothing is going in', () => {
    expect(potReach(pot({ balance: '1500' }), D(1200), cal)).toEqual({ reached: true });
    expect(potReach(pot({ monthly: '0' }), D(1200), cal)).toEqual({ never: true });
  });

  it('flags a planned pot that lands after its date and says what would fix it', () => {
    const s = potStatus(pot({ balance: '0', monthly: '100' }), cal)!;
    expect(s.late).toBe(true);
    expect(s.paydaysLeft).toBe(9); // 23 Oct 2026 ... 25 Jun 2027
    expect(s.need).toBe('133.33');
    expect(s.shortfall).toBe('300.00');
  });

  it('only planned pots have a date to hit', () => {
    expect(potStatus(pot({ type: 'TREAT' }), cal)).toBeNull();
  });
});

describe('payoffPlan', () => {
  const debts = [
    { id: 'a', name: 'Mum', left: '300' },
    { id: 'b', name: 'Dan', left: '100' },
  ];
  it('pays the smallest first and rolls the rest over', () => {
    const p = payoffPlan(debts, '150', 'smallest', [], cal);
    expect(p.order).toEqual(['b', 'a']);
    expect(p.first).toEqual({ b: '100.00', a: '50.00' });
    expect(p.freeDate).toBe(p.done['a']);
    expect(p.series.at(-1)?.left).toBe('0.00');
  });

  it('adds a one-off to the payday in that month', () => {
    const slow = payoffPlan(debts, '50', 'smallest', [], cal);
    const fast = payoffPlan(debts, '50', 'smallest', [], cal, { month: '2026-12', amount: '250' });
    expect(fast.freeDate! < slow.freeDate!).toBe(true);
  });

  it('has no date when nothing is going in', () => {
    expect(payoffPlan(debts, '0', 'smallest', [], cal).freeDate).toBeNull();
  });
});

describe('orderState', () => {
  it('tells missing, changed and ok apart', () => {
    expect(orderState('100', null)).toBe('missing');
    expect(orderState('100', '90')).toBe('changed');
    expect(orderState('100', '100.20')).toBe('ok');
  });
});

describe('moneyLadder', () => {
  it('puts you on the first rung that is not done, with a date for each', () => {
    const { rungs, current } = moneyLadder({
      cal,
      safetyPot: pot({ id: 'r', type: 'SAFETY', balance: '1200', target: null, monthly: '100' }),
      essentialsPerMonth: '1000',
      totalOwed: '0',
      debtMonthly: '0',
      payoffFree: null,
      freedomTarget: 1_000_000,
      freedomHitYear: 25,
      age: 30,
      investAccountOpens: '2027-07-01',
    });
    expect(rungs.slice(0, 3).every((r) => r.done)).toBe(true); // nothing owed, €1,000 reached
    expect(rungs[current]!.key).toBe('three');
    expect(rungs[3]!.when).toBe('24 Mar 2028'); // €1,800 more at 100 a month is 18 paydays
    expect(rungs.at(-1)!.when).toBe('around age 55');
  });
});

describe('freedomSim', () => {
  it('is repeatable and reaches the target sooner with more saved', () => {
    const f = { spend: 30000, withdrawalPct: 4, monthly: 500, returnPct: 5, age: 30, raisePct: 2 };
    expect(freedomSim(f).p50).toEqual(freedomSim(f).p50);
    expect(freedomSim(f).target).toBe(750000);
    const more = freedomSim({ ...f, monthly: 1500 });
    expect(more.hitYear).toBeLessThan(freedomSim(f).hitYear === -1 ? 99 : freedomSim(f).hitYear);
  });
});

describe('wrapperSim', () => {
  it('has the Investment Account ahead of an ETF with deemed disposal over a long horizon', () => {
    const r = wrapperSim(200, 20, 0.06, 0.22, 0.15);
    expect(r.ia).toBeGreaterThan(r.etf);
    expect(r.paid).toBe(48000);
    expect(r.capped).toBe(false);
  });
  it('caps contributions to the Investment Account at €12,000 a year', () => {
    expect(wrapperSim(1500, 5, 0.06, 0.22, 0).capped).toBe(true);
  });
});
