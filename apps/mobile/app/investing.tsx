import { eur, eur0, useInvestingPlan, usePaper, usePaperTrade, useTaxMutations, useUpdateInvesting } from '@finally/api-client';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Callout, Line } from '@/components/kit';
import { ErrorCard, LoadingCard } from '@/components/screen';
import { StackScreen } from '@/components/stack-screen';
import { AmountStepper, Segment } from '@/components/stepper';
import { Button, Card, Text, Track } from '@/components/ui/primitives';

export default function Investing(): ReactNode {
  const { data: d, error, refetch } = useInvestingPlan();
  const paper = usePaper();
  const trade = usePaperTrade();
  const tax = useTaxMutations();
  const update = useUpdateInvesting();
  const [symbol, setSymbol] = useState('VWCE');
  if (error) return <StackScreen title="Investing"><ErrorCard error={error} retry={() => void refetch()} /></StackScreen>;
  if (!d) return <StackScreen title="Investing"><LoadingCard height={260} /></StackScreen>;
  const ia = d.investAccount;
  const w = d.prefs.wrapper;
  const p = paper.data;
  const best = Math.max(Number(d.wrapper.ia), Number(d.wrapper.shares), Number(d.wrapper.etf));
  return (
    <StackScreen eyebrow="Not invested yet · start when you're ready" title="Investing">
      <Card>
        <Text variant="eyebrow" className="mb-1">Before you invest · {d.readyCount} of 5</Text>
        {d.readiness.map((r) => (
          <View key={r.id} className="flex-row items-start gap-3 border-t border-rule py-2 first:border-t-0">
            <Text variant="semi" className={r.ok ? 'text-good' : 'text-ink-3'}>{r.ok ? '✓' : '○'}</Text>
            <View className="flex-1"><Text variant="semi">{r.title}</Text><Text variant="small">{r.sub}</Text></View>
            {r.checkable ? <Button size="sm" variant="outline" onPress={() => tax.setCheck.mutate({ itemId: 'mff', state: r.ok ? 'TODO' : 'DONE' })}>{r.ok ? 'Undo' : 'Checked'}</Button> : null}
          </View>
        ))}
        {d.prefs.startAnyway && d.readyCount < 5 ? <Callout>Investing before the rainy-day pot reaches 3 months means a surprise bill could force you to sell during a dip.</Callout> : null}
        <Button className="mt-2" variant="outline" onPress={() => update.mutate({ startAnyway: !d.prefs.startAnyway })}>{d.prefs.startAnyway ? 'Stop "start anyway"' : 'Start anyway'}</Button>
      </Card>
      <Card>
        <Text variant="eyebrow" className="mb-1">Investment Account countdown</Text>
        <Text variant="big">{ia.daysToOpen}</Text>
        <Text variant="small">days to 1 July 2027. No tax on the first €50,000, then 1% a year above it.</Text>
        <Line label="Investing pot by then" value={eur0(ia.potAtOpen)} />
        <Line label="Plus the bonus allocation" value={eur0(ia.bonusAllocation)} />
        <View className="mt-2"><Track value={Math.min(100, ((Number(ia.potAtOpen) + Number(ia.bonusAllocation)) / Number(ia.cap)) * 100)} /></View>
      </Card>
      <Card>
        <Text variant="eyebrow" className="mb-1">Where should {eur0(w.monthly)} a month go?</Text>
        <AmountStepper label="Each month" value={w.monthly} step={50} min={50} format={eur0} onChange={(v) => update.mutate({ wrapper: { monthly: v } })} />
        <AmountStepper label="Years" value={w.years} step={1} min={3} max={30} format={(v) => String(v)} onChange={(v) => update.mutate({ wrapper: { years: v } })} />
        {[['Investment Account', d.wrapper.ia], ['Shares or gold, directly', d.wrapper.shares], ['ETF in a broker account', d.wrapper.etf]].map(([n, v]) => (
          <View key={n} className="mt-2 gap-1"><View className="flex-row justify-between"><Text variant="semi">{n}</Text><Text variant="num">{eur0(v!)}</Text></View><Track value={(Number(v) / best) * 100} /></View>
        ))}
        <Line label="Fees and conversion over the period" value={eur0(d.wrapper.fees)} tone="warn" />
      </Card>
      {p ? (
        <Card className="gap-2">
          <Text variant="eyebrow">Practise with fake money · month {p.step}</Text>
          <Segment value={symbol} onChange={setSymbol} options={p.instruments.map((i) => [i.symbol, i.symbol] as const)} />
          <View className="flex-row gap-2">
            <Button size="sm" disabled={trade.isPending} onPress={() => trade.mutate({ action: 'buy', symbol, amount: '500.00' })}>Buy €500</Button>
            <Button size="sm" variant="outline" disabled={trade.isPending} onPress={() => trade.mutate({ action: 'advance' })}>Skip a month</Button>
          </View>
          <Line label="Cash" value={eur(p.cash)} />
          {p.holdings.map((h) => (
            <View key={h.symbol} className="flex-row items-center justify-between"><Text variant="semi">{h.symbol} {eur(h.value)}</Text><Button size="sm" variant="outline" onPress={() => trade.mutate({ action: 'sell', symbol: h.symbol })}>Sell</Button></View>
          ))}
          <Line label={`Total vs the ${eur0(p.start)} you started with`} value={eur(p.total)} strong />
          {p.guard ? (
            <Callout tone="act">{`Your rule: wait 7 days before selling after a 10% drop. ${p.guard.symbol} is down ${p.guard.downPct.toFixed(1)}%.`}</Callout>
          ) : null}
          {p.guard ? <View className="flex-row gap-2"><Button size="sm" variant="outline" onPress={() => trade.mutate({ action: 'guard-keep' })}>Keep it</Button><Button size="sm" variant="danger" onPress={() => trade.mutate({ action: 'guard-sell' })}>Sell anyway</Button></View> : null}
        </Card>
      ) : null}
    </StackScreen>
  );
}
