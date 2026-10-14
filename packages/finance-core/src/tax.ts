import { D, Decimal, m2, ZERO } from './decimal';
import { addYears, diffDays } from './dates';

/**
 * Irish tax estimates. Every rate, threshold and cap comes from TaxRule rows passed in; nothing is
 * hard-coded here. All figures are estimates, not tax advice.
 */

export type TaxRegimeKey = 'EXIT_TAX' | 'CGT' | 'INVESTMENT_ACCOUNT';

export interface CoreTaxRule {
  regime: TaxRegimeKey;
  /** Decimal fraction, "0.3800" = 38% */
  rate: string;
  annualExemption: string | null;
  threshold: string | null;
  contributionCap: string | null;
  /** YYYY-MM-DD */
  effectiveFrom: string;
  effectiveTo: string | null;
}

/** The rule in force on `date` (latest `effectiveFrom` wins). Dates beyond the last rule use the latest open one. */
export function ruleOn(rules: readonly CoreTaxRule[], regime: TaxRegimeKey, date: string): CoreTaxRule | null {
  const matching = rules
    .filter((r) => r.regime === regime && r.effectiveFrom <= date && (r.effectiveTo === null || date <= r.effectiveTo))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return matching[0] ?? null;
}

const rate = (rules: readonly CoreTaxRule[], regime: TaxRegimeKey, date: string): Decimal => {
  const r = ruleOn(rules, regime, date);
  if (r) return D(r.rate);
  // Past the end of the table: use the most recent rule of that regime.
  const latest = rules.filter((x) => x.regime === regime).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  return latest ? D(latest.rate) : ZERO;
};

/** Exit tax: flat rate on gains, no annual exemption, losses are not relievable against other gains. */
export function exitTaxOn(gain: string, rules: readonly CoreTaxRule[], date: string): string {
  return m2(Decimal.max(D(gain), 0).times(rate(rules, 'EXIT_TAX', date)));
}

/** CGT: rate on gains above the annual exemption (remaining exemption can be passed in). */
export function cgtOn(
  gain: string,
  rules: readonly CoreTaxRule[],
  date: string,
  exemptionRemaining?: string,
): string {
  const rule = ruleOn(rules, 'CGT', date);
  const exemption = D(exemptionRemaining ?? rule?.annualExemption ?? 0);
  const taxable = Decimal.max(D(gain).minus(exemption), 0);
  return m2(taxable.times(rate(rules, 'CGT', date)));
}

/** Investment Account annual charge: rate × average daily value above the threshold. Zero before it starts. */
export function investmentAccountCharge(avgDailyValue: string, rules: readonly CoreTaxRule[], date: string): string {
  const rule = ruleOn(rules, 'INVESTMENT_ACCOUNT', date);
  if (!rule) return m2(0);
  const over = Decimal.max(D(avgDailyValue).minus(rule.threshold ?? 0), 0);
  return m2(over.times(rule.rate));
}

/* -------------------------------------------------------- deemed disposal */

export interface DeemedDisposalAnniversary {
  n: number;
  date: string;
  daysAway: number;
  estimatedGain: string;
  estimatedTax: string;
  rate: string;
}

export interface DeemedDisposalInput {
  lotId: string;
  acquiredAt: string;
  quantity: string;
  unitCost: string;
  fees: string;
  /** Latest price per unit */
  price: string;
}

/**
 * Exit-tax lots are treated as sold every 8 years. The first anniversary is estimated from today's price;
 * later anniversaries re-base the cost to the value at the previous deemed disposal, so the estimate from
 * today's price is zero until prices move.
 */
export function deemedDisposals(
  lot: DeemedDisposalInput,
  rules: readonly CoreTaxRule[],
  today: string,
  count = 3,
): DeemedDisposalAnniversary[] {
  const value = D(lot.quantity).times(lot.price);
  const cost = D(lot.quantity).times(lot.unitCost).plus(lot.fees);
  const out: DeemedDisposalAnniversary[] = [];
  for (let n = 1; n <= count; n++) {
    const date = addYears(lot.acquiredAt, 8 * n);
    const r = rate(rules, 'EXIT_TAX', date);
    const gain = n === 1 ? value.minus(cost) : ZERO;
    out.push({
      n,
      date,
      daysAway: diffDays(today, date),
      estimatedGain: m2(gain),
      estimatedTax: m2(Decimal.max(gain, 0).times(r)),
      rate: r.toFixed(4),
    });
  }
  return out;
}

/* ------------------------------------------------------ where should €X go */

export type WhereKey = 'BROKER_ETF' | 'INVESTMENT_ACCOUNT' | 'SHARES';

export interface WhereInput {
  amount: string;
  years: number;
  annualReturnPct: number;
  startDate: string;
  rules: readonly CoreTaxRule[];
}

export interface WhereOption {
  key: WhereKey;
  label: string;
  grossValue: string;
  taxEstimate: string;
  afterTaxValue: string;
  notes: string[];
}

/** Broker ETF: exit tax at each 8-year deemed disposal and on final sale. */
function simulateBrokerEtf(amount: Decimal, years: number, growth: Decimal, start: string, rules: readonly CoreTaxRule[]): Decimal {
  let value = amount;
  let basis = amount;
  let tax = ZERO;
  for (let y = 1; y <= years; y++) {
    value = value.times(growth);
    if (y % 8 === 0 && y < years) {
      const date = addYears(start, y);
      const t = Decimal.max(value.minus(basis), 0).times(rate(rules, 'EXIT_TAX', date));
      tax = tax.plus(t);
      value = value.minus(t);
      basis = value;
    }
  }
  const finalTax = Decimal.max(value.minus(basis), 0).times(rate(rules, 'EXIT_TAX', addYears(start, years)));
  tax = tax.plus(finalTax);
  return tax;
}

export function whereShouldItGo(i: WhereInput): { options: WhereOption[]; best: WhereKey } {
  const amount = D(i.amount);
  const growth = D(1).plus(D(i.annualReturnPct).div(100));
  const end = addYears(i.startDate, i.years);

  // Broker ETF
  const etfTax = simulateBrokerEtf(amount, i.years, growth, i.startDate, i.rules);
  const brokerGross = amount.times(growth.pow(i.years));
  const brokerNotes = [
    `Exit tax at the rate in force at each date, including a deemed disposal every 8 years${i.years >= 8 ? ` (${Math.floor((i.years - 1) / 8)} within this period)` : ''}.`,
  ];

  // Investment Account
  const iaRule = ruleOn(i.rules, 'INVESTMENT_ACCOUNT', end) ?? ruleOn(i.rules, 'INVESTMENT_ACCOUNT', i.startDate);
  const cap = iaRule?.contributionCap ? D(iaRule.contributionCap) : null;
  const inWrapper = cap ? Decimal.min(amount, cap) : amount;
  const outside = amount.minus(inWrapper);
  let iaValue = inWrapper;
  let charges = ZERO;
  for (let y = 1; y <= i.years; y++) {
    const date = addYears(i.startDate, y);
    const avg = iaValue.plus(iaValue.times(growth)).div(2);
    iaValue = iaValue.times(growth);
    const charge = D(investmentAccountCharge(m2(avg), i.rules, date));
    charges = charges.plus(charge);
    iaValue = iaValue.minus(charge);
  }
  const outsideGross = outside.times(growth.pow(i.years));
  const outsideTax = outside.gt(0) ? simulateBrokerEtf(outside, i.years, growth, i.startDate, i.rules) : ZERO;
  const iaNotes = [
    'No CGT, exit tax or deemed disposal inside the account.',
    iaRule
      ? `${D(iaRule.rate).times(100).toFixed(0)}% a year on the average daily value above ${m2(iaRule.threshold ?? 0)}, from ${iaRule.effectiveFrom}.`
      : 'No Investment Account rule is loaded.',
  ];
  if (outside.gt(0)) iaNotes.push(`Contribution cap is ${m2(cap ?? 0)} a year: the other ${m2(outside)} is modelled in a broker ETF.`);

  // Individual shares: CGT on the final sale, one annual exemption
  const sharesValue = amount.times(growth.pow(i.years));
  const gain = sharesValue.minus(amount);
  const cgt = D(cgtOn(m2(gain), i.rules, end));

  const options: WhereOption[] = [
    {
      key: 'BROKER_ETF',
      label: 'Broker ETF',
      grossValue: m2(brokerGross),
      taxEstimate: m2(etfTax),
      afterTaxValue: m2(brokerGross.minus(etfTax)),
      notes: brokerNotes,
    },
    {
      key: 'INVESTMENT_ACCOUNT',
      label: 'Investment Account',
      grossValue: m2(inWrapper.times(growth.pow(i.years)).plus(outsideGross)),
      taxEstimate: m2(charges.plus(outsideTax)),
      afterTaxValue: m2(iaValue.plus(outsideGross.minus(outsideTax))),
      notes: iaNotes,
    },
    {
      key: 'SHARES',
      label: 'Individual shares',
      grossValue: m2(sharesValue),
      taxEstimate: m2(cgt),
      afterTaxValue: m2(sharesValue.minus(cgt)),
      notes: ['CGT on the gain when sold, after the annual exemption. No deemed disposal.'],
    },
  ];
  const best = [...options].sort((a, b) => Number(b.afterTaxValue) - Number(a.afterTaxValue))[0]!.key;
  return { options, best };
}
