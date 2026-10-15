import { Injectable } from '@nestjs/common';
import type { Db } from '@finally/db';
import { resolvePrefs, type UserPrefs } from '@finally/contracts';
import { D, dublinDate, sum, type LedgerTx } from '@finally/finance-core';
import { InjectDb } from '../common/tokens';

/** Plain objects merge recursively; arrays and scalars replace. */
function merge(base: unknown, patch: unknown): unknown {
  if (patch && typeof patch === 'object' && !Array.isArray(patch) && base && typeof base === 'object' && !Array.isArray(base)) {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [k, v] of Object.entries(patch as Record<string, unknown>)) out[k] = merge(out[k], v);
    return out;
  }
  return patch;
}

/** Loads payments in the shape Today, Money and Plan work with, and reads and writes per-user preferences. */
@Injectable()
export class LedgerService {
  constructor(@InjectDb() private readonly db: Db) {}

  async txs(userId: string, from: string, to: string): Promise<LedgerTx[]> {
    const rows = await this.db.transaction.findMany({
      where: {
        userId,
        bookingDate: { gte: new Date(`${from}T00:00:00Z`), lt: new Date(new Date(`${to}T00:00:00Z`).getTime() + 2 * 86_400_000) },
      },
      include: {
        account: { include: { connection: { select: { institution: true } } } },
        merchant: { select: { merchantKey: true, displayName: true } },
        category: { select: { slug: true, parent: { select: { slug: true } } } },
      },
      orderBy: [{ bookingDate: 'asc' }, { id: 'asc' }],
    });
    return rows
      .map((t): LedgerTx => ({
        id: t.id,
        date: dublinDate(t.bookingDate),
        amount: t.amountEur.toString(),
        kind: t.kind,
        accountId: t.accountId,
        institution: t.account.connection.institution,
        merchantKey: t.merchant?.merchantKey ?? null,
        merchantName: t.merchant?.displayName ?? t.rawDescriptor,
        rawDescriptor: t.rawDescriptor,
        slug: t.category?.slug ?? null,
        parentSlug: t.category?.parent?.slug ?? null,
        excluded: t.excluded,
        pending: t.status === 'PENDING',
        flag: t.flag,
        note: t.note,
      }))
      .filter((t) => t.date >= from && t.date <= to);
  }

  /** What the accounts that fund day-to-day spending hold: current accounts counted in net worth. */
  async spendingBalance(userId: string): Promise<string> {
    const accounts = await this.db.account.findMany({ where: { userId, type: 'CURRENT', includeInNetWorth: true }, select: { balance: true } });
    return sum(accounts.map((a) => a.balance.toString())).toFixed(2);
  }

  async prefs(userId: string): Promise<UserPrefs> {
    const u = await this.db.user.findUniqueOrThrow({ where: { id: userId }, select: { prefs: true } });
    return resolvePrefs(u.prefs);
  }

  /** Merge a partial update into the stored preferences and return the resolved result. */
  async patchPrefs(userId: string, patch: object): Promise<UserPrefs> {
    const u = await this.db.user.findUniqueOrThrow({ where: { id: userId }, select: { prefs: true } });
    const next = resolvePrefs(merge(resolvePrefs(u.prefs), patch));
    await this.db.user.update({ where: { id: userId }, data: { prefs: next as object } });
    return next;
  }

  /** Replace one top-level preference section outright (patchPrefs merges, so it cannot remove keys). */
  async setSection<K extends keyof UserPrefs>(userId: string, key: K, value: UserPrefs[K]): Promise<UserPrefs> {
    const u = await this.db.user.findUniqueOrThrow({ where: { id: userId }, select: { prefs: true } });
    const next = resolvePrefs({ ...resolvePrefs(u.prefs), [key]: value });
    await this.db.user.update({ where: { id: userId }, data: { prefs: next as object } });
    return next;
  }
}

export const toNumber = (v: { toString(): string } | string | number): number => D(String(v)).toNumber();
