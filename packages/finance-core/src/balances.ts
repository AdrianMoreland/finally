import type { LedgerTx } from './ledger';
import { addDays, diffDays } from './dates';
import { D, m2, sum, type Decimal } from './decimal';

/** What actually moved on the bank account: a rent payment is one row at the bank, split only in our ledger. */
const bankAmount = (t: LedgerTx): Decimal => D(t.bankAmount ?? t.amount);

/**
 * End-of-day balance of one account: today's balance minus everything that happened after `date`.
 * FRONT rows are the other half of a rent payment already counted by its bank amount, so they are skipped.
 */
export function balanceAt(current: string, txs: readonly LedgerTx[], accountId: string, date: string): string {
  const later = txs.filter((t) => t.kind !== 'FRONT' && t.accountId === accountId && t.date > date);
  return m2(D(current).minus(sum(later.map(bankAmount))));
}

/** The lowest end-of-day balance in `[from, to]` and the day it happened. */
export function lowestBalance(current: string, txs: readonly LedgerTx[], accountId: string, from: string, to: string): { lo: string; day: string } | null {
  if (to < from) return null;
  let lo: Decimal | null = null;
  let day = from;
  for (let n = 0, span = diffDays(from, to); n <= span; n++) {
    const d = addDays(from, n);
    const b = D(balanceAt(current, txs, accountId, d));
    if (lo === null || b.lt(lo)) {
      lo = b;
      day = d;
    }
  }
  return lo === null ? null : { lo: m2(lo), day };
}

/**
 * A pot held as a Revolut vault: what has gone into it minus what has come out, found from the transfers whose
 * descriptor contains `match` (money leaving the account into the vault is negative on the account).
 */
export function vaultBalanceAt(txs: readonly LedgerTx[], match: string, date: string): string {
  const needle = match.toLowerCase();
  return m2(sum(txs.filter((t) => t.date <= date && t.rawDescriptor.toLowerCase().includes(needle)).map((t) => D(t.amount).neg())));
}

export interface NetWorthInput {
  accounts: ReadonlyArray<{ id: string; balance: string }>;
  /** Pot balances at the end of a day. */
  potsAt: (date: string) => string;
}

/** Accounts plus pots at the end of `date`. */
export function netWorthAt(input: NetWorthInput, txs: readonly LedgerTx[], date: string): string {
  const accounts = sum(input.accounts.map((a) => balanceAt(a.balance, txs, a.id, date)));
  return m2(accounts.plus(input.potsAt(date)));
}
