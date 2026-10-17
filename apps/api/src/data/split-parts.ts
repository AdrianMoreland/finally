import type { Db, Prisma } from '@finally/db';
import type { RentRef, SplitPart } from '@finally/finance-core';

/** Splits read through the same category fields the ledger uses. */
export const partInclude = { category: { select: { id: true, name: true, slug: true, parent: { select: { slug: true } } } } } as const;

type PartRow = Prisma.TransactionPartGetPayload<{ include: typeof partInclude }>;

export function toSplitPart(p: PartRow): SplitPart {
  return {
    amount: p.amount.toString(),
    kind: p.kind,
    categoryId: p.categoryId,
    slug: p.category?.slug ?? null,
    parentSlug: p.category?.parent?.slug ?? null,
    shareOf: p.shareOf,
    shareMonth: p.shareMonth,
    nonCash: p.nonCash,
  };
}

/** Every split in a booking-date range, by transaction id. */
export async function loadSplits(db: Db, userId: string, gte: Date, lt: Date): Promise<Record<string, SplitPart[]>> {
  const rows = await db.transactionPart.findMany({
    where: { userId, transaction: { bookingDate: { gte, lt } } },
    include: partInclude,
    orderBy: [{ transactionId: 'asc' }, { position: 'asc' }],
  });
  const out: Record<string, SplitPart[]> = {};
  for (const r of rows) (out[r.transactionId] ??= []).push(toSplitPart(r));
  return out;
}

/** The Rent category, which the rent share a non-cash part settles is filed under. */
export async function rentRef(db: Db, userId: string): Promise<RentRef> {
  const c = await db.category.findFirst({ where: { userId, slug: 'rent' }, select: { id: true, slug: true, parent: { select: { slug: true } } } });
  return { categoryId: c?.id ?? null, slug: c?.slug ?? 'rent', parentSlug: c?.parent?.slug ?? null };
}
