import { Injectable } from '@nestjs/common';
import type { Db } from '@finally/db';
import { FIXED_CATEGORY_SLUGS } from '@finally/contracts';
import { D, dublinDate, type CoreCategory, type CoreTx, type Decimal } from '@finally/finance-core';
import { InjectDb } from '../common/tokens';

export interface CategoryInfo extends CoreCategory {
  colour: string;
  icon: string;
  archived: boolean;
  askGroup: string;
}

/** Shared read helpers that turn database rows into the plain shapes finance-core works on. */
@Injectable()
export class FinanceDataService {
  constructor(@InjectDb() private readonly db: Db) {}

  async categories(userId: string): Promise<CategoryInfo[]> {
    const rows = await this.db.category.findMany({ where: { userId }, orderBy: { sortOrder: 'asc' } });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      parentId: c.parentId,
      group: c.group,
      fixed: FIXED_CATEGORY_SLUGS.includes(c.slug),
      colour: c.colour,
      icon: c.icon,
      archived: c.archived,
      askGroup: c.askGroup,
    }));
  }

  /** Transactions in a Dublin-date range as CoreTx (newest last). */
  async coreTxs(userId: string, from: string, to: string): Promise<CoreTx[]> {
    const rows = await this.db.transaction.findMany({
      where: {
        userId,
        bookingDate: { gte: new Date(`${from}T00:00:00Z`), lt: new Date(new Date(`${to}T00:00:00Z`).getTime() + 2 * 86_400_000) },
        status: { in: ['BOOKED', 'PENDING'] },
      },
      include: { merchant: { select: { merchantKey: true, displayName: true } } },
      orderBy: { bookingDate: 'asc' },
    });
    return rows
      .map((t) => ({
        id: t.id,
        accountId: t.accountId,
        date: dublinDate(t.bookingDate),
        amountEur: t.amountEur.toString(),
        kind: t.kind,
        categoryId: t.categoryId,
        merchantKey: t.merchant?.merchantKey ?? null,
        merchantName: t.merchant?.displayName ?? null,
        excluded: t.excluded,
      }))
      .filter((t) => t.date >= from && t.date <= to);
  }

  /**
   * Net spend per category for transactions in `[from, to]`: SPEND minus REFUND and housemates' SHAREs; payments marked excluded are left out. Children roll up into their
   * parent when `rollUp` is set. Transfers and income are excluded.
   */
  spendByCategory(txs: readonly CoreTx[], categories: readonly CoreCategory[], rollUp: boolean): Map<string, Decimal> {
    const parentOf = new Map(categories.map((c) => [c.id, c.parentId]));
    const out = new Map<string, Decimal>();
    for (const t of txs) {
      if (!t.categoryId) continue;
      if (t.kind !== 'SPEND' && t.kind !== 'REFUND' && t.kind !== 'SHARE') continue;
      if (t.excluded) continue;
      const spend = D(t.amountEur).neg(); // negative amount = money out = positive spend; refunds net down
      const keys = [t.categoryId];
      if (rollUp) {
        const p = parentOf.get(t.categoryId);
        if (p) keys.push(p);
      }
      for (const k of keys) out.set(k, (out.get(k) ?? D(0)).plus(spend));
    }
    return out;
  }
}
