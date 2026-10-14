import { describe, expect, it } from 'vitest';
import { compoundGrowth, convertCurrency, emergencyFund, fireNumber, loanPayoff } from './calculators';
import { computeHoldings, portfolioValueOn } from './holdings';
import { D, m2, median, q8, sum } from './decimal';
import { addDays, addMonths, addMonthsToDate, daysInMonth, diffDays, dublinDate, lastPayday, nextPayday } from './dates';

describe('decimal helpers', () => {
  it('has no float drift', () => {
    expect(m2(D('0.1').plus('0.2'))).toBe('0.30');
    expect(sum(['0.1', '0.2', '0.3']).toString()).toBe('0.6');
    expect(m2('1.005')).toBe('1.01'); // half-up
    expect(q8('1.50000000')).toBe('1.5');
    expect(median(['3', '1', '2']).toString()).toBe('2');
  });
});

describe('dates', () => {
  it('handles month maths and Dublin dates', () => {
    expect(daysInMonth('2028-02')).toBe(29);
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonthsToDate('2026-01-31', 1)).toBe('2026-02-28');
    expect(diffDays('2026-10-14', '2026-10-28')).toBe(14);
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(dublinDate('2026-07-01T23:30:00Z')).toBe('2026-07-02'); // BST is UTC+1
    expect(dublinDate('2026-01-15T23:30:00Z')).toBe('2026-01-15'); // GMT
  });
  it('finds paydays', () => {
    expect(nextPayday('2026-10-14', 28)).toBe('2026-10-28');
    expect(nextPayday('2026-10-29', 28)).toBe('2026-11-28');
    expect(lastPayday('2026-10-14', 28)).toBe('2026-09-28');
    expect(nextPayday('2026-02-10', 31)).toBe('2026-02-28');
  });
});

describe('compoundGrowth', () => {
  it('compounds an initial sum at the annual rate', () => {
    const r = compoundGrowth('10000', '0', 7, 10);
    expect(r.finalValue).toBe('19671.51'); // 10000 × 1.07^10
    expect(r.growth).toBe('9671.51');
    expect(r.series).toHaveLength(11);
  });
  it('adds monthly contributions', () => {
    const r = compoundGrowth('0', '100', 0, 1);
    expect(r.finalValue).toBe('1200.00');
    expect(r.contributed).toBe('1200.00');
  });
});

describe('emergencyFund / fireNumber', () => {
  it('uses actual essential spend', () => {
    const r = emergencyFund(['2000', '2200', '2100'], '4200');
    expect(r).toMatchObject({ monthlyEssential: '2100.00', months3: '6300.00', months6: '12600.00', coverageMonths: 2 });
  });
  it('FIRE number = annual spend ÷ withdrawal rate', () => {
    const r = fireNumber('30000', 4, '100000', '1000', 5);
    expect(r.fireNumber).toBe('750000.00');
    expect(r.progressPct).toBe(13.3);
    expect(r.yearsToFire).toBeGreaterThan(10);
    expect(fireNumber('30000', 4, '1000000').yearsToFire).toBe(0);
  });
});

describe('loanPayoff', () => {
  it('computes the standard repayment', () => {
    const r = loanPayoff('300000', 4, 30);
    expect(r.monthlyPayment).toBe('1432.25');
    expect(r.months).toBe(360);
    expect(Number(r.totalInterest)).toBeCloseTo(215608, -2);
  });
  it('overpaying saves interest and months', () => {
    const r = loanPayoff('300000', 4, 30, '200');
    expect(r.withOverpayment.monthsSaved).toBeGreaterThan(60);
    expect(Number(r.withOverpayment.interestSaved)).toBeGreaterThan(40000);
  });
  it('handles a zero rate', () => {
    expect(loanPayoff('12000', 0, 1).monthlyPayment).toBe('1000.00');
  });
});

describe('convertCurrency', () => {
  it('crosses through EUR', () => {
    const rates = { USD: '1.10', GBP: '0.85' };
    expect(convertCurrency('100', 'EUR', 'USD', rates).converted).toBe('110.00');
    expect(convertCurrency('110', 'USD', 'EUR', rates).converted).toBe('100.00');
    expect(convertCurrency('100', 'USD', 'GBP', rates).converted).toBe('77.27');
    expect(() => convertCurrency('1', 'EUR', 'XXX', rates)).toThrow();
  });
});

describe('computeHoldings', () => {
  const inst = [
    { id: 'v', symbol: 'VWCE', name: 'Vanguard' },
    { id: 'e', symbol: 'EIMI', name: 'iShares' },
  ];
  const lots = [
    { id: '1', instrumentId: 'v', acquiredAt: '2024-03-12', quantity: '20', unitCost: '112.10', fees: '0', soldAt: null, soldPrice: null },
    { id: '2', instrumentId: 'v', acquiredAt: '2025-06-03', quantity: '12', unitCost: '121.30', fees: '1.00', soldAt: null, soldPrice: null },
    { id: '3', instrumentId: 'e', acquiredAt: '2025-01-15', quantity: '60', unitCost: '29.40', fees: '0', soldAt: null, soldPrice: null },
    { id: '4', instrumentId: 'e', acquiredAt: '2024-01-15', quantity: '5', unitCost: '25', fees: '0', soldAt: '2025-01-01', soldPrice: '28' },
  ];
  it('aggregates open lots with value, cost, gain and share', () => {
    const p = computeHoldings(inst, lots, { v: '136.20', e: '31.10' });
    const v = p.holdings.find((h) => h.symbol === 'VWCE')!;
    expect(v).toMatchObject({ quantity: '32', cost: '3698.60', value: '4358.40', gain: '659.80' });
    expect(p.holdings.find((h) => h.symbol === 'EIMI')).toMatchObject({ quantity: '60', value: '1866.00' });
    expect(p.total).toBe('6224.40');
    expect(p.holdings.reduce((a, h) => a + h.share, 0)).toBeCloseTo(100, 1);
  });
  it('values the portfolio on a past date from lots held then', () => {
    expect(portfolioValueOn('2024-12-31', lots, () => '10')).toBe('250.00'); // lot 1 (20) + lot 4 (5)
  });
});
