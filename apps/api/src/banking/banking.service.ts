import { BadRequestException, Inject, Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import type { Db } from '@finally/db';
import {
  addDays,
  diffDays,
  dublinDate,
  parseAibCsv,
  parseRevolutCsv,
  type ParseResult,
} from '@finally/finance-core';
import type {
  ConnectionDto,
  ImportCsvResponse,
  Institution,
  StartConnectionResponse,
  SyncResult,
} from '@finally/contracts';
import { decrypt, encrypt } from '../common/crypto';
import { ENV, type Env } from '../common/env';
import { isoOrNull, money } from '../common/mappers';
import { InjectDb } from '../common/tokens';
import { InsightsService } from '../insights/insights.service';
import { JobsService } from '../jobs/jobs.service';
import { IngestService } from './ingest.service';
import { BANK_PROVIDER, type BankDataProvider } from './providers/bank-provider';

const REAUTH_WARNING_DAYS = 7;
const DUBLIN = 'Europe/Dublin';

@Injectable()
export class BankingService implements OnModuleInit {
  private readonly log = new Logger(BankingService.name);

  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    @Inject(BANK_PROVIDER) private readonly provider: BankDataProvider,
    private readonly ingest: IngestService,
    private readonly jobs: JobsService,
    private readonly insights: InsightsService,
  ) {}

  onModuleInit(): void {
    this.jobs.register('sync-user', async (d) => {
      if (d.userId) await this.syncAll(d.userId);
    });
  }

  /** PSD2 allows four unattended refreshes a day: 06:00, 12:00, 18:00 and 23:00 Dublin time. */
  @Cron('0 0 6,12,18,23 * * *', { name: 'sync-all', timeZone: DUBLIN })
  async cronSync(): Promise<void> {
    if (this.env.DISABLE_JOBS) return;
    for (const u of await this.db.user.findMany({ select: { id: true } })) {
      await this.jobs.enqueue('sync-user', { userId: u.id }, `sync:${u.id}`);
    }
  }

  /* ------------------------------------------------------ connections */

  private toDto(c: {
    id: string;
    provider: 'ENABLE_BANKING' | 'MOCK';
    institution: Institution;
    status: 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'ERROR';
    validUntil: Date | null;
    lastSyncAt: Date | null;
    _count: { accounts: number };
  }): ConnectionDto {
    return {
      id: c.id,
      provider: c.provider,
      institution: c.institution,
      status: c.status,
      validUntil: isoOrNull(c.validUntil),
      lastSyncAt: isoOrNull(c.lastSyncAt),
      accountCount: c._count.accounts,
    };
  }

  async listConnections(userId: string): Promise<ConnectionDto[]> {
    const rows = await this.db.bankConnection.findMany({
      where: { userId },
      include: { _count: { select: { accounts: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async listAccounts(userId: string) {
    const rows = await this.db.account.findMany({
      where: { userId },
      include: { connection: { select: { institution: true } } },
      orderBy: [{ connection: { institution: 'asc' } }, { createdAt: 'asc' }],
    });
    return rows.map((a) => ({
      id: a.id,
      connectionId: a.connectionId,
      name: a.name,
      ibanMasked: a.ibanMasked,
      currency: a.currency,
      type: a.type,
      institution: a.connection.institution,
      balance: money(a.balance),
      balanceAt: isoOrNull(a.balanceAt),
      includeInNetWorth: a.includeInNetWorth,
      overdraftLimit: money(a.overdraftLimit),
    }));
  }

  async updateAccount(userId: string, id: string, body: { includeInNetWorth?: boolean; overdraftLimit?: string }) {
    const acc = await this.db.account.findFirst({ where: { id, userId } });
    if (!acc) throw new NotFoundException('Account not found');
    await this.db.account.update({
      where: { id },
      data: {
        ...(body.includeInNetWorth !== undefined ? { includeInNetWorth: body.includeInNetWorth } : {}),
        ...(body.overdraftLimit !== undefined ? { overdraftLimit: body.overdraftLimit } : {}),
      },
    });
    return (await this.listAccounts(userId)).find((a) => a.id === id)!;
  }

  async startConnection(
    userId: string,
    institution: Institution,
    returnTo: 'web' | 'mobile' = 'web',
  ): Promise<StartConnectionResponse> {
    const redirect = `${this.env.API_URL.replace(/\/$/, '')}/banking/callback`;
    const requested = `${randomUUID()}.${returnTo}`;
    const { url, state } = await this.provider.startAuth(institution, redirect, requested);
    const conn = await this.db.bankConnection.upsert({
      where: { userId_provider_institution: { userId, provider: this.provider.kind, institution } },
      update: { authState: state },
      create: { userId, provider: this.provider.kind, institution, authState: state, status: 'EXPIRED' },
    });
    return { connectionId: conn.id, url, state };
  }

  /** Finish the bank authorisation: store the encrypted session and the accounts, then run a first sync. */
  async completeConnection(
    code: string,
    state: string,
  ): Promise<{ userId: string; connectionId: string; returnTo: 'web' | 'mobile' }> {
    const conn = await this.db.bankConnection.findFirst({ where: { authState: state } });
    if (!conn) throw new BadRequestException('Unknown or expired authorisation state');
    const result = await this.provider.completeAuth(code, state);
    await this.db.bankConnection.update({
      where: { id: conn.id },
      data: {
        sessionIdEnc: encrypt(result.sessionId, this.env.FINALLY_ENCRYPTION_KEY),
        validUntil: result.validUntil,
        status: 'ACTIVE',
        authState: null,
      },
    });
    for (const a of result.accounts) {
      await this.db.account.upsert({
        where: { userId_providerAccountId: { userId: conn.userId, providerAccountId: a.providerAccountId } },
        update: { name: a.name, ibanMasked: a.ibanMasked, connectionId: conn.id },
        create: {
          userId: conn.userId,
          connectionId: conn.id,
          providerAccountId: a.providerAccountId,
          name: a.name,
          ibanMasked: a.ibanMasked,
          currency: a.currency,
          type: a.type,
        },
      });
    }
    return { userId: conn.userId, connectionId: conn.id, returnTo: state.endsWith('.mobile') ? 'mobile' : 'web' };
  }

  /** Link an institution end-to-end without a browser round trip (mock mode and onboarding). */
  async connectAndSync(userId: string, institution: Institution): Promise<SyncResult> {
    const { url, state } = await this.startConnection(userId, institution);
    const code = new URL(url).searchParams.get('code') ?? 'mock';
    const { connectionId } = await this.completeConnection(code, state);
    return this.syncConnection(userId, connectionId);
  }

  async removeConnection(userId: string, id: string): Promise<void> {
    const conn = await this.db.bankConnection.findFirst({ where: { id, userId } });
    if (!conn) throw new NotFoundException('Connection not found');
    await this.db.bankConnection.delete({ where: { id } });
  }

  /* -------------------------------------------------------------- sync */

  async syncAll(userId: string): Promise<SyncResult[]> {
    const conns = await this.db.bankConnection.findMany({ where: { userId, sessionIdEnc: { not: null } } });
    const results: SyncResult[] = [];
    for (const c of conns) results.push(await this.syncConnection(userId, c.id));
    return results;
  }

  /**
   * Re-read the last 7 days (the whole history on a first sync), dedupe, link transfers, then queue
   * categorisation and the insights run.
   */
  async syncConnection(userId: string, connectionId: string): Promise<SyncResult> {
    const conn = await this.db.bankConnection.findFirst({ where: { id: connectionId, userId }, include: { accounts: true } });
    if (!conn) throw new NotFoundException('Connection not found');
    if (!conn.sessionIdEnc) throw new BadRequestException('This connection is not linked yet');

    const run = await this.db.syncRun.create({ data: { userId, connectionId, status: 'RUNNING' } });
    const today = dublinDate(new Date());
    let newTxCount = 0;
    try {
      const sessionId = decrypt(conn.sessionIdEnc, this.env.FINALLY_ENCRYPTION_KEY);
      this.provider.beforeSync?.(sessionId);
      for (const account of conn.accounts) {
        const known = await this.db.transaction.count({ where: { accountId: account.id } });
        const windowFrom = known === 0 ? addDays(today, -730) : addDays(today, -7);
        const bal = await this.provider.getBalances(sessionId, account.providerAccountId);
        await this.db.account.update({ where: { id: account.id }, data: { balance: bal.balance, balanceAt: bal.at } });

        let key: string | undefined;
        do {
          const page = await this.provider.getTransactions(sessionId, account.providerAccountId, windowFrom, key);
          const res = await this.ingest.ingest(userId, account, page.transactions, windowFrom);
          newTxCount += res.created;
          key = page.continuationKey ?? undefined;
        } while (key);
      }
      await this.ingest.linkTransfers(userId, today);
      await this.ingest.flagBouncedDebits(userId);

      let status = conn.status === 'ERROR' ? 'ACTIVE' : conn.status;
      if (conn.validUntil) {
        const daysLeft = diffDays(today, dublinDate(conn.validUntil));
        status = daysLeft < 0 ? 'EXPIRED' : daysLeft <= REAUTH_WARNING_DAYS ? 'EXPIRING' : 'ACTIVE';
        if (status === 'EXPIRING') await this.insights.relinkReminder(userId, conn.institution, conn.validUntil);
      }
      await this.db.bankConnection.update({
        where: { id: conn.id },
        data: { lastSyncAt: new Date(), status: status as 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'ERROR' },
      });
      await this.db.syncRun.update({ where: { id: run.id }, data: { status: 'OK', finishedAt: new Date(), newTxCount } });

      await this.jobs.enqueue('categorise', { userId }, `categorise:${userId}`);
      await this.jobs.enqueue('insights', { userId }, `insights:${userId}`);
      return { connectionId, newTxCount, status: 'OK', error: null };
    } catch (err) {
      const message = (err as Error).message;
      this.log.error(`Sync of ${conn.institution} failed: ${message}`);
      await this.db.syncRun.update({ where: { id: run.id }, data: { status: 'ERROR', finishedAt: new Date(), error: message.slice(0, 500) } });
      await this.db.bankConnection.update({ where: { id: conn.id }, data: { status: 'ERROR' } });
      return { connectionId, newTxCount, status: 'ERROR', error: message };
    }
  }

  /* --------------------------------------------------------- CSV import */

  async importCsv(
    userId: string,
    input: { institution: Institution; accountId?: string; csv: string },
  ): Promise<ImportCsvResponse> {
    const parsed: ParseResult = input.institution === 'AIB' ? parseAibCsv(input.csv) : parseRevolutCsv(input.csv);
    if (parsed.errors.length) throw new BadRequestException(parsed.errors[0]);
    if (parsed.rows.length === 0) throw new BadRequestException('No payments found in this file');

    const account = await this.accountForImport(userId, input.institution, input.accountId);
    const today = dublinDate(new Date());
    const oldest = parsed.rows.reduce((m, r) => (r.bookingDate < m ? r.bookingDate : m), today);
    const res = await this.ingest.ingest(
      userId,
      account,
      parsed.rows.map((r) => ({
        providerTxId: null,
        bookingDate: r.bookingDate,
        valueDate: r.bookingDate,
        amount: r.amount,
        currency: r.currency,
        rawDescriptor: r.rawDescriptor,
        status: r.status,
      })),
      oldest,
    );
    await this.ingest.linkTransfers(userId, today);
    await this.ingest.flagBouncedDebits(userId);
    await this.jobs.enqueue('categorise', { userId }, `categorise:${userId}`);
    await this.jobs.enqueue('insights', { userId }, `insights:${userId}`);
    return {
      parsed: parsed.rows.length,
      imported: res.created + res.updatedPending,
      duplicates: res.duplicates,
      skipped: parsed.skipped,
    };
  }

  private async accountForImport(userId: string, institution: Institution, accountId?: string) {
    if (accountId) {
      const a = await this.db.account.findFirst({ where: { id: accountId, userId } });
      if (!a) throw new NotFoundException('Account not found');
      return a;
    }
    const existing = await this.db.account.findFirst({
      where: { userId, type: 'CURRENT', connection: { institution } },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) return existing;
    // No linked account yet: create a statement-only connection so imports have somewhere to live.
    const conn = await this.db.bankConnection.upsert({
      where: { userId_provider_institution: { userId, provider: this.provider.kind, institution } },
      update: {},
      create: { userId, provider: this.provider.kind, institution, status: 'ACTIVE' },
    });
    return this.db.account.upsert({
      where: { userId_providerAccountId: { userId, providerAccountId: `csv-${institution.toLowerCase()}` } },
      update: {},
      create: {
        userId,
        connectionId: conn.id,
        providerAccountId: `csv-${institution.toLowerCase()}`,
        name: institution === 'AIB' ? 'AIB Current (statement)' : 'Revolut EUR (statement)',
        type: 'CURRENT',
        currency: 'EUR',
      },
    });
  }
}
