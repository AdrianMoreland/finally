import { D, Decimal, m2 } from './decimal';
import { potReach, type PayCalendar, type PotCore, type PotReach } from './pots';
import { eur0 } from './types';

/** Deterministic random numbers, so a simulation gives the same answer each time it is shown. */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ freedom */

export interface FreedomInput {
  /** What a comfortable year costs. */
  spend: number;
  /** Safe withdrawal rate, percent. */
  withdrawalPct: number;
  /** Invested each month. */
  monthly: number;
  /** Expected yearly return, percent, before ups and downs. */
  returnPct: number;
  age: number;
  /** How much the monthly amount grows each year, percent. */
  raisePct: number;
}

export interface FreedomResult {
  /** The "enough" number: yearly spending divided by the withdrawal rate. */
  target: number;
  p10: number[];
  p50: number[];
  p90: number[];
  /** Years until the median run reaches the target, or -1. */
  hitYear: number;
  /** Chance of reaching the target by 55. */
  probBy55: number;
  years: number;
}

export function freedomSim(f: FreedomInput, runs = 300): FreedomResult {
  const target = f.spend / (f.withdrawalPct / 100);
  const years = Math.max(10, 66 - f.age);
  const rand = mulberry32(77);
  const gauss = (): number => {
    let u = 0;
    let v = 0;
    while (!u) u = rand();
    while (!v) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const paths: number[][] = [];
  for (let i = 0; i < runs; i++) {
    let value = 0;
    let contribution = f.monthly * 12;
    const row = [0];
    for (let y = 1; y <= years; y++) {
      value = (value + contribution) * (1 + f.returnPct / 100 + 0.15 * gauss());
      if (value < 0) value = 0;
      contribution *= 1 + f.raisePct / 100;
      row.push(value);
    }
    paths.push(row);
  }
  const q = (y: number, p: number): number => {
    const col = paths.map((r) => r[y]!).sort((a, b) => a - b);
    return col[Math.floor(p * (col.length - 1))]!;
  };
  const p10: number[] = [];
  const p50: number[] = [];
  const p90: number[] = [];
  for (let y = 0; y <= years; y++) {
    p10.push(q(y, 0.1));
    p50.push(q(y, 0.5));
    p90.push(q(y, 0.9));
  }
  const yearAt55 = Math.min(years, Math.max(0, 55 - f.age));
  return {
    target,
    p10,
    p50,
    p90,
    hitYear: p50.findIndex((v) => v >= target),
    probBy55: paths.filter((r) => r[yearAt55]! >= target).length / runs,
    years,
  };
}

/** What the My Future Fund auto-enrolment scheme could build for a salary, with its stepped contribution rates. */
export function myFutureFund(salary: number, age: number): number {
  let v = 0;
  for (let y = 1; y <= 66 - age; y++) {
    const rate = y <= 3 ? 0.035 : y <= 6 ? 0.07 : y <= 9 ? 0.105 : 0.14;
    v = (v + salary * rate) * 1.05;
  }
  return v;
}

/* ------------------------------------------------------------ wrapper compare */

export interface WrapperResult {
  paid: number;
  /** Before any tax or fees. */
  pre: number;
  /** Cost of fund fees and currency drag over the period. */
  fees: number;
  /** Irish ETF under exit tax and deemed disposal. */
  etf: number;
  /** The new Investment Account. */
  ia: number;
  /** Individual shares under CGT. */
  shares: number;
  capped: boolean;
}

/**
 * The same monthly amount in an Irish ETF (exit tax, deemed disposal every 8 years), the new Investment Account
 * (1% above €50,000, €12,000 a year cap) and individual shares (CGT after the €1,270 exemption). Fees come out of the
 * return; `fxPct` is the share of each contribution lost to conversion. Rates are the ones in force from 2027.
 */
export function wrapperSim(monthly: number, years: number, ret: number, terPct: number, fxPct: number): WrapperResult {
  const yearly = monthly * 12 * (1 - fxPct / 100);
  const net = ret - terPct / 100;
  const lots: Array<{ v: number; b: number; age: number }> = [];
  let gross = 0;
  let etfNoTax = 0;
  for (let y = 1; y <= years; y++) {
    lots.push({ v: yearly, b: yearly, age: 0 });
    for (const l of lots) {
      l.v *= 1 + net;
      l.age++;
      if (l.age % 8 === 0) {
        const g = l.v - l.b;
        if (g > 0) {
          l.v -= g * 0.35;
          l.b = l.v;
        }
      }
    }
    gross = (gross + monthly * 12) * (1 + ret);
    etfNoTax = (etfNoTax + yearly) * (1 + net);
  }
  const etf = lots.reduce((a, l) => a + l.v - Math.max(0, l.v - l.b) * 0.35, 0);
  let ia = 0;
  for (let y = 1; y <= years; y++) {
    ia = (ia + Math.min(yearly, 12000)) * (1 + net);
    ia -= Math.max(0, ia - 50000) * 0.01;
  }
  let sh = 0;
  for (let y = 1; y <= years; y++) sh = (sh + yearly) * (1 + ret);
  const shares = sh - Math.max(0, sh - yearly * years - 1270) * 0.31;
  return { paid: monthly * 12 * years, pre: gross, fees: gross - etfNoTax, etf, ia, shares, capped: yearly > 12000 };
}

/* ------------------------------------------------------------------- ladder */

export interface LadderRung {
  key: 'plan' | 'starter' | 'paid' | 'three' | 'invest' | 'six' | 'enough';
  title: string;
  done: boolean;
  /** Plain-language date or state, such as "14 Jan 2027" or "Add a monthly amount". */
  when: string;
  /** What is still missing, in euro. */
  left: string | null;
}

export interface LadderInput {
  cal: PayCalendar;
  safetyPot: PotCore | null;
  essentialsPerMonth: string;
  totalOwed: string;
  debtMonthly: string;
  payoffFree: string | null;
  freedomTarget: number;
  freedomHitYear: number;
  age: number;
  /** Date the Investment Account opens. */
  investAccountOpens: string;
}

const fmtDate = (d: string): string => {
  const [y, m, day] = d.split('-').map(Number);
  return `${day} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][(m ?? 1) - 1]} ${y}`;
};

export function reachText(r: PotReach | null): string {
  if (!r) return '';
  if ('reached' in r) return 'Reached';
  if ('never' in r) return 'Add a monthly amount';
  return fmtDate(r.date);
}

/** The money ladder: one list of what comes next, with a date for each rung at the current plan. */
export function moneyLadder(i: LadderInput): { rungs: LadderRung[]; current: number } {
  const rainy: PotCore =
    i.safetyPot ?? { id: 'rainy', name: 'Rainy day', type: 'SAFETY', balance: '0', target: null, targetDate: null, monthly: '0' };
  const ess = D(i.essentialsPerMonth);
  const reachFor = (target: Decimal): PotReach | null => potReach(rainy, target, i.cal);
  const left = (t: Decimal): string => m2(Decimal.max(0, t.minus(rainy.balance)));
  const owed = D(i.totalOwed);
  const rungs: LadderRung[] = [
    {
      key: 'plan',
      title: 'Paying-back plan running',
      done: owed.lte(0) || D(i.debtMonthly).gt(0),
      when: owed.lte(0) ? 'Nothing owed' : D(i.debtMonthly).gt(0) ? `${eur0(i.debtMonthly)} each payday` : 'Set an amount',
      left: null,
    },
    { key: 'starter', title: '€1,000 starter fund', done: D(rainy.balance).gte(1000), when: reachText(reachFor(D(1000))), left: left(D(1000)) },
    { key: 'paid', title: 'Everyone paid back', done: owed.lte(0), when: i.payoffFree ? fmtDate(i.payoffFree) : 'Not scheduled', left: m2(owed) },
    { key: 'three', title: '3 months saved', done: D(rainy.balance).gte(ess.times(3)), when: reachText(reachFor(ess.times(3))), left: left(ess.times(3)) },
    { key: 'invest', title: 'Investing every month', done: false, when: `${fmtDate(i.investAccountOpens)}, when the Investment Account opens`, left: null },
    { key: 'six', title: '6 months saved', done: D(rainy.balance).gte(ess.times(6)), when: reachText(reachFor(ess.times(6))), left: left(ess.times(6)) },
    {
      key: 'enough',
      title: 'Your "enough" number',
      done: false,
      when: i.freedomHitYear >= 0 ? `around age ${i.age + i.freedomHitYear}` : 'not by 66 yet',
      left: m2(i.freedomTarget),
    },
  ];
  const current = rungs.findIndex((r) => !r.done);
  return { rungs, current: current < 0 ? rungs.length - 1 : current };
}
