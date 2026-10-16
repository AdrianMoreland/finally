import { describe, expect, it } from 'vitest';
import { freedomMilestones, runwayMonths, yearTable } from './freedom';
import { freedomSim } from './grow';

describe('yearTable', () => {
  const sim = freedomSim({ spend: 30000, withdrawalPct: 4, monthly: 500, returnPct: 5, age: 30, raisePct: 2 });
  const t = yearTable(sim, { startYear: 2026, age: 30, monthly: 500, raisePct: 2 });

  it('steps every five years and ends on the last', () => {
    expect(t.offsets.slice(0, 3)).toEqual([0, 5, 10]);
    expect(t.offsets.at(-1)).toBe(sim.years);
    expect(t.years[0]).toBe(2026);
    expect(t.age[1]).toBe(35);
  });
  it('contributions rise by the raise setting', () => {
    expect(t.put[0]).toBe(0);
    const y2 = 6000 + 6000 * 1.02;
    const row = yearTable(sim, { startYear: 2026, age: 30, monthly: 500, raisePct: 2 });
    expect(row.put[1]).toBeGreaterThan(y2);
    const flat = yearTable(sim, { startYear: 2026, age: 30, monthly: 500, raisePct: 0 });
    expect(flat.put[1]).toBe(30000);
  });
  it('share of enough is capped at 100', () => {
    expect(Math.max(...t.share)).toBeLessThanOrEqual(100);
    expect(t.enough.at(-1)).toBe(sim.p50[sim.years]! >= sim.target);
  });
});

describe('freedomMilestones', () => {
  it('orders by date, numbers from one and adds enough last', () => {
    const ms = freedomMilestones({
      today: '2026-10-16',
      payoffDate: '2027-03-01',
      threeMonthsDate: '2027-09-01',
      sixMonthsDate: null,
      investAccountOpens: '2027-07-01',
      hitYear: 22,
    });
    expect(ms.map((m) => [m.n, m.name])).toEqual([
      [1, 'Everyone paid back'],
      [2, 'Investment Account opens'],
      [3, '3 months saved'],
      [4, '"Enough" in the typical case'],
    ]);
    expect(ms[3]).toMatchObject({ date: null, at: 22 });
    expect(ms[0]!.at).toBeGreaterThan(0.3);
  });
  it('has no enough marker when never reached', () => {
    expect(freedomMilestones({ today: '2026-10-16', payoffDate: null, threeMonthsDate: null, sixMonthsDate: null, investAccountOpens: '2027-07-01', hitYear: -1 })).toHaveLength(1);
  });
});

describe('runwayMonths', () => {
  it('cuts flexible spending only', () => {
    expect(runwayMonths({ pool: '3000', fixedBudget: '1000', flexBudget: '1000', cutPct: 50 })).toEqual({ months: '2.0', need: '1500.00' });
    expect(runwayMonths({ pool: '3000', fixedBudget: '1000', flexBudget: '1000', cutPct: 0 }).months).toBe('1.5');
  });
  it('is zero with nothing to spend', () => {
    expect(runwayMonths({ pool: '3000', fixedBudget: '0', flexBudget: '0', cutPct: 0 }).months).toBe('0.0');
  });
});
