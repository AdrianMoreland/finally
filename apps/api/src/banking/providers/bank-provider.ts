import type { AccountType, Institution } from '@finally/contracts';

export interface BankAccountInfo {
  providerAccountId: string;
  name: string;
  ibanMasked: string | null;
  currency: string;
  type: AccountType;
}

export interface RawBankTx {
  /** Bank-assigned id when the bank provides a stable one. */
  providerTxId: string | null;
  /** Dublin calendar date, YYYY-MM-DD */
  bookingDate: string;
  valueDate?: string | null;
  /** Signed decimal string in the account currency */
  amount: string;
  currency: string;
  rawDescriptor: string;
  status: 'PENDING' | 'BOOKED';
}

export interface AuthStart {
  url: string;
  state: string;
}

export interface AuthResult {
  /** Opaque session identifier; stored encrypted at rest. */
  sessionId: string;
  validUntil: Date;
  accounts: BankAccountInfo[];
}

export interface TransactionPage {
  transactions: RawBankTx[];
  continuationKey: string | null;
}

/**
 * Provider-agnostic bank access. `sessionId` is passed to the data calls because the API holds no provider
 * session in memory; it is decrypted from the connection row for each sync.
 */
export interface BankDataProvider {
  readonly kind: 'MOCK' | 'ENABLE_BANKING';
  /** Optional hook before a sync reads an account list (the mock uses it to simulate new arrivals). */
  beforeSync?(sessionId: string): void;
  /** `state` is chosen by the caller and must come back unchanged on the redirect. */
  startAuth(institution: Institution, redirectUrl: string, state: string): Promise<AuthStart>;
  completeAuth(code: string, state: string): Promise<AuthResult & { institution: Institution }>;
  getBalances(sessionId: string, providerAccountId: string): Promise<{ balance: string; at: Date }>;
  getTransactions(
    sessionId: string,
    providerAccountId: string,
    dateFrom: string,
    continuationKey?: string,
  ): Promise<TransactionPage>;
}

export const BANK_PROVIDER = Symbol('BANK_PROVIDER');
