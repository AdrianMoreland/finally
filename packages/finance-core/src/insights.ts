import { D, Decimal, m2, mean, median, sum } from './decimal';
import {
  addDays,
  addMonths,
  addMonthsToDate,
  addYears,
  dayOfMonth,
  daysInMonth,
  diffDays,
  monthOf,
} from './dates';
import { eur, eur0, type CoreTx, type Draft } from './types';

const monthName = (month: string): string => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1)).toLocaleString('en-IE', { month: 'long', timeZone: 'UTC' });
};

const spendOf = (t: CoreTx): Decimal => D(t.amountEur).abs();
const isSpend = (t: CoreTx): boolean => t.kind === 'SPEND' && D(t.amountEur).isNegative();

/* ------------------------------------------------------------------ pacing */

export interface Pacing {
  expectedByToday: string;
  projected: string;
  usedPct: number;
}

/** Even-pace maths shared by the budget bars and the pacing insight. */
export function pacing(amount: string, spent: string, day: number, daysInMonthCount: number): Pacing {
  const budget = D(amount);
  const s = D(spent);
  const dayClamped = Math.max(1, Math.min(day, daysInMonthCount));
  return {
    expectedByToday: m2(budget.times(dayClamped).div(daysInMonthCount)),
    projected: m2(s.times(daysInMonthCount).div(dayClamped)),
    usedPct: budget.isZero() ? 0 : s.div(budget).times(100).toDecimalPlaces(1).toNumber(),
  };
}

export interface BudgetLine {
  categoryId: string;
  name: string;
  amount: string;
  spent: string;
  fixed: boolean;
}

export function budgetPacing(today: string, lines: readonly BudgetLine[]): Draft[] {
  const month = monthOf(today);
  const day = dayOfMonth(today);
  const dim = daysInMonth(month);
  const out: Draft[] = [];
  for (const l of lines) {
    if (l.fixed || D(l.amount).lte(0)) continue;
    const p = pacing(l.amount, l.spent, day, dim);
    const left = dim - day;
    if (D(l.spent).gt(l.amount)) {
      out.push({
        type: 'budget_over',
        severity: 'ACT',
        title: `${l.name} is over budget`,
        body: `${eur(l.spent)} spent against a ${eur0(l.amount)} budget, with ${left} days left.`,
        payload: { categoryId: l.categoryId, month, spent: m2(l.spent), budget: m2(l.amount) },
        fingerprint: `budget_over:${l.categoryId}:${month}`,
      });
    } else if (day >= 5 && D(p.projected).gt(D(l.amount).times('1.1'))) {
      out.push({
        type: 'budget_pace',
        severity: 'WATCH',
        title: `${l.name}: ${Math.round(p.usedPct)}% used with ${left} days left`,
        body: `${eur(l.spent)} of ${eur0(l.amount)}. On pace for ${eur0(p.projected)} by the end of the month.`,
        payload: { categoryId: l.categoryId, month, projected: p.projected, budget: m2(l.amount) },
        fingerprint: `budget_pace:${l.categoryId}:${month}`,
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------ safe to spend */

export interface SafeToSpendInput {
  /** Income received this pay cycle. */
  income: string;
  /** Fixed bills (rent, bills, subscriptions) already paid this cycle. */
  fixedBillsPaid?: string;
  /** Fixed bills still to come before payday. */
  remainingFixedBills: string;
  /** Amount to set aside this cycle. */
  savingsTarget: string;
  /** Discretionary spend so far this cycle. */
  flexibleSpent: string;
  /** Days from today to payday, inclusive of today (at least 1). */
  daysToPayday: number;
}

export interface SafeToSpend {
  perDay: string;
  leftToPayday: string;
  draft: Draft;
}

/** safeToSpend = (income − fixed bills (paid and remaining) − savings target − flexible spend so far) ÷ days to payday. */
export function safeToSpend(input: SafeToSpendInput, today: string): SafeToSpend {
  const days = Math.max(1, Math.floor(input.daysToPayday));
  const left = D(input.income)
    .minus(input.fixedBillsPaid ?? 0)
    .minus(input.remainingFixedBills)
    .minus(input.savingsTarget)
    .minus(input.flexibleSpent);
  const perDay = left.div(days);
  const negative = perDay.isNegative();
  return {
    perDay: m2(perDay),
    leftToPayday: m2(left),
    draft: {
      type: 'safe_to_spend',
      severity: negative ? 'ACT' : perDay.lt(10) ? 'WATCH' : 'INFO',
      title: negative ? 'You are past your safe-to-spend limit' : `Safe to spend today: ${eur(perDay.toNumber())}`,
      body: `${eur(left.toNumber())} left for ${days} days to payday, after ${eur(input.remainingFixedBills)} of bills still to come.`,
      payload: { perDay: m2(perDay), leftToPayday: m2(left), days },
      fingerprint: `safe_to_spend:${today}`,
    },
  };
}

/* ----------------------------------------------------------------- recurring */

export interface RecurringSeriesCore {
  merchantKey: string;
  merchantName: string;
  cadence: 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  expectedAmount: string;
  lastAmount: string;
  previousAmount: string | null;
  lastDate: string;
  nextDate: string;
  occurrences: number;
  categoryId: string | null;
}

const CADENCES: Array<{ cadence: RecurringSeriesCore['cadence']; lo: number; hi: number; tol: number }> = [
  { cadence: 'WEEKLY', lo: 6, hi: 8, tol: 1 },
  { cadence: 'MONTHLY', lo: 26, hi: 35, tol: 4 },
  { cadence: 'YEARLY', lo: 350, hi: 380, tol: 10 },
];

const nextAfter = (date: string, cadence: RecurringSeriesCore['cadence']): string =>
  cadence === 'WEEKLY' ? addDays(date, 7) : cadence === 'MONTHLY' ? addMonthsToDate(date, 1) : addYears(date, 1);

export interface RecurringResult {
  series: RecurringSeriesCore[];
  drafts: Draft[];
}

export function detectRecurring(
  transactions: readonly CoreTx[],
  today: string,
  opts: { subscriptionCategoryId?: string | null } = {},
): RecurringResult {
  const byMerchant = new Map<string, CoreTx[]>();
  for (const t of transactions) {
    if (!isSpend(t) || !t.merchantKey) continue;
    const list = byMerchant.get(t.merchantKey) ?? [];
    list.push(t);
    byMerchant.set(t.merchantKey, list);
  }
  const series: RecurringSeriesCore[] = [];
  const drafts: Draft[] = [];

  for (const [key, list] of byMerchant) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    const name = list[list.length - 1]?.merchantName ?? key;
    const last = list[list.length - 1]!;

    // New subscription: first ever payment in a subscription category within 35 days.
    if (
      opts.subscriptionCategoryId &&
      list.length === 1 &&
      last.categoryId === opts.subscriptionCategoryId &&
      diffDays(last.date, today) <= 35
    ) {
      drafts.push({
        type: 'new_subscription',
        severity: 'WATCH',
        title: `New subscription: ${name} ${eur(spendOf(last).toNumber())}`,
        body: `First payment on ${last.date}. Check it is one you meant to start.`,
        payload: { merchantKey: key, amount: m2(spendOf(last)), date: last.date },
        fingerprint: `new_subscription:${key}`,
      });
    }
    if (list.length < 3) continue;

    const gaps = list.slice(1).map((t, i) => diffDays(list[i]!.date, t.date));
    const med = median(gaps).toNumber();
    const spec = CADENCES.find((c) => med >= c.lo && med <= c.hi);
    if (!spec) continue;
    const typical = spec.cadence === 'WEEKLY' ? 7 : spec.cadence === 'MONTHLY' ? 30 : 365;
    const regular = gaps.filter((g) => Math.abs(g - typical) <= spec.tol).length / gaps.length;
    if (regular < 0.7) continue;
    const amounts = list.map(spendOf);
    const medAmt = median(amounts);
    const stable = amounts.filter((a) => a.minus(medAmt).abs().lte(medAmt.times('0.2'))).length / amounts.length;
    if (stable < 0.6) continue;

    const previous = list.length >= 2 ? spendOf(list[list.length - 2]!) : null;
    const s: RecurringSeriesCore = {
      merchantKey: key,
      merchantName: name,
      cadence: spec.cadence,
      expectedAmount: m2(medAmt),
      lastAmount: m2(spendOf(last)),
      previousAmount: previous ? m2(previous) : null,
      lastDate: last.date,
      nextDate: nextAfter(last.date, spec.cadence),
      occurrences: list.length,
      categoryId: last.categoryId,
    };
    series.push(s);

    if (previous) {
      const delta = spendOf(last).minus(previous);
      if (delta.abs().gte('0.5') && delta.abs().div(previous).gte('0.01') && diffDays(last.date, today) <= 45) {
        const up = delta.isPositive();
        drafts.push({
          type: 'price_change',
          severity: 'INFO',
          title: `${name} went ${up ? 'up' : 'down'} ${eur(delta.abs().toNumber())} to ${eur(spendOf(last).toNumber())}`,
          body: `Price change spotted on ${last.date}; ${eur0(delta.abs().times(spec.cadence === 'MONTHLY' ? 12 : spec.cadence === 'WEEKLY' ? 52 : 1).toNumber())} a year ${up ? 'more' : 'less'}.`,
          payload: { merchantKey: key, from: m2(previous), to: m2(spendOf(last)), date: last.date },
          fingerprint: `price_change:${key}:${last.date}`,
        });
      }
    }
    const away = diffDays(today, s.nextDate);
    if (away >= 0 && away <= 3) {
      drafts.push({
        type: 'renewal_soon',
        severity: 'WATCH',
        title: `${name} renews ${away === 0 ? 'today' : away === 1 ? 'tomorrow' : `in ${away} days`}`,
        body: `Expected ${eur(s.lastAmount)} on ${s.nextDate}.`,
        payload: { merchantKey: key, amount: s.lastAmount, date: s.nextDate },
        fingerprint: `renewal_soon:${key}:${s.nextDate}`,
      });
    }
  }
  return { series, drafts };
}

/* --------------------------------------------------------------------- leaks */

export function leaks(
  transactions: readonly CoreTx[],
  today: string,
  categoryNames: Record<string, string> = {},
  opts: { windowDays?: number; maxAmount?: number; minCount?: number; ignoreCategoryIds?: readonly string[] } = {},
): Draft[] {
  const windowDays = opts.windowDays ?? 30;
  const maxAmount = opts.maxAmount ?? 15;
  const minCount = opts.minCount ?? 6;
  const from = addDays(today, -windowDays);
  const ignore = new Set(opts.ignoreCategoryIds ?? []);
  const groups = new Map<string, { label: string; total: Decimal; count: number }>();
  for (const t of transactions) {
    if (!isSpend(t) || t.date <= from || t.date > today) continue;
    if (t.categoryId && ignore.has(t.categoryId)) continue;
    const amt = spendOf(t);
    if (amt.gt(maxAmount)) continue;
    const named = t.categoryId ? categoryNames[t.categoryId] : undefined;
    const key = named ? `c:${t.categoryId}` : `m:${t.merchantKey ?? 'unknown'}`;
    const g = groups.get(key) ?? { label: named ?? t.merchantName ?? 'Small payments', total: D(0), count: 0 };
    g.total = g.total.plus(amt);
    g.count += 1;
    groups.set(key, g);
  }
  const out: Draft[] = [];
  for (const [key, g] of groups) {
    if (g.count < minCount) continue;
    const yearly = g.total.times(365).div(windowDays);
    out.push({
      type: 'leak',
      severity: yearly.gte(250) ? 'WATCH' : 'INFO',
      title: `${g.label}: ${g.count} small payments, ${eur(g.total.toNumber())} in ${windowDays} days`,
      body: `Average ${eur(g.total.div(g.count).toNumber())}. At this rate that is about ${eur0(yearly.toNumber())} a year.`,
      payload: { key, count: g.count, total: m2(g.total), yearly: m2(yearly) },
      fingerprint: `leak:${key}:${monthOf(today)}`,
    });
  }
  return out.sort((a, b) => Number(b.payload['yearly']) - Number(a.payload['yearly']));
}

/* ------------------------------------------------------------------ anomalies */

export function anomalies(
  transactions: readonly CoreTx[],
  today: string,
  categoryNames: Record<string, string> = {},
  opts: { fixedCategoryIds?: readonly string[] } = {},
): Draft[] {
  const out: Draft[] = [];
  const fixed = new Set(opts.fixedCategoryIds ?? []);
  const spends = transactions.filter(isSpend);

  // Merchant level: a recent payment more than 2× the usual for that merchant.
  const recent = spends.filter((t) => t.merchantKey && diffDays(t.date, today) >= 0 && diffDays(t.date, today) <= 14);
  for (const t of recent) {
    const history = spends
      .filter((h) => h.merchantKey === t.merchantKey && h.id !== t.id && diffDays(h.date, t.date) > 0 && diffDays(h.date, t.date) <= 120)
      .map(spendOf);
    if (history.length < 3) continue;
    const usual = median(history);
    const amt = spendOf(t);
    if (usual.gt(0) && amt.gt(usual.times(2)) && amt.minus(usual).gte(10)) {
      out.push({
        type: 'anomaly_merchant',
        severity: 'WATCH',
        title: `${t.merchantName ?? 'Payment'} ${eur(amt.toNumber())} is ${amt.div(usual).toDecimalPlaces(1).toString()}× your usual ${eur0(usual.toNumber())}`,
        body: `Paid on ${t.date}. Worth checking it is correct.`,
        payload: { txId: t.id, amount: m2(amt), usual: m2(usual) },
        fingerprint: `anomaly_merchant:${t.id}`,
      });
    }
  }

  // Category level: this month's spend so far more than 2× the prior 3-month monthly average.
  const month = monthOf(today);
  const prior = [addMonths(month, -1), addMonths(month, -2), addMonths(month, -3)];
  const totals = new Map<string, Map<string, Decimal>>();
  for (const t of spends) {
    if (!t.categoryId || fixed.has(t.categoryId)) continue;
    const m = monthOf(t.date);
    if (m !== month && !prior.includes(m)) continue;
    const byMonth = totals.get(t.categoryId) ?? new Map<string, Decimal>();
    byMonth.set(m, (byMonth.get(m) ?? D(0)).plus(spendOf(t)));
    totals.set(t.categoryId, byMonth);
  }
  for (const [cat, byMonth] of totals) {
    const cur = byMonth.get(month) ?? D(0);
    const avg = sum(prior.map((m) => byMonth.get(m) ?? D(0))).div(3);
    if (avg.gt(0) && cur.gt(avg.times(2)) && cur.minus(avg).gte(30)) {
      const name = categoryNames[cat] ?? 'A category';
      out.push({
        type: 'anomaly_category',
        severity: 'WATCH',
        title: `${name} is already ${cur.div(avg).toDecimalPlaces(1).toString()}× your monthly average`,
        body: `${eur(cur.toNumber())} so far this month against a usual ${eur0(avg.toNumber())}.`,
        payload: { categoryId: cat, month, spent: m2(cur), average: m2(avg) },
        fingerprint: `anomaly_category:${cat}:${month}`,
      });
    }
  }
  return out;
}

/* --------------------------------------------------------------------- trends */

export function trends(
  transactions: readonly CoreTx[],
  today: string,
  categoryNames: Record<string, string> = {},
  opts: { fixedCategoryIds?: readonly string[] } = {},
): Draft[] {
  const month = monthOf(today);
  const day = dayOfMonth(today);
  if (day < 7) return [];
  const dim = daysInMonth(month);
  const prior = [addMonths(month, -1), addMonths(month, -2), addMonths(month, -3)];
  const fixed = new Set(opts.fixedCategoryIds ?? []);
  const sums = new Map<string, Map<string, Decimal>>();
  for (const t of transactions) {
    if (!isSpend(t) || !t.categoryId || fixed.has(t.categoryId)) continue;
    const m = monthOf(t.date);
    if (m !== month && !prior.includes(m)) continue;
    const byMonth = sums.get(t.categoryId) ?? new Map<string, Decimal>();
    byMonth.set(m, (byMonth.get(m) ?? D(0)).plus(spendOf(t)));
    sums.set(t.categoryId, byMonth);
  }
  const out: Draft[] = [];
  for (const [cat, byMonth] of sums) {
    const avg = sum(prior.map((m) => byMonth.get(m) ?? D(0))).div(3);
    if (avg.lt(20)) continue;
    const projected = (byMonth.get(month) ?? D(0)).times(dim).div(day);
    const change = projected.minus(avg).div(avg);
    const name = categoryNames[cat] ?? 'A category';
    if (change.gt('0.25')) {
      out.push({
        type: 'trend_up',
        severity: 'WATCH',
        title: `${name} is trending ${change.times(100).toFixed(0)}% above your 3-month average`,
        body: `On pace for ${eur0(projected.toNumber())} this month against a usual ${eur0(avg.toNumber())}.`,
        payload: { categoryId: cat, month, projected: m2(projected), average: m2(avg) },
        fingerprint: `trend_up:${cat}:${month}`,
      });
    } else if (change.lt('-0.25')) {
      out.push({
        type: 'trend_down',
        severity: 'INFO',
        title: `${name} is ${change.abs().times(100).toFixed(0)}% below your 3-month average`,
        body: `On pace for ${eur0(projected.toNumber())} against a usual ${eur0(avg.toNumber())}.`,
        payload: { categoryId: cat, month, projected: m2(projected), average: m2(avg) },
        fingerprint: `trend_down:${cat}:${month}`,
      });
    }
  }
  return out;
}

/* -------------------------------------------------------------------- slipping */

export interface BudgetHistoryRow {
  categoryId: string;
  name: string;
  /** Completed month, YYYY-MM */
  month: string;
  budget: string;
  spent: string;
}

/** Categories over budget for 2+ completed months in a row, most recent month backwards. */
export function slipping(history: readonly BudgetHistoryRow[], today: string): Draft[] {
  const current = monthOf(today);
  const byCat = new Map<string, BudgetHistoryRow[]>();
  for (const h of history) {
    if (h.month >= current) continue;
    const list = byCat.get(h.categoryId) ?? [];
    list.push(h);
    byCat.set(h.categoryId, list);
  }
  const out: Draft[] = [];
  for (const [cat, rows] of byCat) {
    rows.sort((a, b) => b.month.localeCompare(a.month));
    let streak = 0;
    let expected = addMonths(current, -1);
    for (const r of rows) {
      if (r.month !== expected || D(r.budget).lte(0) || D(r.spent).lte(r.budget)) break;
      streak++;
      expected = addMonths(expected, -1);
    }
    if (streak >= 2) {
      const name = rows[0]!.name;
      out.push({
        type: 'slipping',
        severity: streak >= 3 ? 'ACT' : 'WATCH',
        title: `${name} has been over budget ${streak} months running`,
        body: `Last month ${eur(rows[0]!.spent)} against ${eur0(rows[0]!.budget)}. Raise the budget or change the habit.`,
        payload: { categoryId: cat, streak, lastMonth: rows[0]!.month },
        fingerprint: `slipping:${cat}:${current}`,
      });
    }
  }
  return out;
}

/* ----------------------------------------------------------------- savingsRate */

export interface SavingsRateInput {
  month: string;
  income: string;
  spend: string;
  /** Monthly savings target in EUR */
  target: string;
}

export interface SavingsRate {
  ratePct: number;
  targetPct: number;
  saved: string;
  shortfall: string;
  draft: Draft;
}

export function savingsRate(i: SavingsRateInput): SavingsRate {
  const income = D(i.income);
  const saved = income.minus(i.spend);
  const rate = income.gt(0) ? saved.div(income).times(100) : D(0);
  const targetPct = income.gt(0) ? D(i.target).div(income).times(100) : D(0);
  const shortfall = Decimal.max(D(i.target).minus(saved), 0);
  const severity = rate.isNegative() ? 'ACT' : rate.lt(targetPct) ? 'WATCH' : 'INFO';
  return {
    ratePct: rate.toDecimalPlaces(1).toNumber(),
    targetPct: targetPct.toDecimalPlaces(1).toNumber(),
    saved: m2(saved),
    shortfall: m2(shortfall),
    draft: {
      type: 'savings_rate',
      severity,
      title: `${monthName(i.month)} savings rate: ${rate.toFixed(0)}% (target ${targetPct.toFixed(0)}%)`,
      body: shortfall.gt(0)
        ? `${eur0(saved.toNumber())} saved from ${eur0(income.toNumber())} income. A ${eur0(shortfall.toNumber())} shortfall.`
        : `${eur0(saved.toNumber())} saved from ${eur0(income.toNumber())} income. Target met.`,
      payload: { month: i.month, ratePct: rate.toDecimalPlaces(1).toNumber(), saved: m2(saved), target: m2(i.target) },
      fingerprint: `savings_rate:${i.month}`,
    },
  };
}

/* ------------------------------------------------------------ cashflowForecast */

export interface UpcomingItem {
  date: string;
  /** Signed: negative = money out */
  amount: string;
  label: string;
}

export interface CashflowInput {
  today: string;
  nextPayday: string;
  /** Current balance across accounts that fund day-to-day spending. */
  balance: string;
  upcoming: readonly UpcomingItem[];
  /** Average discretionary spend per day (positive number). */
  avgDailyFlexible: string;
  /** Expected income on payday (added on the payday itself if > 0). */
  expectedIncome?: string;
  /** Warn when the lowest balance falls under this. */
  buffer?: string;
}

export interface CashflowForecast {
  days: Array<{ date: string; balance: string }>;
  low: { date: string; balance: string };
  endBalance: string;
  draft: Draft | null;
}

export function cashflowForecast(i: CashflowInput): CashflowForecast {
  let bal = D(i.balance);
  const days: CashflowForecast['days'] = [];
  let low = { date: i.today, balance: bal };
  let lowCause = '';
  const end = diffDays(i.today, i.nextPayday);
  for (let n = 1; n <= end; n++) {
    const date = addDays(i.today, n);
    bal = bal.minus(i.avgDailyFlexible);
    for (const u of i.upcoming.filter((x) => x.date === date)) {
      bal = bal.plus(u.amount);
      if (D(u.amount).isNegative() && bal.lt(low.balance)) lowCause = u.label;
    }
    if (date === i.nextPayday && i.expectedIncome) bal = bal.plus(i.expectedIncome);
    days.push({ date, balance: m2(bal) });
    if (date !== i.nextPayday && bal.lt(low.balance)) low = { date, balance: bal };
  }
  const buffer = D(i.buffer ?? 100);
  let draft: Draft | null = null;
  if (low.balance.isNegative()) {
    draft = {
      type: 'cashflow_negative',
      severity: 'ACT',
      title: `Your balance could go negative on ${low.date}`,
      body: `Forecast low of ${eur(low.balance.toNumber())} before payday${lowCause ? `, after ${lowCause}` : ''}.`,
      payload: { lowDate: low.date, low: m2(low.balance) },
      fingerprint: `cashflow_negative:${i.nextPayday}`,
    };
  } else if (low.balance.lt(buffer)) {
    draft = {
      type: 'cashflow_tight',
      severity: 'WATCH',
      title: 'Cash gets tight before payday',
      body: `Forecast low of ${eur(low.balance.toNumber())} on ${low.date}.`,
      payload: { lowDate: low.date, low: m2(low.balance) },
      fingerprint: `cashflow_tight:${i.nextPayday}`,
    };
  }
  return { days, low: { date: low.date, balance: m2(low.balance) }, endBalance: m2(bal), draft };
}

/* -------------------------------------------------------------------- netWorth */

export function netWorth(
  accounts: ReadonlyArray<{ balance: string; includeInNetWorth: boolean }>,
  investmentsValue: string = '0',
): string {
  return m2(sum(accounts.filter((a) => a.includeInNetWorth).map((a) => a.balance)).plus(investmentsValue));
}

export interface NetWorthSeriesInput {
  currentMonth: string;
  months: number;
  /** Cash across included accounts today. */
  cashNow: string;
  /** Net movement of included accounts per month (transfers between included accounts cancel out). */
  netByMonth: Readonly<Record<string, string>>;
  /** Investment value at each month end; missing months reuse the nearest later value. */
  investmentByMonth?: Readonly<Record<string, string>>;
  investmentNow?: string;
}

export function netWorthSeries(i: NetWorthSeriesInput): Array<{ month: string; value: string }> {
  const months: string[] = [];
  for (let n = i.months - 1; n >= 0; n--) months.push(addMonths(i.currentMonth, -n));
  const cash = new Map<string, Decimal>();
  let running = D(i.cashNow);
  for (let idx = months.length - 1; idx >= 0; idx--) {
    const m = months[idx]!;
    cash.set(m, running);
    running = running.minus(i.netByMonth[m] ?? 0);
  }
  let inv = D(i.investmentNow ?? 0);
  const invFor = new Map<string, Decimal>();
  for (let idx = months.length - 1; idx >= 0; idx--) {
    const m = months[idx]!;
    const v = i.investmentByMonth?.[m];
    if (v !== undefined) inv = D(v);
    invFor.set(m, inv);
  }
  return months.map((m) => ({ month: m, value: m2((cash.get(m) ?? D(0)).plus(invFor.get(m) ?? 0)) }));
}

/** Convenience: mean of the last `n` values, used by callers computing averages. */
export const average = (values: readonly string[]): string => m2(mean(values));
