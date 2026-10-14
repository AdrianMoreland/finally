import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Db } from '@finally/db';
import {
  SIGNALS_DISCLAIMER,
  type CreateInstrumentBody,
  type CreateLotBody,
  type DeemedDisposalDto,
  type HoldingDto,
  type InstrumentDto,
  type InvestmentsDto,
  type LotDto,
  type PriceSeriesDto,
  type SignalDto,
  type TaxRuleDto,
} from '@finally/contracts';
import {
  addDays,
  computeHoldings,
  deemedDisposals,
  dublinDate,
  m2,
  portfolioValueOn,
  rsi,
  runSignals,
  smaNumbers,
  type CoreTaxRule,
  type LotCore,
  type SignalOut,
} from '@finally/finance-core';
import { dateOnly, iso, isoOrNull, money, parseDateOnly, qty } from '../common/mappers';
import { InjectDb } from '../common/tokens';
import { MarketDataService } from '../market-data/market-data.service';
import { PushService } from '../notifications/push.service';

const PUSH_RULES = new Set(['dca_reminder', 'drawdown_20', 'drawdown_30', 'sma_golden_cross', 'sma_death_cross']);

const toInstrument = (i: {
  id: string; symbol: string; isin: string | null; exchange: string | null; name: string;
  assetClass: InstrumentDto['assetClass']; currency: string; taxRegime: InstrumentDto['taxRegime'];
}): InstrumentDto => ({
  id: i.id, symbol: i.symbol, isin: i.isin, exchange: i.exchange, name: i.name,
  assetClass: i.assetClass, currency: i.currency, taxRegime: i.taxRegime,
});

const toLot = (l: {
  id: string; instrumentId: string; acquiredAt: Date; quantity: unknown; unitCost: unknown; fees: unknown;
  wrapper: LotDto['wrapper']; soldAt: Date | null; soldPrice: unknown;
}): LotDto => ({
  id: l.id,
  instrumentId: l.instrumentId,
  acquiredAt: dateOnly(l.acquiredAt),
  quantity: qty(String(l.quantity)),
  unitCost: qty(String(l.unitCost)),
  fees: money(String(l.fees)),
  wrapper: l.wrapper,
  soldAt: l.soldAt ? dateOnly(l.soldAt) : null,
  soldPrice: l.soldPrice === null ? null : qty(String(l.soldPrice)),
});

@Injectable()
export class InvestmentsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly market: MarketDataService,
    private readonly push: PushService,
  ) {}

  /* --------------------------------------------------------------- CRUD */

  async listInstruments(userId: string): Promise<InstrumentDto[]> {
    return (await this.db.instrument.findMany({ where: { userId }, orderBy: { symbol: 'asc' } })).map(toInstrument);
  }

  async createInstrument(userId: string, body: CreateInstrumentBody): Promise<InstrumentDto> {
    const exists = await this.db.instrument.findUnique({ where: { userId_symbol: { userId, symbol: body.symbol } } });
    if (exists) throw new BadRequestException(`${body.symbol} already exists`);
    const row = await this.db.instrument.create({ data: { ...body, userId } });
    void this.market.backfill(userId, row.id).catch(() => undefined);
    return toInstrument(row);
  }

  async updateInstrument(userId: string, id: string, body: Partial<CreateInstrumentBody>): Promise<InstrumentDto> {
    if (!(await this.db.instrument.findFirst({ where: { id, userId } }))) throw new NotFoundException('Instrument not found');
    return toInstrument(await this.db.instrument.update({ where: { id }, data: body }));
  }

  async deleteInstrument(userId: string, id: string): Promise<void> {
    const res = await this.db.instrument.deleteMany({ where: { id, userId } });
    if (res.count === 0) throw new NotFoundException('Instrument not found');
  }

  async listLots(userId: string, instrumentId?: string): Promise<LotDto[]> {
    const rows = await this.db.lot.findMany({
      where: { userId, ...(instrumentId ? { instrumentId } : {}) },
      orderBy: { acquiredAt: 'asc' },
    });
    return rows.map(toLot);
  }

  async createLot(userId: string, body: CreateLotBody): Promise<LotDto> {
    if (!(await this.db.instrument.findFirst({ where: { id: body.instrumentId, userId } }))) throw new BadRequestException('Unknown instrument');
    const row = await this.db.lot.create({
      data: {
        userId,
        instrumentId: body.instrumentId,
        acquiredAt: parseDateOnly(body.acquiredAt),
        quantity: body.quantity,
        unitCost: body.unitCost,
        fees: m2(body.fees),
        wrapper: body.wrapper,
      },
    });
    return toLot(row);
  }

  async updateLot(
    userId: string,
    id: string,
    body: Partial<CreateLotBody> & { soldAt?: string | null; soldPrice?: string | null },
  ): Promise<LotDto> {
    if (!(await this.db.lot.findFirst({ where: { id, userId } }))) throw new NotFoundException('Lot not found');
    const row = await this.db.lot.update({
      where: { id },
      data: {
        ...(body.acquiredAt ? { acquiredAt: parseDateOnly(body.acquiredAt) } : {}),
        ...(body.quantity ? { quantity: body.quantity } : {}),
        ...(body.unitCost ? { unitCost: body.unitCost } : {}),
        ...(body.fees ? { fees: m2(body.fees) } : {}),
        ...(body.wrapper ? { wrapper: body.wrapper } : {}),
        ...(body.soldAt !== undefined ? { soldAt: body.soldAt ? parseDateOnly(body.soldAt) : null } : {}),
        ...(body.soldPrice !== undefined ? { soldPrice: body.soldPrice } : {}),
      },
    });
    return toLot(row);
  }

  async deleteLot(userId: string, id: string): Promise<void> {
    const res = await this.db.lot.deleteMany({ where: { id, userId } });
    if (res.count === 0) throw new NotFoundException('Lot not found');
  }

  /* -------------------------------------------------------------- tax */

  async taxRules(userId: string): Promise<CoreTaxRule[]> {
    const rows = await this.db.taxRule.findMany({ where: { userId }, orderBy: [{ regime: 'asc' }, { effectiveFrom: 'asc' }] });
    return rows.map((r) => ({
      regime: r.regime,
      rate: r.rate.toString(),
      annualExemption: r.annualExemption ? money(r.annualExemption) : null,
      threshold: r.threshold ? money(r.threshold) : null,
      contributionCap: r.contributionCap ? money(r.contributionCap) : null,
      effectiveFrom: dateOnly(r.effectiveFrom),
      effectiveTo: r.effectiveTo ? dateOnly(r.effectiveTo) : null,
    }));
  }

  async taxRuleDtos(userId: string): Promise<TaxRuleDto[]> {
    const rows = await this.db.taxRule.findMany({ where: { userId }, orderBy: [{ regime: 'asc' }, { effectiveFrom: 'asc' }] });
    return rows.map((r) => ({
      id: r.id,
      regime: r.regime,
      rate: r.rate.toFixed(4),
      annualExemption: r.annualExemption ? money(r.annualExemption) : null,
      threshold: r.threshold ? money(r.threshold) : null,
      contributionCap: r.contributionCap ? money(r.contributionCap) : null,
      effectiveFrom: dateOnly(r.effectiveFrom),
      effectiveTo: r.effectiveTo ? dateOnly(r.effectiveTo) : null,
    }));
  }

  /* --------------------------------------------------------- portfolio */

  private async barsByInstrument(userId: string, days: number) {
    const from = new Date(Date.now() - days * 86_400_000);
    const rows = await this.db.priceBar.findMany({ where: { userId, date: { gte: from } }, orderBy: { date: 'asc' } });
    const out = new Map<string, Array<{ date: string; close: string }>>();
    for (const r of rows) {
      const list = out.get(r.instrumentId) ?? [];
      list.push({ date: dateOnly(r.date), close: r.close.toString() });
      out.set(r.instrumentId, list);
    }
    return out;
  }

  async summary(userId: string, now = new Date()): Promise<InvestmentsDto> {
    const today = dublinDate(now);
    const [instruments, lots, user, rules, latest] = await Promise.all([
      this.db.instrument.findMany({ where: { userId } }),
      this.db.lot.findMany({ where: { userId } }),
      this.db.user.findUniqueOrThrow({ where: { id: userId } }),
      this.taxRules(userId),
      this.market.latestPrices(userId),
    ]);
    // Instruments with no stored prices yet: fetch history once so the screen has numbers.
    for (const i of instruments) {
      if (!latest.has(i.id)) {
        await this.market.backfill(userId, i.id).catch(() => undefined);
      }
    }
    const prices = latest.size < instruments.length ? await this.market.latestPrices(userId) : latest;

    const lotCores: LotCore[] = lots.map((l) => ({
      id: l.id,
      instrumentId: l.instrumentId,
      acquiredAt: dateOnly(l.acquiredAt),
      quantity: l.quantity.toString(),
      unitCost: l.unitCost.toString(),
      fees: l.fees.toString(),
      soldAt: l.soldAt ? dateOnly(l.soldAt) : null,
      soldPrice: l.soldPrice?.toString() ?? null,
    }));
    const priceMap = Object.fromEntries(
      instruments.map((i) => {
        const open = lots.filter((l) => l.instrumentId === i.id && !l.soldAt).at(-1);
        return [i.id, prices.get(i.id)?.price ?? open?.unitCost.toString() ?? '0'];
      }),
    );
    const portfolio = computeHoldings(instruments, lotCores, priceMap);
    const target = (user.targetAllocation ?? {}) as Record<string, number>;
    const shares = Object.fromEntries(portfolio.holdings.map((h) => [h.symbol, h.share]));

    const holdings: HoldingDto[] = portfolio.holdings.map((h) => {
      const inst = instruments.find((i) => i.id === h.instrumentId)!;
      return {
        instrument: toInstrument(inst),
        quantity: h.quantity,
        avgCost: h.avgCost,
        price: h.price,
        priceDate: prices.get(h.instrumentId)?.date ?? null,
        value: h.value,
        cost: h.cost,
        gain: h.gain,
        gainPct: h.gainPct,
        share: h.share,
        targetShare: target[h.symbol] ?? null,
        lots: lots.filter((l) => l.instrumentId === h.instrumentId && !l.soldAt).map(toLot),
      };
    });

    const keys = [...new Set([...Object.keys(target), ...Object.keys(shares)])];
    const allocation = keys.map((key) => {
      const actual = shares[key] ?? 0;
      const tgt = target[key] ?? 0;
      return { key, label: key, actual, target: tgt, drift: Number((actual - tgt).toFixed(2)) };
    });

    // Weekly portfolio value over the last 52 weeks
    const bars = await this.barsByInstrument(userId, 400);
    const priceOn = (instrumentId: string, date: string): string | null => {
      const list = bars.get(instrumentId);
      if (!list) return null;
      let found: string | null = null;
      for (const b of list) {
        if (b.date > date) break;
        found = b.close;
      }
      return found;
    };
    const series: InvestmentsDto['series'] = [];
    for (let i = 52; i >= 0; i--) {
      const date = addDays(today, -i * 7);
      series.push({ date, value: portfolioValueOn(date, lotCores, priceOn) });
    }

    const signals = await this.refreshSignals(userId, now, { instruments, bars, shares, target, paydayDay: user.paydayDayOfMonth });

    const dd: DeemedDisposalDto[] = [];
    for (const l of lots) {
      const inst = instruments.find((i) => i.id === l.instrumentId);
      if (!inst || inst.taxRegime !== 'EXIT_TAX' || l.soldAt) continue;
      dd.push({
        lotId: l.id,
        symbol: inst.symbol,
        acquiredAt: dateOnly(l.acquiredAt),
        quantity: qty(l.quantity.toString()),
        anniversaries: deemedDisposals(
          { lotId: l.id, acquiredAt: dateOnly(l.acquiredAt), quantity: l.quantity.toString(), unitCost: l.unitCost.toString(), fees: l.fees.toString(), price: priceMap[l.instrumentId] ?? '0' },
          rules,
          today,
          2,
        ),
      });
    }
    dd.sort((a, b) => (a.anniversaries[0]?.date ?? '').localeCompare(b.anniversaries[0]?.date ?? ''));

    const inForce = (await this.taxRuleDtos(userId)).filter((r) => r.effectiveTo === null || r.effectiveTo >= today);
    return {
      asOf: iso(now),
      total: portfolio.total,
      cost: portfolio.cost,
      gain: portfolio.gain,
      gainPct: portfolio.gainPct,
      holdings,
      allocation,
      series,
      signals,
      deemedDisposals: dd,
      taxRulesInForce: inForce,
      disclaimer: SIGNALS_DISCLAIMER,
    };
  }

  /** Total portfolio value in EUR (used by net worth). Zero when nothing is held. */
  async totalValue(userId: string): Promise<string> {
    const [instruments, lots, latest] = await Promise.all([
      this.db.instrument.findMany({ where: { userId } }),
      this.db.lot.findMany({ where: { userId, soldAt: null } }),
      this.market.latestPrices(userId),
    ]);
    const prices = Object.fromEntries(
      instruments.map((i) => [i.id, latest.get(i.id)?.price ?? lots.filter((l) => l.instrumentId === i.id).at(-1)?.unitCost.toString() ?? '0']),
    );
    return computeHoldings(
      instruments,
      lots.map((l) => ({ id: l.id, instrumentId: l.instrumentId, acquiredAt: dateOnly(l.acquiredAt), quantity: l.quantity.toString(), unitCost: l.unitCost.toString(), fees: l.fees.toString(), soldAt: null, soldPrice: null })),
      prices,
    ).total;
  }

  /** Portfolio value at the end of each given month (the current month uses today). */
  async monthEndValues(userId: string, months: string[], today: string): Promise<Record<string, string>> {
    const [lots, bars] = await Promise.all([
      this.db.lot.findMany({ where: { userId } }),
      this.barsByInstrument(userId, 800),
    ]);
    const lotCores: LotCore[] = lots.map((l) => ({
      id: l.id, instrumentId: l.instrumentId, acquiredAt: dateOnly(l.acquiredAt), quantity: l.quantity.toString(),
      unitCost: l.unitCost.toString(), fees: l.fees.toString(), soldAt: l.soldAt ? dateOnly(l.soldAt) : null, soldPrice: null,
    }));
    const priceOn = (instrumentId: string, date: string): string | null => {
      let found: string | null = null;
      for (const b of bars.get(instrumentId) ?? []) {
        if (b.date > date) break;
        found = b.close;
      }
      return found;
    };
    const out: Record<string, string> = {};
    for (const m of months) {
      const end = `${m}-${String(new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5)), 0)).getUTCDate()).padStart(2, '0')}`;
      out[m] = portfolioValueOn(end > today ? today : end, lotCores, priceOn);
    }
    return out;
  }

  /* ------------------------------------------------------------ signals */

  private async refreshSignals(
    userId: string,
    now: Date,
    ctx: {
      instruments: Array<{ id: string; symbol: string }>;
      bars: Map<string, Array<{ date: string; close: string }>>;
      shares: Record<string, number>;
      target: Record<string, number>;
      paydayDay: number;
    },
  ): Promise<SignalDto[]> {
    const today = dublinDate(now);
    const out = runSignals({
      today,
      paydayDay: ctx.paydayDay,
      instruments: ctx.instruments.map((i) => ({ symbol: i.symbol, bars: ctx.bars.get(i.id) ?? [] })),
      shares: ctx.shares,
      target: ctx.target,
    });
    const idBySymbol = new Map(ctx.instruments.map((i) => [i.symbol, i.id]));
    const fresh: SignalOut[] = [];
    for (const s of out) {
      const existing = await this.db.signal.findUnique({ where: { userId_fingerprint: { userId, fingerprint: s.fingerprint } } });
      const payload = { title: s.title, body: s.body, ...s.payload };
      if (existing) {
        await this.db.signal.update({ where: { id: existing.id }, data: { payload } });
      } else {
        await this.db.signal.create({
          data: {
            userId,
            instrumentId: s.instrumentSymbol ? (idBySymbol.get(s.instrumentSymbol) ?? null) : null,
            rule: s.rule,
            firedAt: now,
            payload,
            fingerprint: s.fingerprint,
          },
        });
        fresh.push(s);
      }
    }
    for (const s of fresh.filter((x) => PUSH_RULES.has(x.rule))) {
      await this.push.send(userId, { kind: 'signal', title: s.title, body: s.body, data: { rule: s.rule } }, { respectQuietHours: true, now });
    }
    return this.listSignals(userId, 90, now);
  }

  async listSignals(userId: string, days = 90, now = new Date()): Promise<SignalDto[]> {
    const rows = await this.db.signal.findMany({
      where: { userId, firedAt: { gte: new Date(now.getTime() - days * 86_400_000) } },
      include: { instrument: { select: { symbol: true } } },
      orderBy: { firedAt: 'desc' },
    });
    // Only conditions that still hold: a signal is current if the latest run produced it (its payload was refreshed).
    return rows.map((r) => {
      const p = (r.payload ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        instrumentId: r.instrumentId,
        symbol: r.instrument?.symbol ?? null,
        rule: r.rule,
        title: String(p['title'] ?? r.rule),
        body: String(p['body'] ?? ''),
        firedAt: iso(r.firedAt),
        payload: p,
        seenAt: isoOrNull(r.seenAt),
      };
    });
  }

  /* ------------------------------------------------------- price series */

  async priceSeries(userId: string, instrumentId: string, days: number): Promise<PriceSeriesDto> {
    const inst = await this.db.instrument.findFirst({ where: { id: instrumentId, userId } });
    if (!inst) throw new NotFoundException('Instrument not found');
    let bars = await this.market.bars(instrumentId, days + 220);
    if (bars.length === 0) {
      await this.market.backfill(userId, instrumentId);
      bars = await this.market.bars(instrumentId, days + 220);
    }
    const closes = bars.map((b) => b.close);
    const sma50 = smaNumbers(closes, 50);
    const sma200 = smaNumbers(closes, 200);
    const keep = Math.min(bars.length, Math.ceil(days * 0.72) + 2);
    const last = bars.at(-1);
    let quote = { price: last?.close ?? '0', asOf: iso(new Date()) };
    try {
      const q = await this.market.quote(inst);
      quote = { price: q.price, asOf: iso(q.asOf) };
    } catch {
      /* keep the last stored close */
    }
    return {
      instrument: toInstrument(inst),
      bars: bars.slice(-keep),
      sma50: sma50.slice(-keep),
      sma200: sma200.slice(-keep),
      rsi14: rsi(closes),
      quote,
    };
  }
}

