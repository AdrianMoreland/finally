import { DEMO_CLOSING_BALANCE, DEMO_DESCRIPTORS, DEMO_ROWS, DEMO_STATEMENT_END } from '@finally/db';
import { addDays, D, dayOfMonth, diffDays, m2, monthOf } from '@finally/finance-core';
import type { RawBankTx } from './bank-provider';

/**
 * The mock AIB account: the owner's real statement (to 8 Sep 2026) followed by generated payments up to today, so the
 * demo always has current numbers. Generated rows reuse descriptors from the statement, which means the same rules
 * categorise them, and follow the same habits (salary around the 25th, rent in the second week, housemates' shares
 * a few days later, the usual subscriptions on their usual days).
 */

const MAX_FILL_DAYS = 120;

const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

function rngFor(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Fill {
  date: string;
  desc: string;
  amount: number;
}

const POOLS = {
  groceries: ['VDC-TESCO STORES 4', 'VDC-TESCO STORES', 'VDC-SPAR PATRICK S', 'VDC-CENTRA', 'VDC-SPAR NEW STREE', 'VDC-CENTRA DONEGAL', 'VDC-SPAR WATERLOO', 'VDC-TESCO STORES 6'],
  eating: ['VDC-Snax N The Cit', 'VDC-Chapter and Ve', 'VDC-PRET A MANGER', 'VDP-DELIVEROO', 'VDC-SumUp  *TASTE', 'VDC-TST-Bison', 'VDC-MRS REIDS 01', 'VDC-YO Sushi'],
  coffee: ['VDC-SQ *HARLEM CAF', 'VDC-CAFFE NERO 466', 'VDC-Insomnia Baggo', 'VDC-SQ *CREMA BELF', 'VDC-The Fumbally C'],
  bars: ['VDC-BLACKBIRD RATH', 'VDC-Mother Reilly\'', 'VDC-TONERS PUB', 'VDC-Wigwam', 'VDC-SEARSONS'],
  taxi: ['VDP-FREENOW* DZ7YG', 'VDP-FREENOW* E0DJN'],
} as const;

const SUBSCRIPTIONS: Array<{ day: number; desc: string; amount: number }> = [
  { day: 2, desc: 'VDP-Phtoshp Lightr', amount: -18.6 },
  { day: 2, desc: 'VDP-APPLE.COM/BILL', amount: -9.99 },
  { day: 3, desc: 'D/D PayPal Europe', amount: -12.99 },
  { day: 4, desc: 'VDP-APPLE.COM/BILL', amount: -16.99 },
  { day: 7, desc: 'VDP-WL*GOOGLE  Goo', amount: -1.99 },
  { day: 18, desc: 'VDP-APPLE.COM/BILL', amount: -13.99 },
  { day: 21, desc: 'VDP-FS *Lexicon', amount: -8.99 },
  { day: 21, desc: 'D/D VIRGIN MEDIA I', amount: -72.5 },
  { day: 27, desc: 'VDP-APPLE.COM/BILL', amount: -22 },
  { day: 28, desc: 'VDP-METALPRICEAPI.', amount: -6.46 },
];

/** Friday before the 25th when it falls on a weekend, like the real WAGES credits. */
function paydayOf(month: string): string {
  let d = `${month}-25`;
  const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
  if (wd === 6) d = addDays(d, -1);
  if (wd === 0) d = addDays(d, -2);
  return d;
}

function fillDay(date: string): Fill[] {
  const rng = rngFor(`aib:${date}`);
  const out: Fill[] = [];
  const dom = dayOfMonth(date);
  const month = monthOf(date);
  const wd = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]!;
  const between = (lo: number, hi: number): number => Math.round((lo + rng() * (hi - lo)) * 100) / 100;
  const monthIdx = Number(month.slice(5));
  const mon3 = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][monthIdx - 1]!;

  for (const s of SUBSCRIPTIONS) if (s.day === dom) out.push({ date, desc: s.desc, amount: s.amount });
  if (date === paydayOf(month)) {
    out.push({ date, desc: `WAGES MT${monthIdx} ${month.slice(2, 4)}${month.slice(5)}${pad2(Math.max(1, dom - 6))}${pad2(5 + (hash(date) % 15))}`, amount: 2416.78 });
  }
  if (dom === 8) out.push({ date, desc: `RENT ${mon3}`, amount: -2500 });
  if (dom === 6 || dom === 7) if (dom === 6 + (hash(month) % 2)) out.push({ date, desc: 'VICTOR PRATS', amount: 614 });
  if (dom === 9 + (hash(`e${month}`) % 3)) out.push({ date, desc: 'EIMER RENT SHARE', amount: Math.round((600 + (hash(`s${month}`) % 70)) * 100) / 100 });
  // Adila pays a few days late; October's share has not arrived yet.
  if (dom === 12 && month === '2026-09') out.push({ date, desc: 'RENT', amount: 614 });
  if (dom === 28 || (dom === 27 && wd === 6)) out.push({ date, desc: `ACCOUNT FEE ${mon3} ${month.slice(2, 4)}`, amount: -6 });

  const weekend = wd === 0 || wd === 6;
  const nGroc = weekend ? Math.floor(rng() * 3) : 1 + Math.floor(rng() * 3);
  for (let i = 0; i < nGroc; i++) out.push({ date, desc: pick(POOLS.groceries), amount: -(rng() < 0.2 ? between(18, 42) : between(1.5, 14)) });
  if (rng() < 0.65) out.push({ date, desc: pick(POOLS.eating), amount: -between(3.5, 24) });
  if (rng() < 0.3) out.push({ date, desc: pick(POOLS.eating), amount: -between(8, 30) });
  if (!weekend && rng() < 0.55) out.push({ date, desc: pick(POOLS.coffee), amount: -between(3.2, 6.5) });
  if ((wd === 4 || wd === 5 || wd === 6) && rng() < 0.7) {
    for (let i = 0; i < 1 + Math.floor(rng() * 3); i++) out.push({ date, desc: pick(POOLS.bars), amount: -between(5, 24) });
  }
  if (rng() < 0.08) out.push({ date, desc: pick(POOLS.taxi), amount: -between(6, 24) });
  if (wd === 1 && rng() < 0.7) out.push({ date, desc: 'VDP-LEAP CARD APP', amount: -5 });
  if (rng() < 0.12) out.push({ date, desc: 'VDC-MAXOL SSTN MES', amount: -between(2.5, 30) }); // a merchant that still needs sorting
  if (rng() < 0.03) out.push({ date, desc: 'VDC-TESCO STORES 4', amount: between(1, 6) }); // a small refund
  return out;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Statement lines (BOOKED) then generated payments. Card payments from the last two days are PENDING. */
export function aibHistory(today: string): RawBankTx[] {
  const out: RawBankTx[] = [];
  const seq = new Map<string, number>();
  const push = (date: string, desc: string, amount: number, status: 'BOOKED' | 'PENDING'): void => {
    if (date > today) return;
    const key = `${date}|${desc}|${amount}`;
    const n = (seq.get(key) ?? 0) + 1;
    seq.set(key, n);
    out.push({
      providerTxId: `aib-${date.replaceAll('-', '')}-${hash(`${desc}|${amount}`).toString(36)}-${n}`,
      bookingDate: date,
      valueDate: date,
      amount: m2(amount),
      currency: 'EUR',
      rawDescriptor: desc,
      status,
    });
  };
  for (const [date, desc, amount] of DEMO_ROWS) push(date, desc, amount, 'BOOKED');
  const last = Math.min(diffDays(DEMO_STATEMENT_END, today), MAX_FILL_DAYS);
  for (let i = 1; i <= last; i++) {
    const date = addDays(DEMO_STATEMENT_END, i);
    for (const f of fillDay(date)) {
      const isCard = f.desc.startsWith('VDC-') || f.desc.startsWith('VDP-');
      push(date, f.desc, f.amount, isCard && diffDays(date, today) <= 1 ? 'PENDING' : 'BOOKED');
    }
  }
  return out;
}

/** Balance of the account today: closing balance of the statement plus everything generated since (pending included). */
export function aibBalance(today: string): string {
  const fill = aibHistory(today)
    .filter((t) => t.bookingDate > DEMO_STATEMENT_END)
    .reduce((a, t) => a.plus(t.amount), D(0));
  return m2(D(DEMO_CLOSING_BALANCE).plus(fill));
}

export { DEMO_DESCRIPTORS };
