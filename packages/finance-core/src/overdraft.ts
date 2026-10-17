import { D, Decimal, m2 } from './decimal';

export interface OverdraftState {
  limit: string;
  /** How far below zero the balance is (0 when it is positive). */
  used: string;
  /** What is left of the limit. */
  room: string;
  inOverdraft: boolean;
}

/**
 * The arranged overdraft against a balance. Room is never an asset: net worth uses the real balance, only safe to
 * spend counts room (less what the user wants to keep free).
 */
export function overdraftState(balance: string, limit: string): OverdraftState {
  const used = Decimal.max(0, D(balance).neg());
  return { limit: m2(limit), used: m2(used), room: m2(Decimal.max(0, D(limit).minus(used))), inOverdraft: used.gt(0) };
}

/** The part of the limit that safe to spend may count: the limit minus what you keep free. */
export const overdraftSpendable = (limit: string, keepFree: string): string => m2(Decimal.max(0, D(limit).minus(keepFree || 0)));
