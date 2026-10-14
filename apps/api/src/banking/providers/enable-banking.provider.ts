import { Injectable } from '@nestjs/common';
import { importPKCS8, SignJWT } from 'jose';
import type { Institution } from '@finally/contracts';
import { D, dublinDate, m2 } from '@finally/finance-core';
import type { Env } from '../../common/env';
import type { AuthResult, AuthStart, BankDataProvider, RawBankTx, TransactionPage } from './bank-provider';

const BASE = 'https://api.enablebanking.com';

/** ASPSP names as listed in the Enable Banking Control Panel. Adjust here if a bank is listed differently. */
export const ASPSP: Record<Institution, { name: string; country: string }> = {
  AIB: { name: 'AIB', country: 'IE' },
  REVOLUT: { name: 'Revolut', country: 'IE' },
};

const institutionFromAspsp = (name: string): Institution => (name.toLowerCase().includes('revolut') ? 'REVOLUT' : 'AIB');

interface EbTransaction {
  entry_reference?: string | null;
  transaction_id?: string | null;
  booking_date?: string | null;
  value_date?: string | null;
  transaction_date?: string | null;
  transaction_amount: { amount: string; currency: string };
  credit_debit_indicator?: 'CRDT' | 'DBIT';
  status?: string;
  creditor?: { name?: string | null } | null;
  debtor?: { name?: string | null } | null;
  remittance_information?: string[] | null;
  note?: string | null;
}

/** Map one Enable Banking transaction to the app's shape. Debits become negative amounts. */
export function mapTransaction(t: EbTransaction): RawBankTx | null {
  const date = t.booking_date ?? t.value_date ?? t.transaction_date;
  if (!date) return null;
  const debit = t.credit_debit_indicator === 'DBIT';
  const amount = D(t.transaction_amount.amount).abs();
  const counterparty = (debit ? t.creditor?.name : t.debtor?.name) ?? '';
  const remittance = (t.remittance_information ?? []).join(' ').trim();
  const descriptor = [counterparty, remittance].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || t.note || 'Unknown';
  return {
    providerTxId: t.entry_reference ?? t.transaction_id ?? null,
    bookingDate: date.slice(0, 10),
    valueDate: t.value_date?.slice(0, 10) ?? null,
    amount: m2(debit ? amount.neg() : amount),
    currency: t.transaction_amount.currency,
    rawDescriptor: descriptor,
    status: t.status === 'BOOK' ? 'BOOKED' : 'PENDING',
  };
}

const maskIban = (iban: string | undefined): string | null =>
  iban ? `${iban.slice(0, 2)}•• ${iban.slice(4, 8)} •••• ${iban.slice(-4)}` : null;

/**
 * Enable Banking (PSD2 aggregator). Each request carries a short-lived RS256 JWT signed with the application's
 * private key; `kid` is the application id. Docs: https://enablebanking.com/docs/api/reference/
 */
@Injectable()
export class EnableBankingProvider implements BankDataProvider {
  readonly kind = 'ENABLE_BANKING' as const;
  private keyPromise: ReturnType<typeof importPKCS8> | null = null;

  constructor(private readonly env: Pick<Env, 'ENABLE_BANKING_APP_ID' | 'ENABLE_BANKING_PRIVATE_KEY'>) {
    if (!env.ENABLE_BANKING_APP_ID || !env.ENABLE_BANKING_PRIVATE_KEY) {
      throw new Error('BANK_PROVIDER=enable_banking needs ENABLE_BANKING_APP_ID and ENABLE_BANKING_PRIVATE_KEY');
    }
  }

  private async token(): Promise<string> {
    this.keyPromise ??= importPKCS8(this.env.ENABLE_BANKING_PRIVATE_KEY!.replace(/\\n/g, '\n'), 'RS256');
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({})
      .setProtectedHeader({ typ: 'JWT', alg: 'RS256', kid: this.env.ENABLE_BANKING_APP_ID! })
      .setIssuer('enablebanking.com')
      .setAudience('api.enablebanking.com')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(await this.keyPromise);
  }

  private async request<T>(method: 'GET' | 'POST', path: string, opts: { query?: Record<string, string | undefined>; body?: unknown } = {}): Promise<T> {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v) q.set(k, v);
    const res = await fetch(`${BASE}${path}${q.size ? `?${q}` : ''}`, {
      method,
      headers: {
        authorization: `Bearer ${await this.token()}`,
        ...(opts.body ? { 'content-type': 'application/json' } : {}),
      },
      ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Enable Banking ${method} ${path} failed (${res.status}) ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  async startAuth(institution: Institution, redirectUrl: string, state: string): Promise<AuthStart> {
    // Consent lasts up to 180 days; ask for the maximum so re-linking is as rare as possible.
    const validUntil = new Date(Date.now() + 179 * 86_400_000).toISOString();
    const res = await this.request<{ url: string }>('POST', '/auth', {
      body: {
        access: { valid_until: validUntil },
        aspsp: ASPSP[institution],
        state,
        redirect_url: redirectUrl,
        psu_type: 'personal',
      },
    });
    return { url: res.url, state };
  }

  async completeAuth(code: string): Promise<AuthResult & { institution: Institution }> {
    const res = await this.request<{
      session_id: string;
      aspsp: { name: string };
      access: { valid_until: string };
      accounts: Array<{ uid: string; name?: string; currency?: string; account_id?: { iban?: string }; cash_account_type?: string }>;
    }>('POST', '/sessions', { body: { code } });
    return {
      institution: institutionFromAspsp(res.aspsp.name),
      sessionId: res.session_id,
      validUntil: new Date(res.access.valid_until),
      accounts: res.accounts.map((a) => ({
        providerAccountId: a.uid,
        name: a.name ?? `${res.aspsp.name} account`,
        ibanMasked: maskIban(a.account_id?.iban),
        currency: a.currency ?? 'EUR',
        type: a.cash_account_type === 'SVGS' ? ('SAVINGS' as const) : ('CURRENT' as const),
      })),
    };
  }

  async getBalances(_sessionId: string, providerAccountId: string): Promise<{ balance: string; at: Date }> {
    const res = await this.request<{ balances: Array<{ balance_type: string; balance_amount: { amount: string } }> }>(
      'GET',
      `/accounts/${providerAccountId}/balances`,
    );
    // Prefer the balance the customer can spend, then fall back through booked balances.
    const order = ['ITAV', 'CLAV', 'XPCD', 'ITBD', 'CLBD', 'OPBD'];
    const pick = order.map((t) => res.balances.find((b) => b.balance_type === t)).find(Boolean) ?? res.balances[0];
    if (!pick) throw new Error('The bank returned no balance');
    return { balance: m2(pick.balance_amount.amount), at: new Date() };
  }

  async getTransactions(
    _sessionId: string,
    providerAccountId: string,
    dateFrom: string,
    continuationKey?: string,
  ): Promise<TransactionPage> {
    const res = await this.request<{ transactions: EbTransaction[]; continuation_key?: string | null }>(
      'GET',
      `/accounts/${providerAccountId}/transactions`,
      { query: { date_from: dateFrom, date_to: dublinDate(new Date()), continuation_key: continuationKey } },
    );
    return {
      transactions: res.transactions.map(mapTransaction).filter((t): t is RawBankTx => t !== null),
      continuationKey: res.continuation_key ?? null,
    };
  }
}
