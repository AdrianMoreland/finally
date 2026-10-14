import { Injectable } from '@nestjs/common';
import type { Db } from '@finally/db';
import { D, dedupeSeed, detectTransfers, dublinDate, normaliseMerchant, addDays, m2 } from '@finally/finance-core';
import { InjectDb } from '../common/tokens';
import { sha256 } from '../common/crypto';
import { FxService } from '../market-data/fx.service';
import type { RawBankTx } from './providers/bank-provider';

export interface IngestResult {
  created: number;
  updatedPending: number;
  duplicates: number;
  removedPending: number;
}

const REFUND_RE = /\b(refund|refd|reversal|rfnd|chargeback)\b/i;

/** Identity of a payment: the bank's id when it gives one, otherwise a hash of its content. */
export function dedupeHashFor(accountId: string, raw: RawBankTx): string {
  return raw.providerTxId
    ? sha256(`${accountId}|id|${raw.providerTxId}`)
    : sha256(dedupeSeed(accountId, raw.bookingDate, raw.amount, raw.rawDescriptor));
}

@Injectable()
export class IngestService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly fx: FxService,
  ) {}

  /**
   * Write bank payments for one account. Dedupes, upgrades PENDING rows to BOOKED, removes pending rows the
   * bank no longer reports within the re-read window, and attaches merchants. Categorisation happens later.
   */
  async ingest(
    userId: string,
    account: { id: string; currency: string },
    raws: readonly RawBankTx[],
    windowFrom: string,
  ): Promise<IngestResult> {
    if (raws.length === 0) return { created: 0, updatedPending: 0, duplicates: 0, removedPending: 0 };

    const withHash = raws.map((raw) => ({ raw, hash: dedupeHashFor(account.id, raw) }));
    const seenHashes = new Set(withHash.map((x) => x.hash));
    const existing = await this.db.transaction.findMany({
      where: { userId, dedupeHash: { in: [...seenHashes] } },
      select: { id: true, dedupeHash: true, status: true },
    });
    const existingByHash = new Map(existing.map((e) => [e.dedupeHash, e]));

    let updatedPending = 0;
    let duplicates = 0;
    const fresh: typeof withHash = [];
    const pendingRows = await this.db.transaction.findMany({
      where: { userId, accountId: account.id, status: 'PENDING' },
      select: { id: true, amount: true, rawDescriptor: true, dedupeHash: true },
    });
    const claimed = new Set<string>();

    for (const item of withHash) {
      const known = existingByHash.get(item.hash);
      if (known) {
        if (known.status === 'PENDING' && item.raw.status === 'BOOKED') {
          await this.db.transaction.update({
            where: { id: known.id },
            data: { status: 'BOOKED', bookingDate: new Date(`${item.raw.bookingDate}T12:00:00Z`) },
          });
          updatedPending++;
        } else duplicates++;
        continue;
      }
      if (item.raw.status === 'BOOKED') {
        const match = pendingRows.find(
          (p) => !claimed.has(p.id) && D(p.amount.toString()).equals(item.raw.amount) && p.rawDescriptor === item.raw.rawDescriptor,
        );
        if (match) {
          claimed.add(match.id);
          await this.db.transaction.update({
            where: { id: match.id },
            data: {
              status: 'BOOKED',
              dedupeHash: item.hash,
              providerTxId: item.raw.providerTxId,
              bookingDate: new Date(`${item.raw.bookingDate}T12:00:00Z`),
            },
          });
          updatedPending++;
          continue;
        }
      }
      fresh.push(item);
    }

    // Merchants
    const merchantByKey = new Map<string, { key: string; name: string }>();
    for (const { raw } of fresh) {
      const n = normaliseMerchant(raw.rawDescriptor);
      merchantByKey.set(n.merchantKey, { key: n.merchantKey, name: n.displayName });
    }
    if (merchantByKey.size) {
      await this.db.merchant.createMany({
        data: [...merchantByKey.values()].map((m) => ({ userId, merchantKey: m.key, displayName: m.name })),
        skipDuplicates: true,
      });
    }
    const merchants = await this.db.merchant.findMany({
      where: { userId, merchantKey: { in: [...merchantByKey.keys()] } },
      select: { id: true, merchantKey: true },
    });
    const merchantId = new Map(merchants.map((m) => [m.merchantKey, m.id]));

    const rows = [];
    for (const { raw, hash } of fresh) {
      const amount = D(raw.amount);
      const kind = amount.isNegative() ? 'SPEND' : REFUND_RE.test(raw.rawDescriptor) ? 'REFUND' : 'INCOME';
      const amountEur = raw.currency === 'EUR' ? m2(amount) : await this.fx.toEur(m2(amount), raw.currency);
      rows.push({
        userId,
        accountId: account.id,
        providerTxId: raw.providerTxId,
        dedupeHash: hash,
        bookingDate: new Date(`${raw.bookingDate}T12:00:00Z`),
        valueDate: raw.valueDate ? new Date(`${raw.valueDate}T12:00:00Z`) : null,
        amount: m2(amount),
        currency: raw.currency,
        amountEur,
        rawDescriptor: raw.rawDescriptor,
        merchantId: merchantId.get(normaliseMerchant(raw.rawDescriptor).merchantKey) ?? null,
        status: raw.status,
        kind,
      } as const);
    }
    const created = rows.length ? (await this.db.transaction.createMany({ data: rows, skipDuplicates: true })).count : 0;

    // Pending rows inside the window that the bank no longer reports were cancelled.
    const stale = await this.db.transaction.deleteMany({
      where: {
        userId,
        accountId: account.id,
        status: 'PENDING',
        bookingDate: { gte: new Date(`${windowFrom}T00:00:00Z`) },
        dedupeHash: { notIn: [...seenHashes] },
        id: { notIn: [...claimed] },
      },
    });
    return { created, updatedPending, duplicates, removedPending: stale.count };
  }

  /** Pair equal-and-opposite payments across the user's own accounts as transfers (excluded from spending). */
  async linkTransfers(userId: string, today: string): Promise<number> {
    const accounts = await this.db.account.findMany({ where: { userId }, select: { id: true } });
    const from = addDays(today, -420);
    const rows = await this.db.transaction.findMany({
      where: {
        userId,
        transferPairId: null,
        bookingDate: { gte: new Date(`${from}T00:00:00Z`) },
        kind: { in: ['SPEND', 'INCOME'] },
        status: 'BOOKED',
      },
      select: { id: true, accountId: true, bookingDate: true, amountEur: true },
    });
    const pairs = detectTransfers(
      rows.map((r) => ({ id: r.id, accountId: r.accountId, date: dublinDate(r.bookingDate), amountEur: r.amountEur.toString() })),
      accounts.map((a) => a.id),
    );
    const transfers = await this.db.category.findFirst({ where: { userId, slug: 'transfers' }, select: { id: true } });
    // Transfers always carry the Transfers category, whichever step touched them last.
    if (transfers) {
      await this.db.transaction.updateMany({
        where: { userId, kind: 'TRANSFER', OR: [{ categoryId: null }, { categoryId: { not: transfers.id } }] },
        data: { categoryId: transfers.id, categorisedBy: 'SEED', needsReview: false },
      });
    }
    if (pairs.length === 0) return 0;
    for (const p of pairs) {
      await this.db.transaction.updateMany({
        where: { id: { in: [p.outId, p.inId] } },
        data: {
          kind: 'TRANSFER',
          transferPairId: p.pairId,
          categoryId: transfers?.id ?? null,
          categorisedBy: 'SEED',
          needsReview: false,
        },
      });
    }
    return pairs.length;
  }
}
