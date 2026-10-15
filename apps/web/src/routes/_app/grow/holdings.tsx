import {
  eur,
  pct,
  shortDate,
  useInstrumentMutations,
  useInvestments,
  usePriceSeries,
} from '@finally/api-client';
import { createInstrumentBody, createLotBody, SIGNALS_DISCLAIMER, type HoldingDto, type TaxRuleDto } from '@finally/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { DeemedDisposalChart } from '@/components/charts/deemed-disposal';
import { PriceChart, SparkArea } from '@/components/charts/charts';
import {
  Big,
  Disclaimer,
  ErrorNote,
  KeyValue,
  LoadingBlock,
  PageHeader,
  Panel,
  PanelTitle,
  Sub,
  Track,
} from '@/components/common';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GRID, SPAN } from '@/lib/grid';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/grow/holdings')({ component: InvestmentsPage });

const PALETTE = ['var(--brand)', 'var(--c-transport)', 'var(--c-fun)', 'var(--c-bills)', 'var(--c-shopping)', 'var(--c-subs)'];

const CLASS_LABEL: Record<string, string> = { ETF: 'ETF', SHARE: 'Share', CRYPTO: 'Crypto', METAL: 'Metal', CASH: 'Cash', PENSION: 'Pension' };
const REGIME_LABEL: Record<string, string> = { EXIT_TAX: 'exit tax', CGT: 'CGT', NONE: 'no tax regime' };

function signalNumbers(p: Record<string, unknown>): string {
  return Object.entries(p)
    .filter(([k, v]) => !['title', 'body', 'date', 'highDate'].includes(k) && (typeof v === 'number' || (typeof v === 'string' && /^-?\d/.test(v))))
    .slice(0, 3)
    .map(([k, v]) => `${k} ${typeof v === 'number' ? v : Number(v).toFixed(2)}`)
    .join(' · ');
}

function TaxRates({ rules, today }: { rules: TaxRuleDto[]; today: string }): ReactNode {
  const row = (regime: TaxRuleDto['regime']) => {
    const mine = rules.filter((r) => r.regime === regime).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    const current = mine.find((r) => r.effectiveFrom <= today && (r.effectiveTo === null || r.effectiveTo >= today));
    const next = mine.find((r) => r.effectiveFrom > today);
    return { current, next };
  };
  const rate = (r: TaxRuleDto): string => `${Math.round(Number(r.rate) * 100)}%`;
  const exit = row('EXIT_TAX');
  const cgt = row('CGT');
  const ia = row('INVESTMENT_ACCOUNT');
  const Line = ({ title, sub, value, note }: { title: string; sub: string; value: string; note: ReactNode }): ReactNode => (
    <tr className="border-t border-rule first:border-0">
      <td className="py-[9px] pr-3 align-top font-semibold">
        {title}
        <br />
        <span className="text-[12px] font-normal text-ink-3">{sub}</span>
      </td>
      <td className="whitespace-nowrap py-[9px] pr-3 align-top font-display text-[18px] font-medium">{value}</td>
      <td className="py-[9px] align-top text-ink-2">{note}</td>
    </tr>
  );
  return (
    <table className="w-full border-collapse text-[13px]">
      <tbody>
        {exit.current ? (
          <Line
            title="ETFs and funds"
            sub="exit tax + deemed disposal"
            value={rate(exit.current)}
            note={exit.next ? `Changes to ${rate(exit.next)} on ${shortDate(exit.next.effectiveFrom)} ${exit.next.effectiveFrom.slice(0, 4)}` : 'No change scheduled'}
          />
        ) : null}
        {cgt.current ? (
          <Line
            title="Shares, gold, crypto"
            sub="capital gains tax"
            value={rate(cgt.current)}
            note={`Since ${shortDate(cgt.current.effectiveFrom)} ${cgt.current.effectiveFrom.slice(0, 4)}${cgt.current.annualExemption ? `; first ${eur(cgt.current.annualExemption).replace('.00', '')} of gains a year exempt` : ''}`}
          />
        ) : null}
        {ia.current ?? ia.next ? (
          <Line
            title="Investment Account"
            sub={`from ${shortDate((ia.current ?? ia.next)!.effectiveFrom)} ${(ia.current ?? ia.next)!.effectiveFrom.slice(0, 4)}`}
            value={rate((ia.current ?? ia.next)!)}
            note={`A year on value above ${eur((ia.current ?? ia.next)!.threshold ?? '0').replace('.00', '')}; ${eur((ia.current ?? ia.next)!.contributionCap ?? '0').replace('.00', '')} a year in; no deemed disposal`}
          />
        ) : null}
      </tbody>
    </table>
  );
}

type InstrumentIn = z.input<typeof createInstrumentBody>;
type LotIn = z.input<typeof createLotBody>;

function InstrumentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }): ReactNode {
  const { createInstrument } = useInstrumentMutations();
  const form = useForm<InstrumentIn, unknown, z.output<typeof createInstrumentBody>>({
    resolver: zodResolver(createInstrumentBody),
    defaultValues: { symbol: '', name: '', assetClass: 'ETF', taxRegime: 'EXIT_TAX', exchange: null, isin: null, currency: 'EUR' },
  });
  const errors = form.formState.errors;
  const submit = form.handleSubmit((v) =>
    createInstrument.mutate(v, {
      onSuccess: () => {
        toast.success(`${v.symbol} added`);
        form.reset();
        onOpenChange(false);
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not add the instrument'),
    }),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>New instrument</DialogTitle>
          <DialogDescription>Add something you hold, then record the lots you bought.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="i-sym">Symbol</Label>
              <Input id="i-sym" placeholder="VWCE" {...form.register('symbol')} aria-invalid={!!errors.symbol} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="i-ex">Exchange</Label>
              <Input id="i-ex" placeholder="Xetra" {...form.register('exchange', { setValueAs: (v: string) => (v ? v : null) })} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="i-name">Name</Label>
            <Input id="i-name" {...form.register('name')} aria-invalid={!!errors.name} />
            {errors.name ? <p className="text-[12.5px] text-bad">Enter a name</p> : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Type</Label>
              <Select value={form.watch('assetClass')} onValueChange={(v) => form.setValue('assetClass', v as InstrumentIn['assetClass'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(CLASS_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Tax regime</Label>
              <Select value={form.watch('taxRegime')} onValueChange={(v) => form.setValue('taxRegime', v as InstrumentIn['taxRegime'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(REGIME_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <Button type="submit" disabled={createInstrument.isPending}>{createInstrument.isPending ? 'Saving…' : 'Add instrument'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LotDialog({
  open,
  onOpenChange,
  holdings,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  holdings: HoldingDto[];
}): ReactNode {
  const { createLot } = useInstrumentMutations();
  const form = useForm<LotIn, unknown, z.output<typeof createLotBody>>({
    resolver: zodResolver(createLotBody),
    defaultValues: { instrumentId: holdings[0]?.instrument.id ?? '', acquiredAt: '', quantity: '', unitCost: '', fees: '0.00', wrapper: 'BROKER' },
  });
  const errors = form.formState.errors;
  const submit = form.handleSubmit((v) =>
    createLot.mutate(v, {
      onSuccess: () => {
        toast.success('Lot added');
        form.reset();
        onOpenChange(false);
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not add the lot'),
    }),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Add a purchase</DialogTitle>
          <DialogDescription>Each purchase is a lot, so cost basis and deemed-disposal dates stay exact.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3" noValidate>
          <div className="grid gap-1.5">
            <Label>Instrument</Label>
            <Select value={form.watch('instrumentId')} onValueChange={(v) => form.setValue('instrumentId', v)}>
              <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>{holdings.map((h) => <SelectItem key={h.instrument.id} value={h.instrument.id}>{h.instrument.symbol}</SelectItem>)}</SelectContent>
            </Select>
            {errors.instrumentId ? <p className="text-[12.5px] text-bad">Choose an instrument</p> : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5"><Label htmlFor="l-date">Bought on</Label><Input id="l-date" type="date" {...form.register('acquiredAt')} aria-invalid={!!errors.acquiredAt} /></div>
            <div className="grid gap-1.5"><Label htmlFor="l-qty">Quantity</Label><Input id="l-qty" inputMode="decimal" {...form.register('quantity')} aria-invalid={!!errors.quantity} /></div>
            <div className="grid gap-1.5"><Label htmlFor="l-cost">Price per unit (€)</Label><Input id="l-cost" inputMode="decimal" {...form.register('unitCost')} aria-invalid={!!errors.unitCost} /></div>
            <div className="grid gap-1.5"><Label htmlFor="l-fees">Fees (€)</Label><Input id="l-fees" inputMode="decimal" {...form.register('fees')} /></div>
          </div>
          <Button type="submit" disabled={createLot.isPending}>{createLot.isPending ? 'Saving…' : 'Add purchase'}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InvestmentsPage() {
  const inv = useInvestments();
  const [selected, setSelected] = useState<string | null>(null);
  const [instrumentOpen, setInstrumentOpen] = useState(false);
  const [lotOpen, setLotOpen] = useState(false);

  const holdings = inv.data?.holdings ?? [];
  const symbolId = selected ?? holdings[0]?.instrument.id;
  const series = usePriceSeries(symbolId, 180);
  const selectedHolding = holdings.find((h) => h.instrument.id === symbolId);
  const today = inv.data?.asOf.slice(0, 10) ?? '';
  const sparkValues = useMemo(() => inv.data?.series.map((p) => Number(p.value)) ?? [], [inv.data]);

  if (inv.error) return <ErrorNote error={inv.error} retry={() => void inv.refetch()} />;
  if (!inv.data) {
    return (
      <>
        <PageHeader title="Investments" />
        <div className={GRID}>
          <LoadingBlock className={cn('h-56', SPAN[4])} />
          <LoadingBlock className={cn('h-56', SPAN[8])} />
        </div>
      </>
    );
  }
  const d = inv.data;
  const lastPriceDate = holdings.map((h) => h.priceDate).filter(Boolean).sort().at(-1);
  const gain = Number(d.gain);

  return (
    <>
      <PageHeader
        eyebrow={`Prices delayed${lastPriceDate ? ` · daily close ${shortDate(lastPriceDate)}` : ''}`}
        title="Investments"
        right={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setInstrumentOpen(true)}><Plus className="size-4" aria-hidden="true" />Instrument</Button>
            <Button onClick={() => setLotOpen(true)} disabled={holdings.length === 0}><Plus className="size-4" aria-hidden="true" />Purchase</Button>
          </div>
        }
      />
      <div className={GRID}>
        <Panel className={SPAN[4]}>
          <PanelTitle>Portfolio value</PanelTitle>
          <Big>{eur(d.total)}</Big>
          <Sub>
            <span className={gain >= 0 ? 'font-semibold text-good' : 'font-semibold text-bad'}>
              {eur(d.gain, { signed: true })} ({pct(d.gainPct)})
            </span>{' '}
            on {eur(d.cost)} invested
          </Sub>
          <div className="mt-3"><SparkArea values={sparkValues} label="Portfolio value, last 52 weeks" /></div>
          <div className="mt-3">
            <KeyValue items={holdings.map((h) => [h.instrument.symbol, eur(h.value)])} />
          </div>
        </Panel>

        <Panel className={SPAN[8]}>
          <PanelTitle>
            <span>{selectedHolding?.instrument.symbol ?? 'Price'} · last 6 months</span>
            <span className="flex items-center gap-2 text-[12px] font-normal normal-case tracking-normal text-ink-2">
              {holdings.length > 1 ? (
                <Select value={symbolId} onValueChange={setSelected}>
                  <SelectTrigger size="sm" aria-label="Instrument" className="h-7 w-[110px] text-[12px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{holdings.map((h) => <SelectItem key={h.instrument.id} value={h.instrument.id}>{h.instrument.symbol}</SelectItem>)}</SelectContent>
                </Select>
              ) : null}
              <span>price · - - 50-day average</span>
            </span>
          </PanelTitle>
          {series.data ? (
            <PriceChart bars={series.data.bars} sma50={series.data.sma50} symbol={series.data.instrument.symbol} />
          ) : (
            <LoadingBlock className="h-[220px]" />
          )}
        </Panel>

        <Panel flush className={SPAN[12]}>
          <div className="overflow-x-auto px-2">
            <table className="w-full border-collapse text-[13.5px]">
              <thead>
                <tr className="border-b border-rule text-left text-[11px] uppercase tracking-[0.07em] text-ink-3">
                  <th className="px-2.5 pb-2 pt-3 font-semibold">Holding</th>
                  <th className="px-2.5 pb-2 pt-3 font-semibold">Type</th>
                  {['Quantity', 'Avg cost', 'Price', 'Value', 'Gain'].map((h) => <th key={h} className="px-2.5 pb-2 pt-3 text-right font-semibold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => (
                  <tr key={h.instrument.id} className="border-b border-rule last:border-0">
                    <td className="px-2.5 py-2.5">
                      <div className="font-semibold">{h.instrument.symbol}</div>
                      <div className="mono-raw">{h.instrument.name}{h.instrument.exchange ? ` · ${h.instrument.exchange}` : ''}</div>
                    </td>
                    <td className="px-2.5 py-2.5 text-ink-3">{CLASS_LABEL[h.instrument.assetClass]} · {REGIME_LABEL[h.instrument.taxRegime]}</td>
                    <td className="num px-2.5 py-2.5 text-right font-medium">{Number(h.quantity)}</td>
                    <td className="num px-2.5 py-2.5 text-right font-medium">{eur(h.avgCost)}</td>
                    <td className="num px-2.5 py-2.5 text-right font-medium">{eur(h.price)}</td>
                    <td className="num px-2.5 py-2.5 text-right font-semibold">{eur(h.value)}</td>
                    <td className={cn('num px-2.5 py-2.5 text-right font-semibold', Number(h.gain) >= 0 ? 'text-good' : 'text-bad')}>
                      {eur(h.gain, { signed: true })} <span className="font-medium text-ink-3">{pct(h.gainPct)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel className={SPAN[5]}>
          <PanelTitle>Allocation vs target</PanelTitle>
          <div className="grid gap-3.5">
            {d.allocation.map((a, i) => (
              <div key={a.key} className="grid gap-1.5">
                <div className="flex justify-between text-[13px]">
                  <b className="font-semibold">{a.key}</b>
                  <span className="num">
                    {pct(a.actual)} · target {a.target}%{' '}
                    <span className={Math.abs(a.drift) > 5 ? 'font-semibold text-bad' : 'text-ink-3'}>
                      {a.drift > 0 ? '+' : ''}{a.drift.toFixed(1)} pts
                    </span>
                  </span>
                </div>
                <Track value={a.actual} tick={a.target} color={PALETTE[i % PALETTE.length]} />
              </div>
            ))}
          </div>
          <Disclaimer>The tick on each bar is your target allocation, set in Settings.</Disclaimer>
        </Panel>

        <Panel className={SPAN[7]}>
          <PanelTitle>Signals</PanelTitle>
          {d.signals.length === 0 ? (
            <p className="text-[13px] text-ink-2">No signals right now.</p>
          ) : (
            <div className="grid">
              {d.signals.slice(0, 8).map((s) => (
                <div key={s.id} className="grid grid-cols-[64px_1fr] gap-x-3 gap-y-1 border-t border-rule py-3 first:border-0 first:pt-0">
                  <span className="font-mono text-[12px] font-medium">{s.symbol ?? 'DCA'}</span>
                  <div>
                    <h4 className="text-[14px] font-semibold">{s.title}</h4>
                    <p className="mt-0.5 text-[12.5px] text-ink-2">{s.body}</p>
                    <div className="mono-raw mt-0.5">rule {s.rule}{signalNumbers(s.payload) ? ` · ${signalNumbers(s.payload)}` : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Disclaimer>{SIGNALS_DISCLAIMER} Finally never places trades.</Disclaimer>
        </Panel>

        <Panel className={SPAN[7]}>
          <PanelTitle>Deemed disposal dates · ETF lots</PanelTitle>
          <DeemedDisposalChart lots={d.deemedDisposals} today={today} />
          <Disclaimer>
            Estimated at today's price and the exit tax rate in force on each date. Each lot is taxed on its 8-year anniversary even if you don't sell. Tax figures are estimates.
          </Disclaimer>
        </Panel>

        <Panel className={SPAN[5]}>
          <PanelTitle>Irish tax rates in force</PanelTitle>
          <TaxRates rules={d.taxRulesInForce} today={today} />
        </Panel>
      </div>
      <InstrumentDialog open={instrumentOpen} onOpenChange={setInstrumentOpen} />
      <LotDialog key={lotOpen ? 'open' : 'closed'} open={lotOpen} onOpenChange={setLotOpen} holdings={holdings} />
    </>
  );
}

