import { eur0, eur } from './types';

/**
 * Irish PAYE maths for a single employee. The numbers live in `PAYE_YEARS` and `IRISH_RULES` (a versioned data
 * file with sources and review dates), not in the formulas: every Budget changes them, so adding a year is a data
 * change.
 */

export interface PayeYear {
  /** Income taxed at 20% before the 40% rate starts. */
  band: number;
  /** Personal and employee tax credits. */
  credits: number;
  /** Upper edge of the 2% USC band. */
  usc2: number;
  /** Employee PRSI over the year (blended when the rate changes part way through). */
  prsi: number;
  rentCredit: number;
}

export const PAYE_YEARS: Readonly<Record<number, PayeYear>> = {
  2026: { band: 44000, credits: 4000, usc2: 28700, prsi: 0.75 * 0.042 + 0.25 * 0.0435, rentCredit: 1000 },
  2027: { band: 46500, credits: 4250, usc2: 30300, prsi: 0.0435, rentCredit: 1150 },
};

const yearRules = (y: number): PayeYear => PAYE_YEARS[y] ?? PAYE_YEARS[Math.max(...Object.keys(PAYE_YEARS).map(Number).filter((k) => k <= y))] ?? PAYE_YEARS[2026]!;

export const incomeTax = (gross: number, year: number): number => {
  const t = yearRules(year);
  return Math.max(0, Math.min(gross, t.band) * 0.2 + Math.max(0, gross - t.band) * 0.4 - t.credits);
};

export const usc = (gross: number, year: number): number => {
  if (gross <= 13000) return 0;
  const c2 = yearRules(year).usc2;
  let u = Math.min(gross, 12012) * 0.005;
  if (gross > 12012) u += (Math.min(gross, c2) - 12012) * 0.02;
  if (gross > c2) u += (Math.min(gross, 70044) - c2) * 0.03;
  if (gross > 70044) u += (gross - 70044) * 0.08;
  return u;
};

export interface TakeHome {
  tax: number;
  usc: number;
  prsi: number;
  net: number;
}

export function takeHome(gross: number, year: number): TakeHome {
  const tax = incomeTax(gross, year);
  const u = usc(gross, year);
  const prsi = gross * yearRules(year).prsi;
  return { tax, usc: u, prsi, net: gross - tax - u - prsi };
}

/** Year-on-year difference in monthly net pay for the same salary (Budget changes to bands and credits). */
export const nextYearRise = (salary: number, year: number): number => (takeHome(salary, year + 1).net - takeHome(salary, year).net) / 12;

/* ------------------------------------------------------------------ bonus */

export interface BonusInput {
  salary: number;
  /** The most the bonus can be. */
  target: number;
  /** Percent of the target you expect to get, 0 to 100. */
  pct: number;
  year: number;
  /** Amount sacrificed into a pension (relief at your marginal rate, capped at 20% of pay). */
  pension: number;
}

export interface BonusResult {
  year: number;
  gross: number;
  cap: number;
  pension: number;
  taxWithout: number;
  taxWith: number;
  usc: number;
  prsi: number;
  netWithoutPension: number;
  netWithPension: number;
  /** Part of the bonus taxed at 40%. */
  aboveBand: number;
}

export function bonusCalc(i: BonusInput): BonusResult {
  const gross = (i.target * i.pct) / 100;
  const cap = 0.2 * (i.salary + gross);
  const pension = Math.min(i.pension, gross, cap);
  const base = incomeTax(i.salary, i.year);
  const taxWithout = incomeTax(i.salary + gross, i.year) - base;
  const taxWith = incomeTax(i.salary + gross - pension, i.year) - base;
  const u = usc(i.salary + gross, i.year) - usc(i.salary, i.year);
  const prsi = gross * 0.0435;
  return {
    year: i.year,
    gross,
    cap,
    pension,
    taxWithout,
    taxWith,
    usc: u,
    prsi,
    netWithoutPension: gross - taxWithout - u - prsi,
    netWithPension: gross - taxWith - u - prsi - pension,
    aboveBand: Math.max(0, i.salary + gross - yearRules(i.year).band),
  };
}

/** What a bonus of 0%, 50% and 100% of target leaves after tax, so the size of the bet is visible. */
export const bonusScenarios = (salary: number, target: number, year: number): Array<{ pct: number; net: number }> =>
  [0, 50, 100].map((pct) => ({ pct, net: bonusCalc({ salary, target, pct, year, pension: 0 }).netWithoutPension }));

/* -------------------------------------------------------------- pay checker */

export interface ExpectedPay {
  gross: number;
  tax: number;
  usc: number;
  prsi: number;
  net: number;
}

/** What one month's pay should be on `salary`. PRSI rose from 4.2% to 4.35% on 1 October 2026. */
export function expectedNet(salary: number, onDate: string): ExpectedPay {
  const tax = incomeTax(salary, 2026) / 12;
  const u = usc(salary, 2026) / 12;
  const prsi = (salary / 12) * (onDate < '2026-10-01' ? 0.042 : 0.0435);
  const gross = salary / 12;
  return { gross, tax, usc: u, prsi, net: gross - tax - u - prsi };
}

/** The yearly gross that would give `monthlyNet` a month, found by bisection. */
export function grossFor(monthlyNet: number): number {
  let lo = 10000;
  let hi = 120000;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const deductions = incomeTax(mid, 2026) + usc(mid, 2026) + mid * 0.042;
    if (mid - deductions < monthlyNet * 12) lo = mid;
    else hi = mid;
  }
  return lo;
}

export interface PayslipVerdict {
  needsAttention: boolean;
  headline: string;
  body: string;
}

export function payslipVerdict(opts: { net: number; first: boolean; salary: number; onDate: string; nextPayday: string }): PayslipVerdict {
  const e = expectedNet(opts.salary, opts.onDate);
  const d = opts.net - e.net;
  if (opts.first) {
    return {
      needsAttention: true,
      headline: `First month: ${eur(-d)} below a full month.`,
      body: 'A part month or emergency tax would both explain it. If it was emergency tax, the overpayment comes back through payroll once Revenue sends your credits.',
    };
  }
  if (d > 5) {
    return {
      needsAttention: false,
      headline: `${eur(d)} more than a normal month.`,
      body: 'If the month before had emergency tax, this is usually that money coming back through payroll.',
    };
  }
  if (d < -5) {
    return {
      needsAttention: true,
      headline: `${eur(-d)} a month less than ${eur0(opts.salary)} should give.`,
      body: `Something else is coming off, like a pension, health insurance or another deduction, or your gross is closer to ${eur0(Math.round(grossFor(opts.net) / 500) * 500)}. Upload the payslip PDF to see which line it is.`,
    };
  }
  return {
    needsAttention: false,
    headline: `Matches what Finally expects on ${eur0(opts.salary)} a year.`,
    body: `The next one is checked on ${opts.nextPayday}.`,
  };
}

/* ------------------------------------------------------------- rent credit */

/** Rent Tax Credit for earlier years, by tax year (what could still be claimed). */
export const RENT_CREDIT_BY_YEAR: Readonly<Record<number, number>> = { 2022: 500, 2023: 750, 2024: 1000, 2025: 1000 };

/**
 * Credit you could still claim for years before this one, from the year the tenancy started. The start year comes
 * from you: it is never assumed that you rented in Ireland for every year.
 */
export function previousRentCredit(tenancyStart: string | null, thisYear: number): number {
  const y0 = tenancyStart ? Number(tenancyStart.slice(0, 4)) : thisYear;
  return Object.entries(RENT_CREDIT_BY_YEAR)
    .filter(([y]) => Number(y) >= y0 && Number(y) < thisYear)
    .reduce((a, [, v]) => a + v, 0);
}

/* ---------------------------------------------------------------- the rules */

export interface RuleNote {
  id: string;
  label: string;
  /** When it takes effect, as shown to the user. */
  from: string;
  source: string;
  url: string;
  /** Last time someone checked the number against the source (YYYY-MM-DD). */
  reviewed: string;
}

/** Version of the rules file, shown next to the review date. Bump it whenever a number changes. */
export const IRISH_RULES_VERSION = '2027.1';

export const IRISH_RULES: readonly RuleNote[] = [
  { id: 'paye-2026', label: 'Income tax: 20% to €44,000, credits €4,000', from: '2026', source: 'Budget 2026', url: 'https://www.gov.ie/en/department-of-finance/', reviewed: '2026-10-15' },
  { id: 'paye-2027', label: 'Income tax: band €46,500, credits €4,250', from: '1 Jan 2027', source: 'Budget 2027', url: 'https://www.gov.ie/en/department-of-finance/', reviewed: '2026-10-15' },
  { id: 'prsi', label: 'PRSI for employees: 4.35%', from: '1 Oct 2026', source: 'Revenue', url: 'https://www.revenue.ie', reviewed: '2026-10-15' },
  { id: 'usc', label: 'USC bands 0.5%, 2%, 3%, 8%', from: '2026', source: 'Revenue', url: 'https://www.revenue.ie', reviewed: '2026-10-15' },
  { id: 'rent', label: 'Rent Tax Credit €1,000, then €1,150', from: '2026 / 2027', source: 'Budget 2027', url: 'https://www.gov.ie/en/department-of-finance/', reviewed: '2026-10-15' },
  { id: 'exit', label: 'Exit tax on funds: 38%, then 35%', from: '1 Jan 2027', source: 'Budget 2027', url: 'https://www.gov.ie/en/department-of-finance/', reviewed: '2026-10-15' },
  { id: 'cgt', label: 'Capital gains tax: 31%, €1,270 exempt', from: '7 Oct 2026', source: 'Budget 2027', url: 'https://www.gov.ie/en/department-of-finance/', reviewed: '2026-10-15' },
  { id: 'ia', label: 'Investment Account opens', from: '1 Jul 2027', source: 'Budget 2027', url: 'https://www.gov.ie/en/department-of-finance/', reviewed: '2026-10-15' },
  { id: 'dirt', label: 'DIRT on savings interest: 33%', from: '2026', source: 'Revenue', url: 'https://www.revenue.ie', reviewed: '2026-10-15' },
];
