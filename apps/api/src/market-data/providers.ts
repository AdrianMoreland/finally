import type { AssetClass } from '@finally/contracts';
import { addDays, isWeekend } from '@finally/finance-core';

export interface InstrumentRef {
  symbol: string;
  exchange: string | null;
  assetClass: AssetClass;
  currency: string;
}

export interface Bar {
  date: string;
  close: string;
}

export interface Quote {
  price: string;
  asOf: Date;
}

export interface MarketDataProvider {
  readonly name: string;
  quote(inst: InstrumentRef): Promise<Quote>;
  /** Daily closes, oldest first, for roughly the last `days` calendar days. */
  history(inst: InstrumentRef, days: number): Promise<Bar[]>;
}

/* ------------------------------------------------------------------ mock */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

const EPOCH = '2024-01-01';
const ANCHOR = '2026-10-13';
/** Price on the anchor date for the demo instruments, so the mock lines up with the design prototype. */
const ANCHOR_PRICE: Record<string, number> = { VWCE: 136.2, EIMI: 31.1, GOLD: 112.5 };
/** Demo flavour: VWCE finishes with a strong run so an RSI signal fires on the demo data. */
const FORCED_RUN: Record<string, number> = { VWCE: 12 };

/** Deterministic random-walk prices per symbol. The same date always has the same close. */
export class MockMarketData implements MarketDataProvider {
  readonly name = 'mock';
  private readonly series = new Map<string, Map<string, number>>();

  private build(symbol: string, until: string): Map<string, number> {
    const cached = this.series.get(symbol);
    if (cached && cached.has(until)) return cached;
    const rng = mulberry32(hash(symbol));
    const dates: string[] = [];
    for (let d = EPOCH; d <= addDays(until, 0); d = addDays(d, 1)) if (!isWeekend(d)) dates.push(d);
    const raw: number[] = [];
    let p = 100;
    const anchorIdx = dates.indexOf(ANCHOR);
    const run = FORCED_RUN[symbol] ?? 0;
    dates.forEach((_, i) => {
      const forced = anchorIdx >= 0 && i > anchorIdx - run && i <= anchorIdx;
      p *= forced ? 1 + (rng() - 0.32) * 0.014 : 1 + (rng() - 0.47) * 0.02;
      raw.push(p);
    });
    const target = ANCHOR_PRICE[symbol] ?? 40 + (hash(`${symbol}:t`) % 160);
    const ref = anchorIdx >= 0 ? raw[anchorIdx]! : raw[raw.length - 1]!;
    const factor = target / ref;
    const out = new Map<string, number>();
    dates.forEach((d, i) => out.set(d, raw[i]! * factor));
    this.series.set(symbol, out);
    return out;
  }

  private lastTradingDay(today: string): string {
    let d = today;
    while (isWeekend(d)) d = addDays(d, -1);
    return d;
  }

  quote(inst: InstrumentRef): Promise<Quote> {
    const today = new Date().toISOString().slice(0, 10);
    const day = this.lastTradingDay(today);
    const price = this.build(inst.symbol, day).get(day) ?? 100;
    return Promise.resolve({ price: price.toFixed(4), asOf: new Date() });
  }

  history(inst: InstrumentRef, days: number): Promise<Bar[]> {
    const today = new Date().toISOString().slice(0, 10);
    const end = this.lastTradingDay(today);
    const from = addDays(end, -days);
    const s = this.build(inst.symbol, end);
    const bars: Bar[] = [];
    for (const [date, close] of s) if (date >= from && date <= end) bars.push({ date, close: close.toFixed(4) });
    return Promise.resolve(bars);
  }
}

/* --------------------------------------------------------------- real APIs */

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return (await res.json()) as T;
}

const MIC: Record<string, string> = { Xetra: 'XETR', XETRA: 'XETR', LSE: 'XLON', AEX: 'XAMS', Euronext: 'XPAR', ISE: 'XDUB' };

/** Twelve Data: quote and daily history for ETFs and shares. */
export class TwelveDataProvider implements MarketDataProvider {
  readonly name = 'twelvedata';
  constructor(private readonly key: string) {}

  private params(inst: InstrumentRef): string {
    const mic = inst.exchange ? (MIC[inst.exchange] ?? inst.exchange) : undefined;
    return `symbol=${encodeURIComponent(inst.symbol)}${mic ? `&mic_code=${mic}` : ''}&apikey=${this.key}`;
  }

  async quote(inst: InstrumentRef): Promise<Quote> {
    const r = await getJson<{ price?: string; message?: string }>(`https://api.twelvedata.com/price?${this.params(inst)}`);
    if (!r.price) throw new Error(r.message ?? 'No price');
    return { price: r.price, asOf: new Date() };
  }

  async history(inst: InstrumentRef, days: number): Promise<Bar[]> {
    const size = Math.min(5000, Math.ceil(days * 0.75) + 5);
    const r = await getJson<{ values?: Array<{ datetime: string; close: string }>; message?: string }>(
      `https://api.twelvedata.com/time_series?${this.params(inst)}&interval=1day&outputsize=${size}`,
    );
    if (!r.values) throw new Error(r.message ?? 'No history');
    return r.values
      .map((v) => ({ date: v.datetime.slice(0, 10), close: v.close }))
      .reverse();
  }
}

/** Finnhub: real-time quote. Free tier has no candles, so history is built up one daily close at a time. */
export class FinnhubProvider implements MarketDataProvider {
  readonly name = 'finnhub';
  constructor(private readonly key: string) {}

  async quote(inst: InstrumentRef): Promise<Quote> {
    const symbol = inst.exchange === 'Xetra' ? `${inst.symbol}.DE` : inst.symbol;
    const r = await getJson<{ c?: number; t?: number }>(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${this.key}`,
    );
    if (!r.c) throw new Error('No price');
    return { price: String(r.c), asOf: r.t ? new Date(r.t * 1000) : new Date() };
  }

  async history(inst: InstrumentRef): Promise<Bar[]> {
    const q = await this.quote(inst);
    return [{ date: q.asOf.toISOString().slice(0, 10), close: q.price }];
  }
}

const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', ADA: 'cardano', XRP: 'ripple', DOGE: 'dogecoin',
  DOT: 'polkadot', LTC: 'litecoin', LINK: 'chainlink', MATIC: 'matic-network', AVAX: 'avalanche-2',
};

/** CoinGecko (public API) for crypto, priced in EUR. */
export class CoinGeckoProvider implements MarketDataProvider {
  readonly name = 'coingecko';

  private id(inst: InstrumentRef): string {
    return COINGECKO_IDS[inst.symbol.toUpperCase()] ?? inst.symbol.toLowerCase();
  }

  async quote(inst: InstrumentRef): Promise<Quote> {
    const id = this.id(inst);
    const r = await getJson<Record<string, { eur?: number }>>(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=eur`);
    const price = r[id]?.eur;
    if (price === undefined) throw new Error('No price');
    return { price: String(price), asOf: new Date() };
  }

  async history(inst: InstrumentRef, days: number): Promise<Bar[]> {
    const r = await getJson<{ prices?: Array<[number, number]> }>(
      `https://api.coingecko.com/api/v3/coins/${this.id(inst)}/market_chart?vs_currency=eur&days=${Math.min(days, 365)}&interval=daily`,
    );
    return (r.prices ?? []).map(([t, p]) => ({ date: new Date(t).toISOString().slice(0, 10), close: String(p) }));
  }
}
