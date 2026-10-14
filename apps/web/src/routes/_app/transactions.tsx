import {
  eur,
  shortDate,
  useAccounts,
  useCategories,
  useRecategorise,
  useTransactions,
} from '@finally/api-client';
import type { CategoryDto, TransactionDto } from '@finally/contracts';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Check, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { CategoryChip, EmptyState, ErrorNote, LoadingBlock, PageHeader, Panel } from '@/components/common';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { categoryVar } from '@/lib/category';
import { cn } from '@/lib/utils';

const search = z.object({
  q: z.string().optional(),
  account: z.string().optional(),
  category: z.string().optional(),
  kind: z.enum(['SPEND', 'INCOME', 'TRANSFER', 'REFUND']).optional(),
  review: z.boolean().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  min: z.string().optional(),
  max: z.string().optional(),
});

export const Route = createFileRoute('/_app/transactions')({
  validateSearch: search,
  component: TransactionsPage,
});

const ROW_H = 58;
const COLS = 'grid grid-cols-[64px_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)_96px] items-center gap-x-3 px-2.5';

function CategoryPicker({ tx, categories }: { tx: TransactionDto; categories: CategoryDto[] }): ReactNode {
  const [open, setOpen] = useState(false);
  const [everyPayment, setEveryPayment] = useState(true);
  const recategorise = useRecategorise();
  const pickable = categories.filter((c) => !c.archived && c.group !== 'TRANSFER');
  const scope = tx.merchant && everyPayment ? 'merchant' : 'once';

  const choose = (c: CategoryDto): void => {
    recategorise.mutate(
      { id: tx.id, categoryId: c.id, scope },
      {
        onSuccess: (r) => {
          setOpen(false);
          toast.success(
            scope === 'merchant'
              ? `${tx.merchant?.displayName ?? 'Merchant'} → ${c.name}. ${r.updatedCount} payment${r.updatedCount === 1 ? '' : 's'} updated; future ones sort themselves.`
              : `Changed to ${c.name} for this payment only.`,
          );
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not change the category'),
      },
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span>
          <CategoryChip category={tx.category} kind={tx.kind} onClick={tx.kind === 'TRANSFER' ? undefined : () => undefined} />
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[260px] p-0">
        <div className="max-h-[280px] overflow-y-auto p-1.5">
          {pickable.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={recategorise.isPending}
              onClick={() => choose(c)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-raised"
            >
              <i className="size-2.5 rounded-full" style={{ background: categoryVar(c) }} />
              <span className={cn(c.parentId && 'pl-3')}>{c.name}</span>
              {tx.category?.id === c.id ? <Check className="ml-auto size-4 text-brand" aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
        {tx.merchant ? (
          <label className="flex items-center justify-between gap-3 border-t border-rule px-3 py-2.5 text-[12.5px] text-ink-2">
            <span>Apply to every payment from {tx.merchant.displayName}</span>
            <Switch checked={everyPayment} onCheckedChange={setEveryPayment} aria-label="Apply to every payment from this merchant" />
          </label>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function TransactionsPage() {
  const params = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const accounts = useAccounts();
  const categories = useCategories();
  const [q, setQ] = useState(params.q ?? '');
  const debouncedQ = useDebounced(q);

  useEffect(() => {
    if ((params.q ?? '') !== debouncedQ) void navigate({ search: (prev) => ({ ...prev, q: debouncedQ || undefined }), replace: true });
  }, [debouncedQ, navigate, params.q]);

  const query = useMemo(
    () => ({
      limit: 100,
      q: params.q,
      accountId: params.account,
      categoryId: params.category === 'sort' ? undefined : params.category,
      needsReview: params.category === 'sort' || params.review ? ('true' as const) : undefined,
      kind: params.kind,
      from: params.from,
      to: params.to,
      minAmount: params.min,
      maxAmount: params.max,
    }),
    [params],
  );
  const tx = useTransactions(query);
  const rows = useMemo(() => tx.data?.pages.flatMap((p) => p.items) ?? [], [tx.data]);
  const total = tx.data?.pages[0]?.total ?? 0;

  const set = (patch: Partial<z.infer<typeof search>>): void => {
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  };

  const helper = createColumnHelper<TransactionDto>();
  const columns = useMemo(
    () => [
      helper.accessor('bookingDate', { header: 'Date' }),
      helper.accessor('rawDescriptor', { header: 'Merchant' }),
      helper.display({ id: 'category', header: 'Category' }),
      helper.accessor('accountName', { header: 'Account' }),
      helper.accessor('amountEur', { header: 'Amount' }),
    ],
    [helper],
  );
  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() });
  const tableRows = table.getRowModel().rows;

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 10,
  });
  const items = virtual.getVirtualItems();
  const last = items.at(-1);
  useEffect(() => {
    if (last && last.index >= tableRows.length - 15 && tx.hasNextPage && !tx.isFetchingNextPage) void tx.fetchNextPage();
  }, [last, tableRows.length, tx]);

  const cats = categories.data ?? [];
  const top = cats.filter((c) => !c.parentId && !c.archived);

  return (
    <>
      <PageHeader
        eyebrow="Every payment"
        title="Transactions"
        lead="Transfers between your own accounts are kept out of spending. Click a category to change it."
      />

      <div className="mb-3.5 flex flex-wrap items-center gap-2.5" role="search">
        <div className="relative min-w-[200px] flex-1 basis-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search merchant or bank text" aria-label="Search payments" className="pl-8" />
        </div>
        <Select value={params.account ?? 'all'} onValueChange={(v) => set({ account: v === 'all' ? undefined : v })}>
          <SelectTrigger aria-label="Account" className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.data?.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={params.category ?? 'all'} onValueChange={(v) => set({ category: v === 'all' ? undefined : v })}>
          <SelectTrigger aria-label="Category" className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="sort">To sort</SelectItem>
            {top.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={params.kind ?? 'all'} onValueChange={(v) => set({ kind: v === 'all' ? undefined : (v as 'SPEND') })}>
          <SelectTrigger aria-label="Kind" className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            <SelectItem value="SPEND">Spending</SelectItem>
            <SelectItem value="INCOME">Income</SelectItem>
            <SelectItem value="REFUND">Refunds</SelectItem>
            <SelectItem value="TRANSFER">Transfers</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={params.from ?? ''} onChange={(e) => set({ from: e.target.value || undefined })} aria-label="From date" className="w-[150px]" />
        <Input type="date" value={params.to ?? ''} onChange={(e) => set({ to: e.target.value || undefined })} aria-label="To date" className="w-[150px]" />
        <Input inputMode="decimal" placeholder="Min €" value={params.min ?? ''} onChange={(e) => set({ min: e.target.value || undefined })} aria-label="Minimum amount" className="w-[92px]" />
        <Input inputMode="decimal" placeholder="Max €" value={params.max ?? ''} onChange={(e) => set({ max: e.target.value || undefined })} aria-label="Maximum amount" className="w-[92px]" />
        {Object.values(params).some((v) => v !== undefined && v !== '') ? (
          <button type="button" className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand" onClick={() => { setQ(''); void navigate({ search: {}, replace: true }); }}>
            <X className="size-3.5" aria-hidden="true" /> Clear
          </button>
        ) : null}
      </div>

      {tx.error ? (
        <ErrorNote error={tx.error} retry={() => void tx.refetch()} />
      ) : tx.isLoading ? (
        <LoadingBlock className="h-96" />
      ) : rows.length === 0 ? (
        <EmptyState title="No payments match">Try clearing a filter.</EmptyState>
      ) : (
        <Panel flush>
          <div className="px-2.5 pb-1.5 pt-2 text-[12px] text-ink-3" aria-live="polite">
            {rows.length} of {total} payments
          </div>
          <div role="table" aria-label="Transactions" aria-rowcount={total}>
            <div role="row" className={cn(COLS, 'border-b border-rule pb-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3')}>
              {table.getHeaderGroups()[0]?.headers.map((h, i) => (
                <div key={h.id} role="columnheader" className={cn(i === 4 && 'text-right')}>
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </div>
              ))}
            </div>
            <div ref={scrollRef} className="h-[calc(100svh-360px)] min-h-[320px] overflow-auto" role="rowgroup">
              <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
                {items.map((vi) => {
                  const t = tableRows[vi.index]!.original;
                  const needs = !t.category && t.kind !== 'TRANSFER';
                  return (
                    <div
                      key={t.id}
                      role="row"
                      aria-rowindex={vi.index + 2}
                      className={cn(COLS, 'absolute left-0 right-0 border-b border-rule', needs && 'bg-[color-mix(in_srgb,var(--marker)_14%,transparent)]')}
                      style={{ height: ROW_H, transform: `translateY(${vi.start}px)` }}
                    >
                      <div role="cell" className="num whitespace-nowrap text-ink-2">{shortDate(t.bookingDate)}</div>
                      <div role="cell" className="min-w-0">
                        <div className="truncate font-semibold">{t.merchant?.displayName ?? t.rawDescriptor}</div>
                        <div className="mono-raw truncate">{t.rawDescriptor}</div>
                      </div>
                      <div role="cell">
                        <CategoryPicker tx={t} categories={cats} />
                      </div>
                      <div role="cell" className="truncate text-ink-3">
                        {t.accountName}
                        {t.status === 'PENDING' ? <span className="ml-1.5 text-[11px] text-warn">pending</span> : null}
                      </div>
                      <div role="cell" className={cn('num text-right font-semibold', Number(t.amountEur) > 0 && 'text-good')}>
                        {eur(t.amountEur, { signed: true })}
                      </div>
                    </div>
                  );
                })}
              </div>
              {tx.isFetchingNextPage ? <div className="p-3 text-center text-[12px] text-ink-3">Loading more…</div> : null}
            </div>
          </div>
        </Panel>
      )}
    </>
  );
}
