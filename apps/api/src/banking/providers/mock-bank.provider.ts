import { Injectable } from '@nestjs/common';
import { D, m2 } from '@finally/finance-core';
import type { Institution } from '@finally/contracts';
import type { AuthResult, AuthStart, BankDataProvider, TransactionPage } from './bank-provider';
import { aibBalance, generateHistory, generateLive, liveArrivals, MOCK_ACCOUNTS, todayDublin } from './mock-data';

/**
 * Default provider. AIB serves the owner's real statement plus generated payments up to today; Revolut serves six
 * deterministic generated months. Each sync adds 0-3 new payments so the ask-me loop can be exercised without a bank.
 */
@Injectable()
export class MockBankProvider implements BankDataProvider {
  readonly kind = 'MOCK' as const;
  /** sessionId → number of completed syncs (cumulative live arrivals derive from it). */
  private readonly syncs = new Map<string, number>();
  private readonly liveCount = new Map<string, number>();

  startAuth(institution: Institution, redirectUrl: string, state: string): Promise<AuthStart> {
    return Promise.resolve({
      url: `${redirectUrl}?code=mock-${institution}&state=${encodeURIComponent(state)}`,
      state,
    });
  }

  completeAuth(code: string, _state: string): Promise<AuthResult & { institution: Institution }> {
    const institution = code.split('-')[1] as Institution | undefined;
    if (institution !== 'AIB' && institution !== 'REVOLUT') return Promise.reject(new Error('Unknown mock code'));
    const validUntil = new Date(Date.now() + 90 * 86_400_000);
    return Promise.resolve({
      institution,
      sessionId: `mock-session-${institution}`,
      validUntil,
      accounts: MOCK_ACCOUNTS[institution].map(({ balance: _balance, ...info }) => info),
    });
  }

  private institutionOf(sessionId: string): Institution {
    return sessionId.endsWith('REVOLUT') ? 'REVOLUT' : 'AIB';
  }

  /** Advance the live-arrival counter at the start of each sync. */
  beforeSync(sessionId: string): void {
    const n = (this.syncs.get(sessionId) ?? 0) + 1;
    this.syncs.set(sessionId, n);
    this.liveCount.set(sessionId, (this.liveCount.get(sessionId) ?? 0) + liveArrivals(n));
  }

  getBalances(sessionId: string, providerAccountId: string): Promise<{ balance: string; at: Date }> {
    const institution = this.institutionOf(sessionId);
    const base = MOCK_ACCOUNTS[institution].find((a) => a.providerAccountId === providerAccountId);
    if (!base) return Promise.reject(new Error('Unknown account'));
    const live = generateLive(institution, todayDublin(), this.liveCount.get(sessionId) ?? 0)[providerAccountId] ?? [];
    const delta = live.reduce((a, t) => a.plus(t.amount), D(0));
    const start = institution === 'AIB' ? aibBalance(todayDublin()) : base.balance;
    return Promise.resolve({ balance: m2(D(start).plus(delta)), at: new Date() });
  }

  getTransactions(
    sessionId: string,
    providerAccountId: string,
    dateFrom: string,
    continuationKey?: string,
  ): Promise<TransactionPage> {
    if (continuationKey) return Promise.resolve({ transactions: [], continuationKey: null });
    const institution = this.institutionOf(sessionId);
    const today = todayDublin();
    const history = generateHistory(institution, today)[providerAccountId] ?? [];
    const live = generateLive(institution, today, this.liveCount.get(sessionId) ?? 0)[providerAccountId] ?? [];
    const all = [...history, ...live].filter((t) => t.bookingDate >= dateFrom);
    return Promise.resolve({ transactions: all, continuationKey: null });
  }
}
