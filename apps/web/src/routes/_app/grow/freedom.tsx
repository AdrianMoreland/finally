import { eur, eur0, useFreedom, useTax, useTaxMutations, useUpdateFreedom } from '@finally/api-client';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Big, ErrorNote, LoadingBlock, PageHeader, Panel, PanelTitle, Sub } from '@/components/common';
import { BandChart } from '@/components/charts/more-charts';
import { AmountField, Callout, Key, Line, Tri } from '@/components/kit';
import { GRID, SPAN } from '@/lib/grid';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/grow/freedom')({ component: FreedomPage });

function FreedomPage(): ReactNode {
  const { data: f, error, refetch } = useFreedom();
  const update = useUpdateFreedom();
  const tax = useTax();
  const taxM = useTaxMutations();
  if (error) return <ErrorNote error={error} retry={() => void refetch()} />;
  if (!f) return <LoadingBlock className="h-96" />;
  const i = f.inputs;
  const set = (patch: Record<string, unknown>): void => update.mutate(patch);
  const protection = tax.data?.items.filter((x) => x.group === 'protection') ?? [];
  const target = Number(f.target);
  const rung = f.ladder.rungs.at(-1)!;
  return (
    <>
      <PageHeader eyebrow="Comfortable, not rich for its own sake" title="Freedom" lead={'Decide what a comfortable life costs a year. That sets your "enough" number, the top rung of your money ladder.'} />
      <div className={GRID}>
        <Panel className={SPAN[4]}>
          <PanelTitle>Your inputs</PanelTitle>
          <div className="grid gap-4">
            <AmountField label="Comfortable yearly spending" value={i.spend} min={15000} max={60000} step={1000} onCommit={(v) => set({ spend: v })} />
            <AmountField label="Safe withdrawal rate" value={i.withdrawalPct} min={3} max={5} step={0.25} decimals={2} prefix="" suffix="%" onCommit={(v) => set({ withdrawalPct: v })} />
            <AmountField label="Invested each month" value={i.monthly} min={0} max={2500} step={50} onCommit={(v) => set({ monthly: v })} />
            <AmountField label="Yearly return" value={i.returnPct} min={2} max={9} step={0.5} decimals={1} prefix="" suffix="%" onCommit={(v) => set({ returnPct: v })} />
            <AmountField label="Your age" value={i.age} min={18} max={60} step={1} prefix="" onCommit={(v) => set({ age: v })} />
            <AmountField label="Raise to your monthly amount each year" value={i.raisePct} min={0} max={6} step={0.5} decimals={1} prefix="" suffix="%" onCommit={(v) => set({ raisePct: v })} />
          </div>
        </Panel>
        <Panel className={SPAN[8]}>
          <PanelTitle>
            <span>Your &ldquo;enough&rdquo; number</span>
            <span className="text-[12px] normal-case tracking-normal text-ink-3">{eur0(i.spend)} ÷ {i.withdrawalPct}%</span>
          </PanelTitle>
          <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
            <div>
              <Big>{eur0(f.target)}</Big>
              <Sub>{f.hitAge != null ? `The middle path gets there around age ${f.hitAge}.` : 'The middle path does not get there by 66 at this monthly amount.'}</Sub>
            </div>
            <div>
              <div className="num font-display text-[26px] font-medium">{Math.round(f.probBy55 * 100)}%</div>
              <div className="text-[12.5px] text-ink-3">of 300 simulated runs get there by 55</div>
            </div>
          </div>
          <div className="mt-3">
            <BandChart p10={f.p10} p50={f.p50} p90={f.p90} target={target} startAge={i.age} />
            <Key items={[{ name: 'mid', colour: '--brand', text: 'Middle path' }, { name: 'ranges', colour: '--ink-3', text: 'Weak and good runs' }, { name: 'enough', colour: '--ink', text: 'Enough' }]} />
          </div>
          {Number(f.myFutureFund) > 0 ? <p className="mt-3 text-[12.5px] text-ink-3">For comparison, My Future Fund contributions on your salary could reach about {eur0(f.myFutureFund)} by 66, before anything you add.</p> : null}
        </Panel>
        <Panel className={SPAN[6]}>
          <PanelTitle>Where this sits on your ladder</PanelTitle>
          <Line label={rung.title} value={rung.when} strong />
          <p className="mt-2 text-[12.5px] text-ink-2">The simulation uses a fixed random seed, so the picture only changes when you change an input. Returns are not promised; the wide band is the point. <Link to="/plan/pots" className="font-semibold text-brand">See the ladder</Link></p>
        </Panel>
        <Panel className={SPAN[6]}>
          <PanelTitle>Protection check</PanelTitle>
          {protection.map((p) => <Tri key={p.id} label={p.label} hint={p.hint} state={p.state} onChange={(state) => taxM.setCheck.mutate({ itemId: p.id, state })} />)}
          {!protection.length ? <p className="text-[13px] text-ink-2">Loading…</p> : null}
          <Callout className={cn('mt-3')}>Cover for the worst case comes before more investing: it protects the plan everything else depends on.</Callout>
          <p className="mt-2 text-[12px] text-ink-3">{eur(f.target)} is the amount at which {eur0(i.spend)} a year is {i.withdrawalPct}% of the pot.</p>
        </Panel>
      </div>
    </>
  );
}
