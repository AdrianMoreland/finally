import type { TxKind } from '@finally/contracts';

/** Minimal transaction shape finance-core needs. Amounts are signed decimal strings. */
export interface CoreTx {
  id: string;
  accountId: string;
  /** Dublin calendar date, YYYY-MM-DD */
  date: string;
  /** Signed EUR amount, negative = money out */
  amountEur: string;
  kind: TxKind;
  categoryId: string | null;
  merchantKey: string | null;
  merchantName: string | null;
  /** Left out of budgets and safe to spend. */
  excluded?: boolean;
}

export interface CoreCategory {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  /** Fixed bills (rent, bills, subscriptions) are paid on a schedule; flexible categories are discretionary. */
  fixed: boolean;
  group: 'ESSENTIALS' | 'LIFESTYLE' | 'SAVINGS' | 'INCOME' | 'TRANSFER';
}

export interface Draft {
  type: string;
  severity: 'INFO' | 'WATCH' | 'ACT';
  title: string;
  body: string;
  payload: Record<string, unknown>;
  fingerprint: string;
}

/** Format a euro amount for human-readable insight text: "€1,234.50". */
export function eur(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value;
  const abs = Math.abs(n);
  const s = abs.toLocaleString('en-IE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? '-' : ''}€${s}`;
}

export function eur0(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value;
  const s = Math.abs(Math.round(n)).toLocaleString('en-IE');
  return `${n < 0 ? '-' : ''}€${s}`;
}
