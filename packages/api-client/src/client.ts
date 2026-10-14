import { z } from 'zod';
import {
  accountSchema,
  answerCategoriseBody,
  budgetsResponse,
  categoriseQueueResponse,
  categorySchema,
  compoundResponse,
  connectionSchema,
  convertResponse,
  emergencyFundResponse,
  fireResponse,
  goalSchema,
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
  type CreateCategoryBody,
  type CreateGoalBody,
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
  setNote = (id: string, note: string | null) => this.call(transactionSchema, 'PATCH', `/transactions/${id}`, { body: { note } });
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

  /* goals */
  goals = () => this.call(z.array(goalSchema), 'GET', '/goals');
  createGoal = (body: Omit<CreateGoalBody, 'accountId' | 'saved'> & Partial<Pick<CreateGoalBody, 'accountId' | 'saved'>>) =>
    this.call(goalSchema, 'POST', '/goals', { body });
  updateGoal = (id: string, body: Partial<CreateGoalBody>) => this.call(goalSchema, 'PATCH', `/goals/${id}`, { body });
  deleteGoal = (id: string) => this.call(okResponse, 'DELETE', `/goals/${id}`);

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
