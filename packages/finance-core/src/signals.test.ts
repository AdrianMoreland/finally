import { describe, expect, it } from 'vitest';
import { addDays } from './dates';
import {
  allocationDrift,
  concentration,
  dcaReminder,
  drawdownSignal,
  effectivePayday,
  rsi,
  rsiSignal,
  sma,
  smaCrossover,
  type PriceBarCore,
} from './signals';

const bars = (closes: number[], start = '2025-01-01'): PriceBarCore[] =>
  closes.map((c, i) => ({ date: addDays(start, i), close: c.toFixed(2) }));

describe('sma', () => {
  it('is null until the window fills, then averages', () => {
    const out = sma(['1', '2', '3', '4'], 2).map((v) => v?.toString() ?? null);
    expect(out).toEqual([null, '1.5', '2.5', '3.5']);
  });
});

describe('rsi', () => {
  it('is 100 on a monotonic rise and 0 on a monotonic fall', () => {
    const up = Array.from({ length: 30 }, (_, i) => (100 + i).toFixed(2));
    const down = Array.from({ length: 30 }, (_, i) => (200 - i).toFixed(2));
    expect(rsi(up)).toBe(100);
    expect(rsi(down)).toBe(0);
  });

  it('matches a known Wilder RSI value', () => {
    // Classic worked example (Wilder / StockCharts): RSI(14) after these closes ≈ 70.5
    const closes = [
      44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28,
    ].map((c) => c.toFixed(2));
    expect(rsi(closes)).toBeCloseTo(70.5, 0);
  });

  it('needs enough history', () => {
    expect(rsi(['1', '2', '3'])).toBeNull();
  });
});

describe('rsiSignal', () => {
  it('fires overbought above 70 and oversold below 30, with a weekly fingerprint', () => {
    const up = bars(Array.from({ length: 30 }, (_, i) => 100 + i * 2));
    const down = bars(Array.from({ length: 30 }, (_, i) => 200 - i * 2));
    expect(rsiSignal('VWCE', up)[0]?.rule).toBe('rsi_overbought');
    expect(rsiSignal('VWCE', down)[0]?.rule).toBe('rsi_oversold');
    expect(rsiSignal('VWCE', bars(Array.from({ length: 30 }, (_, i) => 100 + (i % 2)))).length).toBe(0);
  });
});

describe('smaCrossover', () => {
  it('detects a golden cross inside the lookback window', () => {
    // long decline then a sharp recovery so 50-day crosses above 200-day near the end
    const closes = [
      ...Array.from({ length: 220 }, (_, i) => 200 - i * 0.5),
      ...Array.from({ length: 40 }, (_, i) => 90 + i * 4),
    ];
    const all = bars(closes);
    let found: string | null = null;
    for (let end = 230; end <= all.length; end++) {
      const s = smaCrossover('X', all.slice(0, end), 1)[0];
      if (s?.rule === 'sma_golden_cross') found = s.rule;
    }
    expect(found).toBe('sma_golden_cross');
  });

  it('needs 201 bars and ignores flat series', () => {
    expect(smaCrossover('X', bars(Array.from({ length: 100 }, () => 10)))).toEqual([]);
    expect(smaCrossover('X', bars(Array.from({ length: 260 }, () => 10)))).toEqual([]);
  });
});

describe('drawdownSignal', () => {
  it('reports the deepest threshold crossed from the 52-week high', () => {
    expect(drawdownSignal('X', bars([100, 120, 100]))[0]?.rule).toBe('drawdown_10'); // 16.7%
    expect(drawdownSignal('X', bars([100, 120, 90]))[0]?.rule).toBe('drawdown_20'); // 25%
    expect(drawdownSignal('X', bars([100, 120, 80]))[0]?.rule).toBe('drawdown_30'); // 33.3%
    expect(drawdownSignal('X', bars([100, 120, 115]))).toEqual([]); // 4.2%
  });

  it('uses the last 252 bars only', () => {
    const closes = [500, ...Array.from({ length: 260 }, () => 100)];
    expect(drawdownSignal('X', bars(closes))).toEqual([]);
  });
});

describe('allocationDrift', () => {
  it('fires beyond 5 points either way, using target keys only', () => {
    const out = allocationDrift({ VWCE: 72, EIMI: 14, GOLD: 14 }, { VWCE: 65, EIMI: 20, GOLD: 15 }, '2026-10-14');
    expect(out.map((s) => s.instrumentSymbol)).toEqual(['EIMI', 'VWCE']);
    expect(out[1]!.payload['drift']).toBe(7);
  });
  it('stays quiet within tolerance', () => {
    expect(allocationDrift({ A: 52 }, { A: 50 }, '2026-10-14')).toEqual([]);
  });
});

describe('dcaReminder', () => {
  it('fires on payday and on the preceding Friday when payday is a weekend', () => {
    expect(dcaReminder('2026-10-28', 28)).toHaveLength(1); // Wednesday
    expect(effectivePayday('2026-11', 28)).toBe('2026-11-27'); // Saturday → Friday
    expect(dcaReminder('2026-11-27', 28)).toHaveLength(1);
    expect(dcaReminder('2026-10-27', 28)).toEqual([]);
  });
});

describe('concentration', () => {
  it('flags holdings above 25% of the portfolio', () => {
    const out = concentration({ VWCE: 62, EIMI: 24, GOLD: 14 }, '2026-10-14');
    expect(out.map((s) => s.instrumentSymbol)).toEqual(['VWCE']);
  });
});
