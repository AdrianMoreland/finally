import type { Decimal} from './decimal';
import { D, m2 } from './decimal';
import { addDays, dayOfMonth, daysInMonth, isWeekend, monthOf } from './dates';
import { eur0 } from './types';

export interface PriceBarCore {
  /** YYYY-MM-DD */
  date: string;
  close: string;
}

export interface SignalOut {
  rule: string;
  instrumentSymbol: string | null;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  fingerprint: string;
}

/* ---------------------------------------------------------------- indicators */

/** Simple moving average; `null` until `n` bars exist. */
export function sma(closes: readonly string[], n: number): Array<Decimal | null> {
  const out: Array<Decimal | null> = [];
  let window = D(0);
  for (let i = 0; i < closes.length; i++) {
    window = window.plus(closes[i]!);
    if (i >= n) window = window.minus(closes[i - n]!);
    out.push(i >= n - 1 ? window.div(n) : null);
  }
  return out;
}

/** Wilder's RSI; `null` until `n + 1` bars exist. Returns one value per bar. */
export function rsiSeries(closes: readonly string[], n = 14): Array<Decimal | null> {
  const out: Array<Decimal | null> = closes.map(() => null);
  if (closes.length <= n) return out;
  let gain = D(0);
  let loss = D(0);
  for (let i = 1; i <= n; i++) {
    const d = D(closes[i]!).minus(closes[i - 1]!);
    if (d.isPositive()) gain = gain.plus(d);
    else loss = loss.minus(d);
  }
  let avgGain = gain.div(n);
  let avgLoss = loss.div(n);
  const rsi = (): Decimal => (avgLoss.isZero() ? D(100) : D(100).minus(D(100).div(D(1).plus(avgGain.div(avgLoss)))));
  out[n] = rsi();
  for (let i = n + 1; i < closes.length; i++) {
    const d = D(closes[i]!).minus(closes[i - 1]!);
    const g = d.isPositive() ? d : D(0);
    const l = d.isNegative() ? d.neg() : D(0);
    avgGain = avgGain.times(n - 1).plus(g).div(n);
    avgLoss = avgLoss.times(n - 1).plus(l).div(n);
    out[i] = rsi();
  }
  return out;
}

export const rsi = (closes: readonly string[], n = 14): number | null => {
  const v = rsiSeries(closes, n).at(-1);
  return v ? v.toDecimalPlaces(1).toNumber() : null;
};

const num = (v: Decimal | null): number | null => (v ? v.toDecimalPlaces(4).toNumber() : null);
export const smaNumbers = (closes: readonly string[], n: number): Array<number | null> => sma(closes, n).map(num);

/** Monday of the week containing `date`; used to keep a standing condition from re-firing daily. */
const weekKey = (date: string): string => {
  const wd = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((wd + 6) % 7));
};

/* -------------------------------------------------------------------- rules */

/** SMA 50/200 crossover within the last `lookback` bars. */
export function smaCrossover(symbol: string, bars: readonly PriceBarCore[], lookback = 5): SignalOut[] {
  if (bars.length < 201) return [];
  const closes = bars.map((b) => b.close);
  const fast = sma(closes, 50);
  const slow = sma(closes, 200);
  for (let i = bars.length - 1; i >= Math.max(1, bars.length - lookback); i--) {
    const f1 = fast[i], s1 = slow[i], f0 = fast[i - 1], s0 = slow[i - 1];
    if (!f1 || !s1 || !f0 || !s0) continue;
    const before = f0.minus(s0);
    const after = f1.minus(s1);
    const golden = before.lte(0) && after.gt(0);
    const death = before.gte(0) && after.lt(0);
    if (!golden && !death) continue;
    const date = bars[i]!.date;
    return [
      {
        rule: golden ? 'sma_golden_cross' : 'sma_death_cross',
        instrumentSymbol: symbol,
        title: `${symbol}: 50-day average crossed ${golden ? 'above' : 'below'} the 200-day`,
        body: `${golden ? 'Golden' : 'Death'} cross on ${date}. 50-day ${f1.toFixed(2)}, 200-day ${s1.toFixed(2)}.`,
        payload: { date, sma50: f1.toFixed(4), sma200: s1.toFixed(4), direction: golden ? 'up' : 'down' },
        fingerprint: `${golden ? 'sma_golden_cross' : 'sma_death_cross'}:${symbol}:${date}`,
      },
    ];
  }
  return [];
}

export function rsiSignal(symbol: string, bars: readonly PriceBarCore[]): SignalOut[] {
  const closes = bars.map((b) => b.close);
  const value = rsiSeries(closes, 14).at(-1);
  if (!value) return [];
  const date = bars.at(-1)!.date;
  if (value.gt(70) || value.lt(30)) {
    const over = value.gt(70);
    const rule = over ? 'rsi_overbought' : 'rsi_oversold';
    return [
      {
        rule,
        instrumentSymbol: symbol,
        title: `${symbol}: RSI(14) is ${value.toFixed(0)}, ${over ? 'above 70' : 'below 30'}`,
        body: `RSI(14) closed at ${value.toFixed(1)} on ${date}. ${over ? 'Above 70 is conventionally read as overbought.' : 'Below 30 is conventionally read as oversold.'}`,
        payload: { date, rsi: value.toDecimalPlaces(2).toNumber(), threshold: over ? 70 : 30 },
        fingerprint: `${rule}:${symbol}:${weekKey(date)}`,
      },
    ];
  }
  return [];
}

/** Drawdown from the 52-week (252 trading days) high at 10 / 20 / 30%. Reports the deepest level reached. */
export function drawdownSignal(symbol: string, bars: readonly PriceBarCore[]): SignalOut[] {
  if (bars.length < 2) return [];
  const window = bars.slice(-252);
  let high = window[0]!;
  for (const b of window) if (D(b.close).gt(high.close)) high = b;
  const last = bars.at(-1)!;
  const dd = D(high.close).minus(last.close).div(high.close).times(100);
  const level = [30, 20, 10].find((t) => dd.gte(t));
  if (!level) return [];
  return [
    {
      rule: `drawdown_${level}`,
      instrumentSymbol: symbol,
      title: `${symbol} is ${dd.toFixed(0)}% below its 52-week high`,
      body: `Closed at ${D(last.close).toFixed(2)} on ${last.date}, from a high of ${D(high.close).toFixed(2)} on ${high.date}. Crossed the ${level}% drawdown level.`,
      payload: { date: last.date, high: D(high.close).toFixed(4), highDate: high.date, last: D(last.close).toFixed(4), drawdownPct: dd.toDecimalPlaces(2).toNumber(), level },
      fingerprint: `drawdown_${level}:${symbol}:${high.date}`,
    },
  ];
}

/** Holding share vs target share, both in percent points. Fires when the gap is over `threshold`. */
export function allocationDrift(
  actual: Readonly<Record<string, number>>,
  target: Readonly<Record<string, number>>,
  today: string,
  threshold = 5,
): SignalOut[] {
  const keys = new Set([...Object.keys(actual), ...Object.keys(target)]);
  const out: SignalOut[] = [];
  for (const key of [...keys].sort()) {
    const a = actual[key] ?? 0;
    const t = target[key];
    if (t === undefined) continue;
    const drift = a - t;
    if (Math.abs(drift) > threshold) {
      out.push({
        rule: 'allocation_drift',
        instrumentSymbol: key,
        title: `${key} is ${Math.abs(drift).toFixed(1)} points ${drift > 0 ? 'over' : 'under'} target`,
        body: `${a.toFixed(1)}% of the portfolio against a ${t.toFixed(1)}% target. New money could go to ${drift > 0 ? 'the other holdings' : key}.`,
        payload: { actual: a, target: t, drift: Number(drift.toFixed(2)) },
        fingerprint: `allocation_drift:${key}:${monthOf(today)}`,
      });
    }
  }
  return out;
}

/** The working day a payday lands on: weekend paydays are paid on the preceding Friday. */
export function effectivePayday(month: string, paydayDay: number): string {
  let date = `${month}-${String(Math.min(paydayDay, daysInMonth(month))).padStart(2, '0')}`;
  while (isWeekend(date)) date = addDays(date, -1);
  return date;
}

export function dcaReminder(today: string, paydayDay: number): SignalOut[] {
  if (today !== effectivePayday(monthOf(today), paydayDay)) return [];
  return [
    {
      rule: 'dca_reminder',
      instrumentSymbol: null,
      title: 'Payday: time for your monthly investment',
      body: `Payday is ${dayOfMonth(today)} ${new Date(`${today}T00:00:00Z`).toLocaleString('en-IE', { month: 'long', timeZone: 'UTC' })}. Regular investing is your plan; set the amount aside first.`,
      payload: { date: today },
      fingerprint: `dca_reminder:${monthOf(today)}`,
    },
  ];
}

export function concentration(shares: Readonly<Record<string, number>>, today: string, limit = 25): SignalOut[] {
  return Object.entries(shares)
    .filter(([, s]) => s > limit)
    .sort((a, b) => b[1] - a[1])
    .map(([symbol, share]) => ({
      rule: 'concentration',
      instrumentSymbol: symbol,
      title: `${symbol} is ${share.toFixed(0)}% of your portfolio`,
      body: `One holding above ${limit}% adds concentration risk. ${symbol} is ${share.toFixed(1)}% of the total.`,
      payload: { share, limit },
      fingerprint: `concentration:${symbol}:${monthOf(today)}`,
    }));
}

export interface SignalRunInput {
  today: string;
  paydayDay: number;
  instruments: ReadonlyArray<{ symbol: string; bars: readonly PriceBarCore[] }>;
  /** Percent share by symbol, 0-100 */
  shares: Readonly<Record<string, number>>;
  target: Readonly<Record<string, number>>;
}

/** Run every rule. Returns signals in a stable order. */
export function runSignals(i: SignalRunInput): SignalOut[] {
  const out: SignalOut[] = [];
  for (const inst of i.instruments) {
    out.push(...smaCrossover(inst.symbol, inst.bars), ...rsiSignal(inst.symbol, inst.bars), ...drawdownSignal(inst.symbol, inst.bars));
  }
  out.push(...allocationDrift(i.shares, i.target, i.today), ...concentration(i.shares, i.today), ...dcaReminder(i.today, i.paydayDay));
  return out;
}

export const formatValue = (v: string): string => eur0(Number(m2(v)));
