import type { Decimal} from './decimal';
import { D, m2, mean, ZERO, type Num } from './decimal';

/** Monthly rate equivalent to an annual return compounding yearly. */
const monthlyRate = (annualPct: Num): Decimal =>
  D(1).plus(D(annualPct).div(100)).pow(D(1).div(12)).minus(1);

export interface CompoundResult {
  finalValue: string;
  contributed: string;
  growth: string;
  series: Array<{ year: number; value: string; contributed: string }>;
}

/** Contributions are added at the end of each month. */
export function compoundGrowth(initial: string, monthly: string, annualReturnPct: number, years: number): CompoundResult {
  const r = monthlyRate(annualReturnPct);
  let value = D(initial);
  let contributed = D(initial);
  const series: CompoundResult['series'] = [{ year: 0, value: m2(value), contributed: m2(contributed) }];
  for (let month = 1; month <= years * 12; month++) {
    value = value.times(r.plus(1)).plus(monthly);
    contributed = contributed.plus(monthly);
    if (month % 12 === 0) series.push({ year: month / 12, value: m2(value), contributed: m2(contributed) });
  }
  return { finalValue: m2(value), contributed: m2(contributed), growth: m2(value.minus(contributed)), series };
}

export interface EmergencyFund {
  monthlyEssential: string;
  months3: string;
  months6: string;
  saved: string;
  coverageMonths: number;
  basedOnMonths: number;
}

/** `essentialSpendByMonth` = actual essential spend (rent, bills, groceries, transport, health…) per month. */
export function emergencyFund(essentialSpendByMonth: readonly string[], saved: string): EmergencyFund {
  const monthly = mean(essentialSpendByMonth);
  return {
    monthlyEssential: m2(monthly),
    months3: m2(monthly.times(3)),
    months6: m2(monthly.times(6)),
    saved: m2(saved),
    coverageMonths: monthly.isZero() ? 0 : D(saved).div(monthly).toDecimalPlaces(1).toNumber(),
    basedOnMonths: essentialSpendByMonth.length,
  };
}

export interface FireResult {
  fireNumber: string;
  progressPct: number;
  yearsToFire: number | null;
}

export function fireNumber(
  annualSpend: string,
  withdrawalRatePct: number,
  currentPortfolio = '0',
  monthlyContribution = '0',
  annualReturnPct = 5,
): FireResult {
  const target = D(annualSpend).div(D(withdrawalRatePct).div(100));
  let value = D(currentPortfolio);
  const progress = target.isZero() ? 100 : value.div(target).times(100).toDecimalPlaces(1).toNumber();
  let months = 0;
  const r = monthlyRate(annualReturnPct);
  while (value.lt(target) && months < 12 * 100) {
    value = value.times(r.plus(1)).plus(monthlyContribution);
    months++;
  }
  return {
    fireNumber: m2(target),
    progressPct: progress,
    yearsToFire: value.gte(target) ? Number((months / 12).toFixed(1)) : null,
  };
}

export interface LoanResult {
  monthlyPayment: string;
  totalInterest: string;
  months: number;
  withOverpayment: {
    monthlyPayment: string;
    totalInterest: string;
    months: number;
    interestSaved: string;
    monthsSaved: number;
  };
}

function amortise(principal: Decimal, monthlyRatePct: Decimal, payment: Decimal): { months: number; interest: Decimal } {
  let bal = principal;
  let interest = ZERO;
  let months = 0;
  while (bal.gt(0) && months < 1200) {
    const i = bal.times(monthlyRatePct);
    if (payment.lte(i)) return { months: 1200, interest: interest.plus(i.times(1200 - months)) };
    interest = interest.plus(i);
    bal = bal.plus(i).minus(payment);
    if (bal.lt(0)) bal = ZERO;
    months++;
  }
  return { months, interest };
}

export function loanPayoff(principal: string, annualRatePct: number, termYears: number, monthlyOverpayment = '0'): LoanResult {
  const n = Math.round(termYears * 12);
  const i = D(annualRatePct).div(100).div(12);
  const p = D(principal);
  const payment = i.isZero() ? p.div(n) : p.times(i).div(D(1).minus(D(1).plus(i).pow(-n)));
  const base = amortise(p, i, payment);
  const over = amortise(p, i, payment.plus(monthlyOverpayment));
  return {
    monthlyPayment: m2(payment),
    totalInterest: m2(base.interest),
    months: base.months,
    withOverpayment: {
      monthlyPayment: m2(payment.plus(monthlyOverpayment)),
      totalInterest: m2(over.interest),
      months: over.months,
      interestSaved: m2(base.interest.minus(over.interest)),
      monthsSaved: base.months - over.months,
    },
  };
}

/** Convert using a rate table quoted as units of currency per 1 EUR (ECB reference style). */
export function convertCurrency(
  amount: string,
  from: string,
  to: string,
  eurRates: Readonly<Record<string, string>>,
): { rate: string; converted: string } {
  const per = (ccy: string): Decimal => (ccy === 'EUR' ? D(1) : D(eurRates[ccy] ?? NaN));
  const f = per(from);
  const t = per(to);
  if (f.isNaN() || t.isNaN()) throw new Error(`No rate for ${f.isNaN() ? from : to}`);
  const rate = t.div(f);
  return { rate: rate.toDecimalPlaces(6).toString(), converted: m2(D(amount).times(rate)) };
}
