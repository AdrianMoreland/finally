import { z } from 'zod';
import { dateOnly, decimalString, id, instant, money, moneyInput, monthKey } from './common';
import {
  assetClass,
  cadence,
  severity,
  taxRegime,
  taxRuleRegime,
  wrapper,
} from './enums';
import { accountSchema, categoryRef, transactionSchema } from './core';

/* ---------- insights (also the shape finance-core returns) ---------- */

export const insightDraft = z.object({
  type: z.string(),
  severity,
  title: z.string(),
  body: z.string(),
  payload: z.record(z.string(), z.unknown()),
  /** Stable key so repeated runs update instead of duplicating. */
  fingerprint: z.string(),
});
export type InsightDraft = z.infer<typeof insightDraft>;

export const insightSchema = z.object({
  id,
  type: z.string(),
  severity,
  periodStart: instant,
  title: z.string(),
  body: z.string(),
  payload: z.record(z.string(), z.unknown()),
  pushedAt: instant.nullable(),
  seenAt: instant.nullable(),
  createdAt: instant,
});
export type InsightDto = z.infer<typeof insightSchema>;
export const insightsResponse = z.object({ items: z.array(insightSchema), unseen: z.number().int() });
export type InsightsResponse = z.infer<typeof insightsResponse>;

/* ---------- budgets ---------- */

export const budgetRowSchema = z.object({
  categoryId: id,
  category: categoryRef,
  month: monthKey,
  budgetId: id.nullable(),
  amount: money, // budgeted (incl. rollover carried in)
  baseAmount: money,
  rollover: z.boolean(),
  carriedIn: money,
  spent: money, // children roll up into the parent
  /** What an even pace would have spent by today. */
  expectedByToday: money,
  projected: money,
  fixed: z.boolean(),
});
export type BudgetRow = z.infer<typeof budgetRowSchema>;

export const budgetsResponse = z.object({
  month: monthKey,
  dayOfMonth: z.number().int(),
  daysInMonth: z.number().int(),
  rows: z.array(budgetRowSchema),
  totalBudget: money,
  totalSpent: money,
});
export type BudgetsResponse = z.infer<typeof budgetsResponse>;

export const budgetsQuery = z.object({ month: monthKey.optional() });

export const upsertBudgetBody = z.object({
  categoryId: id,
  month: monthKey,
  amount: moneyInput,
  rollover: z.boolean().default(false),
});
export type UpsertBudgetBody = z.infer<typeof upsertBudgetBody>;

/* ---------- overview ---------- */

export const categorySpend = z.object({ category: categoryRef, spent: money });

export const overviewSchema = z.object({
  asOf: instant,
  month: monthKey,
  dayOfMonth: z.number().int(),
  daysInMonth: z.number().int(),
  daysToPayday: z.number().int(),
  paydayDate: dateOnly,
  netWorth: z.object({
    current: money,
    change12m: money,
    series: z.array(z.object({ month: monthKey, value: money })),
  }),
  safeToSpend: z.object({
    perDay: money,
    leftToPayday: money,
    billsToCome: money,
  }),
  flexible: z.object({ spent: money, budget: money, expectedByToday: money }),
  topCategories: z.array(categorySpend),
  spendByDay: z.array(z.object({ day: z.number().int(), spent: money })),
  evenPacePerDay: money,
  latestInsights: z.array(insightSchema),
  recentTransactions: z.array(transactionSchema),
  toSortCount: z.number().int(),
  accounts: z.array(accountSchema),
  lastSyncAt: instant.nullable(),
});
export type Overview = z.infer<typeof overviewSchema>;

/* ---------- recurring ---------- */

export const recurringSchema = z.object({
  id,
  merchantName: z.string(),
  cadence,
  expectedAmount: money,
  lastAmount: money,
  nextDate: dateOnly,
  active: z.boolean(),
});
export type RecurringDto = z.infer<typeof recurringSchema>;

/* ---------- investments ---------- */

export const instrumentSchema = z.object({
  id,
  symbol: z.string(),
  isin: z.string().nullable(),
  exchange: z.string().nullable(),
  name: z.string(),
  assetClass,
  currency: z.string(),
  taxRegime,
});
export type InstrumentDto = z.infer<typeof instrumentSchema>;

export const createInstrumentBody = z.object({
  symbol: z.string().min(1).max(20).transform((s) => s.toUpperCase()),
  isin: z.string().length(12).nullable().default(null),
  exchange: z.string().max(20).nullable().default(null),
  name: z.string().min(1).max(100),
  assetClass,
  currency: z.string().length(3).default('EUR'),
  taxRegime,
});
export type CreateInstrumentBody = z.infer<typeof createInstrumentBody>;
export const updateInstrumentBody = createInstrumentBody.partial();

export const lotSchema = z.object({
  id,
  instrumentId: id,
  acquiredAt: dateOnly,
  quantity: decimalString,
  unitCost: decimalString,
  fees: money,
  wrapper,
  soldAt: dateOnly.nullable(),
  soldPrice: decimalString.nullable(),
});
export type LotDto = z.infer<typeof lotSchema>;

export const createLotBody = z.object({
  instrumentId: id,
  acquiredAt: dateOnly,
  quantity: decimalString,
  unitCost: decimalString,
  fees: moneyInput.default('0.00'),
  wrapper: wrapper.default('BROKER'),
});
export type CreateLotBody = z.infer<typeof createLotBody>;
export const updateLotBody = createLotBody
  .partial()
  .extend({ soldAt: dateOnly.nullable().optional(), soldPrice: decimalString.nullable().optional() });

export const holdingSchema = z.object({
  instrument: instrumentSchema,
  quantity: decimalString,
  avgCost: decimalString,
  price: decimalString,
  priceDate: dateOnly.nullable(),
  value: money,
  cost: money,
  gain: money,
  gainPct: z.number(),
  share: z.number(), // 0-100
  targetShare: z.number().nullable(),
  lots: z.array(lotSchema),
});
export type HoldingDto = z.infer<typeof holdingSchema>;

export const signalSchema = z.object({
  id,
  instrumentId: id.nullable(),
  symbol: z.string().nullable(),
  rule: z.string(),
  title: z.string(),
  body: z.string(),
  firedAt: instant,
  payload: z.record(z.string(), z.unknown()),
  seenAt: instant.nullable(),
});
export type SignalDto = z.infer<typeof signalSchema>;

export const signalDraft = z.object({
  rule: z.string(),
  instrumentSymbol: z.string().nullable(),
  title: z.string(),
  body: z.string(),
  payload: z.record(z.string(), z.unknown()),
  fingerprint: z.string(),
});
export type SignalDraft = z.infer<typeof signalDraft>;

export const taxRuleSchema = z.object({
  id,
  regime: taxRuleRegime,
  rate: z.string(), // "0.3800"
  annualExemption: money.nullable(),
  threshold: money.nullable(),
  contributionCap: money.nullable(),
  effectiveFrom: dateOnly,
  effectiveTo: dateOnly.nullable(),
});
export type TaxRuleDto = z.infer<typeof taxRuleSchema>;

export const deemedDisposalSchema = z.object({
  lotId: id,
  symbol: z.string(),
  acquiredAt: dateOnly,
  quantity: decimalString,
  anniversaries: z.array(
    z.object({
      n: z.number().int(), // 1 = 8th anniversary
      date: dateOnly,
      daysAway: z.number().int(),
      estimatedGain: money,
      estimatedTax: money,
      rate: z.string(),
    }),
  ),
});
export type DeemedDisposalDto = z.infer<typeof deemedDisposalSchema>;

export const investmentsSchema = z.object({
  asOf: instant,
  total: money,
  cost: money,
  gain: money,
  gainPct: z.number(),
  holdings: z.array(holdingSchema),
  allocation: z.array(
    z.object({ key: z.string(), label: z.string(), actual: z.number(), target: z.number(), drift: z.number() }),
  ),
  series: z.array(z.object({ date: dateOnly, value: money })),
  signals: z.array(signalSchema),
  deemedDisposals: z.array(deemedDisposalSchema),
  taxRulesInForce: z.array(taxRuleSchema),
  disclaimer: z.string(),
});
export type InvestmentsDto = z.infer<typeof investmentsSchema>;

export const priceSeriesQuery = z.object({ days: z.coerce.number().int().min(5).max(800).default(180) });
export const priceSeriesSchema = z.object({
  instrument: instrumentSchema,
  bars: z.array(z.object({ date: dateOnly, close: decimalString })),
  sma50: z.array(z.number().nullable()),
  sma200: z.array(z.number().nullable()),
  rsi14: z.number().nullable(),
  quote: z.object({ price: decimalString, asOf: instant }),
});
export type PriceSeriesDto = z.infer<typeof priceSeriesSchema>;

