/**
 * Calendar helpers. All "dates" in finance-core are `YYYY-MM-DD` strings in Europe/Dublin local time,
 * so month and day maths never depends on the machine's timezone.
 */

export const DUBLIN = 'Europe/Dublin';

const dublinFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: DUBLIN,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Convert an instant (Date or ISO string) to the Dublin calendar date. */
export function dublinDate(instant: Date | string): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  return dublinFormat.format(d);
}

const parts = (date: string): [number, number, number] => {
  const [y, m, d] = date.split('-').map(Number);
  return [y ?? 1970, m ?? 1, d ?? 1];
};

const toUtc = (date: string): number => {
  const [y, m, d] = parts(date);
  return Date.UTC(y, m - 1, d);
};

const fromUtc = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export const monthOf = (date: string): string => date.slice(0, 7);

export const daysInMonth = (month: string): number => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, m ?? 1, 0)).getUTCDate();
};

export const dayOfMonth = (date: string): number => parts(date)[2];

export const addDays = (date: string, days: number): string => fromUtc(toUtc(date) + days * 86_400_000);

/** Whole days from `a` to `b` (b - a). */
export const diffDays = (a: string, b: string): number => Math.round((toUtc(b) - toUtc(a)) / 86_400_000);

export const addMonths = (month: string, n: number): string => {
  const [y, m] = month.split('-').map(Number);
  const total = (y ?? 1970) * 12 + ((m ?? 1) - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
};

/** Add whole months to a date, clamping the day (31 Jan + 1 month = 28/29 Feb). */
export const addMonthsToDate = (date: string, n: number): string => {
  const [, , d] = parts(date);
  const month = addMonths(monthOf(date), n);
  return `${month}-${String(Math.min(d, daysInMonth(month))).padStart(2, '0')}`;
};

export const addYears = (date: string, n: number): string => addMonthsToDate(date, n * 12);

export const monthRange = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
};

/**
 * The payday in a month. With `weekendShift`, a payday that lands on a weekend moves to the Friday before, as most
 * Irish payrolls do (the 25th on a Saturday or Sunday is paid on Friday the 24th or 23rd).
 */
export function paydayIn(month: string, paydayDay: number, weekendShift = false): string {
  const d = `${month}-${String(Math.min(paydayDay, daysInMonth(month))).padStart(2, '0')}`;
  if (!weekendShift) return d;
  const wd = new Date(toUtc(d)).getUTCDay();
  return wd === 6 ? addDays(d, -1) : wd === 0 ? addDays(d, -2) : d;
}

/** The payday on or after `today`: this month's payday if not yet passed, otherwise next month's. */
export function nextPayday(today: string, paydayDay: number, weekendShift = false): string {
  const month = monthOf(today);
  const thisMonth = paydayIn(month, paydayDay, weekendShift);
  return thisMonth >= today ? thisMonth : paydayIn(addMonths(month, 1), paydayDay, weekendShift);
}

/** Start of the pay cycle containing `today` (the most recent payday on or before today). */
export function lastPayday(today: string, paydayDay: number, weekendShift = false): string {
  const month = monthOf(today);
  const thisMonth = paydayIn(month, paydayDay, weekendShift);
  return thisMonth <= today ? thisMonth : paydayIn(addMonths(month, -1), paydayDay, weekendShift);
}

/** The k-th payday counted from `from` (k = 1 is the next one on or after `from`). */
export function nthPayday(from: string, paydayDay: number, k: number, weekendShift = false): string {
  let d = nextPayday(from, paydayDay, weekendShift);
  for (let i = 1; i < k; i++) d = paydayIn(addMonths(monthOf(d), 1), paydayDay, weekendShift);
  return d;
}

/** How many paydays fall on or before `by`, counting from `from`. */
export function paydaysUntil(from: string, paydayDay: number, by: string, weekendShift = false): number {
  let n = 0;
  let d = nextPayday(from, paydayDay, weekendShift);
  while (d <= by && n < 600) {
    n++;
    d = paydayIn(addMonths(monthOf(d), 1), paydayDay, weekendShift);
  }
  return n;
}

/** Monday = 0 … Sunday = 6. */
export const weekdayMon0 = (date: string): number => (new Date(toUtc(date)).getUTCDay() + 6) % 7;

/** The Monday of the week containing `date`. */
export const weekStart = (date: string): string => addDays(date, -weekdayMon0(date));

/** ISO week label such as `2026-W41`, used to key weekly reviews. */
export function isoWeek(date: string): string {
  const d = new Date(toUtc(date));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export const isWeekend = (date: string): boolean => {
  const wd = new Date(toUtc(date)).getUTCDay();
  return wd === 0 || wd === 6;
};
