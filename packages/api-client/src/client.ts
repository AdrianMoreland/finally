import { z } from 'zod';
import {
  accountSchema,
  answerCategoriseBody,
  askResponse,
  billsSchema,
  bonusSchema,
  foundSchema,
  freedomSchema,
  investingPlanSchema,
  monthCloseSchema,
  monthSchema,
  paperSchema,
  paydayPlanSchema,
  peopleSchema,
  pinSchema,
  potsSchema,
  taxSchema,
  todaySchema,
  userPrefs,
  vaultSchema,
  weeklyReviewSchema,
  budgetsResponse,
  categoriseQueueResponse,
  categorySchema,
  compoundResponse,
  connectionSchema,
  convertResponse,
  emergencyFundResponse,
  fireResponse,
  importCsvResponse,
  insightsResponse,
  instrumentSchema,
  investmentsSchema,
  loanResponse,
  lotSchema,
  meSchema,
  okResponse,
  overviewSchema,
  priceSeriesSchema,
  recurringSchema,
  ruleSchema,
  signalSchema,
  startConnectionResponse,
  syncAllResponse,
  syncResultSchema,
  taxRuleSchema,
  testNotificationResponse,
  transactionPage,
  transactionSchema,
  updatedCountResponse,
  whereShouldItGoResponse,
  type AnswerCategoriseBody,
  type CheckState,
  type CompleteSetupBody,
  type CreatePersonBody,
  type CreatePotBody,
  type ParsedQueryDto,
  type UpdateTransactionBody,
  type CreateCategoryBody,
  type CreateInstrumentBody,
  type CreateLotBody,
  type CreateRuleBody,
  type Institution,
  type ListTransactionsQuery,
  type RecategoriseTransactionBody,
  type RegisterDeviceBody,
  type UpdateCategoryBody,
  type UpdateMeBody,
  type UpsertBudgetBody,
} from '@finally/contracts';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Returns the current Supabase access token, or null when signed out. */
  getToken: () => Promise<string | null>;
  /** Called on 401 so the app can sign the user out. */
  onUnauthorized?: () => void;
  fetchImpl?: typeof fetch;
}

type Query = Record<string, string | number | boolean | undefined | null>;

const qs = (q?: Query): string => {
  if (!q) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

/** Typed client for the Finally API. Every response is validated against its Zod schema from @finally/contracts. */
export class FinallyApi {
  constructor(private readonly opts: ApiClientOptions) {}

  private async raw(method: string, path: string, init: { query?: Query; body?: unknown } = {}): Promise<Response> {
    const token = await this.opts.getToken();
    const f = this.opts.fetchImpl ?? fetch;
    const res = await f(`${this.opts.baseUrl.replace(/\/$/, '')}${path}${qs(init.query)}`, {
      method,
      headers: {
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        accept: 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    if (res.status === 401) this.opts.onUnauthorized?.();
    if (!res.ok) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = undefined;
      }
      const message = (body as { message?: unknown } | undefined)?.message;
      throw new ApiError(res.status, typeof message === 'string' ? message : `Request failed (${res.status})`, body);
    }
    return res;
  }

  private async call<S extends z.ZodType>(
    schema: S,
    method: string,
    path: string,
    init: { query?: Query; body?: unknown } = {},
  ): Promise<z.infer<S>> {
    const res = await this.raw(method, path, init);
    return schema.parse(await res.json());
  }

  /* me */
  me = () => this.call(meSchema, 'GET', '/me');
  updateMe = (body: UpdateMeBody) => this.call(meSchema, 'PATCH', '/me', { body });
  deleteAllData = () => this.call(okResponse, 'DELETE', '/me/data', { body: { confirm: 'DELETE' } });
  /** Raw download for the Settings export buttons. */
  exportData = async (format: 'csv' | 'json'): Promise<Blob> => (await this.raw('GET', '/me/export', { query: { format } })).blob();

  /* overview */
  overview = () => this.call(overviewSchema, 'GET', '/overview');

  /* transactions */
  transactions = (q: Partial<ListTransactionsQuery>) =>
    this.call(transactionPage, 'GET', '/transactions', { query: q as Query });
  transaction = (id: string) => this.call(transactionSchema, 'GET', `/transactions/${id}`);
  setNote = (id: string, note: string | null) => this.call(transactionSchema, 'PATCH', `/transactions/${id}`, { body: { note } });
  patchTransaction = (id: string, body: UpdateTransactionBody) => this.call(transactionSchema, 'PATCH', `/transactions/${id}`, { body });
  recategorise = (id: string, body: RecategoriseTransactionBody) =>
    this.call(updatedCountResponse, 'POST', `/transactions/${id}/category`, { body });

  /* categorise */
  queue = () => this.call(categoriseQueueResponse, 'GET', '/categorise/queue');
  answer = (requestId: string, body: AnswerCategoriseBody) =>
    this.call(updatedCountResponse, 'POST', `/categorise/${requestId}`, { body: answerCategoriseBody.parse(body) });

  /* categories & rules */
  categories = () => this.call(z.array(categorySchema), 'GET', '/categories');
  createCategory = (body: CreateCategoryBody) => this.call(categorySchema, 'POST', '/categories', { body });
  updateCategory = (id: string, body: UpdateCategoryBody) => this.call(categorySchema, 'PATCH', `/categories/${id}`, { body });
  rules = () => this.call(z.array(ruleSchema), 'GET', '/rules');
  createRule = (body: Omit<CreateRuleBody, 'priority'> & { priority?: number }) => this.call(ruleSchema, 'POST', '/rules', { body });
  updateRule = (id: string, body: { categoryId?: string; priority?: number; active?: boolean }) =>
    this.call(ruleSchema, 'PATCH', `/rules/${id}`, { body });
  deleteRule = (id: string) => this.call(okResponse, 'DELETE', `/rules/${id}`);

  /* banking */
  accounts = () => this.call(z.array(accountSchema), 'GET', '/accounts');
  setAccountNetWorth = (id: string, includeInNetWorth: boolean) =>
    this.call(accountSchema, 'PATCH', `/accounts/${id}`, { body: { includeInNetWorth } });
  connections = () => this.call(z.array(connectionSchema), 'GET', '/banking/connections');
  startConnection = (institution: Institution, returnTo: 'web' | 'mobile' = 'web') =>
    this.call(startConnectionResponse, 'POST', '/banking/connections', { body: { institution, returnTo } });
  syncConnection = (id: string) => this.call(syncResultSchema, 'POST', `/banking/connections/${id}/sync`);
  syncAll = () => this.call(syncAllResponse, 'POST', '/banking/sync');
  removeConnection = (id: string) => this.call(okResponse, 'DELETE', `/banking/connections/${id}`);
  importCsv = (institution: Institution, csv: string, accountId?: string) =>
    this.call(importCsvResponse, 'POST', '/banking/import', { body: { institution, csv, accountId } });

  /* budgets */
  budgets = (month?: string) => this.call(budgetsResponse, 'GET', '/budgets', { query: { month } });
  upsertBudget = (body: Omit<UpsertBudgetBody, 'rollover'> & { rollover?: boolean }) =>
    this.call(budgetsResponse, 'PUT', '/budgets', { body: { rollover: false, ...body } });
  removeBudget = (categoryId: string, month: string) =>
    this.call(budgetsResponse, 'DELETE', `/budgets/${categoryId}`, { query: { month } });

  /* today, ask, month */
  today = () => this.call(todaySchema, 'GET', '/today');
  snooze = (actionId: string) => this.call(okResponse, 'POST', '/today/snooze', { body: { actionId } });
  unsnoozeAll = () => this.call(okResponse, 'DELETE', '/today/snooze');
  ask = (text: string, previous?: ParsedQueryDto | null) => this.call(askResponse, 'POST', '/ask', { body: { text, previous: previous ?? null } });
  askEvaluate = (query: ParsedQueryDto) => this.call(askResponse, 'POST', '/ask/evaluate', { body: { query } });
  askSuggestions = () => this.call(z.object({ items: z.array(z.string()) }), 'GET', '/ask/suggestions');
  pins = () => this.call(z.array(pinSchema), 'GET', '/ask/pins');
  pin = (text: string) => this.call(z.array(pinSchema), 'POST', '/ask/pins', { body: { text } });
  unpin = (id: string) => this.call(z.array(pinSchema), 'DELETE', `/ask/pins/${id}`);
  month = () => this.call(monthSchema, 'GET', '/month');

  /* money: bills, review */
  bills = () => this.call(billsSchema, 'GET', '/bills');
  cancelRepeating = (id: string, cancelled: boolean) => this.call(billsSchema, 'POST', '/bills/cancel', { body: { id, cancelled } });
  dismissWarning = (id: string) => this.call(billsSchema, 'POST', '/bills/dismiss', { body: { id } });
  weekReview = () => this.call(weeklyReviewSchema, 'GET', '/review/week');
  completeWeek = (decision: string | null) => this.call(weeklyReviewSchema, 'POST', '/review/week', { body: { decision } });
  reopenWeek = () => this.call(weeklyReviewSchema, 'DELETE', '/review/week');
  monthClose = () => this.call(monthCloseSchema, 'GET', '/review/month');
  chooseMonth = (value: string, label: string) => this.call(monthCloseSchema, 'POST', '/review/month', { body: { value, label } });
  reopenMonth = () => this.call(monthCloseSchema, 'DELETE', '/review/month');
  budgetSuggestions = () => this.call(foundSchema.shape.suggestedBudgets, 'GET', '/budgets/suggestions');

  /* plan: payday, pots, people, tax, bonus */
  payday = () => this.call(paydayPlanSchema, 'GET', '/plan/payday');
  setOrder = (key: string, amount: string | null) => this.call(paydayPlanSchema, 'PUT', `/plan/orders/${key}`, { body: { amount } });
  updatePlanSettings = (body: { salaryOnly?: boolean; lifestyleGuard?: boolean; buffer?: string; paydayDayOfMonth?: number }) =>
    this.call(paydayPlanSchema, 'PUT', '/plan/settings', { body });
  pots = () => this.call(potsSchema, 'GET', '/pots');
  createPot = (body: Partial<CreatePotBody> & Pick<CreatePotBody, 'name' | 'type'>) => this.call(potsSchema, 'POST', '/pots', { body });
  updatePot = (id: string, body: Partial<CreatePotBody>) => this.call(potsSchema, 'PATCH', `/pots/${id}`, { body });
  removePot = (id: string) => this.call(potsSchema, 'DELETE', `/pots/${id}`);
  addWish = (potId: string, body: { name: string; price: string }) => this.call(potsSchema, 'POST', `/pots/${potId}/wishlist`, { body });
  setWishBought = (id: string, bought: boolean) => this.call(potsSchema, 'PATCH', `/pots/wishlist/${id}`, { body: { bought } });
  removeWish = (id: string) => this.call(potsSchema, 'DELETE', `/pots/wishlist/${id}`);
  people = () => this.call(peopleSchema, 'GET', '/people');
  createPerson = (body: Partial<CreatePersonBody> & Pick<CreatePersonBody, 'name' | 'direction' | 'amount'>) => this.call(peopleSchema, 'POST', '/people', { body });
  updatePerson = (id: string, body: Partial<CreatePersonBody>) => this.call(peopleSchema, 'PATCH', `/people/${id}`, { body });
  removePerson = (id: string) => this.call(peopleSchema, 'DELETE', `/people/${id}`);
  addPersonPayment = (id: string, body: { amount: string; paidOn?: string; note?: string | null }) => this.call(peopleSchema, 'POST', `/people/${id}/payments`, { body });
  removePersonPayment = (id: string, paymentId: string) => this.call(peopleSchema, 'DELETE', `/people/${id}/payments/${paymentId}`);
  updatePaybackPlan = (body: { monthly?: string; order?: 'smallest' | 'largest' | 'custom'; custom?: string[]; bonusToDebt?: string }) =>
    this.call(peopleSchema, 'PUT', '/people/plan', { body });
  tax = (slip?: string) => this.call(taxSchema, 'GET', '/tax', { query: { slip } });
  updateTax = (body: Record<string, unknown>) => this.call(taxSchema, 'PUT', '/tax', { body });
  setTaxCheck = (itemId: string, state: CheckState) => this.call(taxSchema, 'PUT', `/tax/checks/${itemId}`, { body: { state } });
  bonus = () => this.call(bonusSchema, 'GET', '/bonus');
  updateBonus = (body: Record<string, unknown>) => this.call(bonusSchema, 'PUT', '/bonus', { body });

  /* grow */
  investingPlan = () => this.call(investingPlanSchema, 'GET', '/grow/investing');
  updateInvesting = (body: Record<string, unknown>) => this.call(investingPlanSchema, 'PUT', '/grow/investing', { body });
  freedom = () => this.call(freedomSchema, 'GET', '/grow/freedom');
  updateFreedom = (body: Record<string, unknown>) => this.call(freedomSchema, 'PUT', '/grow/freedom', { body });
  paper = () => this.call(paperSchema, 'GET', '/grow/paper');
  paperTrade = (body: { action: 'buy' | 'sell' | 'advance' | 'guard-keep' | 'guard-sell'; symbol?: string; amount?: string }) =>
    this.call(paperSchema, 'POST', '/grow/paper', { body });
  vault = () => this.call(vaultSchema, 'GET', '/grow/vault');
  addVault = (product: string, qty: number) => this.call(vaultSchema, 'POST', '/grow/vault', { body: { product, qty } });
  removeVault = (index: number) => this.call(vaultSchema, 'DELETE', `/grow/vault/${index}`);

  /* setup, prefs */
  found = () => this.call(foundSchema, 'GET', '/setup/found');
  completeSetup = (body: CompleteSetupBody) => this.call(okResponse, 'POST', '/setup/complete', { body });
  prefs = () => this.call(userPrefs, 'GET', '/me/prefs');
  patchPrefs = (body: Record<string, unknown>) => this.call(userPrefs, 'PATCH', '/me/prefs', { body });

  /* insights */
  insights = () => this.call(insightsResponse, 'GET', '/insights');
  refreshInsights = () => this.call(insightsResponse, 'POST', '/insights/refresh');
  markInsightSeen = (id: string) => this.call(okResponse, 'POST', `/insights/${id}/seen`);
  recurring = () => this.call(z.array(recurringSchema), 'GET', '/recurring');

  /* investments */
  investments = () => this.call(investmentsSchema, 'GET', '/investments');
  signals = () => this.call(z.array(signalSchema), 'GET', '/investments/signals');
  taxRules = () => this.call(z.array(taxRuleSchema), 'GET', '/investments/tax-rules');
  instruments = () => this.call(z.array(instrumentSchema), 'GET', '/instruments');
  createInstrument = (body: Omit<CreateInstrumentBody, 'isin' | 'exchange' | 'currency'> & Partial<CreateInstrumentBody>) =>
    this.call(instrumentSchema, 'POST', '/instruments', { body });
  deleteInstrument = (id: string) => this.call(okResponse, 'DELETE', `/instruments/${id}`);
  priceSeries = (id: string, days = 180) => this.call(priceSeriesSchema, 'GET', `/instruments/${id}/prices`, { query: { days } });
  lots = (instrumentId?: string) => this.call(z.array(lotSchema), 'GET', '/lots', { query: { instrumentId } });
  createLot = (body: Omit<CreateLotBody, 'fees' | 'wrapper'> & Partial<CreateLotBody>) => this.call(lotSchema, 'POST', '/lots', { body });
  updateLot = (id: string, body: Record<string, unknown>) => this.call(lotSchema, 'PATCH', `/lots/${id}`, { body });
  deleteLot = (id: string) => this.call(okResponse, 'DELETE', `/lots/${id}`);

  /* tools */
  compound = (body: { initial: string; monthly: string; annualReturnPct: number; years: number }) =>
    this.call(compoundResponse, 'POST', '/tools/compound', { body });
  emergencyFund = () => this.call(emergencyFundResponse, 'GET', '/tools/emergency-fund');
  fire = (body: { annualSpend: string; withdrawalRatePct?: number; currentPortfolio?: string; monthlyContribution?: string; annualReturnPct?: number }) =>
    this.call(fireResponse, 'POST', '/tools/fire', { body });
  loan = (body: { principal: string; annualRatePct: number; termYears: number; monthlyOverpayment?: string }) =>
    this.call(loanResponse, 'POST', '/tools/loan', { body });
  whereShouldItGo = (body: { amount: string; years: number; annualReturnPct?: number }) =>
    this.call(whereShouldItGoResponse, 'POST', '/tools/where-should-it-go', { body });
  convert = (amount: string, from: string, to: string) => this.call(convertResponse, 'GET', '/tools/convert', { query: { amount, from, to } });

  /* devices & notifications */
  registerDevice = (body: RegisterDeviceBody) => this.call(okResponse, 'POST', '/devices', { body });
  unregisterDevice = (body: RegisterDeviceBody) => this.call(okResponse, 'DELETE', '/devices', { body });
  testNotification = () => this.call(testNotificationResponse, 'POST', '/notifications/test');
  vapidKey = () => this.call(z.object({ publicKey: z.string().nullable() }), 'GET', '/notifications/vapid-key');
}
