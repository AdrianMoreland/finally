import { Injectable } from '@nestjs/common';
import type { Db, Prisma } from '@finally/db';
import type { UserPrefs } from '@finally/contracts';
import {
  addDays,
  addMonths,
  BUDGET_SLUGS,
  computeSafeToSpend,
  D,
  detectRepeating,
  dublinDate,
  findSalary,
  FLEX_BUDGET_SLUGS,
  lastPayday,
  m2,
  monthOf,
  nextPayday,
  paydayIn,
  paydaysUntil,
  spent,
  sum,
  tripMonths,
  takeHome,
  upcomingBills,
  type Decimal,
  type LedgerTx,
  type PaceOpts,
  type PayCalendar,
  type Repeating,
  type SafeResult,
  type UpcomingBill,
} from '@finally/finance-core';
import { InjectDb } from '../common/tokens';
import { BudgetsService } from '../budgets/budgets.service';
import { FinanceDataService, type CategoryInfo } from '../data/finance-data.service';
import { LedgerService } from '../data/ledger.service';

export type PotRow = Prisma.PotGetPayload<{ include: { account: { select: { id: true; name: true; balance: true } } } }>;
export type PersonRow = Prisma.PersonGetPayload<{ include: { payments: true } }>;

export interface Snapshot {
  userId: string;
  now: Date;
  today: string;
  month: string;
  user: Prisma.UserGetPayload<object>;
  prefs: UserPrefs;
  cal: PayCalendar;
  /** The payday after today. */
  nextPay: string;
  /** The most recent payday on or before today. */
  lastPay: string;
  cats: CategoryInfo[];
  /** Category slug → name. */
  names: Record<string, string>;
  /** Fourteen months of payments, oldest first. */
  txs: LedgerTx[];
  /** The ten budget lines for this month (rollover included). */
  budgets: Record<string, string>;
  /** Accounts that fund day-to-day spending. */
  spendAccountIds: Set<string>;
  balance: string;
  repeating: Repeating[];
  cancelled: Set<string>;
  upcoming: UpcomingBill[];
  pots: PotRow[];
  people: PersonRow[];
  /** Rent + bills + groceries + transport, per month. */
  essentials: Decimal;
  salary: ReturnType<typeof findSalary>;
  /** What lands each payday. */
  netPay: Decimal;
  /** Learn "your usual pace" from ordinary months only: trip months are left out. */
  pace: PaceOpts;
}

const HISTORY_MONTHS = 14;

/** Loads everything a screen needs in one go, so Today, Plan, Ask and Review agree with each other. */
@Injectable()
export class SnapshotService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly data: FinanceDataService,
    private readonly ledger: LedgerService,
    private readonly budgetsService: BudgetsService,
  ) {}

  async get(userId: string, now = new Date()): Promise<Snapshot> {
    const today = dublinDate(now);
    const month = monthOf(today);
    const prefsLoad = this.ledger.prefs(userId);
    const [user, prefs, cats, txs, budgetData, accounts, pots, people] = await Promise.all([
      this.db.user.findUniqueOrThrow({ where: { id: userId } }),
      prefsLoad,
      this.data.categories(userId),
      prefsLoad.then((p) => this.ledger.txs(userId, `${addMonths(month, -HISTORY_MONTHS)}-01`, today, p)),
      this.budgetsService.rows(userId, month, now),
      this.db.account.findMany({ where: { userId } }),
      this.db.pot.findMany({ where: { userId, archived: false }, orderBy: { sortOrder: 'asc' }, include: { account: { select: { id: true, name: true, balance: true } } } }),
      this.db.person.findMany({ where: { userId }, orderBy: { sortOrder: 'asc' }, include: { payments: { orderBy: { paidOn: 'desc' } } } }),
    ]);

    const cal: PayCalendar = { today, paydayDay: user.paydayDayOfMonth, weekendShift: true };
    const nextPay = nextPayday(addDays(today, 1), user.paydayDayOfMonth, true);
    const lastPay = lastPayday(today, user.paydayDayOfMonth, true);

    const budgets: Record<string, string> = {};
    for (const slug of BUDGET_SLUGS) budgets[slug] = budgetData.rows.find((r) => r.category.slug === slug)?.amount ?? '0.00';

    const spending = accounts.filter((a) => a.type === 'CURRENT' && a.includeInNetWorth);
    const balance = m2(sum(spending.map((a) => a.balance.toString())));
    const last3 = [3, 2, 1].map((k) => addMonths(month, -k));
    const repeating = detectRepeating(txs, today, last3);
    const cancelled = new Set(prefs.subsCancelled);
    const upcoming = upcomingBills(repeating, today, cancelled);
    const salary = findSalary(txs, today);
    const essentials = sum(['rent', 'bills', 'groceries', 'transport'].map((s) => budgets[s] ?? 0));
    const netPay = salary ? D(salary.amount) : D(takeHome(prefs.tax.gross, prefs.tax.year).net / 12);

    return {
      userId,
      now,
      today,
      month,
      user,
      prefs,
      cal,
      nextPay,
      lastPay,
      cats,
      names: Object.fromEntries(cats.map((c) => [c.slug, c.name])),
      txs,
      budgets,
      spendAccountIds: new Set(spending.map((a) => a.id)),
      balance,
      repeating,
      cancelled,
      upcoming,
      pots,
      people,
      essentials,
      salary,
      netPay,
      pace: { tripMonths: tripMonths(prefs.trips) },
    };
  }

  /** The spending balance as it stood at the end of `asOf` (later payments taken back out). */
  balanceAt(s: Snapshot, asOf: string): Decimal {
    const later = sum(s.txs.filter((t) => t.date > asOf && s.spendAccountIds.has(t.accountId)).map((t) => t.amount));
    return D(s.balance).minus(later);
  }

  /** The safe-to-spend working as it stood at the end of `asOf` (today, or yesterday for "since you last looked"). */
  safeAt(s: Snapshot, asOf = s.today): SafeResult {
    const monthFrom = `${s.month}-01`;
    const spentBySlug: Record<string, string> = {};
    for (const slug of FLEX_BUDGET_SLUGS) spentBySlug[slug] = m2(spent(s.txs, { slug, from: monthFrom, to: asOf }));
    const billsBeforePayday = sum(upcomingBills(s.repeating, asOf, s.cancelled).filter((b) => b.date < s.nextPay).map((b) => b.amount));
    return computeSafeToSpend({
      today: asOf,
      nextPayday: s.nextPay,
      budgets: s.budgets,
      spentBySlug,
      unsorted: m2(spent(s.txs, { unsorted: true, from: monthFrom, to: asOf })),
      balance: m2(this.balanceAt(s, asOf)),
      billsBeforePayday: m2(billsBeforePayday),
      buffer: s.user.bufferAmount.toString(),
    });
  }

  /** How many paydays fall on or before a date, for pots with a deadline. */
  paydaysBy(s: Snapshot, by: string): number {
    return paydaysUntil(s.today, s.user.paydayDayOfMonth, by, true);
  }

  /** The payday of a given month, after the weekend rule. */
  paydayOf(s: Snapshot, month: string): string {
    return paydayIn(month, s.user.paydayDayOfMonth, true);
  }

  /** Effective balance of a pot: the linked vault's balance when there is one. */
  potBalance(p: PotRow): string {
    return p.account ? m2(p.account.balance.toString()) : m2(p.balance.toString());
  }

  /** Money paid so far towards a person, from logged payments and from matching transfers. */
  personPaid(s: Snapshot, p: PersonRow): Decimal {
    const logged = sum(p.payments.map((x) => x.amount.toString()));
    if (!p.merchantKey) return logged;
    const since = p.since.toISOString().slice(0, 10);
    const sign = p.direction === 'OWED' ? 1 : -1;
    const matched = sum(
      s.txs.filter((t) => t.merchantKey === p.merchantKey && t.date >= since && Math.sign(Number(t.amount)) === sign).map((t) => D(t.amount).abs()),
    );
    return logged.plus(matched);
  }
}
