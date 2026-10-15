import { Injectable } from '@nestjs/common';
import type { Db } from '@finally/db';
import type { PaydayPlanDto as PlanShape } from '@finally/contracts';
import {
  D,
  Decimal,
  FIXED_BUDGET_SLUGS,
  FLEX_BUDGET_SLUGS,
  m2,
  nextYearRise,
  orderState,
  spent,
  sum,
  upcomingBills,
  type OrderRow,
} from '@finally/finance-core';
import { money } from '../common/mappers';
import { InjectDb } from '../common/tokens';
import { LedgerService } from '../data/ledger.service';
import { PeopleService } from '../people/people.service';
import { SnapshotService, type Snapshot } from '../snapshot/snapshot.service';

const POT_COLOUR = { SAFETY: '--brand', PLANNED: '--c-subs', TREAT: '--c-fun', INVESTING: '--c-transport' } as const;
const PAYBACK_COLOUR = '--c-eating';
const POT_LABEL = { SAFETY: 'Safety', PLANNED: 'Planned spend', TREAT: 'Treat', INVESTING: 'Investing' } as const;

export type OrderWithArrival = OrderRow & { arrived: boolean; color: string };

@Injectable()
export class PlanService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly snapshot: SnapshotService,
    private readonly people: PeopleService,
    private readonly ledger: LedgerService,
  ) {}

  /**
   * Finally stays read-only: each pot with a monthly amount, and the paying-back amount, needs a standing order the
   * user sets up at the bank. We record what they say they set, and look for the transfer in the payments.
   */
  async orders(s: Snapshot): Promise<OrderWithArrival[]> {
    const set = new Map((await this.db.standingOrder.findMany({ where: { userId: s.userId } })).map((o) => [o.key, o.amount.toString()]));
    const rows: Array<Omit<OrderWithArrival, 'state' | 'arrived'>> = s.pots
      .filter((p) => D(p.monthly.toString()).gt(0))
      .map((p) => ({
        key: p.id,
        name: p.name,
        to: p.account ? `${p.account.name}` : `Revolut · ${p.name} vault`,
        amount: m2(p.monthly.toString()),
        set: set.get(p.id) ? m2(set.get(p.id)!) : null,
        color: POT_COLOUR[p.type],
      }));
    const monthly = D(s.prefs.payback.monthly);
    if (monthly.gt(0)) {
      const plan = this.people.payoff(s);
      const who = Object.keys(plan.first).map((id) => s.people.find((p) => p.id === id)?.name ?? '').filter(Boolean).join(', then ') || '—';
      rows.push({ key: 'payback', name: 'Paying people back', to: `AIB transfer to ${who}`, amount: m2(monthly), set: set.get('payback') ? m2(set.get('payback')!) : null, color: PAYBACK_COLOUR });
    }
    // Transfers out of your spending accounts since the last payday, matched to orders by amount.
    const sent = s.txs
      .filter((t) => t.date >= s.lastPay && t.kind === 'TRANSFER' && Number(t.amount) < 0 && s.spendAccountIds.has(t.accountId))
      .map((t) => D(t.amount).abs());
    return rows.map((r) => {
      const idx = sent.findIndex((a) => a.minus(r.set ?? r.amount).abs().lte('0.5'));
      const arrived = idx >= 0;
      if (arrived) sent.splice(idx, 1);
      return { ...r, state: orderState(r.amount, r.set), arrived };
    });
  }

  async setOrder(userId: string, key: string, amount: string | null): Promise<PlanShape> {
    if (amount == null) await this.db.standingOrder.deleteMany({ where: { userId, key } });
    else {
      await this.db.standingOrder.upsert({
        where: { userId_key: { userId, key } },
        update: { amount: m2(amount), markedAt: new Date() },
        create: { userId, key, amount: m2(amount) },
      });
    }
    return this.get(userId);
  }

  async updateSettings(userId: string, body: { salaryOnly?: boolean; lifestyleGuard?: boolean; buffer?: string; paydayDayOfMonth?: number }): Promise<PlanShape> {
    await this.db.user.update({
      where: { id: userId },
      data: {
        ...(body.salaryOnly !== undefined ? { salaryOnly: body.salaryOnly } : {}),
        ...(body.lifestyleGuard !== undefined ? { lifestyleGuard: body.lifestyleGuard } : {}),
        ...(body.buffer !== undefined ? { bufferAmount: m2(body.buffer) } : {}),
        ...(body.paydayDayOfMonth !== undefined ? { paydayDayOfMonth: body.paydayDayOfMonth } : {}),
      },
    });
    return this.get(userId);
  }

  async get(userId: string): Promise<PlanShape> {
    const s = await this.snapshot.get(userId);
    return this.build(s);
  }

  async build(s: Snapshot): Promise<PlanShape> {
    const orders = await this.orders(s);
    const fixed = sum(FIXED_BUDGET_SLUGS.map((k) => s.budgets[k] ?? 0));
    const flex = sum(FLEX_BUDGET_SLUGS.map((k) => s.budgets[k] ?? 0));
    const surplus = s.netPay.minus(fixed).minus(flex);
    const potsMonthly = sum(s.pots.map((p) => p.monthly.toString()));
    const planned = potsMonthly.plus(s.prefs.payback.monthly);
    const left = surplus.minus(planned);
    const safe = this.snapshot.safeAt(s);

    const items = [
      ...s.pots.map((p) => ({ key: p.id, name: p.name, amount: m2(p.monthly.toString()), color: POT_COLOUR[p.type], note: POT_LABEL[p.type] })),
      { key: 'payback', name: 'Paying people back', amount: m2(s.prefs.payback.monthly), color: PAYBACK_COLOUR, note: 'Your payoff order' },
    ];

    // Balance until payday, bill by bill, then the flexible spending still budgeted.
    const bills = upcomingBills(s.repeating, s.today, s.cancelled).filter((b) => b.date < s.nextPay);
    let bal = D(s.balance);
    const cashflow = bills.map((b) => {
      bal = bal.minus(b.amount);
      return { date: b.date, name: b.name, amount: m2(D(b.amount).neg()), balance: m2(bal) };
    });
    const flexLeft = Decimal.max(0, D(safe.budgetLeft));
    const low = bal.minus(flexLeft);

    const year = Number(s.today.slice(0, 4));
    const fees12 = spent(s.txs, { slug: 'fees', from: `${Number(s.today.slice(0, 4)) - 1}${s.today.slice(4)}`, to: s.today });
    return {
      netPay: m2(s.netPay),
      fixed: m2(fixed),
      flexible: m2(flex),
      surplus: m2(surplus),
      planned: m2(planned),
      left: m2(left),
      items,
      orders: orders.map((o) => ({ key: o.key, name: o.name, to: o.to, amount: o.amount, set: o.set, state: o.state, arrived: o.arrived, color: o.color })),
      cashflow,
      balanceToday: m2(s.balance),
      flexLeft: m2(flexLeft),
      lowestBalance: m2(low),
      nextPayday: s.nextPay,
      nextYearRise: m2(nextYearRise(s.prefs.tax.gross, year)),
      salaryOnly: s.user.salaryOnly,
      lifestyleGuard: s.user.lifestyleGuard,
      buffer: money(s.user.bufferAmount),
      overdrawnFees: m2(fees12),
    };
  }

  /** Amount of money tied up in orders that still need setting up, for the Today strip. */
  async orderIssues(s: Snapshot): Promise<Array<{ name: string; amount: string; state: 'missing' | 'changed' | 'ok' }>> {
    return (await this.orders(s)).map((o) => ({ name: o.name, amount: o.amount, state: o.state }));
  }
}
