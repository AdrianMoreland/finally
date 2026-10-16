import {
  eur,
  eur0,
  monthLabel,
  shortDate,
  useAnswer,
  useMonthClose,
  useMonthCloseMutations,
  useWeekReview,
  useWeekReviewMutations,
} from '@finally/api-client';
import type { MonthCloseDto, WeeklyReviewDto } from '@finally/contracts';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { ActionRow } from '@/components/actions';
import { ErrorNote, LoadingBlock, PageHeader, Panel, PanelTitle } from '@/components/common';
import { Chip, Line, Seg } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { categoryVar } from '@/lib/category';
import { GRID, SPAN } from '@/lib/grid';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/money/review')({
  validateSearch: z.object({ tab: z.enum(['week', 'month']).optional() }),
  component: ReviewPage,
});

const STEPS = ['Sort what is left', 'Check one budget', 'One thing to know', 'One decision'];

function Streak({ n }: { n: number }): ReactNode {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${n} weeks in a row`}>
      {Array.from({ length: 8 }, (_, i) => (
        <i key={i} className={cn('size-2.5 rounded-full border border-ink-3', i < n && 'border-brand bg-brand')} />
      ))}
    </span>
  );
}

function WeekReview({ r }: { r: WeeklyReviewDto }): ReactNode {
  const [step, setStep] = useState(0);
  const { complete, reopen } = useWeekReviewMutations();
  const queue = r.toSort.first;
  if (r.done) {
    return (
      <Panel className="max-w-[640px]">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-full bg-fill text-on-fill"><Check className="size-6" aria-hidden="true" /></span>
          <div>
            <h3 className="font-display text-[20px] font-medium">Review done</h3>
            <p className="text-[13.5px] text-ink-2">
              {r.streak} week{r.streak === 1 ? '' : 's'} in a row.{r.decision ? ` You chose: ${r.decision}.` : ''}
            </p>
          </div>
        </div>
        <div className="mt-3"><Streak n={r.streak} /></div>
        <p className="mt-3 text-[12.5px] text-ink-3">
          Next review: Sunday {shortDate(r.nextReview)} at 19:00.{' '}
          <button type="button" className="font-semibold text-brand" onClick={() => reopen.mutate()}>Run it again</button>
        </p>
      </Panel>
    );
  }
  const w = r.budget.worst;
  return (
    <Panel className="max-w-[640px]">
      <ol className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5">
        {STEPS.map((s, i) => (
          <li key={s} className={cn('flex items-center gap-1.5 text-[12.5px] text-ink-3', i === step && 'font-semibold text-ink')}>
            <span className={cn('grid size-5 place-items-center rounded-full border border-ink-3 text-[11px]', i < step && 'border-brand bg-fill text-on-fill', i === step && 'border-ink bg-ink text-paper')}>
              {i < step ? '✓' : i + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>
      <div className="min-h-[150px]">
        {step === 0 ? (
          queue ? (
            <div>
              <p className="mb-2.5 text-[13.5px]">{r.toSort.count} merchant{r.toSort.count > 1 ? 's' : ''} left. Here is the first:</p>
              <div className="rounded-lg border border-rule bg-raised p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold">{queue.name}</h4>
                    <span className="raw-marker">{queue.rawDescriptor}</span>
                  </div>
                  <b className="num">{eur(queue.amount)}</b>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {queue.suggestion ? <QuickSort requestId={queue.requestId} categoryId={queue.suggestion.id} name={queue.suggestion.name} /> : null}
                  <Button variant="outline" asChild><Link to="/money/sort">See all in To sort</Link></Button>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-[13.5px] text-good">Everything is sorted.</p>
          )
        ) : null}
        {step === 1 ? (
          w ? (
            <div>
              <p className="mb-2 text-[13.5px]">{w.name} is furthest from its usual pace.</p>
              <Line label="Spent this month" value={`${eur(w.spent)} of ${eur0(w.budget)}`} />
              <Line label="Your usual pace ends the month at" value={eur0(w.projected)} tone={Number(w.projected) > Number(w.budget) ? 'warn' : 'good'} />
              <Line label="This week so far" value={eur(w.thisWeek)} />
            </div>
          ) : (
            <p className="text-[13.5px]">No spending yet this month.</p>
          )
        ) : null}
        {step === 2 ? (r.know ? <ActionRow a={r.know} noSnooze /> : <p className="text-[13.5px]">Nothing new this week.</p>) : null}
        {step === 3 ? (
          <div>
            <p className="mb-2.5 text-[13.5px]">Pick one thing for the week ahead.</p>
            <div className="grid gap-2">
              {r.decisions.map((d) => (
                <Button key={d.value} variant="outline" className="h-auto justify-start whitespace-normal py-2.5 text-left" disabled={complete.isPending} onClick={() => complete.mutate(d.value, { onSuccess: () => toast.success('Review done') })}>
                  {d.label}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</Button>
        {step < 3 ? <Button onClick={() => setStep((s) => s + 1)}>Next</Button> : null}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-rule pt-3 text-[12.5px] text-ink-3">
        <span>{r.streak} week{r.streak === 1 ? '' : 's'} in a row</span>
        <Streak n={r.streak} />
      </div>
    </Panel>
  );
}

function QuickSort({ requestId, categoryId, name }: { requestId: string; categoryId: string; name: string }): ReactNode {
  const answer = useAnswer();
  return (
    <Button
      disabled={answer.isPending}
      onClick={() => answer.mutate({ requestId, categoryId, scope: 'merchant' }, { onSuccess: (r) => toast.success(`${name} for every payment from them (${r.updatedCount})`) })}
    >
      <Check /> {name}, every time
    </Button>
  );
}

function MonthCloseView({ c }: { c: MonthCloseDto }): ReactNode {
  const { choose, reopen } = useMonthCloseMutations();
  const kept = Number(c.kept);
  return (
    <div className={GRID}>
      <Panel className={SPAN[5]}>
        <PanelTitle>{monthLabel(c.month)} in one look</PanelTitle>
        <Line label="Came in" value={eur(c.cameIn, { signed: true })} tone="good" />
        <Line label="Spent" value={`−${eur(c.spent)}`} />
        <Line label="Paid back to people" value={`−${eur(c.paidBack)}`} />
        <Line label="Kept" value={`${eur(c.kept)} · ${Math.round(c.keptPct)}%`} strong tone={kept >= 0 ? 'good' : 'warn'} />
        <div className="mt-2"><Line label="Balance" value={`${eur0(c.balanceFrom)} → ${eur0(c.balanceTo)}`} /></div>
        {c.jump ? <p className="mt-2 text-[12.5px] text-ink-3">Biggest jump on {c.jump.versus}: {c.jump.name}, {eur0(c.jump.by)} more.</p> : null}
      </Panel>
      <Panel className={SPAN[7]}>
        <PanelTitle>Against the plan</PanelTitle>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">
                <th className="py-1.5 pr-3">Budget</th><th className="py-1.5 text-right">Planned</th><th className="py-1.5 text-right">Spent</th><th className="py-1.5 text-right">Difference</th>
              </tr>
            </thead>
            <tbody>
              {c.rows.map((r) => {
                const d = Number(r.difference);
                return (
                  <tr key={r.category.id} className="border-t border-rule">
                    <td className="py-1.5 pr-3"><span className="inline-flex items-center gap-2"><i className="size-2.5 rounded-[2px]" style={{ background: categoryVar(r.category) }} />{r.category.name}</span></td>
                    <td className="num py-1.5 text-right">{eur0(r.planned)}</td>
                    <td className="num py-1.5 text-right">{eur0(r.spent)}</td>
                    <td className={cn('num py-1.5 text-right', d > 0.5 ? 'font-semibold text-warn' : 'text-good')}>{Math.abs(d) < 0.5 ? '—' : `${d > 0 ? '+' : '−'}${eur0(Math.abs(d))}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel className={SPAN[12]}>
        <PanelTitle>One change for {c.nextMonthName} {c.choice ? <Chip tone="ok" className="ml-2 normal-case tracking-normal">Saved</Chip> : null}</PanelTitle>
        {c.choice ? (
          <p className="text-[13.5px]">
            {c.choice}. Finally will check how it went when {c.nextMonthName} closes on {shortDate(c.closesOn)}.{' '}
            <button type="button" className="font-semibold text-brand" onClick={() => reopen.mutate()}>Pick again</button>
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {c.options.map((o) => (
              <Button key={o.value} variant="outline" disabled={choose.isPending} onClick={() => choose.mutate({ value: o.value, label: o.label }, { onSuccess: () => toast.success('Saved') })}>
                {o.label}
              </Button>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function ReviewPage() {
  const { tab = 'week' } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const week = useWeekReview();
  const month = useMonthClose();
  const q = tab === 'week' ? week : month;
  return (
    <>
      <PageHeader
        eyebrow={tab === 'week' ? 'Sunday · about 5 minutes' : 'The day before payday'}
        title="Review"
        lead={tab === 'week' ? 'Four short steps once a week keep the numbers right and catch drift early.' : 'Look back at a full month once, then pick one change for the next.'}
        right={<Seg label="Review type" value={tab} onChange={(v) => void navigate({ search: { tab: v } })} options={[['week', 'Weekly review'], ['month', 'Month close']]} />}
      />
      {q.error ? <ErrorNote error={q.error} retry={() => void q.refetch()} /> : null}
      {tab === 'week' ? (week.data ? <WeekReview r={week.data} /> : <LoadingBlock className="h-72 max-w-[640px]" />) : month.data ? <MonthCloseView c={month.data} /> : <LoadingBlock className="h-72" />}
    </>
  );
}
