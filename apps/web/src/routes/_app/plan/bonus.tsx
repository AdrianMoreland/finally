import { eur, eur0, useBonus, useUpdateBonus } from '@finally/api-client';
import { createFileRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Big, ErrorNote, LoadingBlock, PageHeader, Panel, PanelTitle, Sub } from '@/components/common';
import { AmountField, Callout, Line, Seg } from '@/components/kit';
import { GRID, SPAN } from '@/lib/grid';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/plan/bonus')({ component: BonusPage });

function BonusPage(): ReactNode {
  const { data: b, error, refetch } = useBonus();
  const update = useUpdateBonus();
  if (error) return <ErrorNote error={error} retry={() => void refetch()} />;
  if (!b) return <LoadingBlock className="h-96" />;
  const i = b.inputs;
  const net = Number(b.netWithPension);
  const unallocated = Number(b.unallocated);
  const set = (patch: Record<string, unknown>): void => update.mutate(patch);
  const alloc = (k: 'debts' | 'rainy' | 'invest' | 'treat', v: number): void => set({ allocation: { ...i.allocation, [k]: v } });
  return (
    <>
      <PageHeader eyebrow="December, after tax" title="Bonus" lead="A bonus is taxed at the top rate, so the figure on paper is not what you can spend. See what is left, and give every euro a job before it arrives." />
      <div className={GRID}>
        <Panel className={SPAN[5]}>
          <PanelTitle>If you get</PanelTitle>
          <div className="grid gap-4">
            <AmountField label="Bonus at 100%" value={i.target} max={30000} step={100} slider={false} onCommit={(v) => set({ target: v })} />
            <AmountField label="How much of it you expect" value={i.pct} prefix="" suffix="%" max={100} step={5} onCommit={(v) => set({ pct: v })} />
            <div className="flex items-center justify-between gap-3 text-[13.5px]">
              <span>Tax year</span>
              <Seg label="Tax year" value={String(i.year)} onChange={(v) => set({ year: Number(v) })} options={[['2026', '2026'], ['2027', '2027']]} />
            </div>
            <AmountField label="Put into a pension" sub={`Up to ${eur0(b.cap)} (20% of pay) gets tax relief at your top rate`} value={i.pension} max={Math.max(1000, Math.round(Number(b.cap)))} step={100} onCommit={(v) => set({ pension: v })} />
          </div>
        </Panel>

        <Panel className={SPAN[7]}>
          <PanelTitle>What reaches you</PanelTitle>
          <Big className={cn(net < 0 && 'text-warn')}>{eur(b.netWithPension)}</Big>
          <Sub>from a {eur0(b.gross)} bonus{Number(b.pension) > 0 ? `, with ${eur0(b.pension)} going into your pension` : ''}.</Sub>
          <div className="mt-3">
            <Line label="Bonus before tax" value={eur(b.gross)} />
            <Line label="Income tax (20% then 40%)" value={`−${eur(b.taxWith)}`} />
            <Line label="USC" value={`−${eur(b.usc)}`} />
            <Line label="PRSI" value={`−${eur(b.prsi)}`} />
            {Number(b.pension) > 0 ? <Line label="Into your pension" value={`−${eur(b.pension)}`} /> : null}
            <Line label="Net" value={eur(b.netWithPension)} strong />
          </div>
          {Number(b.aboveBand) > 0 ? <p className="mt-2 text-[12.5px] text-ink-3">{eur0(b.aboveBand)} of the bonus sits above the 20% band, so it is taxed at 40%.</p> : null}
          {Number(b.pension) === 0 ? <p className="mt-1 text-[12.5px] text-ink-3">Without a pension contribution you keep {eur0(b.netWithoutPension)}.</p> : <p className="mt-1 text-[12.5px] text-ink-3">The pension money is yours, just locked away until you retire.</p>}
          <div className="mt-4 grid grid-cols-3 gap-2">
            {b.scenarios.map((s) => (
              <div key={s.pct} className={cn('rounded-lg border border-rule bg-raised p-2.5 text-center', s.pct === i.pct && 'ring-1 ring-brand')}>
                <div className="text-[11.5px] text-ink-3">{s.pct === 0 ? 'No bonus' : `${s.pct}% of target`}</div>
                <div className="num font-semibold">{eur0(s.net)}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[12px] text-ink-3">The size of the bet: what you keep at 0%, 50% and 100%.</p>
        </Panel>

        <Panel className={SPAN[12]}>
          <PanelTitle>
            <span>Give every euro a job</span>
            <span className={cn('text-[12.5px] normal-case tracking-normal', unallocated < 0 ? 'text-warn' : 'text-ink-2')}>{unallocated >= 0 ? `${eur(b.unallocated)} still to place` : `${eur(Math.abs(unallocated))} more than the bonus`}</span>
          </PanelTitle>
          <div className="grid gap-4 md:grid-cols-2">
            <AmountField label="Paying people back" value={i.allocation.debts} colour="--c-eating" max={Math.max(1000, Math.round(net))} step={50} onCommit={(v) => alloc('debts', v)} />
            <AmountField label="Rainy day" value={i.allocation.rainy} colour="--brand" max={Math.max(1000, Math.round(net))} step={50} onCommit={(v) => alloc('rainy', v)} />
            <AmountField label="Investing pot" value={i.allocation.invest} colour="--c-transport" max={Math.max(1000, Math.round(net))} step={50} onCommit={(v) => alloc('invest', v)} />
            <AmountField label="Treat yourself" value={i.allocation.treat} colour="--c-fun" max={Math.max(1000, Math.round(net))} step={50} onCommit={(v) => alloc('treat', v)} />
          </div>
          {unallocated > 0 ? <Callout className="mt-3">Money with no job tends to disappear into the month. Add it to one of the four.</Callout> : null}
          <p className="mt-3 text-[12px] text-ink-3">Estimates for a single PAYE employee; not tax advice.</p>
        </Panel>
      </div>
    </>
  );
}
