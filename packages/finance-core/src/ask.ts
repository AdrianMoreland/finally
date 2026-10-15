import { addDays, addMonthsToDate, daysInMonth, diffDays, monthOf, weekStart } from './dates';
import type { Decimal} from './decimal';
import { D, sum } from './decimal';
import { spendList, spent, type LedgerTx } from './ledger';
import { eur, eur0 } from './types';

/**
 * Ask: understand a typed question without any AI. A rules parser turns it into a small structured query
 * ("Read as" chips the user can edit), and a pure evaluator answers spending questions from the ledger. It copes with
 * follow-ups ("and September?") and the commonest Spanish and French words.
 */

export interface Period {
  from: string;
  to: string;
  label: string;
  key: string;
}

export type Intent =
  | 'sum' | 'count' | 'average' | 'list' | 'top' | 'compare' | 'biggest'
  | 'gloss' | 'price' | 'news' | 'vault' | 'owed' | 'debt' | 'afford' | 'safe' | 'networth' | 'runway'
  | 'upcoming' | 'subs' | 'income' | 'budget' | 'balance';

export const SPEND_INTENTS: readonly Intent[] = ['sum', 'count', 'average', 'list', 'top', 'compare', 'biggest'];

export interface ParsedQuery {
  text: string;
  via: 'rules' | 'follow-up' | 'learned';
  intent: Intent;
  slug?: string | null;
  merchantKey?: string | null;
  institution?: 'AIB' | 'REVOLUT' | null;
  min?: number | null;
  max?: number | null;
  period?: Period;
  period2?: Period;
  periodExplicit?: boolean;
  by?: 'cat' | 'mer';
  personId?: string | null;
  term?: string;
  sym?: string;
  topic?: string;
  amount?: number | null;
  item?: string;
}

export interface UnknownQuery {
  text: string;
  unknown: true;
  suggestions: string[];
}

export interface AskContext {
  today: string;
  lastPayday: string;
  dataStart: string;
  merchants: ReadonlyArray<{ key: string; name: string; aliases: readonly string[]; share?: boolean }>;
  categories: ReadonlyArray<{ slug: string; name: string }>;
  people: ReadonlyArray<{ id: string; name: string }>;
}

/* ----------------------------------------------------------------- language */

export const norm = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/(\d),(\d{2})\b/g, '$1.$2')
    .replace(/[?!,;:¿¡]/g, ' ')
    .replace(/\.(?!\d)/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const reEsc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&');
const has = (t: string, re: RegExp): boolean => re.test(t);
const wordRe = (p: string): RegExp => new RegExp(`\\b${reEsc(p)}\\b`);

const CAT_WORDS: Array<[string, string[]]> = [
  ['coffee', ['coffee', 'coffees', 'cafe', 'cafes', 'latte', 'lattes', 'flat white', 'flat whites', 'cappuccino', 'cappuccinos', 'espresso', 'cafecito']],
  ['groceries', ['grocery', 'groceries', 'supermarket', 'supermarkets', 'food shop', 'food shopping', 'food shops', 'big shop', 'supermercado', 'supermercados', 'la compra', 'courses', 'supermarche', 'epicerie']],
  ['eating-out', ['eating out', 'restaurant', 'restaurants', 'takeaway', 'takeaways', 'food delivery', 'deliveries', 'dinner out', 'lunch out', 'dining', 'restaurante', 'restaurantes', 'comer fuera', 'comida a domicilio', 'livraison', 'livraisons', 'resto', 'restos']],
  ['taxi', ['taxi', 'taxis', 'cab', 'cabs', 'ubers', 'uber']],
  ['public-transport', ['bus', 'buses', 'luas', 'dart', 'public transport', 'autobus', 'transporte publico', 'transports en commun']],
  ['transport', ['transport', 'commute', 'commuting', 'getting around', 'transporte', 'transports']],
  ['travel', ['travel', 'trip', 'trips', 'holiday', 'holidays', 'flights', 'trains', 'train', 'viaje', 'viajes', 'vuelos', 'voyage', 'voyages', 'vols']],
  ['bills', ['bill', 'bills', 'electricity', 'power bill', 'wifi', 'wi fi', 'internet', 'broadband', 'phone bill', 'phone credit', 'utilities', 'facturas', 'factura', 'luz', 'factures', 'facture', 'electricite']],
  ['subscriptions', ['subscription', 'subscriptions', 'streaming', 'suscripciones', 'suscripcion', 'abonnements', 'abonnement']],
  ['shopping', ['shopping', 'clothes', 'clothing', 'ropa', 'compras', 'vetements', 'achats']],
  ['bars', ['pub', 'pubs', 'pint', 'pints', 'drinks', 'bar', 'bars', 'bares', 'beer', 'beers', 'copas', 'cerveza', 'cervezas', 'biere', 'bieres']],
  ['fun', ['fun', 'going out', 'nights out', 'night out', 'cinema', 'gigs', 'gig', 'games', 'gaming', 'tickets', 'concerts', 'ocio', 'salir', 'sorties', 'soirees', 'cine']],
  ['fees', ['bank fees', 'bank charges', 'fees', 'overdraft', 'interest charged']],
  ['cash', ['cash', 'atm', 'cash withdrawals', 'withdrawals', 'efectivo', 'retiros']],
  ['health', ['pharmacy', 'pharmacies', 'chemist', 'health', 'medicine', 'farmacia', 'pharmacie']],
  ['rent', ['rent', 'alquiler', 'loyer']],
];
const CATSYN: Array<[string, string]> = CAT_WORDS.flatMap(([k, arr]) => arr.map((p): [string, string] => [p, k])).sort((a, b) => b[0].length - a[0].length);
const findCat = (t: string): string | null => CATSYN.find(([p]) => wordRe(p).test(t))?.[1] ?? null;

const MONTHS = [
  ['january', 'jan', 'enero', 'janvier'], ['february', 'feb', 'febrero', 'fevrier'], ['march', 'marzo', 'mars'],
  ['april', 'apr', 'abril', 'avril'], ['may', 'mayo', 'mai'], ['june', 'jun', 'junio', 'juin'], ['july', 'jul', 'julio', 'juillet'],
  ['august', 'aug', 'agosto', 'aout'], ['september', 'sept', 'sep', 'septiembre', 'setiembre', 'septembre'],
  ['october', 'oct', 'octubre', 'octobre'], ['november', 'nov', 'noviembre', 'novembre'], ['december', 'dec', 'diciembre', 'decembre'],
];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const dl = (s: string): string => `${Number(s.slice(8))} ${MON3[Number(s.slice(5, 7)) - 1]}`;
export const dlY = (s: string): string => `${dl(s)} ${s.slice(0, 4)}`;
const rng = (a: string, b: string): string => (a === b ? dl(a) : `${dl(a)} to ${dl(b)}`);
const lc = (s: string): string => (MONTH_NAMES.some((m) => s.startsWith(m)) ? `in ${s}` : `${s[0]!.toLowerCase()}${s.slice(1)}`);

const NUMW: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

/* ------------------------------------------------------------------ periods */

function periods(ctx: AskContext) {
  const today = ctx.today;
  const monthFrom = `${monthOf(today)}-01`;
  const wk = weekStart(today);
  const curY = Number(today.slice(0, 4));
  const curMi = Number(today.slice(5, 7)) - 1;
  const rangeOfMonth = (mi: number): Period => {
    const y = mi > curMi ? curY - 1 : curY;
    const m = `${y}-${String(mi + 1).padStart(2, '0')}`;
    let to = `${m}-${String(daysInMonth(m)).padStart(2, '0')}`;
    if (to > today) to = today;
    return { from: `${m}-01`, to, label: MONTH_NAMES[mi]! + (y !== curY ? ` ${y}` : ''), key: `m${mi}` };
  };
  const summerYear = today >= `${curY}-06-01` ? curY : curY - 1;
  const PER: Record<string, () => Period> = {
    today: () => ({ from: today, to: today, label: 'Today', key: 'today' }),
    yesterday: () => ({ from: addDays(today, -1), to: addDays(today, -1), label: 'Yesterday', key: 'yesterday' }),
    thisweek: () => ({ from: wk, to: today, label: 'This week', key: 'thisweek' }),
    lastweek: () => ({ from: addDays(wk, -7), to: addDays(wk, -1), label: 'Last week', key: 'lastweek' }),
    thismonth: () => ({ from: monthFrom, to: today, label: 'This month', key: 'thismonth' }),
    lastmonth: () => ({ from: addMonthsToDate(monthFrom, -1), to: addDays(monthFrom, -1), label: 'Last month', key: 'lastmonth' }),
    last30: () => ({ from: addDays(today, -29), to: today, label: 'Last 30 days', key: 'last30' }),
    sincepay: () => ({ from: ctx.lastPayday, to: today, label: 'Since payday', key: 'sincepay' }),
    summer: () => ({ from: `${summerYear}-06-01`, to: `${summerYear}-08-31` > today ? today : `${summerYear}-08-31`, label: summerYear === curY ? 'This summer' : `Summer ${summerYear}`, key: 'summer' }),
    thisyear: () => ({ from: `${curY}-01-01`, to: today, label: 'This year', key: 'thisyear' }),
    all: () => ({ from: ctx.dataStart, to: today, label: `Since ${MON3[Number(ctx.dataStart.slice(5, 7)) - 1]} ${ctx.dataStart.slice(0, 4)}`, key: 'all' }),
  };
  return { PER, rangeOfMonth };
}

/** Choices offered by the "Read as" period picker. */
export function periodOptions(ctx: AskContext): Array<{ key: string; label: string }> {
  const { PER, rangeOfMonth } = periods(ctx);
  const base = ['today', 'yesterday', 'thisweek', 'lastweek', 'thismonth', 'lastmonth', 'last30', 'sincepay', 'summer'].map((k) => ({ key: k, label: PER[k]!().label }));
  const curMi = Number(ctx.today.slice(5, 7)) - 1;
  const months = [5, 4, 3, 2, 1, 0].map((k) => {
    const mi = (curMi - k + 12) % 12;
    return { key: `m${mi}`, label: rangeOfMonth(mi).label };
  });
  return [...base, ...months, { key: 'all', label: PER.all!().label }];
}

export function periodByKey(ctx: AskContext, key: string): Period {
  const { PER, rangeOfMonth } = periods(ctx);
  return /^m\d+$/.test(key) ? rangeOfMonth(Number(key.slice(1))) : (PER[key] ?? PER.thismonth!)();
}

function parsePeriod(t0: string, ctx: AskContext): Period[] {
  const { PER, rangeOfMonth } = periods(ctx);
  const today = ctx.today;
  const t = t0.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/g, (w) => String(NUMW[w]));
  const found: Period[] = [];
  const mm = t.match(/\b(?:last|past) (\d+) (day|days|week|weeks|month|months)\b/);
  if (mm) {
    const n = Number(mm[1]);
    const u = mm[2]![0]!;
    const from = u === 'd' ? addDays(today, -(n - 1)) : u === 'w' ? addDays(today, -n * 7 + 1) : addDays(addMonthsToDate(today, -n), 1);
    found.push({ from, to: today, label: `Last ${n} ${mm[2]}`, key: 'custom' });
  }
  if (has(t, /\btoday\b|\bhoy\b|\baujourdhui\b/)) found.push(PER.today!());
  if (has(t, /\byesterday\b|\bayer\b|\bhier\b/)) found.push(PER.yesterday!());
  if (has(t, /\bthis week\b|\besta semana\b|\bcette semaine\b/)) found.push(PER.thisweek!());
  if (has(t, /\b(last|past|previous) week\b|\bsemana pasada\b|\bsemaine derniere\b/)) found.push(PER.lastweek!());
  if (has(t, /\b(this|current) month\b|\beste mes\b|\bce mois\b/)) found.push(PER.thismonth!());
  if (has(t, /\b(last|previous) month\b|\bmes pasado\b|\bmois dernier\b/)) found.push(PER.lastmonth!());
  if (has(t, /\bsince (payday|i got paid|i was paid)\b/)) found.push(PER.sincepay!());
  if (has(t, /\bsummer\b|\bverano\b|\bete\b/)) found.push(PER.summer!());
  if (has(t, /\b(this year|so far this year)\b|\beste ano\b|\bcette annee\b/)) found.push(PER.thisyear!());
  if (has(t, /\b(all time|ever|in total|since the start)\b/)) found.push(PER.all!());
  const since = t.match(/\bsince (january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|apr|jun|jul|aug|sept|sep|oct|nov|dec)\b/);
  if (since) {
    const mi = MONTHS.findIndex((a) => a.includes(since[1]!));
    found.push({ from: rangeOfMonth(mi).from, to: today, label: `Since ${MONTH_NAMES[mi]}`, key: 'custom' });
  }
  const months: Array<{ mi: number; at: number }> = [];
  MONTHS.forEach((alts, mi) =>
    alts.forEach((a) => {
      const re = a === 'may' ? /\b(in|during) may\b/g : a === 'mai' ? /\ben mai\b/g : new RegExp(`\\b${a}\\b`, 'g');
      let m: RegExpExecArray | null;
      while ((m = re.exec(t))) {
        if (since && since.index! <= m.index && m.index < since.index! + since[0].length) continue;
        months.push({ mi, at: m.index });
      }
    }),
  );
  months.sort((a, b) => a.at - b.at);
  const uniq: typeof months = [];
  for (const m of months) if (!uniq.some((u) => u.mi === m.mi)) uniq.push(m);
  for (const m of uniq) found.push(rangeOfMonth(m.mi));
  return found;
}

export function previousPeriod(p: Period, today: string): Period {
  if (p.key === 'thismonth') {
    const prevMonth = addMonthsToDate(`${monthOf(today)}-01`, -1).slice(0, 7);
    const day = Math.min(Number(today.slice(8)), daysInMonth(prevMonth));
    return { from: `${prevMonth}-01`, to: `${prevMonth}-${String(day).padStart(2, '0')}`, label: 'Same days last month', key: 'custom' };
  }
  const len = diffDays(p.from, p.to);
  return { from: addDays(p.from, -len - 1), to: addDays(p.from, -1), label: 'The period before', key: 'custom' };
}

/* ----------------------------------------------------------------- glossary */

export const GLOSSARY: Record<string, [string, string]> = {
  'deemed disposal': ['Deemed disposal', 'Every 8 years, Revenue treats an ETF or fund holding as sold and taxes the gain at the exit-tax rate, even if you keep it. The tax paid counts against the final sale. It doesn\'t apply inside the new Investment Account.'],
  'exit tax': ['Exit tax', 'The tax on gains and income from Irish and EU funds and ETFs: 38% in 2026, falling to 35% from 1 January 2027. No yearly exemption, and losses can\'t be set against other gains.'],
  dirt: ['DIRT', 'Deposit Interest Retention Tax: 33% of the interest on savings accounts in Ireland, usually taken by the bank before you see it.'],
  'rent tax credit': ['Rent Tax Credit', 'A tax credit for renters: €1,000 for 2026 and €1,150 from 2027. Your share of the rent is well over the €417 a month the full credit needs, if your tenancy qualifies. Claim it in Revenue myAccount; earlier years can be claimed too.'],
  'investment account': ['Investment Account', 'A new account from 1 July 2027: no tax on the first €50,000 of value, 1% a year on the value above that, no CGT, exit tax or deemed disposal inside it, and up to €12,000 paid in each year. The provider handles the tax.'],
  cgt: ['Capital gains tax', 'Tax on gains when you sell shares, gold or crypto: 31% for sales from 7 October 2026 (was 33%). The first €1,270 of gains each year is exempt. Pay by 15 December for January to November sales, by 31 January for December ones.'],
  etf: ['ETF', 'Exchange-traded fund: one share that holds a basket of investments, like the S&P 500 or the whole world market. In Ireland most are taxed under exit tax, not CGT.'],
  's p 500': ['S&P 500', 'An index of 500 large US companies. EU retail investors usually buy it through an Irish-domiciled UCITS ETF such as CSPX, which falls under exit tax.'],
  ucits: ['UCITS', 'An EU rulebook for funds. UCITS ETFs are the ones EU retail investors can buy; US-domiciled ETFs generally aren\'t available to you.'],
  usc: ['USC', 'Universal Social Charge, charged on income in bands of 0.5%, 2%, 3% and 8%. On €40,000 it\'s about €733 a year at 2026 rates.'],
  prsi: ['PRSI', 'Pay Related Social Insurance. Employees pay 4.2% until 30 September 2026 and 4.35% from 1 October 2026.'],
  'emergency tax': ['Emergency tax', 'Charged when your employer doesn\'t have your tax credits from Revenue yet. You overpay until it\'s fixed; the extra comes back through payroll once Revenue sends your details.'],
  dca: ['Investing a fixed amount on a schedule', 'Putting the same amount in every payday, whatever the price. It takes away the urge to time the market.'],
  rebalance: ['Rebalancing', 'Bringing your mix back to target, usually by steering new money into whatever is below its target rather than selling.'],
  'safe to spend': ['Safe to spend', 'The lower of two numbers: what\'s left in your flexible budgets, and your balance minus bills before payday and a buffer. Divided by the days until payday.'],
  runway: ['Runway', 'How many months your rainy-day pot would cover your essentials if your pay stopped.'],
};
const GLOSS_AL: Array<[string, string]> = [
  ['deemed disposal', 'deemed disposal'], ['exit tax', 'exit tax'], ['dirt', 'dirt'], ['rent tax credit', 'rent tax credit'], ['rent credit', 'rent tax credit'],
  ['investment account', 'investment account'], ['capital gains', 'cgt'], ['cgt', 'cgt'], ['etf', 'etf'], ['etfs', 'etf'], ['s p 500', 's p 500'],
  ['sp500', 's p 500'], ['ucits', 'ucits'], ['usc', 'usc'], ['prsi', 'prsi'], ['emergency tax', 'emergency tax'], ['dollar cost', 'dca'],
  ['dca', 'dca'], ['rebalance', 'rebalance'], ['rebalancing', 'rebalance'], ['safe to spend', 'safe to spend'], ['runway', 'runway'],
];

/* ------------------------------------------------------------------- parser */

export function parseQuestion(raw: string, ctx: AskContext, learned: Readonly<Record<string, string>> = {}): ParsedQuery | UnknownQuery | null {
  const t0 = norm(raw);
  if (!t0) return null;
  if (learned[t0]) {
    const q = parseQuestion(learned[t0]!, ctx);
    if (q && !('unknown' in q)) return { ...q, via: 'learned', text: raw };
    return q;
  }
  const t = t0.replace(/s&p/g, 's p').replace(/\bs and p\b/g, 's p');
  const aliases = ctx.merchants
    .flatMap((m) => m.aliases.map((a): [string, string] => [a, m.key]))
    .sort((a, b) => b[0].length - a[0].length);
  const mer = aliases.find(([a]) => wordRe(a).test(t))?.[1] ?? null;
  const cat = findCat(t);
  const person = ctx.people.find((d) => wordRe(norm(d.name)).test(t))?.id ?? null;
  const per = parsePeriod(t, ctx);
  const { PER } = periods(ctx);
  const q: Partial<ParsedQuery> & { text: string } = { text: raw, via: 'rules' };
  if (mer) q.merchantKey = mer;
  if (cat) q.slug = cat;
  if (has(t, /\baib\b/)) q.institution = 'AIB';
  else if (has(t, /\brevolut\b/)) q.institution = 'REVOLUT';
  const over = t.match(/\b(?:over|above|more than|greater than|bigger than|mas de|plus de)\s*€?\s*(\d+(?:\.\d+)?)/);
  if (over) q.min = Number(over[1]);
  const under = t.match(/\b(?:under|below|less than|smaller than|menos de|moins de)\s*€?\s*(\d+(?:\.\d+)?)/);
  if (under) q.max = Number(under[1]);
  q.periodExplicit = per.length > 0;
  const glossKey = GLOSS_AL.find(([a]) => wordRe(a).test(t))?.[1];
  const amtM = raw.match(/€\s*(\d[\d,]*(?:\.\d+)?)/) ?? t.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:euro|euros|eur|quid)\b/) ?? t.match(/\b(\d{2,6})\b/);

  let intent: Intent | null = null;
  if (glossKey && has(t, /\b(what|whats|explain|define|meaning|how does|how do|tell me about|is|que es|quest ce)\b/) && !has(t, /\b(spent|spend|my)\b/)) {
    intent = 'gloss';
    q.term = glossKey;
  } else if (has(t, /\bmy (gold|silver|metal|metals|vault)\b/)) intent = 'vault';
  else if (has(t, /\b(price|value|worth|trading at|how much is|precio|prix)\b/) && has(t, /\b(gold|silver|vwce|cspx|eimi|s p 500|sp500|oro|or)\b/)) {
    intent = 'price';
    q.sym = has(t, /silver/) ? 'SILVER' : has(t, /vwce|world/) ? 'VWCE' : has(t, /cspx|s p 500|sp500/) ? 'CSPX' : has(t, /eimi/) ? 'EIMI' : 'GOLD';
  } else if (has(t, /\bnews\b|\bheadlines\b|\bwhy is\b.*\b(up|down)\b/)) {
    intent = 'news';
    q.topic = has(t, /gold/) ? 'gold' : has(t, /s p 500|cspx|stock/) ? 'S&P 500' : 'markets';
  } else if (has(t, /\bowes? me\b|\bowed to me\b|\bwho owes\b|\bme debe\b|\bme doit\b/)) intent = 'owed';
  else if (has(t, /\b(owe|owed|debt|debts|pay back|paying back|paid back|debo|deuda|deudas|dois|dette|dettes)\b/) || person) {
    intent = 'debt';
    q.personId = person;
  } else if (has(t, /\bafford\b|\bcan i buy\b|\bpuedo permitirme\b|\bpuedo comprar\b/)) {
    intent = 'afford';
    q.amount = amtM ? Number(String(amtM[1]).replace(/,/g, '')) : null;
    q.item = ((raw.match(/(?:afford|buy|comprar)\s+(?:a |an |the |some |un |una )?(.+?)(?:\?|$)/i) ?? [])[1] ?? '').replace(/€\s*[\d,.]+\s*/, '').replace(/\b(for|at)\s*$/, '').trim();
  } else if (has(t, /\bsafe to spend\b|\bhow much can i spend\b|\bcan i spend today\b/)) intent = 'safe';
  else if (has(t, /\bnet worth\b|\bhow much am i worth\b/)) intent = 'networth';
  else if (has(t, /\b(runway|rainy day|emergency fund)\b/)) intent = 'runway';
  else if (has(t, /\b(next bill|bills due|upcoming|due soon|whats due|what is due|coming out)\b/)) intent = 'upcoming';
  else if (has(t, /\b(what|which|list|my) subscriptions\b|\bsubscriptions do i\b/)) intent = 'subs';
  else if (has(t, /\b(earn|earned|earning|income|salary|sueldo|salario|salaire)\b/) || (has(t, /\bgot paid\b/) && !has(t, /\bsince\b/))) intent = 'income';
  else if (has(t, /\bbudget\b|\bpresupuesto\b/) || (has(t, /\b(left|remaining)\b/) && cat)) intent = 'budget';
  else if (has(t, /\b(balance|balances|in my accounts?|how much (money )?do i have)\b/)) intent = 'balance';
  else if (has(t, /\b(left|remaining)\b/)) intent = 'budget';
  else if (has(t, /\b(biggest|largest|most expensive)\b.*\b(payment|payments|purchase|purchases|transactions?|spends?)\b/)) intent = 'biggest';
  else if (has(t, /\b(top|biggest|most|where|donde|ou va)\b/) && !has(t, /\bhow much\b/)) {
    intent = 'top';
    q.by = has(t, /\bcategor|\bwhere\b|\bdonde\b|\bou va\b/) ? 'cat' : 'mer';
  } else if (has(t, /\b(compare|compared|vs|versus)\b|\b(more|less) than (last|in)\b|\bthan last\b/)) intent = 'compare';
  else if (has(t, /\bhow many\b|\bhow often\b|\bnumber of\b|\btimes\b|\bcuantas veces\b|\bcombien de fois\b/)) intent = 'count';
  else if (has(t, /\baverage\b|\bavg\b|\bper week\b|\ba week\b|\bper day\b|\ba day\b|\bpromedio\b|\bmoyenne\b/)) intent = 'average';
  else if (has(t, /\b(show|list|which|what did i buy|see)\b/)) intent = 'list';
  else if (has(t, /\b(how much|spent|spend|spending|cost|total|cuanto|cuanta|gaste|gastado|gasto|combien|depense|depenses)\b/)) intent = 'sum';
  else if (cat || mer) intent = 'sum';
  else if (glossKey) {
    intent = 'gloss';
    q.term = glossKey;
  }
  if (!intent) return { text: raw, unknown: true, suggestions: fallbackSuggestions(t) };
  const out = { ...q, intent } as ParsedQuery;
  if (intent === 'income') out.period = per[0] ?? PER.all!();
  if ((SPEND_INTENTS as readonly string[]).includes(intent)) {
    out.period = per[0] ?? PER.thismonth!();
    if (intent === 'compare') out.period2 = per[1] ?? previousPeriod(out.period, ctx.today);
  }
  return out;
}

/** "and September?" or "what about taxis?" reuse the last spending question with one thing changed. */
export function followUpQuestion(raw: string, cur: ParsedQuery | null, ctx: AskContext): ParsedQuery | null {
  if (!cur || !(SPEND_INTENTS as readonly string[]).includes(cur.intent)) return null;
  const t = norm(raw);
  const lead = /^(and|what about|how about|same for|y|y en|et|et en)\b/.test(t);
  if (!lead && t.split(' ').length > 3) return null;
  const per = parsePeriod(t, ctx);
  const cat = findCat(t);
  const aliases = ctx.merchants.flatMap((m) => m.aliases.map((a): [string, string] => [a, m.key])).sort((a, b) => b[0].length - a[0].length);
  const mer = aliases.find(([a]) => wordRe(a).test(t))?.[1] ?? null;
  if (!per.length && !cat && !mer) return null;
  const q: ParsedQuery = { ...cur, text: raw, via: 'follow-up' };
  if (per.length) {
    q.period = per[0]!;
    q.periodExplicit = true;
    if (q.intent === 'compare') q.period2 = per[1] ?? previousPeriod(q.period, ctx.today);
  }
  if (mer) {
    q.merchantKey = mer;
    q.slug = null;
  } else if (cat) {
    q.slug = cat;
    q.merchantKey = null;
  }
  return q;
}

export function fallbackSuggestions(t: string): string[] {
  const out: string[] = [];
  if (/spen|cost|paid|pay|gast|depens/.test(t)) out.push('How much did I spend this month?');
  if (/save|saving|rainy|emergency/.test(t)) out.push('How long is my runway?');
  if (/ok|okay|doing|track|going/.test(t)) out.push('How much is left in my budget?');
  for (const s of ['How much did I spend this month?', "What's safe to spend today?", 'Where does my money go?']) if (!out.includes(s)) out.push(s);
  return out.slice(0, 3);
}

/* ---------------------------------------------------------------- evaluator */

export interface AnswerRow {
  label: string;
  value: string;
}

export interface Answer {
  /** rules = from your data on this server; help = glossary; public = a public price or headline (only a symbol or topic was sent). */
  tier: 'rules' | 'help' | 'public';
  sent: string;
  big: string;
  short: string;
  text: string;
  rows?: AnswerRow[];
  /** Unsorted payments that might change this answer. */
  hint?: { count: number; names: string[]; slug: string };
  action?: { label: string; to: string; extra?: Record<string, unknown> };
  trend?: { slug: string | null; merchantKey: string | null } | null;
  count?: number;
}

export interface SpendNames {
  category: (slug: string) => string;
  merchant: (key: string) => string;
  /** Merchant keys of housemates whose payments are rent shares. */
  shareMerchants: ReadonlySet<string>;
}

const scopeName = (q: ParsedQuery, n: SpendNames): string =>
  q.merchantKey ? n.merchant(q.merchantKey) : q.slug ? n.category(q.slug) : 'All spending';

/** Answer a spending question from the ledger. */
export function answerSpend(q: ParsedQuery, txs: readonly LedgerTx[], n: SpendNames, unsortedNames: (slug: string, from: string, to: string) => string[]): Answer {
  const r: Answer = { tier: 'rules', sent: 'nothing', big: '', short: '', text: '' };
  const p = q.period!;
  const f = { from: p.from, to: p.to, slug: q.merchantKey ? null : q.slug, merchantKey: q.merchantKey, institution: q.institution, min: q.min, max: q.max };
  const hint = (): void => {
    if (!q.slug || q.merchantKey) return;
    const names = unsortedNames(q.slug, p.from, p.to);
    if (names.length) r.hint = { count: names.length, names: [...new Set(names)].slice(0, 2), slug: q.slug };
  };
  if (q.intent === 'compare') {
    const p2 = q.period2!;
    const base = { slug: f.slug, merchantKey: f.merchantKey, institution: f.institution };
    const a = spent(txs, { ...base, from: p.from, to: p.to });
    const b = spent(txs, { ...base, from: p2.from, to: p2.to });
    const d = a.minus(b);
    r.big = `${d.gte(0) ? '+' : '−'}€${d.abs().toFixed(2)}`;
    r.short = `${scopeName(q, n)} vs before`;
    r.text = `${scopeName(q, n)}: ${eur(a.toFixed(2))} ${lc(p.label)} (${rng(p.from, p.to)}) vs ${eur(b.toFixed(2))} ${lc(p2.label)} (${rng(p2.from, p2.to)})${b.gt(0) ? `, ${d.gte(0) ? '+' : '−'}${Math.round(d.abs().div(b).times(100).toNumber())}%.` : '.'}`;
    r.trend = q.slug || q.merchantKey ? { slug: q.slug ?? null, merchantKey: q.merchantKey ?? null } : null;
    hint();
    return r;
  }
  let list = spendList(txs, f);
  r.trend = q.slug || q.merchantKey ? { slug: q.slug ?? null, merchantKey: q.merchantKey ?? null } : null;
  if (q.merchantKey && n.shareMerchants.has(q.merchantKey) && ['sum', 'count', 'list', 'average'].includes(q.intent)) {
    const got = sum(list.map((t) => t.amount));
    const who = n.merchant(q.merchantKey).split(' ·')[0]!;
    r.big = eur(got.toFixed(2));
    r.short = `${who} paid you`;
    r.text = `${who} paid you ${eur(got.toFixed(2))} towards the rent ${lc(p.label)} (${rng(p.from, p.to)}), in ${list.length} payment${list.length === 1 ? '' : 's'}. Netted against your Rent.`;
    r.trend = null;
    r.count = list.length;
    r.rows = list.slice(0, 8).map((t) => ({ label: dl(t.date), value: eur(t.amount) }));
    return r;
  }
  const noRent = (q.intent === 'top' || q.intent === 'biggest') && !q.slug && !q.merchantKey;
  if (noRent) list = list.filter((t) => t.slug !== 'rent' && t.parentSlug !== 'rent');
  const rentNote = noRent ? ' Rent is left out.' : '';
  const qualifier = `${q.min != null ? ` over ${eur0(q.min)}` : ''}${q.max != null ? ` under ${eur0(q.max)}` : ''}${q.institution ? ` on ${q.institution === 'AIB' ? 'AIB' : 'Revolut'}` : ''}`;
  if (q.intent === 'biggest') {
    const top = list.filter((t) => D(t.amount).isNegative()).sort((x, y) => D(x.amount).comparedTo(y.amount)).slice(0, 5);
    r.big = top.length ? eur(D(top[0]!.amount).neg().toFixed(2)) : '€0.00';
    r.short = 'Biggest payment';
    r.text = `Biggest ${q.merchantKey || q.slug ? `${scopeName(q, n)} ` : ''}payments ${lc(p.label)}${top.length ? `. The largest was ${top[0]!.merchantName} on ${dl(top[0]!.date)}.` : ': none.'}${rentNote}`;
    r.rows = top.map((t) => ({ label: `${dl(t.date)} · ${t.merchantName}`, value: eur(D(t.amount).neg().toFixed(2)) }));
    r.count = list.length;
    return r;
  }
  if (q.intent === 'top') {
    const by = new Map<string, Decimal>();
    for (const t of list) {
      const k = q.by === 'cat' ? (t.slug ? (t.parentSlug ?? t.slug) : 'sort') : t.merchantName;
      by.set(k, (by.get(k) ?? D(0)).minus(t.amount));
    }
    const rows = [...by].sort((x, y) => y[1].comparedTo(x[1])).slice(0, 6);
    const name = (k: string): string => (q.by === 'cat' ? (k === 'sort' ? 'Not sorted yet' : n.category(k)) : k);
    r.big = rows.length ? name(rows[0]![0]) : 'Nothing yet';
    r.short = `Top ${q.by === 'cat' ? 'category' : 'merchant'}`;
    r.text = `Top ${q.by === 'cat' ? 'categories' : 'merchants'}${q.slug ? ` in ${n.category(q.slug)}` : ''} ${lc(p.label)} (${rng(p.from, p.to)}).${rentNote}`;
    r.rows = rows.map(([k, v]) => ({ label: name(k), value: eur(v.toFixed(2)) }));
    r.count = list.length;
    r.trend = null;
    hint();
    return r;
  }
  const total = sum(list.map((t) => D(t.amount).neg()));
  const count = list.filter((t) => D(t.amount).isNegative()).length;
  r.count = list.length;
  hint();
  const refunds = list.filter((t) => t.kind === 'REFUND');
  const shares = list.filter((t) => t.kind === 'SHARE');
  const refNote = `${refunds.length ? ` Includes ${eur(sum(refunds.map((t) => t.amount)).toFixed(2))} refunded.` : ''}${shares.length ? ` Net of ${eur(sum(shares.map((t) => t.amount)).toFixed(2))} from housemates.` : ''}`;
  const head = `${scopeName(q, n)}${qualifier} ${lc(p.label)} (${rng(p.from, p.to)})`;
  if (q.intent === 'count') {
    r.big = `${count} ${count === 1 ? 'time' : 'times'}`;
    r.short = `${scopeName(q, n)}, ${lc(p.label)}`;
    r.text = `${head}, ${eur(total.toFixed(2))} in total.${refNote}`;
    return r;
  }
  if (q.intent === 'average') {
    const days = diffDays(p.from, p.to) + 1;
    r.big = `${eur(total.div(days).times(7).toFixed(2))} a week`;
    r.short = `${scopeName(q, n)} a week`;
    r.text = `${scopeName(q, n)}${qualifier} ${lc(p.label)}: ${count} payments averaging ${eur(count ? total.div(count).toFixed(2) : '0')}, about ${eur(total.div(days).toFixed(2))} a day.`;
    return r;
  }
  if (q.intent === 'list') {
    r.big = `${count} payment${count === 1 ? '' : 's'}`;
    r.short = `${scopeName(q, n)} payments`;
    r.text = `${head}: ${eur(total.toFixed(2))} in total.${refNote}`;
    r.rows = list.slice(0, 8).map((t) => ({ label: `${dl(t.date)} · ${t.merchantName}${t.pending ? ' · pending' : ''}`, value: eur(D(t.amount).neg().toFixed(2)) }));
    if (list.length > 8) r.rows.push({ label: `and ${list.length - 8} more`, value: '' });
    return r;
  }
  const byMerchant = new Map<string, Decimal>();
  for (const t of list) byMerchant.set(t.merchantName, (byMerchant.get(t.merchantName) ?? D(0)).minus(t.amount));
  const tops = [...byMerchant].sort((x, y) => y[1].comparedTo(x[1])).slice(0, 3);
  r.big = eur(total.toFixed(2));
  r.short = `${scopeName(q, n)}, ${lc(p.label)}`;
  r.text = `${head}: ${count} payment${count === 1 ? '' : 's'}${count ? `, averaging ${eur(total.div(count).toFixed(2))}` : ''}.${refNote}`;
  if (!q.merchantKey && tops.length > 1) r.rows = tops.map(([k, v]) => ({ label: k, value: eur(v.toFixed(2)) }));
  return r;
}

export const SUGGESTIONS = [
  'How much did I spend on eating out last month?',
  'Eating out this month vs last month',
  'Where does my money go?',
  'Who owes me money?',
  'How much at Tesco since June?',
  "What's safe to spend today?",
  'Biggest payments in July',
  'What is deemed disposal?',
  'Gold price today',
  '¿Cuánto gasté en bares este mes?',
];
