import { eur, eur0, monthLabel, shiftMonth, useBudgets, useUpsertBudget } from '@finally/api-client';
import type { BudgetRow } from '@finally/contracts';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { ErrorNote, LoadingBlock, PageHeader, Panel, Track } from '@/components/common';
import { categoryVar } from '@/lib/category';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/budgets')({
  validateSearch: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }),
  component: BudgetsPage,
});

function AmountEditor({ row, month }: { row: BudgetRow; month: string }): ReactNode {
  const upsert = useUpsertBudget();
  const [value, setValue] = useState(String(Number(row.baseAmount)));
  const [editing, setEditing] = useState(false);

  const commit = (): void => {
    setEditing(false);
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      setValue(String(Number(row.baseAmount)));
      return;
    }
    if (n === Number(row.baseAmount)) return;
    upsert.mutate(
      { categoryId: row.categoryId, month, amount: n.toFixed(2), rollover: row.rollover },
      { onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not save the budget') },
    );
  };

  return (
    <div className="num flex items-center justify-end gap-1.5 text-[13px]">
      <span>{eur(row.spent)} of</span>
      <input
        type="number"
        min={0}
        step={5}
        value={editing ? value : String(Number(row.baseAmount))}
        onFocus={() => {
          setValue(String(Number(row.baseAmount)));
          setEditing(true);
        }}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setValue(String(Number(row.baseAmount)));
            setEditing(false);
            (e.target as HTMLInputElement).blur();
          }
        }}
        aria-label={`${row.category.name} budget in euro`}
        className="w-[72px] rounded-[6px] border border-rule bg-surface px-1.5 py-1 text-right"
      />
    </div>
  );
}

function BudgetsPage() {
  const { month: monthParam } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data, error, refetch, isFetching } = useBudgets(monthParam);
  const upsert = useUpsertBudget();

  if (error) return <ErrorNote error={error} retry={() => void refetch()} />;
  const month = data?.month ?? monthParam;
  const go = (n: number): void => {
    if (month) void navigate({ search: { month: shiftMonth(month, n) } });
  };

  return (
    <>
      <PageHeader
        eyebrow={data ? `${monthLabel(data.month)}${data.dayOfMonth > 0 && data.dayOfMonth < data.daysInMonth ? ` · day ${data.dayOfMonth} of ${data.daysInMonth}` : ''}` : 'Budgets'}
        title="Budgets"
        lead="The black tick on each bar is where an even pace would put you today. Edit any amount to change the budget; child categories roll up into their parent."
        right={
          <div className="inline-flex items-center gap-1 rounded-full border border-rule bg-surface p-[3px]">
            <button type="button" onClick={() => go(-1)} aria-label="Previous month" className="grid size-8 place-items-center rounded-full hover:bg-raised">
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <span className="min-w-[120px] text-center text-[13px] font-semibold" aria-live="polite">{month ? monthLabel(month) : '…'}</span>
            <button type="button" onClick={() => go(1)} aria-label="Next month" className="grid size-8 place-items-center rounded-full hover:bg-raised">
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        }
      />
      {!data ? (
        <LoadingBlock className="h-96" />
      ) : data.rows.length === 0 ? (
        <Panel className="text-ink-2">No budgets for this month yet. Spending appears here once payments are categorised.</Panel>
      ) : (
        <Panel className={cn(isFetching && 'opacity-80 transition-opacity')}>
          <div className="grid gap-1">
            {data.rows.map((r) => {
              const amount = Number(r.amount);
              const spent = Number(r.spent);
              const fill = amount > 0 ? Math.min((spent / amount) * 100, 100) : spent > 0 ? 100 : 0;
              const tick = r.fixed || amount <= 0 || data.dayOfMonth === 0 ? null : (Number(r.expectedByToday) / amount) * 100;
              const projected = Number(r.projected);
              const over = projected - amount;
              const past = data.dayOfMonth >= data.daysInMonth;
              const status = r.fixed ? (
                <>
                  <span className="mr-1 rounded-[4px] border border-rule px-[5px] py-px text-[11px] font-semibold text-ink-3">Fixed</span>
                  {spent >= amount ? 'Paid for the month' : `${eur(amount - spent)} still to come`}
                </>
              ) : past ? (
                spent > amount ? `${eur0(spent - amount)} over` : `${eur0(amount - spent)} spare`
              ) : over > 0 ? (
                `On pace for ${eur0(projected)}, ${eur0(over)} over`
              ) : (
                `On pace for ${eur0(projected)}, ${eur0(-over)} spare`
              );
              const tone = r.fixed ? '' : over > 0 || (past && spent > amount) ? 'font-semibold text-warn' : 'font-semibold text-good';
              return (
                <div
                  key={r.categoryId}
                  className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 border-t border-rule py-3 first:border-t-0 md:grid-cols-[170px_minmax(0,1fr)_150px] xl:grid-cols-[170px_minmax(0,1fr)_150px_190px] xl:gap-x-4"
                >
                  <div className={cn('flex items-center gap-[9px] font-semibold', r.category.parentId && 'pl-4')}>
                    <i className="size-2.5 flex-none rounded-[3px]" style={{ background: categoryVar(r.category) }} />
                    {r.category.name}
                    {r.carriedIn !== '0.00' ? <span className="text-[11px] font-medium text-ink-3">+{eur0(r.carriedIn)} carried</span> : null}
                  </div>
                  <Track value={fill} tick={tick} color={categoryVar(r.category)} className="order-3 col-span-2 md:order-none md:col-span-1" />
                  <AmountEditor row={r} month={data.month} />
                  <div className={cn('order-4 col-span-2 text-[12.5px] text-ink-2 md:col-span-3 xl:order-none xl:col-span-1', tone)}>
                    <div>{status}</div>
                    {!r.fixed ? (
                      <label className="mt-1 inline-flex items-center gap-1.5 text-[11.5px] font-normal text-ink-3">
                        <input
                          type="checkbox"
                          checked={r.rollover}
                          onChange={(e) =>
                            upsert.mutate({ categoryId: r.categoryId, month: data.month, amount: r.baseAmount, rollover: e.target.checked })
                          }
                          className="accent-[var(--brand)]"
                        />
                        Roll unspent forward
                      </label>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-rule pt-3 text-[13px] text-ink-2">
            <span>
              Total <b className="num text-ink">{eur(data.totalSpent)}</b> of <b className="num text-ink">{eur(data.totalBudget)}</b>
            </span>
          </div>
        </Panel>
      )}
    </>
  );
}
