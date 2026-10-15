import { clockTime, eur, eur0, longDate, maskText, shortDate, usePinMutations, useToday, useUnsnoozeAll } from '@finally/api-client';
import type { TodayDto } from '@finally/contracts';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowRight, ChevronDown, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ActionRow } from '@/components/actions';
import { Big, ErrorNote, LoadingBlock, PageHeader, Panel, PanelTitle, Sub, Track } from '@/components/common';
import { Callout, Chip, Line } from '@/components/kit';
import { GRID, SPAN } from '@/lib/grid';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/')({ component: TodayPage });

function Maths({ t }: { t: TodayDto }): ReactNode {
  const s = t.safe;
  const budget = s.binds === 'budget';
  return (
    <div className="mt-3 grid gap-4 rounded-lg border border-rule bg-raised p-3.5 text-[13px] md:grid-cols-2">
      <div className={cn('rounded-md p-2.5', budget && 'bg-surface ring-1 ring-brand')}>
        <h4 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">What your budgets allow {budget ? '· the lower one' : ''}</h4>
        <Line label="Flexible budgets this month" value={eur(s.flexBudget)} />
        <Line label="Spent so far" value={`−${eur(s.spentFlex)}`} />
        <Line label="Not sorted yet (counts as spent)" value={`−${eur(s.unsorted)}`} />
        <Line label="Left in budgets" value={eur(s.budgetLeft)} strong />
        {Number(s.over) > 0 ? <p className="mt-1 text-[12px] text-warn">{eur(s.over)} of that is overspending on individual lines. It is not hidden.</p> : null}
      </div>
      <div className={cn('rounded-md p-2.5', !budget && 'bg-surface ring-1 ring-brand')}>
        <h4 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">What your balance allows {!budget ? '· the lower one' : ''}</h4>
        <Line label="In your accounts now" value={eur(s.balance)} />
        <Line label="Bills before payday" value={`−${eur(s.billsDue)}`} />
        <Line label="Buffer you keep" value={`−${eur(s.buffer)}`} />
        <Line label="Left from your balance" value={eur(s.balanceLeft)} strong />
        {t.pending.count > 0 ? <p className="mt-1 text-[12px] text-ink-3">{t.pending.count} pending payment{t.pending.count > 1 ? 's' : ''} ({eur(t.pending.total)}) already counted.</p> : null}
      </div>
      <p className="text-ink-2 md:col-span-2">
        The lower of the two, <b className="num">{eur(s.pool)}</b>, divided by <b>{s.daysLeft}</b> days to payday on {shortDate(t.nextPayday)} is <b className="num">{eur(s.perDay)}</b> a day. Refunds put money back; pending card payments already count.
      </p>
    </div>
  );
}

function Hero({ t }: { t: TodayDto }): ReactNode {
  const [maths, setMaths] = useState(false);
  const delta = Number(t.safe.perDay) - Number(t.safeYesterday);
  const week = t.week;
  const over = Number(t.safe.pool) < 0;
  return (
    <Panel className={SPAN[12]}>
      <PanelTitle>Safe to spend today</PanelTitle>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div>
          <Big className="text-[52px] font-light md:text-[64px]">{eur(t.safe.perDay)}</Big>
          <Sub>
            a day for the {t.daysToPayday} days to payday on {shortDate(t.nextPayday)}, set by your {t.safe.binds === 'budget' ? 'budgets' : 'balance'}, the lower of the two.
          </Sub>
          {Math.abs(delta) >= 0.01 ? (
            <div className={cn('mt-1 text-[12.5px]', delta < 0 ? 'text-warn' : 'text-good')}>
              {delta < 0 ? 'Down' : 'Up'} {eur(Math.abs(delta))} a day since you last looked
            </div>
          ) : null}
        </div>
        <div className="min-w-[220px] max-w-[320px] flex-1">
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="text-ink-2">This week</span>
            <b className={cn('num', Number(week.left) < 0 && 'text-warn')}>{Number(week.left) >= 0 ? `${eur(week.left)} left` : `${eur(Math.abs(Number(week.left)))} over`}</b>
          </div>
          <Track value={(Number(week.spent) / Math.max(1, Number(week.weekBudget))) * 100} className="my-2" height={9} />
          <div className="text-[12px] text-ink-3">
            {eur(week.spent)} of {eur0(week.weekBudget)} flexible budget for the week · {week.daysLeft} day{week.daysLeft === 1 ? '' : 's'} left
          </div>
        </div>
      </div>
      {over ? (
        <Callout tone="act" className="mt-3">
          Your {t.safe.binds === 'balance' ? 'balance is below the bills and buffer before payday' : 'budgets are used up'}. There is nothing safe to spend until payday; essentials are still covered by your bills.
        </Callout>
      ) : null}
      <button type="button" aria-expanded={maths} onClick={() => setMaths((v) => !v)} className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-brand">
        How this is worked out <ChevronDown className={cn('size-4 transition-transform', maths && 'rotate-180')} aria-hidden="true" />
      </button>
      {maths ? <Maths t={t} /> : null}
    </Panel>
  );
}

function Actions({ t }: { t: TodayDto }): ReactNode {
  const [all, setAll] = useState(false);
  const unsnooze = useUnsnoozeAll();
  const shown = all ? t.actions : t.actions.slice(0, 3);
  return (
    <Panel className={SPAN[7]}>
      <PanelTitle
        action={
          t.actions.length > 3 ? (
            <button type="button" onClick={() => setAll((v) => !v)}>
              {all ? 'Show top 3' : `Show all ${t.actions.length}`}
            </button>
          ) : undefined
        }
      >
        Needs you
      </PanelTitle>
      {shown.length ? (
        shown.map((a) => <ActionRow key={a.id} a={a} />)
      ) : (
        <p className="text-[13.5px] text-ink-2">Nothing needs you right now. Safe to spend is up to date.</p>
      )}
      {t.snoozed > 0 ? (
        <p className="mt-3 text-[12px] text-ink-3">
          {t.snoozed} snoozed.{' '}
          <button type="button" className="font-semibold text-brand" onClick={() => unsnooze.mutate()}>
            Show again
          </button>
        </p>
      ) : null}
    </Panel>
  );
}

function Since({ t }: { t: TodayDto }): ReactNode {
  const delta = Number(t.safe.perDay) - Number(t.safeYesterday);
  return (
    <Panel className={SPAN[5]}>
      <PanelTitle>Since you last looked</PanelTitle>
      {t.since.count ? (
        <>
          <Big className="text-[26px]">
            {t.since.count} payment{t.since.count === 1 ? '' : 's'}
          </Big>
          <Sub>
            {eur(t.since.out)} out{Number(t.since.back) > 0 ? `, ${eur(t.since.back)} back` : ''} today
            {Math.abs(delta) >= 0.01 ? `, safe to spend ${delta < 0 ? 'down' : 'up'} ${eur(Math.abs(delta))}` : ''}.
          </Sub>
        </>
      ) : (
        <p className="text-[13.5px] text-ink-2">No new payments today. {t.lastSyncAt ? `Last synced at ${clockTime(t.lastSyncAt)}.` : 'Not synced yet.'}</p>
      )}
      {t.pending.count > 0 ? (
        <div className="mt-3">
          <Chip tone="pend">{t.pending.count} pending</Chip>{' '}
          <span className="text-[12.5px] text-ink-2">
            {eur(t.pending.total)} on cards, already counted.{' '}
            <Link to="/money/payments" search={{ status: 'PENDING' } as never} className="font-semibold text-brand">
              See them
            </Link>
          </span>
        </div>
      ) : null}
    </Panel>
  );
}

function Pins({ t }: { t: TodayDto }): ReactNode {
  const { unpin } = usePinMutations();
  if (!t.pins.length) return null;
  return (
    <Panel className={SPAN[12]}>
      <PanelTitle>Pinned answers</PanelTitle>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
        {t.pins.map((p) => (
          <div key={p.id} className="relative rounded-lg border border-rule bg-raised p-3">
            <button type="button" aria-label={`Unpin ${p.short}`} onClick={() => unpin.mutate(p.id)} className="absolute right-2 top-2 text-ink-3 hover:text-ink">
              <X className="size-3.5" aria-hidden="true" />
            </button>
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">{p.short}</div>
            <div className="num mt-0.5 font-display text-[22px] font-medium">{maskText(p.big)}</div>
            <div className="mt-0.5 truncate text-[12px] text-ink-3">{p.text}</div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Rung({ t }: { t: TodayDto }): ReactNode {
  const l = t.ladder;
  const rung = l.rungs[l.current]!;
  return (
    <Panel className={SPAN[12]}>
      <PanelTitle action={<Link to="/plan/pots">Your ladder</Link>}>Your next rung</PanelTitle>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-[20px] font-medium leading-snug">{rung.title}</h3>
          <p className="text-[13px] text-ink-2">
            {rung.when}
            {rung.left && Number(rung.left) > 0 ? ` · ${eur0(rung.left)} to go` : ''}
          </p>
        </div>
        <ol className="flex items-center gap-1.5" aria-label="Money ladder progress">
          {l.rungs.map((r, i) => (
            <li key={r.key} title={r.title} className={cn('size-3 rounded-full border border-ink-3', r.done && 'border-brand bg-brand', i === l.current && !r.done && 'border-ink bg-ink')} />
          ))}
        </ol>
      </div>
    </Panel>
  );
}

function TodayPage() {
  const { data: t, error, refetch } = useToday();
  if (error) return <ErrorNote error={error} retry={() => void refetch()} />;
  if (!t) {
    return (
      <>
        <PageHeader title="Today" />
        <div className={GRID}>
          {[12, 7, 5].map((n, i) => (
            <LoadingBlock key={i} className={cn('h-40', SPAN[n as keyof typeof SPAN])} />
          ))}
        </div>
      </>
    );
  }
  return (
    <>
      <PageHeader
        eyebrow={longDate(t.today)}
        title="Today"
        right={
          <div className="inline-flex items-center gap-2 text-[12.5px] text-ink-2">
            <span className={cn('size-2 rounded-full', t.lastSyncAt ? 'bg-good' : 'bg-ink-3')} aria-hidden="true" />
            {t.lastSyncAt ? `Synced ${clockTime(t.lastSyncAt)} · ${t.accounts.map((a) => a.institution).filter((v, i, a) => a.indexOf(v) === i).join(', ')}` : 'Not synced yet'}
          </div>
        }
      />
      {!t.setupDone ? (
        <Link to="/setup" className="mb-4 flex w-full items-center gap-3 rounded-[6px] bg-surface px-4 py-3">
          <span>
            <b>Finish setting up.</b> Check what Finally found, your payday and your budgets. It takes about two minutes.
          </span>
          <span className="ml-auto inline-flex items-center gap-1 whitespace-nowrap font-semibold text-brand">
            Set up <ArrowRight className="size-4" aria-hidden="true" />
          </span>
        </Link>
      ) : null}
      <div className={GRID}>
        <Hero t={t} />
        <Actions t={t} />
        <Since t={t} />
        <Pins t={t} />
        <Rung t={t} />
      </div>
      <p className="mt-4 text-[12.5px] text-ink-3">
        More on the <Link to="/money/month" className="font-semibold text-brand">month</Link>: are you on track, where it went, net worth.
      </p>
    </>
  );
}
