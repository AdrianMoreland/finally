import { eur, eur0, monthLabel, shiftMonth, useBudgets, useBudgetSuggestions, useCategories, useUpsertBudget } from '@finally/api-client';
import type { BudgetRow } from '@finally/contracts';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { ErrorNote, LoadingBlock, PageHeader, Panel, Track } from '@/components/common';
import { AmountField, Callout } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { categoryVar } from '@/lib/category';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/money/budgets')({
  validateSearch: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }),
  component: BudgetsPage,
});

function BudgetRowView({ r, month, day, days, suggestion }: { r: BudgetRow; month: string; day: number; days: number; suggestion?: string }): ReactNode {
  const upsert = useUpsertBudget();
  const amount = Number(r.amount);
  const spent = Number(r.spent);
  const left = amount - spent;
  const daysLeft = Math.max(1, days - day + 1);
  const fill = amount > 0 ? Math.min((spent / amount) * 100, 100) : spent > 0 ? 100 : 0;
  const tick = r.fixed || amount <= 0 || day === 0 ? null : (Number(r.expectedByToday) / amount) * 100;
  const projected = Number(r.projected);
  const over = projected - amount;
  const past = day >= days;
  const save = (n: number, rollover = r.rollover): void =>
    upsert.mutate(
      { categoryId: r.categoryId, month, amount: n.toFixed(2), rollover },
      { onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not save the budget') },
    );
  return (
    <div className="grid gap-2 border-t border-rule py-3.5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className={cn('flex items-center gap-[9px] font-semibold', r.category.parentId && 'pl-4')}>
          <i className="size-2.5 flex-none rounded-[3px]" style={{ background: categoryVar(r.category) }} />
          {r.category.name}
          {r.fixed ? <span className="rounded-[4px] border border-rule px-[5px] py-px text-[11px] font-semibold text-ink-3">Fixed</span> : null}
          {r.carriedIn !== '0.00' ? <span className="text-[11px] font-medium text-ink-3">+{eur0(r.carriedIn)} carried</span> : null}
        </div>
        <div className="text-right">
          <div className={cn('num font-display text-[20px] font-medium leading-none', left < 0 && 'text-warn')}>
            {left >= 0 ? `${eur0(left)} left` : `${eur0(-left)} over`}
          </div>
          {!r.fixed && !past && left > 0 ? <div className="mt-0.5 text-[12px] text-ink-3">{eur(left / daysLeft)} a day</div> : null}
        </div>
      </div>
      <Track value={fill} tick={tick} color={categoryVar(r.category)} height={10} />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[12.5px] text-ink-2">
        <span>
          Spent {eur(r.spent)} of {eur0(r.amount)}
          {r.fixed ? (spent >= amount ? ' · paid for the month' : ` · ${eur0(amount - spent)} still to come`) : past ? (spent > amount ? ` · ${eur0(spent - amount)} over` : ` · ${eur0(amount - spent)} spare`) : over > 0 ? ` · heading for ${eur0(projected)}, ${eur0(over)} over` : ` · heading for ${eur0(projected)}`}
        </span>
        <span className="inline-flex items-center gap-3">
          {!r.fixed ? (
            <label className="inline-flex items-center gap-1.5 text-[12px] text-ink-3">
              <input type="checkbox" checked={r.rollover} onChange={(e) => save(Number(r.baseAmount), e.target.checked)} className="accent-[var(--brand)]" />
              Roll unspent forward
            </label>
          ) : null}
          {suggestion && Number(suggestion) !== Number(r.baseAmount) ? (
            <button type="button" className="text-[12px] font-semibold text-brand" onClick={() => save(Number(suggestion))} title="The middle month of your last three, rounded up to €5">
              Suggest {eur0(suggestion)}
            </button>
          ) : null}
        </span>
      </div>
      <AmountField label="Budget for the month" value={Number(r.baseAmount)} onCommit={save} max={Math.max(1000, Number(r.baseAmount) * 2)} step={5} slider={false} />
    </div>
  );
}

function BudgetsPage() {
  const { month: monthParam } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data, error, refetch, isFetching } = useBudgets(monthParam);
  const suggestions = useBudgetSuggestions();
  const categories = useCategories();
  const upsert = useUpsertBudget();

  if (error) return <ErrorNote error={error} retry={() => void refetch()} />;
  const month = data?.month ?? monthParam;
  const go = (n: number): void => {
    if (month) void navigate({ search: { month: shiftMonth(month, n) } });
  };
  const slugOf = (id: string): string | undefined => categories.data?.find((c) => c.id === id)?.slug;
  const applyAll = (): void => {
    if (!data || !suggestions.data) return;
    let n = 0;
    for (const r of data.rows) {
      const s = suggestions.data[slugOf(r.categoryId) ?? ''];
      if (s && !r.category.parentId && Number(s) !== Number(r.baseAmount)) {
        upsert.mutate({ categoryId: r.categoryId, month: data.month, amount: Number(s).toFixed(2), rollover: r.rollover });
        n++;
      }
    }
    toast.success(n ? `Updated ${n} budget${n === 1 ? '' : 's'} from your last three months` : 'Your budgets already match your last three months');
  };
  const flex = data?.rows.filter((r) => !r.fixed && !r.category.parentId) ?? [];
  const fixed = data?.rows.filter((r) => r.fixed && !r.category.parentId) ?? [];
  const children = data?.rows.filter((r) => r.category.parentId) ?? [];

  return (
    <>
      <PageHeader
        eyebrow={data ? `${monthLabel(data.month)}${data.dayOfMonth > 0 && data.dayOfMonth < data.daysInMonth ? ` · day ${data.dayOfMonth} of ${data.daysInMonth}` : ''}` : 'Budgets'}
        title="Budgets"
        lead="How much is left, and how much a day. The tick on each bar is where your own usual pace puts you today."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={applyAll} disabled={!suggestions.data || upsert.isPending}>
              <Sparkles /> Suggest from my last 3 months
            </Button>
            <div className="inline-flex items-center gap-1 rounded-[3px] border border-rule bg-surface p-[3px]">
              <button type="button" onClick={() => go(-1)} aria-label="Previous month" className="grid size-8 place-items-center rounded-full hover:bg-raised">
                <ChevronLeft className="size-4" aria-hidden="true" />
              </button>
              <span className="min-w-[120px] text-center text-[13px] font-semibold" aria-live="polite">{month ? monthLabel(month) : '…'}</span>
              <button type="button" onClick={() => go(1)} aria-label="Next month" className="grid size-8 place-items-center rounded-full hover:bg-raised">
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        }
      />
      {!data ? (
        <LoadingBlock className="h-96" />
      ) : data.rows.length === 0 ? (
        <Panel className="text-ink-2">No budgets for this month yet. Use &ldquo;Suggest from my last 3 months&rdquo; to start.</Panel>
      ) : (
        <div className={cn('grid gap-4', isFetching && 'opacity-80 transition-opacity')}>
          <Panel>
            <h3 className="mb-3 text-[16px] font-medium text-ink-2">Flexible: what you choose to spend</h3>
            {flex.map((r) => (
              <BudgetRowView key={r.categoryId} r={r} month={data.month} day={data.dayOfMonth} days={data.daysInMonth} suggestion={suggestions.data?.[slugOf(r.categoryId) ?? '']} />
            ))}
          </Panel>
          <Panel>
            <h3 className="mb-3 text-[16px] font-medium text-ink-2">Fixed: found from your repeating payments</h3>
            {fixed.map((r) => (
              <BudgetRowView key={r.categoryId} r={r} month={data.month} day={data.dayOfMonth} days={data.daysInMonth} suggestion={suggestions.data?.[slugOf(r.categoryId) ?? '']} />
            ))}
          </Panel>
          {children.length ? (
            <Callout>
              {children.map((c) => c.category.name).join(', ')} roll up into their parent budgets above.
            </Callout>
          ) : null}
          <div className="text-[13px] text-ink-2">
            Total <b className="num text-ink">{eur(data.totalSpent)}</b> of <b className="num text-ink">{eur(data.totalBudget)}</b> across every line.
          </div>
        </div>
      )}
    </>
  );
}
