import { Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Db } from '@finally/db';
import type { Institution, InsightDto, InsightsResponse, RecurringDto } from '@finally/contracts';
import {
  addDays,
  addMonths,
  anomalies,
  budgetPacing,
  cashflowForecast,
  D,
  detectRecurring,
  diffDays,
  dublinDate,
  eur,
  leaks,
  m2,
  median,
  monthOf,
  nextPayday,
  savingsRate,
  slipping,
  sum,
  trends,
  type Draft,
} from '@finally/finance-core';
import { ENV, type Env } from '../common/env';
import { iso, isoOrNull } from '../common/mappers';
import { InjectDb } from '../common/tokens';
import { BudgetsService } from '../budgets/budgets.service';
import { FinanceDataService } from '../data/finance-data.service';
import { JobsService } from '../jobs/jobs.service';
import { PushService } from '../notifications/push.service';
import { Inject } from '@nestjs/common';

const DUBLIN = 'Europe/Dublin';
const PRODUCED_TYPES = [
  'budget_over', 'budget_pace', 'leak', 'anomaly_merchant', 'anomaly_category', 'trend_up', 'trend_down',
  'slipping', 'savings_rate', 'cashflow_negative', 'cashflow_tight', 'price_change', 'renewal_soon', 'new_subscription',
];

@Injectable()
export class InsightsService implements OnModuleInit {
  private readonly log = new Logger(InsightsService.name);

  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly data: FinanceDataService,
    private readonly budgets: BudgetsService,
    private readonly push: PushService,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit(): void {
    this.jobs.register('insights', async (d) => {
      if (d.userId) await this.runForUser(d.userId);
    });
    this.jobs.register('weekly-digest', async (d) => {
      if (d.userId) await this.weeklyDigest(d.userId);
    });
  }

  /* ----------------------------------------------------------- schedules */

  @Cron('0 30 2 * * *', { name: 'insights-nightly', timeZone: DUBLIN })
  async nightly(): Promise<void> {
    if (this.env.DISABLE_JOBS) return;
    for (const u of await this.db.user.findMany({ select: { id: true } })) {
      await this.jobs.enqueue('insights', { userId: u.id }, `insights:${u.id}`);
    }
  }

  @Cron('0 0 19 * * 0', { name: 'weekly-digest', timeZone: DUBLIN })
  async weekly(): Promise<void> {
    if (this.env.DISABLE_JOBS) return;
    for (const u of await this.db.user.findMany({ select: { id: true } })) {
      await this.jobs.enqueue('weekly-digest', { userId: u.id }, `weekly:${u.id}`);
    }
  }

  /* ----------------------------------------------------------------- run */

  /** Compute every insight from the user's data, persist by fingerprint, push new ACT items. */
  async runForUser(userId: string, now = new Date()): Promise<{ count: number }> {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) return { count: 0 };
    const today = dublinDate(now);
    const month = monthOf(today);
    const [cats, accounts] = await Promise.all([
      this.data.categories(userId),
      this.db.account.findMany({ where: { userId } }),
    ]);
    const names = Object.fromEntries(cats.map((c) => [c.id, c.name]));
    const fixedIds = cats.filter((c) => c.fixed).map((c) => c.id);
    const subsId = cats.find((c) => c.slug === 'subscriptions')?.id ?? null;
    const txs = await this.data.coreTxs(userId, addDays(`${addMonths(month, -13)}-01`, 0), today);

    const drafts: Draft[] = [];
    drafts.push(...budgetPacing(today, await this.budgets.lines(userId, month, now)));
    drafts.push(...slipping(await this.budgets.history(userId, 4, now), today));
    drafts.push(...trends(txs, today, names, { fixedCategoryIds: fixedIds }));
    drafts.push(...anomalies(txs, today, names, { fixedCategoryIds: fixedIds }));
    drafts.push(...leaks(txs, today, names, { ignoreCategoryIds: fixedIds }));

    const recurring = detectRecurring(txs, today, { subscriptionCategoryId: subsId });
    drafts.push(...recurring.drafts);
    await this.saveRecurring(userId, recurring.series);

    // Savings rate for the last completed month
    const prev = addMonths(month, -1);
    const prevTxs = txs.filter((t) => monthOf(t.date) === prev);
    const income = sum(prevTxs.filter((t) => t.kind === 'INCOME').map((t) => t.amountEur));
    if (income.gt(0)) {
      const spend = sum(
        prevTxs.filter((t) => t.kind === 'SPEND' || t.kind === 'REFUND').map((t) => D(t.amountEur).neg()),
      );
      drafts.push(savingsRate({ month: prev, income: m2(income), spend: m2(spend), target: user.monthlySavingsTarget.toString() }).draft);
    }

    // Cash flow to the next payday
    const pay = nextPayday(today, user.paydayDayOfMonth);
    const spendingBalance = sum(accounts.filter((a) => a.type === 'CURRENT' && a.includeInNetWorth).map((a) => a.balance.toString()));
    const flexible = txs.filter(
      (t) => t.kind === 'SPEND' && diffDays(t.date, today) < 30 && !(t.categoryId && fixedIds.includes(t.categoryId)),
    );
    const avgDaily = sum(flexible.map((t) => D(t.amountEur).abs())).div(30);
    const salary = median(txs.filter((t) => t.kind === 'INCOME' && D(t.amountEur).gte(1000)).map((t) => t.amountEur));
    const forecast = cashflowForecast({
      today,
      nextPayday: pay,
      balance: m2(spendingBalance),
      upcoming: recurring.series
        .filter((s) => s.nextDate > today && s.nextDate <= pay)
        .map((s) => ({ date: s.nextDate, amount: `-${s.expectedAmount}`, label: s.merchantName })),
      avgDailyFlexible: m2(avgDaily),
      expectedIncome: salary.gt(0) ? m2(salary) : undefined,
    });
    if (forecast.draft) drafts.push(forecast.draft);

    await this.persist(userId, drafts, month);
    await this.pushPending(userId, now);
    this.log.log(`insights: ${drafts.length} drafts`);
    return { count: drafts.length };
  }

  private async saveRecurring(userId: string, series: ReturnType<typeof detectRecurring>['series']): Promise<void> {
    for (const s of series) {
      const merchant = await this.db.merchant.findUnique({ where: { userId_merchantKey: { userId, merchantKey: s.merchantKey } } });
      if (!merchant) continue;
      const data = {
        cadence: s.cadence,
        expectedAmount: s.expectedAmount,
        lastAmount: s.lastAmount,
        nextDate: new Date(`${s.nextDate}T00:00:00Z`),
        active: true,
      } as const;
      await this.db.recurringSeries.upsert({
        where: { userId_merchantId: { userId, merchantId: merchant.id } },
        update: data,
        create: { userId, merchantId: merchant.id, ...data },
      });
    }
  }

  /** Upsert by fingerprint, keep seen/pushed state, and drop this month's stale unpushed insights. */
  private async persist(userId: string, drafts: Draft[], month: string): Promise<void> {
    const periodStart = new Date(`${month}-01T00:00:00Z`);
    for (const d of drafts) {
      await this.db.insight.upsert({
        where: { userId_fingerprint: { userId, fingerprint: d.fingerprint } },
        update: { severity: d.severity, title: d.title, body: d.body, payload: d.payload as object },
        create: {
          userId,
          type: d.type,
          severity: d.severity,
          periodStart,
          title: d.title,
          body: d.body,
          payload: d.payload as object,
          fingerprint: d.fingerprint,
        },
      });
    }
    await this.db.insight.deleteMany({
      where: {
        userId,
        type: { in: PRODUCED_TYPES },
        periodStart: { gte: periodStart },
        pushedAt: null,
        seenAt: null,
        fingerprint: { notIn: drafts.map((d) => d.fingerprint) },
      },
    });
  }

  /** Push ACT insights that have not been announced. Quiet hours defer them to the next run. */
  async pushPending(userId: string, now = new Date()): Promise<number> {
    const pending = await this.db.insight.findMany({ where: { userId, severity: 'ACT', pushedAt: null }, orderBy: { createdAt: 'asc' } });
    let sent = 0;
    for (const i of pending) {
      const res = await this.push.send(
        userId,
        { kind: i.type === 'relink' ? 'relink' : 'insight', title: i.title, body: i.body, data: { insightId: i.id } },
        { respectQuietHours: true, now },
      );
      if (res.deferred) break;
      await this.db.insight.update({ where: { id: i.id }, data: { pushedAt: new Date() } });
      sent++;
    }
    return sent;
  }

  async relinkReminder(userId: string, institution: Institution, validUntil: Date): Promise<void> {
    const ymd = dublinDate(validUntil);
    await this.db.insight.upsert({
      where: { userId_fingerprint: { userId, fingerprint: `relink:${institution}:${ymd}` } },
      update: {},
      create: {
        userId,
        type: 'relink',
        severity: 'ACT',
        periodStart: new Date(`${monthOf(dublinDate(new Date()))}-01T00:00:00Z`),
        title: `Link ${institution === 'AIB' ? 'AIB' : 'Revolut'} again`,
        body: `Your bank consent runs out on ${ymd}. Re-link it in Settings to keep payments syncing.`,
        payload: { institution, validUntil: ymd },
        fingerprint: `relink:${institution}:${ymd}`,
      },
    });
    await this.pushPending(userId);
  }

  /** Sunday evening summary: this week against last week, and the biggest category. */
  async weeklyDigest(userId: string, now = new Date()): Promise<void> {
    const today = dublinDate(now);
    const txs = await this.data.coreTxs(userId, addDays(today, -14), today);
    const cats = await this.data.categories(userId);
    const spendIn = (from: string, to: string) =>
      txs.filter((t) => t.kind === 'SPEND' && t.date > from && t.date <= to).map((t) => D(t.amountEur).abs());
    const thisWeek = spendIn(addDays(today, -7), today);
    const lastWeek = spendIn(addDays(today, -14), addDays(today, -7));
    const total = sum(thisWeek);
    const prev = sum(lastWeek);
    const byCat = this.data.spendByCategory(
      txs.filter((t) => t.date > addDays(today, -7)),
      cats,
      false,
    );
    const top = [...byCat.entries()].sort((a, b) => b[1].comparedTo(a[1]))[0];
    const topName = top ? (cats.find((c) => c.id === top[0])?.name ?? 'Other') : null;
    const diff = total.minus(prev);
    await this.push.send(
      userId,
      {
        kind: 'digest',
        title: 'Your week in money',
        body: `${eur(total.toNumber())} spent, ${diff.isNegative() ? `${eur(diff.abs().toNumber())} less` : `${eur(diff.toNumber())} more`} than last week.${topName ? ` Biggest: ${topName}.` : ''}`,
        data: { screen: 'insights' },
      },
      { respectQuietHours: true, now },
    );
  }

  /* ------------------------------------------------------------- reads */

  private toDto(i: {
    id: string; type: string; severity: 'INFO' | 'WATCH' | 'ACT'; periodStart: Date; title: string; body: string;
    payload: unknown; pushedAt: Date | null; seenAt: Date | null; createdAt: Date;
  }): InsightDto {
    return {
      id: i.id,
      type: i.type,
      severity: i.severity,
      periodStart: iso(i.periodStart),
      title: i.title,
      body: i.body,
      payload: (i.payload ?? {}) as Record<string, unknown>,
      pushedAt: isoOrNull(i.pushedAt),
      seenAt: isoOrNull(i.seenAt),
      createdAt: iso(i.createdAt),
    };
  }

  async list(userId: string, limit = 100): Promise<InsightsResponse> {
    const rows = await this.db.insight.findMany({
      where: { userId },
      orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
    const order = { ACT: 0, WATCH: 1, INFO: 2 } as const;
    rows.sort((a, b) => order[a.severity] - order[b.severity] || b.createdAt.getTime() - a.createdAt.getTime());
    return { items: rows.map((r) => this.toDto(r)), unseen: rows.filter((r) => !r.seenAt).length };
  }

  async latest(userId: string, n: number): Promise<InsightDto[]> {
    return (await this.list(userId, 40)).items.filter((i) => i.type !== 'relink' || i.severity === 'ACT').slice(0, n);
  }

  async markSeen(userId: string, id: string): Promise<void> {
    const res = await this.db.insight.updateMany({ where: { id, userId, seenAt: null }, data: { seenAt: new Date() } });
    if (res.count === 0 && !(await this.db.insight.findFirst({ where: { id, userId } }))) throw new NotFoundException('Insight not found');
  }

  async recurring(userId: string): Promise<RecurringDto[]> {
    const rows = await this.db.recurringSeries.findMany({ where: { userId, active: true }, include: { merchant: true }, orderBy: { nextDate: 'asc' } });
    return rows.map((r) => ({
      id: r.id,
      merchantName: r.merchant.displayName,
      cadence: r.cadence,
      expectedAmount: m2(r.expectedAmount.toString()),
      lastAmount: m2(r.lastAmount.toString()),
      nextDate: r.nextDate.toISOString().slice(0, 10),
      active: r.active,
    }));
  }
}

