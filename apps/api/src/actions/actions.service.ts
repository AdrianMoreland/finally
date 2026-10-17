import { Injectable } from '@nestjs/common';
import type { Db } from '@finally/db';
import type { ActionItemDto } from '@finally/contracts';
import {
  addDays,
  buildActions,
  creditAsks,
  D,
  doubleCharges,
  frontOverdraftInput,
  overdraftFees,
  rentRounds,
  shortCredits,
  rentShareDebts,
  shareReminderInputs,
  FLEX_BUDGET_SLUGS,
  m2,
  PAYE_YEARS,
  potReach,
  potStatus,
  potTarget,
  previousRentCredit,
  projectedSpend,
  reachText,
  spent,
  sum,
  dayOfMonth,
  overdraftState,
} from '@finally/finance-core';
import { InjectDb } from '../common/tokens';
import { toRentConfig } from '../data/rent-config';
import { dateOnly, parseDateOnly } from '../common/mappers';
import { PeopleService } from '../people/people.service';
import { PlanService } from '../plan/plan.service';
import { PotsService } from '../pots/pots.service';
import { SnapshotService, type Snapshot } from '../snapshot/snapshot.service';
import { TaxService } from '../tax/tax.service';

const SNOOZE_DAYS = 7;

/** The overdraft figures for the Today note, only when an overdraft is arranged. */
const overdraftNote = (balance: string, limit: string): { limit?: string; room?: string } => {
  if (!D(limit).gt(0)) return {};
  const o = overdraftState(balance, limit);
  return { limit: o.limit, room: o.room };
};

/** Everything that needs the user, ranked by money involved. Shown on Today and used by the weekly review. */
@Injectable()
export class ActionsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly snapshot: SnapshotService,
    private readonly plan: PlanService,
    private readonly people: PeopleService,
    private readonly pots: PotsService,
    private readonly tax: TaxService,
  ) {}

  /** Merchants whose payments have no category yet, with what is waiting. */
  toSort(s: Snapshot): { count: number; total: string } {
    const waiting = s.txs.filter((t) => t.kind === 'SPEND' && t.slug === null && !t.excluded);
    const merchants = new Set(waiting.map((t) => t.merchantKey ?? t.rawDescriptor));
    return { count: merchants.size, total: m2(sum(waiting.map((t) => D(t.amount).neg()))) };
  }

  async snoozedIds(userId: string, today: string): Promise<Set<string>> {
    const rows = await this.db.actionSnooze.findMany({ where: { userId, until: { gte: parseDateOnly(today) } } });
    return new Set(rows.map((r) => r.actionId));
  }

  async snooze(userId: string, actionId: string): Promise<void> {
    const until = parseDateOnly(addDays(new Date().toISOString().slice(0, 10), SNOOZE_DAYS));
    await this.db.actionSnooze.upsert({ where: { userId_actionId: { userId, actionId } }, update: { until }, create: { userId, actionId, until } });
  }

  async list(s: Snapshot, includeSnoozed = false): Promise<ActionItemDto[]> {
    const states = await this.tax.states(s.userId);
    const year = Number(s.today.slice(0, 4));
    const day = dayOfMonth(s.today);
    const monthFrom = `${s.month}-01`;

    const potsWithStatus = s.pots.flatMap((p) => {
      const core = this.pots.core(s, p);
      const st = potStatus(core, s.cal);
      return st && st.late && core.targetDate
        ? [{ id: p.id, name: p.name, late: true, reaches: reachText(potReach(core, potTarget(core, s.essentials), s.cal)), targetDate: core.targetDate, need: st.need, monthly: m2(core.monthly), shortfall: st.shortfall }]
        : [];
    });

    const pace = FLEX_BUDGET_SLUGS.map((slug) => {
      const sp = spent(s.txs, { slug, from: monthFrom, to: s.today });
      return { slug, name: s.names[slug] ?? slug, spent: m2(sp), budget: s.budgets[slug] ?? '0.00', projected: m2(projectedSpend(s.txs, slug, sp, s.today, s.pace)), day };
    });

    const dismissed = new Set(s.prefs.dismissed);
    const owed = s.people
      .filter((p) => p.direction === 'OWED')
      .map((p) => ({ id: p.id, name: p.name, left: m2(this.people.left(s, p)), since: dateOnly(p.since), note: p.note }));

    const cfg = toRentConfig(s.prefs);
    const fees12m = cfg
      ? overdraftFees(s.txs, cfg, addDays(s.today, -365), s.today)
      : m2(spent(s.txs, { slug: 'fees', from: addDays(s.today, -365), to: s.today }));
    const aib = cfg ? await this.db.account.findFirst({ where: { userId: s.userId, type: 'CURRENT', connection: { institution: 'AIB' } }, select: { id: true, balance: true } }) : null;
    const frontOverdraft = cfg && aib ? frontOverdraftInput({ txs: s.txs, cfg, accountId: aib.id, balance: aib.balance.toString(), today: s.today, fees12m }) : null;
    const rentOn = cfg ? rentRounds(s.txs, cfg).find((r) => r.month === s.month)?.date : undefined;
    // Rent shares still owed that are older than three weeks join the "owes you" nudges.
    const shareOwed = cfg
      ? rentShareDebts(rentRounds(s.txs, cfg)).map(({ round, mate }) => ({ id: `rent-${round.month}-${mate.id}`, name: mate.name, left: mate.left, since: round.date, note: `${round.month} rent share` }))
      : [];

    return buildActions({
      today: s.today,
      nextPayday: s.nextPay,
      toSort: this.toSort(s),
      orders: await this.plan.orderIssues(s),
      rentCredit: { state: states.get('rent') ?? 'TODO', amount: PAYE_YEARS[year]?.rentCredit ?? 1000, year },
      prevRentCredit: { state: states.get('rentPrev') ?? 'TODO', amount: previousRentCredit(s.prefs.tax.tenancy, year), sinceYear: s.prefs.tax.tenancy?.slice(0, 4) ?? '' },
      owed: [...owed, ...shareOwed],
      pots: potsWithStatus,
      pace,
      overdrawn: D(s.balance).lt(0) ? { balance: s.balance, fees12m, rentOn: frontOverdraft ? rentOn : undefined, ...overdraftNote(s.balance, s.overdraftLimit) } : null,
      frontOverdraft,
      shareReminders: shareReminderInputs(s.txs, cfg, s.today),
      shortCredits: shortCredits(s.txs, cfg, s.today, []),
      creditAsks: creditAsks(s.txs, cfg, s.today, s.prefs.dismissed.filter((d) => d.startsWith('credit-')).map((d) => d.slice(7))),
      doubles: doubleCharges(s.txs, s.today).filter((d) => !dismissed.has(d.id)),
      rises: s.repeating
        .filter((r) => r.rise && !s.cancelled.has(r.id))
        .map((r) => ({ id: r.id, name: r.name, from: r.rise!.from, to: r.rise!.to, since: r.rise!.since })),
      snoozed: includeSnoozed ? new Set() : await this.snoozedIds(s.userId, s.today),
    });
  }
}
