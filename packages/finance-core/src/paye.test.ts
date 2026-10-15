import { describe, expect, it } from 'vitest';
import { bonusCalc, bonusScenarios, expectedNet, grossFor, incomeTax, payslipVerdict, previousRentCredit, takeHome, usc } from './paye';

describe('PAYE 2026 on €40,000', () => {
  it('matches the hand calculation', () => {
    expect(Math.round(incomeTax(40000, 2026))).toBe(4000); // 20% of 40,000 less 4,000 credits
    expect(Math.round(usc(40000, 2026))).toBe(733);
    const th = takeHome(40000, 2026);
    expect(Math.round(th.net / 12)).toBe(2798);
  });

  it('is nothing below the USC exemption', () => {
    expect(usc(12000, 2026)).toBe(0);
  });

  it('takes the 40% rate only above the band', () => {
    expect(Math.round(incomeTax(54000, 2026) - incomeTax(44000, 2026))).toBe(4000);
  });
});

describe('bonus', () => {
  it('nets a full bonus after tax, USC and PRSI', () => {
    const b = bonusCalc({ salary: 40000, target: 13200, pct: 100, year: 2026, pension: 0 });
    expect(Math.round(b.gross)).toBe(13200);
    expect(b.netWithoutPension).toBeLessThan(b.gross * 0.6);
    expect(b.aboveBand).toBe(9200);
  });

  it('gives pension relief at the top rate, capped at 20% of pay', () => {
    const none = bonusCalc({ salary: 40000, target: 13200, pct: 100, year: 2026, pension: 0 });
    const some = bonusCalc({ salary: 40000, target: 13200, pct: 100, year: 2026, pension: 5000 });
    expect(some.taxWith).toBeLessThan(none.taxWithout);
    expect(bonusCalc({ salary: 40000, target: 13200, pct: 100, year: 2026, pension: 99999 }).pension).toBeLessThanOrEqual(some.cap);
  });

  it('shows the size of the bet at 0, 50 and 100%', () => {
    expect(bonusScenarios(40000, 13200, 2026).map((s) => s.pct)).toEqual([0, 50, 100]);
    expect(bonusScenarios(40000, 13200, 2026)[0]!.net).toBe(0);
  });
});

describe('pay checker', () => {
  it('uses the lower PRSI rate before 1 October 2026', () => {
    expect(expectedNet(40000, '2026-09-25').net).toBeGreaterThan(expectedNet(40000, '2026-10-23').net);
  });

  it('accepts a normal month and flags a short one', () => {
    const e = expectedNet(40000, '2026-08-25').net;
    expect(payslipVerdict({ net: e, first: false, salary: 40000, onDate: '2026-08-25', nextPayday: '23 Oct' }).needsAttention).toBe(false);
    expect(payslipVerdict({ net: e - 80, first: false, salary: 40000, onDate: '2026-08-25', nextPayday: '23 Oct' }).needsAttention).toBe(true);
  });

  it('works backwards from take-home to gross', () => {
    const net = takeHome(40000, 2026).net / 12;
    expect(Math.abs(grossFor(net) - 40000)).toBeLessThan(600);
  });
});

describe('previous rent credit', () => {
  it('adds the years from the tenancy start, and never assumes years you did not rent', () => {
    expect(previousRentCredit('2025-05', 2026)).toBe(1000);
    expect(previousRentCredit('2023-01', 2026)).toBe(750 + 1000 + 1000);
    expect(previousRentCredit(null, 2026)).toBe(0);
  });
});
