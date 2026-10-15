import { eur, eur0, useApi, useEmergencyFund } from '@finally/api-client';
import { TAX_DISCLAIMER } from '@finally/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState, type ReactNode } from 'react';
import { GrowthChart } from '@/components/charts/charts';
import { Big, Disclaimer, KeyValue, PageHeader, Panel, PanelTitle, Sub, Track } from '@/components/common';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { GRID, SPAN } from '@/lib/grid';

export const Route = createFileRoute('/_app/grow/tools')({ component: ToolsPage });

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function Field({ label, value, children }: { label: string; value: ReactNode; children: ReactNode }): ReactNode {
  return (
    <div className="mb-3.5 grid gap-2">
      <Label className="flex justify-between text-[12.5px] font-semibold text-ink-2">
        {label}
        <output className="num text-ink">{value}</output>
      </Label>
      {children}
    </div>
  );
}

function Range({
  label,
  display,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  display: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
}): ReactNode {
  return (
    <Field label={label} value={display}>
      <Slider aria-label={label} min={min} max={max} step={step} value={value} onValueChange={onChange} />
    </Field>
  );
}

function NumberField({ label, value, onChange, suffix }: { label: string; value: string; onChange: (v: string) => void; suffix?: string }): ReactNode {
  const id = `f-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-[12.5px] font-semibold text-ink-2">{label}</Label>
      <div className="flex items-center gap-1.5">
        <Input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className="h-9" />
        {suffix ? <span className="text-[13px] text-ink-3">{suffix}</span> : null}
      </div>
    </div>
  );
}

const asMoney = (s: string): string => (/^\d{1,12}(\.\d{1,2})?$/.test(s.trim()) ? s.trim() : '0');
const asNumber = (s: string, fallback: number): number => (Number.isFinite(Number(s)) && s.trim() !== '' ? Number(s) : fallback);

/* ---------------------------------------------------------------- where */

function WhereCard(): ReactNode {
  const api = useApi();
  const [amount, setAmount] = useState(10000);
  const [years, setYears] = useState(15);
  const [ret, setRet] = useState(6);
  const input = useDebounced({ amount, years, ret });
  const q = useQuery({
    queryKey: ['tool', 'where', input],
    queryFn: () => api.whereShouldItGo({ amount: input.amount.toFixed(2), years: input.years, annualReturnPct: input.ret }),
    placeholderData: keepPreviousData,
  });
  const best = Math.max(...(q.data?.options.map((o) => Number(o.afterTaxValue)) ?? [1]));
  const colour: Record<string, string> = { INVESTMENT_ACCOUNT: 'var(--brand)', SHARES: 'var(--c-transport)', BROKER_ETF: 'var(--c-fun)' };
  return (
    <Panel className={SPAN[8]}>
      <PanelTitle>Where should {eur0(amount)} go?</PanelTitle>
      <div className="grid gap-6 md:grid-cols-[260px_minmax(0,1fr)]">
        <div>
          <Range label="Amount" display={eur0(amount)} value={amount} min={500} max={50000} step={500} onChange={setAmount} />
          <Range label="Years" display={String(years)} value={years} min={3} max={30} step={1} onChange={setYears} />
          <Range label="Yearly return" display={`${ret.toFixed(1)}%`} value={ret} min={2} max={10} step={0.5} onChange={setRet} />
          <p className="text-[12px] text-ink-3">Same investment, three tax wrappers. Dividends, fees and currency moves are ignored.</p>
        </div>
        <div className="grid content-start gap-3.5" aria-live="polite">
          {q.data?.options.map((o) => (
            <div key={o.key} className="grid gap-1.5">
              <div className="flex flex-wrap justify-between gap-2.5 text-[13.5px]">
                <b className="font-semibold">
                  {o.label}
                  {o.key === q.data.best ? <span className="ml-2 rounded-[4px] bg-brand-soft px-1.5 py-px text-[11px] font-bold text-brand">Best after tax</span> : null}
                </b>
                <span className="num font-bold">{eur0(o.afterTaxValue)}</span>
              </div>
              <Track value={(Number(o.afterTaxValue) / best) * 100} color={colour[o.key]} height={14} />
              <div className="text-[12px] text-ink-3">
                Tax and charges about {eur0(o.taxEstimate)}. {o.notes.join(' ')}
              </div>
            </div>
          ))}
          <Disclaimer>{TAX_DISCLAIMER} Rates come from the tax table in force on each date.</Disclaimer>
        </div>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------- compound */

function CompoundCard(): ReactNode {
  const api = useApi();
  const [initial, setInitial] = useState('5000');
  const [monthly, setMonthly] = useState('300');
  const [ret, setRet] = useState(6);
  const [years, setYears] = useState(20);
  const input = useDebounced({ initial, monthly, ret, years });
  const q = useQuery({
    queryKey: ['tool', 'compound', input],
    queryFn: () => api.compound({ initial: asMoney(input.initial), monthly: asMoney(input.monthly), annualReturnPct: input.ret, years: input.years }),
    placeholderData: keepPreviousData,
  });
  return (
    <Panel className={SPAN[6]}>
      <PanelTitle>Compound growth</PanelTitle>
      <div className="mb-3 grid grid-cols-2 gap-3">
        <NumberField label="Start with (€)" value={initial} onChange={setInitial} />
        <NumberField label="Add each month (€)" value={monthly} onChange={setMonthly} />
      </div>
      <Range label="Yearly return" display={`${ret.toFixed(1)}%`} value={ret} min={0} max={12} step={0.5} onChange={setRet} />
      <Range label="Years" display={String(years)} value={years} min={1} max={40} step={1} onChange={setYears} />
      {q.data ? (
        <>
          <Big>{eur0(q.data.finalValue)}</Big>
          <Sub>
            {eur0(q.data.contributed)} paid in, {eur0(q.data.growth)} growth.
          </Sub>
          <div className="mt-3"><GrowthChart series={q.data.series} /></div>
        </>
      ) : null}
    </Panel>
  );
}

/* -------------------------------------------------------- emergency fund */

function EmergencyCard(): ReactNode {
  const { data } = useEmergencyFund();
  if (!data) return <Panel className={SPAN[4]}><PanelTitle>Emergency fund</PanelTitle></Panel>;
  const target = Number(data.months3);
  const saved = Number(data.saved);
  return (
    <Panel className={SPAN[4]}>
      <PanelTitle>Emergency fund</PanelTitle>
      <Big>{eur(data.saved)}</Big>
      <Sub>
        of a {eur0(data.months3)} target: three months of your essentials (about {eur0(data.monthlyEssential)} a month, from your last {data.basedOnMonths} months).
      </Sub>
      <div className="mt-3.5 grid gap-3">
        <Track value={target > 0 ? (saved / target) * 100 : 0} />
        <KeyValue
          items={[
            ['Covers', `${data.coverageMonths.toFixed(1)} months`],
            ['Six-month target', eur0(data.months6)],
            ['Still to save for 3 months', eur0(Math.max(0, target - saved))],
          ]}
        />
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ FIRE */

function FireCard(): ReactNode {
  const api = useApi();
  const [spend, setSpend] = useState('26400');
  const [rate, setRate] = useState(4);
  const [portfolio, setPortfolio] = useState('9800');
  const [monthly, setMonthly] = useState('600');
  const input = useDebounced({ spend, rate, portfolio, monthly });
  const q = useQuery({
    queryKey: ['tool', 'fire', input],
    queryFn: () => api.fire({ annualSpend: asMoney(input.spend), withdrawalRatePct: input.rate, currentPortfolio: asMoney(input.portfolio), monthlyContribution: asMoney(input.monthly) }),
    placeholderData: keepPreviousData,
  });
  return (
    <Panel className={SPAN[4]}>
      <PanelTitle>FIRE number</PanelTitle>
      <div className="mb-3 grid grid-cols-2 gap-3">
        <NumberField label="Yearly spend (€)" value={spend} onChange={setSpend} />
        <NumberField label="Invested now (€)" value={portfolio} onChange={setPortfolio} />
      </div>
      <NumberField label="Invest each month (€)" value={monthly} onChange={setMonthly} />
      <div className="mt-3"><Range label="Withdrawal rate" display={`${rate.toFixed(1)}%`} value={rate} min={2} max={6} step={0.25} onChange={setRate} /></div>
      {q.data ? (
        <>
          <Big>{eur0(q.data.fireNumber)}</Big>
          <Sub>
            Yearly spend ÷ {rate}% withdrawal. You are {q.data.progressPct.toFixed(1)}% there
            {q.data.yearsToFire !== null ? `; about ${q.data.yearsToFire} years at this pace (5% a year).` : '.'}
          </Sub>
        </>
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------------ loan */

function LoanCard(): ReactNode {
  const api = useApi();
  const [principal, setPrincipal] = useState('300000');
  const [rate, setRate] = useState('3.6');
  const [term, setTerm] = useState(30);
  const [over, setOver] = useState('200');
  const input = useDebounced({ principal, rate, term, over });
  const q = useQuery({
    queryKey: ['tool', 'loan', input],
    queryFn: () => api.loan({ principal: asMoney(input.principal), annualRatePct: asNumber(input.rate, 0), termYears: input.term, monthlyOverpayment: asMoney(input.over) }),
    placeholderData: keepPreviousData,
  });
  return (
    <Panel className={SPAN[4]}>
      <PanelTitle>Mortgage overpayment</PanelTitle>
      <div className="mb-3 grid grid-cols-2 gap-3">
        <NumberField label="Loan (€)" value={principal} onChange={setPrincipal} />
        <NumberField label="Rate" value={rate} onChange={setRate} suffix="%" />
      </div>
      <NumberField label="Overpay each month (€)" value={over} onChange={setOver} />
      <div className="mt-3"><Range label="Term (years)" display={String(term)} value={term} min={5} max={40} step={1} onChange={setTerm} /></div>
      {q.data ? (
        <KeyValue
          items={[
            ['Monthly repayment', eur(q.data.monthlyPayment)],
            ['Total interest', eur0(q.data.totalInterest)],
            ['With the overpayment', `${eur(q.data.withOverpayment.monthlyPayment)} a month`],
            ['Interest saved', eur0(q.data.withOverpayment.interestSaved)],
            ['Paid off sooner by', `${Math.floor(q.data.withOverpayment.monthsSaved / 12)}y ${q.data.withOverpayment.monthsSaved % 12}m`],
          ]}
        />
      ) : null}
    </Panel>
  );
}

/* ------------------------------------------------------------- converter */

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'AUD', 'CAD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK'];

function ConverterCard(): ReactNode {
  const api = useApi();
  const [amount, setAmount] = useState('100');
  const [from, setFrom] = useState('EUR');
  const [to, setTo] = useState('USD');
  const input = useDebounced({ amount, from, to });
  const q = useQuery({
    queryKey: ['tool', 'convert', input],
    queryFn: () => api.convert(asMoney(input.amount), input.from, input.to),
    placeholderData: keepPreviousData,
  });
  return (
    <Panel className={SPAN[4]}>
      <PanelTitle>Currency converter</PanelTitle>
      <div className="grid grid-cols-[1fr_96px_96px] gap-2.5">
        <NumberField label="Amount" value={amount} onChange={setAmount} />
        {[['From', from, setFrom], ['To', to, setTo]].map(([label, value, set]) => (
          <div key={label as string} className="grid gap-1.5">
            <Label className="text-[12.5px] font-semibold text-ink-2">{label as string}</Label>
            <Select value={value as string} onValueChange={set as (v: string) => void}>
              <SelectTrigger className="h-9" aria-label={label as string}><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        ))}
      </div>
      {q.data ? (
        <div className="mt-3.5">
          <Big>{Number(q.data.converted).toLocaleString('en-IE', { style: 'currency', currency: q.data.to })}</Big>
          <Sub>
            1 {q.data.from} = {q.data.rate} {q.data.to}
            <br />
            <span className="text-ink-3">{q.data.source}, {q.data.asOf.slice(0, 10)}</span>
          </Sub>
        </div>
      ) : null}
    </Panel>
  );
}

function ToolsPage() {
  return (
    <>
      <PageHeader eyebrow="Calculators on your own numbers" title="Tools" lead="Every tax figure is an estimate." />
      <div className={GRID}>
        <WhereCard />
        <EmergencyCard />
        <CompoundCard />
        <FireCard />
        <LoanCard />
        <ConverterCard />
      </div>
    </>
  );
}
