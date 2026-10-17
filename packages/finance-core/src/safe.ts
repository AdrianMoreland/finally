import { D, Decimal, m2, sum } from './decimal';
import { diffDays } from './dates';
import { FLEX_BUDGET_SLUGS } from './ledger';

export interface SafeInput {
  today: string;
  nextPayday: string;
  /** Budget per flexible slug for this month (rollover already included). */
  budgets: Readonly<Record<string, string>>;
  /** Net spend per flexible slug this month, up to today. */
  spentBySlug: Readonly<Record<string, string>>;
  /** Spend this month that has no category yet; it counts against the budget until sorted. */
  unsorted: string;
  /** What the accounts that fund day-to-day spending hold right now. */
  balance: string;
  /** Overdraft the balance may use (the limit less what you keep free). Optional: none by default. */
  overdraft?: string;
  /** Bills expected between now and payday. */
  billsBeforePayday: string;
  /** The cushion you never want to dip into. */
  buffer: string;
}

export interface SafeResult {
  daysLeft: number;
  flexBudget: string;
  spentFlex: string;
  /** Overspending on individual lines: it reduces the number, it is not hidden by lines still under budget. */
  over: string;
  unsorted: string;
  budgetLeft: string;
  balance: string;
  /** The overdraft counted on top of the balance. */
  overdraft: string;
  billsDue: string;
  buffer: string;
  balanceLeft: string;
  pool: string;
  /** Which of the two numbers is the lower one, and so the one you are held to. */
  binds: 'budget' | 'balance';
  perDay: string;
}

/**
 * Safe to spend = the lower of what the flexible budgets still allow and what the balance allows after bills
 * before payday and a buffer, divided by the days to payday. Unsorted payments count against the budget;
 * overspending on one line is not offset by slack elsewhere because the total is budget minus all spending.
 */
export function computeSafeToSpend(i: SafeInput): SafeResult {
  const daysLeft = Math.max(1, diffDays(i.today, i.nextPayday));
  const flexBudget = sum(FLEX_BUDGET_SLUGS.map((s) => i.budgets[s] ?? 0));
  const spentFlex = sum(FLEX_BUDGET_SLUGS.map((s) => i.spentBySlug[s] ?? 0));
  const over = sum(
    FLEX_BUDGET_SLUGS.map((s) => Decimal.max(0, D(i.spentBySlug[s] ?? 0).minus(i.budgets[s] ?? 0))),
  );
  const budgetLeft = flexBudget.minus(spentFlex).minus(i.unsorted);
  const balanceLeft = D(i.balance).plus(i.overdraft ?? 0).minus(i.billsBeforePayday).minus(i.buffer);
  const pool = Decimal.min(budgetLeft, balanceLeft);
  return {
    daysLeft,
    flexBudget: m2(flexBudget),
    spentFlex: m2(spentFlex),
    over: m2(over),
    unsorted: m2(i.unsorted),
    budgetLeft: m2(budgetLeft),
    balance: m2(i.balance),
    overdraft: m2(i.overdraft ?? 0),
    billsDue: m2(i.billsBeforePayday),
    buffer: m2(i.buffer),
    balanceLeft: m2(balanceLeft),
    pool: m2(pool),
    binds: budgetLeft.lte(balanceLeft) ? 'budget' : 'balance',
    perDay: m2(Decimal.max(0, pool).div(daysLeft)),
  };
}

export interface WeekLeft {
  weekBudget: string;
  spent: string;
  left: string;
  daysLeft: number;
}

/** The flexible budget for one week against what you have spent since Monday. Often easier to act on than a daily figure. */
export function weekLeft(i: { flexBudget: string; daysInMonth: number; spentThisWeek: string; weekdayMon0: number }): WeekLeft {
  const wb = D(i.flexBudget).times(7).div(i.daysInMonth);
  return {
    weekBudget: m2(wb),
    spent: m2(i.spentThisWeek),
    left: m2(wb.minus(i.spentThisWeek)),
    daysLeft: 7 - i.weekdayMon0,
  };
}
