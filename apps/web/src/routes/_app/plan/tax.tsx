import { eur, eur0, longDate, shortDate, useTax, useTaxMutations } from '@finally/api-client';
import type { TaxDto } from '@finally/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { ErrorNote, LoadingBlock, PageHeader, Panel, PanelTitle } from '@/components/common';
import { AmountField, Callout, Chip, Line, Seg, Tri } from '@/components/kit';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GRID, SPAN } from '@/lib/grid';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/plan/tax')({ component: TaxPage });

function Group({ title, note, items, tax }: { title: ReactNode; note?: string; items: TaxDto['items']; tax: ReturnType<typeof useTaxMutations> }): ReactNode {
  return (
    <>
      <PanelTitle>{title}</PanelTitle>
      {items.map((i) => (
        <Tri key={i.id} label={i.label} hint={i.hint} state={i.state} busy={tax.setCheck.isPending} onChange={(state) => tax.setCheck.mutate({ itemId: i.id, state })} />
      ))}
      {note ? <p className="mt-3 text-[12px] text-ink-3">{note}</p> : null}
    </>
  );
}

function TaxPage(): ReactNode {
  const [slip, setSlip] = useState<string | undefined>();
  const { data: t, error, refetch } = useTax(slip);
  const tax = useTaxMutations();
  if (error) return <ErrorNote error={error} retry={() => void refetch()} />;
  if (!t) return <LoadingBlock className="h-96" />;
  const credits = t.items.filter((i) => i.group === 'credits');
  const perks = t.items.filter((i) => i.group === 'perks');
  const unclaimed = Number(t.unclaimed);
  const ps = t.payslip;
  const diff = ps ? Number(ps.net) - Number(ps.expected.net) : 0;
  const rows: Array<[string, string]> = ps ? [['Gross pay', ps.expected.gross], ['Income tax', ps.expected.tax], ['USC', ps.expected.usc], ['PRSI', ps.expected.prsi]] : [];
  const share = (Number(t.takeHomeRaise.net) - Number(t.takeHome.net)) / Math.max(1, t.inputs.raise);
  return (
    <>
      <PageHeader
        eyebrow="Single PAYE employee · Irish rates"
        title="Tax & pay"
        lead="Check every payslip, claim what you are owed, and see what a raise is really worth. Each item is Not done, Done, or Doesn't apply."
      />
      <div className={GRID}>
        <Panel className={SPAN[6]}>
          <PanelTitle>
            <span>Tax credits you might be missing</span>
            <span className={cn('text-[12.5px] normal-case tracking-normal', unclaimed ? 'text-warn' : 'text-good')}>{unclaimed ? `${eur0(unclaimed)} possibly unclaimed` : 'All handled'}</span>
          </PanelTitle>
          {credits.slice(0, 1).map((i) => (
            <Tri key={i.id} label={i.label} hint={i.hint} state={i.state} onChange={(state) => tax.setCheck.mutate({ itemId: i.id, state })} />
          ))}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule py-2.5">
            <label htmlFor="tenancy" className="text-[13.5px]">
              Renting in Ireland since
              <small className="block text-[12px] text-ink-3">Change it if your tenancy started earlier</small>
            </label>
            <Input id="tenancy" type="month" value={t.inputs.tenancy ?? ''} max={new Date().toISOString().slice(0, 7)} onChange={(e) => tax.update.mutate({ tenancy: e.target.value || null })} className="w-[170px]" />
          </div>
          {credits.slice(1).map((i) => (
            <Tri key={i.id} label={i.label} hint={i.hint} state={i.state} onChange={(state) => tax.setCheck.mutate({ itemId: i.id, state })} />
          ))}
          <p className="mt-3 text-[12px] text-ink-3">Claimed in Revenue myAccount. Finally reminds you each January.</p>
        </Panel>
        <Panel className={SPAN[6]}>
          <Group title="Payroll perks to ask HR about" items={perks} tax={tax} note="December checklist: use your CGT exemption, decide on a pension top-up, gather medical receipts." />
        </Panel>

        <Panel className={SPAN[7]}>
          <PanelTitle>Pay checker</PanelTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={ps?.date ?? ''} onValueChange={(v) => setSlip(v)}>
              <SelectTrigger aria-label="Payday" className="w-[260px]"><SelectValue placeholder="Choose a payday" /></SelectTrigger>
              <SelectContent>{t.payslips.map((p) => <SelectItem key={p.date} value={p.date}>{p.label} · {eur(p.net)}</SelectItem>)}</SelectContent>
            </Select>
            <span className="text-[12px] text-ink-3">net pay from your bank; upload the payslip for the other lines</span>
          </div>
          {ps ? (
            <>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">
                      <th className="py-1.5" /><th className="py-1.5 text-right">From your bank</th><th className="py-1.5 text-right">Expected on {eur0(t.inputs.gross)}</th><th className="py-1.5 text-right">Check</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(([l, v]) => (
                      <tr key={l} className="border-t border-rule"><td className="py-1.5">{l}</td><td className="py-1.5 text-right text-ink-3">on the payslip</td><td className="num py-1.5 text-right">{eur(v)}</td><td className="py-1.5 text-right"><Chip>Upload to check</Chip></td></tr>
                    ))}
                    <tr className="border-t border-rule font-semibold">
                      <td className="py-1.5">Net pay</td><td className="num py-1.5 text-right">{eur(ps.net)}</td><td className="num py-1.5 text-right">{eur(ps.expected.net)}</td>
                      <td className="py-1.5 text-right">{Math.abs(diff) > 5 ? <Chip tone="mark">{eur(diff, { signed: true })}</Chip> : <Chip tone="ok">✓</Chip>}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <Callout tone={ps.verdict.needsAttention ? 'act' : 'info'} className="mt-3"><b>{ps.verdict.headline}</b> {ps.verdict.body}</Callout>
            </>
          ) : <p className="mt-3 text-[13px] text-ink-2">No salary payments found yet.</p>}
        </Panel>

        <div className={cn('grid content-start gap-4', SPAN[5])}>
          <Panel>
            <PanelTitle>Take-home calculator</PanelTitle>
            <div className="grid gap-3">
              <AmountField label="Salary (a year)" value={t.inputs.gross} max={120000} step={500} slider={false} onCommit={(v) => tax.update.mutate({ gross: v })} />
              <div className="flex items-center justify-between text-[13.5px]"><span>Tax year</span><Seg label="Tax year" value={String(t.inputs.year)} onChange={(v) => tax.update.mutate({ year: Number(v) })} options={[['2026', '2026'], ['2027', '2027']]} /></div>
            </div>
            <div className="mt-3">
              <Line label="Income tax" value={`−${eur(t.takeHome.tax)}`} />
              <Line label="USC" value={`−${eur(t.takeHome.usc)}`} />
              <Line label={t.inputs.year === 2026 ? 'PRSI (4.2%, then 4.35% from October)' : 'PRSI (4.35%)'} value={`−${eur(t.takeHome.prsi)}`} />
              <Line label="Take-home" value={`${eur(t.takeHome.net)} · ${eur(t.takeHome.monthly)} a month`} strong />
            </div>
          </Panel>
          <Panel>
            <PanelTitle>What a raise is worth</PanelTitle>
            <AmountField label="Raise" value={t.inputs.raise} max={10000} step={500} onCommit={(v) => tax.update.mutate({ raise: v })} />
            <div className="mt-3"><Line label="Extra in your pocket" value={`${eur(Number(t.takeHomeRaise.net) - Number(t.takeHome.net))} a year · ${eur(t.takeHomeRaise.extraMonthly)} a month`} strong /></div>
            <p className="mt-1 text-[12px] text-ink-3">{Math.round(share * 100)}% of it reaches you.</p>
          </Panel>
        </div>

        <Panel className={SPAN[12]}>
          <PanelTitle>
            <span>Tax rules Finally uses</span>
            <span className="text-[12px] normal-case tracking-normal text-ink-3">rules file {t.rules.version} · reviewed {longDate(t.rules.reviewed)}</span>
          </PanelTitle>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead><tr className="text-left text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3"><th className="py-1.5 pr-3">Rule</th><th className="py-1.5 pr-3">From</th><th className="py-1.5 pr-3">Source</th><th className="py-1.5">Reviewed</th></tr></thead>
              <tbody>
                {t.rules.rows.map((r) => (
                  <tr key={r.id} className="border-t border-rule">
                    <td className="py-1.5 pr-3">{r.label}</td>
                    <td className="py-1.5 pr-3 text-ink-2">{r.from}</td>
                    <td className="py-1.5 pr-3"><a href={r.url} target="_blank" rel="noreferrer" className="text-brand underline-offset-2 hover:underline">{r.source}</a></td>
                    <td className="num py-1.5 text-ink-3">{shortDate(r.reviewed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12px] text-ink-3">Rates live in one versioned file with a source and a review date for each rule, so a new Budget means one update. Estimates, not tax advice.</p>
        </Panel>
      </div>
    </>
  );
}
