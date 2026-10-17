import { eur, eur0, shortDate, useCashflow } from '@finally/api-client';
import type { CashflowDto, CashflowPeriod } from '@finally/contracts';
import { CF_PERIOD_LABEL, CF_PERIODS } from '@finally/finance-core';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMemo, useState, type ReactNode } from 'react';
import { z } from 'zod';
import { Sankey } from '@/components/charts/sankey';
import { CategoryChip, ErrorNote, LoadingBlock, PageHeader, Panel } from '@/components/common';
import { Chip, Seg } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { CardTitle, HeaderSelect, Kpi, Monogram, ToggleRow } from '@/components/v4';
import { categoryVar } from '@/lib/category';
import { GRID, SPAN } from '@/lib/grid';
import { cn } from '@/lib/utils';

const search = z.object({
  period: z.enum(CF_PERIODS).optional(),
  sel: z.string().optional(),
});

export const Route = createFileRoute('/_app/money/cashflow')({ validateSearch: search, component: CashflowPage });

type Payment = CashflowDto['payments'][number];

const rng = (from: string, to: string): string => `${shortDate(from)}–${shortDate(to)}`;

function nodeName(cf: CashflowDto, key: string): string | null {
  const id = key.slice(2);
  const all = [...cf.sources, ...cf.groups, ...cf.groups.flatMap((g) => g.cats)];
  return all.find((n) => n.id === id)?.name ?? null;
}

function PaymentRow({ p }: { p: Payment }): ReactNode {
  const unsorted = p.kind === 'SPEND' && !p.category;
  const colour = p.kind === 'INCOME' ? 'var(--brand)' : p.kind === 'SHARE' ? 'var(--pink)' : p.kind === 'FRONT' || p.kind === 'TRANSFER' ? 'var(--ink-3)' : unsorted ? 'var(--marker)' : categoryVar(p.category);
  const payback = p.keys.includes('g:payback');
  return (
    <tr className="border-t border-rule first:border-t-0">
      <td className="w-[68px] whitespace-nowrap py-2 pr-2 text-[12.5px] text-ink-3">{shortDate(p.date)}</td>
      <td className="py-2 pr-2">
        <span className="flex items-center gap-2.5">
          <Monogram name={p.name} colour={colour} />
          <span className="min-w-0 truncate text-[13.5px] font-medium">{p.name}</span>
        </span>
      </td>
      <td className="py-2 pr-2">
        <span className="flex flex-wrap gap-1">
          {p.kind === 'SHARE' ? (
            <Chip tone="ok">Rent share back · not income</Chip>
          ) : p.kind === 'FRONT' ? (
            <Chip>Fronted for flatmates</Chip>
          ) : p.kind === 'TRANSFER' ? (
            <Chip>Between your accounts</Chip>
          ) : p.kind === 'INCOME' ? (
            <Chip tone="ok">Income</Chip>
          ) : payback ? (
            <Chip>Paying back</Chip>
          ) : (
            <CategoryChip category={p.category} kind={p.kind} />
          )}
          {p.bankAmount ? <Chip>Your quarter of {eur0(Math.abs(Number(p.bankAmount)))}</Chip> : null}
          {p.excluded ? <Chip>From a pot</Chip> : null}
        </span>
      </td>
      <td className="hidden py-2 pr-2 text-[12.5px] text-ink-3 md:table-cell">{p.account}</td>
      <td className={cn('num whitespace-nowrap py-2 text-right text-[13.5px] font-semibold', Number(p.amount) > 0 && p.kind !== 'SHARE' && 'text-good', p.pending && 'text-ink-2')}>{eur(p.amount, { signed: true })}</td>
    </tr>
  );
}

function CashflowPage() {
  const { period: per, sel } = Route.useSearch();
  const period: CashflowPeriod = per ?? 'lastmonth';
  const navigate = useNavigate({ from: Route.fullPath });
  const [by, setBy] = useState<'group' | 'both'>('both');
  const [pass, setPass] = useState(false);
  const [all, setAll] = useState(false);
  const q = useCashflow(period, pass);
  const cf = q.data;

  const set = (next: { period?: CashflowPeriod; sel?: string | null }): void =>
    void navigate({ to: '/money/cashflow', search: (prev) => ({ ...prev, ...(next.period ? { period: next.period } : {}), sel: next.sel === null ? undefined : (next.sel ?? prev.sel) }), replace: true });

  const rows = useMemo(() => {
    if (!cf) return [];
    return sel ? cf.payments.filter((p) => p.keys.includes(sel)) : cf.payments;
  }, [cf, sel]);

  if (q.error) return <ErrorNote error={q.error} retry={() => void q.refetch()} />;

  const lead = cf?.rent
    ? `What came in on the left, where it went on the right. Your rent counts as your quarter, ${eur0(cf.rent.own)}. The ${eur0(Number(cf.rent.total) - Number(cf.rent.own))} your flatmates send back only passes through, so it is neither income nor spending.`
    : 'What came in on the left, where it went on the right. Money moved between your own accounts is left out.';
  const periodSelect = (
    <HeaderSelect label="Period" value={period} onChange={(v) => set({ period: v, sel: null })} options={CF_PERIODS.map((p) => [p, CF_PERIOD_LABEL[p]] as const)} />
  );

  if (!cf) {
    return (
      <>
        <PageHeader eyebrow="Where your money went" title="Cash flow" lead={lead} right={periodSelect} />
        <div className={GRID}>
          <LoadingBlock className="col-span-12 h-96" />
        </div>
      </>
    );
  }

  const shown = all ? rows : rows.slice(0, 15);
  const outs = rows.filter((p) => Number(p.amount) < 0 && p.kind !== 'FRONT');
  const biggest = [...outs].sort((a, b) => Number(a.amount) - Number(b.amount))[0];
  const merch = new Map<string, number>();
  for (const p of outs) merch.set(p.name, (merch.get(p.name) ?? 0) - Number(p.amount));
  const top = [...merch].sort((a, b) => b[1] - a[1])[0];
  const kept = cf.kept;
  const selName = sel ? nodeName(cf, sel) : null;
  const names = [...new Set(cf.sources.filter((s) => s.id.startsWith('inc:')).map((s) => s.name))];
  const incomeNames = names.length > 2 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(', ');

  return (
    <>
      <PageHeader eyebrow="Where your money went" title="Cash flow" lead={lead} right={periodSelect} />
      <div className="mb-2.5 grid grid-cols-2 gap-2.5 min-[1151px]:grid-cols-4">
        <Kpi label="Came in" value={eur0(cf.income)} valueTone="good" sub={incomeNames || 'No pay in this period'} />
        <Kpi label="Spent" value={eur0(cf.spent)} sub={cf.rent ? `Rent counted as your ${eur0(cf.rent.own)}` : undefined} />
        <Kpi label="Set aside" value={eur0(Number(cf.saved) + Number(cf.paidBack))} sub={`${eur0(cf.saved)} to pots${Number(cf.paidBack) > 0 ? ` · ${eur0(cf.paidBack)} paid back` : ''}`} />
        <Kpi
          label="Kept before pots"
          value={kept ? `${kept.pct}%` : '—'}
          valueTone={kept && Number(kept.kept) < 0 ? 'warn' : undefined}
          sub={kept ? `${Number(kept.kept) >= 0 ? '+' : ''}${eur0(kept.kept)} of what came in` : 'Payday falls outside this period'}
        />
      </div>

      <Panel>
        <CardTitle
          note={rng(cf.from, cf.to)}
          right={
            <Seg
              label="Detail"
              value={by}
              onChange={setBy}
              options={[
                ['group', 'By group'],
                ['both', 'By group & category'],
              ]}
            />
          }
        >
          {cf.label}
        </CardTitle>
        <Sankey
          cf={cf}
          columns={by === 'both' ? 3 : 2}
          width={1000}
          sel={sel ?? null}
          onSelect={(k) => set({ sel: k === sel ? null : k })}
          label={`Cash flow from ${shortDate(cf.from)} to ${shortDate(cf.to)}: ${eur0(cf.income)} came in, ${eur0(cf.spent)} spent, ${eur0(cf.saved)} set aside`}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-rule pt-3">
          <ToggleRow
            checked={pass}
            onChange={setPass}
            label="Show flatmates' rent passing through"
            sub={Number(cf.fronted) > 0 || pass ? `${eur0(cf.fronted)} fronted, ${eur0(cf.back)} back in this period. Shown in grey, never counted.` : 'No rent paid in this period.'}
          />
          {sel ? (
            <Button variant="outline" size="sm" onClick={() => set({ sel: null })}>
              Clear: {selName ?? ''}
            </Button>
          ) : (
            <span className="text-[12.5px] text-ink-3">Click a group or category to see its payments.</span>
          )}
        </div>
      </Panel>

      <div className={cn(GRID, 'mt-2.5')}>
        <Panel className={SPAN[8]}>
          <CardTitle note={`${rows.length} in ${CF_PERIOD_LABEL[period].toLowerCase()}`}>{selName ?? 'Payments'}</CardTitle>
          {shown.length ? (
            <table className="w-full border-collapse">
              <tbody>
                {shown.map((p) => (
                  <PaymentRow key={p.id} p={p} />
                ))}
              </tbody>
            </table>
          ) : (
            <p className="py-4 text-[13.5px] text-ink-3">Nothing here. Money kept in your accounts has no payments.</p>
          )}
          {rows.length > shown.length ? (
            <div className="pt-3 text-center">
              <Button variant="outline" size="sm" onClick={() => setAll(true)}>
                Show all {rows.length}
              </Button>
            </div>
          ) : null}
        </Panel>
        <Panel className={SPAN[4]}>
          <CardTitle>Summary</CardTitle>
          {(
            [
              ['Payments', String(rows.length)],
              ['Largest', biggest ? eur(Math.abs(Number(biggest.amount))) : '—'],
              ['Average', outs.length ? eur(outs.reduce((a, p) => a + Math.abs(Number(p.amount)), 0) / outs.length) : '—'],
              ['Top merchant', top ? top[0] : '—'],
              ['Rent you fronted', eur0(cf.fronted)],
              ['Flatmates sent back', eur0(cf.back)],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-t border-rule py-1.5 text-[13px] first:border-t-0">
              <span className="text-ink-2">{k}</span>
              <b className="truncate text-right font-semibold">{v}</b>
            </div>
          ))}
          <p className="mt-2 border-t border-dashed border-rule pt-2 text-[12px] text-ink-3">
            Their transfers repay rent you paid for them, so they&apos;re left out of what came in.{' '}
            <Link to="/plan/people" className="font-semibold text-brand">
              See who&apos;s paid
            </Link>
          </p>
        </Panel>
      </div>
    </>
  );
}
