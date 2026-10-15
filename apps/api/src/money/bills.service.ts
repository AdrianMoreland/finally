import { Injectable } from '@nestjs/common';
import type { BillsDto as BillsShape } from '@finally/contracts';
import { addDays, D, doubleCharges, m2, recentRefunds, returnedDirectDebits, spent, sum } from '@finally/finance-core';
import { LedgerService } from '../data/ledger.service';
import { SnapshotService, type Snapshot } from '../snapshot/snapshot.service';

@Injectable()
export class BillsService {
  constructor(
    private readonly snapshot: SnapshotService,
    private readonly ledger: LedgerService,
  ) {}

  async get(userId: string): Promise<BillsShape> {
    return this.build(await this.snapshot.get(userId));
  }

  private ref(s: Snapshot, slug: string | null) {
    const c = slug ? s.cats.find((x) => x.slug === slug) : null;
    return c ? { id: c.id, name: c.name, slug: c.slug, colour: c.colour, icon: c.icon, parentId: c.parentId } : null;
  }

  build(s: Snapshot): BillsShape {
    const subs = s.repeating.filter((r) => r.slug === 'subscriptions');
    const active = subs.filter((r) => !s.cancelled.has(r.id));
    const monthly = sum(active.map((r) => r.amount));
    const dismissed = new Set(s.prefs.dismissed);
    return {
      repeating: s.repeating.map((r) => ({ ...r, cancelled: s.cancelled.has(r.id) })),
      upcoming: s.upcoming,
      billsBeforePayday: m2(sum(s.upcoming.filter((b) => b.date < s.nextPay).map((b) => b.amount))),
      subscriptions: {
        monthly: m2(monthly),
        yearly: m2(monthly.times(12)),
        savedMonthly: m2(sum(subs.filter((r) => s.cancelled.has(r.id)).map((r) => r.amount))),
      },
      doubles: doubleCharges(s.txs, s.today).filter((d) => !dismissed.has(d.id)),
      refunds: recentRefunds(s.txs, s.today).map((t) => ({
        id: t.id,
        merchantName: t.merchantName,
        date: t.date,
        amount: m2(t.amount),
        category: this.ref(s, t.slug),
      })),
      returnedDebits: returnedDirectDebits(s.txs).map((t) => ({ id: t.id, merchantName: t.merchantName, date: t.date, amount: m2(t.amount) })),
      fees: { last12Months: m2(spent(s.txs, { slug: 'fees', from: addDays(s.today, -365), to: s.today })) },
    };
  }

  /** Mark a repeating payment as cancelled (or not) to see what it would save. Nothing changes at the bank. */
  async cancel(userId: string, id: string, cancelled: boolean): Promise<BillsShape> {
    const prefs = await this.ledger.prefs(userId);
    const set = new Set(prefs.subsCancelled);
    if (cancelled) set.add(id);
    else set.delete(id);
    await this.ledger.patchPrefs(userId, { subsCancelled: [...set] });
    return this.get(userId);
  }

  async dismiss(userId: string, id: string): Promise<BillsShape> {
    const prefs = await this.ledger.prefs(userId);
    await this.ledger.patchPrefs(userId, { dismissed: [...new Set([...prefs.dismissed, id])] });
    return this.get(userId);
  }
}

export { D };
