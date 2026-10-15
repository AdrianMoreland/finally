import { mulberry32 } from './grow';

/**
 * The practice account and the metal vault. Prices here are samples (the real app would read a market-data provider);
 * what matters is that the rules around them behave: a 7-day wait after a 10% fall, buy-back below spot, and so on.
 */

export interface PracticeInstrument {
  symbol: string;
  name: string;
  price: number;
  /** Key into the investing mix, for drift. */
  mix: 'world' | 'sp' | 'em' | 'gold';
  tax: 'Exit tax' | 'CGT';
}

export const PRACTICE_INSTRUMENTS: readonly PracticeInstrument[] = [
  { symbol: 'VWCE', name: 'Vanguard FTSE All-World UCITS ETF (Acc)', price: 136.2, mix: 'world', tax: 'Exit tax' },
  { symbol: 'CSPX', name: 'iShares Core S&P 500 UCITS ETF (Acc)', price: 598.4, mix: 'sp', tax: 'Exit tax' },
  { symbol: 'EIMI', name: 'iShares Core MSCI EM IMI UCITS ETF', price: 31.1, mix: 'em', tax: 'Exit tax' },
  { symbol: 'GOLD', name: 'Gold, per troy ounce', price: 3380, mix: 'gold', tax: 'CGT' },
];

export const PRACTICE_START = 5000;
/** A fall of this much from what you paid triggers the wait rule. */
export const GUARD_DROP = 0.1;
export const GUARD_DAYS = 7;

/** Price after `moves` (a running multiplier per symbol). */
export const practicePrice = (base: number, move: number | undefined): number => base * (move ?? 1);

/** One practice month: every price moves, deterministically in the step number, with the odd sharp fall. */
export function advanceMoves(moves: Readonly<Record<string, number>>, step: number): Record<string, number> {
  const out: Record<string, number> = { ...moves };
  for (const i of PRACTICE_INSTRUMENTS) {
    const rand = mulberry32(step * 7919 + i.symbol.charCodeAt(0) * 131 + i.symbol.charCodeAt(1));
    const shock = rand() < 0.2 ? -0.1 - rand() * 0.06 : (rand() - 0.42) * 0.07;
    out[i.symbol] = (out[i.symbol] ?? 1) * (1 + shock + 0.006);
  }
  return out;
}

export function practiceLabel(move: number): { label: string; severity: 'info' | 'watch' } {
  if (move < 0.9) return { label: `${Math.round((1 - move) * 100)}% off its high`, severity: 'watch' };
  if (move > 1.12) return { label: 'Stretched: well above its average', severity: 'watch' };
  return { label: move >= 1 ? 'Above 200-day avg' : 'Below 200-day avg', severity: 'info' };
}

/* ------------------------------------------------------------------- metals */

export interface MetalProduct {
  key: string;
  name: string;
  grams: number;
  metal: 'gold' | 'silver';
  /** Dealer premium over spot when you buy. */
  premium: number;
}

export const METAL_PRODUCTS: readonly MetalProduct[] = [
  { key: 'coin', name: '1 oz gold coin', grams: 31.1035, metal: 'gold', premium: 0.05 },
  { key: 'bar20', name: '20 g gold bar', grams: 20, metal: 'gold', premium: 0.04 },
  { key: 'bar100', name: '100 g gold bar', grams: 100, metal: 'gold', premium: 0.025 },
  { key: 'silver', name: '1 oz silver coin', grams: 31.1035, metal: 'silver', premium: 0.18 },
];

export const GOLD_PER_OZ = 3380;
export const SILVER_PER_OZ = 40.2;
/** Dealers buy back below spot. */
export const BUYBACK_DISCOUNT = 0.02;

export const spotPerGram = (metal: 'gold' | 'silver'): number => (metal === 'silver' ? SILVER_PER_OZ : GOLD_PER_OZ) / 31.1035;
