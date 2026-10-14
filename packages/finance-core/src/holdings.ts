import type { Decimal} from './decimal';
import { D, m2, q8, ZERO } from './decimal';

export interface InstrumentCore {
  id: string;
  symbol: string;
  name: string;
}

export interface LotCore {
  id: string;
  instrumentId: string;
  /** YYYY-MM-DD */
  acquiredAt: string;
  quantity: string;
  unitCost: string;
  fees: string;
  soldAt: string | null;
  soldPrice: string | null;
}

export interface HoldingCore {
  instrumentId: string;
  symbol: string;
  quantity: string;
  avgCost: string;
  price: string;
  value: string;
  cost: string;
  gain: string;
  gainPct: number;
  /** Percent of portfolio value, 0-100 */
  share: number;
}

export interface PortfolioCore {
  holdings: HoldingCore[];
  total: string;
  cost: string;
  gain: string;
  gainPct: number;
}

/** Open lots → holdings. `prices` maps instrumentId to the latest close. Sold lots are excluded. */
export function computeHoldings(
  instruments: readonly InstrumentCore[],
  lots: readonly LotCore[],
  prices: Readonly<Record<string, string>>,
): PortfolioCore {
  const rows: Array<Omit<HoldingCore, 'share'> & { valueD: Decimal }> = [];
  for (const inst of instruments) {
    const open = lots.filter((l) => l.instrumentId === inst.id && !l.soldAt);
    if (open.length === 0) continue;
    const qty = open.reduce((a, l) => a.plus(l.quantity), ZERO);
    const cost = open.reduce((a, l) => a.plus(D(l.quantity).times(l.unitCost)).plus(l.fees), ZERO);
    const price = D(prices[inst.id] ?? 0);
    const value = qty.times(price);
    const gain = value.minus(cost);
    rows.push({
      instrumentId: inst.id,
      symbol: inst.symbol,
      quantity: q8(qty),
      avgCost: q8(qty.isZero() ? 0 : cost.div(qty)),
      price: q8(price),
      value: m2(value),
      cost: m2(cost),
      gain: m2(gain),
      gainPct: cost.isZero() ? 0 : gain.div(cost).times(100).toDecimalPlaces(2).toNumber(),
      valueD: value,
    });
  }
  const total = rows.reduce((a, r) => a.plus(r.valueD), ZERO);
  const cost = rows.reduce((a, r) => a.plus(r.cost), ZERO);
  const gain = total.minus(cost);
  return {
    holdings: rows
      .map(({ valueD, ...r }) => ({
        ...r,
        share: total.isZero() ? 0 : valueD.div(total).times(100).toDecimalPlaces(2).toNumber(),
      }))
      .sort((a, b) => Number(b.value) - Number(a.value)),
    total: m2(total),
    cost: m2(cost),
    gain: m2(gain),
    gainPct: cost.isZero() ? 0 : gain.div(cost).times(100).toDecimalPlaces(2).toNumber(),
  };
}

/** Portfolio value on a date from lots acquired by then and a price lookup `price(instrumentId, date)`. */
export function portfolioValueOn(
  date: string,
  lots: readonly LotCore[],
  price: (instrumentId: string, date: string) => string | null,
): string {
  let total = ZERO;
  for (const l of lots) {
    if (l.acquiredAt > date) continue;
    if (l.soldAt && l.soldAt <= date) continue;
    const p = price(l.instrumentId, date);
    total = total.plus(D(l.quantity).times(p ?? l.unitCost));
  }
  return m2(total);
}
