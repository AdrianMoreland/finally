import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Db } from '@finally/db';
import { dublinDate } from '@finally/finance-core';
import { ENV, type Env } from '../common/env';
import { InjectDb } from '../common/tokens';
import { JobsService } from '../jobs/jobs.service';
import { CoinGeckoProvider, FinnhubProvider, MockMarketData, TwelveDataProvider } from './providers';
import type { Bar, InstrumentRef, MarketDataProvider, Quote } from './providers';

export interface LatestPrice {
  price: string;
  date: string;
}

@Injectable()
export class MarketDataService implements OnModuleInit {
  private readonly log = new Logger(MarketDataService.name);
  private readonly mock = new MockMarketData();
  private readonly equities: MarketDataProvider;
  private readonly crypto = new CoinGeckoProvider();

  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(ENV) env: Env,
    private readonly jobs: JobsService,
  ) {
    this.equities =
      env.MARKET_DATA_PROVIDER === 'twelvedata' && env.TWELVE_DATA_API_KEY
        ? new TwelveDataProvider(env.TWELVE_DATA_API_KEY)
        : env.MARKET_DATA_PROVIDER === 'finnhub' && env.FINNHUB_API_KEY
          ? new FinnhubProvider(env.FINNHUB_API_KEY)
          : this.mock;
    this.log.log(`Market data provider: ${this.equities.name}`);
  }

  onModuleInit(): void {
    this.jobs.register('prices', async (data) => {
      if (data.userId) await this.dailyClose(data.userId);
    });
  }

  private providerFor(inst: InstrumentRef): MarketDataProvider {
    if (inst.assetClass === 'CRYPTO') return this.crypto;
    if (inst.assetClass === 'CASH' || inst.assetClass === 'PENSION') return this.mock;
    return this.equities;
  }

  /** On-demand quote with fallback to the mock when a real provider fails. */
  async quote(inst: InstrumentRef): Promise<Quote> {
    try {
      return await this.providerFor(inst).quote(inst);
    } catch (err) {
      this.log.warn(`Quote for ${inst.symbol} failed (${(err as Error).message}); using last stored close`);
      throw err;
    }
  }

  async history(inst: InstrumentRef, days: number): Promise<Bar[]> {
    try {
      return await this.providerFor(inst).history(inst, days);
    } catch (err) {
      this.log.warn(`History for ${inst.symbol} failed (${(err as Error).message})`);
      return [];
    }
  }

  /** Fetch history for an instrument and upsert PriceBar rows. */
  async backfill(userId: string, instrumentId: string, days = 800): Promise<number> {
    const inst = await this.db.instrument.findFirst({ where: { id: instrumentId, userId } });
    if (!inst) return 0;
    const bars = await this.history(inst, days);
    let n = 0;
    for (const b of bars) {
      await this.db.priceBar.upsert({
        where: { instrumentId_date: { instrumentId, date: new Date(`${b.date}T00:00:00Z`) } },
        update: { close: b.close },
        create: { userId, instrumentId, date: new Date(`${b.date}T00:00:00Z`), close: b.close },
      });
      n++;
    }
    return n;
  }

  /**
   * Daily close job: backfill instruments with no bars, otherwise write today's close. Bars for the days
   * between the last stored close and today are filled by history when the provider supports it.
   */
  async dailyClose(userId: string): Promise<void> {
    const instruments = await this.db.instrument.findMany({ where: { userId } });
    for (const inst of instruments) {
      const last = await this.db.priceBar.findFirst({ where: { instrumentId: inst.id }, orderBy: { date: 'desc' } });
      if (!last) {
        await this.backfill(userId, inst.id);
        continue;
      }
      const gapDays = Math.ceil((Date.now() - last.date.getTime()) / 86_400_000);
      if (gapDays > 1) {
        await this.backfill(userId, inst.id, Math.min(gapDays + 5, 800));
        continue;
      }
      try {
        const q = await this.quote(inst);
        const date = new Date(`${dublinDate(q.asOf)}T00:00:00Z`);
        await this.db.priceBar.upsert({
          where: { instrumentId_date: { instrumentId: inst.id, date } },
          update: { close: q.price },
          create: { userId, instrumentId: inst.id, date, close: q.price },
        });
      } catch {
        /* keep the previous close */
      }
    }
  }

  /** Latest stored close per instrument. */
  async latestPrices(userId: string): Promise<Map<string, LatestPrice>> {
    const rows = await this.db.priceBar.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      distinct: ['instrumentId'],
    });
    return new Map(rows.map((r) => [r.instrumentId, { price: r.close.toString(), date: r.date.toISOString().slice(0, 10) }]));
  }

  async bars(instrumentId: string, days: number): Promise<Bar[]> {
    const from = new Date(Date.now() - days * 86_400_000);
    const rows = await this.db.priceBar.findMany({
      where: { instrumentId, date: { gte: from } },
      orderBy: { date: 'asc' },
    });
    return rows.map((r) => ({ date: r.date.toISOString().slice(0, 10), close: r.close.toString() }));
  }
}
