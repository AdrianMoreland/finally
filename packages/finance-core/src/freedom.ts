import { diffDays } from './dates';
import { D, m2, sum } from './decimal';
import type { FreedomResult } from './grow';

/* ----------------------------------------------------------- year by year */

export interface YearTableInput {
  /** First calendar year of the table (this year). */
  startYear: number;
  age: number;
  /** Invested each month, today. */
  monthly: number;
  /** How much the monthly amount grows each year, percent (the user's raise setting). */
  raisePct: number;
}

export interface YearTable {
  /** Years from now: every 5, plus the last. */
  offsets: number[];
  years: number[];
  age: number[];
  p50: number[];
  p10: number[];
  p90: number[];
  /** Cumulative contributions. */
  put: number[];
  /** Percent of "enough" the typical path reaches, capped at 100. */
  share: number[];
  /** Typical path is at or above the target. */
  enough: boolean[];
}

export function yearTable(sim: FreedomResult, i: YearTableInput): YearTable {
  const offsets: number[] = [];
  for (let y = 0; y <= sim.years; y += 5) offsets.push(y);
  if (offsets[offsets.length - 1] !== sim.years) offsets.push(sim.years);
  const put = [0];
  let year = i.monthly * 12;
  for (let y = 1; y <= sim.years; y++) {
    put.push(put[y - 1]! + year);
    year *= 1 + i.raisePct / 100;
  }
  return {
    offsets,
    years: offsets.map((y) => i.startYear + y),
    age: offsets.map((y) => i.age + y),
    p50: offsets.map((y) => sim.p50[y]!),
    p10: offsets.map((y) => sim.p10[y]!),
    p90: offsets.map((y) => sim.p90[y]!),
    put: offsets.map((y) => put[y]!),
    share: offsets.map((y) => Math.min(100, (sim.p50[y]! / sim.target) * 100)),
    enough: offsets.map((y) => sim.p50[y]! >= sim.target),
  };
}

/* ------------------------------------------------------------- milestones */

export interface Milestone {
  name: string;
  /** Date it happens, or null for the "enough" marker. */
  date: string | null;
  /** 1-based number on the chart. */
  n: number;
  /** Years from today (the chart's x position). */
  at: number;
}

export interface MilestoneInput {
  today: string;
  payoffDate: string | null;
  threeMonthsDate: string | null;
  sixMonthsDate: string | null;
  investAccountOpens: string;
  /** Years until the typical path hits the target, or -1. */
  hitYear: number;
}

/** Dated milestones in order, numbered from 1, then the year the typical path reaches "enough". */
export function freedomMilestones(i: MilestoneInput): Milestone[] {
  const dated: Array<[string, string | null]> = [
    ['Everyone paid back', i.payoffDate],
    ['3 months saved', i.threeMonthsDate],
    ['Investment Account opens', i.investAccountOpens],
    ['6 months saved', i.sixMonthsDate],
  ];
  const ms = dated
    .filter((x): x is [string, string] => !!x[1])
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([name, date], k): Milestone => ({ name, date, n: k + 1, at: diffDays(i.today, date) / 365.25 }));
  if (i.hitYear >= 0) ms.push({ name: '"Enough" in the typical case', date: null, n: ms.length + 1, at: i.hitYear });
  return ms;
}

/* ------------------------------------------------------------------ runway */

export interface RunwayInput {
  /** Rainy-day pot plus current accounts. */
  pool: string;
  /** Fixed budgets per month (rent counts as your share). */
  fixedBudget: string;
  flexBudget: string;
  /** Percent cut off flexible spending, 0 to 100. */
  cutPct: number;
}

/** How many months the pool lasts if pay stopped, and the monthly need it was worked from. */
export function runwayMonths(i: RunwayInput): { months: string; need: string } {
  const need = D(i.fixedBudget).plus(D(i.flexBudget).times(D(1).minus(D(i.cutPct).div(100))));
  if (need.lte(0)) return { months: '0.0', need: '0.00' };
  return { months: D(i.pool).div(need).toFixed(1), need: m2(need) };
}

/** Total of a list of numeric strings, for callers that only hold strings. */
export const total = (xs: readonly string[]): string => m2(sum(xs));
