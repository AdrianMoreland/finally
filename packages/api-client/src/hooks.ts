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
  CreateGoalBody,
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
  goals: ['goals'] as const,
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
    ['overview', 'transactions', 'queue', 'budgets', 'insights', 'accounts', 'investments', 'recurring', 'rules'].map((k) =>
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

export const useGoals = () => {
  const api = useApi();
  return useQuery({ queryKey: keys.goals, queryFn: api.goals });
};

export const useGoalMutations = () => {
  const api = useApi();
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: keys.goals });
  return {
    create: useMutation({
      mutationFn: (b: Omit<CreateGoalBody, 'accountId' | 'saved'> & Partial<Pick<CreateGoalBody, 'accountId' | 'saved'>>) => api.createGoal(b),
      onSuccess: done,
    }),
    update: useMutation({ mutationFn: (v: { id: string } & Partial<CreateGoalBody>) => api.updateGoal(v.id, v), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: string) => api.deleteGoal(id), onSuccess: done }),
  };
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
