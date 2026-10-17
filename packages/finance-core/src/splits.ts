import type { LedgerKind, LedgerTx } from './ledger';
import type { Decimal } from './decimal';
import { D, m2, sum } from './decimal';

/**
 * One part of a split transaction (see ADR 0001: the bank row never changes, every screen reads the parts).
 * A cash part carries a signed amount with the sign of the transaction. A non-cash part (`nonCash`) was settled
 * without money moving, such as a housemate deducting your share of a bill from their rent transfer: its amount is
 * the positive value, `shareOf` is who covered it, and it counts as your spending in `slug` and as paid toward their
 * rent share.
 */
export interface SplitPart {
  amount: string;
  kind: LedgerKind;
  categoryId: string | null;
  slug: string | null;
  parentSlug: string | null;
  shareOf?: string | null;
  shareMonth?: string | null;
  nonCash?: boolean;
}

export interface RentRef {
  categoryId: string | null;
  slug: string | null;
  parentSlug: string | null;
}

export interface ExpandedPart {
  /** `p<i>` for a cash part, `n<i>` for the spending of a non-cash part, `n<i>c` for the rent share it settles. */
  key: string;
  amount: string;
  part: SplitPart;
}

/** Why a set of parts cannot be saved for a transaction of this amount, or null when it can. */
export function splitProblems(txAmount: string, parts: readonly SplitPart[]): string | null {
  const cash = parts.filter((p) => !p.nonCash);
  if (!cash.length) return 'Add at least one part';
  if (parts.some((p) => p.nonCash && !p.shareOf)) return 'A part settled without money needs the person who covered it';
  const out = D(txAmount).lt(0);
  if (cash.some((p) => (out ? D(p.amount).gt(0) : D(p.amount).lt(0)))) return `Every part must be money ${out ? 'out' : 'in'}, like the transaction`;
  const total = sum(cash.map((p) => p.amount));
  if (!total.eq(D(txAmount))) return `The parts add up to €${total.abs().toFixed(2)} but the transaction is €${D(txAmount).abs().toFixed(2)}`;
  return null;
}

/**
 * The rows a split transaction stands for. If the bank has changed the amount since the split was made, the
 * difference goes into the largest cash part and `changed` is set so the screen can ask you to check it.
 */
export function expandParts(txAmount: string, parts: readonly SplitPart[], rent: RentRef): { rows: ExpandedPart[]; changed: boolean } {
  const rows: ExpandedPart[] = [];
  const cash = parts.map((p, i) => ({ p, i })).filter((x) => !x.p.nonCash);
  const diff = D(txAmount).minus(sum(cash.map((x) => x.p.amount)));
  let changed = false;
  let biggest = -1;
  if (!diff.isZero() && cash.length) {
    changed = true;
    biggest = cash.reduce((best, x) => (D(x.p.amount).abs().gt(D(parts[best]!.amount).abs()) ? x.i : best), cash[0]!.i);
  }
  parts.forEach((p, i) => {
    if (!p.nonCash) {
      rows.push({ key: `p${i}`, amount: m2(i === biggest ? D(p.amount).plus(diff) : p.amount), part: p });
      return;
    }
    const value = D(p.amount).abs();
    rows.push({ key: `n${i}`, amount: m2(value.neg()), part: { ...p, kind: 'SPEND' } });
    rows.push({ key: `n${i}c`, amount: m2(value), part: { ...p, kind: 'SHARE', categoryId: rent.categoryId, slug: rent.slug, parentSlug: rent.parentSlug, nonCash: true } });
  });
  return { rows, changed };
}

/** Replace each split transaction with its parts. Everything downstream reads this, never the raw rows. */
export function applySplits(rows: readonly LedgerTx[], splits: Readonly<Record<string, readonly SplitPart[]>>, rent: RentRef): LedgerTx[] {
  const out: LedgerTx[] = [];
  for (const t of rows) {
    const parts = splits[t.id];
    if (!parts?.length) {
      out.push(t);
      continue;
    }
    const { rows: expanded, changed } = expandParts(t.amount, parts, rent);
    for (const e of expanded) {
      out.push({
        ...t,
        id: `${t.id}:${e.key}`,
        amount: e.amount,
        kind: e.part.kind,
        slug: e.part.slug,
        parentSlug: e.part.parentSlug,
        shareOf: e.part.shareOf ?? null,
        shareMonth: e.part.shareMonth ?? null,
        splitOf: t.id,
        ...(changed ? { splitChanged: true } : {}),
      });
    }
  }
  return out;
}

export const splitCashTotal = (parts: readonly SplitPart[]): Decimal => sum(parts.filter((p) => !p.nonCash).map((p) => p.amount));
