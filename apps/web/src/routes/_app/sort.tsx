import { eur, shortDate, useAnswer, useCategories, useQueue } from '@finally/api-client';
import type { CategoriseRequestDto, CategoryDto } from '@finally/contracts';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { EmptyState, ErrorNote, LoadingBlock, PageHeader } from '@/components/common';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { categoryVar } from '@/lib/category';

export const Route = createFileRoute('/_app/sort')({
  // `request` and `pick` come from a web-push action button: answer straight away.
  validateSearch: z.object({ request: z.string().optional(), pick: z.string().optional() }),
  component: SortPage,
});

function SortCard({ req, categories }: { req: CategoriseRequestDto; categories: CategoryDto[] }): ReactNode {
  const answer = useAnswer();
  const [once, setOnce] = useState(false);

  const send = (c: { id: string; name: string }): void => {
    answer.mutate(
      { requestId: req.id, categoryId: c.id, scope: once ? 'once' : 'merchant' },
      {
        onSuccess: (r) =>
          toast.success(
            once
              ? `${req.displayName} → ${c.name} for this payment only`
              : `${req.displayName} → ${c.name}. ${r.updatedCount} payment${r.updatedCount === 1 ? '' : 's'} updated; future ones sort themselves.`,
          ),
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not save that'),
      },
    );
  };

  const pickable = categories.filter((c) => !c.archived && c.group !== 'TRANSFER' && c.group !== 'INCOME');
  return (
    <article className="flex flex-col gap-3 rounded-[10px] border border-rule bg-surface p-4" aria-labelledby={`req-${req.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`req-${req.id}`} className="text-[16px] font-semibold">{req.displayName}</h2>
          <span className="raw-marker mt-1.5 max-w-full truncate">{req.rawDescriptor}</span>
        </div>
        <div className="num whitespace-nowrap font-display text-[20px] font-bold">{eur(req.amount)}</div>
      </div>
      <div className="text-[12.5px] text-ink-2">
        {shortDate(req.bookingDate)} · {req.accountName} · {req.paymentCount} payment{req.paymentCount === 1 ? '' : 's'} from this merchant
      </div>
      <div className="flex flex-wrap gap-2">
        {req.suggestedCategories.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={answer.isPending}
            onClick={() => send(c)}
            className="inline-flex items-center gap-[7px] rounded-full border border-rule bg-raised px-3 py-[7px] text-[13px] font-semibold hover:border-brand hover:text-brand disabled:opacity-60"
          >
            <i className="size-2 rounded-full" style={{ background: categoryVar(c) }} />
            {c.name}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2.5 text-[12.5px] text-ink-2">
        <Select value="" onValueChange={(id) => { const c = categories.find((x) => x.id === id); if (c) send(c); }}>
          <SelectTrigger size="sm" aria-label={`All categories for ${req.displayName}`} className="w-[170px] text-[12.5px]">
            <SelectValue placeholder="All categories…" />
          </SelectTrigger>
          <SelectContent>
            {pickable.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.parentId ? `· ${c.name}` : c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={once} onChange={(e) => setOnce(e.target.checked)} className="accent-[var(--brand)]" />
          Just this once
        </label>
      </div>
    </article>
  );
}

function SortPage() {
  const queue = useQueue();
  const categories = useCategories();
  const answer = useAnswer();
  const { request, pick } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current || !request || !pick || !queue.data || !categories.data) return;
    handled.current = true;
    const req = queue.data.items.find((r) => r.id === request);
    const cat = categories.data.find((c) => c.slug === pick);
    void navigate({ search: {}, replace: true });
    if (!req || !cat) {
      toast.message('That payment was already sorted');
      return;
    }
    answer.mutate(
      { requestId: req.id, categoryId: cat.id, scope: 'merchant' },
      { onSuccess: (r) => toast.success(`${req.displayName} → ${cat.name}. ${r.updatedCount} payment${r.updatedCount === 1 ? '' : 's'} updated.`) },
    );
  }, [request, pick, queue.data, categories.data, answer, navigate]);

  if (queue.error) return <ErrorNote error={queue.error} retry={() => void queue.refetch()} />;
  const items = queue.data?.items ?? [];

  return (
    <>
      <PageHeader
        eyebrow={queue.data ? `Inbox · ${items.length} merchant${items.length === 1 ? '' : 's'}` : 'Inbox'}
        title="To sort"
        lead="Pick a category once per merchant. Finally saves it as a rule and re-sorts every payment from that merchant, past and future."
      />
      {queue.isLoading || categories.isLoading ? (
        <LoadingBlock className="h-64" />
      ) : items.length === 0 ? (
        <EmptyState title="All sorted">Every merchant has a category. New ones will land here and on your phone.</EmptyState>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-3.5">
          {items.map((r) => (
            <SortCard key={r.id} req={r} categories={categories.data ?? []} />
          ))}
        </div>
      )}
    </>
  );
}
