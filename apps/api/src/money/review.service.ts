import { Injectable } from '@nestjs/common';
import type { Db } from '@finally/db';
import type { MonthCloseDto as CloseShape, WeeklyReviewDto as WeekShape } from '@finally/contracts';
import {
  addDays,
  addMonths,
  D,
  isoWeek,
  m2,
  MONTH_NAMES,
  monthClose,
  nextReviewDay,
  reviewBudget,
  spent,
  sum,
  weekStart,
  weeklyDecisions,
} from '@finally/finance-core';
import { ActionsService } from '../actions/actions.service';
import { BudgetsService } from '../budgets/budgets.service';
import { CategorisationService } from '../categorisation/categorisation.service';
import { InjectDb } from '../common/tokens';
import { SnapshotService, type Snapshot } from '../snapshot/snapshot.service';

/** The Sunday review (four short steps) and the month close the day before payday. */
@Injectable()
export class ReviewService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly snapshot: SnapshotService,
    private readonly actions: ActionsService,
    private readonly categorisation: CategorisationService,
    private readonly budgets: BudgetsService,
  ) {}

  private catRef(s: Snapshot, slug: string) {
    const c = s.cats.find((x) => x.slug === slug)!;
    return { id: c.id, name: c.name, slug: c.slug, colour: c.colour, icon: c.icon, parentId: c.parentId };
  }

  /* ------------------------------------------------------------------- week */

  async week(userId: string): Promise<WeekShape> {
    const s = await this.snapshot.get(userId);
    const period = isoWeek(s.today);
    const logs = await this.db.reviewLog.findMany({ where: { userId, kind: 'WEEK' }, orderBy: { period: 'desc' }, take: 12 });
    const done = logs.find((l) => l.period === period) ?? null;
    const completed = new Set(logs.map((l) => l.period));
    let streak = 0;
    for (let d = done ? s.today : addDays(s.today, -7); completed.has(isoWeek(d)); d = addDays(d, -7)) streak++;
    const queue = await this.categorisation.queue(userId);
    const first = queue.items[0] ?? null;
    const { worst, room } = reviewBudget(s.txs, s.budgets, s.today);
    const actions = await this.actions.list(s);
    const decisions = weeklyDecisions(worst, room, s.names);
    return {
      period,
      done: Boolean(done),
      decision: done?.decision ?? null,
      streak,
      nextReview: nextReviewDay(s.today),
      toSort: {
        count: queue.count,
        first: first
          ? { requestId: first.id, key: first.merchantKey, name: first.displayName, rawDescriptor: first.rawDescriptor, amount: first.amount, suggestion: first.suggestedCategories[0] ?? null }
          : null,
      },
      budget: {
        worst: worst
          ? {
              slug: worst.slug,
              name: s.names[worst.slug] ?? worst.slug,
              spent: worst.spent,
              budget: worst.budget,
              projected: worst.projected,
              thisWeek: m2(spent(s.txs, { slug: worst.slug, from: weekStart(s.today), to: s.today })),
            }
          : null,
      },
      know: actions.find((a) => a.id !== 'sort') ?? null,
      decisions,
    };
  }

  async completeWeek(userId: string, decision: string | null): Promise<WeekShape> {
    const s = await this.snapshot.get(userId);
    const period = isoWeek(s.today);
    const { worst, room } = reviewBudget(s.txs, s.budgets, s.today);
    const label = decision ? (weeklyDecisions(worst, room, s.names).find((d) => d.value === decision)?.label ?? decision) : null;
    if (decision) await this.applyDecision(s, decision);
    await this.db.reviewLog.upsert({
      where: { userId_kind_period: { userId, kind: 'WEEK', period } },
      update: { decision: label, completedAt: new Date() },
      create: { userId, kind: 'WEEK', period, decision: label },
    });
    return this.week(userId);
  }

  async reopenWeek(userId: string): Promise<WeekShape> {
    const s = await this.snapshot.get(userId);
    await this.db.reviewLog.deleteMany({ where: { userId, kind: 'WEEK', period: isoWeek(s.today) } });
    return this.week(userId);
  }

  /** `move|from|to|amount` shifts budget between two lines for the month; other choices are notes to self. */
  private async applyDecision(s: Snapshot, value: string): Promise<void> {
    const [kind, a, b, amt] = value.split('|');
    if (kind !== 'move' || !a || !b || !amt) return;
    await this.shiftBudget(s, a, -Number(amt));
    await this.shiftBudget(s, b, Number(amt));
  }

  private async shiftBudget(s: Snapshot, slug: string, delta: number): Promise<void> {
    const cat = s.cats.find((c) => c.slug === slug);
    if (!cat) return;
    const current = D(s.budgets[slug] ?? 0);
    const base = (await this.db.budget.findUnique({ where: { userId_categoryId_month: { userId: s.userId, categoryId: cat.id, month: s.month } } }))?.rollover ?? false;
    await this.budgets.upsert(s.userId, { categoryId: cat.id, month: s.month, amount: m2(current.plus(delta)), rollover: base });
  }

  /* ------------------------------------------------------------------ month */

  async month(userId: string): Promise<CloseShape> {
    const s = await this.snapshot.get(userId);
    const closing = addMonths(s.month, -1);
    const before = addMonths(s.month, -2);
    const paidBack = sum(s.people.flatMap((p) => p.payments.filter((x) => x.paidOn.toISOString().slice(0, 7) === closing && p.direction === 'OWE').map((x) => x.amount.toString())));
    const mc = monthClose(s.txs, closing, s.budgets, m2(paidBack), s.names);
    const log = await this.db.reviewLog.findUnique({ where: { userId_kind_period: { userId, kind: 'MONTH', period: closing } } });
    const end = (m: string): string => `${m}-${String(new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5)), 0)).getUTCDate()).padStart(2, '0')}`;
    return {
      month: closing,
      cameIn: mc.cameIn,
      spent: mc.spent,
      paidBack: mc.paidBack,
      kept: mc.kept,
      keptPct: mc.keptPct,
      balanceFrom: m2(this.snapshot.balanceAt(s, end(before))),
      balanceTo: m2(this.snapshot.balanceAt(s, end(closing))),
      rows: mc.rows.map((r) => ({ category: this.catRef(s, r.slug), planned: r.planned, spent: r.spent, difference: r.difference })),
      jump: mc.jump ? { name: s.names[mc.jump.slug] ?? mc.jump.slug, by: mc.jump.by, versus: MONTH_NAMES[Number(before.slice(5)) - 1]! } : null,
      options: mc.options,
      choice: log?.decision ?? null,
      closesOn: addDays(s.nextPay, -1),
      nextMonthName: MONTH_NAMES[Number(s.month.slice(5)) - 1]!,
    };
  }

  async chooseMonth(userId: string, value: string, label: string): Promise<CloseShape> {
    const s = await this.snapshot.get(userId);
    const closing = addMonths(s.month, -1);
    const [kind, slug, amt] = value.split('|');
    if (kind === 'raise' && slug && amt) await this.shiftBudget(s, slug, Number(amt));
    await this.db.reviewLog.upsert({
      where: { userId_kind_period: { userId, kind: 'MONTH', period: closing } },
      update: { decision: label, completedAt: new Date() },
      create: { userId, kind: 'MONTH', period: closing, decision: label },
    });
    return this.month(userId);
  }

  async reopenMonth(userId: string): Promise<CloseShape> {
    const s = await this.snapshot.get(userId);
    await this.db.reviewLog.deleteMany({ where: { userId, kind: 'MONTH', period: addMonths(s.month, -1) } });
    return this.month(userId);
  }
}

