import { Injectable } from '@nestjs/common';
import type { Db } from '@finally/db';
import type { CashflowDto, CashflowPeriod } from '@finally/contracts';
import { buildCashflow, CF_PERIOD_LABEL, cfRange, D, keptRate, m2, type LedgerTx } from '@finally/finance-core';
import { InjectDb } from '../common/tokens';
import { toRentConfig } from '../data/rent-config';
import { SnapshotService, type Snapshot } from '../snapshot/snapshot.service';

/** Where your money came from and went, over a period. A thin wrapper: the maths lives in finance-core. */
@Injectable()
export class CashflowService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly snapshot: SnapshotService,
  ) {}

  async get(userId: string, period: CashflowPeriod, pass: boolean): Promise<CashflowDto> {
    return this.build(await this.snapshot.get(userId), period, pass);
  }

  async build(s: Snapshot, period: CashflowPeriod, pass: boolean): Promise<CashflowDto> {
    const range = cfRange(period, s.today, s.user.paydayDayOfMonth, true);
    const accounts = await this.db.account.findMany({ where: { userId: s.userId }, select: { id: true, name: true, type: true } });
    const vaultIds = new Set(accounts.filter((a) => a.type === 'VAULT').map((a) => a.id));
    const accountName = new Map(accounts.map((a) => [a.id, a.name]));

    // A pot is a vault: payments into it are found by a text matcher (the pot's name unless you set one).
    const matchers = s.pots.map((p) => ({ id: p.id, name: p.name, match: (s.prefs.vaults.find((v) => v.potId === p.id)?.match ?? p.name).toLowerCase() }));
    const potOf = (t: LedgerTx): { id: string; name: string } | null => {
      if (vaultIds.has(t.accountId) || t.kind === 'INCOME') return null;
      const raw = `${t.rawDescriptor} ${t.merchantName}`.toLowerCase();
      const hit = matchers.find((m) => m.match && raw.includes(m.match));
      return hit ? { id: hit.id, name: hit.name } : null;
    };
    const owe = new Map(s.people.filter((p) => p.direction === 'OWE' && p.merchantKey).map((p) => [p.merchantKey!, p.name]));
    const personOf = (t: LedgerTx): string | null => (t.merchantKey ? (owe.get(t.merchantKey) ?? null) : null);

    const cf = buildCashflow(s.txs, range, { pass, names: s.names, potOf, personOf });
    const byId = new Map(s.txs.map((t) => [t.id, t]));
    const catOf = new Map(s.cats.map((c) => [c.slug, c]));

    const payments = cf.items
      .map((i) => ({ i, t: byId.get(i.txId) }))
      .filter((x): x is { i: (typeof cf.items)[number]; t: LedgerTx } => !!x.t)
      .sort((a, b) => b.t.date.localeCompare(a.t.date))
      .map(({ i, t }) => {
        const c = t.slug ? catOf.get(t.slug) : undefined;
        return {
          id: t.id,
          date: t.date,
          name: t.kind === 'FRONT' ? 'Rent paid for the house' : t.merchantName,
          amount: m2(t.amount),
          bankAmount: t.bankAmount ? m2(t.bankAmount) : null,
          account: accountName.get(t.accountId) ?? t.institution,
          kind: t.kind,
          category: c ? { id: c.id, name: c.name, slug: c.slug, colour: c.colour, icon: c.icon, parentId: c.parentId } : null,
          excluded: t.excluded,
          pending: t.pending,
          keys: i.keys,
        };
      });

    const cfg = toRentConfig(s.prefs);
    const rentRow = s.txs.find((t) => t.bankAmount && t.date >= range.from && t.date <= range.to);
    const kept = keptRate(cf);
    return {
      period,
      label: CF_PERIOD_LABEL[period],
      from: range.from,
      to: range.to,
      income: cf.income,
      spent: cf.spent,
      saved: cf.saved,
      paidBack: cf.paidBack,
      fromPots: cf.fromPots,
      fronted: cf.fronted,
      back: cf.back,
      out: cf.out,
      inn: cf.inn,
      kept,
      sources: cf.sources,
      groups: cf.groups,
      payments,
      rent: cfg ? { own: m2(D(cfg.total).div(cfg.household)), total: m2(rentRow?.bankAmount ? D(rentRow.bankAmount).abs() : cfg.total) } : null,
    };
  }
}
