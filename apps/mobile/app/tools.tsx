import { eur, eur0, useApi, useEmergencyFund } from '@finally/api-client';
import { TAX_DISCLAIMER } from '@finally/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { TextInput, View } from 'react-native';
import { StackScreen } from '@/components/stack-screen';
import { Card, Text, Track } from '@/components/ui/primitives';

const input = 'rounded-control border border-rule bg-surface px-3 py-2 font-body text-[14px] text-ink';

function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function Field({ label, value, onChange, keyboard = 'decimal-pad' }: { label: string; value: string; onChange: (v: string) => void; keyboard?: 'decimal-pad' | 'default' }): ReactNode {
  return (
    <View className="min-w-[44%] flex-1 gap-1">
      <Text variant="small">{label}</Text>
      <TextInput value={value} onChangeText={onChange} keyboardType={keyboard} className={input} accessibilityLabel={label} autoCapitalize="characters" />
    </View>
  );
}

const money = (s: string): string => (/^\d{1,12}(\.\d{1,2})?$/.test(s.trim()) ? s.trim() : '0');
const num = (s: string, d: number): number => (Number.isFinite(Number(s)) && s.trim() !== '' ? Number(s) : d);

function Where(): ReactNode {
  const api = useApi();
  const [amount, setAmount] = useState('10000');
  const [years, setYears] = useState('15');
  const [ret, setRet] = useState('6');
  const i = useDebounced({ amount, years, ret });
  const q = useQuery({
    queryKey: ['tool', 'where', i],
    queryFn: () => api.whereShouldItGo({ amount: money(i.amount), years: Math.min(40, Math.max(1, Math.round(num(i.years, 15)))), annualReturnPct: num(i.ret, 6) }),
    placeholderData: keepPreviousData,
  });
  const best = Math.max(...(q.data?.options.map((o) => Number(o.afterTaxValue)) ?? [1]));
  return (
    <Card className="gap-3">
      <Text variant="eyebrow">Where should it go?</Text>
      <View className="flex-row flex-wrap gap-2">
        <Field label="Amount (€)" value={amount} onChange={setAmount} />
        <Field label="Years" value={years} onChange={setYears} />
        <Field label="Return %" value={ret} onChange={setRet} />
      </View>
      {q.data?.options.map((o) => (
        <View key={o.key} className="gap-1">
          <View className="flex-row justify-between">
            <Text variant="semi">
              {o.label}
              {o.key === q.data.best ? ' · best' : ''}
            </Text>
            <Text variant="num">{eur0(o.afterTaxValue)}</Text>
          </View>
          <Track value={(Number(o.afterTaxValue) / best) * 100} height={10} />
          <Text variant="small">Tax and charges about {eur0(o.taxEstimate)}</Text>
        </View>
      ))}
      <Text variant="small" className="text-ink-3">
        {TAX_DISCLAIMER}
      </Text>
    </Card>
  );
}

function Compound(): ReactNode {
  const api = useApi();
  const [initial, setInitial] = useState('5000');
  const [monthly, setMonthly] = useState('300');
  const [ret, setRet] = useState('6');
  const [years, setYears] = useState('20');
  const i = useDebounced({ initial, monthly, ret, years });
  const q = useQuery({
    queryKey: ['tool', 'compound', i],
    queryFn: () => api.compound({ initial: money(i.initial), monthly: money(i.monthly), annualReturnPct: num(i.ret, 6), years: Math.min(60, Math.max(1, Math.round(num(i.years, 20)))) }),
    placeholderData: keepPreviousData,
  });
  return (
    <Card className="gap-3">
      <Text variant="eyebrow">Compound growth</Text>
      <View className="flex-row flex-wrap gap-2">
        <Field label="Start (€)" value={initial} onChange={setInitial} />
        <Field label="Monthly (€)" value={monthly} onChange={setMonthly} />
        <Field label="Return %" value={ret} onChange={setRet} />
        <Field label="Years" value={years} onChange={setYears} />
      </View>
      {q.data ? (
        <>
          <Text variant="big" className="text-[30px]">
            {eur0(q.data.finalValue)}
          </Text>
          <Text variant="small">
            {eur0(q.data.contributed)} paid in, {eur0(q.data.growth)} growth
          </Text>
        </>
      ) : null}
    </Card>
  );
}

function Emergency(): ReactNode {
  const { data } = useEmergencyFund();
  if (!data) return null;
  const target = Number(data.months3);
  return (
    <Card className="gap-2">
      <Text variant="eyebrow">Emergency fund</Text>
      <Text variant="big" className="text-[30px]">
        {eur(data.saved)}
      </Text>
      <Text variant="small">
        of {eur0(data.months3)}: three months of your essentials (about {eur0(data.monthlyEssential)} a month)
      </Text>
      <Track value={target > 0 ? (Number(data.saved) / target) * 100 : 0} height={10} />
      <Text variant="small">Covers {data.coverageMonths.toFixed(1)} months. Six months would be {eur0(data.months6)}.</Text>
    </Card>
  );
}

function Fire(): ReactNode {
  const api = useApi();
  const [spend, setSpend] = useState('26400');
  const [rate, setRate] = useState('4');
  const [now, setNow] = useState('9800');
  const [monthly, setMonthly] = useState('600');
  const i = useDebounced({ spend, rate, now, monthly });
  const q = useQuery({
    queryKey: ['tool', 'fire', i],
    queryFn: () => api.fire({ annualSpend: money(i.spend), withdrawalRatePct: Math.min(10, Math.max(1, num(i.rate, 4))), currentPortfolio: money(i.now), monthlyContribution: money(i.monthly) }),
    placeholderData: keepPreviousData,
  });
  return (
    <Card className="gap-3">
      <Text variant="eyebrow">FIRE number</Text>
      <View className="flex-row flex-wrap gap-2">
        <Field label="Yearly spend (€)" value={spend} onChange={setSpend} />
        <Field label="Withdrawal %" value={rate} onChange={setRate} />
        <Field label="Invested now (€)" value={now} onChange={setNow} />
        <Field label="Monthly (€)" value={monthly} onChange={setMonthly} />
      </View>
      {q.data ? (
        <>
          <Text variant="big" className="text-[30px]">
            {eur0(q.data.fireNumber)}
          </Text>
          <Text variant="small">
            You are {q.data.progressPct.toFixed(1)}% there{q.data.yearsToFire !== null ? `; about ${q.data.yearsToFire} years at this pace.` : '.'}
          </Text>
        </>
      ) : null}
    </Card>
  );
}

function Loan(): ReactNode {
  const api = useApi();
  const [principal, setPrincipal] = useState('300000');
  const [rate, setRate] = useState('3.6');
  const [term, setTerm] = useState('30');
  const [over, setOver] = useState('200');
  const i = useDebounced({ principal, rate, term, over });
  const q = useQuery({
    queryKey: ['tool', 'loan', i],
    queryFn: () => api.loan({ principal: money(i.principal), annualRatePct: num(i.rate, 3.6), termYears: Math.min(50, Math.max(1, num(i.term, 30))), monthlyOverpayment: money(i.over) }),
    placeholderData: keepPreviousData,
  });
  return (
    <Card className="gap-3">
      <Text variant="eyebrow">Mortgage overpayment</Text>
      <View className="flex-row flex-wrap gap-2">
        <Field label="Loan (€)" value={principal} onChange={setPrincipal} />
        <Field label="Rate %" value={rate} onChange={setRate} />
        <Field label="Term (years)" value={term} onChange={setTerm} />
        <Field label="Overpay (€/mo)" value={over} onChange={setOver} />
      </View>
      {q.data ? (
        <Text variant="muted">
          Repayment {eur(q.data.monthlyPayment)} a month. Overpaying saves {eur0(q.data.withOverpayment.interestSaved)} of interest and {Math.floor(q.data.withOverpayment.monthsSaved / 12)} years {q.data.withOverpayment.monthsSaved % 12} months.
        </Text>
      ) : null}
    </Card>
  );
}

function Convert(): ReactNode {
  const api = useApi();
  const [amount, setAmount] = useState('100');
  const [from, setFrom] = useState('EUR');
  const [to, setTo] = useState('USD');
  const i = useDebounced({ amount, from, to });
  const q = useQuery({
    queryKey: ['tool', 'convert', i],
    queryFn: () => api.convert(money(i.amount), i.from.trim().toUpperCase().slice(0, 3), i.to.trim().toUpperCase().slice(0, 3)),
    enabled: i.from.trim().length === 3 && i.to.trim().length === 3,
    placeholderData: keepPreviousData,
    retry: false,
  });
  return (
    <Card className="gap-3">
      <Text variant="eyebrow">Currency converter</Text>
      <View className="flex-row flex-wrap gap-2">
        <Field label="Amount" value={amount} onChange={setAmount} />
        <Field label="From" value={from} onChange={setFrom} keyboard="default" />
        <Field label="To" value={to} onChange={setTo} keyboard="default" />
      </View>
      {q.data ? (
        <>
          <Text variant="big" className="text-[30px]">
            {Number(q.data.converted).toLocaleString('en-IE', { style: 'currency', currency: q.data.to })}
          </Text>
          <Text variant="small">
            1 {q.data.from} = {q.data.rate} {q.data.to} · {q.data.source}
          </Text>
        </>
      ) : q.isError ? (
        <Text variant="small" className="text-warn">
          Unknown currency code.
        </Text>
      ) : null}
    </Card>
  );
}

export default function Tools(): ReactNode {
  return (
    <StackScreen eyebrow="Calculators on your own numbers" title="Tools">
      <Where />
      <Emergency />
      <Compound />
      <Fire />
      <Loan />
      <Convert />
      <Text variant="small" className="px-1 text-ink-3">
        Every tax figure is an estimate.
      </Text>
    </StackScreen>
  );
}
