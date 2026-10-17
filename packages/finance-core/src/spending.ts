import { D, m2, sum } from './decimal';
import { diffDays } from './dates';
import { rootSlug, spendList, type LedgerTx } from './ledger';

export interface SpendingChild {
  slug: string;
  spent: string;
  count: number;
}

export interface SpendingGroup {
  /** The budget-line category (a parent, or a category with none); null is spending that is not sorted yet. */
  slug: string | null;
  spent: string;
  /** Payments (refunds net the amount but are not counted). */
  count: number;
  /** Share of the total, 0 to 1. */
  share: number;
  children: SpendingChild[];
}

export interface SpendingSummary {
  from: string;
  to: string;
  total: string;
  count: number;
  average: string;
  perDay: string;
  groups: SpendingGroup[];
}

/**
 * What was spent over a period, by category: the quick answer to "how much on X since Y". Refunds net against what
 * they came from; income, transfers, rent shares and payments you left out of budgets are not spending. Filtered by a
 * category slug, its children count with it.
 */
export function spendingSummary(txs: readonly LedgerTx[], f: { from: string; to: string; slug?: string | null; merchantKey?: string | null }): SpendingSummary {
  const list = spendList(txs, { from: f.from, to: f.to, slug: f.slug ?? undefined, merchantKey: f.merchantKey ?? undefined });
  const total = sum(list.map((t) => D(t.amount).neg()));
  const count = list.filter((t) => t.kind === 'SPEND').length;
  const days = Math.max(1, diffDays(f.from, f.to) + 1);

  const byRoot = new Map<string | null, LedgerTx[]>();
  for (const t of list) {
    const k = rootSlug(t);
    byRoot.set(k, [...(byRoot.get(k) ?? []), t]);
  }
  const groups = [...byRoot.entries()]
    .map(([slug, rows]): SpendingGroup => {
      const spent = sum(rows.map((t) => D(t.amount).neg()));
      const kids = new Map<string, LedgerTx[]>();
      for (const t of rows) if (slug && t.slug && t.slug !== slug) kids.set(t.slug, [...(kids.get(t.slug) ?? []), t]);
      return {
        slug,
        spent: m2(spent),
        count: rows.filter((t) => t.kind === 'SPEND').length,
        share: total.gt(0) ? Math.round(spent.div(total).toNumber() * 10_000) / 10_000 : 0,
        children: [...kids.entries()]
          .map(([cs, ts]): SpendingChild => ({ slug: cs, spent: m2(sum(ts.map((t) => D(t.amount).neg()))), count: ts.filter((t) => t.kind === 'SPEND').length }))
          .sort((a, b) => Number(b.spent) - Number(a.spent)),
      };
    })
    .sort((a, b) => Number(b.spent) - Number(a.spent));
  return {
    from: f.from,
    to: f.to,
    total: m2(total),
    count,
    average: count ? m2(total.div(count)) : '0.00',
    perDay: m2(total.div(days)),
    groups,
  };
}

export interface BudgetTotals {
  budgeted: string;
  spentInBudgets: string;
  /** Negative when the budgets are overspent: it is shown, not hidden. */
  left: string;
  /** Spending in categories that have no budget. */
  outside: string;
  unsorted: string;
  allSpending: string;
}

/** Budgets and spending reconciled: budgeted spending plus what is outside budgets plus what is not sorted equals all spending. */
export function budgetTotals(i: { budgeted: string; spentInBudgets: string; categorisedSpend: string; unsorted: string }): BudgetTotals {
  const inBudgets = D(i.spentInBudgets);
  return {
    budgeted: m2(i.budgeted),
    spentInBudgets: m2(inBudgets),
    left: m2(D(i.budgeted).minus(inBudgets)),
    outside: m2(D(i.categorisedSpend).minus(inBudgets)),
    unsorted: m2(i.unsorted),
    allSpending: m2(D(i.categorisedSpend).plus(i.unsorted)),
  };
}
