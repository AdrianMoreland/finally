import { z } from 'zod';
import { dateOnly, id, instant, money, moneyInput, monthKey } from './common';
import { checkState, personDirection, potType, reviewKind } from './enums';
import { accountSchema, categoryRef, parsedQuerySchema } from './core';

/* ====================================================================== prefs */

/** Per-user settings that are not entities: stored as JSON on the user, validated here, defaults filled in on read. */
const num = (n: number) => z.number().catch(n);
const bool = (b: boolean) => z.boolean().catch(b);

const notifPrefs = z.object({ weekly: bool(true), quiet: bool(true), ask: bool(true) });
const taxPrefs = z.object({
  /** Yearly gross pay. */
  gross: num(40000),
  year: num(2026),
  /** What-if raise, euro a year. */
  raise: num(3000),
  /** Month the current tenancy started, YYYY-MM. */
  tenancy: z.string().nullable().catch('2025-05'),
});
const bonusPrefs = z.object({
  target: num(13200),
  pct: num(100),
  year: num(2026),
  pension: num(0),
  allocation: z.preprocess(emptyIfMissing, z.object({ debts: num(0), rainy: num(4000), invest: num(2500), treat: num(500) })),
});
const freedomPrefs = z.object({ spend: num(30000), withdrawalPct: num(4), monthly: num(500), returnPct: num(5), age: num(30), raisePct: num(2) });
const investingPrefs = z.object({
  rulesSaved: bool(false),
  startAnyway: bool(false),
  mix: z.record(z.string(), z.number()).catch({ world: 60, sp: 20, em: 5, gold: 10, cash: 5 }),
  rules: z.preprocess(emptyIfMissing, z.object({ wait: bool(true), single: bool(true), lev: bool(true) })),
  wrapper: z.preprocess(emptyIfMissing, z.object({ monthly: num(200), years: num(15), returnPct: num(6), terPct: num(0.22), fxPct: num(0.15) })),
});
const paybackPrefs = z.object({
  monthly: num(0),
  order: z.enum(['smallest', 'largest', 'custom']).catch('smallest'),
  custom: z.array(z.string()).catch([]),
  /** Part of the December bonus that goes to paying people back. */
  bonusToDebt: num(0),
});
const paperPrefs = z.object({
  cash: num(5000),
  step: num(0),
  positions: z.record(z.string(), z.object({ qty: z.number(), cost: z.number() })).catch({}),
  moves: z.record(z.string(), z.number()).catch({}),
  guard: z.string().nullable().catch(null),
  log: z.array(z.string()).catch([]),
});

function emptyIfMissing(v: unknown): unknown {
  return v && typeof v === 'object' ? v : {};
}
/** An object section whose every field has a fallback, so a missing or damaged section still reads as defaults. */
const sec = <T extends z.ZodType>(shape: T) => z.preprocess(emptyIfMissing, shape);

export const userPrefs = z.object({
  notif: sec(notifPrefs),
  tax: sec(taxPrefs),
  bonus: sec(bonusPrefs),
  freedom: sec(freedomPrefs),
  investing: sec(investingPrefs),
  payback: sec(paybackPrefs),
  /** Repeating payment ids the user says they cancelled, to see what it would save. */
  subsCancelled: z.array(z.string()).catch([]),
  /** Ids of double-charge warnings the user looked at and dismissed. */
  dismissed: z.array(z.string()).catch([]),
  contractRemind: bool(false),
  paper: sec(paperPrefs),
  vault: z.array(z.object({ product: z.string(), qty: z.number(), paid: z.number() })).catch([]),
  /** Phrases the user has taught Ask: normalised text → text it should be read as. */
  learned: z.record(z.string(), z.string()).catch({}),
});
export type UserPrefs = z.infer<typeof userPrefs>;

/** Deep partial for updates; the server merges it into what is stored. */
export const userPrefsPatch = z.record(z.string(), z.unknown());

/** Fill every default. `raw` is whatever JSON is stored. */
export const resolvePrefs = (raw: unknown): UserPrefs => userPrefs.parse(raw && typeof raw === 'object' ? raw : {});

/* ==================================================================== safety */

export const safeBreakdown = z.object({
  daysLeft: z.number().int(),
  flexBudget: money,
  spentFlex: money,
  over: money,
  unsorted: money,
  budgetLeft: money,
  balance: money,
  billsDue: money,
  buffer: money,
  balanceLeft: money,
  pool: money,
  binds: z.enum(['budget', 'balance']),
  perDay: money,
});
export type SafeBreakdown = z.infer<typeof safeBreakdown>;

export const weekLeftSchema = z.object({ weekBudget: money, spent: money, left: money, daysLeft: z.number().int() });

/* ================================================================== actions */

export const actionCta = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('go'), label: z.string(), to: z.string() }),
  z.object({ kind: z.literal('check'), label: z.string(), itemId: z.string(), state: z.literal('DONE') }),
  z.object({ kind: z.literal('remind'), label: z.string(), personId: z.string() }),
]);

export const actionItemSchema = z.object({
  id: z.string(),
  severity: z.enum(['YOU', 'ACT', 'WATCH']),
  title: z.string(),
  body: z.string(),
  amount: money,
  cta: actionCta,
  pinned: z.boolean(),
});
export type ActionItemDto = z.infer<typeof actionItemSchema>;

export const snoozeBody = z.object({ actionId: z.string().min(1).max(200) });

export const ladderRungSchema = z.object({
  key: z.enum(['plan', 'starter', 'paid', 'three', 'invest', 'six', 'enough']),
  title: z.string(),
  done: z.boolean(),
  when: z.string(),
  left: money.nullable(),
});
export const ladderSchema = z.object({ rungs: z.array(ladderRungSchema), current: z.number().int() });
export type LadderDto = z.infer<typeof ladderSchema>;

/* ====================================================================== ask */

export const answerSchema = z.object({
  tier: z.enum(['rules', 'help', 'public']),
  sent: z.string(),
  big: z.string(),
  short: z.string(),
  text: z.string(),
  rows: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  hint: z.object({ count: z.number().int(), names: z.array(z.string()), slug: z.string() }).optional(),
  action: z.object({ label: z.string(), to: z.string(), extra: z.record(z.string(), z.unknown()).optional() }).optional(),
  trend: z.object({ slug: z.string().nullable(), merchantKey: z.string().nullable() }).nullable().optional(),
  count: z.number().int().optional(),
});
export type AnswerDto = z.infer<typeof answerSchema>;

export const askBody = z.object({
  text: z.string().min(1).max(300),
  /** The previous question, so "and September?" can reuse it. */
  previous: parsedQuerySchema.nullable().optional(),
});
export const askEvaluateBody = z.object({ query: parsedQuerySchema });

export const askResponse = z.object({
  /** Null when the question was not understood. */
  query: parsedQuerySchema.nullable(),
  answer: answerSchema.nullable(),
  suggestions: z.array(z.string()),
  /** For the "Read as" chips. */
  options: z.object({
    categories: z.array(z.object({ slug: z.string(), name: z.string() })),
    merchants: z.array(z.object({ key: z.string(), name: z.string() })),
    periods: z.array(z.object({ key: z.string(), label: z.string() })),
  }),
  pinned: z.boolean(),
});
export type AskResponse = z.infer<typeof askResponse>;

export const pinSchema = z.object({ id, text: z.string(), big: z.string(), short: z.string() });
export const createPinBody = z.object({ text: z.string().min(1).max(300) });

/* ===================================================================== today */

export const todaySchema = z.object({
  asOf: instant,
  today: dateOnly,
  nextPayday: dateOnly,
  daysToPayday: z.number().int(),
  safe: safeBreakdown,
  /** Safe to spend per day at the end of yesterday, for "down €2 since you last looked". */
  safeYesterday: money,
  week: weekLeftSchema,
  actions: z.array(actionItemSchema),
  snoozed: z.number().int(),
  since: z.object({ count: z.number().int(), out: money, back: money }),
  ladder: ladderSchema,
  pins: z.array(pinSchema),
  accounts: z.array(accountSchema),
  lastSyncAt: instant.nullable(),
  toSortCount: z.number().int(),
  pending: z.object({ count: z.number().int(), total: money }),
  setupDone: z.boolean(),
});
export type TodayDto = z.infer<typeof todaySchema>;

/* ====================================================================== month */

export const monthSchema = z.object({
  month: monthKey,
  day: z.number().int(),
  daysInMonth: z.number().int(),
  burn: z.object({
    budget: money,
    projected: money,
    /** Cumulative flexible spend per day so far. */
    spent: z.array(z.object({ day: z.number().int(), value: money })),
    /** Your usual pace: cumulative budget share per day. */
    pace: z.array(z.object({ day: z.number().int(), value: money })),
    forecast: z.array(z.object({ day: z.number().int(), value: money })),
  }),
  ranked: z.array(z.object({ category: categoryRef, spent: money, budget: money })),
  netWorth: z.object({ current: money, series: z.array(z.object({ month: monthKey, value: money })), changeSixMonths: money }),
  goodToKnow: z.array(z.object({ title: z.string(), body: z.string() })),
});
export type MonthDto = z.infer<typeof monthSchema>;

/* ====================================================================== bills */

export const repeatingSchema = z.object({
  id: z.string(),
  merchantKey: z.string(),
  name: z.string(),
  slug: z.string().nullable(),
  parentSlug: z.string().nullable(),
  cadence: z.enum(['monthly', 'quarterly']),
  amount: money,
  avg: money,
  lo: money,
  hi: money,
  varies: z.boolean(),
  rise: z.object({ from: money, to: money, since: dateOnly }).nullable(),
  lastDate: dateOnly,
  nextDate: dateOnly,
  count: z.number().int(),
  since: dateOnly,
  usualDay: z.number().int(),
  cancelled: z.boolean(),
});
export const upcomingBillSchema = z.object({ id: z.string(), name: z.string(), date: dateOnly, amount: money, varies: z.boolean(), slug: z.string().nullable() });

export const billsSchema = z.object({
  repeating: z.array(repeatingSchema),
  upcoming: z.array(upcomingBillSchema),
  billsBeforePayday: money,
  subscriptions: z.object({ monthly: money, yearly: money, savedMonthly: money }),
  doubles: z.array(z.object({ id: z.string(), merchantName: z.string(), date: dateOnly, amount: money, count: z.number().int() })),
  refunds: z.array(z.object({ id, merchantName: z.string(), date: dateOnly, amount: money, category: categoryRef.nullable() })),
  returnedDebits: z.array(z.object({ id, merchantName: z.string(), date: dateOnly, amount: money })),
  fees: z.object({ last12Months: money }),
});
export type BillsDto = z.infer<typeof billsSchema>;
export const cancelRepeatingBody = z.object({ id: z.string().min(1), cancelled: z.boolean() });
export const dismissBody = z.object({ id: z.string().min(1) });

/* ====================================================================== review */

export const weeklyReviewSchema = z.object({
  period: z.string(),
  done: z.boolean(),
  decision: z.string().nullable(),
  streak: z.number().int(),
  nextReview: dateOnly,
  toSort: z.object({ count: z.number().int(), first: z.object({ requestId: id, key: z.string(), name: z.string(), rawDescriptor: z.string(), amount: money, suggestion: categoryRef.nullable() }).nullable() }),
  budget: z
    .object({
      worst: z.object({ slug: z.string(), name: z.string(), spent: money, budget: money, projected: money, thisWeek: money }).nullable(),
    }),
  know: actionItemSchema.nullable(),
  decisions: z.array(z.object({ value: z.string(), label: z.string() })),
});
export type WeeklyReviewDto = z.infer<typeof weeklyReviewSchema>;
export const completeWeekBody = z.object({ decision: z.string().max(200).nullable() });

export const monthCloseSchema = z.object({
  month: monthKey,
  cameIn: money,
  spent: money,
  paidBack: money,
  kept: money,
  keptPct: z.number(),
  balanceFrom: money,
  balanceTo: money,
  rows: z.array(z.object({ category: categoryRef, planned: money, spent: money, difference: money })),
  jump: z.object({ name: z.string(), by: money, versus: z.string() }).nullable(),
  options: z.array(z.object({ value: z.string(), label: z.string() })),
  choice: z.string().nullable(),
  closesOn: dateOnly,
  nextMonthName: z.string(),
});
export type MonthCloseDto = z.infer<typeof monthCloseSchema>;
export const chooseMonthBody = z.object({ value: z.string().min(1).max(100), label: z.string().max(200) });

/* ======================================================================= pots */

export const potSchema = z.object({
  id,
  name: z.string(),
  type: potType,
  accountId: id.nullable(),
  linkedAccountName: z.string().nullable(),
  balance: money,
  target: money.nullable(),
  targetDate: dateOnly.nullable(),
  monthly: money,
  /** For a safety pot, three months of essentials. */
  effectiveTarget: money.nullable(),
  reach: z.object({ state: z.enum(['reached', 'never', 'on']), date: dateOnly.nullable(), paydays: z.number().int().nullable() }),
  reachText: z.string(),
  status: z.object({ late: z.boolean(), need: money, paydaysLeft: z.number().int(), shortfall: money }).nullable(),
  progress: z.number(),
});
export type PotDto = z.infer<typeof potSchema>;

export const wishlistSchema = z.object({
  id,
  potId: id,
  name: z.string(),
  price: money,
  addedOn: dateOnly,
  boughtOn: dateOnly.nullable(),
  /** Over €100 waits 30 days before it can be bought. */
  unlocksOn: dateOnly,
  affordableOn: dateOnly.nullable(),
});

export const potsSchema = z.object({
  pots: z.array(potSchema),
  wishlist: z.array(wishlistSchema),
  ladder: ladderSchema,
  essentialsPerMonth: money,
  total: money,
  linkableAccounts: z.array(z.object({ id, name: z.string(), balance: money })),
});
export type PotsDto = z.infer<typeof potsSchema>;

export const createPotBody = z.object({
  name: z.string().min(1).max(60),
  type: potType,
  target: moneyInput.nullable().default(null),
  targetDate: dateOnly.nullable().default(null),
  monthly: moneyInput.default('0.00'),
  balance: moneyInput.default('0.00'),
  accountId: id.nullable().default(null),
});
export type CreatePotBody = z.infer<typeof createPotBody>;
export const updatePotBody = createPotBody.partial();

export const createWishBody = z.object({ name: z.string().min(1).max(80), price: moneyInput });
export const updateWishBody = z.object({ bought: z.boolean() });

/* =================================================================== people */

export const personSchema = z.object({
  id,
  name: z.string(),
  direction: personDirection,
  amount: money,
  paid: money,
  left: money,
  note: z.string().nullable(),
  since: dateOnly,
  merchantKey: z.string().nullable(),
  remindText: z.string(),
  /** Debt plan only. */
  paidOffOn: dateOnly.nullable(),
  nextPayment: money.nullable(),
  payments: z.array(z.object({ id, amount: money, paidOn: dateOnly, note: z.string().nullable() })),
});
export type PersonDto = z.infer<typeof personSchema>;

export const peopleSchema = z.object({
  owe: z.array(personSchema),
  owed: z.array(personSchema),
  totalOwe: money,
  totalOwed: money,
  plan: z.object({
    monthly: money,
    order: z.enum(['smallest', 'largest', 'custom']),
    custom: z.array(z.string()),
    bonusToDebt: money,
    freeDate: dateOnly.nullable(),
    series: z.array(z.object({ date: dateOnly, left: money })),
  }),
});
export type PeopleDto = z.infer<typeof peopleSchema>;

export const createPersonBody = z.object({
  name: z.string().min(1).max(60),
  direction: personDirection,
  amount: moneyInput,
  note: z.string().max(200).nullable().default(null),
  since: dateOnly.optional(),
  merchantKey: z.string().max(80).nullable().default(null),
});
export type CreatePersonBody = z.infer<typeof createPersonBody>;
export const updatePersonBody = createPersonBody.partial();
export const createPersonPaymentBody = z.object({ amount: moneyInput, paidOn: dateOnly.optional(), note: z.string().max(200).nullable().default(null) });
export const updatePaybackPlanBody = z.object({
  monthly: moneyInput.optional(),
  order: z.enum(['smallest', 'largest', 'custom']).optional(),
  custom: z.array(z.string()).optional(),
  bonusToDebt: moneyInput.optional(),
});

/* ================================================================ payday plan */

export const orderRowSchema = z.object({
  key: z.string(),
  name: z.string(),
  to: z.string(),
  amount: money,
  set: money.nullable(),
  state: z.enum(['missing', 'changed', 'ok']),
  /** Landed since the last payday, found in your transactions. */
  arrived: z.boolean(),
  color: z.string(),
});

export const paydayPlanSchema = z.object({
  netPay: money,
  fixed: money,
  flexible: money,
  surplus: money,
  planned: money,
  left: money,
  items: z.array(z.object({ key: z.string(), name: z.string(), amount: money, color: z.string(), note: z.string() })),
  orders: z.array(orderRowSchema),
  cashflow: z.array(z.object({ date: dateOnly, name: z.string(), amount: money, balance: money })),
  balanceToday: money,
  flexLeft: money,
  lowestBalance: money,
  nextPayday: dateOnly,
  nextYearRise: money,
  salaryOnly: z.boolean(),
  lifestyleGuard: z.boolean(),
  buffer: money,
  overdrawnFees: money,
});
export type PaydayPlanDto = z.infer<typeof paydayPlanSchema>;
export const setOrderBody = z.object({ amount: moneyInput.nullable() });
export const updatePlanSettingsBody = z.object({
  salaryOnly: z.boolean().optional(),
  lifestyleGuard: z.boolean().optional(),
  buffer: moneyInput.optional(),
  paydayDayOfMonth: z.number().int().min(1).max(31).optional(),
});

/* ============================================================== bonus and tax */

export const bonusSchema = z.object({
  inputs: bonusPrefs,
  salary: z.number(),
  gross: money,
  cap: money,
  pension: money,
  taxWithout: money,
  taxWith: money,
  usc: money,
  prsi: money,
  netWithoutPension: money,
  netWithPension: money,
  aboveBand: money,
  scenarios: z.array(z.object({ pct: z.number(), net: money })),
  unallocated: money,
});
export type BonusDto = z.infer<typeof bonusSchema>;
export const updateBonusBody = bonusPrefs.partial();

export const taxItemSchema = z.object({ id: z.string(), group: z.enum(['credits', 'perks', 'protection']), label: z.string(), hint: z.string(), state: checkState });
export const taxSchema = z.object({
  inputs: taxPrefs,
  takeHome: z.object({ gross: money, tax: money, usc: money, prsi: money, net: money, monthly: money }),
  takeHomeRaise: z.object({ gross: money, net: money, monthly: money, extraMonthly: money }),
  payslips: z.array(z.object({ date: dateOnly, label: z.string(), net: money, first: z.boolean() })),
  payslip: z
    .object({
      date: dateOnly,
      net: money,
      expected: z.object({ gross: money, tax: money, usc: money, prsi: money, net: money }),
      verdict: z.object({ needsAttention: z.boolean(), headline: z.string(), body: z.string() }),
    })
    .nullable(),
  rentCredit: z.object({ thisYear: money, previous: money, sinceYear: z.string().nullable(), monthlyRent: money }),
  unclaimed: money,
  items: z.array(taxItemSchema),
  rules: z.object({
    version: z.string(),
    reviewed: dateOnly,
    rows: z.array(z.object({ id: z.string(), label: z.string(), from: z.string(), source: z.string(), url: z.string(), reviewed: dateOnly })),
  }),
});
export type TaxDto = z.infer<typeof taxSchema>;
export const updateTaxBody = taxPrefs.partial();
export const setTaxCheckBody = z.object({ state: checkState });

/* ===================================================================== grow */

export const readinessItemSchema = z.object({ id: z.string(), title: z.string(), ok: z.boolean(), partial: z.boolean(), sub: z.string(), checkable: z.boolean() });
export const investingPlanSchema = z.object({
  readiness: z.array(readinessItemSchema),
  readyCount: z.number().int(),
  investAccount: z.object({
    opens: dateOnly,
    daysToOpen: z.number().int(),
    potAtOpen: money,
    bonusAllocation: money,
    cap: money,
  }),
  prefs: investingPrefs,
  monthlyInvest: money,
  drift: z.array(z.object({ key: z.string(), label: z.string(), target: z.number(), actual: z.number(), diff: z.number() })),
  nextGoesTo: z.string().nullable(),
  hasPositions: z.boolean(),
  wrapper: z.object({ paid: money, pre: money, fees: money, etf: money, ia: money, shares: money, capped: z.boolean() }),
});
export type InvestingPlanDto = z.infer<typeof investingPlanSchema>;
export const updateInvestingBody = investingPrefs.partial();

export const freedomSchema = z.object({
  inputs: freedomPrefs,
  target: money,
  years: z.number().int(),
  p10: z.array(z.number()),
  p50: z.array(z.number()),
  p90: z.array(z.number()),
  hitAge: z.number().nullable(),
  probBy55: z.number(),
  myFutureFund: money,
  ladder: ladderSchema,
});
export type FreedomDto = z.infer<typeof freedomSchema>;
export const updateFreedomBody = freedomPrefs.partial();

export const paperSchema = z.object({
  cash: money,
  step: z.number().int(),
  holdings: z.array(z.object({ symbol: z.string(), name: z.string(), qty: z.number(), value: money, cost: money, gain: money, gainPct: z.number() })),
  total: money,
  start: money,
  guard: z.object({ symbol: z.string(), downPct: z.number() }).nullable(),
  log: z.array(z.string()),
  signals: z.array(z.object({ symbol: z.string(), price: money, changePct: z.number(), label: z.string(), severity: z.enum(['info', 'watch']) })),
  instruments: z.array(z.object({ symbol: z.string(), name: z.string() })),
});
export type PaperDto = z.infer<typeof paperSchema>;
export const paperTradeBody = z.object({ action: z.enum(['buy', 'sell', 'advance', 'guard-keep', 'guard-sell']), symbol: z.string().optional(), amount: moneyInput.optional() });

export const vaultSchema = z.object({
  items: z.array(z.object({ index: z.number().int(), product: z.string(), name: z.string(), qty: z.number(), paid: money, spot: money, buyback: money, premiumPct: z.number() })),
  products: z.array(z.object({ key: z.string(), name: z.string() })),
  buybackTotal: money,
  paidTotal: money,
  goldSpot: money,
  silverSpot: money,
});
export type VaultDto = z.infer<typeof vaultSchema>;
export const addVaultBody = z.object({ product: z.string(), qty: z.number().int().min(1).max(1000) });

/* ===================================================================== setup */

export const foundSchema = z.object({
  salary: z.object({ amount: money, day: z.number().int(), count: z.number().int(), lastDate: dateOnly }).nullable(),
  rent: z.object({ amount: money, day: z.number().int(), netAmount: money, shareCount: z.number().int() }).nullable(),
  housemates: z.array(z.object({ name: z.string(), merchantKey: z.string(), total: money, count: z.number().int() })),
  bills: z.array(z.object({ id: z.string(), name: z.string(), amount: money, cadence: z.string(), kind: z.enum(['bill', 'subscription']), usualDay: z.number().int() })),
  ownTransfers: z.number().int(),
  months: z.number().int(),
  payments: z.number().int(),
  unknownMerchants: z.number().int(),
  suggestedBudgets: z.record(z.string(), z.string()),
});
export type FoundDto = z.infer<typeof foundSchema>;

export const completeSetupBody = z.object({
  paydayDayOfMonth: z.number().int().min(1).max(31),
  buffer: moneyInput,
  salary: z.number().min(0).max(1_000_000).optional(),
  budgets: z.record(z.string(), moneyInput),
  people: z.array(createPersonBody).max(20).default([]),
  pots: z.array(createPotBody).max(10).default([]),
  notif: notifPrefs.optional(),
});
export type CompleteSetupBody = z.infer<typeof completeSetupBody>;


export const reviewKindSchema = reviewKind;
export const checkStateSchema = checkState;
