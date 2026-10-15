import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  AnswerCategoriseBody,
  CheckState,
  CompleteSetupBody,
  CreatePersonBody,
  CreatePotBody,
  ParsedQueryDto,
  UpdateTransactionBody,
  CreateInstrumentBody,
  CreateLotBody,
  Institution,
  ListTransactionsQuery,
  RecategoriseTransactionBody,
  UpdateMeBody,
} from '@finally/contracts';
import { useApi } from './provider';

export const keys = {
  me: ['me'] as const,
  overview: ['overview'] as const,
  transactions: (q: object) => ['transactions', q] as const,
  queue: ['queue'] as const,
  categories: ['categories'] as const,
  rules: ['rules'] as const,
  accounts: ['accounts'] as const,
  connections: ['connections'] as const,
  budgets: (month?: string) => ['budgets', month ?? 'current'] as const,
  today: ['today'] as const,
  month: ['month'] as const,
  bills: ['bills'] as const,
  pots: ['pots'] as const,
  people: ['people'] as const,
  payday: ['payday'] as const,
  pins: ['pins'] as const,
  tax: (slip?: string) => ['tax', slip ?? 'latest'] as const,
  bonus: ['bonus'] as const,
  weekReview: ['review', 'week'] as const,
  monthClose: ['review', 'month'] as const,
  investingPlan: ['grow', 'investing'] as const,
  freedom: ['grow', 'freedom'] as const,
  paper: ['grow', 'paper'] as const,
  vault: ['grow', 'vault'] as const,
  found: ['setup', 'found'] as const,
  prefs: ['prefs'] as const,
  budgetSuggestions: ['budgets', 'suggestions'] as const,
  insights: ['insights'] as const,
  recurring: ['recurring'] as const,
  investments: ['investments'] as const,
  instruments: ['instruments'] as const,
  prices: (id: string, days: number) => ['prices', id, days] as const,
  emergencyFund: ['tools', 'emergency-fund'] as const,
};

/** Everything that derives from payments or categories needs a refresh after these change. */
export function invalidateMoney(qc: QueryClient): Promise<unknown> {
  return Promise.all(
    ['overview', 'today', 'month', 'bills', 'pots', 'people', 'payday', 'pins', 'review', 'transactions', 'queue', 'budgets', 'insights', 'accounts', 'investments', 'recurring', 'rules'].map((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    ),
  );
}

export const useMe = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.me, queryFn: api.me });
};

export const useUpdateMe = () => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateMeBody) => api.updateMe(body),
    onSuccess: (me) => {
      qc.setQueryData(keys.me, me);
      void qc.invalidateQueries({ queryKey: keys.overview });
      void qc.invalidateQueries({ queryKey: keys.investments });
    },
  });
};

export const useOverview = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.overview, queryFn: api.overview, staleTime: 30_000 });
};

export const useTransactions = (q: Omit<Partial<ListTransactionsQuery>, 'cursor'>) => {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: keys.transactions(q),
    queryFn: ({ pageParam }) => api.transactions({ ...q, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
};

export const useTransaction = (id: string | undefined) => {
  const api = useApi();
  return useQuery({ queryKey: ['transaction', id], queryFn: () => api.transaction(id!), enabled: Boolean(id) });
};

export const useRecategorise = () => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & RecategoriseTransactionBody) => api.recategorise(id, body),
    onSuccess: () => invalidateMoney(qc),
  });
};

export const useQueue = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.queue, queryFn: api.queue, staleTime: 15_000 });
};

export const useAnswer = () => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, ...body }: { requestId: string } & AnswerCategoriseBody) => api.answer(requestId, body),
    onSuccess: () => invalidateMoney(qc),
  });
};

export const useCategories = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.categories, queryFn: api.categories, staleTime: 5 * 60_000 });
};

export const useRules = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.rules, queryFn: api.rules });
};

export const useAccounts = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.accounts, queryFn: api.accounts });
};

export const useConnections = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.connections, queryFn: api.connections });
};

export const useSyncAll = () => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.syncAll,
    onSuccess: async () => {
      await invalidateMoney(qc);
      await qc.invalidateQueries({ queryKey: keys.connections });
    },
  });
};

export const useSyncConnection = () => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.syncConnection(id),
    onSuccess: async () => {
      await invalidateMoney(qc);
      await qc.invalidateQueries({ queryKey: keys.connections });
    },
  });
};

export const useStartConnection = () => {
  const api = useApi();
  return useMutation({
    mutationFn: ({ institution, returnTo }: { institution: Institution; returnTo?: 'web' | 'mobile' }) =>
      api.startConnection(institution, returnTo),
  });
};

export const useRemoveConnection = () => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.removeConnection(id),
    onSuccess: async () => {
      await invalidateMoney(qc);
      await qc.invalidateQueries({ queryKey: keys.connections });
    },
  });
};

export const useImportCsv = () => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { institution: Institution; csv: string }) => api.importCsv(v.institution, v.csv),
    onSuccess: () => invalidateMoney(qc),
  });
};

export const useBudgets = (month?: string) => {
  const api = useApi();
  return useQuery({ queryKey: keys.budgets(month), queryFn: () => api.budgets(month), placeholderData: keepPreviousData });
};

export const useUpsertBudget = () => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { categoryId: string; month: string; amount: string; rollover?: boolean }) => api.upsertBudget(v),
    onSuccess: (data) => {
      qc.setQueryData(keys.budgets(data.month), data);
      void qc.invalidateQueries({ queryKey: keys.overview });
      void qc.invalidateQueries({ queryKey: keys.insights });
    },
  });
};

const useInvalidate = (...roots: string[]) => {
  const qc = useQueryClient();
  return () => Promise.all(roots.map((k) => qc.invalidateQueries({ queryKey: [k] })));
};

/* ---- today, ask, month ---- */

export const useToday = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.today, queryFn: api.today, staleTime: 15_000 });
};

export const useSnooze = () => {
  const api = useApi();
  const done = useInvalidate('today', 'review');
  return useMutation({ mutationFn: (actionId: string) => api.snooze(actionId), onSuccess: done });
};

export const useUnsnoozeAll = () => {
  const api = useApi();
  const done = useInvalidate('today', 'review');
  return useMutation({ mutationFn: api.unsnoozeAll, onSuccess: done });
};

export const useMonth = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.month, queryFn: api.month, staleTime: 30_000 });
};

export const useAsk = () => {
  const api = useApi();
  return useMutation({ mutationFn: (v: { text: string; previous?: ParsedQueryDto | null }) => api.ask(v.text, v.previous) });
};

export const useAskEvaluate = () => {
  const api = useApi();
  return useMutation({ mutationFn: (query: ParsedQueryDto) => api.askEvaluate(query) });
};

export const useAskSuggestions = () => {
  const api = useApi();
  return useQuery({ queryKey: ['ask', 'suggestions'], queryFn: api.askSuggestions, staleTime: Infinity });
};

export const usePins = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.pins, queryFn: api.pins });
};

export const usePinMutations = () => {
  const api = useApi();
  const qc = useQueryClient();
  const set = (pins: Awaited<ReturnType<typeof api.pins>>) => {
    qc.setQueryData(keys.pins, pins);
    void qc.invalidateQueries({ queryKey: keys.today });
  };
  return {
    pin: useMutation({ mutationFn: (text: string) => api.pin(text), onSuccess: set }),
    unpin: useMutation({ mutationFn: (id: string) => api.unpin(id), onSuccess: set }),
  };
};

/* ---- money ---- */

export const useBills = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.bills, queryFn: api.bills });
};

export const useBillMutations = () => {
  const api = useApi();
  const qc = useQueryClient();
  const set = (b: Awaited<ReturnType<typeof api.bills>>) => {
    qc.setQueryData(keys.bills, b);
    void qc.invalidateQueries({ queryKey: keys.today });
    void qc.invalidateQueries({ queryKey: keys.payday });
  };
  return {
    cancel: useMutation({ mutationFn: (v: { id: string; cancelled: boolean }) => api.cancelRepeating(v.id, v.cancelled), onSuccess: set }),
    dismiss: useMutation({ mutationFn: (id: string) => api.dismissWarning(id), onSuccess: set }),
  };
};

export const useBudgetSuggestions = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.budgetSuggestions, queryFn: api.budgetSuggestions, staleTime: 5 * 60_000 });
};

export const usePatchTransaction = () => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string } & UpdateTransactionBody) => {
      const { id, ...body } = v;
      return api.patchTransaction(id, body);
    },
    onSuccess: () => invalidateMoney(qc),
  });
};

export const useWeekReview = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.weekReview, queryFn: api.weekReview });
};

export const useWeekReviewMutations = () => {
  const api = useApi();
  const qc = useQueryClient();
  const set = (r: Awaited<ReturnType<typeof api.weekReview>>) => {
    qc.setQueryData(keys.weekReview, r);
    void invalidateMoney(qc);
  };
  return {
    complete: useMutation({ mutationFn: (decision: string | null) => api.completeWeek(decision), onSuccess: set }),
    reopen: useMutation({ mutationFn: api.reopenWeek, onSuccess: set }),
  };
};

export const useMonthClose = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.monthClose, queryFn: api.monthClose });
};

export const useMonthCloseMutations = () => {
  const api = useApi();
  const qc = useQueryClient();
  const set = (r: Awaited<ReturnType<typeof api.monthClose>>) => {
    qc.setQueryData(keys.monthClose, r);
    void invalidateMoney(qc);
  };
  return {
    choose: useMutation({ mutationFn: (v: { value: string; label: string }) => api.chooseMonth(v.value, v.label), onSuccess: set }),
    reopen: useMutation({ mutationFn: api.reopenMonth, onSuccess: set }),
  };
};

/* ---- plan ---- */

export const usePayday = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.payday, queryFn: api.payday });
};

export const usePaydayMutations = () => {
  const api = useApi();
  const qc = useQueryClient();
  const set = (p: Awaited<ReturnType<typeof api.payday>>) => {
    qc.setQueryData(keys.payday, p);
    void invalidateMoney(qc);
  };
  return {
    setOrder: useMutation({ mutationFn: (v: { key: string; amount: string | null }) => api.setOrder(v.key, v.amount), onSuccess: set }),
    settings: useMutation({ mutationFn: (b: Parameters<typeof api.updatePlanSettings>[0]) => api.updatePlanSettings(b), onSuccess: set }),
  };
};

export const usePots = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.pots, queryFn: api.pots });
};

export const usePotMutations = () => {
  const api = useApi();
  const qc = useQueryClient();
  const set = (p: Awaited<ReturnType<typeof api.pots>>) => {
    qc.setQueryData(keys.pots, p);
    void invalidateMoney(qc);
  };
  return {
    create: useMutation({ mutationFn: (b: Parameters<typeof api.createPot>[0]) => api.createPot(b), onSuccess: set }),
    update: useMutation({ mutationFn: (v: { id: string } & Partial<CreatePotBody>) => { const { id, ...b } = v; return api.updatePot(id, b); }, onSuccess: set }),
    remove: useMutation({ mutationFn: (id: string) => api.removePot(id), onSuccess: set }),
    addWish: useMutation({ mutationFn: (v: { potId: string; name: string; price: string }) => api.addWish(v.potId, { name: v.name, price: v.price }), onSuccess: set }),
    setBought: useMutation({ mutationFn: (v: { id: string; bought: boolean }) => api.setWishBought(v.id, v.bought), onSuccess: set }),
    removeWish: useMutation({ mutationFn: (id: string) => api.removeWish(id), onSuccess: set }),
  };
};

export const usePeople = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.people, queryFn: api.people });
};

export const usePeopleMutations = () => {
  const api = useApi();
  const qc = useQueryClient();
  const set = (p: Awaited<ReturnType<typeof api.people>>) => {
    qc.setQueryData(keys.people, p);
    void invalidateMoney(qc);
  };
  return {
    create: useMutation({ mutationFn: (b: Parameters<typeof api.createPerson>[0]) => api.createPerson(b), onSuccess: set }),
    update: useMutation({ mutationFn: (v: { id: string } & Partial<CreatePersonBody>) => { const { id, ...b } = v; return api.updatePerson(id, b); }, onSuccess: set }),
    remove: useMutation({ mutationFn: (id: string) => api.removePerson(id), onSuccess: set }),
    addPayment: useMutation({ mutationFn: (v: { id: string; amount: string; note?: string | null }) => api.addPersonPayment(v.id, { amount: v.amount, note: v.note ?? null }), onSuccess: set }),
    removePayment: useMutation({ mutationFn: (v: { id: string; paymentId: string }) => api.removePersonPayment(v.id, v.paymentId), onSuccess: set }),
    plan: useMutation({ mutationFn: (b: Parameters<typeof api.updatePaybackPlan>[0]) => api.updatePaybackPlan(b), onSuccess: set }),
  };
};

export const useTax = (slip?: string) => {
  const api = useApi();
  return useQuery({ queryKey: keys.tax(slip), queryFn: () => api.tax(slip), placeholderData: keepPreviousData });
};

export const useTaxMutations = () => {
  const api = useApi();
  const done = useInvalidate('tax', 'today', 'grow');
  return {
    update: useMutation({ mutationFn: (b: Record<string, unknown>) => api.updateTax(b), onSuccess: done }),
    setCheck: useMutation({ mutationFn: (v: { itemId: string; state: CheckState }) => api.setTaxCheck(v.itemId, v.state), onSuccess: done }),
  };
};

export const useBonus = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.bonus, queryFn: api.bonus, placeholderData: keepPreviousData });
};

export const useUpdateBonus = () => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: Record<string, unknown>) => api.updateBonus(b),
    onSuccess: (d) => {
      qc.setQueryData(keys.bonus, d);
      void qc.invalidateQueries({ queryKey: ['grow'] });
    },
  });
};

/* ---- grow ---- */

export const useInvestingPlan = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.investingPlan, queryFn: api.investingPlan, placeholderData: keepPreviousData });
};

export const useUpdateInvesting = () => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: Record<string, unknown>) => api.updateInvesting(b),
    onSuccess: (d) => qc.setQueryData(keys.investingPlan, d),
  });
};

export const useFreedom = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.freedom, queryFn: api.freedom, placeholderData: keepPreviousData });
};

export const useUpdateFreedom = () => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: Record<string, unknown>) => api.updateFreedom(b),
    onSuccess: (d) => {
      qc.setQueryData(keys.freedom, d);
      void qc.invalidateQueries({ queryKey: keys.today });
      void qc.invalidateQueries({ queryKey: keys.pots });
    },
  });
};

export const usePaper = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.paper, queryFn: api.paper });
};

export const usePaperTrade = () => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: Parameters<typeof api.paperTrade>[0]) => api.paperTrade(b),
    onSuccess: (d) => {
      qc.setQueryData(keys.paper, d);
      void qc.invalidateQueries({ queryKey: keys.investingPlan });
    },
  });
};

export const useVault = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.vault, queryFn: api.vault });
};

export const useVaultMutations = () => {
  const api = useApi();
  const qc = useQueryClient();
  const set = (v: Awaited<ReturnType<typeof api.vault>>) => qc.setQueryData(keys.vault, v);
  return {
    add: useMutation({ mutationFn: (v: { product: string; qty: number }) => api.addVault(v.product, v.qty), onSuccess: set }),
    remove: useMutation({ mutationFn: (index: number) => api.removeVault(index), onSuccess: set }),
  };
};

/* ---- setup, prefs ---- */

export const useFound = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.found, queryFn: api.found, staleTime: 60_000 });
};

export const useCompleteSetup = () => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: CompleteSetupBody) => api.completeSetup(b),
    onSuccess: async () => {
      await invalidateMoney(qc);
      await qc.invalidateQueries({ queryKey: keys.me });
    },
  });
};

export const usePrefs = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.prefs, queryFn: api.prefs });
};

export const usePatchPrefs = () => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: Record<string, unknown>) => api.patchPrefs(b),
    onSuccess: (d) => {
      qc.setQueryData(keys.prefs, d);
      void qc.invalidateQueries({ queryKey: keys.today });
    },
  });
};

export const useInsights = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.insights, queryFn: api.insights });
};

export const useMarkInsightSeen = () => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api.markInsightSeen(id), onSuccess: () => qc.invalidateQueries({ queryKey: keys.insights }) });
};

export const useRecurring = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.recurring, queryFn: api.recurring });
};

export const useInvestments = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.investments, queryFn: api.investments, staleTime: 60_000 });
};

export const useInstrumentMutations = () => {
  const api = useApi();
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: keys.investments });
  return {
    createInstrument: useMutation({ mutationFn: (b: Parameters<typeof api.createInstrument>[0]) => api.createInstrument(b), onSuccess: done }),
    deleteInstrument: useMutation({ mutationFn: (id: string) => api.deleteInstrument(id), onSuccess: done }),
    createLot: useMutation({ mutationFn: (b: Omit<CreateLotBody, 'fees' | 'wrapper'> & Partial<CreateLotBody>) => api.createLot(b), onSuccess: done }),
    deleteLot: useMutation({ mutationFn: (id: string) => api.deleteLot(id), onSuccess: done }),
  };
};

export const useInstruments = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.instruments, queryFn: api.instruments });
};

export const usePriceSeries = (id: string | undefined, days = 180) => {
  const api = useApi();
  return useQuery({ queryKey: keys.prices(id ?? '', days), queryFn: () => api.priceSeries(id!, days), enabled: Boolean(id) });
};

export const useEmergencyFund = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.emergencyFund, queryFn: api.emergencyFund });
};

export type { CreateInstrumentBody };
