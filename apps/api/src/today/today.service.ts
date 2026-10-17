import { Injectable } from '@nestjs/common';
import type { Db } from '@finally/db';
import type { TodayDto as TodayShape } from '@finally/contracts';
import { addDays, D, FLEX_BUDGET_SLUGS, m2, spent, sum, weekLeft, weekStart, weekdayMon0, daysInMonth } from '@finally/finance-core';
import { BillsService } from '../money/bills.service';
import { MonthService } from '../money/month.service';
import { PeopleService } from '../people/people.service';
import { TransactionsService, txInclude } from '../transactions/transactions.service';
import { ActionsService } from '../actions/actions.service';
import { AskService } from '../ask/ask.service';
import { BankingService } from '../banking/banking.service';
import { iso, isoOrNull } from '../common/mappers';
import { InjectDb } from '../common/tokens';
import { PotsService } from '../pots/pots.service';
import { SnapshotService, type Snapshot } from '../snapshot/snapshot.service';

@Injectable()
export class TodayService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly snapshot: SnapshotService,
    private readonly actions: ActionsService,
    private readonly pots: PotsService,
    private readonly ask: AskService,
    private readonly banking: BankingService,
    private readonly bills: BillsService,
    private readonly month: MonthService,
    private readonly people: PeopleService,
    private readonly transactions: TransactionsService,
  ) {}

  async get(userId: string, now = new Date()): Promise<TodayShape> {
    const s = await this.snapshot.get(userId, now);
    const safe = this.snapshot.safeAt(s);
    const safeYesterday = this.snapshot.safeAt(s, addDays(s.today, -1));

    const wk = weekStart(s.today);
    const flexSpentWeek = sum(FLEX_BUDGET_SLUGS.map((k) => spent(s.txs, { slug: k, from: wk, to: s.today }))).plus(spent(s.txs, { unsorted: true, from: wk, to: s.today }));
    const week = weekLeft({ flexBudget: safe.flexBudget, daysInMonth: daysInMonth(s.month), spentThisWeek: m2(flexSpentWeek), weekdayMon0: weekdayMon0(s.today) });

    const all = await this.actions.list(s, true);
    const snoozedIds = await this.actions.snoozedIds(userId, s.today);
    const actions = all.filter((a) => !snoozedIds.has(a.id));

    const todays = s.txs.filter((t) => t.date === s.today && t.kind !== 'TRANSFER');
    const out = sum(todays.filter((t) => D(t.amount).lt(0)).map((t) => D(t.amount).neg()));
    const back = sum(todays.filter((t) => D(t.amount).gt(0)).map((t) => t.amount));
    const pending = s.txs.filter((t) => t.pending);

    const [accounts, conns, pins] = await Promise.all([
      this.banking.listAccounts(userId),
      this.db.bankConnection.findMany({ where: { userId }, select: { lastSyncAt: true } }),
      this.ask.pins(userId),
    ]);
    const [recentRows, billsData] = await Promise.all([
      this.db.transaction.findMany({
        where: { userId, kind: { not: 'TRANSFER' }, bookingDate: { gte: new Date(`${addDays(s.today, -3)}T00:00:00Z`) } },
        include: txInclude,
        orderBy: [{ bookingDate: 'desc' }, { id: 'desc' }],
        take: 30,
      }),
      this.bills.build(s),
    ]);
    const sinceItems = await this.transactions.withRentSplits(userId, recentRows.map((r) => this.transactions.toDto(r)));
    const owed = this.people.build(s).owed.filter((p) => D(p.left).gt(0));
    const month = this.month.build(s);
    const upcoming = billsData.upcoming.filter((b) => b.date < s.nextPay).slice(0, 6);
    const salary = s.netPay.toFixed(2);
    const lastSync = conns.reduce<Date | null>((m, c) => (c.lastSyncAt && (!m || c.lastSyncAt > m) ? c.lastSyncAt : m), null);

    return {
      asOf: iso(now),
      today: s.today,
      nextPayday: s.nextPay,
      daysToPayday: safe.daysLeft,
      safe,
      safeYesterday: safeYesterday.perDay,
      week,
      actions,
      snoozed: all.length - actions.length,
      kpis: {
        payday: { date: s.nextPay, daysAway: safe.daysLeft, amount: m2(salary) },
        owed: { total: m2(sum(owed.map((p) => p.left))), people: owed.slice(0, 3).map((p) => ({ name: p.name, amount: p.left })) },
        runway: this.runway(s),
        netWorth: { value: month.netWorth.current, changeSixMonths: month.netWorth.changeSixMonths },
      },
      comingUp: { items: upcoming.map((b) => ({ date: b.date, name: b.name, amount: b.amount, varies: b.varies })), payday: { date: s.nextPay, amount: m2(salary) } },
      since: { count: todays.length, out: m2(out), back: m2(back), items: sinceItems, at: null },
      ladder: this.pots.ladder(s),
      pins,
      accounts,
      lastSyncAt: isoOrNull(lastSync),
      toSortCount: this.actions.toSort(s).count,
      pending: { count: pending.length, total: m2(sum(pending.map((t) => D(t.amount).neg()))) },
      setupDone: Boolean(s.user.setupDoneAt),
    };
  }

  /** Months the rainy-day pot covers essentials, and what three months would be. */
  private runway(s: Snapshot): { months: string; saved: string; threeMonths: string } {
    const rainy = s.pots.find((p) => p.type === 'SAFETY');
    const saved = rainy ? D(this.snapshot.potBalance(rainy)) : D(0);
    const ess = s.essentials;
    return { months: ess.gt(0) ? saved.div(ess).toFixed(1) : '0.0', saved: m2(saved), threeMonths: m2(ess.times(3)) };
  }

  async snooze(userId: string, actionId: string): Promise<void> {
    await this.actions.snooze(userId, actionId);
  }

  async unsnoozeAll(userId: string): Promise<void> {
    await this.db.actionSnooze.deleteMany({ where: { userId } });
  }
}
