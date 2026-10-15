import { eur, eur0, monthLabel, useMonth } from '@finally/api-client';
import { createFileRoute } from '@tanstack/react-router';
import { Big, ErrorNote, LoadingBlock, PageHeader, Panel, PanelTitle, Sub } from '@/components/common';
import { Key } from '@/components/kit';
import { BurnChart, TimeLine } from '@/components/charts/more-charts';
import { categoryVar } from '@/lib/category';
import { GRID, SPAN } from '@/lib/grid';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/money/month')({ component: MonthPage });

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function MonthPage() {
  const { data: m, error, refetch } = useMonth();
  if (error) return <ErrorNote error={error} retry={() => void refetch()} />;
  if (!m) return <LoadingBlock className="h-96" />;
  const over = Number(m.burn.projected) > Number(m.burn.budget);
  const max = Math.max(1, ...m.ranked.map((r) => Math.max(Number(r.spent), Number(r.budget))));
  return (
    <>
      <PageHeader
        eyebrow={`${monthLabel(m.month)} · day ${m.day} of ${m.daysInMonth}`}
        title="This month"
        lead="Are you on track? The solid line is flexible spending so far; the dashed lines are your usual pace and where this month is heading."
      />
      <div className={GRID}>
        <Panel className={SPAN[7]}>
          <PanelTitle>
            <span>On track?</span>
            <span className={cn('text-[12.5px] font-semibold normal-case tracking-normal', over ? 'text-warn' : 'text-good')}>
              heading for {eur0(m.burn.projected)} of {eur0(m.burn.budget)}
            </span>
          </PanelTitle>
          <BurnChart burn={m.burn} month={monthLabel(m.month)} />
          <Key
            items={[
              { name: 'spent', colour: '--brand', text: 'Spent so far' },
              { name: 'forecast', colour: '--brand', text: 'Forecast' },
              { name: 'pace', colour: '--ink-3', text: 'Your usual pace' },
              { name: 'budget', colour: '--ink-2', text: 'Budget' },
            ]}
          />
        </Panel>
        <Panel className={SPAN[5]}>
          <PanelTitle>
            <span>Spent vs budget</span>
            <span className="text-[12px] normal-case tracking-normal text-ink-3">excluding rent</span>
          </PanelTitle>
          <div className="grid gap-2.5">
            {m.ranked.map((r) => (
              <div key={r.category.id} className="grid grid-cols-[110px_minmax(0,1fr)_96px] items-center gap-2.5 text-[13px]">
                <span className="flex items-center gap-2 truncate">
                  <i className="size-2.5 flex-none rounded-[3px]" style={{ background: categoryVar(r.category) }} />
                  <span className="truncate">{r.category.name}</span>
                </span>
                <span className="relative h-2.5 rounded-full bg-raised">
                  <i className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(Number(r.spent) / max) * 100}%`, background: categoryVar(r.category) }} />
                  <b className="absolute -bottom-[3px] -top-[3px] w-0.5 bg-ink opacity-70" style={{ left: `${(Number(r.budget) / max) * 100}%` }} />
                </span>
                <span className={cn('num text-right', Number(r.spent) > Number(r.budget) && 'font-semibold text-warn')}>
                  {eur0(r.spent)} <span className="text-ink-3">/ {eur0(r.budget)}</span>
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-ink-3">The tick on each bar is the budget.</p>
        </Panel>
        <Panel className={SPAN[6]}>
          <PanelTitle>
            <span>Net worth</span>
            <span className={cn('text-[12.5px] font-semibold normal-case tracking-normal', Number(m.netWorth.changeSixMonths) >= 0 ? 'text-good' : 'text-warn')}>
              {eur0(m.netWorth.changeSixMonths)} in 6 months
            </span>
          </PanelTitle>
          <Big>{eur(m.netWorth.current)}</Big>
          <div className="mt-2">
            <TimeLine points={m.netWorth.series.map((p) => ({ label: MON[Number(p.month.slice(5)) - 1]!, value: Number(p.value) }))} label="Net worth over six months" zero />
          </div>
          <Sub>Your balance at the end of each month, then today with pots and money owed to you added and what you owe taken off.</Sub>
        </Panel>
        <Panel className={SPAN[6]}>
          <PanelTitle>Good to know</PanelTitle>
          <div className="grid gap-3">
            {m.goodToKnow.map((g) => (
              <div key={g.title} className="border-t border-rule pt-2.5 first:border-t-0 first:pt-0">
                <h4 className="text-[14px] font-semibold">{g.title}</h4>
                <p className="mt-0.5 text-[13px] text-ink-2">{g.body}</p>
              </div>
            ))}
            {m.goodToKnow.length === 0 ? <p className="text-[13px] text-ink-2">Nothing yet.</p> : null}
          </div>
        </Panel>
      </div>
    </>
  );
}
