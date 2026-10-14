import { Injectable } from '@nestjs/common';
import type { Db } from '@finally/db';
import type { Overview } from '@finally/contracts';
import {
  addDays,
  addMonths,
  D,
  dayOfMonth,
  daysInMonth,
  diffDays,
  dublinDate,
  lastPayday,
  m2,
  median,
  monthOf,
  netWorthSeries,
  nextPayday,
  safeToSpend,
  sum,
} from '@finally/finance-core';
import { BankingService } from '../banking/banking.service';
import { BudgetsService } from '../budgets/budgets.service';
import { iso, isoOrNull } from '../common/mappers';
import { InjectDb } from '../common/tokens';
import { FinanceDataService } from '../data/finance-data.service';
import { InsightsService } from '../insights/insights.service';
import { InvestmentsService } from '../investments/investments.service';
import { TransactionsService } from '../transactions/transactions.service';

@Injectable()
export class OverviewService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly data: FinanceDataService,
    private readonly budgets: BudgetsService,
    private readonly banking: BankingService,
    private readonly insights: InsightsService,
    private readonly investments: InvestmentsService,
    private readonly transactions: TransactionsService,
  ) {}

  /** Safe-to-spend for the pay cycle containing `today`. See finance-core `safeToSpend` for the formula. */
  async safeToSpendFor(userId: string, now = new Date()) {
    const today = dublinDate(now);
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    const cats = await this.data.categories(userId);
    const fixedIds = new Set(cats.filter((c) => c.fixed).map((c) => c.id));
    const cycleStart = lastPayday(today, user.paydayDayOfMonth);
    const nextPay = nextPayday(addDays(today, 1), user.paydayDayOfMonth);
    const daysToPayday = Math.max(1, diffDays(today, nextPay));

    const txs = await this.data.coreTxs(userId, addDays(`${addMonths(monthOf(today), -4)}-01`, 0), today);
    const cycle = txs.filter((t) => t.date >= cycleStart);
    let income = sum(cycle.filter((t) => t.kind === 'INCOME').map((t) => t.amountEur));
    if (income.isZero()) {
      // Salary has not landed yet this cycle: plan with the usual one.
      income = median(txs.filter((t) => t.kind === 'INCOME' && D(t.amountEur).gte(1000)).map((t) => t.amountEur));
    }
    const spendNet = (list: typeof cycle) => sum(list.filter((t) => t.kind === 'SPEND' || t.kind === 'REFUND').map((t) => D(t.amountEur).neg()));
    const fixedPaid = spendNet(cycle.filter((t) => t.categoryId && fixedIds.has(t.categoryId)));
    const flexible = spendNet(cycle.filter((t) => !(t.categoryId && fixedIds.has(t.categoryId))));

    const month = monthOf(today);
    const current = await this.budgets.rows(userId, month, now);
    let remaining = sum(current.rows.filter((r) => r.fixed && !r.category.parentId).map((r) => D(r.amount).minus(r.spent).clamp(0, Infinity)));
    if (monthOf(nextPay) !== month) {
      // Next month's fixed bills (rent on the 1st) fall due before the next payday.
      remaining = remaining.plus(sum(current.rows.filter((r) => r.fixed && !r.category.parentId).map((r) => r.amount)));
    }
    const result = safeToSpend(
      {
        income: m2(income),
        fixedBillsPaid: m2(fixedPaid),
        remainingFixedBills: m2(remaining),
        savingsTarget: user.monthlySavingsTarget.toString(),
        flexibleSpent: m2(flexible),
        daysToPayday,
      },
      today,
    );
    return { ...result, billsToCome: m2(remaining), nextPay, daysToPayday };
  }

  async get(userId: string, now = new Date()): Promise<Overview> {
    const today = dublinDate(now);
    const month = monthOf(today);
    const day = dayOfMonth(today);
    const dim = daysInMonth(month);

    const [cats, accounts, budgetData, safe, latest, recent, openCount, conns] = await Promise.all([
      this.data.categories(userId),
      this.banking.listAccounts(userId),
      this.budgets.rows(userId, month, now),
      this.safeToSpendFor(userId, now),
      this.insights.latest(userId, 4),
      this.transactions.list(userId, { limit: 7 }),
      this.db.categorisationRequest.count({ where: { userId, status: 'OPEN' } }),
      this.db.bankConnection.findMany({ where: { userId }, select: { lastSyncAt: true } }),
    ]);

    // Net worth: cash across included accounts plus investments, rebuilt month by month
    const included = new Set(accounts.filter((a) => a.includeInNetWorth).map((a) => a.id));
    const cashNow = sum(accounts.filter((a) => a.includeInNetWorth).map((a) => a.balance));
    const from = `${addMonths(month, -12)}-01`;
    const history = await this.data.coreTxs(userId, from, today);
    const netByMonth: Record<string, string> = {};
    for (const t of history) {
      if (!included.has(t.accountId)) continue;
      netByMonth[monthOf(t.date)] = D(netByMonth[monthOf(t.date)] ?? 0).plus(t.amountEur).toString();
    }
    const months = Array.from({ length: 12 }, (_, i) => addMonths(month, i - 11));
    const investNow = await this.investments.totalValue(userId);
    const investByMonth = await this.investments.monthEndValues(userId, months, today);
    const series = netWorthSeries({
      currentMonth: month,
      months: 12,
      cashNow: m2(cashNow),
      netByMonth,
      investmentByMonth: investByMonth,
      investmentNow: investNow,
    });
    const current = series.at(-1)?.value ?? m2(cashNow);

    // Spending this month
    const monthTxs = history.filter((t) => monthOf(t.date) === month);
    const rent = cats.find((c) => c.slug === 'rent');
    const flexRows = budgetData.rows.filter((r) => !r.fixed && !r.category.parentId);
    const flexBudget = sum(flexRows.map((r) => r.amount));
    const flexSpent = sum(flexRows.map((r) => r.spent));

    const byCat = this.data.spendByCategory(monthTxs, cats, true);
    const topCategories = cats
      .filter((c) => !c.parentId && c.id !== rent?.id && (byCat.get(c.id) ?? D(0)).gt(0) && (c.group === 'ESSENTIALS' || c.group === 'LIFESTYLE'))
      .map((c) => ({
        category: { id: c.id, name: c.name, slug: c.slug, colour: c.colour, icon: c.icon, parentId: c.parentId },
        spent: m2(byCat.get(c.id) ?? 0),
      }))
      .sort((a, b) => Number(b.spent) - Number(a.spent))
      .slice(0, 8);

    const perDay = new Map<number, ReturnType<typeof D>>();
    for (const t of monthTxs) {
      if (t.kind !== 'SPEND' && t.kind !== 'REFUND') continue;
      if (rent && t.categoryId === rent.id) continue;
      const d = dayOfMonth(t.date);
      perDay.set(d, (perDay.get(d) ?? D(0)).plus(D(t.amountEur).neg()));
    }
    const rentBudget = budgetData.rows.find((r) => r.categoryId === rent?.id)?.amount ?? '0';
    const evenPace = D(budgetData.totalBudget).minus(rentBudget).div(dim);

    return {
      asOf: iso(now),
      month,
      dayOfMonth: day,
      daysInMonth: dim,
      daysToPayday: safe.daysToPayday,
      paydayDate: safe.nextPay,
      netWorth: {
        current,
        change12m: m2(D(current).minus(series[0]?.value ?? current)),
        series,
      },
      safeToSpend: { perDay: safe.perDay, leftToPayday: safe.leftToPayday, billsToCome: safe.billsToCome },
      flexible: {
        spent: m2(flexSpent),
        budget: m2(flexBudget),
        expectedByToday: m2(flexBudget.times(day).div(dim)),
      },
      topCategories,
      spendByDay: Array.from({ length: day }, (_, i) => ({ day: i + 1, spent: m2(perDay.get(i + 1) ?? 0) })),
      evenPacePerDay: m2(evenPace),
      latestInsights: latest,
      recentTransactions: recent.items,
      toSortCount: openCount,
      accounts,
      lastSyncAt: isoOrNull(conns.reduce<Date | null>((m, c) => (c.lastSyncAt && (!m || c.lastSyncAt > m) ? c.lastSyncAt : m), null)),
    };
  }
}
