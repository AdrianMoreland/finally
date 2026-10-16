import type { LedgerTx } from './ledger';
import { isSpendish } from './ledger';
import { D, Decimal, m2, sum } from './decimal';
import { addDays, addMonths, addMonthsToDate, lastPayday, monthOf } from './dates';

/* ------------------------------------------------------------------ periods */

export const CF_PERIODS = ['sincepay', 'thismonth', 'lastmonth', 'last3', 'ytd', 'last12'] as const;
export type CfPeriod = (typeof CF_PERIODS)[number];

export const CF_PERIOD_LABEL: Record<CfPeriod, string> = {
  sincepay: 'Since payday',
  thismonth: 'This month so far',
  lastmonth: 'Last month',
  last3: 'Last 3 months',
  ytd: 'This year',
  last12: 'Last 12 months',
};

const monthEnd = (m: string): string => `${m}-${String(new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0')}`;

/** Date range of a period. "Last 3 months" are the three full months before this one. */
export function cfRange(period: CfPeriod, today: string, paydayDay: number, weekendShift = true): { from: string; to: string } {
  const month = monthOf(today);
  switch (period) {
    case 'sincepay':
      return { from: lastPayday(today, paydayDay, weekendShift), to: today };
    case 'thismonth':
      return { from: `${month}-01`, to: today };
    case 'lastmonth': {
      const m = addMonths(month, -1);
      return { from: `${m}-01`, to: monthEnd(m) };
    }
    case 'last3':
      return { from: `${addMonths(month, -3)}-01`, to: monthEnd(addMonths(month, -1)) };
    case 'ytd':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case 'last12':
      return { from: addDays(addMonthsToDate(today, -12), 1), to: today };
  }
}

/* ------------------------------------------------------------------ model */

/** Groups on the Cash flow chart, with the (repo) category slugs each one holds. */
export const CF_GROUPS: ReadonlyArray<{ id: string; name: string; colour: string; cats: readonly string[] }> = [
  { id: 'home', name: 'Home', colour: '--c-rent', cats: ['rent', 'household'] },
  { id: 'bills', name: 'Bills & subscriptions', colour: '--c-bills', cats: ['bills', 'fees', 'subscriptions'] },
  { id: 'food', name: 'Food & drink', colour: '--c-groceries', cats: ['groceries', 'eating-out', 'coffee', 'bars'] },
  { id: 'move', name: 'Getting around', colour: '--c-transport', cats: ['transport', 'public-transport', 'taxi', 'fuel'] },
  { id: 'shop', name: 'Shopping & gifts', colour: '--c-shopping', cats: ['shopping', 'gifts'] },
  { id: 'fun', name: 'Fun & travel', colour: '--c-fun', cats: ['fun', 'travel'] },
  { id: 'other', name: 'Health & the rest', colour: '--c-other', cats: ['health', 'cash', 'other'] },
];

const COLOUR_SLUGS = new Set(['rent', 'groceries', 'eating-out', 'coffee', 'transport', 'bills', 'shopping', 'subscriptions', 'fun', 'other', 'travel']);

/** Children take their parent's colour; travel is its own. */
export function cfColourVar(slug: string | null, parentSlug: string | null): string {
  const root = slug === 'travel' ? 'travel' : (parentSlug ?? slug ?? 'other');
  return `--c-${COLOUR_SLUGS.has(root) ? root : 'other'}`;
}

export interface CfNode {
  id: string;
  name: string;
  /** CSS variable name, e.g. `--c-food`. */
  colour: string;
  /** Decimal string. */
  v: string;
  /** Rent that only passes through: shown in grey, never counted. */
  pass?: boolean;
}
export interface CfGroup extends CfNode {
  cats: CfNode[];
}

export interface CfItem {
  txId: string;
  /** Node keys the payment belongs to: `s:`, `g:` and `c:` prefixed. */
  keys: string[];
}

export interface Cashflow {
  from: string;
  to: string;
  income: string;
  spent: string;
  saved: string;
  paidBack: string;
  fromPots: string;
  fronted: string;
  back: string;
  out: string;
  inn: string;
  sources: CfNode[];
  groups: CfGroup[];
  items: CfItem[];
}

export interface CashflowOptions {
  /** Add the grey pass-through band for rent you fronted. */
  pass?: boolean;
  /** Category names by slug. */
  names: Readonly<Record<string, string>>;
  /** Which pot a payment moves money to or from, or null. */
  potOf?: (t: LedgerTx) => { id: string; name: string } | null;
  /** Who a payment pays back, or null. */
  personOf?: (t: LedgerTx) => string | null;
}

const MIN = D('0.5');
const EPS = D('0.005');

/**
 * Everything that came in on the left and where it went on the right. Your rent counts as your share; the fronted
 * part and housemates' repayments only pass through (never income, never spending). Payments left out of budgets
 * are included: this view shows everything.
 */
export function buildCashflow(txs: readonly LedgerTx[], range: { from: string; to: string }, opts: CashflowOptions): Cashflow {
  const inR = (t: LedgerTx): boolean => t.date >= range.from && t.date <= range.to;
  const rows = txs.filter(inR);
  const items: CfItem[] = [];

  const incomeBy = new Map<string, { name: string; v: Decimal }>();
  const spendBySlug = new Map<string, { v: Decimal; parent: string | null }>();
  const potNet = new Map<string, { name: string; v: Decimal }>();
  const personNet = new Map<string, Decimal>();
  const groupOf = (slug: string | null): string => (slug ? (CF_GROUPS.find((g) => g.cats.includes(slug))?.id ?? 'other') : 'unsorted');

  for (const t of rows) {
    const amt = D(t.amount);
    if (t.kind === 'SHARE' || t.kind === 'FRONT') {
      items.push({ txId: t.id, keys: ['s:pass', 'g:front'] });
      continue;
    }
    const pot = opts.potOf?.(t) ?? null;
    if (pot) {
      const cur = potNet.get(pot.id) ?? { name: pot.name, v: D(0) };
      potNet.set(pot.id, { name: pot.name, v: cur.v.minus(amt) });
      items.push({ txId: t.id, keys: amt.lt(0) ? ['g:saved', `c:pot:${pot.id}`] : ['s:frompots'] });
      continue;
    }
    const who = amt.lt(0) ? (opts.personOf?.(t) ?? null) : null;
    if (who) {
      personNet.set(who, (personNet.get(who) ?? D(0)).minus(amt));
      items.push({ txId: t.id, keys: ['g:payback', `c:who:${who}`] });
      continue;
    }
    if (t.kind === 'INCOME') {
      const k = t.merchantKey ?? t.merchantName;
      const cur = incomeBy.get(k) ?? { name: t.merchantName, v: D(0) };
      incomeBy.set(k, { name: cur.name, v: cur.v.plus(amt) });
      items.push({ txId: t.id, keys: [`s:inc:${k}`] });
      continue;
    }
    if (!isSpendish(t)) continue;
    const key = t.slug ?? 'unsorted';
    const cur = spendBySlug.get(key) ?? { v: D(0), parent: t.parentSlug };
    spendBySlug.set(key, { v: cur.v.minus(amt), parent: cur.parent });
    items.push({ txId: t.id, keys: [`g:${groupOf(t.slug)}`, `c:${key}`] });
  }

  const groups: CfGroup[] = [];
  for (const g of CF_GROUPS) {
    const cats: CfNode[] = g.cats
      .map((slug): CfNode => ({ id: slug, name: opts.names[slug] ?? slug, colour: cfColourVar(slug, spendBySlug.get(slug)?.parent ?? null), v: m2(Decimal.max(0, spendBySlug.get(slug)?.v ?? 0)) }))
      .filter((c) => D(c.v).gt(MIN));
    // Categories we did not list, rolled into "Health & the rest".
    if (g.id === 'other') {
      for (const [slug, e] of spendBySlug) {
        if (slug === 'unsorted' || CF_GROUPS.some((x) => x.cats.includes(slug)) || !e.v.gt(MIN)) continue;
        cats.push({ id: slug, name: opts.names[slug] ?? slug, colour: cfColourVar(slug, e.parent), v: m2(e.v) });
      }
    }
    cats.sort((a, b) => D(b.v).comparedTo(a.v));
    const v = sum(cats.map((c) => c.v));
    if (v.gt(MIN)) groups.push({ id: g.id, name: g.name, colour: g.colour, cats, v: m2(v) });
  }
  groups.sort((a, b) => D(b.v).comparedTo(a.v));
  const unsorted = spendBySlug.get('unsorted')?.v ?? D(0);
  if (unsorted.gt(MIN)) {
    const n: CfNode = { id: 'unsorted', name: 'Not sorted yet', colour: '--marker', v: m2(unsorted) };
    groups.push({ ...n, cats: [n] });
  }
  const spent = sum(groups.map((g) => g.v));

  const potEntries = [...potNet];
  const saved = sum(potEntries.filter(([, p]) => p.v.gt(0)).map(([, p]) => p.v));
  const fromPots = sum(potEntries.filter(([, p]) => p.v.lt(0)).map(([, p]) => p.v.neg()));
  const paidBack = sum([...personNet.values()].filter((v) => v.gt(0)));
  if (saved.gt(MIN)) {
    groups.push({
      id: 'saved',
      name: 'Set aside in pots',
      colour: '--brand',
      v: m2(saved),
      cats: potEntries
        .filter(([, p]) => p.v.gt(MIN))
        .map(([id, p]): CfNode => ({ id: `pot:${id}`, name: p.name, colour: '--brand', v: m2(p.v) }))
        .sort((a, b) => D(b.v).comparedTo(a.v)),
    });
  }
  if (paidBack.gt(MIN)) {
    groups.push({
      id: 'payback',
      name: 'Paid back to people',
      colour: '--c-eating-out',
      v: m2(paidBack),
      cats: [...personNet].filter(([, v]) => v.gt(0)).map(([who, v]): CfNode => ({ id: `who:${who}`, name: who, colour: '--c-eating-out', v: m2(v) })),
    });
  }

  const income = sum([...incomeBy.values()].map((e) => e.v));
  const sources: CfNode[] = [...incomeBy]
    .sort((a, b) => b[1].v.comparedTo(a[1].v))
    .map(([k, e]): CfNode => ({ id: `inc:${k}`, name: e.name, colour: '--brand', v: m2(e.v) }));
  if (fromPots.gt(MIN)) sources.push({ id: 'frompots', name: 'From your pots', colour: '--c-subscriptions', v: m2(fromPots) });

  const out = spent.plus(saved).plus(paidBack);
  const inn = income.plus(fromPots);
  if (inn.minus(out).gt(EPS)) groups.push({ id: 'left', name: 'Kept in your accounts', colour: '--ink-3', v: m2(inn.minus(out)), cats: [] });
  if (out.minus(inn).gt(EPS)) sources.push({ id: 'balance', name: 'From your balance', colour: '--warn', v: m2(out.minus(inn)) });

  const fronted = sum(rows.filter((t) => t.kind === 'FRONT').map((t) => D(t.amount).neg()));
  const back = sum(rows.filter((t) => t.kind === 'SHARE').map((t) => t.amount));
  if (opts.pass && fronted.gt(MIN)) {
    sources.push({ id: 'pass', name: "Flatmates' rent shares", colour: '--c-rent', v: m2(fronted), pass: true });
    groups.push({ id: 'front', name: 'Rent you fronted', colour: '--c-rent', v: m2(fronted), pass: true, cats: [] });
  }

  return {
    from: range.from,
    to: range.to,
    income: m2(income),
    spent: m2(spent),
    saved: m2(saved),
    paidBack: m2(paidBack),
    fromPots: m2(fromPots),
    fronted: m2(fronted),
    back: m2(back),
    out: m2(out),
    inn: m2(inn),
    sources,
    groups,
    items,
  };
}

/**
 * Groups under `share` of what went out are folded into one "Everything else" node when at least two qualify.
 * Set-aside, paid-back, kept and pass-through groups are never merged.
 */
export type CfShape = Pick<Cashflow, 'sources' | 'groups' | 'out' | 'inn'>;

export function mergeSmallGroups<T extends CfShape>(cf: T, share: number): T {
  const keep = new Set(['saved', 'payback', 'left', 'front']);
  const total = D(cf.out).isZero() ? D(1) : D(cf.out);
  const small = cf.groups.filter((g) => !keep.has(g.id) && D(g.v).div(total).lt(share));
  if (small.length < 2) return cf;
  const merged: CfGroup = { id: 'smallgroups', name: 'Everything else', colour: '--c-other', v: m2(sum(small.map((g) => g.v))), cats: small.flatMap((g) => g.cats) };
  const groups = cf.groups.filter((g) => !small.includes(g));
  const at = groups.findIndex((g) => keep.has(g.id));
  groups.splice(at < 0 ? groups.length : at, 0, merged);
  return { ...cf, groups };
}

/** Payment ids belonging to a node key (`s:…`, `g:…` or `c:…`). Everything when no key is chosen. */
export function cfPick(cf: Cashflow, key: string | null): Set<string> | null {
  if (!key) return null;
  return new Set(cf.items.filter((i) => i.keys.includes(key)).map((i) => i.txId));
}

/** What you kept before pots: `(income − spent) / income` as a whole-number percent, or null with no income. */
export function keptRate(cf: Pick<Cashflow, 'income' | 'spent'>): { pct: string; kept: string } | null {
  const inc = D(cf.income);
  if (inc.lte(0)) return null;
  const kept = inc.minus(cf.spent);
  return { pct: kept.div(inc).times(100).toFixed(0), kept: m2(kept) };
}
