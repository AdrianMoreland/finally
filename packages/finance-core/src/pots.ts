import { D, Decimal, m2, sum } from './decimal';
import { nthPayday, paydaysUntil } from './dates';

/** A place money is set aside for something. One concept for rainy day, planned spends, treats and investing. */
export interface PotCore {
  id: string;
  name: string;
  type: 'SAFETY' | 'PLANNED' | 'TREAT' | 'INVESTING';
  balance: string;
  /** Null for a safety pot: its target is three months of essentials. */
  target: string | null;
  targetDate: string | null;
  monthly: string;
}

export interface PayCalendar {
  today: string;
  paydayDay: number;
  weekendShift: boolean;
}

export const safetyTarget = (essentialsPerMonth: string | Decimal, months = 3): Decimal => D(essentialsPerMonth).times(months).toDecimalPlaces(0);

export function potTarget(p: PotCore, essentialsPerMonth: string | Decimal): Decimal {
  return p.type === 'SAFETY' ? safetyTarget(essentialsPerMonth) : D(p.target ?? 0);
}

export type PotReach = { reached: true } | { never: true } | { k: number; date: string };

/** When a pot reaches `target` at its current monthly amount, counted in paydays. */
export function potReach(p: PotCore, target: Decimal, cal: PayCalendar): PotReach | null {
  if (target.lte(0)) return null;
  if (D(p.balance).gte(target)) return { reached: true };
  if (D(p.monthly).lte(0)) return { never: true };
  const k = target.minus(p.balance).div(p.monthly).ceil().toNumber();
  return { k, date: nthPayday(cal.today, cal.paydayDay, k, cal.weekendShift) };
}

export interface PotStatus {
  /** Reaches its target after the date you set. */
  late: boolean;
  /** Monthly amount that would make the date. */
  need: string;
  paydaysLeft: number;
  /** Still missing on the date at the current amount. */
  shortfall: string;
}

/** Only planned spends have a date to hit. */
export function potStatus(p: PotCore, cal: PayCalendar): PotStatus | null {
  if (p.type !== 'PLANNED' || !p.targetDate || !p.target) return null;
  const target = D(p.target);
  const r = potReach(p, target, cal);
  if (!r) return null;
  const n = paydaysUntil(cal.today, cal.paydayDay, p.targetDate, cal.weekendShift);
  const gap = Decimal.max(0, target.minus(p.balance));
  const need = n ? gap.div(n) : gap;
  const late = !('reached' in r) && ('never' in r || r.date > p.targetDate);
  return { late, need: m2(need), paydaysLeft: n, shortfall: m2(Decimal.max(0, gap.minus(D(p.monthly).times(n)))) };
}

/* ------------------------------------------------------- paying people back */

export interface DebtCore {
  id: string;
  name: string;
  /** What is left to pay. */
  left: string;
}

export type PayoffOrder = 'smallest' | 'largest' | 'custom';

export interface PayoffPlan {
  order: string[];
  /** Payday on which each person is fully paid. */
  done: Record<string, string>;
  /** What goes to each person on the next payday. */
  first: Record<string, string>;
  freeDate: string | null;
  series: Array<{ date: string; left: string }>;
}

/**
 * Snowball by default: put the monthly amount into the person with the smallest balance first and roll what is left
 * over to the next. `extraOn` adds a one-off (a bonus) to the payday in that month.
 */
export function payoffPlan(
  debts: readonly DebtCore[],
  monthly: string,
  order: PayoffOrder,
  custom: readonly string[],
  cal: PayCalendar,
  extra: { month: string; amount: string } | null = null,
): PayoffPlan {
  const left = new Map(debts.map((d) => [d.id, D(d.left)]));
  let ids = debts.map((d) => d.id).filter((id) => left.get(id)!.gt(0));
  if (order === 'smallest') ids.sort((a, b) => left.get(a)!.comparedTo(left.get(b)!));
  else if (order === 'largest') ids.sort((a, b) => left.get(b)!.comparedTo(left.get(a)!));
  else ids = custom.filter((id) => left.get(id)?.gt(0));
  const total = (): Decimal => sum([...left.values()]);
  const done: Record<string, string> = {};
  const first: Record<string, string> = {};
  const series: PayoffPlan['series'] = [{ date: cal.today, left: m2(total()) }];
  let k = 1;
  let pay = nthPayday(cal.today, cal.paydayDay, 1, cal.weekendShift);
  const firstPay = pay;
  while (total().gt('0.004') && k <= 120) {
    let budget = D(monthly).plus(extra && pay.startsWith(extra.month) ? extra.amount : 0);
    if (budget.lte(0)) break;
    for (const id of ids) {
      if (budget.lte(0)) break;
      const cur = left.get(id)!;
      const p = Decimal.min(budget, cur);
      if (pay === firstPay && p.gt(0)) first[id] = m2(p);
      left.set(id, cur.minus(p));
      budget = budget.minus(p);
      if (left.get(id)!.lte('0.004') && !done[id]) done[id] = pay;
    }
    series.push({ date: pay, left: m2(total()) });
    k++;
    pay = nthPayday(cal.today, cal.paydayDay, k, cal.weekendShift);
  }
  const clear = total().lte('0.004');
  return { order: ids, done, first, freeDate: clear ? (Object.values(done).sort().pop() ?? null) : null, series };
}

/* ------------------------------------------------------ standing orders */

export interface OrderRow {
  key: string;
  name: string;
  to: string;
  amount: string;
  /** What the user said they set up, if anything. */
  set: string | null;
  state: 'missing' | 'changed' | 'ok';
}

/** Finally stays read-only: each pot or payment you plan needs a standing order, and the app checks it landed. */
export function orderState(planned: string, set: string | null): OrderRow['state'] {
  if (set == null) return 'missing';
  return D(set).minus(planned).abs().gt('0.5') ? 'changed' : 'ok';
}

/** Date a recurring monthly amount reaches a goal, in plain calendar months from `from` (for rough "in N months"). */
export const monthsToReach = (target: Decimal, balance: Decimal, monthly: Decimal): number | null =>
  monthly.lte(0) ? null : Decimal.max(0, target.minus(balance)).div(monthly).ceil().toNumber();
