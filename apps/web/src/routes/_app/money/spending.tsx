import { eur, eur0, shortDate, useCategories, useMe, useSpending } from '@finally/api-client';
import type { SpendingDto } from '@finally/contracts';
import { CF_PERIOD_LABEL, CF_PERIODS, cfRange, dublinDate } from '@finally/finance-core';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { z } from 'zod';
import { ErrorNote, LoadingBlock, PageHeader, Panel, Track } from '@/components/common';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { HeaderSelect } from '@/components/v4';
import { categoryVar } from '@/lib/category';
import { cn } from '@/lib/utils';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const search = z.object({
  period: z.enum([...CF_PERIODS, 'custom']).optional(),
  from: date.optional(),
  to: date.optional(),
  /** Narrow to one category (its slug); children count with it. */
  category: z.string().optional(),
});

export const Route = createFileRoute('/_app/money/spending')({ validateSearch: search, component: SpendingPage });

const ALL = 'all';
const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }): ReactNode {
  return (
    <div className="rounded-card border border-hair bg-surface p-3.5">
      <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">{label}</div>
      <div className="num mt-1 font-display text-[26px] font-medium leading-none">{value}</div>
      {sub ? <div className="mt-1 text-[12px] text-ink-3">{sub}</div> : null}
    </div>
  );
}

type Group = SpendingDto['groups'][number];

function GroupRow({ g, from, to }: { g: Group; from: string; to: string }): ReactNode {
  const [open, setOpen] = useState(false);
  const name = g.category?.name ?? 'Not sorted yet';
  const colour = g.category ? categoryVar({ slug: g.category.slug, colour: g.category.colour }) : 'var(--marker)';
  const link = (categoryId: string | undefined) => ({ to: '/money/payments' as const, search: { ...(categoryId ? { category: categoryId } : { status: 'SORT' as const }), from, to } });
  return (
    <div className="border-t border-rule py-2.5 first:border-t-0 first:pt-0">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5">
        <button
          type="button"
          className="flex min-w-0 items-center gap-2 text-left font-semibold"
          onClick={() => g.children.length && setOpen(!open)}
          aria-expanded={g.children.length ? open : undefined}
          aria-label={g.children.length ? `${name}, ${open ? 'hide' : 'show'} parts` : name}
        >
          {g.children.length ? (open ? <ChevronDown className="size-4 flex-none text-ink-3" aria-hidden="true" /> : <ChevronRight className="size-4 flex-none text-ink-3" aria-hidden="true" />) : <span className="w-4 flex-none" />}
          <i className="size-2.5 flex-none rounded-[2px]" style={{ background: colour }} />
          <span className="truncate">{name}</span>
        </button>
        <div className="text-right">
          <span className="num font-semibold">{eur(g.spent)}</span>
        </div>
        <div className="pl-6">
          <Track value={Math.min(100, g.share * 100)} color={colour} height={8} />
        </div>
        <div className="text-right text-[12.5px] text-ink-3">
          {Math.round(g.share * 100)}% · <Link {...link(g.category?.id)} className="font-semibold text-brand">{plural(g.count, 'payment')}</Link>
        </div>
      </div>
      {open ? (
        <div className="mt-2 grid gap-1 pl-10 text-[13px]">
          {g.children.map((c) => (
            <div key={c.category.slug} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-ink-2">
                <i className="size-2 flex-none rounded-[2px]" style={{ background: categoryVar({ slug: c.category.slug, colour: c.category.colour }) }} />
                <Link {...link(c.category.id)} className="hover:underline">{c.category.name}</Link>
                <span className="text-ink-3">{plural(c.count, 'payment')}</span>
              </span>
              <b className="num">{eur(c.spent)}</b>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SpendingPage() {
  const params = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const me = useMe();
  const cats = useCategories();
  const today = dublinDate(new Date());
  const period = params.period ?? 'thismonth';
  const range =
    period === 'custom' && params.from && params.to
      ? { from: params.from, to: params.to }
      : cfRange(period === 'custom' ? 'thismonth' : period, today, me.data?.paydayDayOfMonth ?? 1, true);
  const q = useSpending({ ...range, ...(params.category ? { category: params.category } : {}) });
  const set = (next: Partial<z.infer<typeof search>>): void => void navigate({ search: (prev) => ({ ...prev, ...next }), replace: true });
  if (q.error) return <ErrorNote error={q.error} retry={() => void q.refetch()} />;

  const roots = (cats.data ?? []).filter((c) => !c.parentId && !c.archived && c.group !== 'INCOME' && c.group !== 'TRANSFER');
  const d = q.data;
  const periodOptions = [...CF_PERIODS.map((p) => [p, CF_PERIOD_LABEL[p]] as const), ['custom', 'Pick dates'] as const];
  return (
    <>
      <PageHeader
        eyebrow={`${shortDate(range.from)} to ${shortDate(range.to)}`}
        title="Spending"
        lead="How much you spent, and where. Pick a period, or one category to see its total. Refunds net off, rent counts as your share, and payments you left out of budgets are not included."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <HeaderSelect label="Period" value={period} onChange={(v) => set({ period: v, ...(v === 'custom' ? { from: params.from ?? range.from, to: params.to ?? range.to } : { from: undefined, to: undefined }) })} options={periodOptions} />
          </div>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {period === 'custom' ? (
          <div className="flex items-center gap-2 text-[13px]">
            <Input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && set({ from: e.target.value })} className="h-9 w-[150px]" aria-label="From date" />
            <span className="text-ink-3">to</span>
            <Input type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && set({ to: e.target.value })} className="h-9 w-[150px]" aria-label="To date" />
          </div>
        ) : null}
        <Select value={params.category ?? ALL} onValueChange={(v) => set({ category: v === ALL ? undefined : v })}>
          <SelectTrigger className="h-9 w-[210px]" aria-label="Category"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {roots.map((c) => (<SelectItem key={c.id} value={c.slug}>{c.name}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>
      {!d ? (
        <LoadingBlock className="h-96" />
      ) : (
        <div className={cn('grid gap-4', q.isFetching && 'opacity-80 transition-opacity')}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label={params.category ? 'Spent on it' : 'Spent'} value={eur(d.total)} sub={`${shortDate(d.from)} to ${shortDate(d.to)}`} />
            <Stat label="Payments" value={String(d.count)} />
            <Stat label="Average payment" value={eur(d.average)} />
            <Stat label="A day" value={eur(d.perDay)} />
          </div>
          <Panel>
            {d.groups.length === 0 ? (
              <p className="text-ink-2">Nothing spent in this period.</p>
            ) : (
              <>
                <h3 className="mb-3 text-[16px] font-medium text-ink-2">By category</h3>
                {d.groups.map((g) => (
                  <GroupRow key={g.category?.slug ?? 'unsorted'} g={g} from={d.from} to={d.to} />
                ))}
              </>
            )}
          </Panel>
          <p className="text-[12.5px] text-ink-3">
            Total {eur0(d.total)}. <Link to="/money/budgets" className="font-semibold text-brand">See it against your budgets</Link>
          </p>
        </div>
      )}
    </>
  );
}
