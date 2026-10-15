import type { TxKind } from '@finally/contracts';
import type { Decimal} from './decimal';
import { D, m2, sum } from './decimal';
import { addMonths, dayOfMonth, daysInMonth, monthOf } from './dates';

/**
 * A payment as the Today, Money and Plan maths see it: Dublin date, signed EUR amount, and the category slug together
 * with its parent's slug so "Taxi" counts towards "Transport".
 */
export interface LedgerTx {
  id: string;
  date: string;
  /** Signed EUR, negative = money out. */
  amount: string;
  kind: TxKind;
  accountId: string;
  /** AIB or REVOLUT, so questions can say "on AIB". */
  institution: string;
  merchantKey: string | null;
  merchantName: string;
  rawDescriptor: string;
  slug: string | null;
  parentSlug: string | null;
  excluded: boolean;
  pending: boolean;
  /** bounced | returned (a direct debit that failed, and the credit that undid it). */
  flag: string | null;
  note: string | null;
}

/** The ten budget lines, in display order. Everything else rolls up into one of them through its parent. */
export const BUDGET_SLUGS = [
  'rent',
  'bills',
  'subscriptions',
  'groceries',
  'eating-out',
  'coffee',
  'transport',
  'shopping',
  'fun',
  'other',
] as const;
export type BudgetSlug = (typeof BUDGET_SLUGS)[number];

/** Paid on a schedule, so they are not part of the day-to-day allowance. */
export const FIXED_BUDGET_SLUGS: readonly BudgetSlug[] = ['rent', 'bills', 'subscriptions'];
export const FLEX_BUDGET_SLUGS: readonly BudgetSlug[] = BUDGET_SLUGS.filter((s) => !FIXED_BUDGET_SLUGS.includes(s));

export const isFixedSlug = (slug: string): boolean => (FIXED_BUDGET_SLUGS as readonly string[]).includes(slug);

/** Roommates' rent shares and refunds net against the category they came from, so they count with spending. */
export const isSpendish = (t: Pick<LedgerTx, 'kind'>): boolean => t.kind === 'SPEND' || t.kind === 'REFUND' || t.kind === 'SHARE';

/** The budget line a payment belongs to (its parent when it has one). */
export const rootSlug = (t: Pick<LedgerTx, 'slug' | 'parentSlug'>): string | null => t.parentSlug ?? t.slug;

export const catMatch = (t: Pick<LedgerTx, 'slug' | 'parentSlug'>, slug: string): boolean => t.slug === slug || t.parentSlug === slug;

export interface SpendFilter {
  from?: string;
  to?: string;
  /** Category slug; children count towards their parent. */
  slug?: string | null;
  merchantKey?: string | null;
  accountId?: string | null;
  institution?: string | null;
  /** Only payments with no category yet. */
  unsorted?: boolean;
  /** Include payments excluded from budgets. */
  all?: boolean;
  /** Absolute amount bounds on the individual payment. */
  min?: number | null;
  max?: number | null;
}

export function spendList(txs: readonly LedgerTx[], f: SpendFilter = {}): LedgerTx[] {
  return txs.filter((t) => {
    if (!isSpendish(t)) return false;
    if (!f.all && t.excluded) return false;
    if (f.from && t.date < f.from) return false;
    if (f.to && t.date > f.to) return false;
    if (f.unsorted) {
      if (t.slug !== null) return false;
    } else if (f.slug && !catMatch(t, f.slug)) return false;
    if (f.merchantKey && t.merchantKey !== f.merchantKey) return false;
    if (f.accountId && t.accountId !== f.accountId) return false;
    if (f.institution && t.institution !== f.institution) return false;
    if (f.min != null && !(D(t.amount).neg().gt(f.min))) return false;
    if (f.max != null && !(D(t.amount).neg().lt(f.max))) return false;
    return true;
  });
}

/** Net spend (positive = money out) for a filter. */
export function spent(txs: readonly LedgerTx[], f: SpendFilter = {}): Decimal {
  return sum(spendList(txs, f).map((t) => D(t.amount).neg()));
}

/** Money in from income-kind payments. */
export function incomeIn(txs: readonly LedgerTx[], from: string, to: string): Decimal {
  return sum(txs.filter((t) => t.kind === 'INCOME' && t.date >= from && t.date <= to).map((t) => t.amount));
}

/** Round up to the next €5, never below €5: the step budgets move in. */
export const up5 = (n: Decimal | number): number => Math.max(5, Math.ceil(D(n).div(5).toNumber()) * 5);

/* ------------------------------------------------------------------ pace */

/**
 * How much of a category's month you have usually spent by `day`: the average over previous full months of
 * (spent by that day) / (spent that month). Falls back to an even pace when there is no history.
 */
export function paceShare(txs: readonly LedgerTx[], slug: string, day: number, today: string, history = 4): number {
  const month = monthOf(today);
  const dim = daysInMonth(month);
  let acc = 0;
  let n = 0;
  for (let k = history; k >= 1; k--) {
    const m = addMonths(month, -k);
    const list = spendList(txs, { slug, from: `${m}-01`, to: `${m}-31` });
    const total = sum(list.map((t) => D(t.amount).neg()));
    if (total.lte(0)) continue;
    const byDay = sum(list.filter((t) => dayOfMonth(t.date) <= day).map((t) => D(t.amount).neg()));
    acc += byDay.div(total).toNumber();
    n++;
  }
  return n ? Math.min(1, acc / n) : day / dim;
}

/** Where a category is heading by month end, using your own spending curve rather than an even pace. */
export function projectedSpend(txs: readonly LedgerTx[], slug: string, spentSoFar: Decimal, today: string): Decimal {
  const day = dayOfMonth(today);
  const dim = daysInMonth(monthOf(today));
  const share = paceShare(txs, slug, day, today);
  return share > 0.05 ? spentSoFar.div(share) : spentSoFar.div(day).times(dim);
}

/** Flexible budget share you would usually have used by `day`, weighted by each line's budget. */
export function flexPaceShare(
  txs: readonly LedgerTx[],
  budgets: Readonly<Record<string, string>>,
  day: number,
  today: string,
): number {
  const total = sum(FLEX_BUDGET_SLUGS.map((s) => budgets[s] ?? 0));
  if (total.isZero()) return day / daysInMonth(monthOf(today));
  const used = sum(FLEX_BUDGET_SLUGS.map((s) => D(budgets[s] ?? 0).times(paceShare(txs, s, day, today))));
  return used.div(total).toNumber();
}

/**
 * The salary: the biggest family of monthly credits (descriptors that differ only in digits, such as a payroll
 * reference) over the last six months, ignoring one-offs. Null when nothing repeats.
 */
export function findSalary(txs: readonly LedgerTx[], today: string): { amount: string; date: string; day: number; count: number; family: string } | null {
  const cutoff = addMonths(monthOf(today), -8);
  const groups = new Map<string, LedgerTx[]>();
  for (const t of txs) {
    if (t.kind !== 'INCOME' || t.date < `${cutoff}-01` || D(t.amount).lt(1000)) continue;
    const family = t.rawDescriptor.replace(/\d+/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
    groups.set(family, [...(groups.get(family) ?? []), t]);
  }
  let best: { family: string; list: LedgerTx[] } | null = null;
  for (const [family, list] of groups) {
    if (list.length < 2) continue;
    if (!best || list.length > best.list.length) best = { family, list };
  }
  if (!best) return null;
  const sorted = [...best.list].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted[sorted.length - 1]!;
  return { amount: m2(last.amount), date: last.date, day: dayOfMonth(last.date), count: sorted.length, family: best.family };
}
