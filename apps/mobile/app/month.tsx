import { eur, eur0, monthLabel, useMonth } from '@finally/api-client';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { LineArea } from '@/components/charts/charts';
import { Line } from '@/components/kit';
import { ErrorCard, LoadingCard } from '@/components/screen';
import { StackScreen } from '@/components/stack-screen';
import { Card, Text, Track } from '@/components/ui/primitives';

export default function Month(): ReactNode {
  const { data: m, error, refetch } = useMonth();
  if (error) return <StackScreen title="This month"><ErrorCard error={error} retry={() => void refetch()} /></StackScreen>;
  if (!m) return <StackScreen title="This month"><LoadingCard height={260} /></StackScreen>;
  const budget = Number(m.burn.budget);
  const max = Math.max(1, ...m.ranked.map((r) => Math.max(Number(r.spent), Number(r.budget))));
  return (
    <StackScreen eyebrow={`${monthLabel(m.month)} · day ${m.day} of ${m.daysInMonth}`} title="This month">
      <Card>
        <Text variant="eyebrow" className="mb-1">On track?</Text>
        <Text variant="heading">Heading for {eur0(m.burn.projected)} of {eur0(m.burn.budget)}</Text>
        <LineArea values={m.burn.forecast.length ? [...m.burn.spent.map((p) => Number(p.value)), ...m.burn.forecast.slice(1).map((p) => Number(p.value))] : m.burn.spent.map((p) => Number(p.value))} height={110} />
        <Text variant="small">Spent so far, then the forecast, against a budget of {eur0(budget)}.</Text>
      </Card>
      <Card className="gap-3">
        <Text variant="eyebrow">Spent vs budget · excluding rent</Text>
        {m.ranked.map((r) => (
          <View key={r.category.id} className="gap-1">
            <View className="flex-row justify-between"><Text variant="semi">{r.category.name}</Text><Text variant="small">{eur0(r.spent)} / {eur0(r.budget)}</Text></View>
            <Track value={(Number(r.spent) / max) * 100} tick={(Number(r.budget) / max) * 100} />
          </View>
        ))}
      </Card>
      <Card>
        <Text variant="eyebrow" className="mb-1">Net worth</Text>
        <Text variant="heading">{eur(m.netWorth.current)}</Text>
        <LineArea values={m.netWorth.series.map((p) => Number(p.value))} height={90} />
        <Text variant="small">{eur0(m.netWorth.changeSixMonths)} in 6 months</Text>
      </Card>
      <Card>
        <Text variant="eyebrow" className="mb-1">Good to know</Text>
        {m.goodToKnow.map((g) => <Line key={g.title} label={g.title} value="" />)}
      </Card>
    </StackScreen>
  );
}
