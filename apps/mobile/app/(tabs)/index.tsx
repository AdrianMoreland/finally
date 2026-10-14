import { eur, eur0, longDate, pct, useOverview } from '@finally/api-client';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { LineArea } from '@/components/charts/charts';
import { PaymentRow } from '@/components/payments';
import { ErrorCard, LoadingCard, Screen } from '@/components/screen';
import { Card, MarkerChip, Text, Track } from '@/components/ui/primitives';

export default function Home(): ReactNode {
  const { data: o, error, refetch } = useOverview();

  if (error) {
    return (
      <Screen eyebrow="Finally" title="Today">
        <ErrorCard error={error} retry={() => void refetch()} />
      </Screen>
    );
  }
  if (!o) {
    return (
      <Screen eyebrow="Finally" title="Today">
        <LoadingCard height={170} />
        <LoadingCard height={120} />
      </Screen>
    );
  }

  const used = Number(o.flexible.budget) > 0 ? (Number(o.flexible.spent) / Number(o.flexible.budget)) * 100 : 0;
  const pace = (o.dayOfMonth / o.daysInMonth) * 100;

  return (
    <Screen eyebrow={longDate(o.asOf)} title="Today">
      <Card>
        <Text variant="eyebrow" className="mb-2">
          Safe to spend today
        </Text>
        <Text variant="big">{eur(o.safeToSpend.perDay)}</Text>
        <Text variant="small" className="mt-1.5">
          {eur(o.safeToSpend.leftToPayday)} for {o.daysToPayday} days to payday
        </Text>
        <View className="my-3">
          <Track value={used} tick={pace} />
        </View>
        <View className="flex-row justify-between">
          <Text variant="small">{pct(used, 0)} of flexible budget</Text>
          <Text variant="small">{pct(pace, 0)} of month</Text>
        </View>
      </Card>

      {o.toSortCount > 0 ? (
        <MarkerChip onPress={() => router.push('/categorise')}>
          {o.toSortCount} to sort →
        </MarkerChip>
      ) : null}

      <Card>
        <View className="mb-1 flex-row items-baseline justify-between">
          <Text variant="eyebrow">Net worth</Text>
          <Text variant="small" className={Number(o.netWorth.change12m) >= 0 ? 'text-good' : 'text-bad'}>
            {eur0(o.netWorth.change12m)} in 12 months
          </Text>
        </View>
        <Text variant="heading">{eur(o.netWorth.current)}</Text>
        <LineArea values={o.netWorth.series.map((p) => Number(p.value))} height={90} />
      </Card>

      <Card className="px-4 py-3">
        {o.recentTransactions.slice(0, 5).map((t, i) => (
          <PaymentRow
            key={t.id}
            tx={t}
            first={i === 0}
            onPress={() => router.push({ pathname: '/categorise', params: { transactionId: t.id } })}
          />
        ))}
      </Card>
    </Screen>
  );
}
