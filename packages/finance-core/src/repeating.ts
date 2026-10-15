import { D, median, sum } from './decimal';
import { addMonthsToDate, diffDays } from './dates';
import { isFixedSlug, type LedgerTx } from './ledger';

/**
 * Repeating payments found from history (no hard-coded list): rent, bills and subscriptions that arrive on a rhythm.
 * A rhythm is a run of payments with similar gaps ending recently. When a late or missed month breaks the rhythm it
 * falls back to "paid in each of the last three months at a similar amount".
 */
export interface Repeating {
  /** Merchant key, with the amount appended for merchants that bill several things (an Apple account). */
  id: string;
  merchantKey: string;
  name: string;
  slug: string | null;
  parentSlug: string | null;
  cadence: 'monthly' | 'quarterly';
  amount: string;
  avg: string;
  lo: string;
  hi: string;
  varies: boolean;
  /** A rise that stuck: the payment went up and stayed there. */
  rise: { from: string; to: string; since: string } | null;
  lastDate: string;
  nextDate: string;
  count: number;
  since: string;
  /** The day of month it usually lands, for "around the 21st". */
  usualDay: number;
}

const CADENCES: Array<{ cadence: 'monthly' | 'quarterly'; lo: number; hi: number; medLo: number; medHi: number; staleAfter: number; step: number }> = [
  { cadence: 'monthly', lo: 20, hi: 42, medLo: 26, medHi: 35, staleAfter: 45, step: 1 },
  { cadence: 'quarterly', lo: 80, hi: 100, medLo: 85, medHi: 95, staleAfter: 120, step: 3 },
];

export function detectRepeating(txs: readonly LedgerTx[], today: string, last3Months: readonly string[], multi: readonly string[] = ['apple']): Repeating[] {
  const groups = new Map<string, LedgerTx[]>();
  for (const t of txs) {
    if (t.kind !== 'SPEND' || t.pending || t.flag === 'bounced') continue;
    if (D(t.amount).neg().lt('0.5')) continue;
    const root = t.parentSlug ?? t.slug;
    if (!root || !isFixedSlug(root)) continue;
    // Rent is one thing even when the payee text changes from month to month ("MOBI RENT JULY", then "RENT SEPT").
    if (root !== 'rent' && !t.merchantKey) continue;
    const id = root === 'rent' ? 'rent' : multi.includes(t.merchantKey!) ? `${t.merchantKey}~${D(t.amount).neg().toFixed(2)}` : t.merchantKey!;
    const list = groups.get(id) ?? [];
    list.push(t);
    groups.set(id, list);
  }
  const out: Repeating[] = [];
  for (const [id, list] of groups) {
    if (list.length < 3) continue;
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    let found: { c: (typeof CADENCES)[number]; run: LedgerTx[] } | null = null;
    for (const c of CADENCES) {
      let i = sorted.length - 1;
      while (i > 0) {
        const g = diffDays(sorted[i - 1]!.date, sorted[i]!.date);
        if (g < c.lo || g > c.hi) break;
        i--;
      }
      const run = sorted.slice(i);
      if (run.length < 3) continue;
      const gaps = run.slice(1).map((t, j) => diffDays(run[j]!.date, t.date));
      const med = median(gaps).toNumber();
      if (med < c.medLo || med > c.medHi || diffDays(run[run.length - 1]!.date, today) > c.staleAfter) continue;
      found = { c, run };
      break;
    }
    if (!found) {
      const recent = sorted.filter((t) => diffDays(t.date, today) <= 200);
      const amounts = recent.map((t) => D(t.amount).neg());
      const md = median(amounts);
      if (
        recent.length >= 3 &&
        recent.length <= 8 &&
        last3Months.every((m) => recent.some((t) => t.date.startsWith(m))) &&
        diffDays(recent[recent.length - 1]!.date, today) <= 45 &&
        amounts.every((a) => a.minus(md).abs().lte(md.times('0.25')))
      ) {
        found = { c: CADENCES[0]!, run: recent };
      }
    }
    if (!found) continue;
    const { c, run } = found;
    const amts = run.map((t) => D(t.amount).neg());
    const last = amts[amts.length - 1]!;
    const first = amts[0]!;
    const ri = amts.findIndex((a) => a.gt(first.plus('0.005')));
    const stuck = ri > 0 && last.gt(first.times('1.005')) && amts.every((a, j) => j === 0 || a.gte(amts[j - 1]!.minus('0.005')));
    const lo = amts.reduce((a, b) => (b.lt(a) ? b : a));
    const hi = amts.reduce((a, b) => (b.gt(a) ? b : a));
    const lastTx = run[run.length - 1]!;
    out.push({
      id,
      merchantKey: lastTx.merchantKey ?? id,
      name: id === 'rent' ? 'Rent' : lastTx.merchantName,
      slug: lastTx.slug,
      parentSlug: lastTx.parentSlug,
      cadence: c.cadence,
      amount: last.toFixed(2),
      avg: sum(amts).div(amts.length).toFixed(2),
      lo: lo.toFixed(2),
      hi: hi.toFixed(2),
      varies: !stuck && hi.minus(lo).gt('0.01'),
      rise: stuck ? { from: first.toFixed(2), to: last.toFixed(2), since: run[ri]!.date } : null,
      lastDate: lastTx.date,
      nextDate: addMonthsToDate(lastTx.date, c.step),
      count: run.length,
      since: run[0]!.date,
      usualDay: Number(lastTx.date.slice(8)),
    });
  }
  return out.sort((a, b) => Number(b.avg) - Number(a.avg));
}

export interface UpcomingBill {
  id: string;
  name: string;
  date: string;
  amount: string;
  varies: boolean;
  slug: string | null;
}

/** Next date and amount for every repeating payment that is still on (not cancelled), soonest first. */
export function upcomingBills(repeating: readonly Repeating[], from: string, cancelled: ReadonlySet<string> = new Set()): UpcomingBill[] {
  return repeating
    .filter((r) => !cancelled.has(r.id))
    .map((r) => {
      let d = r.nextDate;
      const step = r.cadence === 'quarterly' ? 3 : 1;
      while (d <= from) d = addMonthsToDate(d, step);
      return { id: r.id, name: r.name, date: d, amount: r.varies ? D(r.avg).toFixed(2) : r.amount, varies: r.varies, slug: r.parentSlug ?? r.slug };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Same merchant, same amount, same day: worth a look. Rounds of drinks, coffees and shop trips are left out. */
export function doubleCharges(txs: readonly LedgerTx[], today: string, days = 30): Array<{ id: string; merchantName: string; date: string; amount: string; count: number }> {
  const quiet = new Set(['bars', 'coffee', 'eating-out', 'groceries', 'public-transport', 'fun']);
  const groups = new Map<string, LedgerTx[]>();
  for (const t of txs) {
    if (t.kind !== 'SPEND' || diffDays(t.date, today) > days || diffDays(t.date, today) < 0) continue;
    if (t.slug && quiet.has(t.slug)) continue;
    const k = `${t.merchantKey}~${t.date}~${t.amount}`;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  return [...groups]
    .filter(([, g]) => g.length > 1)
    .map(([id, g]) => ({ id, merchantName: g[0]!.merchantName, date: g[0]!.date, amount: D(g[0]!.amount).neg().toFixed(2), count: g.length }));
}

/** Money a merchant returned: refunds from the last `days`, ignoring pennies and bounced direct debits that came straight back. */
export function recentRefunds(txs: readonly LedgerTx[], today: string, days = 90): LedgerTx[] {
  return txs.filter((t) => t.kind === 'REFUND' && t.flag !== 'returned' && D(t.amount).gte(1) && diffDays(t.date, today) <= days);
}

export const returnedDirectDebits = (txs: readonly LedgerTx[]): LedgerTx[] => txs.filter((t) => t.flag === 'returned');
