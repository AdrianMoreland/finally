import type { LedgerTx } from './ledger';

/** Test helper: build a ledger payment with sensible defaults. Not exported from the package. */
export function tx(p: Partial<LedgerTx> & Pick<LedgerTx, 'date' | 'amount'>): LedgerTx {
  return {
    id: `${p.date}-${p.amount}-${p.merchantKey ?? 'x'}-${Math.random().toString(36).slice(2, 7)}`,
    kind: Number(p.amount) < 0 ? 'SPEND' : 'INCOME',
    accountId: 'a1',
    institution: 'AIB',
    merchantKey: null,
    merchantName: 'Somewhere',
    rawDescriptor: 'X',
    slug: null,
    parentSlug: null,
    excluded: false,
    pending: false,
    flag: null,
    note: null,
    ...p,
  };
}
