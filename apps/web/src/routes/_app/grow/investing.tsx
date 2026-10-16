import {
  eur,
  eur0,
  useInvestingPlan,
  usePaper,
  usePaperTrade,
  useTaxMutations,
  useUpdateInvesting,
  useVault,
  useVaultMutations,
} from '@finally/api-client';
import type { InvestingPlanDto, PaperDto } from '@finally/contracts';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Big, ErrorNote, LoadingBlock, PageHeader, Panel, PanelTitle, Sub, Track } from '@/components/common';
import { AmountField, Callout, Chip, Key, Line } from '@/components/kit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { GRID, SPAN } from '@/lib/grid';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/grow/investing')({ component: InvestingPage });

const MIX: Record<string, { name: string; colour: string; say: string }> = {
  world: { name: 'World stocks', colour: '--brand', say: 'world' },
  sp: { name: 'S&P 500', colour: '--c-transport', say: 'S&P 500' },
  em: { name: 'Emerging markets', colour: '--c-groceries', say: 'emerging markets' },
  gold: { name: 'Gold', colour: '--c-fun', say: 'gold' },
  cash: { name: 'Cash', colour: '--ink-3', say: 'cash' },
};

function Readiness({ d }: { d: InvestingPlanDto }): ReactNode {
  const tax = useTaxMutations();
  const update = useUpdateInvesting();
  const start = d.prefs.startAnyway;
  return (
    <Panel className={SPAN[6]}>
      <PanelTitle>
        <span>Before you invest</span>
        <span className={cn('text-[12.5px] normal-case tracking-normal', d.readyCount === 5 ? 'text-good' : 'text-warn')}>{d.readyCount} of 5</span>
      </PanelTitle>
      <div className="grid gap-0">
        {d.readiness.map((r) => (
          <div key={r.id} className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 border-t border-rule py-2.5 first:border-t-0 first:pt-0">
            <span className={cn('grid size-5 place-items-center rounded-full border text-[11px] font-bold', r.ok ? 'border-brand bg-fill text-on-fill' : r.partial ? 'border-ink-3 text-ink-3' : 'border-rule')}>{r.ok ? '✓' : r.partial ? '…' : ''}</span>
            <span className="text-[13.5px]">
              {r.title}
              <small className="block text-[12px] text-ink-3">{r.sub}</small>
            </span>
            {r.checkable ? (
              <Button size="sm" variant="outline" onClick={() => tax.setCheck.mutate({ itemId: 'mff', state: r.ok ? 'TODO' : 'DONE' })}>{r.ok ? 'Undo' : 'Mark checked'}</Button>
            ) : <span />}
          </div>
        ))}
      </div>
      <label className="mt-3 flex items-center justify-between gap-3 border-t border-rule pt-3 text-[13.5px]">
        <span>
          <b>Start anyway</b>
          <small className="block text-[12px] text-ink-3">Your call. Finally just shows the trade-off.</small>
        </span>
        <Switch checked={start} onCheckedChange={(v) => update.mutate({ startAnyway: v })} aria-label="Start anyway" />
      </label>
      {start && d.readyCount < 5 ? <Callout tone="warn" className="mt-3">Investing before the rainy-day pot reaches 3 months means a surprise bill could force you to sell during a dip.</Callout> : null}
      <p className="mt-3 text-[12px] text-ink-3">These are the first rungs of your money ladder. <Link to="/plan/pots" className="font-semibold text-brand">See the ladder</Link></p>
    </Panel>
  );
}

function Countdown({ d }: { d: InvestingPlanDto }): ReactNode {
  const ia = d.investAccount;
  const total = Number(ia.potAtOpen) + Number(ia.bonusAllocation);
  return (
    <Panel className={SPAN[6]}>
      <PanelTitle>Investment Account countdown</PanelTitle>
      <Big>{ia.daysToOpen}<small className="ml-1 text-[14px] font-medium text-ink-3">days to 1 July 2027</small></Big>
      <Sub>No tax on the first €50,000 of value, then 1% a year above it. No CGT, exit tax or deemed disposal inside. Up to €12,000 in each year.</Sub>
      <div className="mt-3">
        <Line label={`Investing pot by then at ${eur0(d.monthlyInvest)} a month`} value={eur0(ia.potAtOpen)} />
        <Line label="Plus the bonus allocation" value={eur0(ia.bonusAllocation)} />
        <Line label="Ready to move in on day one" value={`${eur0(total)} of ${eur0(ia.cap)}`} strong />
      </div>
      <Track value={Math.min(100, (total / Number(ia.cap)) * 100)} color="var(--c-transport)" height={10} className="mt-3" />
    </Panel>
  );
}

function Rules({ d }: { d: InvestingPlanDto }): ReactNode {
  const update = useUpdateInvesting();
  const mix = d.prefs.mix;
  const total = Object.values(mix).reduce((a, v) => a + v, 0) || 1;
  const rules = d.prefs.rules;
  return (
    <Panel className={SPAN[6]}>
      <PanelTitle>
        <span>Your investing rules</span>
        {d.prefs.rulesSaved ? <Chip tone="ok" className="normal-case tracking-normal">Saved</Chip> : null}
      </PanelTitle>
      <div className="grid gap-3.5">
        {Object.keys(MIX).map((k) => (
          <AmountField key={k} label={MIX[k]!.name} colour={MIX[k]!.colour} value={mix[k] ?? 0} prefix="" suffix="%" max={100} step={5} onCommit={(v) => update.mutate({ mix: { [k]: v }, rulesSaved: false })} sub={`${Math.round(((mix[k] ?? 0) / total) * 100)}% of the mix`} />
        ))}
      </div>
      <div className="mt-3 grid gap-0">
        {([['wait', 'Wait 7 days before selling after a 10% drop'], ['single', 'No single company above 10% of the portfolio'], ['lev', 'No leverage, options or crypto bets']] as const).map(([k, l]) => (
          <label key={k} className="flex items-center justify-between gap-3 border-t border-rule py-2 text-[13.5px] first:border-t-0">
            {l}
            <Switch checked={rules[k]} onCheckedChange={(v) => update.mutate({ rules: { [k]: v }, rulesSaved: false })} aria-label={l} />
          </label>
        ))}
      </div>
      <Callout className="mt-3">
        Each payday I invest {eur0(d.monthlyInvest)}: {Object.entries(mix).filter(([, v]) => v > 0).map(([k, v]) => `${Math.round((v / total) * 100)}% ${MIX[k]?.say ?? k}`).join(', ')}. I rebalance with new money when anything drifts 5 points from target.
      </Callout>
      <Button className="mt-3" onClick={() => update.mutate({ rulesSaved: true }, { onSuccess: () => toast.success('Rules saved') })}>{d.prefs.rulesSaved ? 'Update my rules' : 'Save my rules'}</Button>
    </Panel>
  );
}

function Drift({ d }: { d: InvestingPlanDto }): ReactNode {
  return (
    <Panel className={SPAN[6]}>
      <PanelTitle>
        <span>Mix vs target</span>
        <span className="text-[12px] normal-case tracking-normal text-ink-3">{d.hasPositions ? 'practice portfolio' : 'once you invest'}</span>
      </PanelTitle>
      {d.hasPositions ? (
        <>
          {d.drift.map((x) => (
            <div key={x.key} className="grid grid-cols-[130px_minmax(0,1fr)_72px] items-center gap-3 py-1.5 text-[13px]">
              <span className="flex items-center gap-2"><i className="size-2.5 rounded-[2px]" style={{ background: `var(${MIX[x.key]?.colour ?? '--ink-3'})` }} />{x.label}</span>
              <span className="relative h-2.5 rounded-full bg-raised">
                <i className="absolute inset-y-0 left-0 rounded-control" style={{ width: `${Math.min(100, x.actual)}%`, background: `var(${MIX[x.key]?.colour ?? '--ink-3'})` }} />
                <b className="absolute -bottom-[3px] -top-[3px] w-0.5 bg-ink opacity-70" style={{ left: `${x.target}%` }} />
              </span>
              <span className={cn('num text-right', Math.abs(x.diff) >= 5 ? 'font-semibold text-warn' : 'text-ink-3')}>{x.diff >= 0 ? '+' : '−'}{Math.abs(x.diff).toFixed(0)} pts</span>
            </div>
          ))}
          {d.nextGoesTo ? <Callout className="mt-3">Next {eur0(d.monthlyInvest)} goes to <b>{d.nextGoesTo}</b>, the furthest below target. No selling needed.</Callout> : null}
        </>
      ) : (
        <p className="text-[13px] text-ink-2">Once money is invested, this shows how far each part has drifted from your target, and where the next payday&apos;s money should go. Buy something in the practice account below to see it work.</p>
      )}
      <p className="mt-3 text-[12px] text-ink-3">This is the only signal your monthly plan uses. Price signals stay in the practice account.</p>
    </Panel>
  );
}

function Wrapper({ d }: { d: InvestingPlanDto }): ReactNode {
  const update = useUpdateInvesting();
  const w = d.prefs.wrapper;
  const set = (patch: Partial<typeof w>): void => update.mutate({ wrapper: patch });
  const sims = [
    { name: 'Investment Account', value: Number(d.wrapper.ia), colour: '--brand', note: d.wrapper.capped ? "Only €12,000 a year fits; the rest isn't invested in this comparison." : '1% a year on value above €50,000. Opens 1 July 2027.' },
    { name: 'Shares or gold, directly', value: Number(d.wrapper.shares), colour: '--c-transport', note: '31% CGT on gains above €1,270, when you sell. No fund fee.' },
    { name: 'ETF in a broker account', value: Number(d.wrapper.etf), colour: '--c-fun', note: '35% exit tax every 8 years per purchase and on sale. S&P 500 UCITS ETFs fall here.' },
  ];
  const best = Math.max(...sims.map((s) => s.value));
  return (
    <Panel className={SPAN[7]}>
      <PanelTitle>Where should {eur0(w.monthly)} a month go?</PanelTitle>
      <div className="grid gap-5 md:grid-cols-[0.9fr_1.1fr]">
        <div className="grid content-start gap-3.5">
          <AmountField label="Each month" value={w.monthly} min={50} max={1500} step={50} onCommit={(v) => set({ monthly: v })} />
          <AmountField label="Years" value={w.years} min={3} max={30} step={1} prefix="" onCommit={(v) => set({ years: v })} />
          <AmountField label="Yearly return" value={w.returnPct} min={2} max={10} step={0.5} prefix="" suffix="%" decimals={1} onCommit={(v) => set({ returnPct: v })} />
          <AmountField label="Fund fee (TER)" value={w.terPct} min={0.05} max={1} step={0.01} prefix="" suffix="%" decimals={2} onCommit={(v) => set({ terPct: v })} />
          <AmountField label="Currency conversion" value={w.fxPct} min={0} max={1} step={0.05} prefix="" suffix="%" decimals={2} onCommit={(v) => set({ fxPct: v })} />
        </div>
        <div className="grid content-start gap-3.5">
          <div className="text-[12.5px] text-ink-3">You put in {eur0(d.wrapper.paid)} · worth {eur0(d.wrapper.pre)} before fees and tax</div>
          {sims.map((s) => (
            <div key={s.name}>
              <div className="flex items-baseline justify-between"><b>{s.name}</b><b className="num">{eur0(s.value)}</b></div>
              <div className="my-1.5 h-2.5 overflow-hidden rounded-full bg-raised"><i className="block h-full rounded-full" style={{ width: `${(s.value / best) * 100}%`, background: `var(${s.colour})` }} /></div>
              <div className="text-[12px] text-ink-3">{s.note}</div>
            </div>
          ))}
          <Line label={`Fees and conversion cost over ${w.years} years`} value={eur0(d.wrapper.fees)} strong tone="warn" />
          <p className="text-[12px] text-ink-3">Euro-priced ETFs on Xetra or Euronext avoid conversion. A rough comparison of wrappers, not tax advice.</p>
        </div>
      </div>
    </Panel>
  );
}

function Vault(): ReactNode {
  const { data } = useVault();
  const { add, remove } = useVaultMutations();
  const [product, setProduct] = useState('coin');
  const [qty, setQty] = useState('1');
  if (!data) return null;
  const gain = Number(data.buybackTotal) - Number(data.paidTotal);
  return (
    <Panel className={SPAN[5]}>
      <PanelTitle>Gold &amp; silver vault</PanelTitle>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); const n = Math.floor(Number(qty)); if (n >= 1) add.mutate({ product, qty: n }, { onSuccess: () => toast.success('Added to your vault') }); }}>
        <div className="grid min-w-[150px] flex-1 gap-1"><label className="text-[12px] text-ink-3" htmlFor="vf-prod">Product</label>
          <Select value={product} onValueChange={setProduct}><SelectTrigger id="vf-prod"><SelectValue /></SelectTrigger><SelectContent>{data.products.map((p) => <SelectItem key={p.key} value={p.key}>{p.name}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="grid gap-1"><label className="text-[12px] text-ink-3" htmlFor="vf-qty">Qty</label><Input id="vf-qty" type="number" min={1} step={1} value={qty} onChange={(e) => setQty(e.target.value)} className="w-[70px]" /></div>
        <Button type="submit" disabled={add.isPending}>Add</Button>
      </form>
      {data.items.length ? (
        <div className="mt-3">
          {data.items.map((v) => (
            <div key={v.index} className="flex items-start justify-between gap-3 border-t border-rule py-2 first:border-t-0">
              <span><b>{v.qty} × {v.name}</b><small className="block text-[12px] text-ink-3">Paid {eur(v.paid)}, {v.premiumPct.toFixed(v.premiumPct % 1 ? 1 : 0)}% over spot</small></span>
              <span className="text-right"><b className="num">{eur(v.buyback)}</b><small className="block text-[12px] text-ink-3">buy-back · spot {eur(v.spot)} <button type="button" className="ml-1 underline" onClick={() => remove.mutate(v.index)}>remove</button></small></span>
            </div>
          ))}
          <Line label="Gain if sold to a dealer today" value={eur(gain, { signed: true })} strong tone={gain >= 0 ? 'good' : 'warn'} />
        </div>
      ) : <p className="mt-3 text-[13px] text-ink-2">No metal yet. Add a product to see its value at the dealer&apos;s buy-back price, which is what you&apos;d actually get, not spot.</p>}
      <p className="mt-3 text-[12px] text-ink-3">Sample spot: gold {eur(data.goldSpot)}/oz, silver {eur(data.silverSpot)}/oz. Buy-back modelled at spot −2%. Gains are taxed at 31% CGT above €1,270 a year.</p>
    </Panel>
  );
}

function Practice({ p }: { p: PaperDto }): ReactNode {
  const trade = usePaperTrade();
  const [symbol, setSymbol] = useState('VWCE');
  const [amount, setAmount] = useState('500');
  const run = (body: Parameters<typeof trade.mutate>[0]): void => trade.mutate(body, { onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not do that') });
  const holdings = p.holdings.reduce((a, h) => a + Number(h.value), 0);
  const delta = Number(p.total) - Number(p.start);
  return (
    <Panel className={SPAN[7]}>
      <PanelTitle>Practise with fake money · month {p.step}</PanelTitle>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); run({ action: 'buy', symbol, amount: Number(amount).toFixed(2) }); }}>
        <div className="grid gap-1"><label className="text-[12px] text-ink-3" htmlFor="pp-sym">Buy</label>
          <Select value={symbol} onValueChange={setSymbol}><SelectTrigger id="pp-sym" className="w-[110px]"><SelectValue /></SelectTrigger><SelectContent>{p.instruments.map((i) => <SelectItem key={i.symbol} value={i.symbol}>{i.symbol}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="grid gap-1"><label className="text-[12px] text-ink-3" htmlFor="pp-amt">Amount (€)</label><Input id="pp-amt" type="number" min={10} step={10} value={amount} onChange={(e) => setAmount(e.target.value)} className="w-[110px]" /></div>
        <Button type="submit" disabled={trade.isPending}>Buy</Button>
        <Button type="button" variant="outline" disabled={trade.isPending} onClick={() => run({ action: 'advance' })}>Skip a month</Button>
      </form>
      <div className="mt-3">
        <Line label="Cash" value={eur(p.cash)} />
        <Line label="Holdings" value={eur(holdings.toFixed(2))} />
        <Line label={`Total vs the ${eur0(p.start)} you started with`} value={`${eur(p.total)} (${eur(delta, { signed: true })})`} strong tone={delta >= 0 ? 'good' : 'warn'} />
      </div>
      {p.holdings.length ? (
        <div className="mt-2">
          {p.holdings.map((h) => (
            <div key={h.symbol} className="flex flex-wrap items-center justify-between gap-2 border-t border-rule py-2 text-[13px] first:border-t-0">
              <b>{h.symbol}</b>
              <span className="num">{eur(h.value)}</span>
              <span className={cn('num', Number(h.gain) >= 0 ? 'text-good' : 'text-warn')}>{eur(h.gain, { signed: true })} ({h.gainPct.toFixed(1)}%)</span>
              <Button size="sm" variant="outline" disabled={trade.isPending} onClick={() => run({ action: 'sell', symbol: h.symbol })}>Sell</Button>
            </div>
          ))}
        </div>
      ) : null}
      {p.guard ? (
        <Callout tone="act" className="mt-3">
          <b>Your rule:</b> wait 7 days before selling after a 10% drop. {p.guard.symbol} is down {p.guard.downPct.toFixed(1)}%.
          <div className="mt-2 flex gap-2"><Button size="sm" variant="outline" onClick={() => run({ action: 'guard-keep' })}>Keep it</Button><Button size="sm" variant="destructive" onClick={() => run({ action: 'guard-sell' })}>Sell anyway</Button></div>
        </Callout>
      ) : null}
      <div className="mt-4 text-[11.5px] font-semibold uppercase tracking-[0.07em] text-ink-3">Practice signals <span className="font-medium normal-case tracking-normal">· sample delayed prices</span></div>
      <div className="mt-1.5 grid gap-0">
        {p.signals.map((s) => (
          <div key={s.symbol} className="flex flex-wrap items-center justify-between gap-2 border-t border-rule py-1.5 text-[13px] first:border-t-0">
            <b>{s.symbol}</b>
            <span className="num">{eur(s.price)} <span className={s.changePct >= 0 ? 'text-good' : 'text-warn'}>{s.changePct >= 0 ? '+' : ''}{s.changePct.toFixed(1)}%</span></span>
            <Chip tone={s.severity === 'watch' ? 'warn' : 'plain'}>{s.label}</Chip>
          </div>
        ))}
      </div>
      {p.log.length ? <p className="mt-3 text-[12px] text-ink-3">{p.log.slice(0, 4).map((l, i) => <span key={i} className="block">{l}</span>)}</p> : <p className="mt-3 text-[12px] text-ink-3">Buy something, then skip ahead a few months to see how a fall feels before it&apos;s real money.</p>}
    </Panel>
  );
}

function InvestingPage() {
  const { data, error, refetch } = useInvestingPlan();
  const paper = usePaper();
  if (error) return <ErrorNote error={error} retry={() => void refetch()} />;
  if (!data) return <LoadingBlock className="h-96" />;
  return (
    <>
      <PageHeader eyebrow="Not invested yet · start when you're ready" title="Investing" lead="Get the foundations in place, write your own rules, practise with fake money, then invest monthly through the best wrapper." />
      <div className={GRID}>
        <Readiness d={data} />
        <Countdown d={data} />
        <Rules d={data} />
        <Drift d={data} />
        <Wrapper d={data} />
        <Vault />
        {paper.data ? <Practice p={paper.data} /> : null}
        <Panel className={SPAN[5]}>
          <PanelTitle>Tax calendar for investors</PanelTitle>
          <Line label="CGT exemption used in 2026" value="€0 of €1,270" />
          <Line label="Pay CGT on Jan–Nov sales by" value="15 Dec" />
          <Line label="Pay CGT on December sales by" value="31 Jan" />
          <Line label="Exit tax on ETFs" value="38%, 35% from 1 Jan 2027" />
          <Line label="First deemed disposal" value="8 years after each buy" />
          <Line label="Selling at a loss" value="4-week rule on buying back" />
          <Line label="US company dividends" value="15% withheld with a W-8BEN" />
          <Key items={[]} />
        </Panel>
      </div>
    </>
  );
}
