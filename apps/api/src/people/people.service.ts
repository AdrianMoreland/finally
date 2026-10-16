import { Injectable, NotFoundException } from '@nestjs/common';
import type { Db } from '@finally/db';
import type { CreatePersonBody, PeopleDto as PeopleShape, PersonDto as PersonShape } from '@finally/contracts';
import { D, Decimal, eur0, houseMessage, m2, monthName, payoffPlan, rentRounds, rentShareDebts, shareReminder, sum, type PayoffPlan } from '@finally/finance-core';
import { dateOnly, money, parseDateOnly } from '../common/mappers';
import { InjectDb } from '../common/tokens';
import { LedgerService } from '../data/ledger.service';
import { toRentConfig } from '../data/rent-config';
import { SnapshotService, type PersonRow, type Snapshot } from '../snapshot/snapshot.service';

@Injectable()
export class PeopleService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly snapshot: SnapshotService,
    private readonly ledger: LedgerService,
  ) {}

  left(s: Snapshot, p: PersonRow): Decimal {
    return Decimal.max(0, D(p.amount.toString()).minus(this.snapshot.personPaid(s, p)));
  }

  /** Paying-back plan for everyone you owe, in your chosen order. */
  payoff(s: Snapshot): PayoffPlan {
    const pb = s.prefs.payback;
    const debts = s.people.filter((p) => p.direction === 'OWE').map((p) => ({ id: p.id, name: p.name, left: m2(this.left(s, p)) }));
    const extra = pb.bonusToDebt > 0 ? { month: `${s.prefs.bonus.year}-12`, amount: String(pb.bonusToDebt) } : null;
    return payoffPlan(debts, String(pb.monthly), pb.order, pb.custom, s.cal, extra);
  }

  /** Rent rounds worth showing: the last six, newest first. */
  rent(s: Snapshot): ReturnType<typeof rentRounds> {
    return rentRounds(s.txs, toRentConfig(s.prefs)).slice(0, 6);
  }

  /** Flatmates' shares for the latest round and any earlier one still unpaid, as "owed to you" rows. */
  private rentRows(s: Snapshot): PersonShape[] {
    const cfg = toRentConfig(s.prefs);
    if (!cfg) return [];
    const rounds = this.rent(s);
    const owed = new Set(rentShareDebts(rounds).map((x) => `${x.round.date}:${x.mate.id}`));
    return rounds.flatMap((r, i) =>
      r.mates
        .filter((m) => (i === 0 && D(m.left).lte(0)) || owed.has(`${r.date}:${m.id}`))
        .map((m): PersonShape => ({
          id: `rent-${r.month}-${m.id}`,
          name: m.name,
          direction: 'OWED',
          amount: r.own,
          paid: m.back,
          left: m.left,
          note: `${monthName(r.month)} rent share`,
          since: r.date,
          merchantKey: null,
          remindText: shareReminder({ name: m.name, monthName: monthName(r.month), total: r.total, day: Number(r.date.slice(8)), got: m.got, own: r.own, left: m.left }),
          paidOffOn: D(m.left).lte(0) ? (m.paid[m.paid.length - 1] ?? null) : null,
          nextPayment: null,
          payments: [],
          rentShare: true,
        })),
    );
  }

  totals(s: Snapshot): { owe: Decimal; owed: Decimal } {
    const part = (dir: 'OWE' | 'OWED'): Decimal => sum(s.people.filter((p) => p.direction === dir).map((p) => this.left(s, p)));
    const share = sum(this.rentRows(s).map((r) => r.left));
    return { owe: part('OWE'), owed: part('OWED').plus(share) };
  }

  private remind(p: PersonRow, left: Decimal): string {
    if (p.remindText) return p.remindText;
    const what = p.note ? p.note.replace(/\.$/, '').toLowerCase() : 'the money';
    return `Hi ${p.name}, quick one about ${what}: ${eur0(left.toFixed(2))} is still outstanding. Could you send it over when you get a chance? Thanks!`;
  }

  private dto(s: Snapshot, p: PersonRow, plan: PayoffPlan): PersonShape {
    const paid = this.snapshot.personPaid(s, p);
    const left = this.left(s, p);
    return {
      id: p.id,
      name: p.name,
      direction: p.direction,
      amount: money(p.amount),
      paid: m2(paid),
      left: m2(left),
      note: p.note,
      since: dateOnly(p.since),
      merchantKey: p.merchantKey,
      remindText: this.remind(p, left),
      paidOffOn: plan.done[p.id] ?? null,
      nextPayment: plan.first[p.id] ?? null,
      payments: p.payments.map((x) => ({ id: x.id, amount: money(x.amount), paidOn: dateOnly(x.paidOn), note: x.note })),
      rentShare: false,
    };
  }

  async get(userId: string): Promise<PeopleShape> {
    const s = await this.snapshot.get(userId);
    return this.build(s);
  }

  build(s: Snapshot): PeopleShape {
    const plan = this.payoff(s);
    const t = this.totals(s);
    const pb = s.prefs.payback;
    const cfg = toRentConfig(s.prefs);
    const rounds = this.rent(s);
    return {
      rent: cfg
        ? {
            total: m2(cfg.total),
            day: cfg.day,
            own: m2(D(cfg.total).div(cfg.household)),
            rounds,
            onTime: cfg.flatmates.map((f) => ({
              id: f.id,
              name: f.name,
              onTime: rounds.filter((r) => r.mates.find((m) => m.id === f.id)?.late).length,
              of: rounds.length,
            })),
            houseMessage: houseMessage(cfg),
          }
        : null,
      owe: s.people.filter((p) => p.direction === 'OWE').map((p) => this.dto(s, p, plan)),
      owed: [...s.people.filter((p) => p.direction === 'OWED').map((p) => this.dto(s, p, plan)), ...this.rentRows(s)],
      totalOwe: m2(t.owe),
      totalOwed: m2(t.owed),
      plan: {
        monthly: m2(pb.monthly),
        order: pb.order,
        custom: pb.custom,
        bonusToDebt: m2(pb.bonusToDebt),
        freeDate: plan.freeDate,
        series: plan.series,
      },
    };
  }

  async create(userId: string, body: CreatePersonBody): Promise<PeopleShape> {
    const count = await this.db.person.count({ where: { userId } });
    await this.db.person.create({
      data: {
        userId,
        name: body.name.trim(),
        direction: body.direction,
        amount: m2(body.amount),
        note: body.note,
        since: parseDateOnly(body.since ?? new Date().toISOString().slice(0, 10)),
        merchantKey: body.merchantKey,
        sortOrder: count,
      },
    });
    return this.get(userId);
  }

  async update(userId: string, id: string, body: Partial<CreatePersonBody>): Promise<PeopleShape> {
    await this.owned(userId, id);
    await this.db.person.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.direction !== undefined ? { direction: body.direction } : {}),
        ...(body.amount !== undefined ? { amount: m2(body.amount) } : {}),
        ...(body.note !== undefined ? { note: body.note } : {}),
        ...(body.since !== undefined ? { since: parseDateOnly(body.since) } : {}),
        ...(body.merchantKey !== undefined ? { merchantKey: body.merchantKey } : {}),
      },
    });
    return this.get(userId);
  }

  async remove(userId: string, id: string): Promise<PeopleShape> {
    await this.owned(userId, id);
    await this.db.person.delete({ where: { id } });
    return this.get(userId);
  }

  async addPayment(userId: string, id: string, body: { amount: string; paidOn?: string; note: string | null }): Promise<PeopleShape> {
    await this.owned(userId, id);
    await this.db.personPayment.create({
      data: { userId, personId: id, amount: m2(body.amount), paidOn: parseDateOnly(body.paidOn ?? new Date().toISOString().slice(0, 10)), note: body.note },
    });
    return this.get(userId);
  }

  async removePayment(userId: string, id: string, paymentId: string): Promise<PeopleShape> {
    await this.owned(userId, id);
    await this.db.personPayment.deleteMany({ where: { id: paymentId, personId: id, userId } });
    return this.get(userId);
  }

  async updatePlan(userId: string, body: { monthly?: string; order?: 'smallest' | 'largest' | 'custom'; custom?: string[]; bonusToDebt?: string }): Promise<PeopleShape> {
    await this.ledger.patchPrefs(userId, {
      payback: {
        ...(body.monthly !== undefined ? { monthly: Number(body.monthly) } : {}),
        ...(body.order !== undefined ? { order: body.order } : {}),
        ...(body.custom !== undefined ? { custom: body.custom } : {}),
        ...(body.bonusToDebt !== undefined ? { bonusToDebt: Number(body.bonusToDebt) } : {}),
      },
    });
    return this.get(userId);
  }

  private async owned(userId: string, id: string): Promise<void> {
    if (!(await this.db.person.findFirst({ where: { id, userId }, select: { id: true } }))) throw new NotFoundException('Person not found');
  }
}
