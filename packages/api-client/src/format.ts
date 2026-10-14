/**
 * Display formatting shared by web and mobile. Amounts arrive as decimal strings; they are only converted to
 * numbers here, at the very edge, for display. Never do arithmetic on them (use finance-core).
 */

const EUR = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });
const EUR0 = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

/** "-4.20" → "−€4.20"; with `signed`, positives get a "+". */
export function eur(value: string | number, opts: { signed?: boolean } = {}): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  return (n < 0 ? '−' : opts.signed && n > 0 ? '+' : '') + EUR.format(Math.abs(n));
}

export function eur0(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  return (n < 0 ? '−' : '') + EUR0.format(Math.abs(n));
}

export const pct = (n: number, digits = 1): string => `${n.toFixed(digits)}%`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const dubFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Dublin', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Instant → Dublin calendar date "2026-10-14". */
export const dublinDay = (instant: string | Date): string => dubFormat.format(typeof instant === 'string' ? new Date(instant) : instant);

/** "2026-10-14" or an ISO instant → "14 Oct". */
export function shortDate(input: string): string {
  const day = input.length > 10 ? dublinDay(input) : input;
  const [, m, d] = day.split('-').map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]}`;
}

export function longDate(input: string): string {
  const day = input.length > 10 ? dublinDay(input) : input;
  const [y, m, d] = day.split('-').map(Number);
  const wd = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).toLocaleDateString('en-IE', { weekday: 'long', timeZone: 'UTC' });
  return `${wd} ${d} ${new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1)).toLocaleDateString('en-IE', { month: 'long', timeZone: 'UTC' })} ${y}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1)).toLocaleDateString('en-IE', { month: 'long', timeZone: 'UTC' })} ${y}`;
}

export const shiftMonth = (month: string, n: number): string => {
  const [y, m] = month.split('-').map(Number);
  const t = (y ?? 1970) * 12 + ((m ?? 1) - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};

export const clockTime = (instant: string): string =>
  new Date(instant).toLocaleTimeString('en-IE', { timeZone: 'Europe/Dublin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
