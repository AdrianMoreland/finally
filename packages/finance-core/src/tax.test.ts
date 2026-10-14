import { describe, expect, it } from 'vitest';
import { cgtOn, deemedDisposals, exitTaxOn, investmentAccountCharge, ruleOn, whereShouldItGo, type CoreTaxRule } from './tax';

export const rules: CoreTaxRule[] = [
  { regime: 'EXIT_TAX', rate: '0.4100', annualExemption: null, threshold: null, contributionCap: null, effectiveFrom: '1900-01-01', effectiveTo: '2025-12-31' },
  { regime: 'EXIT_TAX', rate: '0.3800', annualExemption: null, threshold: null, contributionCap: null, effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31' },
  { regime: 'EXIT_TAX', rate: '0.3500', annualExemption: null, threshold: null, contributionCap: null, effectiveFrom: '2027-01-01', effectiveTo: null },
  { regime: 'CGT', rate: '0.3300', annualExemption: '1270.00', threshold: null, contributionCap: null, effectiveFrom: '1900-01-01', effectiveTo: '2026-10-06' },
  { regime: 'CGT', rate: '0.3100', annualExemption: '1270.00', threshold: null, contributionCap: null, effectiveFrom: '2026-10-07', effectiveTo: null },
  { regime: 'INVESTMENT_ACCOUNT', rate: '0.0100', annualExemption: null, threshold: '50000.00', contributionCap: '12000.00', effectiveFrom: '2027-07-01', effectiveTo: null },
];

describe('ruleOn', () => {
  it('picks the rule in force on each side of the change dates', () => {
    expect(ruleOn(rules, 'EXIT_TAX', '2025-12-31')?.rate).toBe('0.4100');
    expect(ruleOn(rules, 'EXIT_TAX', '2026-01-01')?.rate).toBe('0.3800');
    expect(ruleOn(rules, 'EXIT_TAX', '2026-12-31')?.rate).toBe('0.3800');
    expect(ruleOn(rules, 'EXIT_TAX', '2027-01-01')?.rate).toBe('0.3500');
    expect(ruleOn(rules, 'CGT', '2026-10-06')?.rate).toBe('0.3300');
    expect(ruleOn(rules, 'CGT', '2026-10-07')?.rate).toBe('0.3100');
    expect(ruleOn(rules, 'INVESTMENT_ACCOUNT', '2027-06-30')).toBeNull();
  });
});

describe('exitTaxOn / cgtOn', () => {
  it('applies the rate for the date and never taxes losses', () => {
    expect(exitTaxOn('1000.00', rules, '2026-10-14')).toBe('380.00');
    expect(exitTaxOn('1000.00', rules, '2027-02-01')).toBe('350.00');
    expect(exitTaxOn('-500.00', rules, '2026-10-14')).toBe('0.00');
  });

  it('CGT applies the €1,270 annual exemption and the 31% rate from 7 Oct 2026', () => {
    expect(cgtOn('3270.00', rules, '2026-10-14')).toBe('620.00'); // (3270 − 1270) × 31%
    expect(cgtOn('3270.00', rules, '2026-10-06')).toBe('660.00'); // × 33%
    expect(cgtOn('1000.00', rules, '2026-10-14')).toBe('0.00');
    expect(cgtOn('3270.00', rules, '2026-10-14', '0')).toBe('1013.70'); // exemption already used
  });
});

describe('investmentAccountCharge', () => {
  it('charges 1% on the average value above €50,000 and nothing before the start date', () => {
    expect(investmentAccountCharge('80000.00', rules, '2028-01-01')).toBe('300.00');
    expect(investmentAccountCharge('40000.00', rules, '2028-01-01')).toBe('0.00');
    expect(investmentAccountCharge('80000.00', rules, '2027-06-30')).toBe('0.00');
  });
});

describe('deemedDisposals', () => {
  it('lists 8-year anniversaries with an estimate at today\'s price', () => {
    const [first, second] = deemedDisposals(
      { lotId: 'l1', acquiredAt: '2024-03-12', quantity: '20', unitCost: '112.10', fees: '0', price: '136.20' },
      rules,
      '2026-10-14',
    );
    expect(first).toMatchObject({ n: 1, date: '2032-03-12', estimatedGain: '482.00', rate: '0.3500' });
    expect(first!.estimatedTax).toBe('168.70');
    expect(first!.daysAway).toBeGreaterThan(1900);
    expect(second).toMatchObject({ n: 2, date: '2040-03-12', estimatedTax: '0.00' });
  });
});

describe('whereShouldItGo', () => {
  const base = { amount: '10000.00', annualReturnPct: 6, startDate: '2027-08-01', rules };

  it('compares the three wrappers and flags the best after-tax result', () => {
    const r = whereShouldItGo({ ...base, years: 10 });
    expect(r.options.map((o) => o.key)).toEqual(['BROKER_ETF', 'INVESTMENT_ACCOUNT', 'SHARES']);
    const ia = r.options.find((o) => o.key === 'INVESTMENT_ACCOUNT')!;
    const etf = r.options.find((o) => o.key === 'BROKER_ETF')!;
    // Below the €50,000 threshold the Investment Account is untaxed, so it beats an ETF paying exit tax.
    expect(Number(ia.afterTaxValue)).toBeGreaterThan(Number(etf.afterTaxValue));
    expect(ia.taxEstimate).toBe('0.00');
    expect(r.best).toBe('INVESTMENT_ACCOUNT');
  });

  it('models an 8-year deemed disposal in the ETF option', () => {
    const short = whereShouldItGo({ ...base, years: 7 }).options[0]!;
    const long = whereShouldItGo({ ...base, years: 9 }).options[0]!;
    expect(long.notes[0]).toContain('1 within this period');
    expect(Number(long.taxEstimate)).toBeGreaterThan(Number(short.taxEstimate));
  });

  it('puts only the cap into the Investment Account and models the rest as an ETF', () => {
    const r = whereShouldItGo({ ...base, amount: '20000.00', years: 5 });
    const ia = r.options.find((o) => o.key === 'INVESTMENT_ACCOUNT')!;
    expect(ia.notes.join(' ')).toContain('Contribution cap');
    expect(Number(ia.taxEstimate)).toBeGreaterThan(0);
  });

  it('shares: one CGT event with the annual exemption', () => {
    const r = whereShouldItGo({ ...base, years: 10 });
    const shares = r.options.find((o) => o.key === 'SHARES')!;
    const gross = Number(shares.grossValue);
    expect(Number(shares.taxEstimate)).toBeCloseTo(((gross - 10000 - 1270) * 0.31), 1);
  });
});
