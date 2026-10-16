import { D } from './decimal';
import { diffDays } from './dates';
import { eur, eur0 } from './types';

export type ActionSeverity = 'YOU' | 'ACT' | 'WATCH';

export type ActionCta =
  | { kind: 'go'; label: string; to: string }
  | { kind: 'check'; label: string; itemId: string; state: 'DONE' }
  | { kind: 'remind'; label: string; personId: string }
  /** Put this text on the clipboard (a message to the house, a reminder to one flatmate). */
  | { kind: 'copy'; label: string; text: string };

export interface ActionItem {
  id: string;
  severity: ActionSeverity;
  title: string;
  body: string;
  /** Money involved, used to rank. */
  amount: string;
  cta: ActionCta;
  /** Pinned items stay on top whatever they are worth. */
  pinned: boolean;
}

export interface ActionInput {
  today: string;
  nextPayday: string;
  toSort: { count: number; total: string };
  orders: Array<{ name: string; amount: string; state: 'missing' | 'changed' | 'ok' }>;
  rentCredit: { state: 'TODO' | 'DONE' | 'NA'; amount: number; year: number };
  prevRentCredit: { state: 'TODO' | 'DONE' | 'NA'; amount: number; sinceYear: string };
  owed: Array<{ id: string; name: string; left: string; since: string; note: string | null }>;
  pots: Array<{ id: string; name: string; late: boolean; reaches: string; targetDate: string; need: string; monthly: string; shortfall: string }>;
  pace: Array<{ slug: string; name: string; spent: string; budget: string; projected: string; day: number }>;
  /** `rentOn` is set when a rent payment this month is why the account is below zero. */
  overdrawn: { balance: string; fees12m: string; rentOn?: string } | null;
  /**
   * Set only when a rent round exists this month and the account's lowest end-of-day balance this month is below
   * zero: you fronted the rent and the shares arrived after it.
   */
  frontOverdraft: { low: string; day: string; total: string; rentDay: number; payByDay: number; fees12m: string; message: string } | null;
  /** Flatmates who still owe part of this month's share. */
  shareReminders: Array<{ id: string; name: string; monthName: string; total: string; rentDate: string; got: string; own: string; left: string; message: string }>;
  doubles: Array<{ id: string; merchantName: string; date: string; amount: string; count: number }>;
  rises: Array<{ id: string; name: string; from: string; to: string; since: string }>;
  /** Action ids the user has snoozed. */
  snoozed: ReadonlySet<string>;
}

const shortDate = (d: string): string => {
  const [, m, day] = d.split('-').map(Number);
  return `${day} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][(m ?? 1) - 1]}`;
};

/**
 * Everything that needs the user, ranked by the money involved (the things that stop the numbers being right come
 * first). The Today screen shows the top three; each has one button and a snooze.
 */
export function buildActions(i: ActionInput): ActionItem[] {
  const A: ActionItem[] = [];
  if (i.toSort.count > 0) {
    A.push({
      id: 'sort',
      severity: 'YOU',
      title: `${i.toSort.count} merchant${i.toSort.count > 1 ? 's' : ''} to sort`,
      body: 'One answer each sorts every payment from them, past and future. Until then they count against safe to spend as unsorted.',
      amount: i.toSort.total,
      cta: { kind: 'go', label: 'Sort now', to: '/sort' },
      pinned: true,
    });
  }
  const issues = i.orders.filter((o) => o.state !== 'ok');
  if (issues.length) {
    const first = issues[0]!;
    A.push({
      id: 'orders',
      severity: 'ACT',
      title:
        issues.length === 1
          ? first.state === 'missing'
            ? `Set up the ${first.name} standing order`
            : `Change the ${first.name} standing order to ${eur0(first.amount)}`
          : `${issues.length} standing orders to set up or change`,
      body: `In AIB, before payday on ${shortDate(i.nextPayday)}. Finally checks that each one arrives.`,
      amount: issues.reduce((a, o) => a.plus(o.amount), D(0)).toFixed(2),
      cta: { kind: 'go', label: 'Open payday plan', to: '/plan/payday' },
      pinned: false,
    });
  }
  if (i.rentCredit.state === 'TODO') {
    A.push({
      id: 'rentcredit',
      severity: 'ACT',
      title: `Claim your Rent Tax Credit for ${i.rentCredit.year}`,
      body: `${eur0(i.rentCredit.amount)} if your tenancy qualifies. You claim it in Revenue myAccount, then mark it here.`,
      amount: D(i.rentCredit.amount).toFixed(2),
      cta: { kind: 'check', label: 'Mark as claimed', itemId: 'rent', state: 'DONE' },
      pinned: false,
    });
  }
  if (i.prevRentCredit.state === 'TODO' && i.prevRentCredit.amount > 0) {
    A.push({
      id: 'rentprev',
      severity: 'ACT',
      title: `Claim earlier years of rent credit: ${eur0(i.prevRentCredit.amount)}`,
      body: `For the years you rented since ${i.prevRentCredit.sinceYear}.`,
      amount: D(i.prevRentCredit.amount).toFixed(2),
      cta: { kind: 'go', label: 'Open Tax & pay', to: '/plan/tax' },
      pinned: false,
    });
  }
  for (const o of i.owed) {
    const age = diffDays(o.since, i.today);
    if (D(o.left).gt(0) && age >= 21) {
      A.push({
        id: `owed-${o.id}`,
        severity: 'ACT',
        title: `${o.name} owes you ${eur0(o.left)} since ${shortDate(o.since)}`,
        body: `${o.note ?? 'Money owed'}. Copy a friendly reminder to send.`,
        amount: o.left,
        cta: { kind: 'remind', label: 'Copy reminder', personId: o.id },
        pinned: false,
      });
    }
  }
  for (const p of i.pots) {
    if (p.late) {
      A.push({
        id: `pot-${p.id}`,
        severity: 'WATCH',
        title: `${p.name} lands ${p.reaches}, after your ${shortDate(p.targetDate)} date`,
        body: `${eur0(Math.ceil(Number(p.need)))} a month makes it in time. You put in ${eur0(p.monthly)}.`,
        amount: p.shortfall,
        cta: { kind: 'go', label: 'Fix in Pots', to: '/plan/pots' },
        pinned: false,
      });
    }
  }
  for (const r of i.pace) {
    if (D(r.spent).gt(0) && D(r.projected).gt(D(r.budget).times('1.08'))) {
      A.push({
        id: `pace-${r.slug}`,
        severity: 'WATCH',
        title: `${r.name} is heading for ${eur0(r.projected)} of ${eur0(r.budget)}`,
        body: `${eur(r.spent)} so far, ahead of your usual pace for day ${r.day}.`,
        amount: D(r.projected).minus(r.budget).toFixed(2),
        cta: { kind: 'go', label: 'Adjust budget', to: '/money/budgets' },
        pinned: false,
      });
    }
  }
  const ord = (n: number): string => `${n}${n % 100 > 10 && n % 100 < 14 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
  if (i.frontOverdraft) {
    const f = i.frontOverdraft;
    A.push({
      id: 'front',
      severity: 'ACT',
      title: `AIB went ${eur(D(f.low).abs().toFixed(2))} overdrawn on ${shortDate(f.day)} while you fronted the rent`,
      body: `The landlord gets ${eur0(f.total)} on the ${ord(f.rentDay)} and the shares arrive after it. Overdraft interest and fees cost you ${eur(f.fees12m)} in the last 12 months. Ask the house to pay by the ${ord(f.payByDay)}.`,
      amount: f.fees12m,
      cta: { kind: 'copy', label: 'Copy message', text: f.message },
      pinned: true,
    });
  }
  for (const r of i.shareReminders) {
    if (!D(r.left).gt(0)) continue;
    A.push({
      id: `share-${r.id}`,
      severity: 'WATCH',
      title: `${r.name} has sent ${eur0(r.got)} of ${eur0(r.own)} for ${r.monthName}`,
      body: `You paid the full ${eur0(r.total)} on ${shortDate(r.rentDate)}. ${eur0(r.left)} is still to come. It counts as owed to you, not as your rent.`,
      amount: r.left,
      cta: { kind: 'copy', label: 'Copy reminder', text: r.message },
      pinned: false,
    });
  }
  if (i.overdrawn) {
    A.push({
      id: 'overdrawn',
      severity: 'ACT',
      title: `AIB is overdrawn: ${eur(i.overdrawn.balance)}`,
      body: i.overdrawn.rentOn
        ? `Rent went out on ${shortDate(i.overdrawn.rentOn)} before every share was in. AIB charged ${eur(i.overdrawn.fees12m)} in overdraft interest and fees in the last 12 months.`
        : `AIB charged ${eur(i.overdrawn.fees12m)} in overdraft interest and fees in the last 12 months.`,
      amount: D(i.overdrawn.balance).neg().toFixed(2),
      cta: { kind: 'go', label: 'See the forecast', to: '/plan/payday' },
      pinned: true,
    });
  }
  for (const d of i.doubles) {
    A.push({
      id: `dbl-${d.id}`,
      severity: 'WATCH',
      title: `${d.merchantName} ${eur(d.amount)} ${d.count === 2 ? 'twice' : `${d.count} times`} on ${shortDate(d.date)}`,
      body: "Same amount, same day. Check it's not a double charge.",
      amount: D(d.amount).times(d.count - 1).toFixed(2),
      cta: { kind: 'go', label: 'Review', to: '/money/bills' },
      pinned: false,
    });
  }
  for (const r of i.rises) {
    A.push({
      id: `rise-${r.id}`,
      severity: 'WATCH',
      title: `${r.name} went up to ${eur(r.to)}`,
      body: `From ${eur(r.from)} since ${shortDate(r.since)}: ${eur(D(r.to).minus(r.from).times(12).toFixed(2))} more a year.`,
      amount: D(r.to).minus(r.from).times(12).toFixed(2),
      cta: { kind: 'go', label: 'Review', to: '/money/bills' },
      pinned: false,
    });
  }
  return A.filter((a) => !i.snoozed.has(a.id)).sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || Number(b.amount) - Number(a.amount),
  );
}
