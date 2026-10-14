import { z } from 'zod';
import { dateOnly, instant, money, moneyInput } from './common';


/* ---------- compound growth ---------- */
export const compoundBody = z.object({
  initial: moneyInput,
  monthly: moneyInput,
  annualReturnPct: z.coerce.number().min(-50).max(100),
  years: z.coerce.number().int().min(1).max(60),
});
export const compoundResponse = z.object({
  finalValue: money,
  contributed: money,
  growth: money,
  series: z.array(z.object({ year: z.number().int(), value: money, contributed: money })),
});
export type CompoundResponse = z.infer<typeof compoundResponse>;

/* ---------- emergency fund ---------- */
export const emergencyFundResponse = z.object({
  monthlyEssential: money,
  months3: money,
  months6: money,
  saved: money,
  coverageMonths: z.number(),
  basedOnMonths: z.number().int(),
});
export type EmergencyFundResponse = z.infer<typeof emergencyFundResponse>;

/* ---------- FIRE ---------- */
export const fireBody = z.object({
  annualSpend: moneyInput,
  withdrawalRatePct: z.coerce.number().min(1).max(10).default(4),
  currentPortfolio: moneyInput.default('0.00'),
  monthlyContribution: moneyInput.default('0.00'),
  annualReturnPct: z.coerce.number().min(0).max(30).default(5),
});
export const fireResponse = z.object({
  fireNumber: money,
  progressPct: z.number(),
  yearsToFire: z.number().nullable(),
});
export type FireResponse = z.infer<typeof fireResponse>;

/* ---------- loan payoff ---------- */
export const loanBody = z.object({
  principal: moneyInput,
  annualRatePct: z.coerce.number().min(0).max(40),
  termYears: z.coerce.number().min(1).max(50),
  monthlyOverpayment: moneyInput.default('0.00'),
});
export const loanResponse = z.object({
  monthlyPayment: money,
  totalInterest: money,
  months: z.number().int(),
  withOverpayment: z.object({
    monthlyPayment: money,
    totalInterest: money,
    months: z.number().int(),
    interestSaved: money,
    monthsSaved: z.number().int(),
  }),
});
export type LoanResponse = z.infer<typeof loanResponse>;

/* ---------- where should EUR X go ---------- */
export const whereShouldItGoBody = z.object({
  amount: moneyInput,
  years: z.coerce.number().int().min(1).max(40),
  annualReturnPct: z.coerce.number().min(-20).max(30).default(6),
  /** Dividend-style yield assumed to be taxed as income each year on individual shares (kept simple). */
  startDate: dateOnly.optional(),
});
export const whereOption = z.object({
  key: z.enum(['BROKER_ETF', 'INVESTMENT_ACCOUNT', 'SHARES']),
  label: z.string(),
  grossValue: money,
  taxEstimate: money,
  afterTaxValue: money,
  notes: z.array(z.string()),
});
export const whereShouldItGoResponse = z.object({
  options: z.array(whereOption),
  best: z.enum(['BROKER_ETF', 'INVESTMENT_ACCOUNT', 'SHARES']),
  disclaimer: z.string(),
});
export type WhereShouldItGoResponse = z.infer<typeof whereShouldItGoResponse>;

/* ---------- currency converter (ECB) ---------- */
export const convertQuery = z.object({
  amount: moneyInput,
  from: z.string().length(3).transform((s) => s.toUpperCase()),
  to: z.string().length(3).transform((s) => s.toUpperCase()),
});
export const convertResponse = z.object({
  amount: money,
  from: z.string(),
  to: z.string(),
  rate: z.string(),
  converted: money,
  asOf: instant,
  source: z.string(),
});
export type ConvertResponse = z.infer<typeof convertResponse>;

