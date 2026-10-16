import type { ActionInput } from './actions';
import { lowestBalance } from './balances';
import { D, m2, sum } from './decimal';
import { monthOf } from './dates';
import type { LedgerTx } from './ledger';
import { houseMessage, payByDay, rentEnabled, rentRounds, shareReminder, type RentConfig } from './rent';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (month: string): string => MONTHS[Number(month.slice(5, 7)) - 1] ?? month;

/** Overdraft interest and fees in the last 12 months: payments in the fees category (or matching the patterns). */
export function overdraftFees(txs: readonly LedgerTx[], cfg: RentConfig, from: string, to: string): string {
  const pats = cfg.overdraftPatterns.map((p) => p.toLowerCase());
  return m2(
    sum(
      txs
        .filter((t) => t.date >= from && t.date <= to && D(t.amount).lt(0) && (t.slug === 'fees' || pats.some((p) => p && t.rawDescriptor.toLowerCase().includes(p))))
        .map((t) => D(t.amount).neg()),
    ),
  );
}

/**
 * The "AIB went overdrawn while you fronted the rent" item: only when there is a rent round this month and the
 * account's lowest end-of-day balance this month is below zero.
 */
export function frontOverdraftInput(args: {
  txs: readonly LedgerTx[];
  cfg: RentConfig | null | undefined;
  accountId: string;
  balance: string;
  today: string;
  fees12m: string;
}): ActionInput['frontOverdraft'] {
  const { cfg } = args;
  if (!rentEnabled(cfg)) return null;
  const month = monthOf(args.today);
  const round = rentRounds(args.txs, cfg).find((r) => r.month === month);
  if (!round) return null;
  const low = lowestBalance(args.balance, args.txs, args.accountId, `${month}-01`, args.today);
  if (!low || !D(low.lo).lt(0)) return null;
  return { low: low.lo, day: low.day, total: round.total, rentDay: cfg.day, payByDay: payByDay(cfg), fees12m: args.fees12m, message: houseMessage(cfg) };
}

/** One reminder per flatmate who still owes part of this month's share. */
export function shareReminderInputs(txs: readonly LedgerTx[], cfg: RentConfig | null | undefined, today: string): ActionInput['shareReminders'] {
  if (!rentEnabled(cfg)) return [];
  const round = rentRounds(txs, cfg).find((r) => r.month === monthOf(today));
  if (!round) return [];
  return round.mates
    .filter((m) => D(m.left).gt(0))
    .map((m) => ({
      id: m.id,
      name: m.name,
      monthName: monthName(round.month),
      total: round.total,
      rentDate: round.date,
      got: m.got,
      own: round.own,
      left: m.left,
      message: shareReminder({ name: m.name, monthName: monthName(round.month), total: round.total, day: Number(round.date.slice(8)), got: m.got, own: round.own, left: m.left }),
    }));
}
