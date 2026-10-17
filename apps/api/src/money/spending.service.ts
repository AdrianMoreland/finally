import { BadRequestException, Injectable } from '@nestjs/common';
import type { SpendingDto } from '@finally/contracts';
import { spendingSummary } from '@finally/finance-core';
import { FinanceDataService } from '../data/finance-data.service';
import { LedgerService } from '../data/ledger.service';

/** How much was spent, by category, over any period. A thin wrapper: the maths is `spendingSummary` in finance-core. */
@Injectable()
export class SpendingService {
  constructor(
    private readonly ledger: LedgerService,
    private readonly data: FinanceDataService,
  ) {}

  async get(userId: string, q: { from: string; to: string; category?: string }): Promise<SpendingDto> {
    if (q.from > q.to) throw new BadRequestException('The start date is after the end date');
    const [txs, cats] = await Promise.all([this.ledger.txs(userId, q.from, q.to), this.data.categories(userId)]);
    const bySlug = new Map(cats.map((c) => [c.slug, c]));
    const ref = (slug: string) => {
      const c = bySlug.get(slug);
      return { id: c?.id ?? slug, slug, name: c?.name ?? slug, colour: c?.colour ?? '#8A8F98' };
    };
    const s = spendingSummary(txs, { from: q.from, to: q.to, slug: q.category });
    return {
      from: s.from,
      to: s.to,
      total: s.total,
      count: s.count,
      average: s.average,
      perDay: s.perDay,
      groups: s.groups.map((g) => ({
        category: g.slug ? ref(g.slug) : null,
        spent: g.spent,
        count: g.count,
        share: g.share,
        children: g.children.map((c) => ({ category: ref(c.slug), spent: c.spent, count: c.count })),
      })),
    };
  }
}
