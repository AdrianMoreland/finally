import type { LedgerTx } from './ledger';
import { addDays, diffDays, monthOf, monthRange } from './dates';
import { D } from './decimal';

/** A stretch of days away from home. Months that overlap one are left out of "your usual pace". */
export interface TripRange {
  from: string;
  to: string;
}

/** Every calendar month that overlaps any trip. */
export function tripMonths(trips: readonly TripRange[]): Set<string> {
  const out = new Set<string>();
  for (const t of trips) for (const m of monthRange(monthOf(t.from), monthOf(t.to))) out.add(m);
  return out;
}

/**
 * Suggest trips: runs of at least three days where card spending happens only away from the home account (the one
 * with the most payments). Gaps of up to two days inside a run are bridged. Shown for confirmation, never applied
 * automatically.
 */
export function detectTrips(txs: readonly LedgerTx[], minDays = 3): TripRange[] {
  const spend = txs.filter((t) => t.kind === 'SPEND' && D(t.amount).lt(0));
  const counts = new Map<string, number>();
  for (const t of spend) counts.set(t.accountId, (counts.get(t.accountId) ?? 0) + 1);
  const home = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!home) return [];
  const homeDays = new Set(spend.filter((t) => t.accountId === home).map((t) => t.date));
  const away = [...new Set(spend.filter((t) => t.accountId !== home && !homeDays.has(t.date)).map((t) => t.date))].sort();
  const runs: TripRange[] = [];
  for (const d of away) {
    const last = runs[runs.length - 1];
    if (last && diffDays(last.to, d) <= 3) last.to = d;
    else runs.push({ from: d, to: d });
  }
  // A day with home-account spending inside a run means you were home: split there.
  return runs
    .map((r) => {
      let to = r.to;
      for (let d = r.from; d <= r.to; d = addDays(d, 1)) if (homeDays.has(d) && d > r.from) { to = addDays(d, -1); break; }
      return { from: r.from, to };
    })
    .filter((r) => diffDays(r.from, r.to) + 1 >= minDays);
}
