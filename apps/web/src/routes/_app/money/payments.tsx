import {
  eur,
  longDate,
  maskText,
  shortDate,
  useAccounts,
  useCategories,
  usePatchTransaction,
  useRecategorise,
  useTransactions,
} from '@finally/api-client';
import type { CategoryDto, TransactionDto } from '@finally/contracts';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Check, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { CategoryChip, EmptyState, ErrorNote, LoadingBlock, PageHeader, Panel } from '@/components/common';
import { Callout, Chip, Seg } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { categoryVar } from '@/lib/category';
import { cn } from '@/lib/utils';

const search = z.object({
  q: z.string().optional(),
  account: z.string().optional(),
  category: z.string().optional(),
  kind: z.enum(['SPEND', 'INCOME', 'TRANSFER', 'REFUND', 'SHARE']).optional(),
  status: z.enum(['PENDING', 'SORT', 'EXCLUDED']).optional(),
});

export const Route = createFileRoute('/_app/money/payments')({
  validateSearch: search,
  component: PaymentsPage,
});

function CategoryPicker({ tx, categories, onDone }: { tx: TransactionDto; categories: CategoryDto[]; onDone?: () => void }): ReactNode {
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
          onDone?.();
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
        <span onClick={(e) => e.stopPropagation()}>
          <CategoryChip category={tx.category} kind={tx.kind} onClick={tx.kind === 'TRANSFER' ? undefined : () => undefined} />
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[260px] p-0" onClick={(e) => e.stopPropagation()}>
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

const tags = (t: TransactionDto): ReactNode => (
  <>
    {t.status === 'PENDING' ? <Chip tone="pend">Pending</Chip> : null}
    {t.excluded ? <Chip>Left out</Chip> : null}
    {t.flag === 'bounced' ? <Chip tone="warn">Bounced</Chip> : null}
    {t.flag === 'returned' ? <Chip tone="ok">Returned</Chip> : null}
    {t.kind === 'SHARE' ? <Chip>Housemate share</Chip> : null}
    {t.kind === 'REFUND' && !t.flag ? <Chip tone="ok">Refund</Chip> : null}
    {t.tags.map((x) => (
      <Chip key={x}>#{x}</Chip>
    ))}
    {t.note ? <Chip>Note</Chip> : null}
  </>
);

function Detail({ tx, categories, onClose }: { tx: TransactionDto | null; categories: CategoryDto[]; onClose: () => void }): ReactNode {
  const patch = usePatchTransaction();
  const [note, setNote] = useState('');
  const [tagText, setTagText] = useState('');
  useEffect(() => {
    setNote(tx?.note ?? '');
    setTagText('');
  }, [tx?.id, tx?.note]);
  if (!tx) return null;
  const save = (body: { note?: string | null; excluded?: boolean; tags?: string[] }): void =>
    patch.mutate({ id: tx.id, ...body }, { onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not save') });
  const money = Number(tx.amountEur) > 0;
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[420px]">
        <SheetHeader>
          <SheetTitle className="font-display text-[22px]">{tx.merchant?.displayName ?? tx.rawDescriptor}</SheetTitle>
          <SheetDescription>
            {longDate(tx.bookingDate)} · {tx.accountName}
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 px-4 pb-6">
          <div className={cn('num font-display text-[34px] font-bold', money && 'text-good')}>{eur(tx.amountEur, { signed: true })}</div>
          <div className="flex flex-wrap items-center gap-1.5">
            <CategoryPicker tx={tx} categories={categories} />
            {tags(tx)}
          </div>
          <div>
            <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.07em] text-ink-3">What the bank says</div>
            <span className="raw-marker break-all">{tx.rawDescriptor}</span>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-rule p-3 text-[13.5px]">
            <span>
              Exclude from budgets
              <small className="block text-[12px] text-ink-3">For a one-off such as a gift you are repaid for. Safe to spend ignores it.</small>
            </span>
            <Switch checked={tx.excluded} onCheckedChange={(v) => save({ excluded: v })} aria-label="Exclude from budgets" />
          </label>
          <div>
            <label htmlFor="tx-note" className="mb-1 block text-[13px] font-medium">Note</label>
            <Textarea id="tx-note" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (tx.note ?? '') && save({ note: note.trim() || null })} rows={3} placeholder="Receipt for medical expenses, who it was for…" />
          </div>
          <div>
            <label htmlFor="tx-tag" className="mb-1 block text-[13px] font-medium">Tags</label>
            <div className="flex flex-wrap items-center gap-1.5">
              {tx.tags.map((x) => (
                <button key={x} type="button" className="inline-flex items-center gap-1 rounded-full border border-rule bg-raised px-2 py-[2px] text-[12px] font-semibold" onClick={() => save({ tags: tx.tags.filter((t) => t !== x) })} aria-label={`Remove tag ${x}`}>
                  #{x} <X className="size-3" aria-hidden="true" />
                </button>
              ))}
              <Input
                id="tx-tag"
                value={tagText}
                onChange={(e) => setTagText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && tagText.trim()) {
                    e.preventDefault();
                    save({ tags: [...tx.tags, tagText.trim().replace(/^#/, '')] });
                    setTagText('');
                  }
                }}
                placeholder="#lisbon"
                className="h-8 w-[130px]"
              />
            </div>
          </div>
          <Button variant="outline" onClick={onClose}>
            Done
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

const PAGE = 60;

function PaymentsPage() {
  const params = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const accounts = useAccounts();
  const categories = useCategories();
  const [q, setQ] = useState(params.q ?? '');
  const debouncedQ = useDebounced(q);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if ((params.q ?? '') !== debouncedQ) void navigate({ search: (prev) => ({ ...prev, q: debouncedQ || undefined }), replace: true });
  }, [debouncedQ, navigate, params.q]);

  const query = useMemo(
    () => ({
      limit: PAGE,
      q: params.q,
      accountId: params.account,
      categoryId: params.category,
      needsReview: params.status === 'SORT' ? ('true' as const) : undefined,
      status: params.status === 'PENDING' ? ('PENDING' as const) : undefined,
      excluded: params.status === 'EXCLUDED' ? ('true' as const) : undefined,
      kind: params.kind,
    }),
    [params],
  );
  const tx = useTransactions(query);
  const rows = useMemo(() => tx.data?.pages.flatMap((p) => p.items) ?? [], [tx.data]);
  const total = tx.data?.pages[0]?.total ?? 0;
  const readAs = tx.data?.pages[0]?.readAs ?? null;

  const set = (patch: Partial<z.infer<typeof search>>): void => {
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  };

  const groups = useMemo(() => {
    const out: Array<{ day: string; items: TransactionDto[]; spent: number }> = [];
    for (const t of rows) {
      const day = t.bookingDate.slice(0, 10);
      let g = out.at(-1);
      if (!g || g.day !== day) {
        g = { day, items: [], spent: 0 };
        out.push(g);
      }
      g.items.push(t);
      if ((t.kind === 'SPEND' || t.kind === 'REFUND' || t.kind === 'SHARE') && !t.excluded) g.spent -= Number(t.amountEur);
    }
    return out;
  }, [rows]);

  const cats = categories.data ?? [];
  const top = cats.filter((c) => !c.parentId && !c.archived);
  const selected = rows.find((r) => r.id === open) ?? null;
  const active = Object.values(params).some((v) => v !== undefined && v !== '');

  return (
    <>
      <PageHeader
        eyebrow="Every payment"
        title="Payments"
        lead={'Search reads questions too: try "coffee over 4 last month" or "tesco since june". Transfers between your own accounts are kept out of spending.'}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2.5" role="search">
        <div className="relative min-w-[200px] flex-1 basis-[240px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search, or ask: coffee over 4 last month" aria-label="Search payments" className="pl-8" />
        </div>
        <Seg
          label="Show"
          value={params.status ?? 'ALL'}
          onChange={(v) => set({ status: v === 'ALL' ? undefined : (v as 'PENDING') })}
          options={[['ALL', 'All'], ['SORT', 'To sort'], ['PENDING', 'Pending'], ['EXCLUDED', 'Left out']]}
        />
        <Select value={params.account ?? 'all'} onValueChange={(v) => set({ account: v === 'all' ? undefined : v })}>
          <SelectTrigger aria-label="Account" className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.data?.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={params.category ?? 'all'} onValueChange={(v) => set({ category: v === 'all' ? undefined : v })}>
          <SelectTrigger aria-label="Category" className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
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
            <SelectItem value="SHARE">Housemate shares</SelectItem>
            <SelectItem value="TRANSFER">Transfers</SelectItem>
          </SelectContent>
        </Select>
        {active ? (
          <button type="button" className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand" onClick={() => { setQ(''); void navigate({ search: {}, replace: true }); }}>
            <X className="size-3.5" aria-hidden="true" /> Clear
          </button>
        ) : null}
      </div>

      {readAs ? (
        <Callout className="mb-3">
          <span className="mr-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">Read as</span>
          {readAs.slug ? <Chip className="mr-1.5">{cats.find((c) => c.slug === readAs.slug)?.name ?? readAs.slug}</Chip> : null}
          {readAs.merchantKey ? <Chip className="mr-1.5">{rows.find((r) => r.merchant?.merchantKey === readAs.merchantKey)?.merchant?.displayName ?? readAs.merchantKey}</Chip> : null}
          {readAs.min != null ? <Chip className="mr-1.5">over €{readAs.min}</Chip> : null}
          {readAs.max != null ? <Chip className="mr-1.5">under €{readAs.max}</Chip> : null}
          {readAs.institution ? <Chip className="mr-1.5">on {readAs.institution === 'AIB' ? 'AIB' : 'Revolut'}</Chip> : null}
          {readAs.period && readAs.periodExplicit ? <Chip>{readAs.period.label}</Chip> : null}
        </Callout>
      ) : null}

      {tx.error ? (
        <ErrorNote error={tx.error} retry={() => void tx.refetch()} />
      ) : tx.isLoading ? (
        <LoadingBlock className="h-96" />
      ) : rows.length === 0 ? (
        <EmptyState title="No payments match">Try clearing a filter.</EmptyState>
      ) : (
        <Panel flush>
          <div className="px-3 pb-1.5 pt-2 text-[12px] text-ink-3" aria-live="polite">
            {rows.length} of {total} payments
          </div>
          {groups.map((g) => (
            <section key={g.day} aria-label={longDate(g.day)}>
              <div className="sticky top-[60px] z-10 flex items-baseline justify-between border-y border-rule bg-raised px-3 py-1.5 text-[12px] font-semibold text-ink-2">
                <span>{longDate(g.day)}</span>
                {g.spent !== 0 ? <span className="num">{g.spent > 0 ? `${eur(g.spent)} spent` : `${eur(-g.spent)} back`}</span> : null}
              </div>
              {g.items.map((t) => {
                const needs = !t.category && t.kind !== 'TRANSFER';
                return (
                  <div
                    key={t.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpen(t.id)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen(t.id)}
                    className={cn(
                      'grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-rule px-3 py-2.5 hover:bg-raised md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.9fr)_96px]',
                      needs && 'bg-[color-mix(in_srgb,var(--marker)_14%,transparent)]',
                      t.status === 'PENDING' && 'opacity-80',
                    )}
                  >
                    <div className="min-w-0">
                      <div className={cn('truncate font-semibold', t.excluded && 'text-ink-3 line-through decoration-ink-3/60')}>{maskText(t.merchant?.displayName ?? t.rawDescriptor)}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">{tags(t)}</div>
                    </div>
                    <div className="num order-last col-span-2 hidden truncate text-ink-3 md:order-none md:col-span-1 md:block">{t.accountName}</div>
                    <div className="order-3 md:order-none">
                      <CategoryPicker tx={t} categories={cats} />
                    </div>
                    <div className={cn('num row-start-1 text-right font-semibold md:row-start-auto', Number(t.amountEur) > 0 && 'text-good')}>{eur(t.amountEur, { signed: true })}</div>
                  </div>
                );
              })}
            </section>
          ))}
          {tx.hasNextPage ? (
            <div className="p-3 text-center">
              <Button variant="outline" size="sm" disabled={tx.isFetchingNextPage} onClick={() => void tx.fetchNextPage()}>
                {tx.isFetchingNextPage ? 'Loading…' : `Show ${Math.min(PAGE, total - rows.length)} more`}
              </Button>
            </div>
          ) : (
            <div className="p-3 text-center text-[12px] text-ink-3">That&apos;s everything back to {shortDate(rows.at(-1)!.bookingDate)}.</div>
          )}
        </Panel>
      )}
      <Detail tx={selected} categories={cats} onClose={() => setOpen(null)} />
    </>
  );
}
