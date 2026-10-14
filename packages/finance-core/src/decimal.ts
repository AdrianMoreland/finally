import DecimalBase from 'decimal.js';

/** Isolated Decimal constructor: 40 significant digits, banker-free half-up rounding. */
export const Decimal = DecimalBase.clone({ precision: 40, rounding: DecimalBase.ROUND_HALF_UP });
export type Decimal = InstanceType<typeof Decimal>;
export type Num = DecimalBase.Value;

export const D = (v: Num): Decimal => new Decimal(v);
export const ZERO = new Decimal(0);

/** Format as a 2-dp decimal string, e.g. "12.50". */
export const m2 = (v: Num): string => D(v).toDecimalPlaces(2, DecimalBase.ROUND_HALF_UP).toFixed(2);

/** Format as a decimal string with up to 8 dp, trailing zeros trimmed (quantities, unit prices). */
export const q8 = (v: Num): string => {
  const s = D(v).toDecimalPlaces(8, DecimalBase.ROUND_HALF_UP).toFixed(8);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
};

export const sum = (values: readonly Num[]): Decimal => values.reduce<Decimal>((a, v) => a.plus(v), ZERO);

export const median = (values: readonly Num[]): Decimal => {
  if (values.length === 0) return ZERO;
  const sorted = values.map(D).sort((a, b) => a.comparedTo(b));
  const mid = Math.floor(sorted.length / 2);
  const a = sorted[mid]!;
  return sorted.length % 2 ? a : a.plus(sorted[mid - 1]!).div(2);
};

export const mean = (values: readonly Num[]): Decimal =>
  values.length === 0 ? ZERO : sum(values).div(values.length);

export const clamp = (v: Decimal, lo: Num, hi: Num): Decimal => Decimal.min(Decimal.max(v, lo), hi);
