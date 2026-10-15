import { Injectable } from '@nestjs/common';
import type { Db } from '@finally/db';
import type { TodayDto as TodayShape } from '@finally/contracts';
import { addDays, D, FLEX_BUDGET_SLUGS, m2, spent, sum, weekLeft, weekStart, weekdayMon0, daysInMonth } from '@finally/finance-core';
import { ActionsService } from '../actions/actions.service';
import { AskService } from '../ask/ask.service';
import { BankingService } from '../banking/banking.service';
import { iso, isoOrNull } from '../common/mappers';
import { InjectDb } from '../common/tokens';
import { PotsService } from '../pots/pots.service';
import { SnapshotService } from '../snapshot/snapshot.service';

@Injectable()
export class TodayService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly snapshot: SnapshotService,
    private readonly actions: ActionsService,
    private readonly pots: PotsService,
    private readonly ask: AskService,
    private readonly banking: BankingService,
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
      since: { count: todays.length, out: m2(out), back: m2(back) },
      ladder: this.pots.ladder(s),
      pins,
      accounts,
      lastSyncAt: isoOrNull(lastSync),
      toSortCount: this.actions.toSort(s).count,
      pending: { count: pending.length, total: m2(sum(pending.map((t) => D(t.amount).neg()))) },
      setupDone: Boolean(s.user.setupDoneAt),
    };
  }

  async snooze(userId: string, actionId: string): Promise<void> {
    await this.actions.snooze(userId, actionId);
  }

  async unsnoozeAll(userId: string): Promise<void> {
    await this.db.actionSnooze.deleteMany({ where: { userId } });
  }
}
