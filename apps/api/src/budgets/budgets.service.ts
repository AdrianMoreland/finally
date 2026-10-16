import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Db } from '@finally/db';
import type { BudgetRow, BudgetsResponse, UpsertBudgetBody } from '@finally/contracts';
import {
  addMonths,
  D,
  dayOfMonth,
  daysInMonth,
  dublinDate,
  m2,
  monthOf,
  pacing,
  paceShare,
  tripMonths,
  type BudgetHistoryRow,
  type BudgetLine,
  type Decimal,
} from '@finally/finance-core';
import { InjectDb } from '../common/tokens';
import { FinanceDataService } from '../data/finance-data.service';
import { LedgerService } from '../data/ledger.service';

const lastDay = (month: string): string => `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;

@Injectable()
export class BudgetsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly data: FinanceDataService,
    private readonly ledger: LedgerService,
  ) {}

  /** A month with no budgets yet starts from the most recent earlier month that has some. */
  async ensureMonth(userId: string, month: string): Promise<void> {
    const today = monthOf(dublinDate(new Date()));
    if (month < today) return;
    if ((await this.db.budget.count({ where: { userId, month } })) > 0) return;
    const prev = await this.db.budget.findFirst({ where: { userId, month: { lt: month } }, orderBy: { month: 'desc' } });
    if (!prev) return;
    const rows = await this.db.budget.findMany({ where: { userId, month: prev.month } });
    await this.db.budget.createMany({
      data: rows.map((r) => ({ userId, categoryId: r.categoryId, month, amount: r.amount, rollover: r.rollover })),
      skipDuplicates: true,
    });
  }

  async rows(userId: string, month: string, now = new Date()): Promise<BudgetsResponse> {
    await this.ensureMonth(userId, month);
    const today = dublinDate(now);
    const thisMonth = monthOf(today);
    const dim = daysInMonth(month);
    const day = month === thisMonth ? dayOfMonth(today) : month < thisMonth ? dim : 0;

    const cats = await this.data.categories(userId);
    // The tick on each bar is your own usual pace: learned from the last four ordinary months, trips left out.
    const prefs = month === thisMonth ? await this.ledger.prefs(userId) : null;
    const ledgerTxs = prefs ? await this.ledger.txs(userId, `${addMonths(month, -9)}-01`, today, prefs) : [];
    const away = prefs ? tripMonths(prefs.trips) : new Set<string>();
    const budgetable = cats.filter((c) => !c.archived && (c.group === 'ESSENTIALS' || c.group === 'LIFESTYLE'));
    const first = addMonths(month, -6);
    const [budgets, txs] = await Promise.all([
      this.db.budget.findMany({ where: { userId, month: { gte: first, lte: month } } }),
      this.data.coreTxs(userId, `${first}-01`, lastDay(month)),
    ]);

    const spentByMonth = new Map<string, Map<string, Decimal>>();
    for (let m = first; m <= month; m = addMonths(m, 1)) {
      spentByMonth.set(
        m,
        this.data.spendByCategory(
          txs.filter((t) => monthOf(t.date) === m),
          cats,
          true,
        ),
      );
    }
    const budgetAt = (m: string, catId: string) => budgets.find((b) => b.month === m && b.categoryId === catId);

    /** Unspent budget carried in from earlier months while rollover stays on. Overspend is not carried. */
    const carriedIn = (catId: string, m: string, depth = 0): Decimal => {
      if (depth >= 6) return D(0);
      const prevMonth = addMonths(m, -1);
      const prev = budgetAt(prevMonth, catId);
      if (!prev || !prev.rollover) return D(0);
      const left = D(prev.amount.toString())
        .plus(carriedIn(catId, prevMonth, depth + 1))
        .minus(spentByMonth.get(prevMonth)?.get(catId) ?? 0);
      return left.gt(0) ? left : D(0);
    };

    const spentNow = spentByMonth.get(month) ?? new Map<string, Decimal>();
    const rows: BudgetRow[] = [];
    for (const c of budgetable) {
      const b = budgetAt(month, c.id);
      const spent = spentNow.get(c.id) ?? D(0);
      if (!b && spent.lte(0)) continue;
      if (!b && c.parentId) continue; // children appear only with their own budget
      const base = b ? D(b.amount.toString()) : D(0);
      const carry = b?.rollover ? carriedIn(c.id, month) : D(0);
      const amount = base.plus(carry);
      const p = pacing(m2(amount), m2(spent), Math.max(day, 1), dim);
      rows.push({
        categoryId: c.id,
        category: { id: c.id, name: c.name, slug: c.slug, colour: c.colour, icon: c.icon, parentId: c.parentId },
        month,
        budgetId: b?.id ?? null,
        amount: m2(amount),
        baseAmount: m2(base),
        rollover: b?.rollover ?? false,
        carriedIn: m2(carry),
        spent: m2(spent),
        expectedByToday:
          day === 0 ? '0.00' : month < thisMonth ? m2(amount) : c.fixed ? p.expectedByToday : m2(amount.times(paceShare(ledgerTxs, c.slug, day, today, { tripMonths: away }))),
        projected: month < thisMonth ? m2(spent) : p.projected,
        fixed: c.fixed,
      });
    }
    const hasRow = new Set(rows.map((r) => r.categoryId));
    const counted = rows.filter((r) => !r.category.parentId || !hasRow.has(r.category.parentId));
    return {
      month,
      dayOfMonth: day,
      daysInMonth: dim,
      rows,
      totalBudget: m2(counted.reduce((a, r) => a.plus(r.amount), D(0))),
      totalSpent: m2(counted.reduce((a, r) => a.plus(r.spent), D(0))),
    };
  }

  /** The shape finance-core's pacing insight consumes. */
  async lines(userId: string, month: string, now = new Date()): Promise<BudgetLine[]> {
    const r = await this.rows(userId, month, now);
    return r.rows
      .filter((x) => !x.category.parentId)
      .map((x) => ({ categoryId: x.categoryId, name: x.category.name, amount: x.amount, spent: x.spent, fixed: x.fixed }));
  }

  /** Completed months of budget vs actual, for the "slipping" insight. */
  async history(userId: string, months: number, now = new Date()): Promise<BudgetHistoryRow[]> {
    const thisMonth = monthOf(dublinDate(now));
    const out: BudgetHistoryRow[] = [];
    for (let i = 1; i <= months; i++) {
      const m = addMonths(thisMonth, -i);
      const r = await this.rows(userId, m, now);
      for (const row of r.rows) {
        if (row.category.parentId || row.fixed) continue;
        out.push({ categoryId: row.categoryId, name: row.category.name, month: m, budget: row.amount, spent: row.spent });
      }
    }
    return out;
  }

  async upsert(userId: string, body: UpsertBudgetBody): Promise<BudgetsResponse> {
    const cat = await this.db.category.findFirst({ where: { id: body.categoryId, userId } });
    if (!cat) throw new NotFoundException('Category not found');
    if (cat.group === 'INCOME' || cat.group === 'TRANSFER') throw new BadRequestException('This category cannot have a budget');
    const amount = m2(body.amount);
    await this.db.budget.upsert({
      where: { userId_categoryId_month: { userId, categoryId: body.categoryId, month: body.month } },
      update: { amount, rollover: body.rollover },
      create: { userId, categoryId: body.categoryId, month: body.month, amount, rollover: body.rollover },
    });
    return this.rows(userId, body.month);
  }

  async remove(userId: string, categoryId: string, month: string): Promise<BudgetsResponse> {
    await this.db.budget.deleteMany({ where: { userId, categoryId, month } });
    return this.rows(userId, month);
  }
}
