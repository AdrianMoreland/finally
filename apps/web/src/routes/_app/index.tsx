import { clockTime, eur, eur0, longDate, maskText, shortDate, useCashflow, useMe, useMonth, usePinMutations, useToday, useUnsnoozeAll } from '@finally/api-client';
import type { CashflowDto, MonthDto, TodayDto, TransactionDto } from '@finally/contracts';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ArrowRight, Check, ChevronDown, ChevronUp, Pencil, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ActionRow } from '@/components/actions';
import { BurnChart, type BurnCompare } from '@/components/charts/burn-chart';
import { Sankey } from '@/components/charts/sankey';
import { CategoryChip, ErrorNote, LoadingBlock, PageHeader, Panel, Sub, Track } from '@/components/common';
import { Callout, Chip, Line } from '@/components/kit';
import { CardTitle, HeaderSelect, Kpi, Monogram } from '@/components/v4';
import { categoryVar } from '@/lib/category';
import { GRID, SPAN } from '@/lib/grid';
import { loadLayout, moveCard, saveLayout, toggleHidden, type TodayLayout } from '@/lib/layout';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/')({ component: TodayPage });

const CARD_IDS = ['kpis', 'hero', 'acts', 'spending', 'cashflow', 'since', 'ladder', 'pins'] as const;
type CardId = (typeof CARD_IDS)[number];
const CARD_NAMES: Record<CardId, string> = {
  kpis: 'Key numbers',
  hero: 'Safe to spend',
  acts: 'Needs you',
  spending: 'Spending',
  cashflow: 'Cash flow',
  since: 'Since you last looked',
  ladder: 'Money ladder',
  pins: 'Pinned answers',
};
const SPANS: Record<CardId, string> = { kpis: SPAN[12], hero: SPAN[7], acts: SPAN[5], spending: SPAN[7], cashflow: SPAN[5], since: SPAN[7], ladder: SPAN[5], pins: SPAN[12] };

/** Hour of the day on this device: before 5 is still evening, then morning, afternoon, evening. */
export function greeting(hour: number): string {
  return hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/* ------------------------------------------------------------------ cards */

function Kpis({ t }: { t: TodayDto }): ReactNode {
  const k = t.kpis;
  const nw = Number(k.netWorth.changeSixMonths);
  return (
    <div className="grid grid-cols-2 gap-2.5 min-[1151px]:grid-cols-4">
      <Kpi label="Next payday" value={shortDate(k.payday.date)} sub={`In ${plural(k.payday.daysAway, 'day')} · about ${eur0(k.payday.amount)}`} go="Plan" to="/plan/payday" />
      <Kpi
        label="Owed to you"
        value={eur0(k.owed.total)}
        sub={k.owed.people.length ? k.owed.people.map((p) => `${p.name} ${eur0(p.amount)}`).join(' · ') : 'Nobody owes you'}
        go="People"
        to="/plan/people"
      />
      <Kpi label="Rainy-day runway" value={k.runway.months} unit="months" sub={`${eur0(k.runway.saved)} saved · 3 months is ${eur0(k.runway.threeMonths)}`} go="Pots" to="/plan/pots" />
      <Kpi
        label="Net worth"
        value={eur0(k.netWorth.value)}
        sub={`${nw >= 0 ? '+' : ''}${eur0(nw)} in 6 months`}
        subTone={nw >= 0 ? 'good' : 'warn'}
        go="This month"
        to="/money/month"
      />
    </div>
  );
}

function Maths({ t, cf }: { t: TodayDto; cf: CashflowDto | undefined }): ReactNode {
  const s = t.safe;
  const budget = s.binds === 'budget';
  const own = cf?.rent?.own;
  return (
    <div className="mt-3 grid gap-4 rounded-card border border-hair bg-raised p-3.5 text-[13px] md:grid-cols-2">
      <div className={cn('rounded-control p-2.5', budget && 'bg-surface ring-1 ring-brand')}>
        <h4 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">From your budgets {budget ? <Chip tone="ok" className="ml-1">used</Chip> : null}</h4>
        <Line label="Flexible budgets this month" value={eur(s.flexBudget)} />
        <Line label="Spent so far" value={`−${eur(s.spentFlex)}`} />
        <Line label="Not sorted yet (counts as spent)" value={`−${eur(s.unsorted)}`} />
        <Line label="Left in budgets" value={eur(s.budgetLeft)} strong />
        {Number(s.over) > 0 ? <p className="mt-1 text-[12px] text-warn">{eur(s.over)} of that is overspending on individual lines. It is not hidden.</p> : null}
      </div>
      <div className={cn('rounded-control p-2.5', !budget && 'bg-surface ring-1 ring-brand')}>
        <h4 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">From your balance {!budget ? <Chip tone="ok" className="ml-1">used</Chip> : null}</h4>
        <Line label="In your accounts now" value={eur(s.balance)} />
        <Line label="Bills before payday" value={`−${eur(s.billsDue)}`} />
        <Line label="Buffer you keep" value={`−${eur(s.buffer)}`} />
        <Line label="Left from your balance" value={eur(s.balanceLeft)} strong />
        {t.pending.count > 0 ? <p className="mt-1 text-[12px] text-ink-3">{plural(t.pending.count, 'pending payment')} ({eur(t.pending.total)}) already counted.</p> : null}
      </div>
      <p className="text-ink-2 md:col-span-2">
        The lower of the two, <b className="num">{eur(s.pool)}</b>, divided by <b>{s.daysLeft}</b> days.{' '}
        {own ? `Rent counts as your ${eur0(own)}; what flatmates still owe you isn't spent until it arrives. ` : ''}Pots are already set aside on payday.
      </p>
    </div>
  );
}

function Hero({ t, month, cf }: { t: TodayDto; month: MonthDto | undefined; cf: CashflowDto | undefined }): ReactNode {
  const [maths, setMaths] = useState(false);
  const week = t.week;
  const s = t.safe;
  const day = month?.day ?? 1;
  const budget = Number(s.flexBudget);
  const usual = month ? Number(month.burn.pace[day - 1]?.value ?? 0) : null;
  const used = Number(s.spentFlex) + Number(s.unsorted);
  const over = Number(s.pool) < 0;
  return (
    <>
      <CardTitle>Safe to spend today</CardTitle>
      <div className="num font-display text-[52px] font-light leading-none tracking-[-0.02em] md:text-[64px]">{eur(s.perDay)}</div>
      <Sub>
        {Number(week.left) >= 0 ? `${eur(week.left)} left this week` : `${eur(Math.abs(Number(week.left)))} over this week`} · {plural(week.daysLeft, 'day')} to Sunday · {plural(t.daysToPayday, 'day')} to payday on {shortDate(t.nextPayday)}
      </Sub>
      <div className="mt-4">
        <Track value={(used / Math.max(1, budget)) * 100} tick={usual != null ? (usual / Math.max(1, budget)) * 100 : null} className="my-2" />
        <div className="flex flex-wrap justify-between gap-x-4 text-[12px] text-ink-3">
          <span>
            {eur0(used)} of {eur0(budget)} flexible budget used
          </span>
          {usual != null ? <span>tick = your usual pace for day {day}</span> : null}
        </div>
      </div>
      {over ? (
        <Callout tone="act" className="mt-3">
          Your {s.binds === 'balance' ? 'balance is below the bills and buffer before payday' : 'budgets are used up'}. There is nothing safe to spend until payday; essentials are still covered by your bills.
        </Callout>
      ) : null}
      <button type="button" aria-expanded={maths} onClick={() => setMaths((v) => !v)} className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-brand">
        {maths ? 'Hide the maths' : 'How this is worked out'} <ChevronDown className={cn('size-4 transition-transform', maths && 'rotate-180')} aria-hidden="true" />
      </button>
      {maths ? <Maths t={t} cf={cf} /> : null}
      <div className="mt-4 border-t border-dashed border-rule pt-3">
        <h4 className="mb-1 text-[12px] font-bold uppercase tracking-[0.08em] text-ink-3">Coming up before payday</h4>
        {t.comingUp.items.map((b) => (
          <Line key={`${b.date}-${b.name}`} label={`${longShort(b.date)} · ${b.name}`} value={`${b.varies ? 'about ' : ''}${eur(b.amount)}`} />
        ))}
        <Line label={`${longShort(t.comingUp.payday.date)} · Payday`} value={`+${eur0(t.comingUp.payday.amount)}`} tone="good" />
      </div>
    </>
  );
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function longShort(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay()]} ${shortDate(date)}`;
}

function Actions({ t }: { t: TodayDto }): ReactNode {
  const [all, setAll] = useState(false);
  const unsnooze = useUnsnoozeAll();
  const shown = all ? t.actions : t.actions.slice(0, 3);
  const more = t.actions.length - 3;
  return (
    <>
      <CardTitle note={`${plural(t.actions.length, 'item')} · biggest first`}>Needs you</CardTitle>
      {shown.length ? shown.map((a) => <ActionRow key={a.id} a={a} />) : <p className="text-[13.5px] text-ink-2">Nothing needs you right now. Safe to spend is up to date.</p>}
      {more > 0 ? (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-[13px] font-semibold text-brand">
          {all ? 'Show fewer' : `Show ${more} more`}
        </button>
      ) : null}
      {t.snoozed > 0 ? (
        <p className="mt-3 text-[12px] text-ink-3">
          {t.snoozed} snoozed until Monday.{' '}
          <button type="button" className="font-semibold text-brand" onClick={() => unsnooze.mutate()}>
            Bring back
          </button>
        </p>
      ) : null}
    </>
  );
}

function Spending({ month }: { month: MonthDto | undefined }): ReactNode {
  const [cmp, setCmp] = useState<BurnCompare>('last');
  if (!month) return <LoadingBlock className="h-56" />;
  const b = month.burn;
  const day = month.day;
  const spent = Number(b.spent[day - 1]?.value ?? 0);
  const ref = cmp === 'last' ? Number(b.previous[Math.min(b.previous.length, day) - 1]?.value ?? 0) : Number(b.pace[day - 1]?.value ?? 0);
  const diff = spent - ref;
  const label = MONTH_NAMES[Number(month.month.slice(5)) - 1]!.slice(0, 3);
  return (
    <>
      <CardTitle
        note={`${eur0(spent)} so far this month`}
        right={
          <HeaderSelect
            label="Compare with"
            value={cmp}
            onChange={setCmp}
            options={[
              ['last', 'This month vs last month'],
              ['usual', 'This month vs your usual pace'],
            ]}
          />
        }
      >
        Spending
      </CardTitle>
      <BurnChart burn={b} monthLabel={label} compare={cmp} />
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
        <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-4 bg-brand" />{MONTH_NAMES[Number(month.month.slice(5)) - 1]}</span>
        {cmp === 'last' ? (
          <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-4 bg-ink-3" />{b.previousLabel}</span>
        ) : (
          <span className="inline-flex items-center gap-1.5"><i className="w-4 border-t-2 border-dashed border-ink-3" />Your usual pace</span>
        )}
        <span className="inline-flex items-center gap-1.5"><i className="w-4 border-t-2 border-dashed border-brand" />Forecast</span>
      </div>
      <p className="mt-2 border-t border-dashed border-rule pt-2 text-[12px] text-ink-3">
        Flexible spending: rent and bills aren&apos;t in it. {eur0(Math.abs(diff))} {diff >= 0 ? 'more' : 'less'} than{' '}
        {cmp === 'last' ? `by day ${day} of ${b.previousLabel}` : `your usual pace for day ${day}`}.
      </p>
    </>
  );
}

function CashflowMini({ cf }: { cf: CashflowDto | undefined }): ReactNode {
  const navigate = useNavigate();
  if (!cf) return <LoadingBlock className="h-56" />;
  const go = (sel: string | null): void => void navigate({ to: '/money/cashflow', search: { period: 'sincepay' as const, ...(sel ? { sel } : {}) } });
  return (
    <>
      <CardTitle note={`since payday on ${shortDate(cf.from)}`} right={<Link to="/money/cashflow" search={{ period: 'sincepay' }}>Open ›</Link>}>
        Cash flow
      </CardTitle>
      <Sankey
        cf={cf}
        columns={2}
        width={420}
        height={250}
        mini
        merge={0.06}
        label={`Cash flow since ${shortDate(cf.from)}: ${eur0(cf.income)} came in, ${eur0(cf.spent)} spent, ${eur0(cf.saved)} set aside`}
        onSelect={(k) => go(k.endsWith(':smallgroups') ? null : k)}
      />
      <p className="mt-2 border-t border-dashed border-rule pt-2 text-[12px] text-ink-3">
        {eur0(cf.income)} came in.
        {cf.rent && Number(cf.back) > 0 ? ` Your rent counts as ${eur0(cf.rent.own)}; flatmates' ${eur0(cf.back)} back isn't income.` : ''}
      </p>
    </>
  );
}

const LAST_LOOK = 'finally-last-look';

function readLastLook(): string | null {
  try {
    return window.localStorage.getItem(LAST_LOOK);
  } catch {
    return null;
  }
}

function SinceRow({ t }: { t: TransactionDto }): ReactNode {
  const unsorted = !t.category && t.kind === 'SPEND';
  const colour = t.kind === 'INCOME' ? 'var(--brand)' : t.kind === 'SHARE' ? 'var(--pink)' : t.kind === 'TRANSFER' ? 'var(--ink-3)' : unsorted ? 'var(--marker)' : categoryVar(t.category);
  const name = t.merchant?.displayName ?? t.rawDescriptor;
  return (
    <tr className="border-t border-rule first:border-t-0">
      <td className="py-2 pr-2">
        <span className="flex items-center gap-2.5">
          <Monogram name={name} colour={colour} />
          <span className="min-w-0 truncate text-[13.5px] font-medium">{name}</span>
        </span>
      </td>
      <td className="py-2 pr-2">
        {t.kind === 'SHARE' ? (
          <Chip tone="ok">Rent share back</Chip>
        ) : t.kind === 'REFUND' ? (
          <Chip tone="plain">Refund{t.category ? ` · ${t.category.name}` : ''}</Chip>
        ) : t.status === 'PENDING' ? (
          <Chip tone="pend">Pending</Chip>
        ) : unsorted ? (
          <Link to="/money/sort"><Chip tone="mark">To sort</Chip></Link>
        ) : t.rentSplit ? (
          <Chip>Your quarter</Chip>
        ) : (
          <CategoryChip category={t.category} kind={t.kind} />
        )}
      </td>
      <td className="hidden py-2 pr-2 text-[12.5px] text-ink-3 sm:table-cell">{t.accountName}</td>
      <td className={cn('num py-2 text-right text-[13.5px] font-semibold', Number(t.amountEur) > 0 && 'text-good', t.status === 'PENDING' && 'text-ink-2')}>{eur(t.amountEur, { signed: true })}</td>
    </tr>
  );
}

function Since({ t }: { t: TodayDto }): ReactNode {
  const lastLook = useRef<string | null>(readLastLook());
  useEffect(() => {
    try {
      window.localStorage.setItem(LAST_LOOK, new Date().toISOString());
    } catch {
      /* storage blocked: "since you last looked" falls back to today */
    }
  }, []);
  const since = lastLook.current;
  const rows = useMemo(
    () => t.since.items.filter((x) => x.kind !== 'TRANSFER' && (since ? x.bookingDate > since : x.bookingDate.slice(0, 10) >= t.today)),
    [t.since.items, t.today, since],
  );
  const out = rows.filter((x) => Number(x.amountEur) < 0).reduce((a, x) => a + Math.abs(Number(x.amountEur)), 0);
  const back = rows.filter((x) => Number(x.amountEur) > 0 && x.kind !== 'INCOME').reduce((a, x) => a + Number(x.amountEur), 0);
  const note = since
    ? `${new Date(since).toDateString() === new Date().toDateString() ? 'earlier today' : new Date(since).toDateString() === new Date(Date.now() - 864e5).toDateString() ? 'last night' : 'last time'} at ${clockTime(since)}`
    : 'today';
  const delta = Number(t.safe.perDay) - Number(t.safeYesterday);
  return (
    <>
      <CardTitle note={note} right={<Link to="/money/payments">All payments ›</Link>}>
        Since you last looked
      </CardTitle>
      {rows.length ? (
        <>
          <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            <b>{plural(rows.length, 'payment')}</b>
            <span>{eur(out)} out</span>
            {back > 0 ? <span className="text-good">+{eur(back)} back</span> : null}
            {Math.abs(delta) >= 0.01 ? <span className="text-ink-2">Safe to spend {eur(t.safeYesterday)} → {eur(t.safe.perDay)}</span> : null}
          </div>
          <table className="w-full table-fixed border-collapse">
            <tbody>
              {rows.slice(0, 8).map((x) => (
                <SinceRow key={x.id} t={x} />
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="text-[13.5px] text-ink-2">No new payments. {t.lastSyncAt ? `Last synced at ${clockTime(t.lastSyncAt)}.` : 'Not synced yet.'}</p>
      )}
      <p className="mt-2 border-t border-dashed border-rule pt-2 text-[12px] text-ink-3">Pending card payments count straight away, because the money is already spoken for.</p>
    </>
  );
}

function Rung({ t }: { t: TodayDto }): ReactNode {
  const l = t.ladder;
  const done = l.rungs.filter((r) => r.done).length;
  const rung = l.rungs[l.current]!;
  return (
    <>
      <CardTitle right={<Link to="/plan/pots">Ladder ›</Link>}>Next on your money ladder</CardTitle>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[34px] font-medium leading-none">{l.current + 1}</span>
        <span className="text-[13px] text-ink-3">of {l.rungs.length}</span>
      </div>
      <h4 className="mt-2 text-[15px] font-semibold">{rung.title}</h4>
      <p className="text-[13px] text-ink-2">
        {rung.when}
        {rung.left && Number(rung.left) > 0 ? ` · ${eur0(rung.left)} to go` : ''}
      </p>
      <ol className="mt-3 flex gap-1" aria-label="Money ladder progress">
        {l.rungs.map((r, i) => (
          <li key={r.key} title={r.title} className={cn('h-1.5 flex-1 rounded-full bg-track', r.done && 'bg-brand', i === l.current && !r.done && 'bg-transparent ring-1 ring-brand')} />
        ))}
      </ol>
      <p className="mt-2 border-t border-dashed border-rule pt-2 text-[12px] text-ink-3">
        {done} of {l.rungs.length} rungs done. Each rung&apos;s date follows your payday plan.
      </p>
    </>
  );
}

function Pins({ t, editing }: { t: TodayDto; editing: boolean }): ReactNode {
  const { unpin } = usePinMutations();
  return (
    <>
      <CardTitle note="from Ask">Pinned answers</CardTitle>
      {t.pins.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
          {t.pins.map((p) => (
            <div key={p.id} className="relative rounded-control bg-raised p-3">
              <button type="button" aria-label={`Unpin ${p.short}`} onClick={() => unpin.mutate(p.id)} className="absolute right-2 top-2 text-ink-3 hover:text-ink">
                <X className="size-3.5" aria-hidden="true" />
              </button>
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">{p.short}</div>
              <div className="num mt-0.5 font-display text-[22px] font-medium">{maskText(p.big)}</div>
              <div className="mt-0.5 truncate text-[12px] text-ink-3">{p.text}</div>
            </div>
          ))}
        </div>
      ) : editing ? (
        <p className="text-[13px] text-ink-3">Pin an answer from Ask and it shows here.</p>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------- page */

function TodayPage() {
  const { data: t, error, refetch } = useToday();
  const month = useMonth();
  const cf = useCashflow('sincepay', false);
  const me = useMe();
  const navigate = useNavigate();
  const [layout, setLayout] = useState<TodayLayout>(() => loadLayout(CARD_IDS));
  const [editing, setEditing] = useState(false);

  // Someone who has not finished setting up starts the onboarding screens, once per browser session.
  const needsSetup = t ? !t.setupDone : false;
  useEffect(() => {
    if (!needsSetup) return;
    try {
      if (window.sessionStorage.getItem('finally-setup-prompted')) return;
      window.sessionStorage.setItem('finally-setup-prompted', '1');
    } catch {
      return;
    }
    void navigate({ to: '/setup' });
  }, [needsSetup, navigate]);

  const update = (next: TodayLayout): void => {
    setLayout(next);
    saveLayout(next);
  };

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

  const first = me.data?.displayName.trim().split(/\s+/)[0] || 'there';
  const hasPins = t.pins.length > 0;
  const visible = layout.order.filter((id) => (editing || !layout.hidden[id]) && (id !== 'pins' || hasPins || editing));
  const body = (id: CardId): ReactNode => {
    switch (id) {
      case 'kpis':
        return <Kpis t={t} />;
      case 'hero':
        return <Hero t={t} month={month.data} cf={cf.data} />;
      case 'acts':
        return <Actions t={t} />;
      case 'spending':
        return <Spending month={month.data} />;
      case 'cashflow':
        return <CashflowMini cf={cf.data} />;
      case 'since':
        return <Since t={t} />;
      case 'ladder':
        return <Rung t={t} />;
      case 'pins':
        return <Pins t={t} editing={editing} />;
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={longDate(t.today)}
        title={`${greeting(new Date().getHours())}, ${first}`}
        lead={editing ? "Move cards up or down and hide the ones you don't need. The layout is saved on this device." : undefined}
        right={
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 text-[12.5px] text-ink-2 sm:inline-flex">
              <span className={cn('size-2 rounded-full', t.lastSyncAt ? 'bg-fill' : 'bg-ink-3')} aria-hidden="true" />
              {t.lastSyncAt ? `Synced ${clockTime(t.lastSyncAt)} · ${[...new Set(t.accounts.map((a) => a.institution))].join(' and ')}` : 'Not synced yet'}
            </div>
            <button
              type="button"
              onClick={() => {
                if (editing) toast.success('Today saved on this device.');
                setEditing((v) => !v);
              }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-control border px-3 py-1.5 text-[13px] font-bold',
                editing ? 'border-fill bg-fill text-on-fill' : 'border-rule text-ink hover:border-ink-3',
              )}
            >
              {editing ? <Check className="size-4" aria-hidden="true" /> : <Pencil className="size-3.5" aria-hidden="true" />}
              {editing ? 'Done' : 'Customize'}
            </button>
          </div>
        }
      />
      {!t.setupDone ? (
        <Link to="/setup" className="mb-4 flex w-full items-center gap-3 rounded-card border border-hair bg-surface px-4 py-3">
          <span>
            <b>Finish setting up.</b> Check what Finally found, your payday and your budgets. It takes about two minutes.
          </span>
          <span className="ml-auto inline-flex items-center gap-1 whitespace-nowrap font-semibold text-brand">
            Set up <ArrowRight className="size-4" aria-hidden="true" />
          </span>
        </Link>
      ) : null}
      <div className={cn(GRID, '[grid-auto-flow:row_dense]')}>
        {visible.map((id) => {
          const card = id as CardId;
          const hidden = !!layout.hidden[id];
          const i = layout.order.indexOf(id);
          const content = body(card);
          return (
            <div key={id} className={cn(SPANS[card], editing && 'relative rounded-card outline-dashed outline-[1.5px] outline-offset-[3px] outline-brand', hidden && 'opacity-45')}>
              {editing ? (
                <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-brand">
                  <span className="mr-auto">{CARD_NAMES[card]}</span>
                  <button type="button" aria-label={`Move ${CARD_NAMES[card]} up`} disabled={i === 0} onClick={() => update(moveCard(layout, id, -1))} className="grid size-6 place-items-center rounded-control border border-rule text-ink-2 disabled:opacity-35">
                    <ChevronUp className="size-4" aria-hidden="true" />
                  </button>
                  <button type="button" aria-label={`Move ${CARD_NAMES[card]} down`} disabled={i === layout.order.length - 1} onClick={() => update(moveCard(layout, id, 1))} className="grid size-6 place-items-center rounded-control border border-rule text-ink-2 disabled:opacity-35">
                    <ChevronDown className="size-4" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => update(toggleHidden(layout, id))} className="inline-flex items-center gap-1 rounded-control border border-rule px-2 py-0.5 text-ink-2">
                    {hidden ? 'Show' : <><Trash2 className="size-3" aria-hidden="true" />Hide</>}
                  </button>
                </div>
              ) : null}
              {card === 'kpis' ? content : <Panel className="h-full">{content}</Panel>}
            </div>
          );
        })}
      </div>
    </>
  );
}
