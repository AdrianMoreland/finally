import { D } from './decimal';
import { diffDays } from './dates';

export interface TransferCandidate {
  id: string;
  accountId: string;
  /** Dublin calendar date, YYYY-MM-DD */
  date: string;
  /** Signed EUR amount */
  amountEur: string;
}

export interface TransferPair {
  pairId: string;
  outId: string;
  inId: string;
}

/**
 * Pair opposite-signed, equal-sized transactions across the user's own accounts that land within
 * `windowDays` of each other. Each transaction joins at most one pair; closest dates win.
 */
export function detectTransfers(
  transactions: readonly TransferCandidate[],
  ownAccountIds: readonly string[],
  windowDays = 2,
): TransferPair[] {
  const own = new Set(ownAccountIds);
  const eligible = transactions.filter((t) => own.has(t.accountId) && !D(t.amountEur).isZero());
  const outs = eligible.filter((t) => D(t.amountEur).isNegative());
  const ins = eligible.filter((t) => D(t.amountEur).isPositive());

  const candidates: Array<{ out: TransferCandidate; inn: TransferCandidate; gap: number }> = [];
  for (const out of outs) {
    for (const inn of ins) {
      if (out.accountId === inn.accountId) continue;
      if (!D(out.amountEur).abs().equals(D(inn.amountEur).abs())) continue;
      const gap = Math.abs(diffDays(out.date, inn.date));
      if (gap <= windowDays) candidates.push({ out, inn, gap });
    }
  }
  candidates.sort((a, b) => a.gap - b.gap || a.out.id.localeCompare(b.out.id) || a.inn.id.localeCompare(b.inn.id));

  const used = new Set<string>();
  const pairs: TransferPair[] = [];
  for (const c of candidates) {
    if (used.has(c.out.id) || used.has(c.inn.id)) continue;
    used.add(c.out.id);
    used.add(c.inn.id);
    pairs.push({ pairId: `tp_${c.out.id}_${c.inn.id}`, outId: c.out.id, inId: c.inn.id });
  }
  return pairs;
}
