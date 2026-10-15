import { Injectable } from '@nestjs/common';
import type { Db } from '@finally/db';
import type { CompleteSetupBody, FoundDto } from '@finally/contracts';
import { addDays, addMonths, budgetSuggestions, D, dublinDate, m2, median, spent } from '@finally/finance-core';
import { BudgetsService } from '../budgets/budgets.service';
import { parseDateOnly } from '../common/mappers';
import { InjectDb } from '../common/tokens';
import { LedgerService } from '../data/ledger.service';
import { PotsService } from '../pots/pots.service';
import { SnapshotService, type Snapshot } from '../snapshot/snapshot.service';

/** First-run setup: what Finally found in the history, and applying the answers. */
@Injectable()
export class SetupService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly snapshot: SnapshotService,
    private readonly ledger: LedgerService,
    private readonly budgets: BudgetsService,
    private readonly pots: PotsService,
  ) {}

  async found(userId: string): Promise<FoundDto> {
    return this.build(await this.snapshot.get(userId));
  }

  build(s: Snapshot): FoundDto {
    const last120 = addDays(s.today, -120);
    const last3 = [3, 2, 1].map((k) => addMonths(s.month, -k));
    const rentPayments = s.txs.filter((t) => t.slug === 'rent' && t.kind === 'SPEND');
    const recentRent = rentPayments.filter((t) => last3.some((m) => t.date.startsWith(m)));
    const shares = s.txs.filter((t) => t.kind === 'SHARE' && D(t.amount).gt(0) && t.date >= last120);
    const byMate = new Map<string, { name: string; key: string; total: ReturnType<typeof D>; count: number }>();
    for (const t of shares) {
      const key = t.merchantKey ?? t.merchantName;
      const cur = byMate.get(key) ?? { name: t.merchantName.split(' · ')[0]!.trim() || t.merchantName, key, total: D(0), count: 0 };
      cur.total = cur.total.plus(t.amount);
      cur.count++;
      byMate.set(key, cur);
    }
    const rentShareNet = median(last3.map((m) => spent(s.txs, { slug: 'rent', from: `${m}-01`, to: `${m}-31` })));
    return {
      salary: s.salary ? { amount: s.salary.amount, day: s.salary.day, count: s.salary.count, lastDate: s.salary.date } : null,
      rent: recentRent.length
        ? {
            amount: m2(median(recentRent.map((t) => D(t.amount).neg()))),
            day: Number(recentRent.at(-1)!.date.slice(8)),
            netAmount: m2(rentShareNet),
            shareCount: shares.length,
          }
        : null,
      housemates: [...byMate.values()].map((m) => ({ name: m.name, merchantKey: m.key, total: m2(m.total), count: m.count })),
      bills: s.repeating
        .filter((r) => (r.parentSlug ?? r.slug) !== 'rent')
        .map((r) => ({
          id: r.id,
          name: r.name,
          amount: r.amount,
          cadence: r.cadence,
          kind: (r.parentSlug ?? r.slug) === 'subscriptions' ? ('subscription' as const) : ('bill' as const),
          usualDay: r.usualDay,
        })),
      ownTransfers: s.txs.filter((t) => t.kind === 'TRANSFER' && t.date >= last120).length,
      months: Math.max(1, Math.round((Date.parse(`${s.today}T00:00:00Z`) - Date.parse(`${s.txs[0]?.date ?? s.today}T00:00:00Z`)) / (30.44 * 86_400_000))),
      payments: s.txs.length,
      unknownMerchants: new Set(s.txs.filter((t) => t.kind === 'SPEND' && t.slug === null).map((t) => t.merchantKey ?? t.rawDescriptor)).size,
      suggestedBudgets: budgetSuggestions(s.txs, s.today),
    };
  }

  /** Apply the answers from the setup flow. Safe to run again: budgets are upserted, people and pots are added once. */
  async complete(userId: string, body: CompleteSetupBody): Promise<{ ok: true }> {
    const s = await this.snapshot.get(userId);
    await this.db.user.update({
      where: { id: userId },
      data: { paydayDayOfMonth: body.paydayDayOfMonth, bufferAmount: m2(body.buffer), setupDoneAt: new Date() },
    });
    if (body.salary !== undefined) await this.ledger.patchPrefs(userId, { tax: { gross: body.salary } });
    if (body.notif) await this.ledger.patchPrefs(userId, { notif: body.notif });
    const cats = await this.db.category.findMany({ where: { userId, slug: { in: Object.keys(body.budgets) } } });
    for (const c of cats) {
      await this.budgets.upsert(userId, { categoryId: c.id, month: s.month, amount: body.budgets[c.slug]!, rollover: false });
    }
    await this.pots.provisionDefaults(userId);
    const existing = await this.db.pot.findMany({ where: { userId }, select: { name: true } });
    for (const p of body.pots) {
      if (existing.some((e) => e.name.toLowerCase() === p.name.toLowerCase())) continue;
      await this.pots.create(userId, p);
    }
    const people = await this.db.person.findMany({ where: { userId }, select: { name: true, direction: true } });
    for (const p of body.people) {
      if (people.some((e) => e.name.toLowerCase() === p.name.toLowerCase() && e.direction === p.direction)) continue;
      await this.db.person.create({
        data: {
          userId,
          name: p.name.trim(),
          direction: p.direction,
          amount: m2(p.amount),
          note: p.note,
          since: parseDateOnly(p.since ?? dublinDate(new Date())),
          merchantKey: p.merchantKey,
        },
      });
    }
    return { ok: true };
  }

  /**
   * Demo defaults for the mock bank: budgets from the last three months, the three starting pots, a housemate who
   * still owes part of a deposit, and a payday that matches the salary credits.
   */
  async applyDemoDefaults(userId: string): Promise<void> {
    const s = await this.snapshot.get(userId);
    const sug = budgetSuggestions(s.txs, s.today);
    const cats = await this.db.category.findMany({ where: { userId, slug: { in: Object.keys(sug) } } });
    for (const month of [addMonths(s.month, -1), s.month]) {
      for (const c of cats) {
        await this.db.budget.upsert({
          where: { userId_categoryId_month: { userId, categoryId: c.id, month } },
          update: {},
          create: { userId, categoryId: c.id, month, amount: m2(sug[c.slug]!) },
        });
      }
    }
    await this.pots.provisionDefaults(userId);
    if (s.salary) await this.db.user.update({ where: { id: userId }, data: { paydayDayOfMonth: 25 } });
    if ((await this.db.person.count({ where: { userId } })) === 0) {
      const lastRent = s.txs.filter((t) => t.slug === 'rent' && t.kind === 'SPEND').at(-1)?.date ?? s.today;
      const month = new Date(`${lastRent}T12:00:00Z`).toLocaleString('en-IE', { month: 'long', timeZone: 'UTC' });
      await this.db.person.createMany({
        data: [
          { userId, name: 'Adila', direction: 'OWED', amount: '614.00', note: `Her share of the ${month} rent`, since: parseDateOnly(lastRent), sortOrder: 0 },
          {
            userId,
            name: 'Adila',
            direction: 'OWED',
            amount: '229.00',
            note: 'The rest of her deposit',
            since: parseDateOnly('2026-05-11'),
            remindText: 'Hi Adila, quick one about the deposit: I have €458 from you, and a 4-way share of the €2,748 deposit is €687. Could you send the other €229 when you get a chance? Thanks!',
            sortOrder: 1,
          },
        ],
      });
    }
  }
}
