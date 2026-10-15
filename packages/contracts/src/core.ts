import { z } from 'zod';
import { dateOnly, id, instant, money, moneyInput, pageQuery } from './common';
import {
  accountType,
  askGroup,
  bankProviderKind,
  categorisedBy,
  categoryGroup,
  connectionStatus,
  institution,
  requestStatus,
  ruleMatchType,
  ruleSource,
  txKind,
  txStatus,
} from './enums';

/* ---------- me / settings ---------- */

export const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const targetAllocation = z.record(z.string(), z.number().min(0).max(100));
export type TargetAllocation = z.infer<typeof targetAllocation>;

export const meSchema = z.object({
  id,
  email: z.email(),
  displayName: z.string(),
  currency: z.literal('EUR'),
  timezone: z.string(),
  paydayDayOfMonth: z.number().int().min(1).max(31),
  monthlySavingsTarget: money,
  quietHoursStart: timeOfDay,
  quietHoursEnd: timeOfDay,
  targetAllocation,
  bufferAmount: money,
  salaryOnly: z.boolean(),
  lifestyleGuard: z.boolean(),
  setupDone: z.boolean(),
});
export type Me = z.infer<typeof meSchema>;

export const updateMeBody = z
  .object({
    displayName: z.string().min(1).max(60),
    paydayDayOfMonth: z.number().int().min(1).max(31),
    monthlySavingsTarget: moneyInput,
    quietHoursStart: timeOfDay,
    quietHoursEnd: timeOfDay,
    targetAllocation,
    bufferAmount: moneyInput,
    salaryOnly: z.boolean(),
    lifestyleGuard: z.boolean(),
  })
  .partial();
export type UpdateMeBody = z.infer<typeof updateMeBody>;

export const deleteAllDataBody = z.object({ confirm: z.literal('DELETE') });

export const exportQuery = z.object({ format: z.enum(['csv', 'json']).default('json') });

/* ---------- categories & rules ---------- */

export const categorySchema = z.object({
  id,
  name: z.string(),
  slug: z.string(),
  group: categoryGroup,
  askGroup,
  icon: z.string(),
  colour: z.string(),
  parentId: id.nullable(),
  archived: z.boolean(),
});
export type CategoryDto = z.infer<typeof categorySchema>;

export const categoryRef = z.object({
  id,
  name: z.string(),
  slug: z.string(),
  colour: z.string(),
  icon: z.string(),
  parentId: id.nullable(),
});
export type CategoryRef = z.infer<typeof categoryRef>;

export const createCategoryBody = z.object({
  name: z.string().min(1).max(40),
  group: categoryGroup,
  askGroup: askGroup.default('OTHER'),
  icon: z.string().min(1).max(32).default('tag'),
  colour: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  parentId: id.nullable().default(null),
});
export type CreateCategoryBody = z.infer<typeof createCategoryBody>;

export const updateCategoryBody = createCategoryBody.partial().extend({ archived: z.boolean().optional() });
export type UpdateCategoryBody = z.infer<typeof updateCategoryBody>;

export const ruleSchema = z.object({
  id,
  matchType: ruleMatchType,
  pattern: z.string(),
  categoryId: id,
  priority: z.number().int(),
  source: ruleSource,
  active: z.boolean(),
});
export type RuleDto = z.infer<typeof ruleSchema>;

export const createRuleBody = z.object({
  matchType: ruleMatchType,
  pattern: z.string().min(1).max(200),
  categoryId: id,
  priority: z.number().int().min(0).max(1000).default(100),
});
export type CreateRuleBody = z.infer<typeof createRuleBody>;

export const updateRuleBody = z.object({
  categoryId: id.optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  active: z.boolean().optional(),
});

/* ---------- accounts & banking ---------- */

export const accountSchema = z.object({
  id,
  connectionId: id,
  name: z.string(),
  ibanMasked: z.string().nullable(),
  currency: z.string(),
  type: accountType,
  institution,
  balance: money,
  balanceAt: instant.nullable(),
  includeInNetWorth: z.boolean(),
});
export type AccountDto = z.infer<typeof accountSchema>;

export const updateAccountBody = z.object({ includeInNetWorth: z.boolean() });

export const connectionSchema = z.object({
  id,
  provider: bankProviderKind,
  institution,
  status: connectionStatus,
  validUntil: instant.nullable(),
  lastSyncAt: instant.nullable(),
  accountCount: z.number().int(),
});
export type ConnectionDto = z.infer<typeof connectionSchema>;

export const startConnectionBody = z.object({ institution, returnTo: z.enum(['web', 'mobile']).default('web') });
export const startConnectionResponse = z.object({
  connectionId: id,
  /** Where to send the user to authorise. Mock mode returns a URL that completes immediately. */
  url: z.string(),
  state: z.string(),
});
export type StartConnectionResponse = z.infer<typeof startConnectionResponse>;

export const syncResultSchema = z.object({
  connectionId: id,
  newTxCount: z.number().int(),
  status: z.enum(['OK', 'ERROR']),
  error: z.string().nullable(),
});
export type SyncResult = z.infer<typeof syncResultSchema>;
export const syncAllResponse = z.object({ results: z.array(syncResultSchema) });

export const importCsvBody = z.object({
  institution,
  /** Account to attach to; defaults to the institution's first current account. */
  accountId: id.optional(),
  csv: z.string().min(1).max(5_000_000),
});
export const importCsvResponse = z.object({
  parsed: z.number().int(),
  imported: z.number().int(),
  duplicates: z.number().int(),
  skipped: z.number().int(),
});
export type ImportCsvResponse = z.infer<typeof importCsvResponse>;

/* ---------- transactions ---------- */

export const merchantRef = z.object({ id, merchantKey: z.string(), displayName: z.string() });

export const transactionSchema = z.object({
  id,
  accountId: id,
  accountName: z.string(),
  institution,
  bookingDate: instant,
  amount: money,
  currency: z.string(),
  amountEur: money,
  rawDescriptor: z.string(),
  merchant: merchantRef.nullable(),
  category: categoryRef.nullable(),
  status: txStatus,
  kind: txKind,
  categorisedBy,
  needsReview: z.boolean(),
  note: z.string().nullable(),
  /** Left out of budgets and safe to spend. */
  excluded: z.boolean(),
  tags: z.array(z.string()),
  flag: z.string().nullable(),
});
export type TransactionDto = z.infer<typeof transactionSchema>;

export const listTransactionsQuery = pageQuery.extend({
  accountId: id.optional(),
  categoryId: id.optional(),
  kind: txKind.optional(),
  needsReview: z.enum(['true', 'false']).optional(),
  minAmount: moneyInput.optional(),
  maxAmount: moneyInput.optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  q: z.string().max(100).optional(),
  status: txStatus.optional(),
  excluded: z.enum(['true', 'false']).optional(),
});
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuery>;

/* ---------- ask: how a typed question is read ---------- */

export const periodSchema = z.object({ from: dateOnly, to: dateOnly, label: z.string(), key: z.string() });
export const intentSchema = z.enum([
  'sum', 'count', 'average', 'list', 'top', 'compare', 'biggest', 'gloss', 'price', 'news', 'vault', 'owed', 'debt', 'afford',
  'safe', 'networth', 'runway', 'upcoming', 'subs', 'income', 'budget', 'balance',
]);

export const parsedQuerySchema = z.object({
  text: z.string(),
  via: z.enum(['rules', 'follow-up', 'learned']),
  intent: intentSchema,
  slug: z.string().nullable().optional(),
  merchantKey: z.string().nullable().optional(),
  institution: z.enum(['AIB', 'REVOLUT']).nullable().optional(),
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
  period: periodSchema.optional(),
  period2: periodSchema.optional(),
  periodExplicit: z.boolean().optional(),
  by: z.enum(['cat', 'mer']).optional(),
  personId: z.string().nullable().optional(),
  term: z.string().optional(),
  sym: z.string().optional(),
  topic: z.string().optional(),
  amount: z.number().nullable().optional(),
  item: z.string().optional(),
});
export type ParsedQueryDto = z.infer<typeof parsedQuerySchema>;


export const transactionPage = z.object({
  items: z.array(transactionSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int(),
  /** When the search box held a question such as "coffee over 4 last month", how it was read. */
  readAs: parsedQuerySchema.nullable().optional(),
});
export type TransactionPage = z.infer<typeof transactionPage>;

export const updateTransactionBody = z.object({
  note: z.string().max(500).nullable().optional(),
  /** Leave the payment out of budgets and safe to spend. */
  excluded: z.boolean().optional(),
  tags: z.array(z.string().min(1).max(30)).max(10).optional(),
});
export type UpdateTransactionBody = z.infer<typeof updateTransactionBody>;

export const setScope = z.enum(['merchant', 'once']);
export type SetScope = z.infer<typeof setScope>;

/** Inline category edit from the Transactions table. */
export const recategoriseTransactionBody = z.object({ categoryId: id, scope: setScope });
export const updatedCountResponse = z.object({ updatedCount: z.number().int() });
export type UpdatedCountResponse = z.infer<typeof updatedCountResponse>;

/* ---------- categorise loop ---------- */

export const categoriseRequestSchema = z.object({
  id,
  merchantKey: z.string(),
  displayName: z.string(),
  rawDescriptor: z.string(),
  askGroup,
  status: requestStatus,
  amount: money,
  bookingDate: instant,
  accountName: z.string(),
  institution,
  paymentCount: z.number().int(),
  suggestedCategories: z.array(categoryRef),
  notifiedAt: instant.nullable(),
});
export type CategoriseRequestDto = z.infer<typeof categoriseRequestSchema>;

export const categoriseQueueResponse = z.object({
  items: z.array(categoriseRequestSchema),
  count: z.number().int(),
});
export type CategoriseQueueResponse = z.infer<typeof categoriseQueueResponse>;

export const answerCategoriseBody = z.object({ categoryId: id, scope: setScope });
export type AnswerCategoriseBody = z.infer<typeof answerCategoriseBody>;

/* ---------- devices / notifications ---------- */

export const registerDeviceBody = z.object({
  platform: z.enum(['IOS', 'ANDROID', 'WEB']),
  token: z.string().min(1).max(4000),
});
export type RegisterDeviceBody = z.infer<typeof registerDeviceBody>;

export const testNotificationResponse = z.object({
  sent: z.number().int(),
  /** Body of a sample ask-me push, so a client can show a local notification when no push server exists. */
  sample: z.object({
    title: z.string(),
    body: z.string(),
    categoryIdentifier: z.string(),
    data: z.record(z.string(), z.string()),
  }),
});

export const pushPayload = z.object({
  kind: z.enum(['categorise', 'insight', 'digest', 'relink', 'signal', 'test']),
  title: z.string(),
  body: z.string(),
  categoryIdentifier: z.string().optional(),
  data: z.record(z.string(), z.string()).default({}),
});
export type PushPayload = z.infer<typeof pushPayload>;

export type RecategoriseTransactionBody = z.infer<typeof recategoriseTransactionBody>;
