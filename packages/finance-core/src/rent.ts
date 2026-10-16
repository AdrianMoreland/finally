import type { LedgerTx } from './ledger';
import { D, Decimal, m2, sum } from './decimal';
import { addDays, addMonthsToDate } from './dates';

/**
 * Rent you front. The landlord is paid in full from your account; housemates send their share back afterwards.
 * Your own share is the rent. The fronted part is neither spending nor income, and a housemate's transfer repays
 * it: it is never income and never netted against the Rent category.
 */
export interface RentFlatmate {
  id: string;
  name: string;
  /** Text matchers against the bank descriptor (case, accents and spacing ignored). */
  matchers: string[];
  /** Only credits on this account count, when set. */
  accountId?: string | null;
}

export interface RentConfig {
  /** What the landlord takes each month. 0 or empty means "any rent debit". */
  total: string;
  /** Day of the month the landlord is paid. */
  day: number;
  /** People sharing, you included. Below 2 the whole feature is off. */
  household: number;
  flatmates: RentFlatmate[];
  /** Descriptor fragments that mark overdraft interest and fees. */
  overdraftPatterns: string[];
}

export const rentEnabled = (cfg: RentConfig | null | undefined): cfg is RentConfig => !!cfg && cfg.household >= 2;

const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Which flatmate sent this credit, or null. */
export function matchShare(t: Pick<LedgerTx, 'amount' | 'rawDescriptor' | 'accountId'>, cfg: RentConfig | null | undefined): string | null {
  if (!rentEnabled(cfg) || D(t.amount).lte(0)) return null;
  const text = fold(t.rawDescriptor);
  for (const f of cfg.flatmates) {
    if (f.accountId && f.accountId !== t.accountId) continue;
    if (f.matchers.some((m) => fold(m) && text.includes(fold(m)))) return f.id;
  }
  return null;
}

/** The rent payment: a rent-category debit within €1 of the configured total (any amount when unset). */
export function isRentDebit(t: LedgerTx, cfg: RentConfig | null | undefined): boolean {
  if (!rentEnabled(cfg) || t.kind !== 'SPEND' || t.slug !== 'rent' || D(t.amount).gte(0)) return false;
  const total = D(cfg.total || 0);
  return total.lte(0) || D(t.amount).abs().minus(total).abs().lte(1);
}

/**
 * Split each rent debit into your share (a normal rent SPEND of `|debit| / household`) and a virtual FRONT row for
 * the rest. Every consumer of the ledger sees rent as your share; the bank still holds one row.
 */
export function expandRentSplits(rows: readonly LedgerTx[], cfg: RentConfig | null | undefined): LedgerTx[] {
  if (!rentEnabled(cfg)) return [...rows];
  const out: LedgerTx[] = [];
  for (const t of rows) {
    if (!isRentDebit(t, cfg)) {
      out.push(t);
      continue;
    }
    const bank = D(t.amount).abs();
    const own = D(m2(bank.div(cfg.household)));
    out.push({ ...t, amount: own.neg().toFixed(2), bankAmount: t.amount });
    out.push({ ...t, id: `${t.id}:front`, amount: bank.minus(own).neg().toFixed(2), kind: 'FRONT', slug: null, parentSlug: null, frontOf: t.id });
  }
  return out;
}

export interface RentMate {
  id: string;
  name: string;
  got: string;
  left: string;
  paid: string[];
  /** Last payment came on or after rent day. */
  late: boolean;
  /** What counts as repaid: at most their share. */
  back: string;
}

export interface RentRound {
  /** Date the landlord was paid. */
  date: string;
  month: string;
  /** Matching window, inclusive. */
  from: string;
  to: string;
  /** What left your account, your share and what you fronted. */
  total: string;
  own: string;
  fronted: string;
  back: string;
  mates: RentMate[];
}

/** The window shares are matched in: ten days before rent day to ten days before the next one. */
export const roundWindow = (date: string): { from: string; to: string } => ({
  from: addDays(date, -10),
  to: addDays(addMonthsToDate(date, 1), -11),
});

/**
 * One round per rent debit, newest first. Works on the expanded ledger (FRONT rows carry the date and the fronted
 * amount) plus the SHARE credits.
 */
export function rentRounds(txs: readonly LedgerTx[], cfg: RentConfig | null | undefined): RentRound[] {
  if (!rentEnabled(cfg)) return [];
  const shares = txs.filter((t) => t.kind === 'SHARE');
  const rounds: RentRound[] = [];
  for (const front of txs.filter((t) => t.kind === 'FRONT')) {
    const own = txs.find((t) => t.id === front.frontOf);
    const fronted = D(front.amount).abs();
    const ownAmt = own ? D(own.amount).abs() : D(m2(fronted.div(cfg.household - 1)));
    const w = roundWindow(front.date);
    const mates = cfg.flatmates.map((f): RentMate => {
      const ts = shares
        .filter((t) => t.date >= w.from && t.date <= w.to && matchShare(t, cfg) === f.id)
        .sort((a, b) => a.date.localeCompare(b.date));
      const got = sum(ts.map((t) => t.amount));
      const paid = ts.map((t) => t.date);
      return {
        id: f.id,
        name: f.name,
        got: m2(got),
        left: m2(Decimal.max(0, ownAmt.minus(got))),
        paid,
        late: paid.length > 0 && paid[paid.length - 1]! >= front.date,
        back: m2(Decimal.min(ownAmt, got)),
      };
    });
    rounds.push({
      date: front.date,
      month: front.date.slice(0, 7),
      from: w.from,
      to: w.to,
      total: m2(fronted.plus(ownAmt)),
      own: m2(ownAmt),
      fronted: m2(fronted),
      back: m2(sum(mates.map((m) => m.back))),
      mates,
    });
  }
  return rounds.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Shares that count as owed to you: whatever is left of a share, for the newest round, and for older rounds only when
 * that person has paid at least one round. Someone you never matched (or who moved in recently) does not owe old rent.
 */
export function rentShareDebts(rounds: readonly RentRound[]): Array<{ round: RentRound; mate: RentMate }> {
  const paidBefore = new Set(rounds.flatMap((r) => r.mates.filter((m) => m.paid.length > 0).map((m) => m.id)));
  return rounds.flatMap((round, i) =>
    round.mates.filter((mate) => D(mate.left).gt(0) && (i === 0 || paidBefore.has(mate.id))).map((mate) => ({ round, mate })),
  );
}

/** Shares still to come across rounds: owed to you, not spending and not income. */
export const rentOwed = (rounds: readonly RentRound[]): string => m2(sum(rentShareDebts(rounds).map((x) => x.mate.left)));

/** The day to ask the house to pay by: two days before rent day. */
export const payByDay = (cfg: RentConfig): number => Math.max(1, cfg.day - 2);

const ordinal = (n: number): string => {
  const v = n % 100;
  const suffix = v > 10 && v < 14 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
};
const eur = (v: string | number): string => {
  const d = D(v);
  return `€${d.toNumber().toLocaleString('en-IE', { minimumFractionDigits: d.isInteger() ? 0 : 2, maximumFractionDigits: 2 })}`;
};

export function houseMessage(cfg: RentConfig): string {
  const own = m2(D(cfg.total).div(cfg.household));
  const by = ordinal(payByDay(cfg));
  return `Hi all! Could we send our rent shares (${eur(own)}) by the ${by} each month? I pay the landlord the full ${eur(cfg.total)} on the ${ordinal(cfg.day)}, and my bank charges me overdraft interest while I wait for transfers. A standing order on the ${by} would sort it. Thanks!`;
}

export function shareReminder(a: { name: string; monthName: string; total: string; day: number; got: string; own: string; left: string }): string {
  return `Hi ${a.name}, quick one about the ${a.monthName} rent: I paid the landlord the full ${eur(a.total)} on the ${ordinal(a.day)}. I have ${eur(a.got)} from you of your ${eur(a.own)} share, so ${eur(a.left)} is still to come. Could you send it when you get a chance? Thanks!`;
}
