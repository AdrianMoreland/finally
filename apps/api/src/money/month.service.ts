import { Injectable } from '@nestjs/common';
import type { MonthDto as MonthShape } from '@finally/contracts';
import {
  addDays,
  addMonths,
  BUDGET_SLUGS,
  D,
  dayOfMonth,
  daysInMonth,
  diffDays,
  dlY,
  eur0,
  FIXED_BUDGET_SLUGS,
  FLEX_BUDGET_SLUGS,
  rentRounds,
  flexPaceShare,
  incomeIn,
  m2,
  MONTH_NAMES,
  netWorthSeries,
  projectedSpend,
  recentRefunds,
  spent,
  sum,
  type Decimal,
} from '@finally/finance-core';
import { toRentConfig } from '../data/rent-config';
import { SnapshotService, type Snapshot } from '../snapshot/snapshot.service';

@Injectable()
export class MonthService {
  constructor(private readonly snapshot: SnapshotService) {}

  async get(userId: string): Promise<MonthShape> {
    return this.build(await this.snapshot.get(userId));
  }

  build(s: Snapshot): MonthShape {
    const day = dayOfMonth(s.today);
    const dim = daysInMonth(s.month);
    const budget = sum(FLEX_BUDGET_SLUGS.map((k) => s.budgets[k] ?? 0));
    const monthFrom = `${s.month}-01`;

    // Cumulative flexible spend, day by day (unsorted payments count: they will be sorted into one of these lines).
    const spentSeries: Array<{ day: number; value: string }> = [];
    let cum = D(0);
    for (let d = 1; d <= day; d++) {
      const date = `${s.month}-${String(d).padStart(2, '0')}`;
      cum = cum
        .plus(sum(FLEX_BUDGET_SLUGS.map((k) => spent(s.txs, { slug: k, from: date, to: date }))))
        .plus(spent(s.txs, { unsorted: true, from: date, to: date }));
      spentSeries.push({ day: d, value: m2(cum) });
    }
    const shareNow = flexPaceShare(s.txs, s.budgets, day, s.today, s.pace);
    const projected = shareNow > 0.05 ? cum.div(shareNow) : cum.div(day).times(dim);
    const pace: Array<{ day: number; value: string }> = [];
    const forecast: Array<{ day: number; value: string }> = [];
    for (let d = 1; d <= dim; d++) {
      const share = flexPaceShare(s.txs, s.budgets, d, s.today, s.pace);
      pace.push({ day: d, value: m2(budget.times(share)) });
      if (d >= day) forecast.push({ day: d, value: m2(cum.plus(projected.minus(cum).times(share - shareNow).div(Math.max(0.0001, 1 - shareNow)))) });
    }

    const ranked = BUDGET_SLUGS.filter((k) => k !== 'rent')
      .map((slug) => ({ slug, spent: spent(s.txs, { slug, from: monthFrom, to: s.today }), budget: D(s.budgets[slug] ?? 0) }))
      .sort((a, b) => b.spent.comparedTo(a.spent))
      .map((r) => {
        const c = s.cats.find((x) => x.slug === r.slug)!;
        return { category: { id: c.id, name: c.name, slug: c.slug, colour: c.colour, icon: c.icon, parentId: c.parentId }, spent: m2(r.spent), budget: m2(r.budget) };
      });

    // Net worth: month-end spending balances back six months, then today.
    const months = [6, 5, 4, 3, 2, 1].map((k) => addMonths(s.month, -k));
    const accountTxs = s.txs.filter((t) => s.spendAccountIds.has(t.accountId));
    const netByMonth: Record<string, string> = {};
    for (const t of accountTxs) {
      const m = t.date.slice(0, 7);
      netByMonth[m] = D(netByMonth[m] ?? 0).plus(t.amount).toString();
    }
    const potsTotal = sum(s.pots.map((p) => this.snapshot.potBalance(p)));
    const owedToMe = sum(s.people.filter((p) => p.direction === 'OWED').map((p) => D(p.amount.toString()).minus(this.snapshot.personPaid(s, p)).clamp(0, Infinity)));
    const owe = sum(s.people.filter((p) => p.direction === 'OWE').map((p) => D(p.amount.toString()).minus(this.snapshot.personPaid(s, p)).clamp(0, Infinity)));
    const today = D(s.balance).plus(potsTotal).plus(owedToMe).minus(owe);
    const series = netWorthSeries({ currentMonth: s.month, months: 7, cashNow: m2(s.balance), netByMonth });
    const withToday = [...series.slice(0, -1), { month: s.month, value: m2(today) }];
    void months;

    // Last month, day by day, for "vs last month".
    const prevMonth = addMonths(s.month, -1);
    const prevDim = daysInMonth(prevMonth);
    const previous: Array<{ day: number; value: string }> = [];
    let pcum = D(0);
    for (let d = 1; d <= prevDim; d++) {
      const date = `${prevMonth}-${String(d).padStart(2, '0')}`;
      pcum = pcum
        .plus(sum(FLEX_BUDGET_SLUGS.map((k) => spent(s.txs, { slug: k, from: date, to: date }))))
        .plus(spent(s.txs, { unsorted: true, from: date, to: date }));
      previous.push({ day: d, value: m2(pcum) });
    }

    return {
      month: s.month,
      day,
      daysInMonth: dim,
      burn: { budget: m2(budget), projected: m2(projected), spent: spentSeries, pace, forecast, previous, previousLabel: MONTH_NAMES[Number(prevMonth.slice(5)) - 1]! },
      ranked,
      netWorth: {
        current: m2(today),
        series: withToday,
        changeSixMonths: m2(D(withToday.at(-1)!.value).minus(withToday[0]!.value)),
      },
      goodToKnow: this.goodToKnow(s),
    };
  }

  private goodToKnow(s: Snapshot): Array<{ title: string; body: string }> {
    const out: Array<{ title: string; body: string }> = [];
    const monthFrom = `${s.month}-01`;
    const money = (v: Decimal | string): string => `€${D(v).toFixed(2)}`;
    const coffee = spent(s.txs, { slug: 'coffee', from: monthFrom, to: s.today });
    if (coffee.gt(0)) {
      out.push({
        title: `Coffee: ${money(coffee)} so far this month`,
        body: `About ${eur0(projectedSpend(s.txs, 'coffee', coffee, s.today, s.pace).times(12).toFixed(2))} a year at your usual pace.`,
      });
    }
    const prev = addMonths(s.month, -1);
    const from = `${prev}-01`;
    const to = `${prev}-${String(daysInMonth(prev)).padStart(2, '0')}`;
    const inc = incomeIn(s.txs, from, to);
    const out2 = spent(s.txs, { from, to });
    const prevName = MONTH_NAMES[Number(prev.slice(5)) - 1]!;
    if (inc.gt(0)) {
      out.push(
        inc.gte(out2)
          ? { title: `${prevName}: you kept ${Math.round(inc.minus(out2).div(inc).times(100).toNumber())}% of what came in`, body: `${eur0(inc.minus(out2).toFixed(2))} left after ${eur0(out2.toFixed(2))} of spending, your rent share included.` }
          : { title: `${prevName}: you spent ${eur0(out2.minus(inc).toFixed(2))} more than came in`, body: `${eur0(out2.toFixed(2))} of spending, your rent share included, against ${eur0(inc.toFixed(2))} in.` },
      );
    }
    const cfg = toRentConfig(s.prefs);
    const round = cfg ? rentRounds(s.txs, cfg).find((r) => r.month === s.month) : undefined;
    const dShort = (d: string): string => `${Number(d.slice(8))} ${MONTH_NAMES[Number(d.slice(5, 7)) - 1]!.slice(0, 3)}`;
    if (round) {
      const who = round.mates.map((m) =>
        D(m.left).lte(0) ? `${m.name} paid on ${dShort(m.paid[m.paid.length - 1]!)}` : D(m.got).gt(0) ? `${m.name} has sent ${eur0(m.got)} of ${eur0(round.own)}` : `${m.name} has not paid yet`,
      );
      out.push({
        title: `Rent: your share is ${eur0(round.own)}`,
        body: `${eur0(round.total)} left AIB on ${dShort(round.date)}. ${who.join('; ')}. None of it counts as income.`,
      });
    }
    const rv = s.txs.filter((t) => t.kind === 'TRANSFER' && D(t.amount).lt(0) && diffDays(t.date, s.today) <= 92);
    if (rv.length) {
      out.push({ title: `${eur0(sum(rv.map((t) => D(t.amount).neg())).toFixed(2))} moved between your own accounts in the last 3 months`, body: `${rv.length} transfers, matched as your own money and kept out of spending.` });
    }
    const rf = recentRefunds(s.txs, s.today).at(-1);
    if (rf) {
      const name = rf.slug ? s.names[rf.slug] : 'its category';
      out.push({ title: `${rf.merchantName} refund netted against ${name}`, body: `${money(rf.amount)} came back on ${dlY(rf.date)}, so ${name} shows what you really spent.` });
    }
    const pend = s.txs.filter((t) => t.pending);
    if (pend.length) out.push({ title: `${pend.length} card payment${pend.length > 1 ? 's' : ''} still pending`, body: `${money(sum(pend.map((t) => D(t.amount).neg())))}, already counted in safe to spend.` });
    void addDays;
    void FIXED_BUDGET_SLUGS;
    return out;
  }
}
