import { addDays, addMonths, daysInMonth, dublinDate, monthOf } from '@finally/finance-core';
import type { Institution } from '@finally/contracts';
import type { BankAccountInfo, RawBankTx } from './bank-provider';

/** Deterministic PRNG so the same day always yields the same history. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

export interface MockAccount extends BankAccountInfo {
  /** Balance the account reports before live transactions are applied. */
  balance: string;
}

export const MOCK_ACCOUNTS: Record<Institution, MockAccount[]> = {
  AIB: [
    { providerAccountId: 'aib-current', name: 'AIB Current', ibanMasked: 'IE•• AIBK •••• 5678', currency: 'EUR', type: 'CURRENT', balance: '2184.36' },
  ],
  REVOLUT: [
    { providerAccountId: 'rev-eur', name: 'Revolut EUR', ibanMasked: 'IE•• REVO •••• 2410', currency: 'EUR', type: 'CURRENT', balance: '412.80' },
    { providerAccountId: 'rev-rainy', name: 'Rainy day vault', ibanMasked: null, currency: 'EUR', type: 'VAULT', balance: '1350.00' },
    { providerAccountId: 'rev-summer', name: 'Summer trip vault', ibanMasked: null, currency: 'EUR', type: 'VAULT', balance: '420.00' },
  ],
};

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const pad = (n: number): string => String(n).padStart(2, '0');
const fix = (n: number): string => n.toFixed(2);

interface Draft {
  account: string;
  day: number;
  amount: number;
  desc: string;
}

/** One calendar month of activity for one institution. `current` months only include days up to today. */
function monthDrafts(institution: Institution, month: string, isCurrent: boolean, monthsAgo: number): Draft[] {
  const rng = mulberry32(hash(`${institution}:${month}`));
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]!;
  const between = (lo: number, hi: number): number => Math.round((lo + rng() * (hi - lo)) * 100) / 100;
  const dayIn = (lo: number, hi: number): number => Math.floor(lo + rng() * (hi - lo + 1));
  const mon = MON[Number(month.slice(5)) - 1]!;
  const out: Draft[] = [];
  const add = (account: string, day: number, amount: number, desc: string): void => {
    out.push({ account, day: Math.min(day, daysInMonth(month)), amount, desc });
  };

  if (institution === 'AIB') {
    const a = 'aib-current';
    add(a, 1, -1100, `SO LANDLORD ${mon} RENT`);
    add(a, 28, 3150, 'ACME TECHNOLOGIES LTD SAL');
    add(a, 4, -18, 'D/D THREE IRELAND');
    add(a, 8, isCurrent ? -78 : -between(34, 42), 'D/D ELECTRIC IRELAND');
    add(a, 15, -62.1, 'D/D AVIVA INSURANCE');
    add(a, 20, -74.5, 'D/D VHI HEALTHCARE');
    add(a, 7, -300, 'TO REVOLUT 2410');
    const shops = ['VDP-TESCO STORES 3245 DUBLIN', 'VDP-LIDL RATHMINES', 'VDP-SUPERVALU RANELAGH', 'VDP-DUNNES STORES GRAFTON ST', 'VDP-ALDI 0231 DUBLIN', 'VDP-TESCO STORES 3112'];
    for (let i = 0; i < 7; i++) add(a, dayIn(1, 28), -between(12, 68), pick(shops));
    for (let i = 0; i < 3; i++) add(a, dayIn(2, 27), -23.9, `IRISH RAIL WEB ${dayIn(1000, 9999)}`);
    add(a, dayIn(3, 25), -between(8, 26), 'VDC-BOOTS PHARMACY 4452 DUBLIN');
    if (isCurrent) add(a, 10, -61.99, 'VDP-ARNOTTS LTD');
    else if (rng() < 0.7) add(a, dayIn(5, 24), -between(25, 90), pick(['VDP-ARNOTTS LTD', 'VDP-PENNEYS DUBLIN 1', 'VDP-ZARA GRAFTON ST']));
    if (monthsAgo === 2) add(a, 19, 24.99, 'VDP-ARNOTTS LTD REFUND');
  } else {
    const r = 'rev-eur';
    add(r, 7, 300, 'INCOMING SEPA AIB');
    add('rev-rainy', 9, 100, 'FROM REVOLUT EUR');
    add(r, 9, -100, 'TO RAINY DAY VAULT');
    add('rev-summer', 9, 50, 'FROM REVOLUT EUR');
    add(r, 9, -50, 'TO SUMMER TRIP VAULT');
    const coffee = ['VDC-TWO BOYS BREW', 'VDC-3FE GRAND CANAL', 'VDP-STARBUCKS DUBLIN'];
    for (let i = 0; i < 8; i++) add(r, dayIn(1, 28), -between(3.9, 5.1), pick(coffee));
    const bewleys = isCurrent ? [3, 14] : [dayIn(1, 9), dayIn(10, 18), dayIn(19, 27)];
    for (const d of bewleys) add(r, d, -4.2, 'VDC-BEWLEYS GRAFTON ST');
    for (let i = 0; i < 3; i++) add(r, dayIn(1, 28), -between(17, 32), pick(['DELIVEROO IE', 'DELIVEROO IE', 'JUST EAT']));
    add(r, dayIn(4, 26), -38.4, 'SQ *KIMCHI HOPHOUSE');
    add(r, dayIn(2, 25), -20, 'LEAP TOP UP 0023481');
    for (let i = 0; i < 2; i++) add(r, dayIn(1, 28), -between(8, 19), `BOLT.EU/O/${dayIn(2610000000, 2610999999)}`);
    add(r, 4, -14.99, 'NETFLIX.COM');
    add(r, 8, monthsAgo === 0 ? -12.99 : -11.99, 'SPOTIFY P2F9A1C');
    if (isCurrent) add(r, 9, -10.99, 'DISNEYPLUS.COM');
    for (let i = 0; i < (isCurrent ? 2 : 1 + (monthsAgo % 2)); i++) add(r, dayIn(1, 28), -27.5, 'SQ *THE BERNARD SHAW');
    if (monthsAgo <= 2) add(r, dayIn(5, 20), -19.99, 'PAYPAL *STEAMGAMES');
    add(r, dayIn(5, 25), -12.5, 'VDC-ODEON POINT SQUARE');
    if (monthsAgo <= 3) {
      for (let i = 0; i < 1 + (monthsAgo % 2); i++) add(r, dayIn(1, 28), -6.8, 'SUMUP *PHOENIX PARK CAFE');
      add(r, dayIn(1, 28), -4.8, 'VDP-KAPH DUBLIN 2');
      add(r, dayIn(1, 28), -12.4, 'SQ *BROTHER HUBBARD');
      if (monthsAgo <= 2) {
        add(r, dayIn(1, 28), -18.6, 'VDC-THE PALACE BAR');
        add(r, dayIn(1, 28), -31, 'SUMUP *WUFF');
        add(r, dayIn(1, 28), -25, 'VDP-SANDYMOUNT BARBER');
      }
      if (monthsAgo <= 1) {
        add(r, dayIn(1, 28), -42, 'VDC-ELY WINE BAR');
        add(r, dayIn(1, 28), -33.5, 'VDC-COBBLESTONE');
      }
    }
    if (monthsAgo === 1) add(r, 16, 24.99, 'AMAZON.CO.UK*2K4LP7T REFUND');
  }
  return out;
}

/** Six months of history for an institution, grouped by provider account id. Newest last. */
export function generateHistory(institution: Institution, today: string): Record<string, RawBankTx[]> {
  const result: Record<string, RawBankTx[]> = {};
  for (const acc of MOCK_ACCOUNTS[institution]) result[acc.providerAccountId] = [];
  const thisMonth = monthOf(today);
  const seq = new Map<string, number>();
  for (let monthsAgo = 5; monthsAgo >= 0; monthsAgo--) {
    const month = addMonths(thisMonth, -monthsAgo);
    const drafts = monthDrafts(institution, month, monthsAgo === 0, monthsAgo).sort((x, y) => x.day - y.day);
    for (const d of drafts) {
      const date = `${month}-${pad(d.day)}`;
      if (date > today) continue;
      const key = `${d.account}-${date}`;
      const n = (seq.get(key) ?? 0) + 1;
      seq.set(key, n);
      result[d.account]!.push({
        providerTxId: `mock-${d.account}-${date.replaceAll('-', '')}-${n}`,
        bookingDate: date,
        valueDate: date,
        amount: fix(d.amount),
        currency: 'EUR',
        rawDescriptor: d.desc,
        status: 'BOOKED',
      });
    }
  }
  return result;
}

interface LiveSeed {
  account: string;
  amount: number;
  desc: string;
}

/** Payments that "arrive" while the app is running; a mix of known and brand-new merchants. */
const LIVE_POOL: Record<Institution, LiveSeed[]> = {
  AIB: [
    { account: 'aib-current', amount: -23.4, desc: 'VDP-TESCO STORES 3245 DUBLIN' },
    { account: 'aib-current', amount: -9.6, desc: 'VDP-SPAR CAMDEN ST' },
    { account: 'aib-current', amount: -37.2, desc: 'VDP-HODGES FIGGIS DUBLIN' },
    { account: 'aib-current', amount: -15.8, desc: 'VDC-LA CAVE WINE SHOP' },
    { account: 'aib-current', amount: -52, desc: 'VDP-AVOCA RATHCOOLE' },
    { account: 'aib-current', amount: -11.25, desc: 'VDP-CENTRA TERENURE' },
    { account: 'aib-current', amount: -28.9, desc: 'VDC-DUBLIN BUS 0442' },
    { account: 'aib-current', amount: -6.4, desc: 'VDP-O BRIENS SANDWICH BAR' },
  ],
  REVOLUT: [
    { account: 'rev-eur', amount: -3.9, desc: 'VDC-INSOMNIA COFFEE' },
    { account: 'rev-eur', amount: -29, desc: 'VDC-GALLAGHERS BOXTY HOUSE' },
    { account: 'rev-eur', amount: -8.4, desc: 'SQ *FUMBALLY STABLES' },
    { account: 'rev-eur', amount: -4.5, desc: 'VDC-TWO BOYS BREW' },
    { account: 'rev-eur', amount: -17.6, desc: 'SQ *LITTLE MUSEUM OF CURIOSITIES' },
    { account: 'rev-eur', amount: -12.99, desc: 'APPLE.COM/BILL' },
    { account: 'rev-eur', amount: -21.5, desc: 'BOLT.EU/O/2610112233' },
    { account: 'rev-eur', amount: -7.2, desc: 'SUMUP *GRAFTON ST FLOWERS' },
    { account: 'rev-eur', amount: -5.1, desc: 'VDC-BEWLEYS GRAFTON ST' },
  ],
};

/** The first `count` live payments, dated today. IDs are stable so repeated syncs never duplicate. */
export function generateLive(institution: Institution, today: string, count: number): Record<string, RawBankTx[]> {
  const out: Record<string, RawBankTx[]> = {};
  const pool = LIVE_POOL[institution];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const p = pool[i]!;
    (out[p.account] ??= []).push({
      providerTxId: `mock-live-${institution}-${today.replaceAll('-', '')}-${i}`,
      bookingDate: today,
      valueDate: today,
      amount: fix(p.amount),
      currency: 'EUR',
      rawDescriptor: p.desc,
      status: i % 4 === 3 ? 'PENDING' : 'BOOKED',
    });
  }
  return out;
}

/** 0–3 new payments per sync, deterministic in the sync number. */
export const liveArrivals = (syncNumber: number): number => hash(`arrivals:${syncNumber}`) % 4;

export const todayDublin = (): string => dublinDate(new Date());
export { addDays };
