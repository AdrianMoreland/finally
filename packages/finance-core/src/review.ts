import { D, Decimal, m2, median } from './decimal';
import { addMonths } from './dates';
import {
  BUDGET_SLUGS,
  FIXED_BUDGET_SLUGS,
  FLEX_BUDGET_SLUGS,
  incomeIn,
  projectedSpend,
  spent,
  up5,
  type LedgerTx,
} from './ledger';
import { eur0 } from './types';

const monthEndOf = (m: string): string => `${m}-31`;

/** The middle month of the last three, rounded up to the next €5: calm, and not thrown by one odd month. */
export function budgetSuggestions(txs: readonly LedgerTx[], today: string, slugs: readonly string[] = BUDGET_SLUGS): Record<string, string> {
  const month = today.slice(0, 7);
  const last3 = [3, 2, 1].map((k) => addMonths(month, -k));
  const out: Record<string, string> = {};
  for (const s of slugs) {
    const values = last3.map((m) => spent(txs, { slug: s, from: `${m}-01`, to: monthEndOf(m) }));
    out[s] = String(up5(median(values)));
  }
  return out;
}

export interface BudgetLineReview {
  slug: string;
  spent: string;
  budget: string;
  projected: string;
}

/** The flexible line furthest ahead of your usual pace, and the one with most room to give. */
export function reviewBudget(
  txs: readonly LedgerTx[],
  budgets: Readonly<Record<string, string>>,
  today: string,
): { worst: BudgetLineReview | null; room: BudgetLineReview | null } {
  const month = today.slice(0, 7);
  const rows = FLEX_BUDGET_SLUGS.map((slug) => {
    const s = spent(txs, { slug, from: `${month}-01`, to: today });
    return { slug, s, b: D(budgets[slug] ?? 0), pj: projectedSpend(txs, slug, s, today) };
  }).filter((r) => r.s.gt(0) && r.b.gt(0));
  if (!rows.length) return { worst: null, room: null };
  const view = (r: (typeof rows)[number]): BudgetLineReview => ({ slug: r.slug, spent: m2(r.s), budget: m2(r.b), projected: m2(r.pj) });
  const worst = [...rows].sort((a, b) => b.pj.div(b.b).comparedTo(a.pj.div(a.b)))[0]!;
  const room = [...rows].sort((a, b) => b.b.minus(b.pj).comparedTo(a.b.minus(a.pj)))[0]!;
  return { worst: view(worst), room: view(room) };
}

export interface WeeklyDecision {
  value: string;
  label: string;
}

/** Up to three things to choose from for the week ahead. */
export function weeklyDecisions(
  worst: BudgetLineReview | null,
  room: BudgetLineReview | null,
  names: Readonly<Record<string, string>>,
): WeeklyDecision[] {
  const out: WeeklyDecision[] = [];
  const n = (s: string): string => names[s] ?? s;
  if (worst && room && D(worst.projected).gt(worst.budget) && room.slug !== worst.slug) {
    const mv = up5(Decimal.min(D(worst.projected).minus(worst.budget), Decimal.max(5, D(room.budget).minus(room.projected))));
    out.push({ value: `move|${worst.slug}|${room.slug}|${mv}`, label: `Move ${eur0(mv)} from ${n(room.slug)} to ${n(worst.slug)}` });
  }
  if (worst) out.push({ value: `ease|${worst.slug}`, label: `Go easy on ${n(worst.slug)} until payday` });
  out.push({ value: 'keep', label: 'Leave everything as it is' });
  return out;
}

export interface MonthCloseRow {
  slug: string;
  planned: string;
  spent: string;
  difference: string;
}

export interface MonthClose {
  month: string;
  cameIn: string;
  spent: string;
  paidBack: string;
  kept: string;
  keptPct: number;
  rows: MonthCloseRow[];
  /** Biggest rise on the month before, among flexible lines. */
  jump: { slug: string; by: string } | null;
  options: Array<{ value: string; label: string }>;
}

/** Look back at a full month: what came in, what went out, how it compared with the plan, and one change to make. */
export function monthClose(
  txs: readonly LedgerTx[],
  month: string,
  budgets: Readonly<Record<string, string>>,
  paidBack: string,
  names: Readonly<Record<string, string>>,
): MonthClose {
  const from = `${month}-01`;
  const to = monthEndOf(month);
  const before = addMonths(month, -1);
  const inc = incomeIn(txs, from, to);
  const out = spent(txs, { from, to });
  const kept = inc.minus(out).minus(paidBack);
  const rows = BUDGET_SLUGS.map((slug) => {
    const s = spent(txs, { slug, from, to });
    return { slug, b: D(budgets[slug] ?? 0), s, d: s.minus(budgets[slug] ?? 0) };
  }).sort((a, b) => b.d.comparedTo(a.d));
  const jumpRow = rows
    .filter((r) => !FIXED_BUDGET_SLUGS.includes(r.slug as never))
    .map((r) => ({ ...r, j: r.s.minus(spent(txs, { slug: r.slug, from: `${before}-01`, to: monthEndOf(before) })) }))
    .sort((a, b) => b.j.comparedTo(a.j))[0];
  const top = rows.find((r) => !FIXED_BUDGET_SLUGS.includes(r.slug as never) && r.d.gt(0));
  const n = (s: string): string => names[s] ?? s;
  const options: MonthClose['options'] = top
    ? [
        { value: `raise|${top.slug}|${up5(top.d)}`, label: `Raise ${n(top.slug)} to ${eur0(top.b.plus(up5(top.d)).toFixed(0))} to match real life` },
        { value: `hold|${top.slug}`, label: `Keep ${n(top.slug)} at ${eur0(top.b.toFixed(0))} and spend less there` },
      ]
    : [];
  options.push({ value: 'none', label: 'No change this month' });
  return {
    month,
    cameIn: m2(inc),
    spent: m2(out),
    paidBack: m2(paidBack),
    kept: m2(kept),
    keptPct: inc.gt(0) ? kept.div(inc).times(100).toNumber() : 0,
    rows: rows.map((r) => ({ slug: r.slug, planned: m2(r.b), spent: m2(r.s), difference: m2(r.d) })),
    jump: jumpRow && jumpRow.j.gt(0) ? { slug: jumpRow.slug, by: m2(jumpRow.j) } : null,
    options,
  };
}

/** Next Sunday at or after `date`, when the weekly review is due. */
export function nextReviewDay(date: string): string {
  const wd = new Date(`${date}T12:00:00Z`).getUTCDay();
  const add = (7 - wd) % 7 || 7;
  return new Date(Date.parse(`${date}T12:00:00Z`) + add * 86_400_000).toISOString().slice(0, 10);
}
