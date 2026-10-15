import { eur, eur0, longDate, shortDate, usePayday, usePaydayMutations, usePeople, usePeopleMutations, usePotMutations, usePots } from '@finally/api-client';
import type { PaydayPlanDto } from '@finally/contracts';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { ErrorNote, LoadingBlock, PageHeader, Panel, PanelTitle } from '@/components/common';
import { AmountField, Callout, Chip, Key, Line, StackBar } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { GRID, SPAN } from '@/lib/grid';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/plan/payday')({ component: PaydayPage });

function OrderState({ o }: { o: PaydayPlanDto['orders'][number] }): ReactNode {
  if (o.arrived) return <Chip tone="ok"><Check className="size-3" aria-hidden="true" /> Arrived</Chip>;
  if (o.state === 'missing') return <Chip tone="mark">Not set up</Chip>;
  if (o.state === 'changed') return <Chip tone="mark">Bank has {eur0(o.set ?? '0')}</Chip>;
  return <Chip tone="ok">Standing order set</Chip>;
}

function PaydayPage() {
  const plan = usePayday();
  const pots = usePots();
  const people = usePeople();
  const potM = usePotMutations();
  const peopleM = usePeopleMutations();
  const { setOrder, settings } = usePaydayMutations();

  if (plan.error) return <ErrorNote error={plan.error} retry={() => void plan.refetch()} />;
  const p = plan.data;
  if (!p || !pots.data || !people.data) return <LoadingBlock className="h-96" />;

  const left = Number(p.left);
  const surplus = Number(p.surplus);
  const ready = p.orders.filter((o) => o.state === 'ok' || o.arrived).length;
  const rise = Number(p.nextYearRise);
  const days = Math.round((Date.parse(`${p.nextPayday}T00:00:00Z`) - Date.now()) / 86_400_000);
  const bar = [
    { name: 'Fixed bills', value: Number(p.fixed), colour: '--c-bills' },
    { name: 'Flexible budgets', value: Number(p.flexible), colour: '--c-groceries' },
    ...p.items.map((i) => ({ name: i.name, value: Number(i.amount), colour: i.color })),
    ...(left > 0 ? [{ name: 'Unplanned', value: left, colour: '--rule' }] : []),
  ];

  return (
    <>
      <PageHeader
        eyebrow={`Next payday ${longDate(p.nextPayday)} · in ${Math.max(0, days)} days`}
        title="Payday plan"
        lead="Pay yourself first. Your plan is your list of pots plus paying people back. Standing orders move the money, and Finally checks that each one arrives."
      />
      <div className={GRID}>
        <Panel className={SPAN[12]}>
          <PanelTitle>Where {eur(p.netPay)} goes</PanelTitle>
          <StackBar parts={bar} label="How your pay is split" />
          <Key items={bar.map((b) => ({ name: b.name, colour: b.colour, text: `${b.name} ${eur0(b.value)}` }))} />
        </Panel>

        <Panel className={SPAN[7]}>
          <PanelTitle>
            <span>Each payday</span>
            <span className={cn('text-[12.5px] normal-case tracking-normal', left < 50 ? 'text-warn' : 'text-good')}>{left >= 0 ? `${eur(left)} unplanned` : `${eur(-left)} more than you have`}</span>
          </PanelTitle>
          <p className="mb-3 text-[13px] text-ink-2">
            After fixed bills ({eur0(p.fixed)}) and flexible budgets ({eur0(p.flexible)}) you have <b className="num text-ink">{eur(p.surplus)}</b> to plan. Type an amount, nudge it, or drag.
          </p>
          <div className="grid gap-4">
            {pots.data.pots.map((pot) => (
              <AmountField
                key={pot.id}
                label={pot.name}
                sub={pot.type === 'SAFETY' ? 'Safety' : pot.type === 'PLANNED' ? 'Planned spend' : pot.type === 'TREAT' ? 'Treat' : 'Investing'}
                value={Number(pot.monthly)}
                colour={pot.type === 'SAFETY' ? '--brand' : pot.type === 'PLANNED' ? '--c-subs' : pot.type === 'TREAT' ? '--c-fun' : '--c-transport'}
                max={Math.max(800, Math.round(surplus))}
                onCommit={(v) => potM.update.mutate({ id: pot.id, monthly: v.toFixed(2) }, { onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not save') })}
              />
            ))}
            <AmountField
              label="Paying people back"
              sub="Your payoff order"
              value={Number(people.data.plan.monthly)}
              colour="--c-eating"
              max={Math.max(800, Math.round(surplus))}
              onCommit={(v) => peopleM.plan.mutate({ monthly: v.toFixed(2) })}
            />
          </div>
          {surplus < 0 ? (
            <Callout tone="act" className="mt-4">Your bills and budgets alone come to {eur0(-surplus)} more than your pay. Trim a flexible budget before planning pots.</Callout>
          ) : left < 0 ? (
            <Callout tone="act" className="mt-4">Your plan adds up to more than your pay leaves. Lower a pot, or trim a flexible budget.</Callout>
          ) : null}
          <p className="mt-3 text-[12.5px] text-ink-3">
            Pots live in Revolut vaults. <Link to="/plan/pots" className="font-semibold text-brand">See your pots and ladder</Link>
          </p>
        </Panel>

        <div className={cn('grid content-start gap-4', SPAN[5])}>
          <Panel>
            <PanelTitle>
              <span>Payday checklist</span>
              <span className="text-[12px] normal-case tracking-normal text-ink-3">{ready} of {p.orders.length} ready</span>
            </PanelTitle>
            {p.orders.length ? (
              <div className="grid gap-3">
                {p.orders.map((o) => (
                  <div key={o.key} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-t border-rule pt-3 first:border-t-0 first:pt-0">
                    <i className="mt-1.5 size-2.5 rounded-[3px]" style={{ background: `var(${o.color})` }} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <b className="text-[13.5px]">{o.name} <span className="num font-semibold">{eur0(o.amount)}</span></b>
                        <OrderState o={o} />
                      </div>
                      <div className="text-[12px] text-ink-3">AIB → {o.to} · on {shortDate(p.nextPayday)}</div>
                      {o.state !== 'ok' ? (
                        <button
                          type="button"
                          className="mt-1 text-[12.5px] font-semibold text-brand"
                          onClick={() => setOrder.mutate({ key: o.key, amount: o.amount }, { onSuccess: () => toast.success(`${o.name} marked as set up`) })}
                        >
                          {o.state === 'missing' ? "I've set it up" : "I've changed it"}
                        </button>
                      ) : (
                        <button type="button" className="mt-1 text-[12px] text-ink-3 hover:text-ink" onClick={() => setOrder.mutate({ key: o.key, amount: null })}>
                          Undo
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-ink-2">No standing orders yet. Give a pot an amount each payday and its standing order shows up here.</p>
            )}
            <p className="mt-3 text-[12px] text-ink-3">
              Finally only reads your accounts. It never moves money: you set each standing order up once in AIB, and on payday Finally ticks it off when the transfer lands.
            </p>
          </Panel>
          <Panel>
            <label className="flex items-center justify-between gap-3 text-[13.5px]">
              <span>
                <b>Plan on salary only</b>
                <small className="block text-[12px] text-ink-3">The bonus never props up rent or food.</small>
              </span>
              <Switch checked={p.salaryOnly} onCheckedChange={(v) => settings.mutate({ salaryOnly: v })} aria-label="Plan on salary only" />
            </label>
            {!p.salaryOnly ? <Callout tone="warn" className="mt-3">Counting the bonus as income adds money on paper. If it is late or smaller, your budget breaks.</Callout> : null}
          </Panel>
        </div>

        <Panel className={SPAN[6]}>
          <PanelTitle>Lifestyle-creep guard</PanelTitle>
          <p className="text-[13.5px]">
            From January, Budget 2027 tax changes give you about <b className="num">{eur(rise)}</b> more a month. Finally suggests sending half of any rise to a pot before you get used to it.
          </p>
          <Button className="mt-3" variant={p.lifestyleGuard ? 'default' : 'outline'} onClick={() => settings.mutate({ lifestyleGuard: !p.lifestyleGuard })}>
            {p.lifestyleGuard ? `On: ${eur(rise / 2)} a month to Rainy day from January` : 'Send half to Rainy day from January'}
          </Button>
        </Panel>

        <Panel className={SPAN[6]}>
          <PanelTitle>Balance until payday</PanelTitle>
          <Line label="Today" value={eur(p.balanceToday)} />
          {p.cashflow.map((c, i) => (
            <Line key={i} label={`${shortDate(c.date)} · ${c.name}`} value={eur(c.balance)} />
          ))}
          <Line label="Flexible spending still budgeted" value={`−${eur(p.flexLeft)}`} />
          <Line label={`Lowest point before ${shortDate(p.nextPayday)}`} value={eur(p.lowestBalance)} strong tone={Number(p.lowestBalance) < 200 ? 'warn' : undefined} />
          <p className="mt-2 text-[12px] text-ink-3">Finally warns you if this forecast drops below €200.{Number(p.overdrawnFees) > 0 ? ` AIB charged ${eur(p.overdrawnFees)} in fees over the last year.` : ''}</p>
        </Panel>
      </div>
    </>
  );
}
